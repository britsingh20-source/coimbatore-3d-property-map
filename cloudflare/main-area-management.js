import baseWorker from "./main-area-priority.js";

const ORIGIN = env => env.FRONTEND_ORIGIN || "https://britsingh20-source.github.io";
const json = (data,status=200,env={}) => new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN(env),"cache-control":"no-store"}});
const bearer = request => { const v=request.headers.get("authorization")||""; return v.startsWith("Bearer ")?v.slice(7):""; };

async function activeSession(request,env){
  const token=bearer(request);if(!token)return null;
  const row=await env.DB.prepare("SELECT user_label,last_activity_at,active FROM telecaller_sessions WHERE token=? AND active=1").bind(token).first();
  if(!row)return null;
  await env.DB.prepare("UPDATE telecaller_sessions SET last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(token).run();
  return row;
}

function cleanCode(value){return String(value||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");}
function cleanName(value){return String(value||"").trim().replace(/\s+/g," ");}

async function addArea(request,env){
  const session=await activeSession(request,env);
  if(!session)return json({error:"Session expired",expired:true},401,env);
  if(!["Administrator","Director"].includes(session.user_label))return json({error:"Only Administrator or Director can add a new area"},403,env);

  const body=await request.json().catch(()=>({}));
  const code=cleanCode(body.code),name=cleanName(body.name);
  const aliases=Array.isArray(body.aliases)?body.aliases.map(cleanName).filter(Boolean):String(body.aliases||"").split(",").map(cleanName).filter(Boolean);
  if(!/^[A-Z0-9]{2,5}$/.test(code))return json({error:"Area code must be 2–5 uppercase letters/numbers"},422,env);
  if(name.length<2||name.length>80)return json({error:"Enter a valid area name"},422,env);

  const duplicate=await env.DB.prepare("SELECT code,canonical_name,active FROM area_master WHERE code=? OR lower(canonical_name)=lower(?) LIMIT 1").bind(code,name).first();
  if(duplicate){
    if(Number(duplicate.active)===0){
      await env.DB.prepare("UPDATE area_master SET active=1,updated_at=CURRENT_TIMESTAMP WHERE code=?").bind(duplicate.code).run();
      return json({ok:true,reactivated:true,area:{code:duplicate.code,name:duplicate.canonical_name}},200,env);
    }
    return json({error:`Area already exists as ${duplicate.canonical_name} (${duplicate.code})`},409,env);
  }

  await env.DB.prepare(`INSERT INTO area_master(code,canonical_name,zone,aliases,active)
    VALUES(?,?,?,?,1)`).bind(code,name,"Manual",JSON.stringify(aliases)).run();
  await env.DB.prepare("INSERT OR IGNORE INTO areas(code,name) VALUES(?,?)").bind(code,name).run();
  await env.DB.prepare("INSERT OR IGNORE INTO area_counters(area_code,last_number) VALUES(?,0)").bind(code).run();

  return json({ok:true,created:true,area:{code,name,aliases,priority_band:null,distance_from_idigarai_km:null}},201,env);
}

export default {async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,"")||"/";
  if(request.method==="POST"&&path==="/api/admin/areas")return addArea(request,env);
  return baseWorker.fetch(request,env,ctx);
}};
