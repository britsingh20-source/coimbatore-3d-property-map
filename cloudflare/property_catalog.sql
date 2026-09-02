PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  property_kind TEXT NOT NULL CHECK(property_kind IN ('Plot','Villa')),
  bedrooms TEXT,
  address TEXT NOT NULL,
  price TEXT NOT NULL,
  land_area TEXT,
  built_up_area TEXT,
  facing TEXT,
  approval TEXT,
  road TEXT,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  features_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS property_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  original_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(property_id,slot)
);

CREATE INDEX IF NOT EXISTS idx_properties_active ON properties(active,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_images_property ON property_images(property_id,slot);
