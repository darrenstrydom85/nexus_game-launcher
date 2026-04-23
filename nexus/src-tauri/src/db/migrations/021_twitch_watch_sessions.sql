-- Story: Session-based Twitch watch history (E1).
-- Each row is one open->close cycle of an embedded Twitch player (inline or pop-out).
-- `duration_secs` is the *effective* watch time tracked by the frontend, which pauses while
-- the host window is hidden/minimized so background tabs don't inflate totals.

CREATE TABLE IF NOT EXISTS twitch_watch_sessions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_login        TEXT NOT NULL,
    channel_display_name TEXT,
    twitch_game_id       TEXT,
    twitch_game_name     TEXT,
    nexus_game_id        TEXT,
    started_at           INTEGER NOT NULL,
    ended_at             INTEGER,
    duration_secs        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tws_started      ON twitch_watch_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_tws_channel      ON twitch_watch_sessions(channel_login);
CREATE INDEX IF NOT EXISTS idx_tws_nexus_game   ON twitch_watch_sessions(nexus_game_id);
