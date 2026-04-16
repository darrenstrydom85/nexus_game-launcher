CREATE TABLE IF NOT EXISTS xp_events (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    source_id   TEXT DEFAULT NULL,
    xp_amount   INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_source_source_id
    ON xp_events (source, source_id)
    WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_xp_events_created_at
    ON xp_events (created_at DESC);
