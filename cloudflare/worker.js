const allowedOrigin = (env) => env.FRONTEND_ORIGIN || "https://britsingh20-source.github.io";
const json = (data, status = 200, env = {}, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": allowedOrigin(env), ...extra }
});

function normalizePhone(value = "") {
  const raw = String(value).trim();
  if (!raw || /unclear|\?/i.test(raw)) return "";
  const plus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (plus && !digits.startsWith("91")) return "+" + digits;
  return digits;
}

function bearer(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function needsFullDetails(status) {
  return ["Categorized", "Interested", "Hot", "Follow-up", "Site Visit"].includes(status);
}

function validateCompletion(body) {
  const status = String(body.status || "").trim();
  if (!status) return "Call result is required";
  if (needsFullDetails(status)) {
    if (!String(body.name || "").trim()) return "Customer name is required";
    if (!String(body.area_text || body.area_code || "").trim()) return "Customer area / preferred location is required";
    if (!String(body.property_type || "").trim()) return "Property type is required";
    if (!String(body.budget || "").trim()) return "Budget is required";
    if (!String(body.requirement || "").trim()) return "Requirement is required";
    if (!String(body.notes || "").trim()) return "Call notes are required";
  }
  if (status === "Follow-up" && !body.follow_up_at) return "Follow-up date and time is required";
  return null;
}

async function getLead(db, id) {
  return db.prepare("SELECT * FROM leads WHERE id=?").bind(id).first();
}

async function allocateLeadCode(db, areaCode) {
  if (!areaCode) return null;
  const row = await db.prepare("UPDATE area_counters SET last_number=last_number+1 WHERE area_code=? RETURNING last_number")
    .bind(areaCode).first();
  if (!row) return null;
  return `${areaCode}-${String(row.last_number).padStart(4, "0")}`;
}

async function upsertImportedLead(db, lead) {
  const phone = normalizePhone(lead.phone || lead.display_phone);
  if (!phone) return { skipped: true, reason: "invalid_phone" };
  const existing = await db.prepare("SELECT id FROM leads WHERE phone=?").bind(phone).first();
  const source = Array.isArray(lead.source) ? lead.source.join(", ") : (lead.source || "Historical import");
  const status = lead.status || "Uncalled";
  if (existing) {
    await db.prepare(`UPDATE leads SET
      name=COALESCE(?,name), status=?, requirement=COALESCE(?,requirement), notes=COALESCE(?,notes),
      source=?, first_received_at=COALESCE(?,first_received_at), last_received_at=COALESCE(?,last_received_at),
      area_text=COALESCE(?,area_text), property_type=COALESCE(?,property_type), budget=COALESCE(?,budget),
      source_period_start=COALESCE(?,source_period_start), source_period_end=COALESCE(?,source_period_end),
      date_precision=COALESCE(?,date_precision), transcription_review=MAX(transcription_review,?), updated_at=CURRENT_TIMESTAMP
      WHERE id=?`)
      .bind(lead.name || null, status, lead.requirement || null, lead.notes || null, source,
        lead.first_received_at || null, lead.last_received_at || null, lead.area_text || null,
        lead.property_type || null, lead.budget || null, lead.source_period_start || null,
        lead.source_period_end || null, lead.date_precision || null, lead.transcription_review ? 1 : 0, existing.id).run();
    return { id: existing.id, duplicate: true };
  }
  const result = await db.prepare(`INSERT INTO leads(
    phone,display_phone,name,status,requirement,notes,source,first_received_at,last_received_at,
    area_text,property_type,budget,source_period_start,source_period_end,date_precision,transcription_review,pipeline_stage)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(phone, lead.display_phone || lead.phone || phone, lead.name || null, status, lead.requirement || null,
      lead.notes || null, source, lead.first_received_at || new Date().toISOString(), lead.last_received_at || lead.first_received_at || new Date().toISOString(),
      lead.area_text || null, lead.property_type || null, lead.budget || null, lead.source_period_start || null,
      lead.source_period_end || null, lead.date_precision || "exact", lead.transcription_review ? 1 : 0,
      status === "Categorized" ? "manager_queue" : "incoming").first();
  return { id: result.id, duplicate: false };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: {
      "access-control-allow-origin": allowedOrigin(env),
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      "access-control-allow-headers": "content-type,authorization"
    }});
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    try {
      if (request.method === "GET" && path === "/api/health") return json({ ok:true, service:"lead-crm", secureImport:true }, 200, env);

      if (request.method === "POST" && path === "/api/admin/import") {
        if (!env.IMPORT_TOKEN || bearer(request) !== env.IMPORT_TOKEN) return json({ error:"Unauthorized" }, 401, env);
        const body = await request.json();
        const rows = Array.isArray(body.leads) ? body.leads : [];
        if (!rows.length) return json({ error:"No leads supplied" }, 400, env);
        let inserted=0, updated=0, skipped=0;
        for (const lead of rows) {
          const result = await upsertImportedLead(env.DB, lead);
          if (result.skipped) skipped++; else if (result.duplicate) updated++; else inserted++;
          if (!result.skipped) await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,notes) VALUES(?, 'historical_import', ?)")
            .bind(result.id, "Imported from historical lead register").run();
        }
        return json({ ok:true, inserted, updated, skipped }, 200, env);
      }

      if (request.method === "GET" && path === "/api/areas") {
        const result = await env.DB.prepare(`SELECT a.code,a.name,COUNT(l.id) total,
          SUM(CASE WHEN l.status='Hot' THEN 1 ELSE 0 END) hot,
          SUM(CASE WHEN l.status='Follow-up' THEN 1 ELSE 0 END) follow_up,
          SUM(CASE WHEN l.status IN ('Uncalled','No Response','Busy','Needs Review') THEN 1 ELSE 0 END) uncalled
          FROM areas a LEFT JOIN leads l ON l.area_code=a.code WHERE a.active=1 GROUP BY a.code,a.name ORDER BY a.name`).all();
        return json({ areas:result.results || [] }, 200, env);
      }

      if (request.method === "GET" && path === "/api/leads") {
        const clauses=[], params=[];
        for (const [key,col] of [["area","area_code"],["status","status"],["telecaller","telecaller_assigned_to"],["manager","manager_assigned_to"]]) {
          const v=url.searchParams.get(key); if (v) { clauses.push(`${col}=?`); params.push(v); }
        }
        const q=url.searchParams.get("q");
        if (q) { const like=`%${q}%`; clauses.push("(lead_code LIKE ? OR name LIKE ? OR phone LIKE ? OR requirement LIKE ? OR area_text LIKE ?)"); params.push(like,like,like,like,like); }
        const where=clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const result=await env.DB.prepare(`SELECT * FROM leads ${where} ORDER BY first_received_at DESC,id DESC`).bind(...params).all();
        return json({ leads:result.results || [] }, 200, env);
      }

      const claimMatch=path.match(/^\/api\/leads\/(\d+)\/claim$/);
      if (request.method === "POST" && claimMatch) {
        const id=Number(claimMatch[1]); const body=await request.json(); const caller=String(body.assigned_to || "").trim();
        if (!caller) return json({ error:"Telecaller is required" },400,env);
        const result=await env.DB.prepare(`UPDATE leads SET telecaller_assigned_to=?,pipeline_stage='telecaller_claimed',updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND (telecaller_assigned_to IS NULL OR telecaller_assigned_to=?) AND pipeline_stage IN ('incoming','telecaller_claimed') RETURNING id`).bind(caller,id,caller).first();
        if (!result) return json({ error:"Lead already claimed or unavailable", lead:await getLead(env.DB,id) },409,env);
        await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'claimed', ?, 'Lead claimed for first contact')").bind(id,caller).run();
        return json({ lead:await getLead(env.DB,id) },200,env);
      }

      const completeMatch=path.match(/^\/api\/leads\/(\d+)\/complete-call$/);
      if (request.method === "POST" && completeMatch) {
        const id=Number(completeMatch[1]); const body=await request.json();
        const validation=validateCompletion(body); if (validation) return json({ error:validation },422,env);
        const current=await getLead(env.DB,id); if (!current) return json({ error:"Lead not found" },404,env);
        let leadCode=current.lead_code;
        if (!leadCode && body.area_code) leadCode=await allocateLeadCode(env.DB,body.area_code);
        const terminal=["No Response","Busy","Not Interested","Wrong Number"].includes(body.status);
        const categorized=needsFullDetails(body.status);
        const stage=categorized ? "manager_queue" : (terminal ? "incoming" : current.pipeline_stage || "incoming");
        await env.DB.prepare(`UPDATE leads SET lead_code=?,name=?,area_code=COALESCE(?,area_code),area_text=?,property_type=?,budget=?,status=?,requirement=?,notes=?,follow_up_at=?,
          last_contact_at=CURRENT_TIMESTAMP,contacted_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE contacted_at END,contact_complete=?,pipeline_stage=?,categorized_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE categorized_at END,
          manager_handoff_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE manager_handoff_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(leadCode,body.name || current.name || null,body.area_code || null,body.area_text || null,body.property_type || null,body.budget || null,body.status,
            body.requirement || null,body.notes || null,body.follow_up_at || null,categorized ? 1:0,categorized ? 1:0,stage,categorized ? 1:0,categorized ? 1:0,id).run();
        await env.DB.prepare(`INSERT INTO lead_activity(lead_id,activity_type,caller,status,area_code,notes,requirement,follow_up_at)
          VALUES(?, 'call_completed', ?, ?, ?, ?, ?, ?)`).bind(id,body.caller || null,body.status,body.area_code || null,body.notes || null,body.requirement || null,body.follow_up_at || null).run();
        return json({ lead:await getLead(env.DB,id), completed:categorized },200,env);
      }

      const detailMatch=path.match(/^\/api\/leads\/(\d+)$/);
      if (request.method === "GET" && detailMatch) {
        const id=Number(detailMatch[1]); const lead=await getLead(env.DB,id); if (!lead) return json({ error:"Lead not found" },404,env);
        const activity=await env.DB.prepare("SELECT * FROM lead_activity WHERE lead_id=? ORDER BY created_at DESC,id DESC").bind(id).all();
        return json({ lead,activity:activity.results || [] },200,env);
      }
      return json({ error:"Not found" },404,env);
    } catch (error) { return json({ error:error.message || "Server error" },500,env); }
  }
};
