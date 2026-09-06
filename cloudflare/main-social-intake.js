import baseWorker from './main-property-catalog.js';
import { detectSocialKeyword, AREA_OPTIONS } from './social-keywords.js';

const ORIGIN = env => env.FRONTEND_ORIGIN || 'https://britsingh20-source.github.io';
const corsHeaders = env => ({
  'access-control-allow-origin': ORIGIN(env),
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store'
});
const json = (data,status=200,env={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...corsHeaders(env)}});

function makeToken(){
  return crypto.randomUUID().replace(/-/g,'').slice(0,18).toUpperCase();
}

function areaOption(value=''){
  const wanted=String(value||'').trim().toUpperCase().replace(/[^A-Z]/g,'');
  for(const [keyword,area,assignedTo] of AREA_OPTIONS){
    if(wanted===keyword||wanted===String(area).toUpperCase().replace(/[^A-Z]/g,''))return {keyword,area,assignedTo};
  }
  return null;
}

function whatsappUrl(env,area,token){
  const number=String(env.WHATSAPP_LEAD_NUMBER||'918148127587').replace(/\D/g,'');
  const message=`Hi, I need property details in ${area}. Ref: ${token}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

async function intakeInstagram(env,body){
  const match=detectSocialKeyword(body.text||body.keyword||'');
  if(!match)return {ignored:true,reason:'No configured social CTA detected'};
  const platformUserId=String(body.platform_user_id||'').trim();
  if(!platformUserId)return {error:'platform_user_id required',status:422};
  const mediaId=String(body.media_id||'').trim()||null;
  const sourceType=String(body.source_type||'comment');
  const commentId=String(body.comment_id||'').trim()||null;

  let existing=null;
  if(sourceType==='comment'&&commentId){
    existing=await env.DB.prepare(`SELECT id,whatsapp_prefill_token,assigned_to,interested_area FROM social_leads WHERE platform='instagram' AND source_comment_id=? ORDER BY id DESC LIMIT 1`).bind(commentId).first();
    if(!existing){
      existing=await env.DB.prepare(`SELECT id,whatsapp_prefill_token,assigned_to,interested_area FROM social_leads WHERE platform='instagram' AND platform_user_id=? AND COALESCE(source_media_id,'')=COALESCE(?, '') AND keyword=? ORDER BY id DESC LIMIT 1`).bind(platformUserId,mediaId,match.keyword).first();
    }
  }else{
    existing=await env.DB.prepare(`SELECT id,whatsapp_prefill_token,assigned_to,interested_area FROM social_leads WHERE platform='instagram' AND platform_user_id=? AND COALESCE(source_media_id,'')=COALESCE(?, '') AND keyword=? ORDER BY id DESC LIMIT 1`).bind(platformUserId,mediaId,match.keyword).first();
  }
  if(existing)return {ok:true,created:false,social_lead_id:existing.id,keyword:match.keyword,area:existing.interested_area||match.area,assigned_to:existing.assigned_to||match.assignedTo,whatsapp_prefill_token:existing.whatsapp_prefill_token,intent:match.intent||null};

  const token=makeToken();
  const status=match.keyword==='AREA'?'Area Selection Pending':'WhatsApp Pending';
  const row=await env.DB.prepare(`INSERT INTO social_leads(platform,platform_user_id,platform_username,source_type,source_media_id,source_comment_id,keyword,interested_area,original_text,whatsapp_prefill_token,assigned_to,status) VALUES('instagram',?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(platformUserId,String(body.username||'')||null,sourceType,mediaId,commentId,match.keyword,match.area||null,String(body.text||'')||null,token,match.assignedTo||null,status).first();
  await env.DB.prepare("INSERT INTO social_lead_events(social_lead_id,event_type,event_payload) VALUES(?,?,?)").bind(row.id,'instagram_keyword_detected',JSON.stringify({source_type:sourceType,media_id:mediaId,comment_id:commentId,keyword:match.keyword,intent:match.intent||null})).run();
  return {ok:true,created:true,social_lead_id:row.id,keyword:match.keyword,area:match.area,assigned_to:match.assignedTo,whatsapp_prefill_token:token,intent:match.intent||null};
}

async function selectAreaFromLanding(env,body){
  const token=String(body.ref||body.token||'').trim().toUpperCase();
  const selection=areaOption(body.area||'');
  if(!/^[A-F0-9]{18}$/.test(token))return {error:'Invalid enquiry reference',status:422};
  if(!selection)return {error:'Invalid area',status:422};

  const lead=await env.DB.prepare(`SELECT id,status FROM social_leads WHERE whatsapp_prefill_token=? ORDER BY id DESC LIMIT 1`).bind(token).first();
  if(!lead)return {error:'Enquiry reference not found',status:404};

  await env.DB.prepare(`UPDATE social_leads SET interested_area=?,assigned_to=?,status='Area Selected - WhatsApp Opening',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(selection.area,selection.assignedTo||null,lead.id).run();
  await env.DB.prepare("INSERT INTO social_lead_events(social_lead_id,event_type,event_payload) VALUES(?,?,?)").bind(lead.id,'landing_area_selected',JSON.stringify({area:selection.area,keyword:selection.keyword})).run();

  return {ok:true,social_lead_id:lead.id,area:selection.area,status:'Area Selected - WhatsApp Opening',whatsapp_url:whatsappUrl(env,selection.area,token)};
}

async function summary(env){
  const totals=await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='WhatsApp Pending' THEN 1 ELSE 0 END) whatsapp_pending,SUM(CASE WHEN status='Area Selection Pending' THEN 1 ELSE 0 END) area_selection_pending,SUM(CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) linked_to_crm FROM social_leads`).first();
  const byKeyword=(await env.DB.prepare("SELECT keyword,interested_area,COUNT(*) count FROM social_leads GROUP BY keyword,interested_area ORDER BY count DESC").all()).results||[];
  return {ok:true,totals,by_keyword:byKeyword};
}

export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  const path=url.pathname.replace(/\/$/,'')||'/';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(env)});
  if(request.method==='POST'&&path==='/api/social/instagram/intake'){
    const body=await request.json().catch(()=>({}));
    const result=await intakeInstagram(env,body);
    return json(result,result.status||200,env);
  }
  if(request.method==='POST'&&path==='/api/social/area/select'){
    const body=await request.json().catch(()=>({}));
    const result=await selectAreaFromLanding(env,body);
    return json(result,result.status||200,env);
  }
  if(request.method==='GET'&&path==='/api/social/area/go'){
    const result=await selectAreaFromLanding(env,{ref:url.searchParams.get('ref'),area:url.searchParams.get('area')});
    if(!result.ok)return new Response(result.error||'Unable to continue',{status:result.status||400,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
    return Response.redirect(result.whatsapp_url,302);
  }
  if(request.method==='GET'&&path==='/api/social/summary')return json(await summary(env),200,env);
  return baseWorker.fetch(request,env,ctx);
}};
