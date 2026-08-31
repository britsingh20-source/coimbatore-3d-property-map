const USER_KEY = "crm-current-user";

function getStoredSession(){
  try{return JSON.parse(localStorage.getItem(USER_KEY)||"null");}catch{return null;}
}
function initialsFor(session){
  const id=String(session?.employee_id||"").toUpperCase();
  if(id.startsWith("TC")) return id==="TC01"?"T1":"T2";
  if(id.startsWith("MG")) return id==="MG01"?"M1":"M2";
  if(id.startsWith("AD")) return "AD";
  if(id.startsWith("DR")) return "DR";
  return "ST";
}
function titleFor(session){
  if(session?.user_label) return session.user_label;
  const id=String(session?.employee_id||"").toUpperCase();
  if(id==="TC01") return "Telecaller 1";
  if(id==="TC02") return "Telecaller 2";
  if(id==="MG01") return "Manager 1";
  if(id==="MG02") return "Manager 2";
  if(id==="AD01") return "Administrator";
  if(id==="DR01") return "Director";
  return "Staff";
}
function roleLabel(session){
  const role=String(session?.role||"staff").replace(/_/g," ");
  return role.replace(/\b\w/g,c=>c.toUpperCase());
}
function timeLabel(value){
  if(!value) return "—";
  const raw=String(value);
  const d=new Date(raw.includes("T")?raw:raw.replace(" ","T")+"Z");
  if(Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN",{hour:"2-digit",minute:"2-digit"}).format(d);
}
function elapsedLabel(value){
  if(!value) return "0m";
  const raw=String(value);
  const d=new Date(raw.includes("T")?raw:raw.replace(" ","T")+"Z");
  const mins=Math.max(0,Math.floor((Date.now()-d.getTime())/60000));
  return `${Math.floor(mins/60)}h ${mins%60}m`;
}
function injectStyles(){
  if(document.querySelector("#session-header-fix-style")) return;
  const s=document.createElement("style");
  s.id="session-header-fix-style";
  s.textContent=`
    #tc-session-strip{display:none!important;position:static!important}
    .admin-sidebar{position:relative}
    .admin-profile{position:sticky!important;top:0!important;z-index:160!important;background:#114f43!important;padding-bottom:14px!important;box-shadow:0 7px 16px rgba(3,35,29,.14)}
    .admin-profile .staff-profile-session{grid-column:1/-1;width:100%;margin-top:10px;border-top:1px solid rgba(255,255,255,.14);padding-top:10px;display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center}
    .staff-profile-meta{display:flex;gap:12px;flex-wrap:wrap;color:#cfe3dd;font-size:11px;line-height:1.35}
    .staff-profile-meta b{color:#fff}
    .staff-profile-session-btn{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 11px;font-weight:800;font-size:12px;white-space:nowrap}
    #tc-session-dialog .session-end-reason{margin-top:14px;padding:12px;border-radius:13px;background:#fff8e4;border:1px solid #ead38a}
    #tc-session-dialog .session-end-reason label{display:grid;gap:7px;font-size:12px;font-weight:800;color:#315d54}
    #tc-session-dialog .session-end-reason select{width:100%;border:1px solid #cadbd6;border-radius:10px;padding:10px;background:#fff;font:inherit;color:#244f47}
    #tc-session-dialog .session-end-note{font-size:11px;color:#7b6350;margin-top:6px}
    #tc-session-dialog .tc-session-logout{background:#8f332e!important}
    @media(max-width:600px){
      .admin-profile{top:0!important}
      .admin-profile .staff-profile-session{grid-template-columns:1fr auto}
      .staff-profile-meta{gap:7px 10px;font-size:10px}
      .staff-profile-session-btn{padding:7px 9px}
    }
  `;
  document.head.appendChild(s);
}
function buildInline(session){
  const profile=document.querySelector(".admin-profile");
  if(!profile||!session) return;
  const name=document.querySelector("#admin-person-name");
  const avatar=profile.querySelector(".admin-avatar");
  const subtitle=profile.querySelector("small");
  if(name) name.textContent=titleFor(session);
  if(avatar) avatar.textContent=initialsFor(session);
  if(subtitle) subtitle.textContent=`${roleLabel(session)} · ${session.employee_id||"—"}`;

  let box=profile.querySelector(".staff-profile-session");
  if(!box){
    box=document.createElement("div");
    box.className="staff-profile-session";
    box.innerHTML=`<div class="staff-profile-meta"><span>ID <b data-staff-id>—</b></span><span>Started <b data-staff-start>—</b></span><span>Active <b data-staff-active>0m</b></span><span>Today <b data-staff-today>—</b></span></div><button type="button" class="staff-profile-session-btn">Session</button>`;
    profile.appendChild(box);
    box.querySelector(".staff-profile-session-btn").addEventListener("click",()=>{
      const hiddenSessionButton=document.querySelector(".tc-session-open");
      if(hiddenSessionButton) hiddenSessionButton.click();
    });
  }
  box.querySelector("[data-staff-id]").textContent=session.employee_id||"—";
  box.querySelector("[data-staff-start]").textContent=timeLabel(session.login_at);
  box.querySelector("[data-staff-active]").textContent=elapsedLabel(session.login_at);
  const today=document.querySelector("#tc-today-hours")?.textContent||elapsedLabel(session.login_at);
  box.querySelector("[data-staff-today]").textContent=today;
}
function secureEndSessionDialog(){
  const dialog=document.querySelector("#tc-session-dialog");
  const endBtn=dialog?.querySelector(".tc-session-logout");
  if(!dialog||!endBtn||dialog.dataset.headerFixed==="1") return;
  dialog.dataset.headerFixed="1";
  endBtn.textContent="End Session";
  const wrap=document.createElement("div");
  wrap.className="session-end-reason";
  wrap.innerHTML=`<label>Reason for ending session<select id="session-end-reason"><option value="">Select reason</option><option>Shift completed</option><option>End of day</option><option>Break / temporary logout</option><option>Device change</option><option>Other</option></select></label><div class="session-end-note">End Session is available only here so it cannot be touched accidentally while scrolling.</div>`;
  const actions=dialog.querySelector(".tc-session-actions");
  actions?.parentNode?.insertBefore(wrap,actions);
  endBtn.addEventListener("click",e=>{
    const reason=dialog.querySelector("#session-end-reason")?.value;
    if(!reason){
      e.preventDefault();
      e.stopImmediatePropagation();
      const select=dialog.querySelector("#session-end-reason");
      if(select){select.focus();select.style.outline="2px solid #b14b42";}
    }
  },true);
}
function refresh(){
  injectStyles();
  const session=getStoredSession();
  if(session) buildInline(session);
  secureEndSessionDialog();
}

refresh();
setInterval(refresh,1000);
window.addEventListener("storage",refresh);
