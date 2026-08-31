function showOwnHoursPanel(){
  const panel=document.querySelector("#work-hours-panel");
  if(!panel||!document.body.classList.contains("staff-session-active"))return;
  panel.classList.add("show");
}
window.addEventListener("crm-session-login",()=>setTimeout(showOwnHoursPanel,50));
window.addEventListener("crm-session-logout",()=>document.querySelector("#work-hours-panel")?.classList.remove("show"));
const observer=new MutationObserver(showOwnHoursPanel);
observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
setInterval(showOwnHoursPanel,1500);
