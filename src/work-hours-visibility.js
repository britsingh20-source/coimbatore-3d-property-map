function showOwnHoursPanel(){
  const panel=document.querySelector("#work-hours-panel");
  if(!panel||!document.body.classList.contains("staff-session-active"))return;
  panel.classList.add("show");
}
function hideOwnHoursPanel(){document.querySelector("#work-hours-panel")?.classList.remove("show");}
window.addEventListener("crm-session-login",()=>setTimeout(showOwnHoursPanel,50));
window.addEventListener("crm-session-logout",hideOwnHoursPanel);
window.addEventListener("crm-admin-open",()=>setTimeout(showOwnHoursPanel,50));
setTimeout(showOwnHoursPanel,800);
