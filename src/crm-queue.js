const API_BASE = window.LEAD_API_BASE || "";
const BATCH_SIZE = 10;
const TELECALLERS = ["Telecaller 1", "Telecaller 2"];
const PENDING_STATUSES = new Set(["Uncalled", "No Response", "Busy"]);

function indiaDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function dayNumber(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function queueForTelecaller(label, dateKey = indiaDateKey()) {
  const index = TELECALLERS.indexOf(label);
  if (index < 0) return null;
  const freshIndex = dayNumber(dateKey) % 2;
  return index === freshIndex ? "fresh" : "backlog";
}

function rolePlan(dateKey = indiaDateKey()) {
  return TELECALLERS.map((label) => ({ label, queue: queueForTelecaller(label, dateKey) }));
}

async function loadLeads() {
  try {
    if (API_BASE) {
      const response = await fetch(`${API_BASE}/api/leads`, { headers: { "content-type": "application/json" } });
      if (response.ok) {
        const data = await response.json();
        return data.leads || data;
      }
    }
  } catch (_) {}
  const saved = localStorage.getItem("lead-crm-demo-data");
  if (saved) return JSON.parse(saved);
  return [];
}

function isPending(lead) {
  return PENDING_STATUSES.has(lead.status || "Uncalled") && !lead.area_code || PENDING_STATUSES.has(lead.status || "Uncalled");
}

function queueLeads(leads, queue, today) {
  return leads
    .filter(isPending)
    .filter((lead) => {
      const received = indiaDateKey(lead.first_received_at || lead.last_received_at || new Date());
      return queue === "fresh" ? received === today : received < today;
    })
    .sort((a, b) => {
      const ad = new Date(a.first_received_at || a.last_received_at || 0).getTime();
      const bd = new Date(b.first_received_at || b.last_received_at || 0).getTime();
      if (queue === "fresh") return bd - ad;
      const aNo = a.status === "No Response" ? 1 : 0;
      const bNo = b.status === "No Response" ? 1 : 0;
      if (aNo !== bNo) return aNo - bNo;
      return ad - bd;
    });
}

function batchKey(user, queue, today) {
  return `crm-batch:${today}:${user}:${queue}`;
}

function currentBatchIndex(user, queue, today) {
  return Number(localStorage.getItem(batchKey(user, queue, today)) || 0);
}

function setBatchIndex(user, queue, today, index) {
  localStorage.setItem(batchKey(user, queue, today), String(Math.max(0, index)));
}

function queueLabel(queue) {
  return queue === "fresh" ? "Fresh Leads" : "Backlog Leads";
}

function renderLeadBatch(container, leads, user, queue, today) {
  const page = currentBatchIndex(user, queue, today);
  const start = page * BATCH_SIZE;
  const batch = leads.slice(start, start + BATCH_SIZE);
  const totalBatches = Math.max(1, Math.ceil(leads.length / BATCH_SIZE));
  container.innerHTML = `
    <div class="queue-batch-head">
      <div><small>${queueLabel(queue).toUpperCase()}</small><h3>${user}'s next ${BATCH_SIZE}</h3></div>
      <span>Batch ${Math.min(page + 1, totalBatches)} / ${totalBatches}</span>
    </div>
    <div class="queue-batch-list">
      ${batch.length ? batch.map((lead, i) => `
        <article>
          <span class="queue-number">${start + i + 1}</span>
          <div><b>${lead.name || "Unknown caller"}</b><small>${indiaDateKey(lead.first_received_at || lead.last_received_at)} · ${lead.status || "Uncalled"}</small></div>
          <a href="tel:${lead.phone}" aria-label="Call ${lead.phone}">☎ ${lead.phone}</a>
        </article>`).join("") : `<div class="queue-empty">No ${queueLabel(queue).toLowerCase()} waiting in this queue.</div>`}
    </div>
    <div class="queue-actions">
      <button type="button" data-queue-prev ${page <= 0 ? "disabled" : ""}>← Previous 10</button>
      <button type="button" data-queue-next ${start + BATCH_SIZE >= leads.length ? "disabled" : ""}>Next 10 →</button>
    </div>`;
  container.querySelector("[data-queue-prev]")?.addEventListener("click", () => { setBatchIndex(user, queue, today, page - 1); refreshQueue(); });
  container.querySelector("[data-queue-next]")?.addEventListener("click", () => { setBatchIndex(user, queue, today, page + 1); refreshQueue(); });
}

async function refreshQueue() {
  const root = document.querySelector("#crm-dual-queue");
  if (!root) return;
  const today = indiaDateKey();
  const user = localStorage.getItem("crm-current-user") || "Telecaller 1";
  const plan = rolePlan(today);
  const leads = await loadLeads();
  const fresh = queueLeads(leads, "fresh", today);
  const backlog = queueLeads(leads, "backlog", today);
  const assignedQueue = queueForTelecaller(user, today);
  const oldest = backlog.length ? indiaDateKey(backlog[0].first_received_at || backlog[0].last_received_at) : "—";

  root.querySelector("#queue-today").textContent = today;
  root.querySelector("#queue-fresh-count").textContent = fresh.length;
  root.querySelector("#queue-backlog-count").textContent = backlog.length;
  root.querySelector("#queue-oldest").textContent = oldest;
  root.querySelector("#queue-plan").innerHTML = plan.map((item) => `<div class="queue-role ${item.label === user ? "active" : ""}"><b>${item.label}</b><span>${item.queue === "fresh" ? "NEW CALLS" : "OLD CALLS"}</span><small>${queueLabel(item.queue)} · 10 at a time</small></div>`).join("");

  const batch = root.querySelector("#queue-active-batch");
  if (assignedQueue) {
    renderLeadBatch(batch, assignedQueue === "fresh" ? fresh : backlog, user, assignedQueue, today);
  } else {
    batch.innerHTML = `<div class="queue-supervisor"><b>Supervisor view</b><p>Telecaller queues alternate automatically every day. Managers, Administrator and Director can monitor both queues.</p></div>`;
  }
}

function mountQueue() {
  const crm = document.querySelector("#admin-leads");
  const teamFlow = document.querySelector("#crm-team-flow");
  if (!crm || !teamFlow || document.querySelector("#crm-dual-queue")) return false;
  teamFlow.insertAdjacentHTML("afterend", `
    <section id="crm-dual-queue" class="crm-dual-queue">
      <div class="queue-title"><div><small>DAILY CALLING PLAN · <span id="queue-today"></span></small><h2>Fresh + Backlog Dual Queue</h2><p>One telecaller handles new calls while the other clears old calls. Their duties swap automatically each day.</p></div><span class="queue-rule">10 + 10 batches</span></div>
      <div class="queue-metrics">
        <div><small>Fresh waiting</small><b id="queue-fresh-count">0</b></div>
        <div><small>Backlog waiting</small><b id="queue-backlog-count">0</b></div>
        <div><small>Oldest untouched</small><b id="queue-oldest">—</b></div>
      </div>
      <div id="queue-plan" class="queue-plan"></div>
      <div id="queue-active-batch" class="queue-active-batch"></div>
    </section>`);

  document.querySelector("#crm-user-select")?.addEventListener("change", () => window.setTimeout(refreshQueue, 0));
  window.addEventListener("storage", refreshQueue);
  refreshQueue();
  return true;
}

let queueAttempts = 0;
const queueTimer = window.setInterval(() => {
  queueAttempts += 1;
  if (mountQueue() || queueAttempts > 50) window.clearInterval(queueTimer);
}, 100);
