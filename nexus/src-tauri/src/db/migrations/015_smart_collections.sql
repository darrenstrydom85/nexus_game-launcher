-- Smart Collections: add is_smart flag and rules_json to collections
ALTER TABLE collections ADD COLUMN is_smart INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collections ADD COLUMN rules_json TEXT;
