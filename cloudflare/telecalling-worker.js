import appHtml from '../public/telecalling.html';
import appJs from '../public/telecalling-app.js';

const INTEREST=['Not assessed','Interested','Not interested','Undecided'];
const TEMPERATURE=['Unclassified','Hot','Warm','Cold'];
const STATUS=['New','Not contacted','Contacted','Callback','Site visit scheduled','Site visitor','Site visit cancelled','No response','Wrong number','Booked','Closed'];
const FIELDS=['interest','temperature','status','visit','callback','notes'];
const ORIGIN='https://britsingh20-source.github.io';
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':ORIGIN,'vary':'Origin','x-content-type-options':'nosniff'}})}
function cleanLead(row){const {change_id,...lead}=row;return {...lead,date:row.date_label};}
async function viewer(request,env){
 const auth=request.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))return null;
 return env.DB.prepare(`SELECT c.employee_id,c.user_label FROM telecaller_sessions s JOIN telecaller_credentials c ON c.user_label=s.user_label WHERE s.token=? AND s.active=1 AND c.active=1 AND c.employee_id IN ('DR01','TC01')`).bind(auth.slice(7)).first();
}
async function body(request){if(Number(request.headers.get('content-length')||0)>16000)throw new Error('too_large');const text=await request.text();if(text.length>16000)throw new Error('too_large');return JSON.parse(text)}
function validate(patch){
 if(!Number.isInteger(patch.version)||patch.version<0)return 'Reload the contact before saving.';
 for(const [key,values] of [['interest',INTEREST],['temperature',TEMPERATURE],['status',STATUS]])if(key in patch&&!values.includes(patch[key]))return 'Invalid '+key;
 for(const key of ['visit','callback'])if(key in patch&&(typeof patch[key]!=='string'||(patch[key]&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(patch[key])||isNaN(Date.parse(patch[key]))))))return 'Invalid '+key+' date';
 if('notes' in patch&&(typeof patch.notes!=='string'||patch.notes.length>6000))return 'Notes must be under 6000 characters';
 if(Object.keys(patch).some(k=>!FIELDS.includes(k)&&k!=='version'))return 'Unsupported field';
 return null;
}
export {validate};
export default {async fetch(request,env){
 const path=new URL(request.url).pathname.replace(/\/$/,'')||'/';
 if(request.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'600'}});
 if(request.method==='GET'&&(path==='/'||path==='/telecalling.html'))return new Response(appHtml,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY'}});
 if(request.method==='GET'&&path==='/telecalling-app.js')return new Response(appJs,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'}});
 if(path==='/api/health')return response({ok:true,service:'shared-telecalling',storage:'D1',shared:true});
 try{
  if(path==='/api/login'&&request.method==='POST'){
   const input=await body(request);if(!['DR01','TC01'].includes(input.employee_id))return response({error:'Use Director (DR01) or Telecaller 1 (TC01).'},403);
   const upstream=await env.CRM.fetch(new Request('https://crm.internal/api/session/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({employee_id:input.employee_id,pin:input.pin})}));
   return response(await upstream.json(),upstream.status);
  }
  const user=await viewer(request,env);if(!user)return response({error:'Sign in with your CRM employee ID and PIN.'},401);
  if(path==='/api/me')return response({user});
  if(path==='/api/logout'&&request.method==='POST'){
   await env.DB.prepare('UPDATE telecaller_sessions SET active=0,logout_at=CURRENT_TIMESTAMP WHERE token=?').bind(request.headers.get('authorization').slice(7)).run();return response({ok:true});
  }
  if(path==='/api/leads'&&request.method==='GET'){
   const rows=await env.DB.prepare('SELECT * FROM pocket_leads WHERE (?=\'DR01\' OR assigned_to=?) ORDER BY CAST(id AS INTEGER)').bind(user.employee_id,user.employee_id).all();
   return response({leads:rows.results.map(cleanLead),user,server_time:new Date().toISOString()});
  }
  const match=path.match(/^\/api\/leads\/(\d+)(\/history)?$/);
  if(match){
   const lead=await env.DB.prepare('SELECT * FROM pocket_leads WHERE id=? AND (?=\'DR01\' OR assigned_to=?)').bind(match[1],user.employee_id,user.employee_id).first();if(!lead)return response({error:'Contact not found.'},404);
   if(match[2]&&request.method==='GET'){
    const rows=await env.DB.prepare('SELECT actor,before_json,after_json,created_at FROM pocket_lead_activity WHERE lead_id=? ORDER BY id DESC LIMIT 100').bind(lead.id).all();return response({history:rows.results.map(r=>({...r,before:JSON.parse(r.before_json),after:JSON.parse(r.after_json),before_json:undefined,after_json:undefined}))});
   }
   if(!match[2]&&request.method==='PATCH'){
    const patch=await body(request);const error=validate(patch);if(error)return response({error},422);
    if(patch.version!==lead.version)return response({error:'This contact was updated on another phone. Reopen it and try again.',lead:cleanLead(lead)},409);
    const next={...lead,...Object.fromEntries(FIELDS.filter(k=>k in patch).map(k=>[k,patch[k]])),version:lead.version+1,updated_by:user.user_label,updated_at:new Date().toISOString(),change_id:crypto.randomUUID()};
    const results=await env.DB.batch([
     env.DB.prepare('UPDATE pocket_leads SET interest=?,temperature=?,status=?,visit=?,callback=?,notes=?,version=?,updated_by=?,updated_at=?,change_id=? WHERE id=? AND version=?').bind(next.interest,next.temperature,next.status,next.visit,next.callback,next.notes,next.version,next.updated_by,next.updated_at,next.change_id,lead.id,patch.version),
     env.DB.prepare('INSERT INTO pocket_lead_activity(lead_id,actor,change_id,before_json,after_json,created_at) SELECT id,?,?,?,?,? FROM pocket_leads WHERE id=? AND change_id=?').bind(user.user_label,next.change_id,JSON.stringify(cleanLead(lead)),JSON.stringify(cleanLead(next)),next.updated_at,lead.id,next.change_id)
    ]);
    if(results[0].meta.changes!==1)return response({error:'Another update arrived first. Reopen this contact.'},409);
    return response({ok:true,lead:cleanLead(next)});
   }
  }
  return response({error:'Not found'},404);
 }catch(error){if(error instanceof SyntaxError||error.message==='too_large')return response({error:'Invalid or oversized request.'},400);console.error('Telecalling request failed',error?.name);return response({error:'Could not reach the shared register. Please try again.'},500);}
}};
