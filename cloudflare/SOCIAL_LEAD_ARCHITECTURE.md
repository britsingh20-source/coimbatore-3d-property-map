# Instagram -> WhatsApp -> CRM Lead Architecture

Branch: `feature/social-lead-intake`

## Flow
1. Instagram Reel viewer comments or DMs a locality keyword, e.g. `KARAMADAI`.
2. Meta webhook adapter posts the event to `POST /api/social/instagram/intake`.
3. CRM detects the configured locality keyword and creates a `social_leads` row with status `WhatsApp Pending`.
4. CRM returns a unique `whatsapp_prefill_token` for the private WhatsApp handoff link/message.
5. The user voluntarily opens WhatsApp and sends the prefilled message.
6. WhatsApp webhook adapter posts the inbound sender number and token to `POST /api/social/whatsapp/inbound`.
7. CRM finds an existing `leads` row by phone or creates a new one.
8. The social lead is linked to that CRM lead and status becomes `Number Captured`.
9. `lead_activity` records the social-to-WhatsApp conversion and telecaller routing is retained.

## Files
- `social_leads.sql`: additive D1 schema; does not replace existing lead tables.
- `social-keywords.js`: canonical locality keywords and aliases.
- `main-social-intake.js`: Instagram keyword intake wrapper around the existing CRM Worker.
- `main-whatsapp-capture.js`: inbound WhatsApp handoff and CRM merge wrapper.

## Initial keyword routes
- Karamadai / Karamadi -> Telecaller 2
- Saravanampatti / Saranampatti -> Telecaller 1
- Kalapatti -> Telecaller 1
- Vadavalli -> Telecaller 2
- Sulur -> Telecaller 1
- Kovilpalayam -> Telecaller 2
- Annur -> Telecaller 2
- Mettupalayam -> Telecaller 2
- Malumichampatti -> Telecaller 1

These assignments are data-driven in `social_keyword_routes` and can later be edited from the CRM admin UI.

## Endpoints
### POST /api/social/instagram/intake
Example body:
```json
{
  "platform_user_id": "instagram-scoped-user-id",
  "username": "example_user",
  "source_type": "comment",
  "media_id": "reel-media-id",
  "comment_id": "comment-id",
  "text": "KARAMADAI"
}
```

### POST /api/social/whatsapp/inbound
This endpoint is for a user-initiated inbound WhatsApp message after the user has chosen to continue on WhatsApp.

Example body:
```json
{
  "phone": "+919876543210",
  "prefill_token": "TOKEN_RETURNED_BY_INSTAGRAM_INTAKE",
  "name": "Customer name if provided by WhatsApp"
}
```

### GET /api/social/summary
Returns counts for social leads, WhatsApp-pending leads, CRM-linked leads, and keyword demand.

## Deployment order
1. Apply `social_leads.sql` to the same D1 database used by the CRM.
2. Deploy the Worker using `main-whatsapp-capture.js` as the outermost entry module (it delegates all existing routes back through the current Worker chain).
3. Configure Meta Instagram webhook adapter to call `/api/social/instagram/intake`.
4. Configure the WhatsApp Business webhook adapter to call `/api/social/whatsapp/inbound` only for user-initiated inbound conversations and extract the prefill token from the incoming message.
5. Add the Social Leads cards/table to the existing Manager / Administrator / Director frontend.

## Safety / compatibility
The migration is additive. Existing `leads`, `lead_activity`, daily imports, sessions, property map, and other routes are not replaced. The social Workers wrap the current Worker and delegate all unrelated endpoints back to it.
