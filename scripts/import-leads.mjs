import fs from "node:fs/promises";

const [,, file, apiBaseArg] = process.argv;
const apiBase = apiBaseArg || process.env.LEAD_API_BASE;
const token = process.env.LEAD_IMPORT_TOKEN;
if (!file || !apiBase || !token) {
  console.error("Usage: LEAD_IMPORT_TOKEN=... node scripts/import-leads.mjs secure_leads.json https://worker.example.workers.dev");
  process.exit(1);
}
const payload = JSON.parse(await fs.readFile(file, "utf8"));
const leads = Array.isArray(payload) ? payload : payload.leads;
if (!Array.isArray(leads)) throw new Error("Input JSON must contain a leads array");
const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/admin/import`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ leads })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || `Import failed: ${response.status}`);
console.log(JSON.stringify(result, null, 2));
