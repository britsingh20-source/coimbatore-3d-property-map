const allowedOrigin = (env) => env.FRONTEND_ORIGIN || "https://britsingh20-source.github.io";
const json = (data, status = 200, env = {}, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": allowedOrigin(env), ...extra }
});

const STAFF = {
  TC01: { user_label: "Telecaller 1", role: "telecaller" },
  TC02: { user_label: "Telecaller 2", role: "telecaller" },
  MG01: { user_label: "Manager 1", role: "manager" },
  MG02: { user_label: "Manager 2", role: "manager" },
  AD01: { user_label: "Administrator", role: "administrator" },
  DR01: { user_label: "Director", role: "director" }
};
function roleForEmployee(employeeId){return STAFF[employeeId]?.role||null;}
function roleForLabel(label){return Object.values(STAFF).find(v=>v.user_label===label)?.role||null;}
function isTelecallerLabel(label){return roleForLabel(label)==="telecaller";}

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
function bearer(request) { const v=request.headers.get("authorization")||""; return v.startsWith("Bearer ")?v.slice(7):""; }
function needsFullDetails(status) { return ["Categorized","Interested","Hot","Follow-up","Site Visit"].includes(status); }
function validateCompletion(body) {
  const status=String(body.status||"").trim(); if(!status)return "Call result is required";
  if(needsFullDetails(status)) {
    if(!String(body.name||"").trim())return "Customer name is required";
    if(!String(body.area_text||body.area_code||"").trim())return "Customer area / preferred location is required";
    if(!String(body.property_type||"").trim())return "Property type is required";
    if(!String(body.budget||"").trim())return "Budget is required";
    if(!String(body.requirement||"").trim())return "Requirement is required";
    if(!String(body.notes||"").trim())return "Call notes are required";
  }
  if(status==="Follow-up"&&!body.follow_up_at)return "Follow-up date and time is required";
  return null;
}
function indiaDateKey(value=new Date()) { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(value); }
function dayNumber(key){const [y,m,d]=key.split("-").map(Number);return Math.floor(Date.UTC(y,m-1,d)/86400000);}
function queueForTelecaller(label,key=indiaDateKey()){const idx=label==="Telecaller 1"?0:label==="Telecaller 2"?1:-1;return idx<0?null:(idx===dayNumber(key)%2?"fresh":"backlog");}
async function getLead(db,id){return db.prepare("SELECT * FROM leads WHERE id=?").bind(id).first();}
async function allocateLeadCode(db,areaCode){if(!areaCode)return null;const row=await db.prepare("UPDATE area_counters SET last_number=last_number+1 WHERE area_code=? RETURNING last_number").bind(areaCode).first();return row?`${areaCode}-${String(row.last_number).padStart(4,"0")}`:null;}

