const API_BASE=window.LEAD_API_BASE||"";
let areaMaster=[];
let selectedArea=null;

function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
function norm(v=""){return String(v).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"");}
function score(area,q){
  const n=norm(q);if(!n)return 999;
  const values=[area.name,area.code,...(area.aliases||[])].map(norm);
  let best=999;
  for(const v of values){if(v===n)best=Math.min(best,0);else if(v.startsWith(n))best=Math.min(best,1);else if(v.includes(n))best=Math.min(best,2);else if(n.includes(v))best=Math.min(best,3);}
  return best;
}
function priorityText(area){
  if(area.priority_band&&area.distance_from_idigarai_km!=null)return `${area.priority_band} · ${Number(area.distance_from_idigarai_km).toFixed(1)} km from Idigarai`;
  if(area.priority_band)return area.priority_band;
  return "Distance priority pending verification";
}
async function loadAreas(){
  if(!API_BASE)return;
  try{const r=await fetch(`${API_BASE}/api/areas`);if(!r.ok)return;const d=await r.json();areaMaster=d.areas||[];}catch(_){}
}
function ensureStyles(){
  if(document.querySelector("#area-selector-style"))return;
  document.head.insertAdjacentHTML("beforeend",`<style id="area-selector-style">
  .smart-area-wrap{position:relative}.smart-area-suggestions{position:absolute;left:0;right:0;top:100%;z-index:500;background:#fff;border:1px solid #cadbd6;border-radius:12px;box-shadow:0 14px 30px rgba(10,59,49,.16);max-height:240px;overflow:auto;margin-top:4px;display:none}.smart-area-suggestions.show{display:block}.smart-area-option{width:100%;text-align:left;border:0;border-bottom:1px solid #edf3f1;background:#fff;padding:11px 12px;display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center}.smart-area-option:hover,.smart-area-option:focus{background:#f0f8f5}.smart-area-code{font-size:11px;font-weight:900;color:#0e5a4c;background:#e8f4f0;border-radius:7px;padding:5px 7px}.smart-area-option b{font-size:13px;color:#173f37}.smart-area-option small{display:block;font-size:10px;color:#71837e;margin-top:2px}.smart-area-priority{font-size:10px;font-weight:800;color:#8a6422}.smart-area-selected{display:none;margin-top:6px;padding:7px 9px;border-radius:9px;background:#edf7f4;color:#165548;font-size:11px}.smart-area-selected.show{display:block}
  </style>`);
}
function renderSuggestions(input,box){
  const q=input.value.trim();
  if(!q){box.classList.remove("show");box.innerHTML="";return;}
  const matches=areaMaster.map(a=>({a,s:score(a,q)})).filter(x=>x.s<999).sort((x,y)=>x.s-y.s||x.a.name.localeCompare(y.a.name)).slice(0,8);
  box.innerHTML=matches.length?matches.map(({a})=>`<button type="button" class="smart-area-option" data-area-code="${safe(a.code)}"><span class="smart-area-code">${safe(a.code)}</span><span><b>${safe(a.name)}</b><small>${safe(a.zone||"Coimbatore")}</small></span><span class="smart-area-priority">${safe(priorityText(a))}</span></button>`).join(""):`<div style="padding:12px;font-size:12px;color:#6b7e78">No exact area found. Keep the customer wording; the backend will attempt canonical matching.</div>`;
  box.classList.add("show");
  box.querySelectorAll("[data-area-code]").forEach(btn=>btn.onclick=()=>{
    selectedArea=areaMaster.find(a=>a.code===btn.dataset.areaCode)||null;
    if(!selectedArea)return;
    input.value=selectedArea.name;
    input.dataset.areaCode=selectedArea.code;
    const tag=input.closest(".smart-area-wrap")?.querySelector(".smart-area-selected");
    if(tag){tag.textContent=`${selectedArea.code} · ${selectedArea.name} · ${priorityText(selectedArea)}`;tag.classList.add("show");}
    box.classList.remove("show");
  });
}
function upgrade(){
  const input=document.querySelector("#qf-area");if(!input||input.dataset.smartAreaReady)return false;
  input.dataset.smartAreaReady="1";input.placeholder="Type area — suggestions will appear";
  const parent=input.parentElement;const wrap=document.createElement("div");wrap.className="smart-area-wrap";parent.insertBefore(wrap,input);wrap.appendChild(input);
  const box=document.createElement("div");box.className="smart-area-suggestions";wrap.appendChild(box);
  const selected=document.createElement("div");selected.className="smart-area-selected";wrap.appendChild(selected);
  input.addEventListener("input",()=>{selectedArea=null;delete input.dataset.areaCode;selected.classList.remove("show");renderSuggestions(input,box);});
  input.addEventListener("focus",()=>renderSuggestions(input,box));
  document.addEventListener("click",e=>{if(!wrap.contains(e.target))box.classList.remove("show");});
  return true;
}

ensureStyles();
loadAreas().then(()=>upgrade());
let tries=0;const timer=setInterval(()=>{tries++;if(upgrade()||tries>80)clearInterval(timer);},150);
window.addEventListener("crm-session-login",()=>loadAreas().then(()=>upgrade()));
