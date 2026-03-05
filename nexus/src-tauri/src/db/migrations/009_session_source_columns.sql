-- Migration 009: Add source identity columns to play_sessions so session
-- history can survive a full library reset and be re-linked to newly
-- imported games by their stable (source, source_id) natural key.
-- Also stores game_name as a display-name snapshot for orphaned sessions.

ALTER TABLE play_sessions ADD COLUMN game_source TEXT;
ALTER TABLE play_sessions ADD COLUMN game_source_id TEXT;
ALTER TABLE play_sessions ADD COLUMN game_name TEXT;

-- Backfill from the current games table.
UPDATE play_sessions
SET game_source    = (SELECT g.source    FROM games g WHERE g.id = play_sessions.game_id),
    game_source_id = (SELECT g.source_id FROM games g WHERE g.id = play_sessions.game_id),
    game_name      = (SELECT g.name      FROM games g WHERE g.id = play_sessions.game_id);

CREATE INDEX IF NOT EXISTS idx_sessions_source ON play_sessions(game_source, game_source_id);
