const API_BASE=window.LEAD_API_BASE||"";
const TOKEN_KEY="crm-telecaller-session-token";

function token(){return localStorage.getItem(TOKEN_KEY)||"";}
function todayIST(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function prettyDate(key){const [y,m,d]=key.split("-");return `${d}-${m}-${y}`;}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
async function api(path,options={}){
  const t=token();
  const r=await fetch(API_BASE+path,{...options,headers:{"content-type":"application/json",...(t?{authorization:`Bearer ${t}`}:{}) ,...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"Request failed");
  return data;
}
function ensureUI(){
  const root=document.querySelector("#admin-leads");
  if(!root||document.querySelector("#manual-lead-button"))return false;
  const head=root.querySelector(".crm-head");if(!head)return false;
  head.querySelector(":scope > div:last-child")?.insertAdjacentHTML("afterbegin",`<button id="manual-lead-button" type="button" style="border:0;border-radius:12px;padding:10px 14px;background:#135b4e;color:#fff;font-weight:800;margin-right:8px">+ New Lead</button>`);
  document.body.insertAdjacentHTML("beforeend",`<dialog id="manual-lead-dialog" style="border:0;border-radius:22px;padding:0;width:min(94vw,520px);box-shadow:0 24px 80px rgba(0,0,0,.28)"><form id="manual-lead-form" style="padding:22px;display:grid;gap:14px"><div><small style="font-weight:800;color:#176454">MANUAL INCOMING LEAD</small><h3 style="margin:5px 0 4px;color:#124f43">Add incoming call</h3><p style="margin:0;color:#667b76;font-size:13px">Received date: <b id="manual-received-date"></b> · Saved as <b>Fresh today</b>. Tomorrow it automatically becomes backlog/old.</p></div><label style="display:grid;gap:6px;font-weight:700;font-size:13px">Phone number *<input id="manual-phone" inputmode="tel" required placeholder="Customer phone" style="padding:13px;border:1px solid #cbded9;border-radius:12px;font:inherit"></label><label style="display:grid;gap:6px;font-weight:700;font-size:13px">Customer name<input id="manual-name" placeholder="Optional at intake" style="padding:13px;border:1px solid #cbded9;border-radius:12px;font:inherit"></label><label style="display:grid;gap:6px;font-weight:700;font-size:13px">Source<select id="manual-source" style="padding:13px;border:1px solid #cbded9;border-radius:12px;font:inherit"><option>P SIM incoming call</option><option>WhatsApp Business</option><option>Referral</option><option>Website</option><option>Walk-in</option><option>Other manual lead</option></select></label><label style="display:grid;gap:6px;font-weight:700;font-size:13px">Preferred area / location<input id="manual-area" placeholder="Example: Idigarai to Vellakinar" style="padding:13px;border:1px solid #cbded9;border-radius:12px;font:inherit"></label><label style="display:grid;gap:6px;font-weight:700;font-size:13px">Requirement / quick note<textarea id="manual-requirement" rows="3" placeholder="Optional. Telecaller can complete details later." style="padding:13px;border:1px solid #cbded9;border-radius:12px;font:inherit;resize:vertical"></textarea></label><div id="manual-lead-result" style="min-height:20px;font-size:13px;font-weight:700"></div><div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" id="manual-cancel" style="padding:12px 16px;border:0;border-radius:12px;background:#eef4f2;font-weight:800">Cancel</button><button type="submit" id="manual-save" style="padding:12px 16px;border:0;border-radius:12px;background:#135b4e;color:white;font-weight:800">Save Incoming Lead</button></div></form></dialog>`);
  const dialog=document.querySelector("#manual-lead-dialog"),form=document.querySelector("#manual-lead-form"),result=document.querySelector("#manual-lead-result"),save=document.querySelector("#manual-save");
  document.querySelector("#manual-lead-button").onclick=()=>{document.querySelector("#manual-received-date").textContent=prettyDate(todayIST());result.textContent="";dialog.showModal();setTimeout(()=>document.querySelector("#manual-phone")?.focus(),50);};
  document.querySelector("#manual-cancel").onclick=()=>dialog.close();
  form.onsubmit=async e=>{
    e.preventDefault();save.disabled=true;save.textContent="Saving…";result.textContent="";
    try{
      const data=await api("/api/leads/manual",{method:"POST",body:JSON.stringify({phone:document.querySelector("#manual-phone").value,name:document.querySelector("#manual-name").value,source:document.querySelector("#manual-source").value,area_text:document.querySelector("#manual-area").value,requirement:document.querySelector("#manual-requirement").value})});
      if(data.duplicate){result.style.color="#8a5a13";result.textContent=`Existing customer found. New incoming-call event added for ${prettyDate(data.received_date)} — no duplicate customer created.`;}
      else{result.style.color="#176454";result.textContent=`New lead saved for ${prettyDate(data.received_date)} as FRESH / UNCALLED.`;}
      form.reset();setTimeout(()=>{dialog.close();window.dispatchEvent(new CustomEvent("crm-manual-lead-added",{detail:data}));location.reload();},1100);
    }catch(err){result.style.color="#a12d25";result.textContent=err.message;}
    finally{save.disabled=false;save.textContent="Save Incoming Lead";}
  };
  return true;
}
function boot(){if(ensureUI())return;setTimeout(boot,250);}
boot();
