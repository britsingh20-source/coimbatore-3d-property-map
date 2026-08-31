PRAGMA foreign_keys = ON;

-- Compatibility identities for queue assignments.
-- The live Worker historically stores user_label values (for example "Telecaller 1")
-- in leads.telecaller_assigned_to, while the original FK references team_users(id)
-- values such as "telecaller-1". These inactive alias rows satisfy the FK without
-- changing the visible staff directory or existing canonical identities.
INSERT OR IGNORE INTO team_users(id, display_name, role, active) VALUES
  ('Telecaller 1', 'Queue identity · Telecaller 1', 'telecaller', 0),
  ('Telecaller 2', 'Queue identity · Telecaller 2', 'telecaller', 0),
  ('Manager 1', 'Queue identity · Manager 1', 'manager', 0),
  ('Manager 2', 'Queue identity · Manager 2', 'manager', 0),
  ('Administrator', 'Queue identity · Administrator', 'administrator', 0),
  ('Director', 'Queue identity · Director', 'director', 0);
