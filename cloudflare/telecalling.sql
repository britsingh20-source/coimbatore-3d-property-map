-- Dedicated shared register; contact data is imported privately, never committed.
CREATE TABLE IF NOT EXISTS pocket_leads (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 phone TEXT NOT NULL UNIQUE,
 date_label TEXT NOT NULL DEFAULT '',
 assigned_to TEXT NOT NULL DEFAULT 'TC01',
 interest TEXT NOT NULL DEFAULT 'Not assessed',
 temperature TEXT NOT NULL DEFAULT 'Unclassified',
 status TEXT NOT NULL DEFAULT 'New',
 visit TEXT NOT NULL DEFAULT '',
 callback TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 0,
 change_id TEXT,
 updated_by TEXT,
 updated_at TEXT
);
CREATE TABLE IF NOT EXISTS pocket_lead_activity (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 lead_id TEXT NOT NULL REFERENCES pocket_leads(id),
 actor TEXT NOT NULL,
 change_id TEXT NOT NULL UNIQUE,
 before_json TEXT NOT NULL,
 after_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pocket_activity_lead ON pocket_lead_activity(lead_id,id DESC);
