const gate=()=>document.querySelector('#staff-login-gate');
const isAdminOpen=()=>document.body.classList.contains('admin-mode') && !document.querySelector('#admin-panel')?.hidden;
const hasSession=()=>Boolean(
  window.CRM_SESSION?.session?.()?.user_label ||
  window.CRM_SESSION?.employeeId?.() ||
  window.CRM_SESSION?.token?.() ||
  localStorage.getItem('crm-telecaller-session-token')
);

function hideGateOutsideAdmin(){
  if(!isAdminOpen()) gate()?.classList.remove('show');
}
function enforceAdminGate(){
  const el=gate();
  if(!el) return;
  if(isAdminOpen() && !hasSession()) el.classList.add('show');
  else el.classList.remove('show');
}
function bind(){
  document.querySelector('#admin-open')?.addEventListener('click',()=>{
    setTimeout(()=>{enforceAdminGate();window.dispatchEvent(new CustomEvent('crm-admin-open'));},0);
  });
  document.querySelector('#admin-close')?.addEventListener('click',()=>setTimeout(hideGateOutsideAdmin,0));
  document.querySelector('#customer-panel-tab')?.addEventListener('click',()=>setTimeout(hideGateOutsideAdmin,0));
  window.addEventListener('crm-session-login',()=>setTimeout(enforceAdminGate,0));
  window.addEventListener('crm-session-logout',()=>setTimeout(enforceAdminGate,0));
  setTimeout(hideGateOutsideAdmin,420);
  setTimeout(hideGateOutsideAdmin,1000);
}

bind();
