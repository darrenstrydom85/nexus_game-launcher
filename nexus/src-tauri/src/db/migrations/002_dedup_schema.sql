-- Migration 002: Deduplication schema
-- Tracks duplicate game groups and user resolution preferences

CREATE TABLE IF NOT EXISTS game_duplicates (
    id              TEXT PRIMARY KEY,
    primary_game_id TEXT NOT NULL REFERENCES games(id),
    resolution      TEXT NOT NULL DEFAULT 'unresolved',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_duplicate_members (
    duplicate_id TEXT NOT NULL REFERENCES game_duplicates(id) ON DELETE CASCADE,
    game_id      TEXT NOT NULL REFERENCES games(id),
    is_preferred INTEGER DEFAULT 0,
    is_hidden    INTEGER DEFAULT 0,
    PRIMARY KEY (duplicate_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_game_duplicates_primary   ON game_duplicates(primary_game_id);
CREATE INDEX IF NOT EXISTS idx_game_dup_members_game     ON game_duplicate_members(game_id);
CREATE INDEX IF NOT EXISTS idx_game_dup_members_dup      ON game_duplicate_members(duplicate_id);
CREATE INDEX IF NOT EXISTS idx_games_igdb_id             ON games(igdb_id);