async function pinHash(env,employeeId,pin){
  if(!env.IMPORT_TOKEN) throw new Error("PIN security key is not configured");
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",enc.encode(env.IMPORT_TOKEN),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,enc.encode(`${employeeId}:${pin}`));
  return [...new Uint8Array(sig)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function validPin(pin){return /^\d{3}$/.test(String(pin||""));}
async function credentialFor(db,employeeId){return db.prepare("SELECT * FROM telecaller_credentials WHERE employee_id=?").bind(employeeId).first();}
async function noteBadPin(db,employeeId){
  await db.prepare(`UPDATE telecaller_credentials SET
    locked_until=CASE WHEN failed_attempts+1>=5 THEN datetime('now','+15 minutes') ELSE locked_until END,
    failed_attempts=CASE WHEN failed_attempts+1>=5 THEN 0 ELSE failed_attempts+1 END,
    updated_at=CURRENT_TIMESTAMP WHERE employee_id=?`).bind(employeeId).run();
}
async function credentialLocked(row){
  if(!row?.locked_until)return false;
  const t=Date.parse(String(row.locked_until).replace(" ","T")+"Z");
  return Number.isFinite(t)&&t>Date.now();
}

async function sessionFor(request,env,{touch=false}={}){
  const token=bearer(request); if(!token)return null;
  let s=await env.DB.prepare("SELECT * FROM telecaller_sessions WHERE token=? AND active=1").bind(token).first();
  if(!s)return null;
  const now=Date.now(), last=Date.parse(String(s.last_activity_at).replace(" ","T")+"Z"), callStarted=s.call_started_at?Date.parse(String(s.call_started_at).replace(" ","T")+"Z"):0;
  const idleMs=now-last;
  const callExpired=s.call_active && callStarted && now-callStarted>4*60*60*1000;
  if((!s.call_active && idleMs>10*60*1000)||callExpired){
    await env.DB.prepare("UPDATE telecaller_sessions SET active=0,logout_at=CURRENT_TIMESTAMP,logout_reason=? WHERE token=?").bind(callExpired?"call_timeout":"idle_10_minutes",token).run();
    return null;
  }
  if(touch){await env.DB.prepare("UPDATE telecaller_sessions SET last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(token).run();s=await env.DB.prepare("SELECT * FROM telecaller_sessions WHERE token=?").bind(token).first();}
  return s;
}
async function requireSession(request,env,touch=true){const s=await sessionFor(request,env,{touch});return s||null;}

async function upsertImportedLead(db,lead){
  const phone=normalizePhone(lead.phone||lead.display_phone);if(!phone)return{skipped:true,reason:"invalid_phone"};
  const existing=await db.prepare("SELECT id FROM leads WHERE phone=?").bind(phone).first();
  const source=Array.isArray(lead.source)?lead.source.join(", "):(lead.source||"Historical import"); const status=lead.status||"Uncalled";
  if(existing){await db.prepare(`UPDATE leads SET name=COALESCE(?,name),status=?,requirement=COALESCE(?,requirement),notes=COALESCE(?,notes),source=?,first_received_at=COALESCE(?,first_received_at),last_received_at=COALESCE(?,last_received_at),area_text=COALESCE(?,area_text),property_type=COALESCE(?,property_type),budget=COALESCE(?,budget),source_period_start=COALESCE(?,source_period_start),source_period_end=COALESCE(?,source_period_end),date_precision=COALESCE(?,date_precision),transcription_review=MAX(transcription_review,?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(lead.name||null,status,lead.requirement||null,lead.notes||null,source,lead.first_received_at||null,lead.last_received_at||null,lead.area_text||null,lead.property_type||null,lead.budget||null,lead.source_period_start||null,lead.source_period_end||null,lead.date_precision||null,lead.transcription_review?1:0,existing.id).run();return{id:existing.id,duplicate:true};}
  const result=await db.prepare(`INSERT INTO leads(phone,display_phone,name,status,requirement,notes,source,first_received_at,last_received_at,area_text,property_type,budget,source_period_start,source_period_end,date_precision,transcription_review,pipeline_stage) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(phone,lead.display_phone||lead.phone||phone,lead.name||null,status,lead.requirement||null,lead.notes||null,source,lead.first_received_at||new Date().toISOString(),lead.last_received_at||lead.first_received_at||new Date().toISOString(),lead.area_text||null,lead.property_type||null,lead.budget||null,lead.source_period_start||null,lead.source_period_end||null,lead.date_precision||"exact",lead.transcription_review?1:0,status==="Categorized"?"manager_queue":"incoming").first();return{id:result.id,duplicate:false};
}

async function currentBatch(env,user){
  let rows=(await env.DB.prepare(`SELECT * FROM leads WHERE telecaller_assigned_to=? AND contact_complete=0 AND status IN ('Uncalled','No Response','Busy','Needs Review') ORDER BY first_received_at,id LIMIT 10`).bind(user).all()).results||[];
  if(rows.length>=10)return rows;
  const need=10-rows.length; const today=indiaDateKey(); const preferred=queueForTelecaller(user,today);
  const condition=preferred==="fresh"?"substr(first_received_at,1,10)=?":"substr(first_received_at,1,10)<?";
  let added=(await env.DB.prepare(`UPDATE leads SET telecaller_assigned_to=?,pipeline_stage='telecaller_claimed',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM leads WHERE telecaller_assigned_to IS NULL AND contact_complete=0 AND status IN ('Uncalled','No Response','Busy','Needs Review') AND ${condition} ORDER BY first_received_at,id LIMIT ?) RETURNING *`).bind(user,today,need).all()).results||[];
  if(added.length<need){
    const remain=need-added.length;
    const extra=(await env.DB.prepare(`UPDATE leads SET telecaller_assigned_to=?,pipeline_stage='telecaller_claimed',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM leads WHERE telecaller_assigned_to IS NULL AND contact_complete=0 AND status IN ('Uncalled','No Response','Busy','Needs Review') ORDER BY first_received_at,id LIMIT ?) RETURNING *`).bind(user,remain).all()).results||[];
    added=added.concat(extra);
  }
  for(const lead of added)await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'batch_assigned', ?, 'Assigned in current batch of 10')").bind(lead.id,user).run();
  rows=rows.concat(added).sort((a,b)=>String(a.first_received_at).localeCompare(String(b.first_received_at))).slice(0,10);return rows;
}

export default { async fetch(request,env){
  if(request.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":allowedOrigin(env),"access-control-allow-methods":"GET,POST,PATCH,OPTIONS","access-control-allow-headers":"content-type,authorization"}});
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,"")||"/";
  try{
    if(request.method==="GET"&&path==="/api/health")return json({ok:true,service:"lead-crm",secureImport:true,timedSessions:true,employeePinAuth:true,unifiedStaffLogin:true},200,env);

    if(request.method==="POST"&&path==="/api/admin/staff/set-pin"){
      if(!env.IMPORT_TOKEN||bearer(request)!==env.IMPORT_TOKEN)return json({error:"Unauthorized"},401,env);
      const body=await request.json();const employeeId=String(body.employee_id||"").trim().toUpperCase();const pin=String(body.pin||"").trim();
      if(!STAFF[employeeId])return json({error:"Unknown employee ID"},400,env);
      if(!validPin(pin))return json({error:"PIN must be exactly 3 digits"},400,env);
      const hash=await pinHash(env,employeeId,pin);
      await env.DB.prepare("UPDATE telecaller_credentials SET pin_hash=?,failed_attempts=0,locked_until=NULL,active=1,updated_at=CURRENT_TIMESTAMP WHERE employee_id=?").bind(hash,employeeId).run();
      return json({ok:true,employee_id:employeeId},200,env);
    }

    if(request.method==="POST"&&path==="/api/session/login"){
      const body=await request.json();const employeeId=String(body.employee_id||"").trim().toUpperCase();const pin=String(body.pin||"").trim();
      if(!STAFF[employeeId]||!validPin(pin))return json({error:"Enter a valid employee ID and 3-digit PIN"},400,env);
      const cred=await credentialFor(env.DB,employeeId);
      if(!cred||!cred.active)return json({error:"Employee login is disabled"},403,env);
      if(await credentialLocked(cred))return json({error:"Too many wrong PIN attempts. Try again after 15 minutes.",locked:true,locked_until:cred.locked_until},423,env);
      if(!cred.pin_hash)return json({error:"PIN has not been configured for this employee yet"},503,env);
      const hash=await pinHash(env,employeeId,pin);
      if(hash!==cred.pin_hash){await noteBadPin(env.DB,employeeId);return json({error:"Incorrect employee ID or PIN"},401,env);}
      await env.DB.prepare("UPDATE telecaller_credentials SET failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE employee_id=?").bind(employeeId).run();
      const user=cred.user_label,role=roleForEmployee(employeeId);
      await env.DB.prepare("UPDATE telecaller_sessions SET active=0,logout_at=CURRENT_TIMESTAMP,logout_reason='new_login' WHERE user_label=? AND active=1").bind(user).run();
      const token=crypto.randomUUID()+crypto.randomUUID();
      await env.DB.prepare("INSERT INTO telecaller_sessions(token,user_label) VALUES(?,?)").bind(token,user).run();
      return json({ok:true,token,employee_id:employeeId,user_label:user,role,login_at:new Date().toISOString(),idle_timeout_minutes:10},200,env);
    }
    if(request.method==="GET"&&path==="/api/session/me"){
      const s=await requireSession(request,env,false);if(!s)return json({error:"Session expired",expired:true},401,env);
      const cred=await env.DB.prepare("SELECT employee_id FROM telecaller_credentials WHERE user_label=?").bind(s.user_label).first();
      const employeeId=cred?.employee_id||null;
      return json({ok:true,employee_id:employeeId,user_label:s.user_label,role:roleForEmployee(employeeId),login_at:s.login_at,last_activity_at:s.last_activity_at,call_active:!!s.call_active,idle_timeout_minutes:10},200,env);
    }
    if(request.method==="POST"&&path==="/api/session/activity"){
      const s=await requireSession(request,env,true);if(!s)return json({error:"Session expired",expired:true},401,env);return json({ok:true,last_activity_at:new Date().toISOString()},200,env);
    }
    if(request.method==="POST"&&path==="/api/session/call-start"){
      const s=await requireSession(request,env,true);if(!s)return json({error:"Session expired",expired:true},401,env);
      if(!isTelecallerLabel(s.user_label))return json({error:"Call mode is available to telecallers only"},403,env);
      await env.DB.prepare("UPDATE telecaller_sessions SET call_active=1,call_started_at=CURRENT_TIMESTAMP,last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(bearer(request)).run();return json({ok:true},200,env);
    }
    if(request.method==="POST"&&path==="/api/session/call-end"){
      const s=await requireSession(request,env,false);if(!s)return json({error:"Session expired",expired:true},401,env);
      await env.DB.prepare("UPDATE telecaller_sessions SET call_active=0,call_started_at=NULL,last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(bearer(request)).run();return json({ok:true},200,env);
    }
    if(request.method==="POST"&&path==="/api/session/logout"){
      const token=bearer(request);if(token)await env.DB.prepare("UPDATE telecaller_sessions SET active=0,call_active=0,logout_at=CURRENT_TIMESTAMP,logout_reason='manual' WHERE token=?").bind(token).run();return json({ok:true},200,env);
    }
    if(request.method==="GET"&&path==="/api/telecaller/batch"){
      const s=await requireSession(request,env,true);if(!s)return json({error:"Session expired",expired:true},401,env);
      if(!isTelecallerLabel(s.user_label))return json({error:"Telecaller batch is not available for this role"},403,env);
      const leads=await currentBatch(env,s.user_label);return json({ok:true,user_label:s.user_label,queue:queueForTelecaller(s.user_label),batch_size:10,leads},200,env);
    }

    if(request.method==="POST"&&path==="/api/admin/import"){
      if(!env.IMPORT_TOKEN||bearer(request)!==env.IMPORT_TOKEN)return json({error:"Unauthorized"},401,env);
      const body=await request.json(),rows=Array.isArray(body.leads)?body.leads:[];if(!rows.length)return json({error:"No leads supplied"},400,env);let inserted=0,updated=0,skipped=0;
      for(const lead of rows){const r=await upsertImportedLead(env.DB,lead);if(r.skipped)skipped++;else if(r.duplicate)updated++;else inserted++;if(!r.skipped)await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,notes) VALUES(?, 'historical_import', ?)").bind(r.id,"Imported from historical lead register").run();}
      return json({ok:true,inserted,updated,skipped},200,env);
    }
    if(request.method==="GET"&&path==="/api/areas"){
      const r=await env.DB.prepare(`SELECT a.code,a.name,COUNT(l.id) total,SUM(CASE WHEN l.status='Hot' THEN 1 ELSE 0 END) hot,SUM(CASE WHEN l.status='Follow-up' THEN 1 ELSE 0 END) follow_up,SUM(CASE WHEN l.status IN ('Uncalled','No Response','Busy','Needs Review') THEN 1 ELSE 0 END) uncalled FROM areas a LEFT JOIN leads l ON l.area_code=a.code WHERE a.active=1 GROUP BY a.code,a.name ORDER BY a.name`).all();return json({areas:r.results||[]},200,env);
    }
    if(request.method==="GET"&&path==="/api/leads"){
      const clauses=[],params=[];for(const [key,col] of [["area","area_code"],["status","status"],["telecaller","telecaller_assigned_to"],["manager","manager_assigned_to"]]){const v=url.searchParams.get(key);if(v){clauses.push(`${col}=?`);params.push(v);}}
      const q=url.searchParams.get("q");if(q){const like=`%${q}%`;clauses.push("(lead_code LIKE ? OR name LIKE ? OR phone LIKE ? OR requirement LIKE ? OR area_text LIKE ?)");params.push(like,like,like,like,like);}const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";const r=await env.DB.prepare(`SELECT * FROM leads ${where} ORDER BY first_received_at DESC,id DESC`).bind(...params).all();return json({leads:r.results||[]},200,env);
    }
    const claim=path.match(/^\/api\/leads\/(\d+)\/claim$/);if(request.method==="POST"&&claim){const s=await requireSession(request,env,true);if(!s)return json({error:"Session expired",expired:true},401,env);if(!isTelecallerLabel(s.user_label))return json({error:"Lead claiming is available to telecallers only"},403,env);const id=Number(claim[1]);const r=await env.DB.prepare(`UPDATE leads SET telecaller_assigned_to=?,pipeline_stage='telecaller_claimed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND (telecaller_assigned_to IS NULL OR telecaller_assigned_to=?) AND pipeline_stage IN ('incoming','telecaller_claimed') RETURNING id`).bind(s.user_label,id,s.user_label).first();if(!r)return json({error:"Lead already claimed or unavailable",lead:await getLead(env.DB,id)},409,env);return json({lead:await getLead(env.DB,id)},200,env);}
    const complete=path.match(/^\/api\/leads\/(\d+)\/complete-call$/);if(request.method==="POST"&&complete){const s=await requireSession(request,env,true);if(!s)return json({error:"Session expired",expired:true},401,env);if(!isTelecallerLabel(s.user_label))return json({error:"Call completion is available to telecallers only"},403,env);const id=Number(complete[1]),body=await request.json();body.caller=s.user_label;const validation=validateCompletion(body);if(validation)return json({error:validation},422,env);const current=await getLead(env.DB,id);if(!current)return json({error:"Lead not found"},404,env);if(current.telecaller_assigned_to&&current.telecaller_assigned_to!==s.user_label)return json({error:"Lead belongs to another telecaller"},403,env);let leadCode=current.lead_code;if(!leadCode&&body.area_code)leadCode=await allocateLeadCode(env.DB,body.area_code);const terminal=["No Response","Busy","Not Interested","Wrong Number"].includes(body.status),categorized=needsFullDetails(body.status),stage=categorized?"manager_queue":(terminal?"incoming":current.pipeline_stage||"incoming");await env.DB.prepare(`UPDATE leads SET lead_code=?,name=?,area_code=COALESCE(?,area_code),area_text=?,property_type=?,budget=?,status=?,requirement=?,notes=?,follow_up_at=?,last_contact_at=CURRENT_TIMESTAMP,contacted_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE contacted_at END,contact_complete=?,pipeline_stage=?,categorized_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE categorized_at END,manager_handoff_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE manager_handoff_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(leadCode,body.name||current.name||null,body.area_code||null,body.area_text||null,body.property_type||null,body.budget||null,body.status,body.requirement||null,body.notes||null,body.follow_up_at||null,categorized?1:0,categorized?1:0,stage,categorized?1:0,categorized?1:0,id).run();await env.DB.prepare(`INSERT INTO lead_activity(lead_id,activity_type,caller,status,area_code,notes,requirement,follow_up_at) VALUES(?, 'call_completed', ?, ?, ?, ?, ?, ?)`).bind(id,s.user_label,body.status,body.area_code||null,body.notes||null,body.requirement||null,body.follow_up_at||null).run();return json({lead:await getLead(env.DB,id),completed:categorized},200,env);}
    const detail=path.match(/^\/api\/leads\/(\d+)$/);
    if(request.method==="PATCH"&&detail){
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
    if(request.method==="GET"&&detail){const id=Number(detail[1]),lead=await getLead(env.DB,id);if(!lead)return json({error:"Lead not found"},404,env);const activity=await env.DB.prepare("SELECT * FROM lead_activity WHERE lead_id=? ORDER BY created_at DESC,id DESC").bind(id).all();return json({lead,activity:activity.results||[]},200,env);}
    return json({error:"Not found"},404,env);
  }catch(error){return json({error:error.message||"Server error"},500,env);}
}};
