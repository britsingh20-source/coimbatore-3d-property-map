from pathlib import Path

worker = Path("cloudflare/worker.js")
text = worker.read_text()
needle = '    const detail=path.match(/^\\/api\\/leads\\/(\\d+)$/);if(request.method==="GET"&&detail){const id=Number(detail[1]),lead=await getLead(env.DB,id);if(!lead)return json({error:"Lead not found"},404,env);const activity=await env.DB.prepare("SELECT * FROM lead_activity WHERE lead_id=? ORDER BY created_at DESC,id DESC").bind(id).all();return json({lead,activity:activity.results||[]},200,env);}\n'
replacement = '''    const detail=path.match(/^\\/api\\/leads\\/(\\d+)$/);
    if(request.method==="PATCH"&&detail){
      const id=Number(detail[1]),body=await request.json(),current=await getLead(env.DB,id);
      if(!current)return json({error:"Lead not found"},404,env);
      const status=Object.prototype.hasOwnProperty.call(body,"status")?String(body.status||"").trim():current.status;
      const notes=Object.prototype.hasOwnProperty.call(body,"notes")?String(body.notes??""):current.notes;
      const followUp=Object.prototype.hasOwnProperty.call(body,"follow_up_at")?(body.follow_up_at||null):current.follow_up_at;
      if(!status)return json({error:"Status is required"},422,env);
      await env.DB.prepare("UPDATE leads SET status=?,notes=?,follow_up_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,notes,followUp,id).run();
      await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,status,notes,follow_up_at) VALUES(?, 'supervisor_update', ?, ?, ?)").bind(id,status,notes,followUp).run();
      return json({ok:true,lead:await getLead(env.DB,id)},200,env);
    }
    if(request.method==="GET"&&detail){const id=Number(detail[1]),lead=await getLead(env.DB,id);if(!lead)return json({error:"Lead not found"},404,env);const activity=await env.DB.prepare("SELECT * FROM lead_activity WHERE lead_id=? ORDER BY created_at DESC,id DESC").bind(id).all();return json({lead,activity:activity.results||[]},200,env);}
'''
if needle not in text:
    raise SystemExit("worker detail route needle not found")
worker.write_text(text.replace(needle, replacement, 1))

frontend = Path("src/lead-crm.js")
text = frontend.read_text()
old_payload = '''  const payload = {
    status: document.querySelector("#crm-dialog-status").value,
    notes: document.querySelector("#crm-dialog-notes").value,
    follow_up_at: document.querySelector("#crm-dialog-followup").value || null,
    assigned_to: currentUser
  };
  try {
    if (!String(selectedLead.id).startsWith("demo-")) await api(`/api/leads/${selectedLead.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    Object.assign(selectedLead, payload, { last_contact_at: new Date().toISOString() });
'''
new_payload = '''  const payload = {
    status: document.querySelector("#crm-dialog-status").value,
    notes: document.querySelector("#crm-dialog-notes").value,
    follow_up_at: document.querySelector("#crm-dialog-followup").value || null
  };
  try {
    let saved = null;
    if (!String(selectedLead.id).startsWith("demo-")) saved = await api(`/api/leads/${selectedLead.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    if (saved?.lead) Object.assign(selectedLead, saved.lead); else Object.assign(selectedLead, payload);
'''
if old_payload not in text:
    raise SystemExit("frontend save payload needle not found")
frontend.write_text(text.replace(old_payload, new_payload, 1))
