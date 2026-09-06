const API_BASE=window.LEAD_API_BASE||'';

function currentRole(){return window.CRM_SESSION?.role?.()||'';}
function currentUser(){
  if(window.CRM_SESSION?.user)return window.CRM_SESSION.user()||'';
  const raw=localStorage.getItem('crm-current-user');
  if(!raw)return '';
  try{const v=JSON.parse(raw);return v?.user_label||v?.label||v||'';}catch{return raw;}
}
function allowed(){
  return ['manager','administrator','director'].includes(currentRole()) ||
    ['Manager 1','Manager 2','Administrator','Director'].includes(currentUser());
}
function istDate(offset=0){
  const now=new Date();
  const utc=now.getTime()+now.getTimezoneOffset()*60000;
  const ist=new Date(utc+330*60000+offset*86400000);
  return `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function ensureStyle(){
  if(document.querySelector('#social-dash-style'))return;
  const s=document.createElement('style');s.id='social-dash-style';s.textContent=`
  .social-dash{margin:18px 0 22px;padding:18px;border:1px solid #dce7e2;border-radius:18px;background:#f8fbfa}
  .social-dash-head{display:flex;gap:12px;align-items:end;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}
  .social-dash-head small{font-weight:800;letter-spacing:.08em;color:#0b6b59}.social-dash-head h3{margin:3px 0 0;font-size:18px}
  .social-date-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.social-date-tools button,.social-date-tools input{border:1px solid #cbd9d3;background:#fff;border-radius:10px;padding:9px 11px;font-weight:700;color:#24453e}
  .social-date-tools button.active{background:#0c6554;color:#fff;border-color:#0c6554}
  .social-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.social-kpi{padding:14px;border-radius:14px;background:#fff;border:1px solid #e1ebe7}.social-kpi small{display:block;color:#64746f;font-size:11px;font-weight:800;text-transform:uppercase}.social-kpi b{display:block;font-size:25px;margin-top:5px;color:#123f37}.social-kpi span{display:block;margin-top:3px;font-size:11px;color:#7b8985}
  .social-area-title{margin:16px 0 8px;font-size:13px;font-weight:900;color:#35574f}.social-area-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.social-area{background:#fff;border:1px solid #e1ebe7;border-radius:12px;padding:11px}.social-area b{display:block;font-size:14px}.social-area small{display:block;margin-top:4px;color:#6b7d77;font-size:11px}.social-empty{padding:13px;background:#fff;border-radius:12px;color:#6b7d77;font-size:13px}.social-error{color:#9b2c2c;background:#fff1f1;padding:11px;border-radius:12px;font-size:13px}
  @media(max-width:760px){.social-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.social-area-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;document.head.appendChild(s);
}
async function getSummary(date){
  if(!API_BASE)throw new Error('CRM API not configured');
  const r=await fetch(`${API_BASE}/api/social/summary?date=${encodeURIComponent(date)}`,{headers:{'accept':'application/json'}});
  if(!r.ok)throw new Error(await r.text());
  return r.json();
}
function render(data){
  const body=document.querySelector('#social-dash-body');if(!body)return;
  const m=data?.metrics||{};
  const areas=(data?.by_area||[]).filter(x=>x.area&&x.area!=='Not selected');
  body.innerHTML=`<div class="social-kpis">
    <div class="social-kpi"><small>AREA comments</small><b>${Number(m.area_comments||0)}</b><span>Instagram enquiries</span></div>
    <div class="social-kpi"><small>Area selected</small><b>${Number(m.area_selected||0)}</b><span>Locality chosen</span></div>
    <div class="social-kpi"><small>WhatsApp opened</small><b>${Number(m.whatsapp_opened||0)}</b><span>Area button taps</span></div>
    <div class="social-kpi"><small>CRM leads captured</small><b>${Number(m.crm_leads_captured||0)}</b><span>Phone number captured</span></div>
  </div>
  <div class="social-area-title">AREA-WISE CAPTURE</div>
  ${areas.length?`<div class="social-area-grid">${areas.map(a=>`<div class="social-area"><b>${esc(a.area)}</b><small>${Number(a.selected||0)} selected · ${Number(a.captured||0)} captured</small></div>`).join('')}</div>`:`<div class="social-empty">No area selections for this date yet.</div>`}`;
}
async function load(date){
  const body=document.querySelector('#social-dash-body');if(!body)return;
  body.innerHTML='<div class="social-empty">Loading social leads…</div>';
  try{render(await getSummary(date));}catch(e){body.innerHTML=`<div class="social-error">Could not load social lead count: ${esc(e.message)}</div>`;}
}
function selectDate(date,kind='custom'){
  const input=document.querySelector('#social-date');if(input)input.value=date;
  document.querySelectorAll('[data-social-range]').forEach(b=>b.classList.toggle('active',b.dataset.socialRange===kind));
  load(date);
}
function mount(){
  if(!allowed())return;
  const leads=document.querySelector('#admin-leads');if(!leads){setTimeout(mount,100);return;}
  if(document.querySelector('#social-lead-dashboard'))return;
  ensureStyle();
  const anchor=leads.querySelector('#crm-team-flow')||leads.querySelector('.crm-head');
  if(!anchor)return;
  anchor.insertAdjacentHTML('afterend',`<section id="social-lead-dashboard" class="social-dash">
    <div class="social-dash-head"><div><small>SOCIAL LEADS</small><h3>Instagram → WhatsApp Today</h3></div><div class="social-date-tools"><button data-social-range="today" class="active">Today</button><button data-social-range="yesterday">Yesterday</button><input id="social-date" type="date" value="${istDate(0)}"></div></div>
    <div id="social-dash-body"></div>
  </section>`);
  document.querySelector('[data-social-range="today"]').onclick=()=>selectDate(istDate(0),'today');
  document.querySelector('[data-social-range="yesterday"]').onclick=()=>selectDate(istDate(-1),'yesterday');
  document.querySelector('#social-date').onchange=e=>selectDate(e.target.value,'custom');
  load(istDate(0));
}

window.addEventListener('crm-session-login',()=>setTimeout(mount,100));
window.addEventListener('crm-admin-open',()=>setTimeout(mount,100));
window.addEventListener('crm-user-changed',()=>setTimeout(mount,100));
window.addEventListener('crm-modules-ready',()=>setTimeout(mount,100));
setTimeout(mount,800);
