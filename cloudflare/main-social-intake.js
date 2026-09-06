import baseWorker from './main-property-catalog.js';
import { detectSocialKeyword } from './social-keywords.js';

const ORIGIN = env => env.FRONTEND_ORIGIN || 'https://britsingh20-source.github.io';
const json = (data,status=200,env={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':ORIGIN(env),'cache-control':'no-store'}});

function makeToken(){
  return crypto.randomUUID().replace(/-/g,'').slice(0,18).toUpperCase();
}

async function intakeInstagram(env,body){
  const match=detectSocialKeyword(body.text||body.keyword||'');
  if(!match)return {ignored:true,reason:'No configured locality keyword detected'};
  const platformUserId=String(body.platform_user_id||'').trim();
  if(!platformUserId)return {error:'platform_user_id required',status:422};
  const mediaId=String(body.media_id||'').trim()||null;
  const existing=await env.DB.prepare(`SELECT id,whatsapp_prefill_token,assigned_to FROM social_leads WHERE platform='instagram' AND platform_user_id=? AND COALESCE(source_media_id,'')=COALESCE(?, '') AND keyword=? ORDER BY id DESC LIMIT 1`).bind(platformUserId,mediaId,match.keyword).first();
  if(existing)return {ok:true,created:false,social_lead_id:existing.id,keyword:match.keyword,area:match.area,assigned_to:existing.assigned_to||match.assignedTo,whatsapp_prefill_token:existing.whatsapp_prefill_token};
  const token=makeToken();
  const row=await env.DB.prepare(`INSERT INTO social_leads(platform,platform_user_id,platform_username,source_type,source_media_id,source_comment_id,keyword,interested_area,original_text,whatsapp_prefill_token,assigned_to,status) VALUES('instagram',?,?,?,?,?,?,?,?,?,?,'WhatsApp Pending') RETURNING id`).bind(platformUserId,String(body.username||'')||null,String(body.source_type||'comment'),mediaId,String(body.comment_id||'')||null,match.keyword,match.area,String(body.text||'')||null,token,match.assignedTo||null).first();
  await env.DB.prepare("INSERT INTO social_lead_events(social_lead_id,event_type,event_payload) VALUES(?,?,?)").bind(row.id,'instagram_keyword_detected',JSON.stringify({source_type:body.source_type||'comment',media_id:mediaId,comment_id:body.comment_id||null,keyword:match.keyword})).run();
  return {ok:true,created:true,social_lead_id:row.id,keyword:match.keyword,area:match.area,assigned_to:match.assignedTo,whatsapp_prefill_token:token};
}

async function summary(env){
  const totals=await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='WhatsApp Pending' THEN 1 ELSE 0 END) whatsapp_pending,SUM(CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) linked_to_crm FROM social_leads`).first();
  const byKeyword=(await env.DB.prepare("SELECT keyword,interested_area,COUNT(*) count FROM social_leads GROUP BY keyword,interested_area ORDER BY count DESC").all()).results||[];
  return {ok:true,totals,by_keyword:byKeyword};
}

export default {async fetch(request,env,ctx){
  const path=new URL(request.url).pathname.replace(/\/$/,'')||'/';
  if(request.method==='POST'&&path==='/api/social/instagram/intake'){
    const body=await request.json().catch(()=>({}));
    const result=await intakeInstagram(env,body);
    return json(result,result.status||200,env);
  }
  if(request.method==='GET'&&path==='/api/social/summary')return json(await summary(env),200,env);
  return baseWorker.fetch(request,env,ctx);
}};
