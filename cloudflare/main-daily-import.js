import baseWorker from "./main-area-management.js";

const ORIGIN = env => env.FRONTEND_ORIGIN || "https://britsingh20-source.github.io";
const json = (data,status=200,env={}) => new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN(env),"cache-control":"no-store"}});
const bearer = request => { const v=request.headers.get("authorization")||""; return v.startsWith("Bearer ")?v.slice(7):""; };

async function adminSession(request,env){
  const token=bearer(request);if(!token)return null;
  const row=await env.DB.prepare("SELECT user_label,last_activity_at,active FROM telecaller_sessions WHERE token=? AND active=1").bind(token).first();
  if(!row)return null;
  const last=Date.parse(String(row.last_activity_at||"").replace(" ","T")+"Z");
  if(!Number.isFinite(last)||Date.now()-last>10*60*1000)return null;
  if(!["Administrator","Director"].includes(row.user_label))return {forbidden:true,user_label:row.user_label};
  await env.DB.prepare("UPDATE telecaller_sessions SET last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(token).run();
  return row;
}

function classifyPhone(value=""){
  let raw=String(value??"").trim();
  if(!raw||/unclear|unknown|\?/i.test(raw))return {ok:false,reason:"Missing or unclear phone"};
  raw=raw.replace(/[\u00a0]/g," ");
  let international=false;
  if(raw.startsWith("00")){raw="+"+raw.slice(2);international=true;}
  const hadPlus=raw.startsWith("+");
  let digits=raw.replace(/\D/g,"");
  if(!digits)return {ok:false,reason:"No digits found"};

  if(digits.length===12&&digits.startsWith("91"))return {ok:true,phone:digits.slice(2),display:"+91 "+digits.slice(2),region:"India"};
  if(digits.length===10&&!hadPlus)return {ok:true,phone:digits,display:digits,region:"India"};
  if(hadPlus&&digits.startsWith("91")&&digits.length===12)return {ok:true,phone:digits.slice(2),display:"+91 "+digits.slice(2),region:"India"};

  if(hadPlus||international){
    if(digits.length<7||digits.length>15)return {ok:false,reason:"International number must contain 7–15 digits"};
    return {ok:true,phone:"+"+digits,display:"+"+digits,region:"International"};
  }

  if(digits.length>10&&digits.length<=15){
    return {ok:true,phone:"+"+digits,display:"+"+digits,region:"International"};
  }
  return {ok:false,reason:"Phone format needs review"};
}

function normalizeReceivedAt(value,importDate){
  const raw=String(value||"").trim();
  if(raw){
    const ms=Date.parse(raw);
    if(Number.isFinite(ms))return new Date(ms).toISOString();
  }
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(importDate||""))?String(importDate):new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  return new Date(`${date}T12:00:00+05:30`).toISOString();
}

async function validateRows(env,rows,importDate){
  const seen=new Set();
  const checked=[];
  const summary={total_rows:rows.length,valid_rows:0,new_leads:0,repeat_callers:0,file_duplicates:0,needs_review:0,india_count:0,international_count:0};
  for(let i=0;i<rows.length;i++){
    const row=rows[i]||{};
    const p=classifyPhone(row.phone||row["Phone Number"]||row.mobile||row.number);
    const item={row:i+2,raw_phone:row.phone||row["Phone Number"]||row.mobile||row.number||"",name:String(row.name||row["Customer Name"]||"").trim(),source:String(row.source||row.Source||"Daily call-log import").trim()||"Daily call-log import",notes:String(row.notes||row.Notes||"").trim(),received_at:normalizeReceivedAt(row.received_at||row["Received At"]||row.received_datetime,importDate)};
    if(!p.ok){summary.needs_review++;checked.push({...item,status:"needs_review",reason:p.reason});continue;}
    item.phone=p.phone;item.display_phone=p.display;item.region=p.region;
    if(seen.has(p.phone)){summary.file_duplicates++;checked.push({...item,status:"file_duplicate",reason:"Duplicate number inside this Excel file"});continue;}
    seen.add(p.phone);
    summary.valid_rows++;
    if(p.region==="India")summary.india_count++;else summary.international_count++;
    const existing=await env.DB.prepare("SELECT id,first_received_at,last_received_at,telecaller_assigned_to,status FROM leads WHERE phone=? LIMIT 1").bind(p.phone).first();
    if(existing){summary.repeat_callers++;checked.push({...item,status:"repeat_caller",existing_lead_id:existing.id,existing_assigned_to:existing.telecaller_assigned_to||null,existing_status:existing.status});}
    else{summary.new_leads++;checked.push({...item,status:"new_lead"});}
  }
  return {summary,rows:checked};
}

