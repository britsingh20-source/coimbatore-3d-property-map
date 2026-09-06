import baseWorker from './main-whatsapp-capture.js';
import { detectSocialKeyword, AREA_OPTIONS, areaByPayload } from './social-keywords.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

async function hmacHex(secret,text){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function safeEqual(a,b){
  if(a.length!==b.length)return false;
  let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;
}

async function verifiedBody(request,env){
  const raw=await request.text();
  if(env.META_APP_SECRET){
    const supplied=(request.headers.get('x-hub-signature-256')||'').replace(/^sha256=/,'');
    if(!supplied)return {error:'Missing Meta signature',status:401};
    const expected=await hmacHex(env.META_APP_SECRET,raw);
    if(!safeEqual(supplied,expected))return {error:'Invalid Meta signature',status:401};
  }
  try{return {body:JSON.parse(raw)}}catch{return {error:'Invalid JSON',status:400}}
}

function entryChanges(entry){
  const changes=[];
  if(entry?.field)changes.push({field:entry.field,value:entry.value||{}});
  for(const change of entry?.changes||[])changes.push(change);
  return changes;
}

async function recordWebhookReceipt(env,payload){
  if(!env.DB)return;
  const objectType=String(payload?.object||'unknown').slice(0,80);
  const fields=[];
  for(const entry of payload?.entry||[]){
    for(const change of entryChanges(entry)){
      const field=String(change?.field||'unknown').slice(0,80);
      if(field)fields.push(field);
    }
    if(Array.isArray(entry?.messaging)&&entry.messaging.length)fields.push('messages');
  }
  const unique=[...new Set(fields.length?fields:['unknown'])].slice(0,20);
  for(const field of unique){
    await env.DB.prepare('INSERT INTO meta_webhook_receipts(object_type,field_name) VALUES(?,?)').bind(objectType,field).run();
  }
}

function instagramEvents(payload){
  const out=[];
  for(const entry of payload.entry||[]){
    const professionalAccountId=String(entry.id||'');
    for(const change of entryChanges(entry)){
      if(change.field!=='comments')continue;
      const v=change.value||{},text=String(v.text||'');
      const match=detectSocialKeyword(text);if(!match)continue;
      const username=String(v.from?.username||'');
      out.push({professional_account_id:professionalAccountId,platform_user_id:String(v.from?.id||username||v.id||''),username,source_type:'comment',media_id:String(v.media?.id||v.media_id||''),comment_id:String(v.id||''),text,quick_reply_payload:''});
    }
    for(const msg of entry.messaging||[]){
      const text=String(msg.message?.text||'').trim();
      const quickReplyPayload=String(msg.message?.quick_reply?.payload||'').trim();
      if(!text&&!quickReplyPayload)continue;
      out.push({professional_account_id:professionalAccountId,platform_user_id:String(msg.sender?.id||''),username:'',source_type:'dm',media_id:'',comment_id:'',text,quick_reply_payload:quickReplyPayload});
    }
  }
  return out.filter(x=>x.platform_user_id);
}

function whatsappEvents(payload){
  const out=[];
  for(const entry of payload.entry||[])for(const change of entryChanges(entry)){
    const value=change.value||{};if(!Array.isArray(value.messages))continue;
    const contacts=new Map((value.contacts||[]).map(c=>[String(c.wa_id||''),c.profile?.name||'']));
    for(const msg of value.messages){
      if(msg.type!=='text')continue;
      const body=String(msg.text?.body||'');
      const token=(body.match(/\b[A-F0-9]{18}\b/i)||[])[0];
      if(!token)continue;
      out.push({phone:String(msg.from||''),name:contacts.get(String(msg.from||''))||'',prefill_token:token.toUpperCase()});
    }
  }
  return out;
}

async function forward(request,path,payload,env,ctx){
  const url=new URL(request.url);url.pathname=path;
  return baseWorker.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),env,ctx);
}

