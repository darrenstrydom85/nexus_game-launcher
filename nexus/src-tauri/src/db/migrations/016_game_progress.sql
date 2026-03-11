ALTER TABLE games ADD COLUMN progress INTEGER DEFAULT NULL CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100));
ALTER TABLE games ADD COLUMN milestones_json TEXT DEFAULT NULL;
