PRAGMA foreign_keys = ON;

-- Daily duty is deterministic: one telecaller owns Fresh, the other Backlog.
-- The two queue assignments swap every calendar day in Asia/Kolkata.
CREATE TABLE IF NOT EXISTS telecaller_daily_queue (
  work_date TEXT NOT NULL,
  telecaller_id TEXT NOT NULL REFERENCES team_users(id),
  queue_type TEXT NOT NULL CHECK(queue_type IN ('fresh','backlog')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(work_date, telecaller_id),
  UNIQUE(work_date, queue_type)
);

-- A batch exposes only 10 leads at a time. The lead is not considered called
-- merely because it appears in a batch; the actual call/feedback remains in lead_activity.
CREATE TABLE IF NOT EXISTS call_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_date TEXT NOT NULL,
  telecaller_id TEXT NOT NULL REFERENCES team_users(id),
  queue_type TEXT NOT NULL CHECK(queue_type IN ('fresh','backlog')),
  batch_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(work_date, telecaller_id, queue_type, batch_number)
);

CREATE TABLE IF NOT EXISTS call_batch_leads (
  batch_id INTEGER NOT NULL REFERENCES call_batches(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 10),
  claimed_at TEXT,
  completed_at TEXT,
  outcome TEXT,
  PRIMARY KEY(batch_id, lead_id),
  UNIQUE(batch_id, position)
);

CREATE INDEX IF NOT EXISTS idx_daily_queue_date ON telecaller_daily_queue(work_date, queue_type);
CREATE INDEX IF NOT EXISTS idx_batches_work ON call_batches(work_date, telecaller_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_leads_lead ON call_batch_leads(lead_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_leads_received_status ON leads(first_received_at, status);

-- Queue policy:
-- Fresh: first_received_at falls on work_date and lead still needs telecaller categorization.
-- Backlog: first_received_at is older than work_date and lead still needs telecaller categorization.
-- Batch size: 10.
-- Telecaller duty alternates daily rather than randomizing, giving equal rotation and easy auditability.
-- Follow-ups due now can be handled separately by managers and should not be buried in either queue.
