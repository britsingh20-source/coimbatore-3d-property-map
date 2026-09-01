const API_BASE = window.LEAD_API_BASE || "";
const WORK_BASE = window.WORK_HOURS_API_BASE || "";
const TOKEN_KEY = "crm-telecaller-session-token";
const USER_KEY = "crm-current-user";
let session = null;
let checkTimer = null;
let hoursTimer = null;
let lastActivitySent = 0;
let callWasStarted = false;
let hoursData = null;
let sessionVerifyPromise = null;

const STAFF_IDS = {
  TC01:"Telecaller 1", TC02:"Telecaller 2",
  MG01:"Manager 1", MG02:"Manager 2",
  AD01:"Administrator", DR01:"Director"
};
function isTelecaller(user){return user==="Telecaller 1"||user==="Telecaller 2";}
function isSupervisor(role){return ["manager","administrator","director"].includes(role);}
function token(){return localStorage.getItem(TOKEN_KEY)||"";}

function request(base,path,options={}){
  const t=token();
  return fetch(base+path,{...options,headers:{"content-type":"application/json",...(t?{authorization:`Bearer ${t}`}:{}) ,...(options.headers||{})}})
    .then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(data.error||"Request failed");e.status=r.status;e.data=data;throw e;}return data;});
}
const api=(path,options={})=>request(API_BASE,path,options);
const workApi=(path,options={})=>request(WORK_BASE,path,options);

