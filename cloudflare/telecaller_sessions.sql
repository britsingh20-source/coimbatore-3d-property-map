CREATE TABLE IF NOT EXISTS telecaller_sessions (
  token TEXT PRIMARY KEY,
  user_label TEXT NOT NULL,
  login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  call_active INTEGER NOT NULL DEFAULT 0,
  call_started_at TEXT,
  logout_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  logout_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_telecaller_sessions_user_active ON telecaller_sessions(user_label, active);
