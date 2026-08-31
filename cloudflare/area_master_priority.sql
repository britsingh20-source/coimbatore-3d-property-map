PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS area_master (
  code TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  zone TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  latitude REAL,
  longitude REAL,
  distance_from_idigarai_km REAL,
  priority_band TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS area_priority_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reference_code TEXT NOT NULL DEFAULT 'IDG',
  reference_name TEXT NOT NULL DEFAULT 'Idigarai',
  reference_latitude REAL NOT NULL DEFAULT 11.1184,
  reference_longitude REAL NOT NULL DEFAULT 76.9690,
  p1_max_km REAL NOT NULL DEFAULT 12.0,
  p2_max_km REAL NOT NULL DEFAULT 20.0,
  p3_max_km REAL NOT NULL DEFAULT 30.0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO area_priority_config(id,reference_code,reference_name,reference_latitude,reference_longitude,p1_max_km,p2_max_km,p3_max_km)
VALUES(1,'IDG','Idigarai',11.1184,76.9690,12.0,20.0,30.0)
ON CONFLICT(id) DO UPDATE SET
  reference_code=excluded.reference_code,
  reference_name=excluded.reference_name,
  reference_latitude=excluded.reference_latitude,
  reference_longitude=excluded.reference_longitude,
  p1_max_km=excluded.p1_max_km,
  p2_max_km=excluded.p2_max_km,
  p3_max_km=excluded.p3_max_km,
  updated_at=CURRENT_TIMESTAMP;

-- Canonical Coimbatore locality seed. Coordinates are intentionally nullable until verified;
-- the Worker computes distance/priority only from verified coordinates.
INSERT OR IGNORE INTO area_master(code,canonical_name,zone,aliases,latitude,longitude,distance_from_idigarai_km,priority_band) VALUES
('IDG','Idigarai','North','["Idikarai","Edigarai"]',11.1184,76.9690,0.0,'P1'),
('PMD','Pannimadai','North','["Pannirmadai","Pannimadai"]',NULL,NULL,NULL,NULL),
('THD','Thudiyalur','North','["Thudialur"]',NULL,NULL,NULL,NULL),
('NGG','NGGO Colony','North','["NGGO","N G G O Colony"]',NULL,NULL,NULL,NULL),
('VKN','Vellakinar','North','["Vellakinaru"]',NULL,NULL,NULL,NULL),
('NNP','Narasimhanaickenpalayam','North','["Narasimanaickenpalayam","Narasimhanaicken Palayam","Narasimhanaickenpalyam"]',NULL,NULL,NULL,NULL),
('PNP','Periyanaickenpalayam','North','["Periyanaicken Palayam","PN Palayam","P N Palayam"]',NULL,NULL,NULL,NULL),
('KRM','Karamadai','North','["Karamady"]',NULL,NULL,NULL,NULL),
('MTP','Mettupalayam','North','["Mettupalaiyam"]',NULL,NULL,NULL,NULL),
('BLH','Bilichi','North','["Bilichi Village"]',NULL,NULL,NULL,NULL),
('KNV','Kanuvai','North-West','["Kanuvay"]',NULL,NULL,NULL,NULL),
('VDV','Vadavalli','West','["Vadavally"]',NULL,NULL,NULL,NULL),
('VRK','Veerakeralam','West','["Veera Keralam"]',NULL,NULL,NULL,NULL),
('SMP','Somayampalayam','West','["Somayampalayam","JKS Nagar"]',NULL,NULL,NULL,NULL),
('MRM','Marudhamalai','West','["Maruthamalai"]',NULL,NULL,NULL,NULL),
('TDM','Thondamuthur','West','["Thondamuthoor"]',NULL,NULL,NULL,NULL),
('NSP','Narasipuram','West','["Narasipuram Road"]',NULL,NULL,NULL,NULL),
('KMP','Kalampalayam','West','["Kalampalayam"]',NULL,NULL,NULL,NULL),
('SRV','Saravanampatti','North-East','["Saravanampatty"]',NULL,NULL,NULL,NULL),
('KLP','Kalapatti','North-East','["Kalapathy","Kalapatti Road"]',NULL,NULL,NULL,NULL),
('KRN','Keeranatham','North-East','["Keeranatham IT Park"]',NULL,NULL,NULL,NULL),
('KVP','Kovilpalayam','North-East','["Kovil Palayam"]',NULL,NULL,NULL,NULL),
('KBP','Kurumbapalayam','North-East','["Kurumbapalayam"]',NULL,NULL,NULL,NULL),
('GNP','Ganapathy','North-East','["Ganapathi"]',NULL,NULL,NULL,NULL),
('CVD','Chinnavedampatti','North-East','["Chinna Vedampatti"]',NULL,NULL,NULL,NULL),
('KDY','Kondayampalayam','North-East','["Kondayampalayam"]',NULL,NULL,NULL,NULL),
('PGL','Pogalur','North-East','["Pogalur"]',NULL,NULL,NULL,NULL),
('ANR','Annur','North-East','["Annur Town"]',NULL,NULL,NULL,NULL),
('MDP','Mondipalayam','North-East','["Mondipalyam","Mondi Palayam"]',NULL,NULL,NULL,NULL),
('KTT','Kattampatti','North-East','["Kattampatti"]',NULL,NULL,NULL,NULL),
('PLM','Peelamedu','East','["Peelamedu"]',NULL,NULL,NULL,NULL),
('HPC','Hope College','East','["Hope College Junction","Hope College"]',NULL,NULL,NULL,NULL),
('CNY','Chinniyampalayam','East','["Chinniampalayam"]',NULL,NULL,NULL,NULL),
('NLM','Neelambur','East','["Neelambur"]',NULL,NULL,NULL,NULL),
('IRG','Irugur','East','["Erugur","Irugoor"]',NULL,NULL,NULL,NULL),
('SLR','Sulur','East','["Suloor"]',NULL,NULL,NULL,NULL),
('ARS','Arasur','East','["Arasoor"]',NULL,NULL,NULL,NULL),
('KMP2','Karumathampatti','East','["Karumathampatty"]',NULL,NULL,NULL,NULL),
('KNP','Kannampalayam','East','["Kannampalayam"]',NULL,NULL,NULL,NULL),
('SNG','Singanallur','South-East','["Singanalloor"]',NULL,NULL,NULL,NULL),
('ONP','Ondipudur','South-East','["Ondiputhur"]',NULL,NULL,NULL,NULL),
('RNP','Ramanathapuram','Central-South','["Ramanathapuram Coimbatore"]',NULL,NULL,NULL,NULL),
('PLK','Puliakulam','Central-South','["Puliyakulam"]',NULL,NULL,NULL,NULL),
('SWP','Sowripalayam','Central-South','["Sowri Palayam"]',NULL,NULL,NULL,NULL),
('UKK','Ukkadam','Central-South','["Ukkadam"]',NULL,NULL,NULL,NULL),
('PDN','Podanur','South','["Podanur Junction"]',NULL,NULL,NULL,NULL),
('KRC','Kurichi','South','["Kurichi"]',NULL,NULL,NULL,NULL),
('SDP','Sundarapuram','South','["Sundarapuram"]',NULL,NULL,NULL,NULL),
('KMT','Kuniamuthur','South-West','["Kuniyamuthur"]',NULL,NULL,NULL,NULL),
('MKR','Madukkarai','South-West','["Madukarai"]',NULL,NULL,NULL,NULL),
('ECH','Eachanari','South','["Echanari"]',NULL,NULL,NULL,NULL),
('MLM','Malumichampatti','South','["Malumichampatty"]',NULL,NULL,NULL,NULL),
('OKM','Othakalmandapam','South','["Othakkalmandapam","Othakal Mandapam"]',NULL,NULL,NULL,NULL),
('CTP','Chettipalayam','South','["Chettipalayam"]',NULL,NULL,NULL,NULL),
('KDV','Kinathukadavu','South','["Kinathukadavu"]',NULL,NULL,NULL,NULL),
('PTN','Pattanam','South-East','["Pattanam"]',NULL,NULL,NULL,NULL),
('PPT','Papampatti','South-East','["Papampatti Pirivu","Papampatti"]',NULL,NULL,NULL,NULL),
('NDP','Nadupalayam','South-East','["Nadupalayam"]',NULL,NULL,NULL,NULL),
('VPD','Veerappandi','Outer','["Veerapandi"]',NULL,NULL,NULL,NULL),
('RSP','RS Puram','Central','["R S Puram","R.S. Puram"]',NULL,NULL,NULL,NULL),
('RCR','Race Course','Central','["Racecourse"]',NULL,NULL,NULL,NULL),
('SBY','Saibaba Colony','Central','["Sai Baba Colony"]',NULL,NULL,NULL,NULL),
('GDM','Gandhipuram','Central','["Gandhi Puram"]',NULL,NULL,NULL,NULL),
('TWN','Town Hall','Central','["Townhall"]',NULL,NULL,NULL,NULL),
('TBD','Tatabad','Central','["Tata Bad"]',NULL,NULL,NULL,NULL),
('SCP','Sidhapudur','Central','["Siddhapudur"]',NULL,NULL,NULL,NULL),
('AVP','Avarampalayam','Central','["Avaram Palayam"]',NULL,NULL,NULL,NULL),
('RTP','Rathinapuri','Central','["Rathinapuri"]',NULL,NULL,NULL,NULL),
('SLP','Selvapuram','Central-West','["Selva Puram"]',NULL,NULL,NULL,NULL),
('PLC','Pollachi','Outer-South','["Pollachi Town"]',NULL,NULL,NULL,NULL);

INSERT OR IGNORE INTO areas(code,name)
SELECT code,canonical_name FROM area_master;

INSERT OR IGNORE INTO area_counters(area_code,last_number)
SELECT code,0 FROM area_master;

CREATE INDEX IF NOT EXISTS idx_area_master_priority ON area_master(priority_band);
CREATE INDEX IF NOT EXISTS idx_area_master_name ON area_master(canonical_name);
