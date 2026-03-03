-- Migration 001: Initial schema
-- Creates all 6 tables from spec Section 4.2

CREATE TABLE IF NOT EXISTS games (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    source          TEXT NOT NULL,
    source_id       TEXT,
    source_hint     TEXT,
    folder_path     TEXT,
    exe_path        TEXT,
    exe_name        TEXT,
    launch_url      TEXT,
    igdb_id         INTEGER,
    steamgrid_id    INTEGER,
    description     TEXT,
    release_date    TEXT,
    developer       TEXT,
    publisher       TEXT,
    genres          TEXT,
    cover_url       TEXT,
    hero_url        TEXT,
    logo_url        TEXT,
    screenshot_urls TEXT,
    trailer_url     TEXT,
    custom_cover    TEXT,
    custom_hero     TEXT,
    status          TEXT DEFAULT 'backlog',
    rating          INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    total_play_time INTEGER DEFAULT 0,
    last_played     TEXT,
    play_count      INTEGER DEFAULT 0,
    is_hidden       INTEGER DEFAULT 0,
    added_at        TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    source_folder_id TEXT REFERENCES watched_folders(id)
);

CREATE INDEX IF NOT EXISTS idx_games_source          ON games(source);
CREATE INDEX IF NOT EXISTS idx_games_status          ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_name            ON games(name);
CREATE INDEX IF NOT EXISTS idx_games_last_played     ON games(last_played);
CREATE INDEX IF NOT EXISTS idx_games_total_play_time ON games(total_play_time);

CREATE TABLE IF NOT EXISTS play_sessions (
    id         TEXT PRIMARY KEY,
    game_id    TEXT NOT NULL REFERENCES games(id),
    started_at TEXT NOT NULL,
    ended_at   TEXT,
    duration_s INTEGER,
    tracking   TEXT DEFAULT 'auto'
);

CREATE INDEX IF NOT EXISTS idx_sessions_game_id    ON play_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON play_sessions(started_at);

CREATE TABLE IF NOT EXISTS collections (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    icon       TEXT,
    color      TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_games (
    collection_id TEXT NOT NULL REFERENCES collections(id),
    game_id       TEXT NOT NULL REFERENCES games(id),
    added_at      TEXT NOT NULL,
    PRIMARY KEY (collection_id, game_id)
);

CREATE TABLE IF NOT EXISTS watched_folders (
    id        TEXT PRIMARY KEY,
    path      TEXT NOT NULL UNIQUE,
    label     TEXT,
    auto_scan INTEGER DEFAULT 1,
    added_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);
