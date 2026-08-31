const TEAM = [
  { id: "telecaller-1", label: "Telecaller 1", role: "telecaller", stage: "Categorize incoming leads" },
  { id: "telecaller-2", label: "Telecaller 2", role: "telecaller", stage: "Categorize incoming leads" },
  { id: "manager-1", label: "Manager 1", role: "manager", stage: "Channelize & convert qualified leads" },
  { id: "manager-2", label: "Manager 2", role: "manager", stage: "Channelize & convert qualified leads" },
  { id: "administrator", label: "Administrator", role: "administrator", stage: "Assign, control & audit" },
  { id: "director", label: "Director", role: "director", stage: "Full visibility & performance" }
];

const TELECALLER_RESULTS = ["Uncalled", "Categorized", "No Response", "Busy", "Not Interested", "Wrong Number"];
const MANAGER_RESULTS = ["Interested", "Hot", "Follow-up", "Site Visit", "Not Interested", "Closed"];
const ALL_RESULTS = ["Uncalled", "Categorized", "Interested", "Hot", "Follow-up", "Site Visit", "No Response", "Busy", "Not Interested", "Wrong Number", "Closed"];
function storedUser(){const raw=localStorage.getItem("crm-current-user");if(!raw)return null;try{const p=JSON.parse(raw);return p?.user_label||p?.label||raw;}catch{return raw;}}
function roleFor(label) { return TEAM.find((member) => member.label === label)?.role || "telecaller"; }
function allowedResults(role) { if (role === "telecaller") return TELECALLER_RESULTS; if (role === "manager") return MANAGER_RESULTS; return ALL_RESULTS; }
function updateCallResultOptions(label) { const select=document.querySelector("#crm-modal-status,#crm-dialog-status");if(!select)return;const current=select.value,values=allowedResults(roleFor(label));select.innerHTML=values.map(v=>`<option>${v}</option>`).join("");if(values.includes(current))select.value=current; }

function mountTeamArchitecture() {
  const selector=document.querySelector("#crm-user-select"),header=document.querySelector(".crm-head,.crm-header");if(!selector||!header)return false;
  selector.innerHTML=TEAM.map(member=>`<option value="${member.label}">${member.label}</option>`).join("");
  const saved=storedUser();selector.value=TEAM.some(m=>m.label===saved)?saved:"Administrator";updateCallResultOptions(selector.value);
  if(!document.querySelector("#crm-team-flow"))header.insertAdjacentHTML("afterend",`<section id="crm-team-flow" class="crm-team-flow" aria-label="Lead handling workflow"><div><span>1</span><b>Incoming Lead</b><small>Phone number only</small></div><i>→</i><div><span>2</span><b>Telecaller ×2</b><small>Timed login · current 10 · categorize</small></div><i>→</i><div><span>3</span><b>Manager ×2</b><small>Channelize, follow-up & convert</small></div><i>→</i><div><span>4</span><b>Admin + Director</b><small>Assignment, audit & full monitoring</small></div></section>`);
  selector.addEventListener("change",event=>{localStorage.setItem("crm-current-user",JSON.stringify({user_label:event.target.value}));updateCallResultOptions(event.target.value);window.dispatchEvent(new CustomEvent("crm-user-changed",{detail:{user:event.target.value,role:roleFor(event.target.value)}}));});
  const modal=document.querySelector("#crm-lead-modal,#crm-lead-dialog");if(modal)modal.addEventListener("click",()=>updateCallResultOptions(selector.value));
  window.dispatchEvent(new CustomEvent("crm-user-changed",{detail:{user:selector.value,role:roleFor(selector.value)}}));
  return true;
}
let attempts=0;const timer=window.setInterval(()=>{attempts+=1;if(mountTeamArchitecture()||attempts>60)window.clearInterval(timer);},100);
