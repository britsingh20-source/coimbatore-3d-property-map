import baseWorker from "./main-with-hours.js";

const ORIGIN = env => env.FRONTEND_ORIGIN || "https://britsingh20-source.github.io";
const json = (data,status=200,env={}) => new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN(env),"cache-control":"no-store"}});
const bearer = request => { const v=request.headers.get("authorization")||""; return v.startsWith("Bearer ")?v.slice(7):""; };

function norm(value="") {
  return String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"").trim();
}
function levenshtein(a,b){
  a=norm(a);b=norm(b);if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let prev=row[0];row[0]=i;
    for(let j=1;j<=b.length;j++){
      const old=row[j],cost=a[i-1]===b[j-1]?0:1;
      row[j]=Math.min(row[j]+1,row[j-1]+1,prev+cost);prev=old;
    }
  }
  return row[b.length];
}
function priorityFor(distance,config){
  if(distance==null||!Number.isFinite(Number(distance)))return null;
  const d=Number(distance);
  if(d<=Number(config.p1_max_km))return "P1";
  if(d<=Number(config.p2_max_km))return "P2";
  if(d<=Number(config.p3_max_km))return "P3";
  return "P4";
}
function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371,rad=x=>x*Math.PI/180,dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
async function config(env){return await env.DB.prepare("SELECT * FROM area_priority_config WHERE id=1").first();}
async function masters(env){return (await env.DB.prepare("SELECT * FROM area_master WHERE active=1 ORDER BY canonical_name").all()).results||[];}
async function resolveArea(env,text){
  const q=norm(text);if(!q)return null;const rows=await masters(env);let best=null,bestScore=999;
  for(const row of rows){
    const candidates=[row.canonical_name,row.code];
    try{candidates.push(...JSON.parse(row.aliases||"[]"));}catch(_){}
    for(const c of candidates){
      const n=norm(c);if(!n)continue;
      if(n===q)return row;
      if(n.startsWith(q)||q.startsWith(n)){const score=Math.abs(n.length-q.length)+0.25;if(score<bestScore){best=row;bestScore=score;}}
      const d=levenshtein(n,q);const allowed=q.length<=5?1:q.length<=10?2:3;
      if(d<=allowed&&d<bestScore){best=row;bestScore=d;}
    }
  }
  return best;
}
async function areaResponse(env){
  const cfg=await config(env);
  const rows=(await env.DB.prepare(`SELECT m.code,m.canonical_name AS name,m.zone,m.aliases,m.latitude,m.longitude,m.distance_from_idigarai_km,m.priority_band,
    COUNT(l.id) total,
    SUM(CASE WHEN l.status='Hot' THEN 1 ELSE 0 END) hot,
    SUM(CASE WHEN l.status='Follow-up' THEN 1 ELSE 0 END) follow_up,
    SUM(CASE WHEN l.status IN ('Uncalled','No Response','Busy','Needs Review') THEN 1 ELSE 0 END) uncalled
    FROM area_master m LEFT JOIN leads l ON l.area_code=m.code
    WHERE m.active=1 GROUP BY m.code ORDER BY m.canonical_name`).all()).results||[];
  for(const row of rows){
    row.priority_band=priorityFor(row.distance_from_idigarai_km,cfg)||row.priority_band||null;
    try{row.aliases=JSON.parse(row.aliases||"[]");}catch(_){row.aliases=[];}
  }
  return {areas:rows,priority_config:cfg};
}
async function setCoordinate(request,env){
  if(!env.IMPORT_TOKEN||bearer(request)!==env.IMPORT_TOKEN)return json({error:"Unauthorized"},401,env);
  const body=await request.json(),code=String(body.code||"").trim().toUpperCase(),lat=Number(body.latitude),lon=Number(body.longitude);
  if(!code||!Number.isFinite(lat)||!Number.isFinite(lon))return json({error:"code, latitude and longitude are required"},400,env);
  const cfg=await config(env),distance=+haversineKm(cfg.reference_latitude,cfg.reference_longitude,lat,lon).toFixed(2),priority=priorityFor(distance,cfg);
  const row=await env.DB.prepare("UPDATE area_master SET latitude=?,longitude=?,distance_from_idigarai_km=?,priority_band=?,updated_at=CURRENT_TIMESTAMP WHERE code=? RETURNING *").bind(lat,lon,distance,priority,code).first();
  if(!row)return json({error:"Unknown area code"},404,env);
  return json({ok:true,area:row},200,env);
}

export default {async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,"")||"/";
  if(request.method==="OPTIONS")return baseWorker.fetch(request,env,ctx);
  if(request.method==="GET"&&path==="/api/areas")return json(await areaResponse(env),200,env);
  if(request.method==="GET"&&path==="/api/areas/resolve"){
    const text=url.searchParams.get("q")||"",area=await resolveArea(env,text),cfg=await config(env);
    return json({query:text,match:area?{...area,priority_band:priorityFor(area.distance_from_idigarai_km,cfg)||area.priority_band||null}:null},200,env);
  }
  if(request.method==="POST"&&path==="/api/admin/areas/set-coordinate")return setCoordinate(request,env);

  const complete=path.match(/^\/api\/leads\/(\d+)\/complete-call$/);
  if(request.method==="POST"&&complete){
    const body=await request.clone().json().catch(()=>null);
    if(body&&body.area_text&&!body.area_code){
      const match=await resolveArea(env,body.area_text);
      if(match)body.area_code=match.code;
      const forwarded=new Request(request.url,{method:request.method,headers:request.headers,body:JSON.stringify(body)});
      return baseWorker.fetch(forwarded,env,ctx);
    }
  }
  return baseWorker.fetch(request,env,ctx);
}};
