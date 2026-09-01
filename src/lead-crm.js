import "./lead-crm.css";

const API_BASE = window.LEAD_API_BASE || "";

const DEMO_AREAS = [
  ["IDG", "Idigarai"], ["PMD", "Pannimadai"], ["KRM", "Karamadai"], ["PGL", "Pogalur"],
  ["AMR", "Annur–Mettupalayam Road"], ["SNG", "Singanallur"], ["IRG", "Irugur"], ["PLM", "Peelamedu"],
  ["KLP", "Kalapatti"], ["SLR", "Sulur"], ["VDV", "Vadavalli"], ["VPD", "Veerappandi"]
].map(([code, name]) => ({ code, name }));

const DEMO_LEADS = [
  ["IDG-0001", "Demo Customer A", "9000000001", "IDG", "Hot", "Telecaller 1", "3 BHK villa · ₹55L"],
  ["IDG-0002", "Demo Customer B", "9000000002", "IDG", "Follow-up", "Telecaller 2", "Plot · 4 cents"],
  ["PMD-0001", "Demo Customer C", "9000000003", "PMD", "Uncalled", "", "2 BHK · ₹45L"],
  ["KRM-0001", "Demo Customer D", "9000000004", "KRM", "No Response", "Telecaller 1", "Plot near main road"],
  ["PGL-0001", "Demo Customer E", "9000000005", "PGL", "Site Visit", "Telecaller 3", "Villa · weekend visit"],
  ["AMR-0001", "Demo Customer F", "9000000006", "AMR", "Uncalled", "", "Land enquiry"],
  ["SNG-0001", "Demo Customer G", "9000000007", "SNG", "Hot", "Telecaller 2", "Ready-to-move"],
  ["IRG-0001", "Demo Customer H", "9000000008", "IRG", "Follow-up", "Telecaller 4", "Budget ₹60L"],
  ["PLM-0001", "Demo Customer I", "9000000009", "PLM", "Uncalled", "", "Apartment enquiry"],
  ["KLP-0001", "Demo Customer J", "9000000010", "KLP", "Hot", "Telecaller 1", "Plot · TEX Park side"]
].map(([lead_code, name, phone, area_code, status, assigned_to, requirement], index) => ({
  id: "demo-" + (index + 1), lead_code, name, phone, area_code, status, assigned_to, requirement,
  first_received_at: "2026-08-" + String(23 + (index % 7)).padStart(2, "0") + "T10:00:00+05:30",
  last_contact_at: status === "Uncalled" ? null : "2026-08-30T16:30:00+05:30",
  follow_up_at: status === "Follow-up" ? "2026-08-31T15:00:00+05:30" : null,
  notes: status === "Hot" ? "Customer is ready for matching options." : ""
}));

const STATUS_OPTIONS = ["Uncalled", "Interested", "Hot", "Follow-up", "Site Visit", "No Response", "Busy", "Not Interested", "Wrong Number", "Closed"];
const STATUS_FILTERS = ["All", "Uncalled", "Hot", "Follow-up", "Site Visit", "No Response", "Closed"];
function storedUser(){
  const raw=localStorage.getItem("crm-current-user");
  if(!raw)return "Telecaller 1";
  try{const parsed=JSON.parse(raw);return parsed?.user_label||parsed?.label||raw;}catch{return raw;}
}
let areas = [];
let leads = [];
let currentArea = "ALL";
let currentStatus = "All";
let currentSearch = "";
let selectedLead = null;
let currentUser = storedUser();

