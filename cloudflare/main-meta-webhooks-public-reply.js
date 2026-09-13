import baseWorker from './main-meta-webhooks.js';
import { detectSocialKeyword } from './social-keywords.js';

const INSTAGRAM_PUBLIC_REPLY='Property details sent to your DM. If it appears in Requests, please tap Accept.';
const FACEBOOK_PUBLIC_REPLY='Property details sent to your Messenger. If it appears in Message Requests, please tap Accept.';

function apiVersion(rawValue='v26.0'){
  const raw=String(rawValue||'v26.0').replace(/^\/+|\/+$/g,'');
  return raw.startsWith('v')?raw:`v${raw}`;
}

function instagramVersion(env){return apiVersion(env.INSTAGRAM_API_VERSION||'v26.0');}
function facebookVersion(env){return apiVersion(env.FACEBOOK_API_VERSION||'v26.0');}

function propertyDetailsLink(env,token){
  const base=String(env.PROPERTY_DETAILS_URL||'https://britsingh20-source.github.io/coimbatore-3d-property-map/property-details.html').trim();
  const url=new URL(base);
  url.searchParams.set('ref',token);
  return url.toString();
}

function makeToken(){return crypto.randomUUID().replace(/-/g,'').slice(0,18).toUpperCase();}

async function ensurePublicReplyTable(env){
  if(!env.DB)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_public_replies (
    platform TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    public_status TEXT NOT NULL DEFAULT 'pending',
    private_status TEXT NOT NULL DEFAULT 'pending',
    error_text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(platform,comment_id)
  )`).run();
}

async function replyState(env,platform,commentId){
  if(!env.DB)return null;
  await ensurePublicReplyTable(env);
  return env.DB.prepare('SELECT public_status,private_status FROM social_public_replies WHERE platform=? AND comment_id=? LIMIT 1').bind(platform,commentId).first();
}

async function markReply(env,platform,commentId,kind,status,errorText=''){
  if(!env.DB)return;
  await ensurePublicReplyTable(env);
  const row=await env.DB.prepare('SELECT public_status,private_status FROM social_public_replies WHERE platform=? AND comment_id=?').bind(platform,commentId).first();
  const publicStatus=kind==='public'?status:(row?.public_status||'pending');
  const privateStatus=kind==='private'?status:(row?.private_status||'pending');
  await env.DB.prepare(`INSERT INTO social_public_replies(platform,comment_id,public_status,private_status,error_text)
    VALUES(?,?,?,?,?)
    ON CONFLICT(platform,comment_id) DO UPDATE SET public_status=excluded.public_status,private_status=excluded.private_status,error_text=excluded.error_text,updated_at=CURRENT_TIMESTAMP`)
    .bind(platform,commentId,publicStatus,privateStatus,errorText||null).run();
}

async function logSocialEvent(env,socialLeadId,eventType,payload){
  if(!env.DB||!socialLeadId)return;
  await env.DB.prepare('INSERT INTO social_lead_events(social_lead_id,event_type,event_payload) VALUES(?,?,?)').bind(socialLeadId,eventType,JSON.stringify(payload||{})).run();
}

async function sendInstagramPublicReply(env,commentId){
  commentId=String(commentId||'').trim();
  if(!commentId||!env.INSTAGRAM_ACCESS_TOKEN)return {sent:false,skipped:true};
  const state=await replyState(env,'instagram',commentId);
  if(state?.public_status==='sent')return {sent:false,skipped:true};
  const url=`https://graph.instagram.com/${instagramVersion(env)}/${encodeURIComponent(commentId)}/replies`;
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`},body:JSON.stringify({message:INSTAGRAM_PUBLIC_REPLY})});
  const body=await response.json().catch(()=>({}));
  if(response.ok){await markReply(env,'instagram',commentId,'public','sent','');return {sent:true,id:body.id||null};}
  const error=String(body?.error?.message||`HTTP ${response.status}`).slice(0,500);
  await markReply(env,'instagram',commentId,'public','failed',error);
  console.log('Instagram public AREA reply failed',commentId,response.status,error);
  return {sent:false,status:response.status,error};
}

function instagramAreaCommentIds(payload){
  const ids=[];
  if(payload?.object!=='instagram')return ids;
  for(const entry of payload.entry||[]){
    const changes=[];
    if(entry?.field)changes.push({field:entry.field,value:entry.value||{}});
    for(const change of entry?.changes||[])changes.push(change);
    for(const change of changes){
      if(change?.field!=='comments')continue;
      const value=change.value||{};
      const match=detectSocialKeyword(String(value.text||''));
      if(match?.keyword!=='AREA')continue;
      const id=String(value.id||'').trim();
      if(id)ids.push(id);
    }
  }
  return [...new Set(ids)];
}

function facebookAreaComments(payload,env){
  const out=[];
  if(payload?.object!=='page')return out;
  for(const entry of payload.entry||[]){
    const pageId=String(entry?.id||'').trim();
    if(env.FACEBOOK_PAGE_ID&&pageId&&String(env.FACEBOOK_PAGE_ID)!==pageId)continue;
    for(const change of entry?.changes||[]){
      if(change?.field!=='feed')continue;
      const value=change.value||{};
      if(String(value.item||'').toLowerCase()!=='comment')continue;
      if(String(value.verb||'add').toLowerCase()!=='add')continue;
      const text=String(value.message||'');
      const match=detectSocialKeyword(text);
      if(match?.keyword!=='AREA')continue;
      const commentId=String(value.comment_id||value.id||'').trim();
      const platformUserId=String(value.from?.id||value.sender_id||commentId).trim();
      if(!commentId||!platformUserId)continue;
      out.push({page_id:pageId,platform_user_id:platformUserId,username:String(value.from?.name||''),source_type:'comment',media_id:String(value.post_id||value.parent_id||''),comment_id:commentId,text});
    }
  }
  return out;
}

async function intakeFacebookArea(env,event){
  if(!env.DB)return null;
  let existing=await env.DB.prepare(`SELECT id,whatsapp_prefill_token FROM social_leads WHERE platform='facebook' AND source_comment_id=? ORDER BY id DESC LIMIT 1`).bind(event.comment_id).first();
  if(existing)return {social_lead_id:existing.id,whatsapp_prefill_token:existing.whatsapp_prefill_token,created:false};
  const token=makeToken();
  const row=await env.DB.prepare(`INSERT INTO social_leads(platform,platform_user_id,platform_username,source_type,source_media_id,source_comment_id,keyword,interested_area,original_text,whatsapp_prefill_token,assigned_to,status) VALUES('facebook',?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(event.platform_user_id,event.username||null,'comment',event.media_id||null,event.comment_id,'AREA',null,event.text||null,token,null,'Area Selection Pending').first();
  await logSocialEvent(env,row.id,'facebook_keyword_detected',{source_type:'comment',media_id:event.media_id||null,comment_id:event.comment_id,keyword:'AREA'});
  return {social_lead_id:row.id,whatsapp_prefill_token:token,created:true};
}

async function facebookGraphPost(env,path,payload){
  if(!env.FACEBOOK_PAGE_ACCESS_TOKEN)return {ok:false,status:0,body:{error:{message:'FACEBOOK_PAGE_ACCESS_TOKEN unavailable'}}};
  const url=`https://graph.facebook.com/${facebookVersion(env)}/${path.replace(/^\//,'')}`;
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${env.FACEBOOK_PAGE_ACCESS_TOKEN}`},body:JSON.stringify(payload)});
  const body=await response.json().catch(()=>({}));
  return {ok:response.ok,status:response.status,body};
}

async function sendFacebookPublicReply(env,event,intake){
  const state=await replyState(env,'facebook',event.comment_id);
  if(state?.public_status==='sent')return {sent:false,skipped:true};
  const result=await facebookGraphPost(env,`${encodeURIComponent(event.comment_id)}/comments`,{message:FACEBOOK_PUBLIC_REPLY});
  if(result.ok){
    await markReply(env,'facebook',event.comment_id,'public','sent','');
    await logSocialEvent(env,intake?.social_lead_id,'facebook_public_reply_sent',{comment_id:event.comment_id,reply_id:result.body?.id||null});
    return {sent:true,id:result.body?.id||null};
  }
  const error=String(result.body?.error?.message||`HTTP ${result.status}`).slice(0,500);
  await markReply(env,'facebook',event.comment_id,'public','failed',error);
  await logSocialEvent(env,intake?.social_lead_id,'facebook_public_reply_failed',{comment_id:event.comment_id,status:result.status,error});
  return {sent:false,status:result.status,error};
}

async function sendFacebookPrivateReply(env,event,intake){
  const state=await replyState(env,'facebook',event.comment_id);
  if(state?.private_status==='sent')return {sent:false,skipped:true};
  const link=propertyDetailsLink(env,intake.whatsapp_prefill_token);
  const result=await facebookGraphPost(env,`${encodeURIComponent(event.comment_id)}/private_replies`,{message:`For property details,\n${link}`});
  if(result.ok){
    await markReply(env,'facebook',event.comment_id,'private','sent','');
    await env.DB.prepare("UPDATE social_leads SET status='Property Details Link Sent',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(intake.social_lead_id).run();
    await logSocialEvent(env,intake.social_lead_id,'facebook_property_details_link_sent',{comment_id:event.comment_id,message_id:result.body?.id||result.body?.message_id||null});
    return {sent:true,id:result.body?.id||result.body?.message_id||null};
  }
  const error=String(result.body?.error?.message||`HTTP ${result.status}`).slice(0,500);
  await markReply(env,'facebook',event.comment_id,'private','failed',error);
  await logSocialEvent(env,intake.social_lead_id,'facebook_property_details_link_failed',{comment_id:event.comment_id,status:result.status,error});
  return {sent:false,status:result.status,error};
}

async function processFacebookAreaComment(env,event){
  if(!env.FACEBOOK_PAGE_ACCESS_TOKEN)return {processed:false,reason:'Facebook Page token unavailable'};
  const intake=await intakeFacebookArea(env,event);
  if(!intake)return {processed:false,reason:'Database unavailable'};
  const [publicReply,privateReply]=await Promise.all([
    sendFacebookPublicReply(env,event,intake),
    sendFacebookPrivateReply(env,event,intake)
  ]);
  return {processed:true,intake,public_reply:publicReply,private_reply:privateReply};
}

async function pollPublicAreaReplies(env){
  if(!env.INSTAGRAM_ACCESS_TOKEN)return;
  try{
    const meUrl=new URL('https://graph.instagram.com/me');
    meUrl.searchParams.set('fields','id,user_id,account_type');
    meUrl.searchParams.set('access_token',env.INSTAGRAM_ACCESS_TOKEN);
    const meRes=await fetch(meUrl);
    const me=await meRes.json().catch(()=>({}));
    if(!meRes.ok)return;
    const accountId=String(me.user_id||me.id||'');
    if(!accountId)return;
    const mediaUrl=new URL(`https://graph.instagram.com/${instagramVersion(env)}/${encodeURIComponent(accountId)}/media`);
    mediaUrl.searchParams.set('fields','id,timestamp,comments.limit(100){id,text,timestamp,from}');
    mediaUrl.searchParams.set('limit','25');
    mediaUrl.searchParams.set('access_token',env.INSTAGRAM_ACCESS_TOKEN);
    const mediaRes=await fetch(mediaUrl);
    const media=await mediaRes.json().catch(()=>({}));
    if(!mediaRes.ok)return;
    const cutoff=Date.now()-15*60*1000;
    for(const item of media.data||[]){
      for(const comment of item?.comments?.data||[]){
        const ts=Date.parse(comment?.timestamp||'');
        if(!Number.isFinite(ts)||ts<cutoff)continue;
        if(String(comment?.from?.id||'')===accountId)continue;
        const match=detectSocialKeyword(String(comment?.text||''));
        if(match?.keyword!=='AREA')continue;
        await sendInstagramPublicReply(env,comment?.id);
      }
    }
  }catch(error){console.log('Instagram public reply poll failed',error?.message||error);}
}

const worker={
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const isMetaWebhook=request.method==='POST'&&url.pathname.replace(/\/$/,'')==='/webhooks/meta';
    let payloadPromise=null;
    if(isMetaWebhook)payloadPromise=request.clone().json().catch(()=>null);
    const response=await baseWorker.fetch(request,env,ctx);
    if(payloadPromise){
      const payload=await payloadPromise;
      const instagramIds=instagramAreaCommentIds(payload);
      if(instagramIds.length)ctx.waitUntil(Promise.all(instagramIds.map(id=>sendInstagramPublicReply(env,id))));
      const facebookEvents=facebookAreaComments(payload,env);
      if(facebookEvents.length)ctx.waitUntil(Promise.all(facebookEvents.map(event=>processFacebookAreaComment(env,event))));
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof baseWorker.scheduled==='function')await baseWorker.scheduled(controller,env,ctx);
    ctx.waitUntil(pollPublicAreaReplies(env));
  }
};

export default worker;
