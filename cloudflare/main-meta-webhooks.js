import baseWorker from './main-whatsapp-capture.js';
import { detectSocialKeyword } from './social-keywords.js';

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

function instagramEvents(payload){
  const out=[];
  for(const entry of payload.entry||[]){
    for(const change of entry.changes||[]){
      if(change.field!=='comments')continue;
      const v=change.value||{},text=String(v.text||'');
      const match=detectSocialKeyword(text);if(!match)continue;
      out.push({
        platform_user_id:String(v.from?.id||''),username:String(v.from?.username||''),
        source_type:'comment',media_id:String(v.media?.id||v.media_id||''),comment_id:String(v.id||''),text
      });
    }
    for(const msg of entry.messaging||[]){
      const text=String(msg.message?.text||'');const match=detectSocialKeyword(text);if(!match)continue;
      out.push({platform_user_id:String(msg.sender?.id||''),username:'',source_type:'dm',media_id:'',comment_id:'',text});
    }
  }
  return out.filter(x=>x.platform_user_id);
}

function whatsappEvents(payload){
  const out=[];
  for(const entry of payload.entry||[])for(const change of entry.changes||[]){
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

export default {async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'')||'/';
  if(request.method==='GET'&&path==='/webhooks/meta'){
    if(url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==env.META_WEBHOOK_VERIFY_TOKEN)return new Response('Forbidden',{status:403});
    return new Response(url.searchParams.get('hub.challenge')||'',{status:200});
  }
  if(request.method==='POST'&&path==='/webhooks/meta'){
    const checked=await verifiedBody(request,env);if(checked.error)return json({error:checked.error},checked.status);
    const payload=checked.body;
    let processed=0,ignored=0;
    if(payload.object==='instagram'){
      const events=instagramEvents(payload);for(const event of events){const r=await forward(request,'/api/social/instagram/intake',event,env,ctx);if(r.ok)processed++;else ignored++;}
    }else if(payload.object==='whatsapp_business_account'){
      const events=whatsappEvents(payload);for(const event of events){const r=await forward(request,'/api/social/whatsapp/inbound',event,env,ctx);if(r.ok)processed++;else ignored++;}
    }
    return json({ok:true,processed,ignored});
  }
  return baseWorker.fetch(request,env,ctx);
}};
