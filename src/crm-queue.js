import "./crm-queue.css";

const API_BASE = window.LEAD_API_BASE || "";
const BATCH_SIZE = 10;
const TELECALLERS = ["Telecaller 1", "Telecaller 2"];
const PENDING_STATUSES = new Set(["Uncalled", "No Response", "Busy", "Needs Review"]);
const FULL_RESULTS = new Set(["Categorized", "Interested", "Hot", "Follow-up", "Site Visit"]);
let queueCache = [];
let activeQueueLead = null;

function indiaDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function dayNumber(dateKey) { const [y,m,d]=dateKey.split("-").map(Number); return Math.floor(Date.UTC(y,m-1,d)/86400000); }
function queueForTelecaller(label,dateKey=indiaDateKey()) { const index=TELECALLERS.indexOf(label); if(index<0)return null; return index===dayNumber(dateKey)%2?"fresh":"backlog"; }
function rolePlan(dateKey=indiaDateKey()) { return TELECALLERS.map(label=>({label,queue:queueForTelecaller(label,dateKey)})); }
function queueLabel(queue) { return queue==="fresh"?"Fresh Leads":"Backlog Leads"; }

async function loadLeads() {
  try {
    if (API_BASE) {
      const response=await fetch(`${API_BASE}/api/leads`,{headers:{"content-type":"application/json"}});
      if(response.ok){const data=await response.json(); return data.leads||data;}
    }
  } catch(_) {}
  const saved=localStorage.getItem("lead-crm-demo-data");
  return saved?JSON.parse(saved):[];
}
function isPending(lead) { return !lead.contact_complete && PENDING_STATUSES.has(lead.status||"Uncalled"); }
function queueLeads(leads,queue,today) {
  return leads.filter(isPending).filter(lead=>{
    const received=indiaDateKey(lead.first_received_at||lead.last_received_at||new Date());
    return queue==="fresh"?received===today:received<today;
  }).sort((a,b)=>{
    const ad=new Date(a.first_received_at||a.last_received_at||0).getTime();
    const bd=new Date(b.first_received_at||b.last_received_at||0).getTime();
    if(queue==="fresh")return bd-ad;
    const aRetry=["No Response","Busy"].includes(a.status)?1:0;
    const bRetry=["No Response","Busy"].includes(b.status)?1:0;
    if(aRetry!==bRetry)return aRetry-bRetry;
    return ad-bd;
  });
}
function batchKey(user,queue,today){return `crm-batch:${today}:${user}:${queue}`;}
function currentBatchIndex(user,queue,today){return Number(localStorage.getItem(batchKey(user,queue,today))||0);}
function setBatchIndex(user,queue,today,index){localStorage.setItem(batchKey(user,queue,today),String(Math.max(0,index)));}
function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

