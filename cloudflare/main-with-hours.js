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

  return json({
    ok: true,
    month,
    today,
    viewer,
    staff
  }, 200, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS" && path === "/api/work-hours") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": allowedOrigin(env),
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "content-type,authorization",
          "access-control-max-age": "86400"
        }
      });
    }
    if (request.method === "GET" && path === "/api/work-hours") {
      try {
        return await workHours(request, env);
      } catch (error) {
        console.error("work-hours error", error);
        return json({ error: "Could not load working-hours report" }, 500, env);
      }
    }
    return crmWorker.fetch(request, env, ctx);
  }
};
