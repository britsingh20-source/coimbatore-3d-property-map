import crmWorker from "./worker.js";

const STAFF = {
  "Telecaller 1": { employee_id: "TC01", role: "telecaller" },
  "Telecaller 2": { employee_id: "TC02", role: "telecaller" },
  "Manager 1": { employee_id: "MG01", role: "manager" },
  "Manager 2": { employee_id: "MG02", role: "manager" },
  "Administrator": { employee_id: "AD01", role: "administrator" },
  "Director": { employee_id: "DR01", role: "director" }
};
const IST_MS = 330 * 60 * 1000;
const RETRY_RESULTS = new Set(["No Response", "Busy"]);
const BATCH_SIZE = 10;
const RETRY_PER_BATCH = 3;
const allowedOrigin = env => env.FRONTEND_ORIGIN || "https://britsingh20-source.github.io";
const json = (data, status, env) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": allowedOrigin(env),
    "cache-control": "no-store"
  }
});
const bearer = request => {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};
const parseDbTime = value => {
  if (!value) return NaN;
  const text = String(value);
  return Date.parse(text.includes("T") ? text : text.replace(" ", "T") + "Z");
};
const dateKeyIST = ms => new Date(ms + IST_MS).toISOString().slice(0, 10);
const nextIstMidnightUTC = ms => {
  const shifted = new Date(ms + IST_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - IST_MS;
};
const dayNumber = key => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
const queueForTelecaller = (label, key = dateKeyIST(Date.now())) => {
  const idx = label === "Telecaller 1" ? 0 : label === "Telecaller 2" ? 1 : -1;
  return idx < 0 ? null : (idx === dayNumber(key) % 2 ? "fresh" : "backlog");
};
function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return {
    start: Date.UTC(year, monthNumber - 1, 1) - IST_MS,
    end: Date.UTC(year, monthNumber, 1) - IST_MS
  };
}
async function authenticatedViewer(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT user_label, login_at, last_activity_at, active FROM telecaller_sessions WHERE token=? AND active=1"
  ).bind(token).first();
  if (!row || !STAFF[row.user_label]) return null;
  const last = parseDbTime(row.last_activity_at);
  if (!Number.isFinite(last) || Date.now() - last > 10 * 60 * 1000) return null;
  return { user_label: row.user_label, ...STAFF[row.user_label] };
}
function effectiveEnd(row, now) {
  const login = parseDbTime(row.login_at);
  let end = row.logout_at ? parseDbTime(row.logout_at) : now;
  const last = parseDbTime(row.last_activity_at);
  if (Number.isFinite(last)) end = Math.min(end, last + 10 * 60 * 1000);
  if (!Number.isFinite(end) || end < login) end = login;
  return end;
}
function splitIntoDays(row, bounds, now) {
  let start = Math.max(parseDbTime(row.login_at), bounds.start);
  const end = Math.min(effectiveEnd(row, now), bounds.end);
  const parts = [];
  if (!Number.isFinite(start) || end <= start) return parts;
  while (start < end) {
    const next = Math.min(end, nextIstMidnightUTC(start));
    parts.push({ date: dateKeyIST(start), ms: next - start });
    start = next;
  }
  return parts;
}
async function workHours(request, env) {
  const viewer = await authenticatedViewer(request, env);
  if (!viewer) return json({ error: "Session expired", expired: true }, 401, env);

  const url = new URL(request.url);
  const now = Date.now();
  const currentMonth = dateKeyIST(now).slice(0, 7);
  const month = url.searchParams.get("month") || currentMonth;
  const bounds = monthBounds(month);
  if (!bounds) return json({ error: "Invalid month" }, 400, env);

  const rows = (await env.DB.prepare(
    "SELECT user_label, login_at, last_activity_at, logout_at, active FROM telecaller_sessions WHERE login_at < ? AND COALESCE(logout_at,last_activity_at) >= ? ORDER BY login_at"
  ).bind(new Date(bounds.end).toISOString(), new Date(bounds.start - 10 * 60 * 1000).toISOString()).all()).results || [];

  const labels = viewer.role === "telecaller" ? [viewer.user_label] : Object.keys(STAFF);
  const staff = labels.map(label => ({
    user_label: label,
    ...STAFF[label],
    daily: {},
    total_ms: 0,
    days_worked: 0,
    average_ms: 0,
    today_ms: 0
  }));
  const byLabel = Object.fromEntries(staff.map(item => [item.user_label, item]));

  for (const row of rows) {
    const target = byLabel[row.user_label];
    if (!target) continue;
    for (const part of splitIntoDays(row, bounds, now)) {
      target.daily[part.date] = (target.daily[part.date] || 0) + part.ms;
      target.total_ms += part.ms;
    }
  }

  const today = dateKeyIST(now);
  for (const item of staff) {
    const values = Object.values(item.daily);
    item.days_worked = values.filter(value => value > 0).length;
    item.average_ms = item.days_worked ? Math.round(item.total_ms / item.days_worked) : 0;
    item.today_ms = item.daily[today] || 0;
    item.total_hours = +(item.total_ms / 3600000).toFixed(2);
    item.average_hours = +(item.average_ms / 3600000).toFixed(2);
    item.today_hours = +(item.today_ms / 3600000).toFixed(2);
    item.daily = Object.fromEntries(
      Object.entries(item.daily).map(([date, ms]) => [date, +(ms / 3600000).toFixed(2)])
    );
    delete item.total_ms;
    delete item.average_ms;
    delete item.today_ms;
  }

  return json({ ok: true, month, today, viewer, staff }, 200, env);
}

