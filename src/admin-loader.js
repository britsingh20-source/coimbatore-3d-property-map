let crmLoadPromise = null;

async function loadCRM(){
  if(crmLoadPromise) return crmLoadPromise;
  crmLoadPromise = (async()=>{
    document.body.classList.add('crm-loading');
    try{
      await import('./lead-crm.js');
      await import('./crm-team.js');
      await import('./telecaller-session.js');
      await import('./admin-gate-policy.js');
      await import('./session-header-fix.js');
      await import('./work-hours-visibility.js');
      await import('./queue-phone-display.js');
      await import('./crm-queue.js');
      await import('./area-selector.js');
      await import('./manual-lead-intake.js');
      await import('./area-management.js');
      await import('./crm-backup.js');
      await import('./daily-lead-import.js');
      await import('./director-view.js');
      await import('./supervisor-performance.js');
      window.dispatchEvent(new CustomEvent('crm-modules-ready'));
    } finally {
      document.body.classList.remove('crm-loading');
    }
  })();
  return crmLoadPromise;
}

function wireAdminLoader(){
  const open=document.querySelector('#admin-open');
  if(!open){setTimeout(wireAdminLoader,50);return;}
  open.addEventListener('click',()=>{loadCRM().catch(err=>console.error('CRM load failed',err));},{passive:true});
  const panel=document.querySelector('#admin-panel');
  if(panel && !panel.hidden) loadCRM().catch(err=>console.error('CRM load failed',err));
}

wireAdminLoader();
window.loadPropertyCRM=loadCRM;
