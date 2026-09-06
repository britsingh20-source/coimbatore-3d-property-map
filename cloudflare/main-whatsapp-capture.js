import baseWorker from './main-social-intake.js';

const ORIGIN = env => env.FRONTEND_ORIGIN || 'https://britsingh20-source.github.io';
const json = (data,status=200,env={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':ORIGIN(env),'cache-control':'no-store'}});

function normalizeIndianPhone(value=''){
  const digits=String(value).replace(/\D/g,'');
  if(digits.length===12&&digits.startsWith('91'))return digits.slice(2);
  if(digits.length===10)return digits;
  return null;
}

async function captureInboundWhatsApp(env,body){
  const phone=normalizeIndianPhone(body.phone);
  if(!phone)return {error:'Valid Indian WhatsApp number required',status:422};
  const prefill=String(body.prefill_token||'').trim().toUpperCase();
  if(!prefill)return {error:'prefill_token required',status:422};
  const social=await env.DB.prepare("SELECT * FROM social_leads WHERE whatsapp_prefill_token=? LIMIT 1").bind(prefill).first();
  if(!social)return {error:'Social lead token not found',status:404};

  let lead=await env.DB.prepare("SELECT * FROM leads WHERE phone=? LIMIT 1").bind(phone).first();
  if(!lead){
    lead=await env.DB.prepare(`INSERT INTO leads(phone,display_phone,name,status,source,first_received_at,last_received_at,notes,date_precision,transcription_review,pipeline_stage,contact_complete,telecaller_assigned_to) VALUES(?,?,?,'Uncalled','Instagram -> WhatsApp',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,'exact',0,'incoming',1,?) RETURNING *`).bind(phone,`+91 ${phone}`,String(body.name||'')||null,`Inbound WhatsApp after Instagram keyword ${social.keyword}; Area ${social.interested_area}`,social.assigned_to||null).first();
    await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'social_whatsapp_capture', 'System', ?)").bind(lead.id,`Inbound WhatsApp captured after Instagram ${social.keyword} enquiry`).run();
  }else{
    await env.DB.prepare("UPDATE leads SET last_received_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(lead.id).run();
    await env.DB.prepare("INSERT INTO lead_activity(lead_id,activity_type,caller,notes) VALUES(?, 'social_whatsapp_merge', 'System', ?)").bind(lead.id,`Existing CRM lead matched to inbound Instagram ${social.keyword} enquiry`).run();
  }

  await env.DB.prepare("UPDATE social_leads SET whatsapp_phone=?,lead_id=?,status='Number Captured',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(phone,lead.id,social.id).run();
  await env.DB.prepare("INSERT INTO social_lead_events(social_lead_id,event_type,event_payload) VALUES(?,?,?)").bind(social.id,'whatsapp_number_captured',JSON.stringify({lead_id:lead.id})).run();
  return {ok:true,social_lead_id:social.id,lead_id:lead.id,area:social.interested_area,keyword:social.keyword,assigned_to:social.assigned_to};
}

export default {async fetch(request,env,ctx){
  const path=new URL(request.url).pathname.replace(/\/$/,'')||'/';
  if(request.method==='POST'&&path==='/api/social/whatsapp/inbound'){
    const body=await request.json().catch(()=>({}));
    const result=await captureInboundWhatsApp(env,body);
    return json(result,result.status||200,env);
  }
  return baseWorker.fetch(request,env,ctx);
}};
