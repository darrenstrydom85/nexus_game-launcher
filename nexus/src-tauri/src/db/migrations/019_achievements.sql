CREATE TABLE IF NOT EXISTS achievements (
    id           TEXT PRIMARY KEY,
    unlocked_at  TEXT NOT NULL,
    context_json TEXT DEFAULT NULL
);
