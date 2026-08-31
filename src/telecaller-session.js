const API_BASE = window.LEAD_API_BASE || "";
const TOKEN_KEY = "crm-telecaller-session-token";
const USER_KEY = "crm-current-user";
let session = null;
let checkTimer = null;
let lastActivitySent = 0;
let callWasStarted = false;

function api(path, options={}) {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  return fetch(API_BASE + path, {
    ...options,
    headers:{"content-type":"application/json", ...(token?{authorization:`Bearer ${token}`}:{}) , ...(options.headers||{})}
  }).then(async r=>{ const data=await r.json().catch(()=>({})); if(!r.ok){const e=new Error(data.error||"Request failed");e.status=r.status;e.data=data;throw e;} return data; });
}

function isTelecaller(user=localStorage.getItem(USER_KEY)){return user==="Telecaller 1"||user==="Telecaller 2";}
function fmtTime(v){if(!v)return "—";return new Intl.DateTimeFormat("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(String(v).includes("T")?v:String(v).replace(" ","T")+"Z"));}
function elapsed(v){if(!v)return "0m";const start=new Date(String(v).includes("T")?v:String(v).replace(" ","T")+"Z").getTime();const m=Math.max(0,Math.floor((Date.now()-start)/60000));return `${Math.floor(m/60)}h ${m%60}m`;}

function ensureUI(){
  if(document.querySelector("#telecaller-login-gate"))return;
  document.head.insertAdjacentHTML("beforeend",`<style>
  #telecaller-login-gate{position:fixed;inset:0;z-index:99999;background:rgba(4,42,35,.94);display:none;align-items:center;justify-content:center;padding:24px;font-family:inherit}#telecaller-login-gate.show{display:flex}.tc-login-card{background:#fff;border-radius:28px;padding:28px;max-width:460px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.28)}.tc-login-card h2{margin:0 0 8px;color:#114f43}.tc-login-card p{color:#60736f}.tc-login-users{display:grid;gap:12px;margin-top:22px}.tc-login-users button{padding:18px;border:0;border-radius:18px;background:#135b4e;color:#fff;font-weight:800;font-size:17px}.tc-login-rule{margin-top:18px;padding:14px;border-radius:14px;background:#eef7f4;font-size:13px;color:#345e56}#tc-session-strip{display:none;position:sticky;top:0;z-index:50;background:#fff3cf;border:1px solid #ead38a;border-radius:14px;padding:10px 14px;margin:10px 0;font-size:13px;align-items:center;gap:12px;flex-wrap:wrap}body.tc-session-active #tc-session-strip{display:flex}#tc-session-strip b{color:#0f5548}#tc-session-strip button{margin-left:auto;border:0;border-radius:10px;padding:8px 12px;background:#0f5548;color:#fff;font-weight:700}body.tc-session-active #crm-area-grid,body.tc-session-active .crm-area-head,body.tc-session-active .crm-toolbar,body.tc-session-active .crm-list-head,body.tc-session-active #crm-lead-list{display:none!important}body.tc-session-active #crm-kpis{display:none!important}
  </style>`);
  document.body.insertAdjacentHTML("beforeend",`<div id="telecaller-login-gate"><div class="tc-login-card"><small>STAFF LOGIN</small><h2>Telecaller calling session</h2><p>Start your work session. Your login time and activity time are recorded. If there is no CRM activity for 10 minutes, you will be logged out automatically.</p><div class="tc-login-users"><button data-tc-login="Telecaller 1">Login as Telecaller 1</button><button data-tc-login="Telecaller 2">Login as Telecaller 2</button></div><div class="tc-login-rule">While a phone call is active, the session remains active. Returning to the CRM ends the call-active state and restarts the 10-minute inactivity timer.</div></div></div>`);
  document.querySelectorAll("[data-tc-login]").forEach(b=>b.onclick=()=>login(b.dataset.tcLogin));
}
function ensureStrip(){
  const root=document.querySelector("#admin-leads .crm-header");if(!root||document.querySelector("#tc-session-strip"))return;
  root.insertAdjacentHTML("afterend",`<div id="tc-session-strip"><span>● Logged in: <b id="tc-session-user"></b></span><span>Started <b id="tc-session-start"></b></span><span>Active <b id="tc-session-elapsed"></b></span><span>Idle logout: <b>10 min</b></span><button id="tc-logout">Logout</button></div>`);
  document.querySelector("#tc-logout").onclick=logout;
}
function showGate(){ensureUI();document.querySelector("#telecaller-login-gate").classList.add("show");document.body.classList.remove("tc-session-active");}
function hideGate(){ensureUI();document.querySelector("#telecaller-login-gate").classList.remove("show");document.body.classList.add("tc-session-active");ensureStrip();renderStrip();}
function renderStrip(){if(!session)return;ensureStrip();const u=document.querySelector("#tc-session-user"),s=document.querySelector("#tc-session-start"),e=document.querySelector("#tc-session-elapsed");if(u)u.textContent=session.user_label;if(s)s.textContent=fmtTime(session.login_at);if(e)e.textContent=elapsed(session.login_at);}

async function login(user){
  try{const data=await api("/api/session/login",{method:"POST",body:JSON.stringify({user_label:user})});localStorage.setItem(TOKEN_KEY,data.token);localStorage.setItem(USER_KEY,user);session=data;hideGate();syncSelector(user);window.dispatchEvent(new CustomEvent("crm-session-login",{detail:data}));startChecks();}
  catch(e){alert(e.message||"Could not start session");}
}
async function logout(reason="manual"){
  try{if(localStorage.getItem(TOKEN_KEY))await api("/api/session/logout",{method:"POST",body:"{}"});}catch(_){}
  localStorage.removeItem(TOKEN_KEY);session=null;document.body.classList.remove("tc-session-active");showGate();window.dispatchEvent(new CustomEvent("crm-session-logout",{detail:{reason}}));
}
function syncSelector(user){const s=document.querySelector("#crm-user-select");if(s){s.value=user;s.disabled=true;}localStorage.setItem(USER_KEY,user);}
async function restore(){
  const user=localStorage.getItem(USER_KEY);if(!isTelecaller(user)){document.body.classList.remove("tc-session-active");return;}
  const token=localStorage.getItem(TOKEN_KEY);if(!token){showGate();return;}
  try{session=await api("/api/session/me");syncSelector(session.user_label);hideGate();startChecks();}
  catch(_){localStorage.removeItem(TOKEN_KEY);showGate();}
}
async function sendActivity(){if(!session||document.hidden)return;const now=Date.now();if(now-lastActivitySent<45000)return;lastActivitySent=now;try{await api("/api/session/activity",{method:"POST",body:"{}"});}catch(e){if(e.status===401)logout("idle");}}
function startChecks(){if(checkTimer)clearInterval(checkTimer);checkTimer=setInterval(async()=>{renderStrip();if(!session)return;try{session={...session,...await api("/api/session/me")};}catch(e){if(e.status===401)logout("idle");}},30000);}
async function callStart(){if(!session)return;callWasStarted=true;try{await api("/api/session/call-start",{method:"POST",body:"{}"});}catch(_){} }
async function callEnd(){if(!session||!callWasStarted)return;callWasStarted=false;try{await api("/api/session/call-end",{method:"POST",body:"{}"});}catch(e){if(e.status===401)logout("idle");}}

["click","keydown","touchstart","input","scroll"].forEach(evt=>window.addEventListener(evt,sendActivity,{passive:true}));
document.addEventListener("click",e=>{if(e.target.closest('a[href^="tel:"]'))callStart();},true);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)callEnd();});
window.addEventListener("crm-user-changed",e=>{if(isTelecaller(e.detail?.user)){restore();}else{document.body.classList.remove("tc-session-active");}});
window.CRM_SESSION={api,token:()=>localStorage.getItem(TOKEN_KEY)||"",user:()=>session?.user_label||localStorage.getItem(USER_KEY),isActive:()=>!!session,restore,logout,sendActivity};
ensureUI();setTimeout(restore,300);setInterval(renderStrip,15000);
