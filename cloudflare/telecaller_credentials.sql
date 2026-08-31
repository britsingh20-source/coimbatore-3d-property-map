CREATE TABLE IF NOT EXISTS telecaller_credentials (
  employee_id TEXT PRIMARY KEY,
  user_label TEXT NOT NULL UNIQUE,
  pin_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO telecaller_credentials(employee_id,user_label,active)
VALUES('TC01','Telecaller 1',1)
ON CONFLICT(employee_id) DO UPDATE SET user_label=excluded.user_label;

INSERT INTO telecaller_credentials(employee_id,user_label,active)
VALUES('TC02','Telecaller 2',1)
ON CONFLICT(employee_id) DO UPDATE SET user_label=excluded.user_label;

INSERT INTO telecaller_credentials(employee_id,user_label,active)
VALUES('MG01','Manager 1',1)
ON CONFLICT(employee_id) DO UPDATE SET user_label=excluded.user_label;

INSERT INTO telecaller_credentials(employee_id,user_label,active)
VALUES('MG02','Manager 2',1)
ON CONFLICT(employee_id) DO UPDATE SET user_label=excluded.user_label;

INSERT INTO telecaller_credentials(employee_id,user_label,active)
VALUES('AD01','Administrator',1)
ON CONFLICT(employee_id) DO UPDATE SET user_label=excluded.user_label;

INSERT INTO telecaller_credentials(employee_id,user_label,active)
VALUES('DR01','Director',1)
ON CONFLICT(employee_id) DO UPDATE SET user_label=excluded.user_label;