async function api(path, options = {}) {
  if (!API_BASE && location.hostname.includes("github.io")) throw new Error("API not configured");
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function loadData() {
  try {
    const [areaData, leadData] = await Promise.all([api("/api/areas"), api("/api/leads")]);
    areas = areaData.areas || areaData;
    leads = leadData.leads || leadData;
    document.querySelector("#crm-live-indicator").innerHTML = "<i></i> Live D1";
  } catch (error) {
    areas = DEMO_AREAS;
    const saved = localStorage.getItem("lead-crm-demo-data");
    leads = saved ? JSON.parse(saved) : DEMO_LEADS;
    document.querySelector("#crm-live-indicator").innerHTML = "<i></i> Demo mode";
  }
  renderAll();
}

function saveDemo() {
  if (leads.some((lead) => String(lead.id).startsWith("demo-"))) {
    localStorage.setItem("lead-crm-demo-data", JSON.stringify(leads));
  }
}

function areaName(code) {
  return areas.find((area) => area.code === code)?.name || code || "Unassigned";
}

function leadName(lead) {
  return lead?.name || lead?.customer_name || lead?.contact_name || "Name not captured";
}

function leadPhone(lead) {
  return lead?.display_phone || lead?.phone || lead?.mobile || lead?.phone_number || "No phone";
}

function filteredLeads() {
  return leads.filter((lead) => {
    const matchesArea = currentArea === "ALL" || lead.area_code === currentArea;
    const matchesStatus = currentStatus === "All" || lead.status === currentStatus;
    const haystack = `${lead.lead_code || ""} ${leadName(lead)} ${leadPhone(lead)} ${lead.requirement || ""}`.toLowerCase();
    return matchesArea && matchesStatus && haystack.includes(currentSearch.toLowerCase());
  });
}

function countStatus(status) {
  return leads.filter((lead) => status === "All" || lead.status === status).length;
}

function renderDashboard() {
  const stats = [
    ["Total Leads", leads.length, "All"], ["Uncalled", countStatus("Uncalled"), "Uncalled"],
    ["Hot Leads", countStatus("Hot"), "Hot"], ["Follow-up", countStatus("Follow-up"), "Follow-up"],
    ["Site Visits", countStatus("Site Visit"), "Site Visit"], ["No Response", countStatus("No Response"), "No Response"]
  ];
  document.querySelector("#crm-kpis").innerHTML = stats.map(([label, value, filter]) =>
    `<button data-kpi="${filter}" class="crm-kpi ${currentStatus === filter ? "active" : ""}"><small>${label}</small><b>${value}</b><span>View →</span></button>`
  ).join("");
  document.querySelectorAll("[data-kpi]").forEach((button) => button.onclick = () => {
    currentStatus = button.dataset.kpi;
    renderAll();
  });
}

function renderAreas() {
  const cards = areas.map((area) => {
    const areaLeads = leads.filter((lead) => lead.area_code === area.code);
    const hot = areaLeads.filter((lead) => lead.status === "Hot").length;
    const uncalled = areaLeads.filter((lead) => lead.status === "Uncalled").length;
    const follow = areaLeads.filter((lead) => lead.status === "Follow-up").length;
    return `<button class="crm-area-card ${currentArea === area.code ? "active" : ""}" data-area="${area.code}">
      <div><span class="crm-area-code">${area.code}</span><small>${area.name}</small></div>
      <b>${areaLeads.length}</b>
      <footer><span>${hot} hot</span><span>${follow} follow-up</span><span>${uncalled} uncalled</span></footer>
    </button>`;
  });
  document.querySelector("#crm-area-grid").innerHTML = cards.join("");
  document.querySelectorAll("[data-area]").forEach((button) => button.onclick = () => {
    currentArea = currentArea === button.dataset.area ? "ALL" : button.dataset.area;
    renderAll();
  });
}

function renderLeadList() {
  const visible = filteredLeads();
  document.querySelector("#crm-lead-count").textContent = `${visible.length} leads`;
  document.querySelector("#crm-lead-list").innerHTML = visible.map((lead) => `
    <article class="crm-lead-row" data-lead="${lead.id}">
      <div><b>${leadName(lead)}</b><small>${lead.lead_code || "No code"} · ${leadPhone(lead)}</small></div>
      <span>${areaName(lead.area_code)}</span><span class="crm-status ${String(lead.status).toLowerCase().replace(/\s+/g, "-")}">${lead.status}</span>
      <button data-open-lead="${lead.id}">Open →</button>
    </article>`).join("") || `<div class="crm-empty">No leads match this filter.</div>`;
  document.querySelectorAll("[data-open-lead]").forEach((button) => button.onclick = () => openLead(button.dataset.openLead));
}

function renderLeadDialog(lead) {
  const modal = document.querySelector("#crm-lead-dialog");
  const phone = leadPhone(lead);
  document.querySelector("#crm-dialog-content").innerHTML = `
    <div class="crm-dialog-head"><div><small>${lead.lead_code || "UNASSIGNED"}</small><h3>${leadName(lead)}</h3><a href="tel:${lead.phone || phone}">☎ ${phone}</a></div><span>${lead.status || "Uncalled"}</span></div>
    <div class="crm-dialog-grid"><p><small>Area</small><b>${areaName(lead.area_code)}</b></p><p><small>Assigned to</small><b>${lead.assigned_to || lead.telecaller_assigned_to || lead.manager_assigned_to || "Unassigned"}</b></p><p><small>Requirement</small><b>${lead.requirement || "—"}</b></p><p><small>Received</small><b>${lead.first_received_at || lead.last_received_at || "—"}</b></p><p><small>Last contact</small><b>${lead.last_contact_at || "Never"}</b></p><p><small>Property type</small><b>${lead.property_type || "—"}</b></p><p><small>Budget</small><b>${lead.budget || "—"}</b></p><p><small>Preferred area</small><b>${lead.area_text || areaName(lead.area_code) || "—"}</b></p></div>
    <label>Status<select id="crm-dialog-status">${STATUS_OPTIONS.map((option) => `<option ${option === lead.status ? "selected" : ""}>${option}</option>`).join("")}</select></label>
    <label>Notes<textarea id="crm-dialog-notes" rows="4">${lead.notes || ""}</textarea></label>
    <label>Follow-up<input id="crm-dialog-followup" type="datetime-local" value="${lead.follow_up_at ? String(lead.follow_up_at).slice(0, 16) : ""}"></label>
    <div class="crm-dialog-actions"><button data-crm-close>Cancel</button><button id="crm-save-lead" class="primary">Save Lead</button></div>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("[data-crm-close]").onclick = () => modal.close();
  modal.querySelector("#crm-save-lead").onclick = saveSelectedLead;
}

async function openLead(id) {
  selectedLead = leads.find((lead) => String(lead.id) === String(id));
  if (!selectedLead) return;
  renderLeadDialog(selectedLead);
  if (String(selectedLead.id).startsWith("demo-")) return;
  try {
    const detail = await api(`/api/leads/${selectedLead.id}`);
    if (detail?.lead) {
      selectedLead = { ...selectedLead, ...detail.lead };
      const index = leads.findIndex((lead) => String(lead.id) === String(selectedLead.id));
      if (index >= 0) leads[index] = selectedLead;
      renderLeadDialog(selectedLead);
      renderLeadList();
    }
  } catch (error) {
    console.warn("Could not refresh lead detail", error);
  }
}

async function saveSelectedLead() {
  if (!selectedLead) return;
  const payload = {
    status: document.querySelector("#crm-dialog-status").value,
    notes: document.querySelector("#crm-dialog-notes").value,
    follow_up_at: document.querySelector("#crm-dialog-followup").value || null
  };
  try {
    let saved = null;
    if (!String(selectedLead.id).startsWith("demo-")) saved = await api(`/api/leads/${selectedLead.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    if (saved?.lead) Object.assign(selectedLead, saved.lead); else Object.assign(selectedLead, payload);
    saveDemo();
    document.querySelector("#crm-lead-dialog").close();
    renderAll();
  } catch (error) { alert("Could not save lead: " + error.message); }
}

function renderAll() { renderDashboard(); renderAreas(); renderLeadList(); }

function mountCRM() {
  const adminContent = document.querySelector(".admin-content");
  const overview = document.querySelector("#admin-overview");
  if (!adminContent || !overview || document.querySelector("#admin-leads")) return;
  const userOptions = ["Telecaller 1", "Telecaller 2", "Manager 1", "Manager 2", "Administrator", "Director"];
  overview.insertAdjacentHTML("afterend", `<section id="admin-leads" class="admin-section crm-section"><div class="crm-head"><div><small>LIVE CRM</small><h2>Lead workspace</h2></div><div><span id="crm-live-indicator"><i></i> Connecting…</span><select id="crm-user-select">${userOptions.map((user) => `<option ${user === currentUser ? "selected" : ""}>${user}</option>`).join("")}</select></div></div><div id="crm-team-flow"></div><div id="crm-kpis" class="crm-kpis"></div><div class="crm-area-head"><div><small>AREA-FIRST PIPELINE</small><h3>Lead Map by Area</h3></div><button id="crm-show-all-areas">All Areas</button></div><div id="crm-area-grid" class="crm-area-grid"></div><div class="crm-toolbar"><div>${STATUS_FILTERS.map((status) => `<button data-status="${status}" class="${status === currentStatus ? "active" : ""}">${status}</button>`).join("")}</div><input id="crm-search" placeholder="Search phone, customer or requirement"></div><div class="crm-list-head"><h3>Customers</h3><span id="crm-lead-count"></span></div><div id="crm-lead-list"></div></section>`);
  document.querySelector(".admin-segments").insertAdjacentHTML("beforeend", `<button data-admin-section="leads"><span>☎</span>Leads</button>`);
  document.querySelector("#crm-user-select").onchange = (event) => { currentUser = event.target.value; localStorage.setItem("crm-current-user", JSON.stringify({user_label:currentUser})); window.dispatchEvent(new CustomEvent("crm-user-changed", { detail: { user: currentUser } })); };
  document.querySelector("#crm-show-all-areas").onclick = () => { currentArea = "ALL"; renderAll(); };
  document.querySelectorAll("[data-status]").forEach((button) => button.onclick = () => { currentStatus = button.dataset.status; document.querySelectorAll("[data-status]").forEach((item) => item.classList.toggle("active", item === button)); renderAll(); });
  document.querySelector("#crm-search").oninput = (event) => { currentSearch = event.target.value; renderLeadList(); };
  document.querySelectorAll("[data-admin-section]").forEach((button) => {
    if (button.dataset.adminSection === "leads") button.onclick = () => {
      document.querySelectorAll(".admin-section").forEach((section) => section.classList.toggle("active", section.id === "admin-leads"));
      document.querySelectorAll("[data-admin-section]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelector(".admin-content").scrollTop = 0;
    };
  });
  document.body.insertAdjacentHTML("beforeend", `<dialog id="crm-lead-dialog" class="crm-lead-dialog"><div id="crm-dialog-content"></div></dialog>`);
  loadData();
}

mountCRM();
