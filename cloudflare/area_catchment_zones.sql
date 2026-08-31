PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS area_catchments (
  parent_code TEXT PRIMARY KEY,
  parent_name TEXT NOT NULL,
  radius_km REAL NOT NULL DEFAULT 6.0,
  priority_reference TEXT NOT NULL DEFAULT 'IDG',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS area_catchment_aliases (
  alias_normalized TEXT PRIMARY KEY,
  alias_display TEXT NOT NULL,
  parent_code TEXT NOT NULL REFERENCES area_catchments(parent_code),
  mapping_type TEXT NOT NULL DEFAULT 'locality',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO area_catchments(parent_code,parent_name,radius_km) VALUES
 ('VDV','Vadavalli',7.0),
 ('IDG','Idigarai',7.0),
 ('SRV','Saravanampatti',7.0),
 ('KLP','Kalapatti',7.0),
 ('SLR','Sulur',7.0)
ON CONFLICT(parent_code) DO UPDATE SET
 parent_name=excluded.parent_name,
 radius_km=excluded.radius_km,
 active=1,
 updated_at=CURRENT_TIMESTAMP;

-- Vadavalli catchment
INSERT INTO area_catchment_aliases(alias_normalized,alias_display,parent_code,mapping_type) VALUES
 ('vadavalli','Vadavalli','VDV','locality'),
 ('vadavally','Vadavally','VDV','spelling'),
 ('thondamuthur','Thondamuthur','VDV','locality'),
 ('vadavalli to thondamuthur','Vadavalli to Thondamuthur','VDV','corridor'),
 ('kanuvai','Kanuvai','VDV','locality'),
 ('kanavay','Kanavay','VDV','spelling'),
 ('vadavalli to kanuvai','Vadavalli to Kanuvai','VDV','corridor'),
 ('rs puram','RS Puram','VDV','locality'),
 ('r s puram','R S Puram','VDV','spelling'),
 ('vadavalli to rs puram','Vadavalli to RS Puram','VDV','corridor')
ON CONFLICT(alias_normalized) DO UPDATE SET parent_code=excluded.parent_code,alias_display=excluded.alias_display,mapping_type=excluded.mapping_type,updated_at=CURRENT_TIMESTAMP;

-- Idigarai catchment. Saravanampatti remains its own parent zone; only the Idigarai-Saravanampatti corridor maps to IDG.
INSERT INTO area_catchment_aliases(alias_normalized,alias_display,parent_code,mapping_type) VALUES
 ('idigarai','Idigarai','IDG','locality'),
 ('idigari','Idigari','IDG','spelling'),
 ('edigarai','Edigarai','IDG','spelling'),
 ('idikarai','Idikarai','IDG','spelling'),
 ('athipalayam','Athipalayam','IDG','locality'),
 ('idigarai to athipalayam','Idigarai to Athipalayam','IDG','corridor'),
 ('vellakinar','Vellakinar','IDG','locality'),
 ('vellakinaru','Vellakinaru','IDG','spelling'),
 ('idigarai to vellakinar','Idigarai to Vellakinar','IDG','corridor'),
 ('thudiyalur','Thudiyalur','IDG','locality'),
 ('thudialur','Thudialur','IDG','spelling'),
 ('idigarai to thudiyalur','Idigarai to Thudiyalur','IDG','corridor'),
 ('idigarai to saravanampatti','Idigarai to Saravanampatti','IDG','corridor')
ON CONFLICT(alias_normalized) DO UPDATE SET parent_code=excluded.parent_code,alias_display=excluded.alias_display,mapping_type=excluded.mapping_type,updated_at=CURRENT_TIMESTAMP;

-- Saravanampatti catchment. Kalapatti remains its own parent zone; only the connecting corridor maps to SRV.
INSERT INTO area_catchment_aliases(alias_normalized,alias_display,parent_code,mapping_type) VALUES
 ('saravanampatti','Saravanampatti','SRV','locality'),
 ('saravanampatty','Saravanampatty','SRV','spelling'),
 ('kovilpalayam','Kovilpalayam','SRV','locality'),
 ('kovil palayam','Kovil Palayam','SRV','spelling'),
 ('saravanampatti to kovilpalayam','Saravanampatti to Kovilpalayam','SRV','corridor'),
 ('kurumbapalayam','Kurumbapalayam','SRV','locality'),
 ('saravanampatti to kurumbapalayam','Saravanampatti to Kurumbapalayam','SRV','corridor'),
 ('ganapathy','Ganapathy','SRV','locality'),
 ('ganapathi','Ganapathi','SRV','spelling'),
 ('saravanampatti to kalapatti','Saravanampatti to Kalapatti','SRV','corridor')
ON CONFLICT(alias_normalized) DO UPDATE SET parent_code=excluded.parent_code,alias_display=excluded.alias_display,mapping_type=excluded.mapping_type,updated_at=CURRENT_TIMESTAMP;

-- Kalapatti catchment
INSERT INTO area_catchment_aliases(alias_normalized,alias_display,parent_code,mapping_type) VALUES
 ('kalapatti','Kalapatti','KLP','locality'),
 ('kalapathy','Kalapathy','KLP','spelling'),
 ('cheran ma nagar','Cheran Ma Nagar','KLP','locality'),
 ('cheranmanagar','Cheran Ma Nagar','KLP','spelling'),
 ('kalapatti to cheran ma nagar','Kalapatti to Cheran Ma Nagar','KLP','corridor'),
 ('nehru nagar','Nehru Nagar','KLP','locality'),
 ('nearu nagar','Nearu Nagar','KLP','spelling'),
 ('kalapatti to nehru nagar','Kalapatti to Nehru Nagar','KLP','corridor')
ON CONFLICT(alias_normalized) DO UPDATE SET parent_code=excluded.parent_code,alias_display=excluded.alias_display,mapping_type=excluded.mapping_type,updated_at=CURRENT_TIMESTAMP;

-- Sulur catchment
INSERT INTO area_catchment_aliases(alias_normalized,alias_display,parent_code,mapping_type) VALUES
 ('sulur','Sulur','SLR','locality'),
 ('suloor','Suloor','SLR','spelling'),
 ('singanallur','Singanallur','SLR','locality'),
 ('singanalloor','Singanalloor','SLR','spelling'),
 ('singanallur to sulur','Singanallur to Sulur','SLR','corridor'),
 ('irugur','Irugur','SLR','locality'),
 ('iruvur','Iruvur','SLR','spelling'),
 ('erugur','Erugur','SLR','spelling'),
 ('irugur to sulur','Irugur to Sulur','SLR','corridor')
ON CONFLICT(alias_normalized) DO UPDATE SET parent_code=excluded.parent_code,alias_display=excluded.alias_display,mapping_type=excluded.mapping_type,updated_at=CURRENT_TIMESTAMP;

-- Hide child locality choices that are now represented by a parent catchment.
UPDATE area_master SET active=0,updated_at=CURRENT_TIMESTAMP WHERE code IN ('TDM','KNV','RSP','VKN','THD','KVP','KBP','GNP','SNG','IRG');
UPDATE areas SET active=0 WHERE code IN ('TDM','KNV','RSP','VKN','THD','KVP','KBP','GNP','SNG','IRG');

-- Ensure the parent catchments remain selectable.
UPDATE area_master SET active=1,updated_at=CURRENT_TIMESTAMP WHERE code IN ('VDV','IDG','SRV','KLP','SLR');
UPDATE areas SET active=1 WHERE code IN ('VDV','IDG','SRV','KLP','SLR');

CREATE INDEX IF NOT EXISTS idx_area_catchment_parent ON area_catchment_aliases(parent_code);
