PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_migration_flags (
  key TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One-time simplification requested for the working CRM area list.
-- Historical areas stay in area_master for old leads, but are hidden from active use.
UPDATE area_master
SET active = 0, updated_at = CURRENT_TIMESTAMP
WHERE code NOT IN ('VDV','TDM','PMD','VPP','KRM','MTP','IDG','SRV','KLP','SLR')
  AND NOT EXISTS (
    SELECT 1 FROM crm_migration_flags WHERE key = 'primary-working-areas-v1'
  );

-- Veerappandi Pirivu is the working-area label requested by the business.
INSERT OR IGNORE INTO area_master(
  code,canonical_name,zone,aliases,latitude,longitude,distance_from_idigarai_km,priority_band,active
) VALUES (
  'VPP','Veerappandi Pirivu','North','["Veerapandi Pirivu","Veerappandi Periyavu","Veerapandi Periyavu"]',NULL,NULL,NULL,NULL,1
);

UPDATE area_master SET active=1, updated_at=CURRENT_TIMESTAMP
WHERE code IN ('VDV','TDM','PMD','VPP','KRM','MTP','IDG','SRV','KLP','SLR');

UPDATE areas SET active=1 WHERE code='MTP';

-- Repair leads where the telecaller entered Mettupalayam text before MTP was
-- available in the active area list.
UPDATE leads
SET area_code='MTP',updated_at=CURRENT_TIMESTAMP
WHERE lower(trim(COALESCE(area_text,''))) IN ('mettupalayam','mettupalaiyam','mtp')
  AND COALESCE(area_code,'')<>'MTP';

INSERT OR IGNORE INTO areas(code,name)
SELECT code,canonical_name FROM area_master WHERE code='VPP';

INSERT OR IGNORE INTO area_counters(area_code,last_number)
VALUES('VPP',0);

INSERT OR IGNORE INTO crm_migration_flags(key) VALUES('primary-working-areas-v1');
