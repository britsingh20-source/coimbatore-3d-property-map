-- Social lead intake extension for Instagram -> WhatsApp -> CRM
-- Safe additive migration: does not alter existing lead rows.

CREATE TABLE IF NOT EXISTS social_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'instagram',
  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  source_type TEXT NOT NULL DEFAULT 'comment',
  source_media_id TEXT,
  source_comment_id TEXT,
  keyword TEXT,
  interested_area TEXT,
  property_type TEXT,
  budget_min INTEGER,
  budget_max INTEGER,
  original_text TEXT,
  whatsapp_prefill_token TEXT UNIQUE,
  whatsapp_phone TEXT,
  lead_id INTEGER,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'Instagram Lead',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, platform_user_id, source_media_id, keyword),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE INDEX IF NOT EXISTS idx_social_leads_platform_user ON social_leads(platform, platform_user_id);
CREATE INDEX IF NOT EXISTS idx_social_leads_keyword ON social_leads(keyword);
CREATE INDEX IF NOT EXISTS idx_social_leads_area ON social_leads(interested_area);
CREATE INDEX IF NOT EXISTS idx_social_leads_status ON social_leads(status);
CREATE INDEX IF NOT EXISTS idx_social_leads_lead_id ON social_leads(lead_id);

CREATE TABLE IF NOT EXISTS social_lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  social_lead_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (social_lead_id) REFERENCES social_leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_social_lead_events_social_lead ON social_lead_events(social_lead_id, created_at);

CREATE TABLE IF NOT EXISTS social_keyword_routes (
  keyword TEXT PRIMARY KEY,
  canonical_area TEXT NOT NULL,
  assigned_to TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO social_keyword_routes(keyword, canonical_area, assigned_to) VALUES
('KARAMADAI','Karamadai','Telecaller 2'),
('KARAMADI','Karamadai','Telecaller 2'),
('SARAVANAMPATTI','Saravanampatti','Telecaller 1'),
('SARANAMPATTI','Saravanampatti','Telecaller 1'),
('KALAPATTI','Kalapatti','Telecaller 1'),
('VADAVALLI','Vadavalli','Telecaller 2'),
('SULUR','Sulur','Telecaller 1'),
('KOVILPALAYAM','Kovilpalayam','Telecaller 2'),
('ANNUR','Annur','Telecaller 2'),
('METTUPALAYAM','Mettupalayam','Telecaller 2'),
('MALUMICHAMPATTI','Malumichampatti','Telecaller 1');
