PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lead_retry (
  lead_id INTEGER PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  retry_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'scheduled',
  last_outcome TEXT,
  last_telecaller TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_retry_due ON lead_retry(state, retry_at);
CREATE INDEX IF NOT EXISTS idx_lead_retry_telecaller ON lead_retry(last_telecaller, retry_at);
