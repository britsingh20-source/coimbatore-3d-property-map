import baseWorker from "./main-daily-import.js";

const ORIGIN = env => env.FRONTEND_ORIGIN || "https://britsingh20-source.github.io";
const json = (data,status=200,env={}) => new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN(env),"cache-control":"no-store"}});
const bearer = request => { const v=request.headers.get("authorization")||""; return v.startsWith("Bearer ")?v.slice(7):""; };
const SUPERVISORS = new Set(["Manager 1","Manager 2","Administrator","Director"]);
const TELECALLERS = ["Telecaller 1","Telecaller 2"];

async function supervisorSession(request,env){
  const token=bearer(request);if(!token)return null;
  const row=await env.DB.prepare("SELECT user_label,last_activity_at,active FROM telecaller_sessions WHERE token=? AND active=1").bind(token).first();
  if(!row)return null;
  const last=Date.parse(String(row.last_activity_at||"").replace(" ","T")+"Z");
  if(!Number.isFinite(last)||Date.now()-last>10*60*1000)return null;
  if(!SUPERVISORS.has(row.user_label))return {forbidden:true,user_label:row.user_label};
  await env.DB.prepare("UPDATE telecaller_sessions SET last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(token).run();
  return row;
}

function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));}
function todayIST(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}

async function performance(request,env){
  const session=await supervisorSession(request,env);
  if(!session)return json({error:"Session expired",expired:true},401,env);
  if(session.forbidden)return json({error:"Supervisor access required"},403,env);
  const url=new URL(request.url);
  const date=validDate(url.searchParams.get("date"))?url.searchParams.get("date"):todayIST();

  const rows=(await env.DB.prepare(`SELECT
      a.id AS activity_id,a.lead_id,a.activity_type,a.caller,a.status,a.area_code,a.notes,a.requirement,a.follow_up_at,a.created_at,
      l.phone,l.display_phone,l.name,l.area_text,l.property_type,l.budget,l.lead_code
    FROM lead_activity a
    JOIN leads l ON l.id=a.lead_id
    WHERE a.caller IN ('Telecaller 1','Telecaller 2')
      AND date(datetime(a.created_at,'+5 hours','+30 minutes'))=?
      AND a.activity_type IN ('call_completed','retry_scheduled')
    ORDER BY a.created_at DESC,a.id DESC`).bind(date).all()).results||[];

  const output=TELECALLERS.map(caller=>{
    const activities=rows.filter(r=>r.caller===caller).map(r=>({
      ...r,
      phone:r.display_phone||r.phone||"",
      spoken: r.activity_type==='call_completed' && !['No Response','Busy','Wrong Number'].includes(String(r.status||''))
    }));
    const uniqueAll=new Set(activities.map(a=>String(a.phone||'')).filter(Boolean));
    const spoken=activities.filter(a=>a.spoken);
    const uniqueSpoken=new Set(spoken.map(a=>String(a.phone||'')).filter(Boolean));
    const countStatus=s=>activities.filter(a=>String(a.status||'')===s).length;
    return {
      caller,date,
      call_attempts:activities.length,
      unique_customers_handled:uniqueAll.size,
      spoken_calls:spoken.length,
      unique_customers_spoken:uniqueSpoken.size,
      no_response:countStatus('No Response'),
      busy:countStatus('Busy'),
      hot:countStatus('Hot'),
      follow_up:countStatus('Follow-up'),
      site_visit:countStatus('Site Visit'),
      closed:countStatus('Closed'),
      activities
    };
  });
  return json({ok:true,date,viewer:session.user_label,telecallers:output},200,env);
}

export default {async fetch(request,env,ctx){
  const path=new URL(request.url).pathname.replace(/\/$/,"")||"/";
  if(request.method==="OPTIONS"&&path==="/api/supervisor/telecaller-performance")return new Response(null,{headers:{"access-control-allow-origin":ORIGIN(env),"access-control-allow-methods":"GET,OPTIONS","access-control-allow-headers":"content-type,authorization","access-control-max-age":"86400"}});
  if(request.method==="GET"&&path==="/api/supervisor/telecaller-performance")return performance(request,env);
  return baseWorker.fetch(request,env,ctx);
}};
