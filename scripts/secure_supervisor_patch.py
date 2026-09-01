from pathlib import Path

worker = Path('cloudflare/worker.js')
text = worker.read_text()
old = '''    if(request.method==="PATCH"&&detail){
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
'''
new = '''    if(request.method==="PATCH"&&detail){
      const s=await requireSession(request,env,true);
      if(!s)return json({error:"Session expired",expired:true},401,env);
      if(!["manager","administrator","director"].includes(roleForLabel(s.user_label)))return json({error:"Supervisor access required"},403,env);
      const id=Number(detail[1]),body=await request.json(),current=await getLead(env.DB,id);
      if(!current)return json({error:"Lead not found"},404,env);
      const status=Object.prototype.hasOwnProperty.call(body,"status")?String(body.status||"").trim():current.status;
      const notes=Object.prototype.hasOwnProperty.call(body,"notes")?String(body.notes??""):current.notes;
      const followUp=Object.prototype.hasOwnProperty.call(body,"follow_up_at")?(body.follow_up_at||null):current.follow_up_at;
      if(!status)return json({error:"Status is required"},422,env);
      await env.DB.prepare("UPDATE leads SET status=?,notes=?,follow_up_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,notes,followUp,id).run();
      await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,status,notes,follow_up_at) VALUES(?, 'supervisor_update', ?, ?, ?, ?)").bind(id,s.user_label,status,notes,followUp).run();
      return json({ok:true,lead:await getLead(env.DB,id)},200,env);
    }
'''
if old not in text:
    raise SystemExit('PATCH route not found')
worker.write_text(text.replace(old,new,1))

frontend = Path('src/lead-crm.js')
text = frontend.read_text()
old = '''  const response = await fetch(API_BASE + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
'''
new = '''  const sessionToken = window.CRM_SESSION?.token?.() || localStorage.getItem("crm-telecaller-session-token") || "";
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...(options.headers || {}) }
  });
'''
if old not in text:
    raise SystemExit('api fetch block not found')
frontend.write_text(text.replace(old,new,1))