function fmtTime(v){if(!v)return "—";return new Intl.DateTimeFormat("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(String(v).includes("T")?v:String(v).replace(" ","T")+"Z"));}
function elapsed(v){if(!v)return "0m";const start=new Date(String(v).includes("T")?v:String(v).replace(" ","T")+"Z").getTime();const m=Math.max(0,Math.floor((Date.now()-start)/60000));return `${Math.floor(m/60)}h ${m%60}m`;}
function hoursLabel(h){const mins=Math.max(0,Math.round(Number(h||0)*60));return `${Math.floor(mins/60)}h ${mins%60}m`;}
function monthKey(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);}
function daysInMonth(month){const [y,m]=month.split("-").map(Number);return new Date(y,m,0).getDate();}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

function ensureUI(){
  if(document.querySelector("#staff-login-gate"))return;
  document.head.insertAdjacentHTML("beforeend",`<style>
  #staff-login-gate{position:fixed;inset:0;z-index:99999;background:rgba(4,42,35,.94);display:none;align-items:center;justify-content:center;padding:24px;font-family:inherit}#staff-login-gate.show{display:flex}.tc-login-card{background:#fff;border-radius:28px;padding:28px;max-width:460px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.28)}.tc-login-card h2{margin:0 0 8px;color:#114f43}.tc-login-card p{color:#60736f}.tc-login-form{display:grid;gap:14px;margin-top:22px}.tc-login-form label{display:grid;gap:7px;font-size:13px;font-weight:800;color:#315d54}.tc-login-form input{width:100%;box-sizing:border-box;border:1px solid #cadbd6;border-radius:14px;padding:15px 16px;font:inherit;font-size:16px}.tc-login-form input:focus{outline:2px solid #3cb79b;outline-offset:1px}.tc-login-form button{padding:17px;border:0;border-radius:16px;background:#135b4e;color:#fff;font-weight:800;font-size:17px}.tc-login-error{min-height:20px;color:#a12d25;font-size:13px;font-weight:700}.tc-login-hint{display:flex;gap:8px;flex-wrap:wrap}.tc-login-hint button{background:#eef7f4;color:#135b4e;padding:9px 11px;font-size:12px}.tc-login-rule{margin-top:18px;padding:14px;border-radius:14px;background:#eef7f4;font-size:13px;color:#345e56}
  #tc-session-strip{display:none;position:sticky;top:0;z-index:90;background:#fff7dc;border:1px solid #ead38a;border-radius:14px;padding:9px 11px;margin:0 0 10px;font-size:12px;align-items:center;gap:9px;box-shadow:0 4px 14px rgba(21,78,66,.09)}body.staff-session-active #tc-session-strip{display:flex}#tc-session-strip b{color:#0f5548}.tc-session-main{display:flex;align-items:center;gap:7px;min-width:0;flex:1}.tc-session-main span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tc-session-dot{width:8px;height:8px;border-radius:50%;background:#13836e;flex:0 0 auto}.tc-session-hours{white-space:nowrap;color:#315d54}.tc-session-open{border:1px solid #b8d4cd;background:#fff;color:#0f5548;border-radius:10px;padding:7px 10px;font-weight:800;flex:0 0 auto}
  #tc-session-dialog{border:0;border-radius:22px;padding:0;width:min(92vw,430px);box-shadow:0 24px 80px rgba(0,0,0,.3)}#tc-session-dialog::backdrop{background:rgba(4,42,35,.55)}.tc-session-card{padding:22px}.tc-session-card h3{margin:0 0 14px;color:#114f43}.tc-session-details{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tc-session-details div{background:#f1f7f5;border-radius:12px;padding:10px}.tc-session-details small{display:block;color:#69807a;margin-bottom:4px}.tc-session-actions{display:flex;justify-content:space-between;gap:10px;margin-top:18px}.tc-session-actions button{border:0;border-radius:12px;padding:11px 14px;font-weight:800}.tc-session-close{background:#edf4f2;color:#174f45}.tc-session-logout{background:#8f332e;color:white}
  #work-hours-panel{display:none;background:#fff;border:1px solid #d8e6e2;border-radius:18px;margin:10px 0 14px;padding:14px}body.staff-session-active #work-hours-panel.show{display:block}.work-hours-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.work-hours-head h3{margin:0;color:#124f43}.work-hours-head input{border:1px solid #cbded9;border-radius:10px;padding:8px}.work-hours-grid{display:grid;gap:12px}.work-staff-card{border:1px solid #e1ebe8;border-radius:15px;padding:12px}.work-staff-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.work-staff-top b{color:#124f43}.work-staff-stats{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#526d66;margin-top:5px}.work-bars{height:74px;display:flex;align-items:flex-end;gap:2px;margin-top:10px;border-bottom:1px solid #dbe8e4;overflow:hidden}.work-bar{flex:1;min-width:3px;max-width:16px;background:#3cae91;border-radius:3px 3px 0 0;opacity:.85}.work-days{display:flex;justify-content:space-between;font-size:9px;color:#81928e;margin-top:4px}.work-hours-error{padding:12px;background:#fff1ef;border-radius:12px;color:#8a352e;font-size:13px}.work-hours-loading{padding:12px;color:#657973;font-size:13px}
  body.tc-session-active #crm-area-grid,body.tc-session-active .crm-area-head,body.tc-session-active .crm-toolbar,body.tc-session-active .crm-list-head,body.tc-session-active #crm-lead-list{display:none!important}body.tc-session-active #crm-kpis{display:none!important}
  @media(max-width:600px){#tc-session-strip{border-radius:0;margin:0 -2px 8px;padding:8px 9px}.tc-session-hours{font-size:11px}.tc-session-main .role-hide{display:none}.work-bars{gap:1px}.work-staff-card{padding:10px}}
  </style>`);
  document.body.insertAdjacentHTML("beforeend",`<div id="staff-login-gate"><div class="tc-login-card"><small>STAFF LOGIN</small><h2>CRM staff login</h2><p>Enter your Employee ID and 3-digit PIN. Your role and dashboard are selected automatically after login.</p><form id="tc-login-form" class="tc-login-form"><label>Employee ID<input id="tc-employee-id" inputmode="text" autocomplete="username" maxlength="4" placeholder="Example: AD01" required></label><label>3-digit PIN<input id="tc-pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{3}" maxlength="3" placeholder="•••" required></label><div class="tc-login-hint"><button type="button" data-employee="TC01">TC01</button><button type="button" data-employee="TC02">TC02</button><button type="button" data-employee="MG01">MG01</button><button type="button" data-employee="MG02">MG02</button><button type="button" data-employee="AD01">AD01</button><button type="button" data-employee="DR01">DR01</button></div><div id="tc-login-error" class="tc-login-error"></div><button type="submit">Login</button></form><div class="tc-login-rule">Telecallers receive their Current 10 calling batch. Managers, Administrator and Director open their own role view. Five incorrect PIN attempts trigger a 15-minute lock.</div></div></div><dialog id="tc-session-dialog"><div class="tc-session-card"><h3>Current staff session</h3><div class="tc-session-details"><div><small>Staff</small><b id="tc-dialog-user">—</b></div><div><small>Employee ID</small><b id="tc-dialog-id">—</b></div><div><small>Role</small><b id="tc-dialog-role">—</b></div><div><small>Login time</small><b id="tc-dialog-start">—</b></div><div><small>Current session</small><b id="tc-dialog-elapsed">—</b></div><div><small>Idle timeout</small><b>10 min</b></div></div><div class="tc-session-actions"><button type="button" class="tc-session-close">Back to work</button><button type="button" class="tc-session-logout">Confirm Logout</button></div></div></dialog>`);
  document.querySelector("#tc-login-form").onsubmit=e=>{e.preventDefault();login(document.querySelector("#tc-employee-id").value,document.querySelector("#tc-pin").value);};
  document.querySelectorAll("[data-employee]").forEach(b=>b.onclick=()=>{document.querySelector("#tc-employee-id").value=b.dataset.employee;document.querySelector("#tc-pin").focus();});
  document.querySelector(".tc-session-close").onclick=()=>document.querySelector("#tc-session-dialog").close();
  document.querySelector(".tc-session-logout").onclick=()=>{document.querySelector("#tc-session-dialog").close();logout();};
}

function ensureStrip(){
  const root=document.querySelector("#admin-leads");if(!root||document.querySelector("#tc-session-strip"))return;
  root.insertAdjacentHTML("afterbegin",`<div id="tc-session-strip"><div class="tc-session-main"><i class="tc-session-dot"></i><span><b id="tc-session-id"></b> · <b id="tc-session-user"></b> <span class="role-hide">· <span id="tc-session-role"></span></span></span></div><span class="tc-session-hours">Today <b id="tc-today-hours">0h 0m</b></span><button type="button" class="tc-session-open">Session</button></div><section id="work-hours-panel"><div class="work-hours-head"><div><small>ATTENDANCE & ACTIVITY</small><h3>Monthly Working Hours</h3></div><input id="work-hours-month" type="month"></div><div id="work-hours-content" class="work-hours-grid"><div class="work-hours-loading">Loading working hours…</div></div></section>`);
  document.querySelector(".tc-session-open").onclick=openSessionDialog;
  document.querySelector("#work-hours-month").value=monthKey();
  document.querySelector("#work-hours-month").onchange=()=>loadWorkHours(true);
}
function openSessionDialog(){if(!session)return;renderDialog();document.querySelector("#tc-session-dialog").showModal();}
function renderDialog(){if(!session)return;const pairs={"#tc-dialog-user":session.user_label,"#tc-dialog-id":session.employee_id||"—","#tc-dialog-role":session.role||"staff","#tc-dialog-start":fmtTime(session.login_at),"#tc-dialog-elapsed":elapsed(session.login_at)};for(const [s,v] of Object.entries(pairs)){const el=document.querySelector(s);if(el)el.textContent=v;}}
function showGate(){ensureUI();document.querySelector("#staff-login-gate").classList.add("show");document.body.classList.remove("staff-session-active","tc-session-active");setTimeout(()=>document.querySelector("#tc-employee-id")?.focus(),50);}
function hideGate(){ensureUI();document.querySelector("#staff-login-gate").classList.remove("show");document.body.classList.add("staff-session-active");document.body.classList.toggle("tc-session-active",isTelecaller(session?.user_label));ensureStrip();const supervisor=isSupervisor(session?.role);document.querySelector("#work-hours-panel")?.classList.toggle("show",supervisor);renderStrip();if(supervisor&&WORK_BASE)loadWorkHours();}
function renderStrip(){if(!session)return;ensureStrip();const set=(s,v)=>{const e=document.querySelector(s);if(e)e.textContent=v;};set("#tc-session-user",session.user_label);set("#tc-session-id",session.employee_id||"—");set("#tc-session-role",session.role||"staff");const mine=hoursData?.staff?.find(x=>x.user_label===session.user_label);set("#tc-today-hours",mine?hoursLabel(mine.today_hours):elapsed(session.login_at));renderDialog();}

function renderWorkHours(data){
  hoursData=data;renderStrip();const box=document.querySelector("#work-hours-content");if(!box)return;
  const month=data.month,days=daysInMonth(month);box.innerHTML=(data.staff||[]).map(staff=>{
    const bars=Array.from({length:days},(_,i)=>{const day=String(i+1).padStart(2,"0"),key=`${month}-${day}`,h=Number(staff.daily?.[key]||0),height=Math.max(h>0?4:0,Math.min(68,(h/10)*68));return `<i class="work-bar" style="height:${height}px" title="${key}: ${hoursLabel(h)}"></i>`;}).join("");
    return `<article class="work-staff-card"><div class="work-staff-top"><div><b>${esc(staff.user_label)}</b><div class="work-staff-stats"><span>${esc(staff.employee_id)}</span><span>Total <strong>${hoursLabel(staff.total_hours)}</strong></span><span>Avg/day <strong>${hoursLabel(staff.average_hours)}</strong></span><span>Days <strong>${staff.days_worked}</strong></span></div></div><small>${esc(staff.role)}</small></div><div class="work-bars">${bars}</div><div class="work-days"><span>1</span><span>${Math.ceil(days/2)}</span><span>${days}</span></div></article>`;
  }).join("")||`<div class="work-hours-loading">No working-hour records for this month.</div>`;
}
async function loadWorkHours(force=false){
  if(!session||!WORK_BASE||!isSupervisor(session.role))return;ensureStrip();const month=document.querySelector("#work-hours-month")?.value||monthKey();
  try{const data=await workApi(`/api/work-hours?month=${encodeURIComponent(month)}`);renderWorkHours(data);document.querySelector("#work-hours-panel")?.classList.add("show");}
  catch(e){const box=document.querySelector("#work-hours-content");if(box)box.innerHTML=`<div class="work-hours-error">Working-hours report is temporarily unavailable. Your CRM login remains active. ${esc(e.message)}</div>`;}
}

async function verifyMainSession(){
  if(!token())return false;
  if(sessionVerifyPromise)return sessionVerifyPromise;
  sessionVerifyPromise=(async()=>{
    try{
      const verified=await api("/api/session/me");
      session={...(session||{}),...verified};
      localStorage.setItem(USER_KEY,session.user_label);
      syncSelector(session.user_label);
      return true;
    }catch(e){
      return false;
    }finally{
      sessionVerifyPromise=null;
    }
  })();
  return sessionVerifyPromise;
}

async function login(employeeId,pin){
  const id=String(employeeId||"").trim().toUpperCase(),p=String(pin||"").trim(),error=document.querySelector("#tc-login-error");if(error)error.textContent="";
  if(!STAFF_IDS[id]){if(error)error.textContent="Enter a valid Employee ID: TC01, TC02, MG01, MG02, AD01 or DR01.";return;}
  if(!/^\d{3}$/.test(p)){if(error)error.textContent="PIN must be exactly 3 digits.";return;}
  const submit=document.querySelector("#tc-login-form button[type='submit']");
  if(submit){submit.disabled=true;submit.textContent="Logging in…";}
  try{
    const data=await api("/api/session/login",{method:"POST",body:JSON.stringify({employee_id:id,pin:p})});
    if(!data?.token||!data?.user_label)throw new Error("Could not start session");
    localStorage.setItem(TOKEN_KEY,data.token);
    localStorage.setItem(USER_KEY,data.user_label);
    session=data;
    hoursData=null;
    document.querySelector("#tc-pin").value="";
    hideGate();
    syncSelector(session.user_label);
    window.dispatchEvent(new CustomEvent("crm-session-login",{detail:session}));
    startChecks();
  }
  catch(e){if(error)error.textContent=e.message||"Could not start session";if(e.status===423)document.querySelector("#tc-pin").value="";}
  finally{if(submit){submit.disabled=false;submit.textContent="Login";}}
}
async function logout(reason="manual"){
  try{if(token())await api("/api/session/logout",{method:"POST",body:"{}"});}catch(_){}
  localStorage.removeItem(TOKEN_KEY);session=null;hoursData=null;document.body.classList.remove("staff-session-active","tc-session-active");showGate();window.dispatchEvent(new CustomEvent("crm-session-logout",{detail:{reason}}));
}
function syncSelector(user){const s=document.querySelector("#crm-user-select");if(s){s.value=user;s.disabled=true;}localStorage.setItem(USER_KEY,user);}
async function restore(){const t=token();if(!t){showGate();return;}const ok=await verifyMainSession();if(ok){hideGate();startChecks();}else{localStorage.removeItem(TOKEN_KEY);session=null;showGate();}}
async function sendActivity(){if(!session||document.hidden)return;const now=Date.now();if(now-lastActivitySent<45000)return;lastActivitySent=now;try{await api("/api/session/activity",{method:"POST",body:"{}"});}catch(e){if(e.status===401){const valid=await verifyMainSession();if(!valid)logout("idle");}}}
function startChecks(){if(checkTimer)clearInterval(checkTimer);if(hoursTimer)clearInterval(hoursTimer);checkTimer=setInterval(async()=>{renderStrip();if(!session)return;const valid=await verifyMainSession();if(!valid)logout("idle");else document.body.classList.toggle("tc-session-active",isTelecaller(session.user_label));},60000);hoursTimer=setInterval(()=>{if(session&&isSupervisor(session.role))loadWorkHours();},120000);}
async function callStart(){if(!session||!isTelecaller(session.user_label))return;callWasStarted=true;try{await api("/api/session/call-start",{method:"POST",body:"{}"});}catch(e){if(e.status===401){const valid=await verifyMainSession();if(!valid)logout("idle");}} }
async function callEnd(){if(!session||!callWasStarted)return;callWasStarted=false;try{await api("/api/session/call-end",{method:"POST",body:"{}"});}catch(e){if(e.status===401){const valid=await verifyMainSession();if(!valid)logout("idle");}}}

document.addEventListener("pointerdown",sendActivity,{passive:true});
document.addEventListener("keydown",sendActivity,{passive:true});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)sendActivity();});
window.addEventListener("crm-call-start",callStart);
window.addEventListener("crm-call-end",callEnd);
window.CRM_SESSION={token,user:()=>session?.user_label||null,role:()=>session?.role||null,employeeId:()=>session?.employee_id||null,session:()=>session,verify:verifyMainSession,logout};
ensureUI();restore();