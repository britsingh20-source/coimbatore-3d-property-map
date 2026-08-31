const PRIMARY_CODES = new Set(["VDV","TDM","PMD","VPP","KRM","IDG","SRV","KLP","SLR"]);

function canManage(){
  const role=window.CRM_SESSION?.role?.();
  return role==="administrator"||role==="director";
}

function ensureStyles(){
  if(document.querySelector("#crm-area-management-style"))return;
  const style=document.createElement("style");
  style.id="crm-area-management-style";
  style.textContent=`
    #crm-add-area{border:0;border-radius:11px;padding:9px 12px;background:#135b4e;color:#fff;font-weight:800;cursor:pointer}
    #crm-add-area[hidden]{display:none!important}
    #crm-area-dialog{border:0;border-radius:20px;padding:0;width:min(92vw,440px);box-shadow:0 24px 80px rgba(0,0,0,.28)}
    #crm-area-dialog::backdrop{background:rgba(4,42,35,.55)}
    .crm-area-dialog-card{padding:22px}.crm-area-dialog-card h3{margin:0;color:#114f43}.crm-area-dialog-card p{margin:7px 0 16px;color:#60736f;font-size:13px}
    .crm-area-form{display:grid;gap:13px}.crm-area-form label{display:grid;gap:6px;font-size:12px;font-weight:800;color:#315d54}
    .crm-area-form input{border:1px solid #cadbd6;border-radius:12px;padding:13px 14px;font:inherit}.crm-area-form small{color:#71847f;font-weight:500}
    .crm-area-error{min-height:18px;color:#a12d25;font-size:12px;font-weight:700}.crm-area-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:4px}
    .crm-area-actions button{border:0;border-radius:11px;padding:11px 14px;font-weight:800}.crm-area-cancel{background:#edf4f2;color:#174f45}.crm-area-save{background:#135b4e;color:#fff}
  `;
  document.head.appendChild(style);
}

function ensureDialog(){
  if(document.querySelector("#crm-area-dialog"))return;
  document.body.insertAdjacentHTML("beforeend",`<dialog id="crm-area-dialog"><div class="crm-area-dialog-card"><h3>Add New Area</h3><p>Create a new primary working area. The area code stays permanent once leads are created under it.</p><form id="crm-area-form" class="crm-area-form"><label>Area name<input id="crm-new-area-name" maxlength="80" placeholder="Example: Pollachi" required></label><label>Area code<input id="crm-new-area-code" maxlength="5" autocapitalize="characters" placeholder="Example: PLC" required><small>2–5 letters/numbers. Use a short unique code.</small></label><label>Aliases / spellings (optional)<input id="crm-new-area-aliases" placeholder="Example: Pollachi Town, Polachi"></label><div id="crm-area-error" class="crm-area-error"></div><div class="crm-area-actions"><button type="button" class="crm-area-cancel">Cancel</button><button type="submit" class="crm-area-save">Save Area</button></div></form></div></dialog>`);
  const dialog=document.querySelector("#crm-area-dialog");
  dialog.querySelector(".crm-area-cancel").onclick=()=>dialog.close();
  dialog.querySelector("#crm-new-area-code").addEventListener("input",e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"");});
  dialog.querySelector("#crm-area-form").onsubmit=saveArea;
}

async function saveArea(event){
  event.preventDefault();
  const error=document.querySelector("#crm-area-error"),save=document.querySelector(".crm-area-save");
  error.textContent="";
  const name=document.querySelector("#crm-new-area-name").value.trim();
  const code=document.querySelector("#crm-new-area-code").value.trim().toUpperCase();
  const aliases=document.querySelector("#crm-new-area-aliases").value.split(",").map(v=>v.trim()).filter(Boolean);
  if(!/^[A-Z0-9]{2,5}$/.test(code)){error.textContent="Area code must be 2–5 letters/numbers.";return;}
  if(!window.CRM_SESSION?.api){error.textContent="CRM session is not ready. Please reopen the Leads section.";return;}
  save.disabled=true;save.textContent="Saving…";
  try{
    const result=await window.CRM_SESSION.api("/api/admin/areas",{method:"POST",body:JSON.stringify({name,code,aliases})});
    document.querySelector("#crm-area-dialog").close();
    alert(`${result.reactivated?"Area reactivated":"Area added"}: ${result.area.name} (${result.area.code})`);
    location.reload();
  }catch(e){error.textContent=e.message||"Could not add area";}
  finally{save.disabled=false;save.textContent="Save Area";}
}

function filterDemoCards(){
  const indicator=document.querySelector("#crm-live-indicator");
  if(!indicator||!indicator.textContent.includes("Demo mode"))return;
  document.querySelectorAll("#crm-area-grid [data-area]").forEach(card=>{card.hidden=!PRIMARY_CODES.has(card.dataset.area);});
}

function mount(){
  ensureStyles();ensureDialog();
  const head=document.querySelector(".crm-area-head");
  if(!head)return;
  let button=document.querySelector("#crm-add-area");
  if(!button){
    button=document.createElement("button");button.id="crm-add-area";button.type="button";button.textContent="＋ Add New Area";
    const all=document.querySelector("#crm-show-all-areas");
    if(all?.parentElement===head){
      const wrap=document.createElement("div");wrap.style.display="flex";wrap.style.gap="8px";wrap.style.alignItems="center";
      all.replaceWith(wrap);wrap.append(all,button);
    }else head.appendChild(button);
    button.onclick=()=>{if(!canManage())return;document.querySelector("#crm-area-form").reset();document.querySelector("#crm-area-error").textContent="";document.querySelector("#crm-area-dialog").showModal();};
  }
  button.hidden=!canManage();
  filterDemoCards();
}

["crm-session-login","crm-modules-ready"].forEach(evt=>window.addEventListener(evt,()=>setTimeout(mount,0)));
window.addEventListener("crm-session-logout",()=>{const b=document.querySelector("#crm-add-area");if(b)b.hidden=true;});
const observer=new MutationObserver(()=>mount());
observer.observe(document.body,{childList:true,subtree:true});
setTimeout(mount,200);