function validateReplacementRows(rows,importDate){
  const checked=[],phones=new Set();let india=0,international=0;
  for(let i=0;i<rows.length;i++){
    const row=rows[i]||{},p=classifyPhone(row.phone||row["Phone Number"]||row.mobile||row.number);
    const item={row:i+2,raw_phone:row.phone||row["Phone Number"]||row.mobile||row.number||"",name:String(row.name||row["Customer Name"]||"").trim(),source:String(row.source||row.Source||"Lead database replacement").trim()||"Lead database replacement",notes:String(row.notes||row.Notes||"").trim(),received_at:normalizeReceivedAt(row.received_at||row["Received At"]||row.received_datetime,importDate)};
    if(!p.ok){checked.push({...item,status:"needs_review",reason:p.reason});continue;}
    item.phone=p.phone;item.display_phone=p.display;item.region=p.region;phones.add(p.phone);
    if(p.region==="India")india++;else international++;
    checked.push({...item,status:"valid_activity"});
  }
  const invalid=checked.filter(x=>x.status==="needs_review").length;
  return {rows:checked,summary:{total_rows:rows.length,valid_rows:rows.length-invalid,unique_leads:phones.size,repeat_occurrences:rows.length-invalid-phones.size,needs_review:invalid,india_count:india,international_count:international}};
}

async function preview(request,env){
  const session=await adminSession(request,env);
  if(!session)return json({error:"Session expired",expired:true},401,env);
  if(session.forbidden)return json({error:"Daily Lead Import is available to Administrator and Director only"},403,env);
  const body=await request.json().catch(()=>({})),rows=Array.isArray(body.rows)?body.rows:[];
  if(!rows.length)return json({error:"No Excel rows received"},422,env);
  if(rows.length>1000)return json({error:"Maximum 1,000 rows per import"},422,env);
  if(body.mode==="replace"){
    const result=validateReplacementRows(rows,body.import_date);
    const current=await env.DB.prepare("SELECT COUNT(*) count FROM leads").first();
    return json({ok:true,mode:"replace",current_leads:Number(current?.count||0),...result},200,env);
  }
  const result=await validateRows(env,rows,body.import_date);
  return json({ok:true,...result},200,env);
}

