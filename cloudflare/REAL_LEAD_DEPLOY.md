# Real lead deployment

Do not commit customer phone numbers to this public repository.

1. Create/bind a Cloudflare D1 database as `DB` for `cloudflare/worker.js`.
2. Apply `schema.sql`, `team_roles.sql`, `dual_queue.sql`, then `real_lead_intake.sql` once, in that order.
3. Set Worker secrets/vars:
   - `IMPORT_TOKEN` (secret random token used only for one-time/admin imports)
   - `FRONTEND_ORIGIN=https://britsingh20-source.github.io`
4. Deploy the Worker and configure the GitHub Pages frontend with `window.LEAD_API_BASE` pointing to the Worker URL.
5. Import the private JSON outside GitHub:
   `LEAD_IMPORT_TOKEN=... node scripts/import-leads.mjs /secure/path/leads.json https://<worker-url>`
6. After import, rotate/remove the import token.

Production authentication should protect the CRM/Worker using Cloudflare Access and map the authenticated identity to `team_users`; never trust a role selected only in browser localStorage for authorization.
