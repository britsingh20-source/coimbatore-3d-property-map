CREATE TABLE IF NOT EXISTS daily_lead_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_date TEXT NOT NULL,
  source_file TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  new_leads INTEGER NOT NULL DEFAULT 0,
  repeat_callers INTEGER NOT NULL DEFAULT 0,
  file_duplicates INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  india_count INTEGER NOT NULL DEFAULT 0,
  international_count INTEGER NOT NULL DEFAULT 0,
  imported_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_lead_imports_date ON daily_lead_imports(import_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS lead_replacement_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file TEXT,
  old_lead_count INTEGER NOT NULL,
  new_lead_count INTEGER NOT NULL,
  new_activity_count INTEGER NOT NULL,
  leads_json TEXT NOT NULL,
  activities_json TEXT NOT NULL,
  replaced_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_replace_staging (
  batch_id TEXT NOT NULL,
  row_no INTEGER NOT NULL,
  phone TEXT NOT NULL,
  display_phone TEXT NOT NULL,
  name TEXT,
  source TEXT,
  notes TEXT,
  received_at TEXT NOT NULL,
  region TEXT NOT NULL,
  PRIMARY KEY(batch_id,row_no)
);

CREATE INDEX IF NOT EXISTS idx_lead_replace_staging_batch_phone
ON lead_replace_staging(batch_id,phone,received_at);
