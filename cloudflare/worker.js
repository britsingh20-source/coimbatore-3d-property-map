const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...extra }
});

function normalizePhone(value = "") {
  const raw = String(value).trim();
  const plus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (plus) return "+" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

async function allocateLeadCode(db, areaCode) {
  if (!areaCode) return null;
  const row = await db.prepare("UPDATE area_counters SET last_number = last_number + 1 WHERE area_code = ? RETURNING last_number")
    .bind(areaCode).first();
  if (!row) throw new Error("Unknown area code");
  return `${areaCode}-${String(row.last_number).padStart(4, "0")}`;
}

async function getLead(db, id) {
  return db.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        "access-control-allow-headers": "content-type"
      }});
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    try {
      if (request.method === "GET" && path === "/api/health") return json({ ok: true, service: "lead-crm" });

      if (request.method === "GET" && path === "/api/areas") {
        const result = await env.DB.prepare(`
          SELECT a.code, a.name,
            COUNT(l.id) AS total,
            SUM(CASE WHEN l.status='Hot' THEN 1 ELSE 0 END) AS hot,
            SUM(CASE WHEN l.status='Follow-up' THEN 1 ELSE 0 END) AS follow_up,
            SUM(CASE WHEN l.status='Uncalled' THEN 1 ELSE 0 END) AS uncalled
          FROM areas a LEFT JOIN leads l ON l.area_code=a.code
          WHERE a.active=1 GROUP BY a.code,a.name ORDER BY a.name
        `).all();
        return json({ areas: result.results || [] });
      }

      if (request.method === "GET" && path === "/api/leads") {
        const clauses = [];
        const params = [];
        const area = url.searchParams.get("area");
        const status = url.searchParams.get("status");
        const q = url.searchParams.get("q");
        if (area) { clauses.push("area_code = ?"); params.push(area); }
        if (status) { clauses.push("status = ?"); params.push(status); }
        if (q) {
          clauses.push("(lead_code LIKE ? OR name LIKE ? OR phone LIKE ? OR requirement LIKE ?)");
          const like = `%${q}%`; params.push(like, like, like, like);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const result = await env.DB.prepare(`SELECT * FROM leads ${where} ORDER BY first_received_at DESC, id DESC`).bind(...params).all();
        return json({ leads: result.results || [] });
      }

      if (request.method === "POST" && path === "/api/leads") {
        const body = await request.json();
        const phone = normalizePhone(body.phone);
        if (!phone) return json({ error: "Phone number is required" }, 400);

        const existing = await env.DB.prepare("SELECT * FROM leads WHERE phone = ?").bind(phone).first();
        if (existing) {
          await env.DB.prepare("UPDATE leads SET last_received_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(existing.id).run();
          await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,notes) VALUES(?, 'repeat_incoming', ?)")
            .bind(existing.id, body.source ? `Repeat lead from ${body.source}` : "Repeat lead received").run();
          return json({ duplicate: true, lead: await getLead(env.DB, existing.id) }, 200);
        }

        const leadCode = body.area_code ? await allocateLeadCode(env.DB, body.area_code) : null;
        const insert = await env.DB.prepare(`
          INSERT INTO leads(lead_code,phone,name,area_code,status,assigned_to,requirement,notes,source,first_received_at,last_received_at)
          VALUES(?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))
          RETURNING id
        `).bind(leadCode, phone, body.name || null, body.area_code || null, body.status || "Uncalled", body.assigned_to || null,
          body.requirement || null, body.notes || null, body.source || null, body.first_received_at || null, body.first_received_at || null).first();
        await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,area_code,notes) VALUES(?, 'lead_created', ?, ?)")
          .bind(insert.id, body.area_code || null, body.source || "Lead created").run();
        return json({ lead: await getLead(env.DB, insert.id) }, 201);
      }

      const claimMatch = path.match(/^\/api\/leads\/(\d+)\/claim$/);
      if (request.method === "POST" && claimMatch) {
        const body = await request.json();
        const id = Number(claimMatch[1]);
        const current = await getLead(env.DB, id);
        if (!current) return json({ error: "Lead not found" }, 404);
        if (current.assigned_to && current.assigned_to !== body.assigned_to) {
          return json({ error: "Lead already assigned", lead: current }, 409);
        }
        await env.DB.prepare("UPDATE leads SET assigned_to=?, last_contact_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(body.assigned_to, id).run();
        await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'claimed', ?, 'Lead assigned for calling')")
          .bind(id, body.assigned_to).run();
        return json({ lead: await getLead(env.DB, id) });
      }

      const activityMatch = path.match(/^\/api\/leads\/(\d+)\/activity$/);
      if (request.method === "POST" && activityMatch) {
        const body = await request.json();
        const id = Number(activityMatch[1]);
        const current = await getLead(env.DB, id);
        if (!current) return json({ error: "Lead not found" }, 404);

        let leadCode = current.lead_code;
        if (body.area_code && body.area_code !== current.area_code) leadCode = await allocateLeadCode(env.DB, body.area_code);
        await env.DB.prepare(`
          UPDATE leads SET lead_code=?, area_code=?, status=?, assigned_to=COALESCE(assigned_to,?), requirement=?, notes=?,
            follow_up_at=?, last_contact_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?
        `).bind(leadCode, body.area_code || current.area_code, body.status || current.status, body.caller || null,
          body.requirement || null, body.notes || null, body.follow_up_at || null, id).run();
        await env.DB.prepare(`
          INSERT INTO lead_activity(lead_id,activity_type,caller,status,area_code,notes,requirement,follow_up_at)
          VALUES(?, 'call_feedback', ?, ?, ?, ?, ?, ?)
        `).bind(id, body.caller || null, body.status || null, body.area_code || null, body.notes || null, body.requirement || null, body.follow_up_at || null).run();
        return json({ lead: await getLead(env.DB, id) });
      }

      const detailMatch = path.match(/^\/api\/leads\/(\d+)$/);
      if (request.method === "GET" && detailMatch) {
        const id = Number(detailMatch[1]);
        const lead = await getLead(env.DB, id);
        if (!lead) return json({ error: "Lead not found" }, 404);
        const activity = await env.DB.prepare("SELECT * FROM lead_activity WHERE lead_id=? ORDER BY created_at DESC, id DESC").bind(id).all();
        return json({ lead, activity: activity.results || [] });
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: error.message || "Server error" }, 500);
    }
  }
};
