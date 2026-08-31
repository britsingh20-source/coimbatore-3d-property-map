const batchState={leads:[]};
const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const response=await nativeFetch(input,init);
  try{
    const url=typeof input==="string"?input:(input?.url||"");
    if(url.includes("/api/telecaller/batch")&&response.ok){
      const data=await response.clone().json();
      batchState.leads=Array.isArray(data?.leads)?data.leads:[];
      window.__CRM_BATCH_LEADS=batchState.leads;
      setTimeout(renderPhones,0);
    }
  }catch(_){}
  return response;
};
function phoneFor(lead){return lead?.display_phone||lead?.phone||"";}
function renderPhones(){
  const cards=[...document.querySelectorAll("#queue-active-batch .queue-batch-list article")];
  if(!cards.length||!batchState.leads.length)return;
  cards.forEach((card,index)=>{
    const lead=batchState.leads[index];
    const phone=phoneFor(lead);
    if(!phone)return;
    let line=card.querySelector(".queue-visible-phone");
    if(!line){
      line=document.createElement("a");
      line.className="queue-visible-phone";
      const info=card.querySelector("div");
      if(info)info.insertBefore(line,info.querySelector("em")||null);
    }
    const href=`tel:${String(lead.phone||phone).replace(/\s/g,"")}`;
    const text=`☎ ${phone}`;
    if(line.getAttribute("href")!==href) line.setAttribute("href",href);
    if(line.textContent!==text) line.textContent=text;
    const aria=`Call ${phone}`;
    if(line.getAttribute("aria-label")!==aria) line.setAttribute("aria-label",aria);
  });
}
const style=document.createElement("style");
style.textContent=`.queue-visible-phone{display:block;margin:6px 0 4px;color:#075f50;font-size:17px;font-weight:900;text-decoration:none;letter-spacing:.02em}.queue-visible-phone:active{opacity:.7}@media(max-width:600px){.queue-visible-phone{font-size:18px;padding:3px 0}}`;
document.head.appendChild(style);
let scheduled=false;
const observer=new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;renderPhones();});
});
observer.observe(document.body,{subtree:true,childList:true});
window.addEventListener("crm-session-login",()=>setTimeout(renderPhones,250));
