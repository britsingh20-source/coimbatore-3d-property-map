PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS team_users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('telecaller','manager','administrator','director')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO team_users(id,display_name,role) VALUES
 ('telecaller-1','Telecaller 1','telecaller'),
 ('telecaller-2','Telecaller 2','telecaller'),
 ('manager-1','Manager 1','manager'),
 ('manager-2','Manager 2','manager'),
 ('administrator','Administrator','administrator'),
 ('director','Director','director');

ALTER TABLE leads ADD COLUMN telecaller_assigned_to TEXT REFERENCES team_users(id);
ALTER TABLE leads ADD COLUMN manager_assigned_to TEXT REFERENCES team_users(id);
ALTER TABLE leads ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'incoming';
ALTER TABLE leads ADD COLUMN categorized_at TEXT;
ALTER TABLE leads ADD COLUMN manager_handoff_at TEXT;
ALTER TABLE leads ADD COLUMN converted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_telecaller ON leads(telecaller_assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_manager ON leads(manager_assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);

-- Intended pipeline:
-- incoming -> telecaller_claimed -> categorized -> manager_queue -> manager_working -> converted/closed
-- Telecallers capture area, requirement, budget and first-call result.
-- Managers own channelizing, follow-up, site visits and conversion.
-- Administrator controls assignment and data quality.
-- Director has full read/reporting visibility across the pipeline.
