CREATE TABLE play_queue (
    id       TEXT    PRIMARY KEY,
    game_id  TEXT    NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TEXT    NOT NULL,
    UNIQUE(game_id)
);

CREATE INDEX idx_play_queue_position ON play_queue(position);
