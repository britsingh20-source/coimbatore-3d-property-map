(()=>{
  const hideLoader=()=>{
    const el=document.querySelector('#loading');
    if(!el)return false;
    el.classList.add('hidden');
    el.style.pointerEvents='none';
    return true;
  };
  let tries=0;
  const finder=setInterval(()=>{
    tries+=1;
    if(hideLoader()||tries>=15) clearInterval(finder);
  },100);
  setTimeout(hideLoader,1200);
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#admin-open')) hideLoader();
  },true);
})();
