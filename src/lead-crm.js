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

let areas = [];
let leads = [];
let currentArea = "ALL";
let currentStatus = "All";
let currentSearch = "";
let selectedLead = null;
let currentUser = localStorage.getItem("crm-current-user") || "Telecaller 1";

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

function filteredLeads() {
  return leads.filter((lead) => {
    const matchesArea = currentArea === "ALL" || lead.area_code === currentArea;
    const matchesStatus = currentStatus === "All" || lead.status === currentStatus;
    const haystack = `${lead.lead_code || ""} ${lead.name || ""} ${lead.phone || ""} ${lead.requirement || ""}`.toLowerCase();
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

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusClass(status) {
  return String(status || "").toLowerCase().replaceAll(" ", "-");
}

function renderLeadList() {
  const visible = filteredLeads();
  document.querySelector("#crm-list-title").textContent = currentArea === "ALL" ? "All lead records" : `${areaName(currentArea)} leads`;
  document.querySelector("#crm-list-count").textContent = `${visible.length} shown`;
  document.querySelector("#crm-lead-list").innerHTML = visible.length ? visible.map((lead) => `
    <article class="crm-lead-row" data-open-lead="${lead.id}">
      <div class="crm-lead-primary"><span class="crm-lead-code">${lead.lead_code || "Pending code"}</span><div><b>${lead.name || "Unnamed lead"}</b><small>${lead.requirement || "Requirement not added"}</small></div></div>
      <div class="crm-phone"><a href="tel:${lead.phone}" data-call-lead="${lead.id}">☎ ${lead.phone}</a><small>${areaName(lead.area_code)}</small></div>
      <div><span class="crm-status ${statusClass(lead.status)}">${lead.status || "Uncalled"}</span><small>${lead.assigned_to || "Unassigned"}</small></div>
      <div><b>${formatDate(lead.last_contact_at)}</b><small>Last contact</small></div>
      <button class="crm-open">Open →</button>
    </article>`).join("") : '<div class="crm-empty"><b>No leads in this view</b><small>Change the area, status or search filter.</small></div>';

  document.querySelectorAll("[data-open-lead]").forEach((row) => row.onclick = (event) => {
    if (event.target.closest("a")) return;
    openLead(row.dataset.openLead);
  });
  document.querySelectorAll("[data-call-lead]").forEach((link) => link.onclick = async () => {
    const lead = leads.find((item) => String(item.id) === link.dataset.callLead);
    if (!lead) return;
    if (!lead.assigned_to) {
      lead.assigned_to = currentUser;
      lead.last_contact_at = new Date().toISOString();
      saveDemo();
      try { await api(`/api/leads/${lead.id}/claim`, { method: "POST", body: JSON.stringify({ assigned_to: currentUser }) }); } catch (_) {}
      renderAll();
    }
  });
}

function openLead(id) {
  selectedLead = leads.find((lead) => String(lead.id) === String(id));
  if (!selectedLead) return;
  const modal = document.querySelector("#crm-lead-modal");
  document.querySelector("#crm-modal-code").textContent = selectedLead.lead_code || "Pending area code";
  document.querySelector("#crm-modal-name").textContent = selectedLead.name || "Unnamed lead";
  document.querySelector("#crm-modal-phone").textContent = selectedLead.phone;
  document.querySelector("#crm-modal-phone").href = "tel:" + selectedLead.phone;
  document.querySelector("#crm-modal-area").value = selectedLead.area_code || "";
  document.querySelector("#crm-modal-status").value = selectedLead.status || "Uncalled";
  document.querySelector("#crm-modal-notes").value = selectedLead.notes || "";
  document.querySelector("#crm-modal-requirement").value = selectedLead.requirement || "";
  document.querySelector("#crm-modal-followup").value = selectedLead.follow_up_at ? selectedLead.follow_up_at.slice(0, 16) : "";
  document.querySelector("#crm-modal-assigned").textContent = selectedLead.assigned_to || "Not assigned";
  document.querySelector("#crm-modal-history").innerHTML = `
    <div><i></i><b>Lead received</b><small>${formatDate(selectedLead.first_received_at)}</small></div>
    ${selectedLead.last_contact_at ? `<div><i></i><b>Last contacted</b><small>${formatDate(selectedLead.last_contact_at)} · ${selectedLead.assigned_to || "Team"}</small></div>` : ""}`;
  modal.showModal();
}

async function saveLeadFeedback(event) {
  event.preventDefault();
  if (!selectedLead) return;
  const areaCode = document.querySelector("#crm-modal-area").value;
  const status = document.querySelector("#crm-modal-status").value;
  const notes = document.querySelector("#crm-modal-notes").value.trim();
  const requirement = document.querySelector("#crm-modal-requirement").value.trim();
  const followup = document.querySelector("#crm-modal-followup").value;
  selectedLead.area_code = areaCode;
  selectedLead.status = status;
  selectedLead.notes = notes;
  selectedLead.requirement = requirement;
  selectedLead.follow_up_at = followup ? new Date(followup).toISOString() : null;
  selectedLead.last_contact_at = new Date().toISOString();
  selectedLead.assigned_to = selectedLead.assigned_to || currentUser;
  saveDemo();
  try {
    const result = await api(`/api/leads/${selectedLead.id}/activity`, {
      method: "POST",
      body: JSON.stringify({ area_code: areaCode, status, notes, requirement, follow_up_at: selectedLead.follow_up_at, caller: currentUser })
    });
    if (result.lead) Object.assign(selectedLead, result.lead);
  } catch (_) {}
  document.querySelector("#crm-lead-modal").close();
  renderAll();
}

function renderFilters() {
  document.querySelector("#crm-status-filters").innerHTML = STATUS_FILTERS.map((status) =>
    `<button data-status-filter="${status}" class="${currentStatus === status ? "active" : ""}">${status}</button>`
  ).join("");
  document.querySelectorAll("[data-status-filter]").forEach((button) => button.onclick = () => {
    currentStatus = button.dataset.statusFilter;
    renderAll();
  });
}

function renderAll() {
  renderDashboard();
  renderAreas();
  renderFilters();
  renderLeadList();
}

function buildCRM() {
  const nav = document.querySelector(".admin-segments");
  const content = document.querySelector(".admin-content");
  if (!nav || !content || document.querySelector("[data-admin-section='leads']")) return;
  nav.insertAdjacentHTML("beforeend", '<button data-admin-section="leads"><span>☏</span>Leads</button>');
  content.insertAdjacentHTML("beforeend", `
    <section id="admin-leads" class="admin-section crm-section">
      <div class="crm-header"><div><small>LEAD COMMAND CENTER</small><h2>Telecalling & Area Leads</h2><p>Area-first lead management with assignment, feedback and follow-up tracking.</p></div><div class="crm-userbox"><span id="crm-live-indicator"><i></i> Connecting…</span><label>Working as<select id="crm-user-select"><option>Telecaller 1</option><option>Telecaller 2</option><option>Telecaller 3</option><option>Telecaller 4</option><option>Manager</option><option>Administrator</option></select></label></div></div>
      <div id="crm-kpis" class="crm-kpis"></div>
      <div class="crm-area-head"><div><small>AREA LEAD MAP</small><h3>Choose an area</h3></div><button id="crm-clear-area">Show all areas</button></div>
      <div id="crm-area-grid" class="crm-area-grid"></div>
      <div class="crm-toolbar"><div id="crm-status-filters" class="crm-status-filters"></div><label class="crm-search">⌕ <input id="crm-search" type="search" placeholder="Search name, phone, lead ID…"></label></div>
      <div class="crm-list-head"><div><small>LEAD LIST</small><h3 id="crm-list-title">All lead records</h3></div><span id="crm-list-count"></span></div>
      <div id="crm-lead-list" class="crm-lead-list"></div>
      <dialog id="crm-lead-modal" class="crm-modal">
        <button class="crm-modal-close" type="button">×</button>
        <div class="crm-modal-head"><span id="crm-modal-code"></span><h2 id="crm-modal-name"></h2><a id="crm-modal-phone"></a><small>Assigned to: <b id="crm-modal-assigned"></b></small></div>
        <form id="crm-feedback-form"><div class="crm-form-grid">
          <label>Area<select id="crm-modal-area">${DEMO_AREAS.map((area) => `<option value="${area.code}">${area.code} · ${area.name}</option>`).join("")}</select></label>
          <label>Call result<select id="crm-modal-status">${STATUS_OPTIONS.map((status) => `<option>${status}</option>`).join("")}</select></label>
          <label class="wide">Requirement<input id="crm-modal-requirement" placeholder="Example: 3 cents, ₹50–55L, ready to move"></label>
          <label>Next follow-up<input id="crm-modal-followup" type="datetime-local"></label>
          <label class="wide">Feedback / notes<textarea id="crm-modal-notes" rows="4" placeholder="What did the customer say?"></textarea></label>
        </div><div class="crm-modal-actions"><button type="button" class="crm-cancel">Cancel</button><button type="submit">Save feedback</button></div></form>
        <div class="crm-history"><small>ACTIVITY</small><div id="crm-modal-history"></div></div>
      </dialog>
    </section>`);

  document.querySelector("#crm-user-select").value = currentUser;
  document.querySelector("#crm-user-select").onchange = (event) => {
    currentUser = event.target.value;
    localStorage.setItem("crm-current-user", currentUser);
  };
  document.querySelector("#crm-clear-area").onclick = () => { currentArea = "ALL"; renderAll(); };
  document.querySelector("#crm-search").oninput = (event) => { currentSearch = event.target.value.trim(); renderLeadList(); };
  document.querySelector("#crm-feedback-form").onsubmit = saveLeadFeedback;
  document.querySelector(".crm-modal-close").onclick = () => document.querySelector("#crm-lead-modal").close();
  document.querySelector(".crm-cancel").onclick = () => document.querySelector("#crm-lead-modal").close();

  const leadNav = document.querySelector("[data-admin-section='leads']");
  leadNav.onclick = () => {
    document.querySelectorAll(".admin-section").forEach((section) => section.classList.toggle("active", section.id === "admin-leads"));
    document.querySelectorAll("[data-admin-section]").forEach((button) => button.classList.toggle("active", button.dataset.adminSection === "leads"));
    document.querySelector(".admin-content").scrollTop = 0;
  };
  loadData();
}

window.setTimeout(buildCRM, 0);