function ensureCallDialog(){
  if(document.querySelector("#queue-call-dialog"))return;
  document.body.insertAdjacentHTML("beforeend",`<dialog id="queue-call-dialog" class="queue-call-dialog">
    <form id="queue-call-form" method="dialog">
      <div class="queue-call-head"><div><small>TELECALLER FIRST CONTACT</small><h3 id="queue-form-title">Customer</h3><span id="queue-form-received"></span></div><button type="button" data-close-call>×</button></div>
      <a id="queue-form-phone" class="queue-call-phone" href="#">☎ Call customer</a>
      <p class="queue-form-rule">A genuine customer is counted as contacted only after all required details are saved.</p>
      <div class="queue-form-grid">
        <label>Customer name<input id="qf-name" autocomplete="name"></label>
        <label>Call result<select id="qf-status"><option>Categorized</option><option>No Response</option><option>Busy</option><option>Not Interested</option><option>Wrong Number</option></select></label>
        <label>Preferred area / location<input id="qf-area" placeholder="e.g. Kalapatti, Irugur"></label>
        <label>Property type<select id="qf-type"><option value="">Select</option><option>Plot</option><option>Villa</option><option>Independent House</option><option>Apartment</option><option>Land</option><option>Construction</option><option>Rental</option><option>Other</option></select></label>
        <label>Budget<input id="qf-budget" placeholder="e.g. ₹50–55 lakh"></label>
        <label>Follow-up date & time<input id="qf-followup" type="datetime-local"></label>
      </div>
      <label>Customer requirement<textarea id="qf-requirement" rows="3" placeholder="What exactly is the customer looking for?"></textarea></label>
      <label>Call notes<textarea id="qf-notes" rows="3" placeholder="Important conversation points, family decision, site visit preference, etc."></textarea></label>
      <div id="queue-form-error" class="queue-form-error"></div>
      <div class="queue-call-actions"><button type="button" data-close-call>Cancel</button><button type="submit" class="primary">Save & Complete Call</button></div>
    </form>
  </dialog>`);
  document.querySelectorAll("[data-close-call]").forEach(b=>b.addEventListener("click",()=>document.querySelector("#queue-call-dialog").close()));
  document.querySelector("#qf-status").addEventListener("change",updateRequiredState);
  document.querySelector("#queue-call-form").addEventListener("submit",saveCallForm);
}
function updateRequiredState(){
  const status=document.querySelector("#qf-status").value;
  const full=FULL_RESULTS.has(status);
  ["#qf-name","#qf-area","#qf-type","#qf-budget","#qf-requirement","#qf-notes"].forEach(s=>document.querySelector(s).required=full);
  document.querySelector("#qf-followup").required=status==="Follow-up";
  document.querySelector("#queue-call-dialog").classList.toggle("minimal-result",!full);
}
function openCallForm(id){
  ensureCallDialog();
  activeQueueLead=queueCache.find(l=>String(l.id)===String(id)); if(!activeQueueLead)return;
  document.querySelector("#queue-form-title").textContent=activeQueueLead.name||"Unknown caller";
  document.querySelector("#queue-form-received").textContent=`Received ${indiaDateKey(activeQueueLead.first_received_at||activeQueueLead.last_received_at)}`;
  const phone=document.querySelector("#queue-form-phone"); phone.textContent=`☎ ${activeQueueLead.display_phone||activeQueueLead.phone}`; phone.href=`tel:${activeQueueLead.phone}`;
  document.querySelector("#qf-name").value=activeQueueLead.name||"";
  document.querySelector("#qf-status").value=["No Response","Busy"].includes(activeQueueLead.status)?activeQueueLead.status:"Categorized";
  document.querySelector("#qf-area").value=activeQueueLead.area_text||"";
  document.querySelector("#qf-type").value=activeQueueLead.property_type||"";
  document.querySelector("#qf-budget").value=activeQueueLead.budget||"";
  document.querySelector("#qf-requirement").value=activeQueueLead.requirement||"";
  document.querySelector("#qf-notes").value=activeQueueLead.notes||"";
  document.querySelector("#qf-followup").value=activeQueueLead.follow_up_at?String(activeQueueLead.follow_up_at).slice(0,16):"";
  document.querySelector("#queue-form-error").textContent="";
  updateRequiredState(); document.querySelector("#queue-call-dialog").showModal();
}
async function saveCallForm(event){
  event.preventDefault(); if(!activeQueueLead)return;
  const status=document.querySelector("#qf-status").value;
  const payload={caller:localStorage.getItem("crm-current-user")||"Telecaller 1",status,
    name:document.querySelector("#qf-name").value.trim(),area_text:document.querySelector("#qf-area").value.trim(),
    property_type:document.querySelector("#qf-type").value,budget:document.querySelector("#qf-budget").value.trim(),
    requirement:document.querySelector("#qf-requirement").value.trim(),notes:document.querySelector("#qf-notes").value.trim(),
    follow_up_at:document.querySelector("#qf-followup").value?new Date(document.querySelector("#qf-followup").value).toISOString():null};
  if(FULL_RESULTS.has(status)){
    const missing=[["name","Customer name"],["area_text","Preferred area"],["property_type","Property type"],["budget","Budget"],["requirement","Requirement"],["notes","Call notes"]].filter(([k])=>!payload[k]);
    if(missing.length){document.querySelector("#queue-form-error").textContent=`Complete: ${missing.map(x=>x[1]).join(", ")}`;return;}
  }
  if(status==="Follow-up"&&!payload.follow_up_at){document.querySelector("#queue-form-error").textContent="Follow-up date and time is required.";return;}
  try{
    if(API_BASE){
      const response=await fetch(`${API_BASE}/api/leads/${activeQueueLead.id}/complete-call`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json(); if(!response.ok)throw new Error(data.error||"Could not save call");
    }else{
      Object.assign(activeQueueLead,payload,{last_contact_at:new Date().toISOString(),contact_complete:FULL_RESULTS.has(status)?1:0});
      localStorage.setItem("lead-crm-demo-data",JSON.stringify(queueCache));
    }
    document.querySelector("#queue-call-dialog").close(); await refreshQueue();
  }catch(error){document.querySelector("#queue-form-error").textContent=error.message||"Could not save call.";}
}

function renderLeadBatch(container,leads,user,queue,today){
  let page=currentBatchIndex(user,queue,today); const totalBatches=Math.max(1,Math.ceil(leads.length/BATCH_SIZE));
  if(page>=totalBatches){page=Math.max(0,totalBatches-1);setBatchIndex(user,queue,today,page);} const start=page*BATCH_SIZE; const batch=leads.slice(start,start+BATCH_SIZE);
  container.innerHTML=`<div class="queue-batch-head"><div><small>${queueLabel(queue).toUpperCase()}</small><h3>${user}'s current ${BATCH_SIZE}</h3></div><span>Batch ${Math.min(page+1,totalBatches)} / ${totalBatches}</span></div>
    <p class="queue-completion-note">Open a customer → call → enter the enquiry details → Save & Complete Call. Only then does the lead leave this queue.</p>
    <div class="queue-batch-list">${batch.length?batch.map((lead,i)=>`<article><span class="queue-number">${start+i+1}</span><div><b>${safe(lead.name||"Unknown caller")}</b><small>${indiaDateKey(lead.first_received_at||lead.last_received_at)} · ${safe(lead.status||"Uncalled")}</small><em>${safe(lead.requirement||"First contact pending")}</em></div><button type="button" data-queue-open="${lead.id}">Call & Enter Details →</button></article>`).join(""):`<div class="queue-empty">No ${queueLabel(queue).toLowerCase()} waiting in this queue.</div>`}</div>
    <div class="queue-actions"><button type="button" data-queue-prev ${page<=0?"disabled":""}>← Previous 10</button><button type="button" data-queue-next ${start+BATCH_SIZE>=leads.length?"disabled":""}>Next 10 →</button></div>`;
  container.querySelectorAll("[data-queue-open]").forEach(b=>b.addEventListener("click",()=>openCallForm(b.dataset.queueOpen)));
  container.querySelector("[data-queue-prev]")?.addEventListener("click",()=>{setBatchIndex(user,queue,today,page-1);refreshQueue();});
  container.querySelector("[data-queue-next]")?.addEventListener("click",()=>{setBatchIndex(user,queue,today,page+1);refreshQueue();});
}

async function refreshQueue(){
  const root=document.querySelector("#crm-dual-queue"); if(!root)return; const today=indiaDateKey(); const user=localStorage.getItem("crm-current-user")||"Telecaller 1";
  queueCache=await loadLeads(); const fresh=queueLeads(queueCache,"fresh",today); const backlog=queueLeads(queueCache,"backlog",today); const assignedQueue=queueForTelecaller(user,today); const plan=rolePlan(today);
  root.querySelector("#queue-today").textContent=today; root.querySelector("#queue-fresh-count").textContent=fresh.length; root.querySelector("#queue-backlog-count").textContent=backlog.length;
  root.querySelector("#queue-oldest").textContent=backlog.length?indiaDateKey(backlog[0].first_received_at||backlog[0].last_received_at):"—";
  root.querySelector("#queue-plan").innerHTML=plan.map(item=>`<div class="queue-role ${item.label===user?"active":""}"><b>${item.label}</b><span>${item.queue==="fresh"?"NEW CALLS":"OLD CALLS"}</span><small>${queueLabel(item.queue)} · 10 at a time</small></div>`).join("");
  const batch=root.querySelector("#queue-active-batch"); if(assignedQueue)renderLeadBatch(batch,assignedQueue==="fresh"?fresh:backlog,user,assignedQueue,today); else batch.innerHTML=`<div class="queue-supervisor"><b>Supervisor view</b><p>Managers, Administrator and Director monitor both queues. Telecaller duties swap automatically each day.</p></div>`;
}
function mountQueue(){
  const crm=document.querySelector("#admin-leads"),teamFlow=document.querySelector("#crm-team-flow"); if(!crm||!teamFlow||document.querySelector("#crm-dual-queue"))return false;
  teamFlow.insertAdjacentHTML("afterend",`<section id="crm-dual-queue" class="crm-dual-queue"><div class="queue-title"><div><small>DAILY CALLING PLAN · <span id="queue-today"></span></small><h2>Fresh + Backlog Dual Queue</h2><p>One telecaller handles today's leads while the other clears old pending leads. Duties swap automatically every day.</p></div><span class="queue-rule">10 + 10 batches</span></div><div class="queue-metrics"><div><small>Fresh waiting</small><b id="queue-fresh-count">0</b></div><div><small>Backlog waiting</small><b id="queue-backlog-count">0</b></div><div><small>Oldest untouched</small><b id="queue-oldest">—</b></div></div><div id="queue-plan" class="queue-plan"></div><div id="queue-active-batch" class="queue-active-batch"></div></section>`);
  ensureCallDialog(); document.querySelector("#crm-user-select")?.addEventListener("change",()=>setTimeout(refreshQueue,0)); window.addEventListener("storage",refreshQueue); refreshQueue(); return true;
}
let attempts=0; const timer=setInterval(()=>{attempts+=1;if(mountQueue()||attempts>50)clearInterval(timer);},100);
