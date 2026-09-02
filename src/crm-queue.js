import "./crm-queue.css";

const API_BASE = window.LEAD_API_BASE || "";
const BATCH_SIZE = 10;
const TELECALLERS = ["Telecaller 1", "Telecaller 2"];
const FULL_RESULTS = new Set(["Categorized", "Interested", "Hot", "Follow-up", "Site Visit"]);
const QUICK_CLOSE_RESULTS = new Set(["Not Interested", "Wrong Number"]);
let queueCache = [];
let activeQueueLead = null;
let queueMode = null;

function indiaDateKey(value = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function dayNumber(dateKey) { const [y,m,d]=dateKey.split("-").map(Number); return Math.floor(Date.UTC(y,m-1,d)/86400000); }
function queueForTelecaller(label,dateKey=indiaDateKey()) { const index=TELECALLERS.indexOf(label); if(index<0)return null; return index===dayNumber(dateKey)%2?"fresh":"backlog"; }
function rolePlan(dateKey=indiaDateKey()) { return TELECALLERS.map(label=>({label,queue:queueForTelecaller(label,dateKey)})); }
function queueLabel(queue) { return queue==="fresh"?"Fresh Leads":"Backlog Leads"; }
function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
function token(){return window.CRM_SESSION?.token?.()||localStorage.getItem("crm-telecaller-session-token")||"";}
function currentUser(){return window.CRM_SESSION?.user?.()||localStorage.getItem("crm-current-user")||"";}
async function authFetch(path,options={}){
  const t=token();
  const r=await fetch(`${API_BASE}${path}`,{...options,headers:{"content-type":"application/json",...(t?{authorization:`Bearer ${t}`}:{}) ,...(options.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.error||"Request failed");e.status=r.status;e.data=d;throw e;}
  return d;
}

async function loadBatch(){
  const user=currentUser();
  if(!TELECALLERS.includes(user)||!token())return [];
  let lastError=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const data=await authFetch("/api/telecaller/batch");
      queueMode=data.queue;
      return data.leads||[];
    }catch(error){
      lastError=error;
      if(error.status!==401||attempt===2)break;
      await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
      const valid=await window.CRM_SESSION?.verify?.();
      if(!valid)continue;
    }
  }
  throw lastError||new Error("Could not load Current 10 leads");
}

function ensureCallDialog(){
  if(document.querySelector("#queue-call-dialog"))return;
  document.body.insertAdjacentHTML("beforeend",`<dialog id="queue-call-dialog" class="queue-call-dialog"><form id="queue-call-form" method="dialog" novalidate><div class="queue-call-head"><div><small>TELECALLER FIRST CONTACT</small><h3 id="queue-form-title">Customer</h3><span id="queue-form-received"></span></div><button type="button" data-close-call>×</button></div><a id="queue-form-phone" class="queue-call-phone" href="#">☎ Call customer</a><p id="queue-form-rule" class="queue-form-rule">A genuine customer is counted as contacted only after all required details are saved.</p><div class="queue-form-grid"><label>Customer name<input id="qf-name" autocomplete="name"></label><label>Call result<select id="qf-status"><option>Categorized</option><option>No Response</option><option>Busy</option><option>Not Interested</option><option>Wrong Number</option></select></label><label>Preferred area / location<input id="qf-area" placeholder="e.g. Kalapatti, Irugur"></label><label>Property type<select id="qf-type"><option value="">Select</option><option>Plot</option><option>Villa</option><option>Independent House</option><option>Apartment</option><option>Land</option><option>Construction</option><option>Rental</option><option>Other</option></select></label><label>Budget<input id="qf-budget" placeholder="e.g. ₹50–55 lakh"></label><label>Follow-up date & time<input id="qf-followup" type="datetime-local"></label></div><label>Customer requirement<textarea id="qf-requirement" rows="3" placeholder="What exactly is the customer looking for?"></textarea></label><label>Call notes<textarea id="qf-notes" rows="3" placeholder="Important conversation points, family decision, site visit preference, etc."></textarea></label><div id="queue-form-error" class="queue-form-error"></div><div class="queue-call-actions"><button type="button" data-close-call>Cancel</button><button id="queue-save-call" type="submit" class="primary">Save & Continue</button></div></form></dialog>`);
  document.querySelectorAll("[data-close-call]").forEach(b=>b.addEventListener("click",()=>document.querySelector("#queue-call-dialog").close()));
  document.querySelector("#qf-status").addEventListener("change",updateRequiredState);
  document.querySelector("#queue-call-form").addEventListener("submit",saveCallForm);
}
function updateRequiredState(){
  const status=document.querySelector("#qf-status").value;
  const full=FULL_RESULTS.has(status);
  const quickClose=QUICK_CLOSE_RESULTS.has(status);
  ["#qf-name","#qf-area","#qf-type","#qf-budget","#qf-requirement","#qf-notes"].forEach(selector=>{
    const field=document.querySelector(selector);
    field.required=full;
    field.disabled=quickClose;
    field.closest("label").hidden=quickClose;
  });
  const followup=document.querySelector("#qf-followup");
  followup.required=status==="Follow-up";
  followup.disabled=quickClose;
  followup.closest("label").hidden=quickClose;
  document.querySelector("#queue-call-dialog").classList.toggle("minimal-result",!full);
  document.querySelector("#queue-call-dialog").classList.toggle("quick-close-result",quickClose);
  document.querySelector("#queue-form-rule").textContent=quickClose
    ? `Select "${status}", then tap Save & Continue. No other details are required.`
    : "A genuine customer is counted as contacted only after all required details are saved.";
}
function openCallForm(id){ensureCallDialog();activeQueueLead=queueCache.find(l=>String(l.id)===String(id));if(!activeQueueLead)return;document.querySelector("#queue-form-title").textContent=activeQueueLead.name||"Unknown caller";document.querySelector("#queue-form-received").textContent=`Received ${indiaDateKey(activeQueueLead.first_received_at||activeQueueLead.last_received_at)}`;const phone=document.querySelector("#queue-form-phone");phone.textContent=`☎ ${activeQueueLead.display_phone||activeQueueLead.phone}`;phone.href=`tel:${activeQueueLead.phone}`;document.querySelector("#qf-name").value=activeQueueLead.name||"";document.querySelector("#qf-status").value=["No Response","Busy"].includes(activeQueueLead.status)?activeQueueLead.status:"Categorized";document.querySelector("#qf-area").value=activeQueueLead.area_text||"";document.querySelector("#qf-type").value=activeQueueLead.property_type||"";document.querySelector("#qf-budget").value=activeQueueLead.budget||"";document.querySelector("#qf-requirement").value=activeQueueLead.requirement||"";document.querySelector("#qf-notes").value=activeQueueLead.notes||"";document.querySelector("#qf-followup").value=activeQueueLead.follow_up_at?String(activeQueueLead.follow_up_at).slice(0,16):"";document.querySelector("#queue-form-error").textContent="";updateRequiredState();document.querySelector("#queue-call-dialog").showModal();}
async function saveCallForm(event){
  event.preventDefault();if(!activeQueueLead)return;const status=document.querySelector("#qf-status").value;const payload={status,name:document.querySelector("#qf-name").value.trim(),area_text:document.querySelector("#qf-area").value.trim(),property_type:document.querySelector("#qf-type").value,budget:document.querySelector("#qf-budget").value.trim(),requirement:document.querySelector("#qf-requirement").value.trim(),notes:document.querySelector("#qf-notes").value.trim(),follow_up_at:document.querySelector("#qf-followup").value?new Date(document.querySelector("#qf-followup").value).toISOString():null};
  if(FULL_RESULTS.has(status)){const missing=[["name","Customer name"],["area_text","Preferred area"],["property_type","Property type"],["budget","Budget"],["requirement","Requirement"],["notes","Call notes"]].filter(([k])=>!payload[k]);if(missing.length){document.querySelector("#queue-form-error").textContent=`Complete: ${missing.map(x=>x[1]).join(", ")}`;return;}}
  if(status==="Follow-up"&&!payload.follow_up_at){document.querySelector("#queue-form-error").textContent="Follow-up date and time is required.";return;}
  try{await authFetch(`/api/leads/${activeQueueLead.id}/complete-call`,{method:"POST",body:JSON.stringify(payload)});document.querySelector("#queue-call-dialog").close();activeQueueLead=null;await refreshQueue();}
  catch(error){document.querySelector("#queue-form-error").textContent=error.message||"Could not save call.";}
}

function renderLeadBatch(container,leads,user,queue){
  container.innerHTML=`<div class="queue-batch-head"><div><small>${queueLabel(queue||"backlog").toUpperCase()}</small><h3>${user}'s current ${BATCH_SIZE}</h3></div><span>${leads.length} / ${BATCH_SIZE} active</span></div><p class="queue-completion-note">These leads are server-assigned to you. Finish each call with Save & Complete Call. When one leaves the batch, the next available lead is automatically assigned.</p><div class="queue-batch-list">${leads.length?leads.map((lead,i)=>`<article><span class="queue-number">${i+1}</span><div><b>${safe(lead.name||"Unknown caller")}</b><small>${indiaDateKey(lead.first_received_at||lead.last_received_at)} · ${safe(lead.status||"Uncalled")}</small><em>${safe(lead.requirement||"First contact pending")}</em></div><button type="button" data-queue-open="${lead.id}">Call & Enter Details →</button></article>`).join(""):`<div class="queue-empty">No pending leads are currently available.</div>`}</div>`;
  container.querySelectorAll("[data-queue-open]").forEach(b=>b.addEventListener("click",()=>openCallForm(b.dataset.queueOpen)));
}

async function refreshQueue(){
  const root=document.querySelector("#crm-dual-queue");if(!root)return;const today=indiaDateKey(),user=currentUser(),assignedQueue=queueForTelecaller(user,today),plan=rolePlan(today);
  root.querySelector("#queue-today").textContent=today;root.querySelector("#queue-plan").innerHTML=plan.map(item=>`<div class="queue-role ${item.label===user?"active":""}"><b>${item.label}</b><span>${item.queue==="fresh"?"NEW CALLS":"OLD CALLS"}</span><small>${queueLabel(item.queue)} · 10 at a time</small></div>`).join("");
  const batch=root.querySelector("#queue-active-batch");
  if(!TELECALLERS.includes(user)){batch.innerHTML=`<div class="queue-supervisor"><b>Supervisor view</b><p>Administrators and managers retain full visibility. Telecallers work only from their server-assigned current 10.</p></div>`;root.querySelector("#queue-fresh-count").textContent="—";root.querySelector("#queue-backlog-count").textContent="—";root.querySelector("#queue-oldest").textContent="—";return;}
  if(!token()){batch.innerHTML=`<div class="queue-supervisor"><b>Telecaller login required</b><p>Start a timed telecaller session to receive your current 10 leads.</p></div>`;return;}
  try{queueCache=await loadBatch();root.querySelector("#queue-fresh-count").textContent=queueMode==="fresh"?queueCache.length:"—";root.querySelector("#queue-backlog-count").textContent=queueMode==="backlog"?queueCache.length:"—";root.querySelector("#queue-oldest").textContent=queueCache.length?indiaDateKey(queueCache[0].first_received_at):"—";renderLeadBatch(batch,queueCache,user,queueMode||assignedQueue);}catch(e){batch.innerHTML=`<div class="queue-empty">${safe(e.message)}</div>`;}
}
function mountQueue(){const crm=document.querySelector("#admin-leads"),teamFlow=document.querySelector("#crm-team-flow");if(!crm||!teamFlow||document.querySelector("#crm-dual-queue"))return false;teamFlow.insertAdjacentHTML("afterend",`<section id="crm-dual-queue" class="crm-dual-queue"><div class="queue-title"><div><small>DAILY CALLING PLAN · <span id="queue-today"></span></small><h2>Fresh + Backlog Dual Queue</h2><p>Each telecaller receives a protected server-side batch of 10. Completed calls are replaced automatically.</p></div><span class="queue-rule">Current 10</span></div><div class="queue-metrics"><div><small>Fresh assigned</small><b id="queue-fresh-count">—</b></div><div><small>Backlog assigned</small><b id="queue-backlog-count">—</b></div><div><small>Oldest in batch</small><b id="queue-oldest">—</b></div></div><div id="queue-plan" class="queue-plan"></div><div id="queue-active-batch" class="queue-active-batch"></div></section>`);ensureCallDialog();document.querySelector("#crm-user-select")?.addEventListener("change",()=>setTimeout(refreshQueue,0));window.addEventListener("crm-session-login",()=>setTimeout(refreshQueue,250));window.addEventListener("crm-session-logout",refreshQueue);window.addEventListener("storage",refreshQueue);refreshQueue();return true;}
let attempts=0;const timer=setInterval(()=>{attempts+=1;if(mountQueue()||attempts>50)clearInterval(timer);},100);
