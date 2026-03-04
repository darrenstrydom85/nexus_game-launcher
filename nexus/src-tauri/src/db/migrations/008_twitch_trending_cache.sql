-- Migration 008: Twitch trending library cache (Story 19.9). 15-minute TTL.

CREATE TABLE IF NOT EXISTS twitch_trending_library_cache (
    game_id             TEXT PRIMARY KEY,
    game_name            TEXT NOT NULL,
    twitch_game_name     TEXT NOT NULL,
    twitch_game_id       TEXT NOT NULL,
    twitch_viewer_count  INTEGER NOT NULL,
    twitch_stream_count  INTEGER NOT NULL,
    twitch_rank          INTEGER NOT NULL,
    cached_at            INTEGER NOT NULL
);
