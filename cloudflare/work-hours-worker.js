const ORIGIN = "https://britsingh20-source.github.io";
const STAFF = {
  "Telecaller 1": { employee_id:"TC01", role:"telecaller" },
  "Telecaller 2": { employee_id:"TC02", role:"telecaller" },
  "Manager 1": { employee_id:"MG01", role:"manager" },
  "Manager 2": { employee_id:"MG02", role:"manager" },
  "Administrator": { employee_id:"AD01", role:"administrator" },
  "Director": { employee_id:"DR01", role:"director" }
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN}});
const bearer=req=>{const v=req.headers.get("authorization")||"";return v.startsWith("Bearer ")?v.slice(7):"";};
const IST=330*60*1000;
const parseDb=v=>{if(!v)return NaN;const s=String(v);return Date.parse(s.includes("T")?s:s.replace(" ","T")+"Z");};
const dateKeyIST=ms=>new Date(ms+IST).toISOString().slice(0,10);
const nextIstMidnightUTC=ms=>{const shifted=new Date(ms+IST);return Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate()+1)-IST;};
function monthBounds(month){
  if(!/^\d{4}-\d{2}$/.test(month))return null;
  const [y,m]=month.split("-").map(Number);if(m<1||m>12)return null;
  return {start:Date.UTC(y,m-1,1)-IST,end:Date.UTC(y,m,1)-IST};
}
async function sessionFor(req,env){
  const token=bearer(req);if(!token)return null;
  const row=await env.DB.prepare("SELECT * FROM telecaller_sessions WHERE token=? AND active=1").bind(token).first();
  if(!row)return null;
  const staff=STAFF[row.user_label];return staff?{...row,...staff}:null;
}
function effectiveEnd(row,now){
  const login=parseDb(row.login_at);let end=row.logout_at?parseDb(row.logout_at):now;
  const last=parseDb(row.last_activity_at);
  if(Number.isFinite(last))end=Math.min(end,last+10*60*1000);
  if(!Number.isFinite(end)||end<login)end=login;
  return end;
}
function splitIntoDays(row,bounds,now){
  let start=Math.max(parseDb(row.login_at),bounds.start);let end=Math.min(effectiveEnd(row,now),bounds.end);
  const out=[];if(!Number.isFinite(start)||end<=start)return out;
  while(start<end){const next=Math.min(end,nextIstMidnightUTC(start));out.push({date:dateKeyIST(start),ms:next-start});start=next;}
  return out;
}
export default {async fetch(req,env){
  if(req.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":ORIGIN,"access-control-allow-methods":"GET,OPTIONS","access-control-allow-headers":"content-type,authorization"}});
  const url=new URL(req.url);
  if(req.method==="GET"&&url.pathname==="/api/health")return json({ok:true,service:"work-hours"});
  if(req.method!=="GET"||url.pathname!=="/api/work-hours")return json({error:"Not found"},404);
  const viewer=await sessionFor(req,env);if(!viewer)return json({error:"Session expired"},401);
  const now=Date.now();const currentMonth=dateKeyIST(now).slice(0,7);const month=url.searchParams.get("month")||currentMonth;const bounds=monthBounds(month);if(!bounds)return json({error:"Invalid month"},400);
  const rows=(await env.DB.prepare("SELECT user_label,login_at,last_activity_at,logout_at,active FROM telecaller_sessions WHERE login_at < ? AND COALESCE(logout_at,last_activity_at) >= ? ORDER BY login_at").bind(new Date(bounds.end).toISOString(),new Date(bounds.start-10*60*1000).toISOString()).all()).results||[];
  const labels=(viewer.role==="telecaller")?[viewer.user_label]:Object.keys(STAFF);
  const staff=labels.map(label=>({user_label:label,...STAFF[label],daily:{},total_ms:0,days_worked:0,average_ms:0,today_ms:0}));
  const byLabel=Object.fromEntries(staff.map(x=>[x.user_label,x]));
  for(const row of rows){const target=byLabel[row.user_label];if(!target)continue;for(const part of splitIntoDays(row,bounds,now)){target.daily[part.date]=(target.daily[part.date]||0)+part.ms;target.total_ms+=part.ms;}}
  const today=dateKeyIST(now);
  for(const s of staff){const vals=Object.values(s.daily);s.days_worked=vals.filter(v=>v>0).length;s.average_ms=s.days_worked?Math.round(s.total_ms/s.days_worked):0;s.today_ms=s.daily[today]||0;s.total_hours=+(s.total_ms/3600000).toFixed(2);s.average_hours=+(s.average_ms/3600000).toFixed(2);s.today_hours=+(s.today_ms/3600000).toFixed(2);s.daily=Object.fromEntries(Object.entries(s.daily).map(([d,ms])=>[d,+((ms||0)/3600000).toFixed(2)]));}
  return json({ok:true,month,today,viewer:{user_label:viewer.user_label,employee_id:viewer.employee_id,role:viewer.role},staff});
}};
