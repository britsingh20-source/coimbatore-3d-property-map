function storedLabel(){
  const raw=localStorage.getItem("crm-current-user");
  if(!raw)return "";
  try{const value=JSON.parse(raw);return value?.user_label||value?.label||value||"";}catch{return raw;}
}
function openDirectorLeads(){
  if(storedLabel()!=="Director")return;
  const leads=document.querySelector("#admin-leads");
  const button=document.querySelector('[data-admin-section="leads"]');
  if(!leads||!button){setTimeout(openDirectorLeads,100);return;}
  document.querySelectorAll(".admin-section").forEach(section=>section.classList.toggle("active",section===leads));
  document.querySelectorAll("[data-admin-section]").forEach(item=>item.classList.toggle("active",item===button));
  const content=document.querySelector(".admin-content");if(content)content.scrollTop=0;
}
window.addEventListener("crm-session-login",()=>setTimeout(openDirectorLeads,80));
window.addEventListener("crm-admin-open",()=>setTimeout(openDirectorLeads,80));
window.addEventListener("crm-user-changed",event=>{if(event?.detail?.user==="Director")setTimeout(openDirectorLeads,30);});
setTimeout(openDirectorLeads,700);
