CREATE TABLE IF NOT EXISTS streak_snapshots (
    id                TEXT PRIMARY KEY,
    current_streak    INTEGER NOT NULL DEFAULT 0,
    longest_streak    INTEGER NOT NULL DEFAULT 0,
    last_play_date    TEXT DEFAULT NULL,
    streak_started_at TEXT DEFAULT NULL,
    updated_at        TEXT NOT NULL
);

INSERT OR IGNORE INTO streak_snapshots (id, current_streak, longest_streak, last_play_date, streak_started_at, updated_at)
VALUES ('singleton', 0, 0, NULL, NULL, datetime('now'));