async function commit(request,env){
  const session=await adminSession(request,env);
  if(!session)return json({error:"Session expired",expired:true},401,env);
  if(session.forbidden)return json({error:"Daily Lead Import is available to Administrator and Director only"},403,env);
  const body=await request.json().catch(()=>({})),rows=Array.isArray(body.rows)?body.rows:[];
  if(body.mode==="replace_stage")return stageReplacement(env,body,rows);
  if(body.mode==="replace_promote")return promoteReplacement(env,session,body);
  if(!rows.length)return json({error:"No Excel rows received"},422,env);
  if(rows.length>1000)return json({error:"Maximum 1,000 rows per import"},422,env);
  if(body.mode==="replace")return replaceDatabase(env,session,body,rows);
  const importDate=/^\d{4}-\d{2}-\d{2}$/.test(String(body.import_date||""))?String(body.import_date):new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const validation=await validateRows(env,rows,importDate);
  let created=0,updated=0;
  for(const item of validation.rows){
    if(item.status!=="new_lead"&&item.status!=="repeat_caller")continue;
    if(item.status==="repeat_caller"){
      const lead=await env.DB.prepare("SELECT id,last_received_at FROM leads WHERE phone=? LIMIT 1").bind(item.phone).first();
      if(!lead)continue;
      const latest=Math.max(Date.parse(String(lead.last_received_at||0)),Date.parse(item.received_at));
      const latestIso=Number.isFinite(latest)?new Date(latest).toISOString():item.received_at;
      await env.DB.prepare(`UPDATE leads SET
        display_phone=COALESCE(NULLIF(?,''),display_phone),
        name=COALESCE(NULLIF(?,''),name),
        source=CASE WHEN source IS NULL OR source='' THEN ? WHEN instr(source,?)>0 THEN source ELSE source || ', ' || ? END,
        last_received_at=?,
        notes=COALESCE(NULLIF(?,''),notes),
        updated_at=CURRENT_TIMESTAMP
        WHERE id=?`).bind(item.display_phone,item.name,item.source,item.source,item.source,latestIso,item.notes,lead.id).run();
      await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'bulk_incoming_repeat', ?, ?)").bind(lead.id,session.user_label,`Repeat incoming call from daily import on ${importDate} via ${item.source}`).run();
      updated++;
    }else{
      const lead=await env.DB.prepare(`INSERT INTO leads(
        phone,display_phone,name,status,source,first_received_at,last_received_at,notes,date_precision,transcription_review,pipeline_stage,contact_complete
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,0) RETURNING id`).bind(item.phone,item.display_phone,item.name||null,"Uncalled",item.source,item.received_at,item.received_at,item.notes||null,"exact",0,"incoming").first();
      await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'bulk_incoming_new', ?, ?)").bind(lead.id,session.user_label,`New lead from daily import on ${importDate} via ${item.source}`).run();
      created++;
    }
  }
  await env.DB.prepare(`INSERT INTO daily_lead_imports(
    import_date,source_file,total_rows,valid_rows,new_leads,repeat_callers,file_duplicates,needs_review,india_count,international_count,imported_by
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(importDate,String(body.source_file||"Daily lead Excel"),validation.summary.total_rows,validation.summary.valid_rows,created,updated,validation.summary.file_duplicates,validation.summary.needs_review,validation.summary.india_count,validation.summary.international_count,session.user_label).run();
  return json({ok:true,import_date:importDate,created,repeat_callers_updated:updated,summary:validation.summary},200,env);
}

async function stageReplacement(env,body,rows){
  const batchId=String(body.batch_id||"");
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(batchId))return json({error:"Invalid replacement batch"},422,env);
  if(!rows.length||rows.length>75)return json({error:"Replacement chunks must contain 1–75 rows"},422,env);
  const validation=validateReplacementRows(rows,body.import_date);
  if(validation.summary.needs_review)return json({error:`Chunk stopped: ${validation.summary.needs_review} rows have invalid phone numbers`},422,env);
  const offset=Math.max(0,Number(body.offset)||0);
  await env.DB.batch(validation.rows.map((item,j)=>env.DB.prepare("INSERT OR REPLACE INTO lead_replace_staging(batch_id,row_no,phone,display_phone,name,source,notes,received_at,region) VALUES(?,?,?,?,?,?,?,?,?)").bind(batchId,offset+j+1,item.phone,item.display_phone,item.name||null,item.source,item.notes||null,item.received_at,item.region)));
  const count=await env.DB.prepare("SELECT COUNT(*) count FROM lead_replace_staging WHERE batch_id=?").bind(batchId).first();
  return json({ok:true,mode:"replace_stage",staged:Number(count?.count||0)},200,env);
}

async function promoteReplacement(env,session,body){
  const batchId=String(body.batch_id||"");
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(batchId))return json({error:"Invalid replacement batch"},422,env);
  const stats=await env.DB.prepare("SELECT COUNT(*) total_rows,COUNT(DISTINCT phone) unique_leads,SUM(CASE WHEN region='India' THEN 1 ELSE 0 END) india_count,SUM(CASE WHEN region='International' THEN 1 ELSE 0 END) international_count FROM lead_replace_staging WHERE batch_id=?").bind(batchId).first();
  const total=Number(stats?.total_rows||0),unique=Number(stats?.unique_leads||0);
  if(total!==Number(body.expected_activity_count)||unique!==Number(body.expected_unique_leads))return json({error:`Staging count mismatch: found ${total} activities and ${unique} customers`},409,env);
  const expected=Number(body.expected_current_leads),current=await env.DB.prepare("SELECT COUNT(*) count FROM leads").first(),currentCount=Number(current?.count||0);
  if(!Number.isInteger(expected)||expected!==currentCount)return json({error:`CRM changed after preview. Expected ${expected} current leads but found ${currentCount}. Preview again.`},409,env);
  if(String(body.confirmation||"")!==`REPLACE ${currentCount} LEADS`)return json({error:`Type REPLACE ${currentCount} LEADS to confirm`},422,env);
  const [leads,activities]=await Promise.all([env.DB.prepare("SELECT * FROM leads ORDER BY id").all(),env.DB.prepare("SELECT * FROM lead_activity ORDER BY lead_id,id").all()]);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO lead_replacement_backups(source_file,old_lead_count,new_lead_count,new_activity_count,leads_json,activities_json,replaced_by) VALUES(?,?,?,?,?,?,?)").bind(String(body.source_file||"Lead replacement Excel"),currentCount,unique,total,JSON.stringify(leads.results||[]),JSON.stringify(activities.results||[]),session.user_label),
    env.DB.prepare("DELETE FROM leads"),
    env.DB.prepare(`INSERT INTO leads(phone,display_phone,name,status,source,first_received_at,last_received_at,notes,date_precision,transcription_review,pipeline_stage,contact_complete) SELECT phone,MAX(display_phone),MAX(CASE WHEN name<>'' AND lower(name) NOT IN ('number visible','unknown') THEN name END),'Uncalled',GROUP_CONCAT(DISTINCT source),MIN(received_at),MAX(received_at),'Imported from verified four-day call register','exact',0,'incoming',0 FROM lead_replace_staging WHERE batch_id=? GROUP BY phone`).bind(batchId),
    env.DB.prepare(`INSERT INTO lead_activity(lead_id,activity_type,caller,notes,created_at) SELECT l.id,CASE WHEN ROW_NUMBER() OVER(PARTITION BY s.phone ORDER BY s.received_at,s.row_no)=1 THEN 'bulk_incoming_new' ELSE 'bulk_incoming_repeat' END,?,'Received ' || substr(s.received_at,1,10) || ' via ' || COALESCE(s.source,'Lead replacement') || CASE WHEN s.notes IS NULL OR s.notes='' THEN '' ELSE '. ' || s.notes END,s.received_at FROM lead_replace_staging s JOIN leads l ON l.phone=s.phone WHERE s.batch_id=?`).bind(session.user_label,batchId),
    env.DB.prepare("INSERT INTO daily_lead_imports(import_date,source_file,total_rows,valid_rows,new_leads,repeat_callers,file_duplicates,needs_review,india_count,international_count,imported_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(String(body.import_date||"2026-09-01"),String(body.source_file||"Lead replacement Excel"),total,total,unique,total-unique,0,0,Number(stats?.india_count||0),Number(stats?.international_count||0),session.user_label),
    env.DB.prepare("DELETE FROM lead_replace_staging WHERE batch_id=?").bind(batchId)
  ]);
  return json({ok:true,mode:"replace",backup_created:true,removed:currentCount,created:unique,activities:total},200,env);
}

async function replaceDatabase(env,session,body,rows){
  const validation=validateReplacementRows(rows,body.import_date);
  if(validation.summary.needs_review)return json({error:`Replacement stopped: ${validation.summary.needs_review} rows have invalid phone numbers`},422,env);
  const expected=Number(body.expected_current_leads),current=await env.DB.prepare("SELECT COUNT(*) count FROM leads").first(),currentCount=Number(current?.count||0);
  if(!Number.isInteger(expected)||expected!==currentCount)return json({error:`CRM changed after preview. Expected ${expected} current leads but found ${currentCount}. Preview again.`},409,env);
  if(String(body.confirmation||"")!==`REPLACE ${currentCount} LEADS`)return json({error:`Type REPLACE ${currentCount} LEADS to confirm`},422,env);
  const batchId=crypto.randomUUID(),valid=validation.rows;
  for(let i=0;i<valid.length;i+=75){
    await env.DB.batch(valid.slice(i,i+75).map((item,j)=>env.DB.prepare("INSERT INTO lead_replace_staging(batch_id,row_no,phone,display_phone,name,source,notes,received_at,region) VALUES(?,?,?,?,?,?,?,?,?)").bind(batchId,i+j+1,item.phone,item.display_phone,item.name||null,item.source,item.notes||null,item.received_at,item.region)));
  }
  try{
    const [leads,activities]=await Promise.all([env.DB.prepare("SELECT * FROM leads ORDER BY id").all(),env.DB.prepare("SELECT * FROM lead_activity ORDER BY lead_id,id").all()]);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO lead_replacement_backups(source_file,old_lead_count,new_lead_count,new_activity_count,leads_json,activities_json,replaced_by) VALUES(?,?,?,?,?,?,?)").bind(String(body.source_file||"Lead replacement Excel"),currentCount,validation.summary.unique_leads,validation.summary.valid_rows,JSON.stringify(leads.results||[]),JSON.stringify(activities.results||[]),session.user_label),
      env.DB.prepare("DELETE FROM leads"),
      env.DB.prepare(`INSERT INTO leads(phone,display_phone,name,status,source,first_received_at,last_received_at,notes,date_precision,transcription_review,pipeline_stage,contact_complete)
        SELECT phone,MAX(display_phone),MAX(CASE WHEN name<>'' AND lower(name) NOT IN ('number visible','unknown') THEN name END),'Uncalled',GROUP_CONCAT(DISTINCT source),MIN(received_at),MAX(received_at),'Imported from verified four-day call register','exact',0,'incoming',0 FROM lead_replace_staging WHERE batch_id=? GROUP BY phone`).bind(batchId),
      env.DB.prepare(`INSERT INTO lead_activity(lead_id,activity_type,caller,notes,created_at)
        SELECT l.id,CASE WHEN ROW_NUMBER() OVER(PARTITION BY s.phone ORDER BY s.received_at,s.row_no)=1 THEN 'bulk_incoming_new' ELSE 'bulk_incoming_repeat' END,?,'Received ' || substr(s.received_at,1,10) || ' via ' || COALESCE(s.source,'Lead replacement') || CASE WHEN s.notes IS NULL OR s.notes='' THEN '' ELSE '. ' || s.notes END,s.received_at FROM lead_replace_staging s JOIN leads l ON l.phone=s.phone WHERE s.batch_id=?`).bind(session.user_label,batchId),
      env.DB.prepare("INSERT INTO daily_lead_imports(import_date,source_file,total_rows,valid_rows,new_leads,repeat_callers,file_duplicates,needs_review,india_count,international_count,imported_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(String(body.import_date||"2026-09-01"),String(body.source_file||"Lead replacement Excel"),validation.summary.total_rows,validation.summary.valid_rows,validation.summary.unique_leads,validation.summary.repeat_occurrences,0,0,validation.summary.india_count,validation.summary.international_count,session.user_label),
      env.DB.prepare("DELETE FROM lead_replace_staging WHERE batch_id=?").bind(batchId)
    ]);
  }catch(error){await env.DB.prepare("DELETE FROM lead_replace_staging WHERE batch_id=?").bind(batchId).run().catch(()=>{});throw error;}
  const finalCount=await env.DB.prepare("SELECT COUNT(*) count FROM leads").first(),activityCount=await env.DB.prepare("SELECT COUNT(*) count FROM lead_activity").first();
  return json({ok:true,mode:"replace",backup_created:true,removed:currentCount,created:Number(finalCount?.count||0),activities:Number(activityCount?.count||0),summary:validation.summary},200,env);
}

async function history(request,env){
  const session=await adminSession(request,env);
  if(!session)return json({error:"Session expired",expired:true},401,env);
  if(session.forbidden)return json({error:"Daily Lead Import is available to Administrator and Director only"},403,env);
  const rows=(await env.DB.prepare("SELECT * FROM daily_lead_imports ORDER BY import_date DESC,id DESC LIMIT 60").all()).results||[];
  return json({ok:true,imports:rows},200,env);
}

export default {async fetch(request,env,ctx){
  const path=new URL(request.url).pathname.replace(/\/$/,"")||"/";
  if(request.method==="POST"&&path==="/api/admin/daily-import/preview")return preview(request,env);
  if(request.method==="POST"&&path==="/api/admin/daily-import/commit")return commit(request,env);
  if(request.method==="GET"&&path==="/api/admin/daily-import/history")return history(request,env);
  return baseWorker.fetch(request,env,ctx);
}};
