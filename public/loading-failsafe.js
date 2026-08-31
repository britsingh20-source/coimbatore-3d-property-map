(()=>{
  const hideLoader=()=>{
    const el=document.querySelector('#loading');
    if(!el)return false;
    el.classList.add('hidden');
    el.style.pointerEvents='none';
    return true;
  };
  let tries=0;
  const find=setInterval(()=>{
    tries+=1;
    if(hideLoader()||tries>40) clearInterval(find);
  },100);
  setTimeout(hideLoader,2500);
  const observer=new MutationObserver(()=>{
    const gate=document.querySelector('#staff-login-gate.show');
    const admin=document.querySelector('#admin-panel:not([hidden])');
    if(gate||admin) hideLoader();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
})();