function whatsappLink(env,keyword,token){
  const number=String(env.WHATSAPP_LEAD_NUMBER||'918148127587').replace(/\D/g,'');
  if(!number)return null;
  const message=`${keyword} property enquiry from Instagram. Ref: ${token}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

async function logSocialEvent(env,socialLeadId,eventType,payload){
  if(!socialLeadId)return;
  await env.DB.prepare('INSERT INTO social_lead_events(social_lead_id,event_type,event_payload) VALUES(?,?,?)').bind(socialLeadId,eventType,JSON.stringify(payload||{})).run();
}

async function commentReplyAlreadySent(env,socialLeadId,commentId){
  if(!socialLeadId||!commentId)return false;
  const needle=`%${String(commentId).replace(/[%_]/g,'')}%`;
  const row=await env.DB.prepare("SELECT 1 AS sent FROM social_lead_events WHERE social_lead_id=? AND event_type IN ('instagram_private_reply_sent','instagram_area_menu_sent') AND COALESCE(event_payload,'') LIKE ? LIMIT 1").bind(socialLeadId,needle).first();
  return !!row;
}

function instagramEndpoint(env,professionalAccountId){
  const prefix=env.INSTAGRAM_API_VERSION?`${env.INSTAGRAM_API_VERSION.replace(/^\/+|\/+$/g,'')}/`:'';
  return `https://graph.instagram.com/${prefix}${encodeURIComponent(professionalAccountId)}/messages`;
}

