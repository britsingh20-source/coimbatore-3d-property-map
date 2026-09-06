import baseWorker from './main-social-intake.js';
import { AREA_OPTIONS } from './social-keywords.js';

const ORIGIN = env => env.FRONTEND_ORIGIN || 'https://britsingh20-source.github.io';
const json = (data,status=200,env={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':ORIGIN(env),'access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'GET,POST,OPTIONS','cache-control':'no-store'}});
const bearer = request => { const v=request.headers.get('authorization')||''; return v.startsWith('Bearer ')?v.slice(7):''; };

function normalizeIndianPhone(value=''){
  const digits=String(value).replace(/\D/g,'');
  if(digits.length===12&&digits.startsWith('91'))return digits.slice(2);
  if(digits.length===10)return digits;
  return null;
}
function areaOption(value=''){
  const wanted=String(value||'').trim().toUpperCase().replace(/[^A-Z]/g,'');
  for(const [keyword,area,assignedTo] of AREA_OPTIONS){
    if(wanted===keyword||wanted===String(area).toUpperCase().replace(/[^A-Z]/g,''))return {keyword,area,assignedTo};
  }
  return null;
}
function areaFromMessage(message=''){
  const text=String(message||'').toLowerCase();
  for(const [,area,assignedTo] of AREA_OPTIONS){
    if(text.includes(String(area).toLowerCase()))return {area,assignedTo};
  }
  return null;
}
async function supervisorSession(request,env){
  const token=bearer(request);if(!token)return null;
  const row=await env.DB.prepare("SELECT user_label,active FROM telecaller_sessions WHERE token=? AND active=1").bind(token).first();
  if(!row)return null;
  if(!['Manager 1','Manager 2','Administrator','Director'].includes(row.user_label))return {forbidden:true,user_label:row.user_label};
  await env.DB.prepare("UPDATE telecaller_sessions SET last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(token).run();
  return row;
}

async function captureInboundWhatsApp(env,body){
  const phone=normalizeIndianPhone(body.phone);
  if(!phone)return {error:'Valid Indian WhatsApp number required',status:422};
  const prefill=String(body.prefill_token||'').trim().toUpperCase();
  if(!prefill)return {error:'prefill_token required',status:422};
  const social=await env.DB.prepare("SELECT * FROM social_leads WHERE whatsapp_prefill_token=? LIMIT 1").bind(prefill).first();
  if(!social)return {error:'Social lead token not found',status:404};

  let selected=areaOption(body.area||'')||areaFromMessage(body.message||'');
  const finalArea=selected?.area||social.interested_area||null;
  const finalAssigned=selected?.assignedTo||social.assigned_to||null;
  if(finalArea!==social.interested_area||finalAssigned!==social.assigned_to){
    await env.DB.prepare("UPDATE social_leads SET interested_area=?,assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(finalArea,finalAssigned,social.id).run();
  }

  let lead=await env.DB.prepare("SELECT * FROM leads WHERE phone=? LIMIT 1").bind(phone).first();
  if(!lead){
    lead=await env.DB.prepare(`INSERT INTO leads(phone,display_phone,name,status,source,first_received_at,last_received_at,notes,date_precision,transcription_review,pipeline_stage,contact_complete,telecaller_assigned_to,area_text) VALUES(?,?,?,'Uncalled','Instagram -> WhatsApp',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,'exact',0,'incoming',1,?,?) RETURNING *`).bind(phone,`+91 ${phone}`,String(body.name||'')||null,`Inbound WhatsApp after Instagram keyword ${social.keyword}; Area ${finalArea||'Not selected'}`,finalAssigned,finalArea).first();
    await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'social_whatsapp_capture', 'System', ?)").bind(lead.id,`Inbound WhatsApp captured after Instagram ${social.keyword} enquiry`).run();
  }else{
    await env.DB.prepare("UPDATE leads SET last_received_at=CURRENT_TIMESTAMP,area_text=COALESCE(?,area_text),telecaller_assigned_to=COALESCE(?,telecaller_assigned_to),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(finalArea,finalAssigned,lead.id).run();
    await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'social_whatsapp_merge', 'System', ?)").bind(lead.id,`Existing CRM lead matched to inbound Instagram ${social.keyword} enquiry`).run();
  }

  await env.DB.prepare("UPDATE social_leads SET whatsapp_phone=?,lead_id=?,interested_area=COALESCE(?,interested_area),assigned_to=COALESCE(?,assigned_to),status='Number Captured',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(phone,lead.id,finalArea,finalAssigned,social.id).run();
  await env.DB.prepare("INSERT INTO social_lead_events(social_lead_id,event_type,event_payload) VALUES(?,?,?)").bind(social.id,'whatsapp_number_captured',JSON.stringify({lead_id:lead.id,manual:!!body.manual})).run();
  return {ok:true,social_lead_id:social.id,lead_id:lead.id,area:finalArea,keyword:social.keyword,assigned_to:finalAssigned};
}

async function manualCapture(request,env){
  const session=await supervisorSession(request,env);
  if(!session)return json({error:'Session expired',expired:true},401,env);
  if(session.forbidden)return json({error:'Supervisor access required'},403,env);
  const body=await request.json().catch(()=>({}));
  const message=String(body.message||'');
  const token=(message.match(/\b[A-F0-9]{18}\b/i)||[])[0]||String(body.prefill_token||'').trim();
  const result=await captureInboundWhatsApp(env,{phone:body.phone,name:body.name||'',prefill_token:token,area:body.area||'',message,manual:true});
  if(result.ok){
    await env.DB.prepare("INSERT INTO social_lead_events(social_lead_id,event_type,event_payload) VALUES(?,?,?)").bind(result.social_lead_id,'manual_whatsapp_capture',JSON.stringify({captured_by:session.user_label})).run();
  }
  return json(result,result.status||200,env);
}

export default {async fetch(request,env,ctx){
  const path=new URL(request.url).pathname.replace(/\/$/,'')||'/';
  if(request.method==='OPTIONS'&&path.startsWith('/api/social/whatsapp/'))return new Response(null,{status:204,headers:{'access-control-allow-origin':ORIGIN(env),'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'86400'}});
  if(request.method==='POST'&&path==='/api/social/whatsapp/inbound'){
    const body=await request.json().catch(()=>({}));
    const result=await captureInboundWhatsApp(env,body);
    return json(result,result.status||200,env);
  }
  if(request.method==='POST'&&path==='/api/social/whatsapp/manual-capture')return manualCapture(request,env);
  return baseWorker.fetch(request,env,ctx);
}};
