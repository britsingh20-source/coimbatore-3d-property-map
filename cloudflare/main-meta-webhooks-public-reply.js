import baseWorker from './main-meta-webhooks.js';
import { detectSocialKeyword } from './social-keywords.js';

const PUBLIC_REPLY='Property details sent to your DM. If it appears in Requests, please tap Accept.';

function version(env){
  const raw=String(env.INSTAGRAM_API_VERSION||'v26.0').replace(/^\/+|\/+$/g,'');
  return raw.startsWith('v')?raw:`v${raw}`;
}

async function ensureReplyTable(env){
  if(!env.DB)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS instagram_public_replies (
    comment_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    error_text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function alreadyHandled(env,commentId){
  if(!env.DB)return false;
  await ensureReplyTable(env);
  const row=await env.DB.prepare('SELECT status FROM instagram_public_replies WHERE comment_id=? LIMIT 1').bind(commentId).first();
  return row?.status==='sent';
}

async function markReply(env,commentId,status,errorText=''){
  if(!env.DB)return;
  await ensureReplyTable(env);
  await env.DB.prepare(`INSERT INTO instagram_public_replies(comment_id,status,error_text)
    VALUES(?,?,?)
    ON CONFLICT(comment_id) DO UPDATE SET status=excluded.status,error_text=excluded.error_text,updated_at=CURRENT_TIMESTAMP`)
    .bind(commentId,status,errorText||null).run();
}

async function sendPublicReply(env,commentId){
  commentId=String(commentId||'').trim();
  if(!commentId||!env.INSTAGRAM_ACCESS_TOKEN)return {sent:false,skipped:true};
  if(await alreadyHandled(env,commentId))return {sent:false,skipped:true};

  const url=`https://graph.instagram.com/${version(env)}/${encodeURIComponent(commentId)}/replies`;
  const response=await fetch(url,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization':`Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`
    },
    body:JSON.stringify({message:PUBLIC_REPLY})
  });
  const body=await response.json().catch(()=>({}));
  if(response.ok){
    await markReply(env,commentId,'sent','');
    return {sent:true,id:body.id||null};
  }
  const error=String(body?.error?.message||`HTTP ${response.status}`).slice(0,500);
  await markReply(env,commentId,'failed',error);
  console.log('Instagram public AREA reply failed',commentId,response.status,error);
  return {sent:false,status:response.status,error};
}

function areaCommentIds(payload){
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

    const mediaUrl=new URL(`https://graph.instagram.com/${version(env)}/${encodeURIComponent(accountId)}/media`);
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
        await sendPublicReply(env,comment?.id);
      }
    }
  }catch(error){
    console.log('Instagram public reply poll failed',error?.message||error);
  }
}

const worker={
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const isMetaWebhook=request.method==='POST'&&url.pathname.replace(/\/$/,'')==='/webhooks/meta';
    let payloadPromise=null;
    if(isMetaWebhook){
      payloadPromise=request.clone().json().catch(()=>null);
    }

    const response=await baseWorker.fetch(request,env,ctx);

    if(payloadPromise){
      const payload=await payloadPromise;
      const ids=areaCommentIds(payload);
      if(ids.length){
        ctx.waitUntil(Promise.all(ids.map(id=>sendPublicReply(env,id))));
      }
    }
    return response;
  },

  async scheduled(controller,env,ctx){
    if(typeof baseWorker.scheduled==='function'){
      await baseWorker.scheduled(controller,env,ctx);
    }
    ctx.waitUntil(pollPublicAreaReplies(env));
  }
};

export default worker;
