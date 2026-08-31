PRAGMA foreign_keys = ON;

ALTER TABLE leads ADD COLUMN display_phone TEXT;
ALTER TABLE leads ADD COLUMN area_text TEXT;
ALTER TABLE leads ADD COLUMN property_type TEXT;
ALTER TABLE leads ADD COLUMN budget TEXT;
ALTER TABLE leads ADD COLUMN contacted_at TEXT;
ALTER TABLE leads ADD COLUMN contact_complete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN source_period_start TEXT;
ALTER TABLE leads ADD COLUMN source_period_end TEXT;
ALTER TABLE leads ADD COLUMN date_precision TEXT NOT NULL DEFAULT 'exact';
ALTER TABLE leads ADD COLUMN transcription_review INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_contact_complete ON leads(contact_complete);
CREATE INDEX IF NOT EXISTS idx_leads_first_received ON leads(first_received_at);
CREATE INDEX IF NOT EXISTS idx_leads_last_received ON leads(last_received_at);

-- Call completion policy:
-- Categorized / Interested / Hot / Follow-up / Site Visit require
-- name + area + property type + budget + requirement + notes.
-- Follow-up additionally requires follow_up_at.
-- No Response / Busy / Not Interested / Wrong Number can be saved with the result only.
-- contact_complete=1 means the telecaller completed the mandatory first-contact intake.
