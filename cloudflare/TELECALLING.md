# Shared Vadavalli telecalling

The mobile tracker is at https://coimbatore-pocket-leads.britsingh20.workers.dev/ and its public shell is also available as `telecalling.html` on GitHub Pages.

Use the existing CRM account IDs and PINs: `DR01` for Director and `TC01` for Telecaller 1. No ChatGPT account is needed. TC01 can see only contacts assigned to TC01; Director can see the whole register. Changing another CRM session/login follows the CRM's existing one-session-per-role behavior.

Source lives in `public/telecalling.html`, `public/telecalling-app.js` and `cloudflare/telecalling-worker.js`. The dedicated Worker binds the existing CRM service for login and the existing `coimbatore-lead-crm` D1 database. It does not change the map or CRM backend.

Contacts are imported privately into `pocket_leads`. Never commit contact data, PINs or session tokens. Schema setup uses `cloudflare/telecalling.sql` and is idempotent. This shared register has separate status fields and does not modify the old CRM lead queue. The original 25 screenshot contacts are assigned to TC01.

Each successful save updates a versioned lead record and an immutable before/after history entry atomically. Stale saves return 409. The UI does not report a successful save until the server confirms it. Other open, visible trackers refresh every 15 seconds. Dates entered for calls and visits use India time. CSV exports include the latest shared state. History is available per contact.

Local storage contains only the login session token; lead updates are kept in D1. An interrupted connection does not save changes offline. The prior ChatGPT Site is a separate browser-local tracker and does not sync; use the new shared URL instead.

Run `node --test tests/telecalling.test.mjs` for auth, assignment scoping, persistence/history, stale-save rejection, validation and rollback coverage. Deploy with the dedicated workflow or `wrangler deploy --config cloudflare/wrangler.telecalling.jsonc` after initializing the schema. Existing unrelated privacy tests currently contain an old `approximate_1km` expectation against `customer_defined`; that pre-existing mismatch does not concern the tracker.