function retryPlan(attempt, outcome) {
  const now = Date.now();
  if (outcome === "Busy" && attempt === 1) {
    return { retryAt: new Date(now + 60 * 60 * 1000).toISOString(), state: "scheduled", label: "Retry in 1 hour" };
  }
  if (attempt === 1) {
    return { retryAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(), state: "scheduled", label: "Retry in 3 hours" };
  }
  if (attempt === 2) {
    const shifted = new Date(now + IST_MS);
    const retryUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1, 10, 0, 0) - IST_MS;
    return { retryAt: new Date(retryUtc).toISOString(), state: "scheduled", label: "Retry next day at 10:00 AM" };
  }
  return { retryAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(), state: "long_retry", label: "Long retry in 7 days" };
}

async function scheduleRetry(request, env, leadId, body) {
  const viewer = await authenticatedViewer(request, env);
  if (!viewer) return json({ error: "Session expired", expired: true }, 401, env);
  if (viewer.role !== "telecaller") return json({ error: "Retry scheduling is available to telecallers only" }, 403, env);

  const lead = await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(leadId).first();
  if (!lead) return json({ error: "Lead not found" }, 404, env);
  if (lead.telecaller_assigned_to && lead.telecaller_assigned_to !== viewer.user_label) {
    return json({ error: "Lead belongs to another telecaller" }, 403, env);
  }

  const previous = await env.DB.prepare("SELECT attempt_count FROM lead_retry WHERE lead_id=?").bind(leadId).first();
  const attempt = Number(previous?.attempt_count || 0) + 1;
  const plan = retryPlan(attempt, body.status);

  await env.DB.prepare(`UPDATE leads SET
    name=COALESCE(NULLIF(?,''),name),
    status=?,
    notes=COALESCE(NULLIF(?,''),notes),
    follow_up_at=?,
    last_contact_at=CURRENT_TIMESTAMP,
    contact_complete=0,
    pipeline_stage='retry_queue',
    telecaller_assigned_to=NULL,
    updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).bind(body.name || "", body.status, body.notes || "", plan.retryAt, leadId).run();

  await env.DB.prepare(`INSERT INTO lead_retry(lead_id,attempt_count,retry_at,state,last_outcome,last_telecaller,updated_at)
    VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(lead_id) DO UPDATE SET
      attempt_count=excluded.attempt_count,
      retry_at=excluded.retry_at,
      state=excluded.state,
      last_outcome=excluded.last_outcome,
      last_telecaller=excluded.last_telecaller,
      updated_at=CURRENT_TIMESTAMP`).bind(leadId, attempt, plan.retryAt, plan.state, body.status, viewer.user_label).run();

  await env.DB.prepare(`INSERT INTO lead_activity(lead_id,activity_type,caller,status,notes,follow_up_at)
    VALUES(?, 'retry_scheduled', ?, ?, ?, ?)`).bind(
      leadId,
      viewer.user_label,
      body.status,
      `Attempt ${attempt}: ${plan.label}`,
      plan.retryAt
    ).run();

  const updated = await env.DB.prepare(`SELECT l.*, r.attempt_count AS retry_attempt_count, r.retry_at, r.state AS retry_state
    FROM leads l LEFT JOIN lead_retry r ON r.lead_id=l.id WHERE l.id=?`).bind(leadId).first();
  return json({ lead: updated, completed: false, retry: { attempt, retry_at: plan.retryAt, state: plan.state, label: plan.label } }, 200, env);
}

async function currentRetryAwareBatch(request, env) {
  const viewer = await authenticatedViewer(request, env);
  if (!viewer) return json({ error: "Session expired", expired: true }, 401, env);
  if (viewer.role !== "telecaller") return json({ error: "Telecaller role required" }, 403, env);
  const user = viewer.user_label;

  let assigned = (await env.DB.prepare(`SELECT l.*, r.attempt_count AS retry_attempt_count, r.retry_at, r.state AS retry_state
    FROM leads l LEFT JOIN lead_retry r ON r.lead_id=l.id
    WHERE l.telecaller_assigned_to=? AND l.contact_complete=0
      AND (r.lead_id IS NULL OR datetime(r.retry_at)<=CURRENT_TIMESTAMP)
    ORDER BY CASE WHEN r.lead_id IS NOT NULL THEN 0 ELSE 1 END, l.first_received_at, l.id
    LIMIT ?`).bind(user, BATCH_SIZE).all()).results || [];

  let need = BATCH_SIZE - assigned.length;
  const retryAlready = assigned.filter(item => item.retry_attempt_count).length;
  const retrySlots = Math.max(0, Math.min(need, RETRY_PER_BATCH - retryAlready));

  if (retrySlots > 0) {
    const retryRows = (await env.DB.prepare(`UPDATE leads SET
      telecaller_assigned_to=?, pipeline_stage='telecaller_claimed', updated_at=CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT l.id FROM leads l JOIN lead_retry r ON r.lead_id=l.id
        WHERE l.telecaller_assigned_to IS NULL AND l.contact_complete=0
          AND r.state IN ('scheduled','long_retry')
          AND datetime(r.retry_at)<=CURRENT_TIMESTAMP
        ORDER BY datetime(r.retry_at), l.id LIMIT ?
      ) RETURNING id`).bind(user, retrySlots).all()).results || [];
    for (const row of retryRows) {
      await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'retry_batch_assigned', ?, 'Due retry assigned into current 10')").bind(row.id, user).run();
    }
  }

  assigned = (await env.DB.prepare(`SELECT l.*, r.attempt_count AS retry_attempt_count, r.retry_at, r.state AS retry_state
    FROM leads l LEFT JOIN lead_retry r ON r.lead_id=l.id
    WHERE l.telecaller_assigned_to=? AND l.contact_complete=0
      AND (r.lead_id IS NULL OR datetime(r.retry_at)<=CURRENT_TIMESTAMP)
    ORDER BY CASE WHEN r.lead_id IS NOT NULL THEN 0 ELSE 1 END, l.first_received_at, l.id
    LIMIT ?`).bind(user, BATCH_SIZE).all()).results || [];
  need = BATCH_SIZE - assigned.length;

  if (need > 0) {
    const today = dateKeyIST(Date.now());
    const preferred = queueForTelecaller(user, today);
    const dateCondition = preferred === "fresh" ? "substr(l.first_received_at,1,10)=?" : "substr(l.first_received_at,1,10)<?";
    let normalRows = (await env.DB.prepare(`UPDATE leads SET
      telecaller_assigned_to=?, pipeline_stage='telecaller_claimed', updated_at=CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT l.id FROM leads l LEFT JOIN lead_retry r ON r.lead_id=l.id
        WHERE l.telecaller_assigned_to IS NULL AND l.contact_complete=0
          AND r.lead_id IS NULL
          AND l.status IN ('Uncalled','No Response','Busy','Needs Review')
          AND ${dateCondition}
        ORDER BY l.first_received_at,l.id LIMIT ?
      ) RETURNING id`).bind(user, today, need).all()).results || [];

    if (normalRows.length < need) {
      const remain = need - normalRows.length;
      const extras = (await env.DB.prepare(`UPDATE leads SET
        telecaller_assigned_to=?, pipeline_stage='telecaller_claimed', updated_at=CURRENT_TIMESTAMP
        WHERE id IN (
          SELECT l.id FROM leads l LEFT JOIN lead_retry r ON r.lead_id=l.id
          WHERE l.telecaller_assigned_to IS NULL AND l.contact_complete=0
            AND r.lead_id IS NULL
            AND l.status IN ('Uncalled','No Response','Busy','Needs Review')
          ORDER BY l.first_received_at,l.id LIMIT ?
        ) RETURNING id`).bind(user, remain).all()).results || [];
      normalRows = normalRows.concat(extras);
    }
    for (const row of normalRows) {
      await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'batch_assigned', ?, 'Assigned in current batch of 10')").bind(row.id, user).run();
    }
  }

  const finalRows = (await env.DB.prepare(`SELECT l.*, r.attempt_count AS retry_attempt_count, r.retry_at, r.state AS retry_state
    FROM leads l LEFT JOIN lead_retry r ON r.lead_id=l.id
    WHERE l.telecaller_assigned_to=? AND l.contact_complete=0
      AND (r.lead_id IS NULL OR datetime(r.retry_at)<=CURRENT_TIMESTAMP)
    ORDER BY CASE WHEN r.lead_id IS NOT NULL THEN 0 ELSE 1 END, l.first_received_at, l.id
    LIMIT ?`).bind(user, BATCH_SIZE).all()).results || [];

  return json({
    ok: true,
    queue: queueForTelecaller(user),
    batch_size: BATCH_SIZE,
    retry_limit: RETRY_PER_BATCH,
    retry_count: finalRows.filter(item => item.retry_attempt_count).length,
    leads: finalRows
  }, 200, env);
}

async function retrySummary(request, env) {
  const viewer = await authenticatedViewer(request, env);
  if (!viewer) return json({ error: "Session expired", expired: true }, 401, env);
  if (!["manager", "administrator", "director"].includes(viewer.role)) return json({ error: "Supervisor role required" }, 403, env);
  const row = await env.DB.prepare(`SELECT
    SUM(CASE WHEN datetime(retry_at)<=CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS due,
    SUM(CASE WHEN state='scheduled' AND datetime(retry_at)>CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS scheduled,
    SUM(CASE WHEN state='long_retry' THEN 1 ELSE 0 END) AS long_retry
    FROM lead_retry`).first();
  return json({ ok: true, due: Number(row?.due || 0), scheduled: Number(row?.scheduled || 0), long_retry: Number(row?.long_retry || 0) }, 200, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS" && ["/api/work-hours", "/api/telecaller/batch", "/api/retry-queue/summary"].includes(path)) {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": allowedOrigin(env),
          "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
          "access-control-allow-headers": "content-type,authorization",
          "access-control-max-age": "86400"
        }
      });
    }
    if (request.method === "GET" && path === "/api/work-hours") {
      try { return await workHours(request, env); }
      catch (error) { console.error("work-hours error", error); return json({ error: "Could not load working-hours report" }, 500, env); }
    }
    if (request.method === "GET" && path === "/api/telecaller/batch") {
      try { return await currentRetryAwareBatch(request, env); }
      catch (error) { console.error("retry batch error", error); return json({ error: error.message || "Could not load telecaller batch" }, 500, env); }
    }
    if (request.method === "GET" && path === "/api/retry-queue/summary") {
      try { return await retrySummary(request, env); }
      catch (error) { console.error("retry summary error", error); return json({ error: "Could not load retry summary" }, 500, env); }
    }

    const complete = path.match(/^\/api\/leads\/(\d+)\/complete-call$/);
    if (request.method === "POST" && complete) {
      const body = await request.clone().json().catch(() => ({}));
      if (RETRY_RESULTS.has(body.status)) {
        try { return await scheduleRetry(request, env, Number(complete[1]), body); }
        catch (error) { console.error("schedule retry error", error); return json({ error: error.message || "Could not schedule retry" }, 500, env); }
      }
      const response = await crmWorker.fetch(request, env, ctx);
      if (response.ok) {
        await env.DB.prepare("DELETE FROM lead_retry WHERE lead_id=?").bind(Number(complete[1])).run().catch(() => {});
      }
      return response;
    }

    return crmWorker.fetch(request, env, ctx);
  }
};
