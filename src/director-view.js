function currentUser(){
  return window.CRM_SESSION?.user?.() || (()=>{
    const raw=localStorage.getItem("crm-current-user");
    if(!raw)return "";
    try{const value=JSON.parse(raw);return value?.user_label||value?.label||value||"";}catch{return raw;}
  })();
}
function currentRole(){
  return window.CRM_SESSION?.role?.() || "";
}
function isSupervisorSession(){
  const role=currentRole();
  const user=currentUser();
  return ["manager","administrator","director"].includes(role) ||
    ["Manager 1","Manager 2","Administrator","Director"].includes(user);
}
function openSupervisorLeads(){
  if(!isSupervisorSession())return;
  const leads=document.querySelector("#admin-leads");
  const button=document.querySelector('[data-admin-section="leads"]');
  if(!leads||!button){setTimeout(openSupervisorLeads,100);return;}
  document.querySelectorAll(".admin-section").forEach(section=>section.classList.toggle("active",section===leads));
  document.querySelectorAll("[data-admin-section]").forEach(item=>item.classList.toggle("active",item===button));
  const panel=document.querySelector("#admin-panel");
  if(panel)panel.hidden=false;
  document.body.classList.add("admin-mode");
  const content=document.querySelector(".admin-content");if(content)content.scrollTop=0;
}
window.addEventListener("crm-session-login",event=>{
  const role=event?.detail?.role||"";
  if(["manager","administrator","director"].includes(role)) setTimeout(openSupervisorLeads,60);
});
window.addEventListener("crm-admin-open",()=>setTimeout(openSupervisorLeads,80));
window.addEventListener("crm-user-changed",()=>setTimeout(openSupervisorLeads,30));
window.addEventListener("crm-modules-ready",()=>setTimeout(openSupervisorLeads,80));
setTimeout(openSupervisorLeads,700);