async function postInstagramMessage(env,professionalAccountId,payload){
  const response=await fetch(instagramEndpoint(env,professionalAccountId),{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`},body:JSON.stringify(payload)});
  const body=await response.json().catch(()=>({}));
  return {ok:response.ok,status:response.status,body};
}

function areaQuickReplies(){
  return AREA_OPTIONS.slice(0,13).map(([keyword,area])=>({content_type:'text',title:area,payload:`AREA:${keyword}`}));
}

async function sendInstagramAreaMenu(env,event,intake){
  if(event.source_type!=='comment'||!event.comment_id||!event.professional_account_id)return {sent:false,reason:'Not a comment event'};
  if(!env.INSTAGRAM_ACCESS_TOKEN)return {sent:false,reason:'Instagram access token unavailable'};
  if(await commentReplyAlreadySent(env,intake.social_lead_id,event.comment_id))return {sent:false,skipped:true,reason:'This comment was already answered'};
  const payload={recipient:{comment_id:event.comment_id},message:{text:'Choose the area you are looking for:',quick_replies:areaQuickReplies()}};
  const result=await postInstagramMessage(env,event.professional_account_id,payload);
  if(!result.ok){
    await logSocialEvent(env,intake.social_lead_id,'instagram_area_menu_failed',{status:result.status,error:result.body?.error?.message||'Instagram API error',comment_id:event.comment_id});
    return {sent:false,status:result.status,error:result.body?.error?.message||'Instagram API error'};
  }
  await env.DB.prepare("UPDATE social_leads SET status='Area Selection Pending',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(intake.social_lead_id).run();
  await logSocialEvent(env,intake.social_lead_id,'instagram_area_menu_sent',{message_id:result.body.message_id||null,comment_id:event.comment_id});
  return {sent:true,message_id:result.body.message_id||null};
}

async function sendInstagramPrivateReply(env,event,intake){
  if(intake.keyword==='AREA')return sendInstagramAreaMenu(env,event,intake);
  if(event.source_type!=='comment'||!event.comment_id||!event.professional_account_id)return {sent:false,reason:'Not a comment event'};
  if(!env.INSTAGRAM_ACCESS_TOKEN)return {sent:false,reason:'Instagram access token unavailable'};
  if(await commentReplyAlreadySent(env,intake.social_lead_id,event.comment_id))return {sent:false,skipped:true,reason:'This comment was already answered'};
  const text=`Thanks for your interest in ${intake.area} properties. Reply WHATSAPP to this message and we will send you a tappable WhatsApp button.`;
  const result=await postInstagramMessage(env,event.professional_account_id,{recipient:{comment_id:event.comment_id},message:{text}});
  if(!result.ok){
    await logSocialEvent(env,intake.social_lead_id,'instagram_private_reply_failed',{status:result.status,error:result.body?.error?.message||'Instagram API error',comment_id:event.comment_id});
    return {sent:false,status:result.status,error:result.body?.error?.message||'Instagram API error'};
  }
  await env.DB.prepare("UPDATE social_leads SET status='Instagram Reply Requested',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(intake.social_lead_id).run();
  await logSocialEvent(env,intake.social_lead_id,'instagram_private_reply_sent',{message_id:result.body.message_id||null,comment_id:event.comment_id});
  return {sent:true,message_id:result.body.message_id||null};
}

async function latestInstagramLead(env,platformUserId){
  return env.DB.prepare(`SELECT id AS social_lead_id,keyword,interested_area AS area,whatsapp_prefill_token,status,assigned_to FROM social_leads WHERE platform='instagram' AND platform_user_id=? ORDER BY id DESC LIMIT 1`).bind(platformUserId).first();
}

async function sendPhoneNumberRequest(env,event,intake){
  const payload={recipient:{id:event.platform_user_id},message:{text:`Great. You selected ${intake.area}. Tap your phone number below so we can send matching properties and save your enquiry.`,quick_replies:[{content_type:'user_phone_number'}]}};
  const result=await postInstagramMessage(env,event.professional_account_id,payload);
  if(!result.ok){
    await logSocialEvent(env,intake.social_lead_id,'instagram_phone_request_failed',{status:result.status,error:result.body?.error?.message||'Instagram API error'});
    return {sent:false,status:result.status,error:result.body?.error?.message||'Instagram API error'};
  }
  await env.DB.prepare("UPDATE social_leads SET status='Phone Requested',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(intake.social_lead_id).run();
  await logSocialEvent(env,intake.social_lead_id,'instagram_phone_requested',{message_id:result.body.message_id||null});
  return {sent:true,message_id:result.body.message_id||null};
}

async function applyAreaSelection(env,event,intake,selection){
  await env.DB.prepare("UPDATE social_leads SET interested_area=?,assigned_to=?,status='Area Selected',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(selection.area,selection.assignedTo||null,intake.social_lead_id).run();
  await logSocialEvent(env,intake.social_lead_id,'instagram_area_selected',{area:selection.area,keyword:selection.keyword});
  const updated={...intake,area:selection.area,assigned_to:selection.assignedTo||null};
  return sendPhoneNumberRequest(env,event,updated);
}

function phoneFromInstagramEvent(event){
  const candidates=[event.quick_reply_payload,event.text];
  for(const value of candidates){
    const digits=String(value||'').replace(/\D/g,'');
    if(digits.length===10)return digits;
    if(digits.length===12&&digits.startsWith('91'))return digits.slice(2);
  }
  return null;
}

async function captureInstagramPhone(request,event,env,ctx,intake,phone){
  const response=await forward(request,'/api/social/whatsapp/inbound',{phone,name:'',prefill_token:intake.whatsapp_prefill_token},env,ctx);
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body?.ok){
    await logSocialEvent(env,intake.social_lead_id,'instagram_phone_capture_failed',{status:response.status});
    return {sent:false,status:response.status,error:'Unable to merge phone into CRM'};
  }
  await logSocialEvent(env,intake.social_lead_id,'instagram_phone_captured',{lead_id:body.lead_id});
  const result=await postInstagramMessage(env,event.professional_account_id,{recipient:{id:event.platform_user_id},message:{text:`Thank you. Your ${body.area||intake.area||'property'} enquiry is registered. Our team can now follow up with you.`}});
  return {sent:result.ok,captured:true,lead_id:body.lead_id};
}

async function sendInstagramWhatsAppButton(env,event,intake){
  if(event.source_type!=='dm'||!event.professional_account_id||!event.platform_user_id)return {sent:false,reason:'Not a DM event'};
  if(!env.INSTAGRAM_ACCESS_TOKEN)return {sent:false,reason:'Instagram access token unavailable'};
  const link=whatsappLink(env,intake.keyword,intake.whatsapp_prefill_token);
  if(!link)return {sent:false,reason:'WhatsApp lead number unavailable'};
  const payload={recipient:{id:event.platform_user_id},message:{attachment:{type:'template',payload:{template_type:'button',text:`Continue your ${intake.area||'property'} enquiry on WhatsApp.`,buttons:[{type:'web_url',url:link,title:'Open WhatsApp'}]}}}};
  const result=await postInstagramMessage(env,event.professional_account_id,payload);
  if(!result.ok){
    await logSocialEvent(env,intake.social_lead_id,'instagram_whatsapp_button_failed',{status:result.status,error:result.body?.error?.message||'Instagram API error'});
    return {sent:false,status:result.status,error:result.body?.error?.message||'Instagram API error'};
  }
  await env.DB.prepare("UPDATE social_leads SET status='WhatsApp Link Sent',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(intake.social_lead_id).run();
  await logSocialEvent(env,intake.social_lead_id,'instagram_whatsapp_button_sent',{message_id:result.body.message_id||null});
  return {sent:true,message_id:result.body.message_id||null};
}

async function processInstagramEvent(request,event,env,ctx){
  if(event.source_type==='comment'){
    const r=await forward(request,'/api/social/instagram/intake',event,env,ctx);
    if(!r.ok)return {processed:false,ignored:true};
    const intake=await r.json().catch(()=>null);
    if(!intake?.ok)return {processed:false,ignored:true};
    const reply=await sendInstagramPrivateReply(env,event,intake);
    return {processed:true,intake,reply};
  }

  if(event.source_type==='dm'){
    let intake=await latestInstagramLead(env,event.platform_user_id);
    const selection=areaByPayload(event.quick_reply_payload||'');
    if(selection&&intake){
      const reply=await applyAreaSelection(env,event,intake,selection);
      return {processed:true,intake,reply};
    }

    const phone=phoneFromInstagramEvent(event);
    if(phone&&intake&&String(intake.status||'').toLowerCase().includes('phone')){
      const reply=await captureInstagramPhone(request,event,env,ctx,intake,phone);
      return {processed:true,intake,reply};
    }

    const keywordMatch=detectSocialKeyword(event.text||'');
    const wantsWhatsApp=/\bWHATSAPP\b/i.test(event.text||'');
    if(!intake&&keywordMatch){
      const r=await forward(request,'/api/social/instagram/intake',event,env,ctx);
      if(r.ok)intake=await r.json().catch(()=>null);
    }
    if(!intake)return {processed:false,ignored:true};
    if(keywordMatch?.keyword==='AREA'){
      const payload={recipient:{id:event.platform_user_id},message:{text:'Choose the area you are looking for:',quick_replies:areaQuickReplies()}};
      const result=await postInstagramMessage(env,event.professional_account_id,payload);
      return {processed:true,intake,reply:{sent:result.ok,status:result.status}};
    }
    if(!wantsWhatsApp&&!keywordMatch)return {processed:false,ignored:true};
    const reply=await sendInstagramWhatsAppButton(env,event,intake);
    return {processed:true,intake,reply};
  }

  return {processed:false,ignored:true};
}

async function pollInstagramComments(env,ctx){
  if(!env.INSTAGRAM_ACCESS_TOKEN||!env.DB)return {ok:false,reason:'Instagram polling unavailable'};
  const meUrl=new URL('https://graph.instagram.com/me');
  meUrl.searchParams.set('fields','id,user_id,account_type');
  meUrl.searchParams.set('access_token',env.INSTAGRAM_ACCESS_TOKEN);
  const meRes=await fetch(meUrl);
  const me=await meRes.json().catch(()=>({}));
  if(!meRes.ok)return {ok:false,reason:'Unable to resolve Instagram account'};
  const accountId=String(me.user_id||me.id||'');
  if(!accountId)return {ok:false,reason:'Instagram account id unavailable'};

  const mediaUrl=new URL(`https://graph.instagram.com/v26.0/${encodeURIComponent(accountId)}/media`);
  mediaUrl.searchParams.set('fields','id,timestamp,comments.limit(100){id,text,timestamp,from}');
  mediaUrl.searchParams.set('limit','25');
  mediaUrl.searchParams.set('access_token',env.INSTAGRAM_ACCESS_TOKEN);
  const mediaRes=await fetch(mediaUrl);
  const mediaBody=await mediaRes.json().catch(()=>({}));
  if(!mediaRes.ok)return {ok:false,reason:'Unable to read Instagram comments'};

  const cutoff=Date.now()-15*60*1000;
  let matched=0,processed=0,repliesSent=0,replyFailures=0;
  const syntheticRequest=new Request('https://coimbatore-lead-crm-api.internal/poll');
  for(const media of mediaBody.data||[]){
    for(const comment of media?.comments?.data||[]){
      const ts=Date.parse(comment?.timestamp||'');
      if(!Number.isFinite(ts)||ts<cutoff)continue;
      const text=String(comment?.text||'');
      if(!detectSocialKeyword(text))continue;
      const username=String(comment?.from?.username||'');
      const platformUserId=String(comment?.from?.id||username||comment?.id||'');
      if(!platformUserId||platformUserId===accountId)continue;
      matched++;
      const event={professional_account_id:accountId,platform_user_id:platformUserId,username,source_type:'comment',media_id:String(media?.id||''),comment_id:String(comment?.id||''),text,quick_reply_payload:''};
      try{
        const result=await processInstagramEvent(syntheticRequest,event,env,ctx);
        if(!result.processed)continue;
        processed++;
        if(result.reply?.sent)repliesSent++;
        else if(!result.reply?.skipped)replyFailures++;
      }catch(e){
        replyFailures++;
        console.log('Instagram polling event failed',e?.message||e);
      }
    }
  }
  console.log('Instagram polling complete',JSON.stringify({matched,processed,repliesSent,replyFailures}));
  return {ok:true,matched,processed,replies_sent:repliesSent,reply_failures:replyFailures};
}

const worker={
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'')||'/';
    if(request.method==='GET'&&path==='/webhooks/meta'){
      if(url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==env.META_WEBHOOK_VERIFY_TOKEN)return new Response('Forbidden',{status:403});
      return new Response(url.searchParams.get('hub.challenge')||'',{status:200});
    }
    if(request.method==='POST'&&path==='/webhooks/meta'){
      const checked=await verifiedBody(request,env);if(checked.error)return json({error:checked.error},checked.status);
      const payload=checked.body;
      try{await recordWebhookReceipt(env,payload)}catch(e){console.log('webhook receipt diagnostic failed',e?.message||e)}
      let processed=0,ignored=0,repliesSent=0,replyFailures=0;
      if(payload.object==='instagram'){
        const events=instagramEvents(payload);
        for(const event of events){
          const result=await processInstagramEvent(request,event,env,ctx);
          if(!result.processed){ignored++;continue;}
          processed++;
          if(result.reply?.sent)repliesSent++;
          else if(!result.reply?.skipped)replyFailures++;
        }
      }else if(payload.object==='whatsapp_business_account'){
        const events=whatsappEvents(payload);for(const event of events){const r=await forward(request,'/api/social/whatsapp/inbound',event,env,ctx);if(r.ok)processed++;else ignored++;}
      }
      return json({ok:true,processed,ignored,replies_sent:repliesSent,reply_failures:replyFailures});
    }
    return baseWorker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){ctx.waitUntil(pollInstagramComments(env,ctx));}
};

export default worker;
