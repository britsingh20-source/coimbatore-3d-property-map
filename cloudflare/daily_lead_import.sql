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
