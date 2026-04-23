-- Story A2: cached top clips per Twitch game id.
-- One row per (twitch_game_id, period_days) — `payload` is the full Vec<TwitchClip>
-- serialized to JSON. TTL is enforced by the Rust caller (~6h).

CREATE TABLE IF NOT EXISTS twitch_clips_cache (
    twitch_game_id TEXT NOT NULL,
    period_days    INTEGER NOT NULL,
    fetched_at     INTEGER NOT NULL,
    payload        TEXT NOT NULL,
    PRIMARY KEY (twitch_game_id, period_days)
);

CREATE INDEX IF NOT EXISTS idx_clips_cache_fetched ON twitch_clips_cache(fetched_at);
