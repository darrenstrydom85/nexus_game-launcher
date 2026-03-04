-- Migration 007: Twitch API offline cache tables (Story 19.2)
-- twitch_followed_channels: followed channel list (TTL ~1h, refreshed on fetch)
-- twitch_stream_cache: live stream data (replaced on each fetch)
-- twitch_game_cache: game name -> Twitch category ID (TTL 24h)

CREATE TABLE IF NOT EXISTS twitch_followed_channels (
    channel_id        TEXT PRIMARY KEY,
    login             TEXT NOT NULL,
    display_name      TEXT NOT NULL,
    profile_image_url TEXT NOT NULL,
    is_favorite       INTEGER DEFAULT 0,
    cached_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS twitch_stream_cache (
    channel_id    TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    game_name     TEXT NOT NULL,
    game_id       TEXT NOT NULL,
    viewer_count  INTEGER NOT NULL,
    thumbnail_url TEXT NOT NULL,
    started_at    TEXT NOT NULL,
    cached_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS twitch_game_cache (
    game_name       TEXT PRIMARY KEY,
    twitch_game_id  TEXT NOT NULL,
    twitch_game_name TEXT NOT NULL,
    cached_at       INTEGER NOT NULL
);
