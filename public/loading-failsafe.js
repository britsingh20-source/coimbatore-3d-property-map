(()=>{
  const startedAt=Date.now();
  let loaderSeenAt=0;
  let finished=false;

  const hideLoader=()=>{
    const el=document.querySelector('#loading');
    if(!el)return false;
    if(!loaderSeenAt) loaderSeenAt=Date.now();
    el.classList.add('hidden');
    el.style.pointerEvents='none';
    el.setAttribute('aria-hidden','true');
    finished=true;
    return true;
  };

  const check=()=>{
    const el=document.querySelector('#loading');
    if(el && !loaderSeenAt) loaderSeenAt=Date.now();
    if(el && Date.now()-loaderSeenAt>=2500) hideLoader();
    if(!finished && Date.now()-startedAt<20000) requestAnimationFrame(check);
  };

  requestAnimationFrame(check);

  const observer=new MutationObserver(()=>{
    const el=document.querySelector('#loading');
    if(!el)return;
    if(!loaderSeenAt) loaderSeenAt=Date.now();
    setTimeout(hideLoader,2500);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  window.addEventListener('load',()=>setTimeout(hideLoader,2500),{once:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') setTimeout(hideLoader,500);
  });
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#admin-open,#staff-login-button,.staff-login-button')) hideLoader();
  },true);

  setTimeout(()=>{
    hideLoader();
    observer.disconnect();
  },20000);
})();
