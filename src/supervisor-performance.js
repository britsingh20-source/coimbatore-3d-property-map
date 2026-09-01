import './supervisor-performance.css';

const API_BASE=window.LEAD_API_BASE||'';
const SUPERVISOR_ROLES=new Set(['manager','administrator','director']);
let loaded=false;
let data=null;
const $=s=>document.querySelector(s);
function role(){return window.CRM_SESSION?.role?.()||'';}
function token(){return window.CRM_SESSION?.token?.()||localStorage.getItem('crm-telecaller-session-token')||'';}
function todayIST(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function api(path){const r=await fetch(API_BASE+path,{headers:{Authorization:`Bearer ${token()}`}});if(!r.ok)throw new Error(await r.text());return r.json();}
function dateShift(days){const d=new Date();d.setDate(d.getDate()+days);return d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});}
function metric(label,value){return `<div class="crm-perf-metric"><b>${Number(value||0)}</b><span>${label}</span></div>`;}
function mount(){
  if(!SUPERVISOR_ROLES.has(role()))return false;
  const segments=$('.admin-segments'),content=$('.admin-content');
  if(!segments||!content)return false;
  if(!$('#admin-performance')){
    const leads=$('#admin-leads');
    const html=`<section id="admin-performance" class="admin-section crm-perf-section"><div class="crm-perf-head"><div><small>TELECALLER MONITORING</small><h2>Day-by-day performance</h2></div><div class="crm-perf-date"><button type="button" data-perf-day="-1">Yesterday</button><button type="button" data-perf-day="0">Today</button><input id="crm-perf-date" type="date" value="${todayIST()}"></div></div><div id="crm-perf-body" class="crm-perf-loading">Open this tab to load telecaller activity.</div><div id="crm-perf-detail" class="crm-perf-detail" hidden></div></section>`;
    (leads||content.lastElementChild)?.insertAdjacentHTML(leads?'afterend':'beforeend',html);
  }
  if(!segments.querySelector('[data-admin-section="performance"]'))segments.insertAdjacentHTML('beforeend','<button data-admin-section="performance"><span>📊</span>Performance</button>');
  const btn=segments.querySelector('[data-admin-section="performance"]');
  btn.onclick=()=>{document.querySelectorAll('.admin-section').forEach(x=>x.classList.toggle('active',x.id==='admin-performance'));document.querySelectorAll('[data-admin-section]').forEach(x=>x.classList.toggle('active',x===btn));load();};
  $('#crm-perf-date').onchange=()=>load();
  document.querySelectorAll('[data-perf-day]').forEach(b=>b.onclick=()=>{$('#crm-perf-date').value=dateShift(Number(b.dataset.perfDay));load();});
  loaded=true;return true;
}
function card(t){return `<button class="crm-perf-card" type="button" data-perf-caller="${esc(t.caller)}"><h3>${esc(t.caller)}</h3><div class="crm-perf-metrics">${metric('Call attempts',t.call_attempts)}${metric('Calls spoken',t.spoken_calls)}${metric('Unique spoken',t.unique_customers_spoken)}${metric('No response',t.no_response)}${metric('Follow-up',t.follow_up)}${metric('Site visit',t.site_visit)}${metric('Hot',t.hot)}${metric('Closed',t.closed)}</div></button>`;}
async function load(){
  if(!loaded&&!mount())return;
  const body=$('#crm-perf-body');if(!body)return;
  body.className='crm-perf-loading';body.textContent='Loading telecaller performance…';
  const date=$('#crm-perf-date').value||todayIST();
  try{data=await api(`/api/supervisor/telecaller-performance?date=${encodeURIComponent(date)}`);body.className='crm-perf-grid';body.innerHTML=(data.telecallers||[]).map(card).join('')||'<div class="crm-perf-empty">No telecaller activity recorded for this date.</div>';document.querySelectorAll('[data-perf-caller]').forEach(b=>b.onclick=()=>detail(b.dataset.perfCaller));$('#crm-perf-detail').hidden=true;}catch(e){body.className='crm-perf-empty';body.textContent='Could not load telecaller performance. '+e.message;}
}
function detail(caller){
  const t=(data?.telecallers||[]).find(x=>x.caller===caller);if(!t)return;
  const d=$('#crm-perf-detail');const rows=t.activities||[];
  d.innerHTML=`<div class="crm-perf-detail-head"><div><small>${esc(data.date)}</small><h3>${esc(caller)} — ${Number(t.spoken_calls||0)} calls spoken</h3></div><button type="button" id="crm-perf-close">Close</button></div><div class="crm-perf-table-wrap"><table class="crm-perf-table"><thead><tr><th>Time</th><th>Number</th><th>Name</th><th>Status</th><th>Activity</th><th>Area</th><th>Requirement</th><th>Follow-up</th><th>Notes / edits</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(String(r.created_at||'').slice(11,19))}</td><td>${esc(r.phone)}</td><td>${esc(r.name||'—')}</td><td>${esc(r.status||'—')}</td><td>${esc(r.activity_type)}</td><td>${esc(r.area_text||r.area_code||'—')}</td><td class="notes">${esc(r.requirement||'—')}</td><td>${esc(r.follow_up_at||'—')}</td><td class="notes">${esc(r.notes||'—')}</td></tr>`).join('')||'<tr><td colspan="9">No activity</td></tr>'}</tbody></table></div>`;
  d.hidden=false;$('#crm-perf-close').onclick=()=>d.hidden=true;d.scrollIntoView({behavior:'smooth',block:'start'});
}
function tryMount(){if(mount())return;setTimeout(tryMount,120);}
window.addEventListener('crm-session-login',()=>setTimeout(tryMount,80));
window.addEventListener('crm-modules-ready',()=>setTimeout(tryMount,80));
window.addEventListener('crm-admin-open',()=>setTimeout(tryMount,80));
tryMount();
