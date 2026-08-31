PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS areas (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS area_counters (
  area_code TEXT PRIMARY KEY REFERENCES areas(code) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_code TEXT UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  area_code TEXT REFERENCES areas(code),
  status TEXT NOT NULL DEFAULT 'Uncalled',
  assigned_to TEXT,
  requirement TEXT,
  notes TEXT,
  source TEXT,
  first_received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_contact_at TEXT,
  follow_up_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  caller TEXT,
  status TEXT,
  area_code TEXT,
  notes TEXT,
  requirement TEXT,
  follow_up_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_area ON leads(area_code);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(follow_up_at);
CREATE INDEX IF NOT EXISTS idx_activity_lead ON lead_activity(lead_id, created_at DESC);

INSERT OR IGNORE INTO areas(code,name) VALUES
 ('IDG','Idigarai'),('PMD','Pannimadai'),('KRM','Karamadai'),('PGL','Pogalur'),
 ('AMR','Annur–Mettupalayam Road'),('SNG','Singanallur'),('IRG','Irugur'),('PLM','Peelamedu'),
 ('KLP','Kalapatti'),('SLR','Sulur'),('VDV','Vadavalli'),('VPD','Veerappandi');

INSERT OR IGNORE INTO area_counters(area_code,last_number)
SELECT code,0 FROM areas;
