import baseWorker from './main-with-hours.js';

const STAFF={
  'Telecaller 1':{employee_id:'TC01',role:'telecaller'},
  'Telecaller 2':{employee_id:'TC02',role:'telecaller'},
  'Manager 1':{employee_id:'MG01',role:'manager'},
  'Manager 2':{employee_id:'MG02',role:'manager'},
  'Administrator':{employee_id:'AD01',role:'administrator'},
  'Director':{employee_id:'DR01',role:'director'}
};
const IST=330*60*1000;
const ORIGIN=env=>env.FRONTEND_ORIGIN||'https://britsingh20-source.github.io';
const json=(data,status=200,env={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':ORIGIN(env),'cache-control':'no-store'}});
const bearer=req=>{const v=req.headers.get('authorization')||'';return v.startsWith('Bearer ')?v.slice(7):'';};
const parseDb=v=>{if(!v)return NaN;const s=String(v);return Date.parse(s.includes('T')?s:s.replace(' ','T')+'Z');};
const dateKey=ms=>new Date(ms+IST).toISOString().slice(0,10);
const nextMidnight=ms=>{const d=new Date(ms+IST);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1)-IST;};
function monthBounds(month){if(!/^\d{4}-\d{2}$/.test(month||''))return null;const [y,m]=month.split('-').map(Number);if(m<1||m>12)return null;return{start:Date.UTC(y,m-1,1)-IST,end:Date.UTC(y,m,1)-IST};}
async function viewer(req,env){const t=bearer(req);if(!t)return null;const row=await env.DB.prepare("SELECT user_label FROM telecaller_sessions WHERE token=? AND active=1").bind(t).first();if(!row||!STAFF[row.user_label])return null;return{user_label:row.user_label,...STAFF[row.user_label]};}
function split(row,bounds,now){let start=Math.max(parseDb(row.login_at),bounds.start);let end=row.active?now:parseDb(row.logout_at||row.last_activity_at);end=Math.min(Number.isFinite(end)?end:start,bounds.end);const out=[];while(Number.isFinite(start)&&end>start){const next=Math.min(end,nextMidnight(start));out.push({date:dateKey(start),ms:next-start});start=next;}return out;}
async function report(req,env){
  const who=await viewer(req,env);if(!who)return json({error:'Session expired',expired:true},401,env);
  const url=new URL(req.url),now=Date.now(),month=url.searchParams.get('month')||dateKey(now).slice(0,7),bounds=monthBounds(month);if(!bounds)return json({error:'Invalid month'},400,env);
  const sessions=(await env.DB.prepare("SELECT user_label,login_at,last_activity_at,logout_at,active FROM telecaller_sessions ORDER BY login_at").all()).results||[];
  const labels=who.role==='telecaller'?[who.user_label]:Object.keys(STAFF);
  const staff=labels.map(label=>({user_label:label,...STAFF[label],daily:{},total_ms:0,days_worked:0,total_calls:0,spoken_calls:0,last_activity_at:null}));
  const by=Object.fromEntries(staff.map(x=>[x.user_label,x]));
  for(const row of sessions){const target=by[row.user_label];if(!target)continue;for(const part of split(row,bounds,now)){target.daily[part.date]=(target.daily[part.date]||0)+part.ms;target.total_ms+=part.ms;}if(row.last_activity_at&&(!target.last_activity_at||String(row.last_activity_at)>String(target.last_activity_at)))target.last_activity_at=row.last_activity_at;}
  const activity=(await env.DB.prepare(`SELECT caller,COUNT(*) AS attempts,SUM(CASE WHEN status NOT IN ('No Response','Busy','Wrong Number') THEN 1 ELSE 0 END) AS spoken FROM lead_activity WHERE caller IN ('Telecaller 1','Telecaller 2') AND activity_type IN ('call_completed','retry_scheduled') AND date(datetime(created_at,'+5 hours','+30 minutes'))>=? AND date(datetime(created_at,'+5 hours','+30 minutes'))<? GROUP BY caller`).bind(dateKey(bounds.start),dateKey(bounds.end)).all()).results||[];
  for(const row of activity){const target=by[row.caller];if(target){target.total_calls=Number(row.attempts||0);target.spoken_calls=Number(row.spoken||0);}}
  const today=dateKey(now);
  for(const item of staff){const vals=Object.values(item.daily);item.days_worked=vals.filter(v=>v>0).length;item.total_hours=+(item.total_ms/3600000).toFixed(2);item.average_hours=item.days_worked?+(item.total_hours/item.days_worked).toFixed(2):0;item.today_hours=+((item.daily[today]||0)/3600000).toFixed(2);item.daily=Object.fromEntries(Object.entries(item.daily).map(([d,ms])=>[d,+(ms/3600000).toFixed(2)]));delete item.total_ms;}
  return json({ok:true,month,today,viewer:who,staff},200,env);
}
export default{async fetch(req,env,ctx){const path=new URL(req.url).pathname.replace(/\/$/,'')||'/';if(req.method==='OPTIONS'&&path==='/api/work-hours')return new Response(null,{status:204,headers:{'access-control-allow-origin':ORIGIN(env),'access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type,authorization'}});if(req.method==='GET'&&path==='/api/work-hours')return report(req,env);return baseWorker.fetch(req,env,ctx);}};
