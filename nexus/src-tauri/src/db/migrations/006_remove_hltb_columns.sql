-- Migration 006: Remove HowLongToBeat columns (feature removed)
-- SQLite 3.35+ required for DROP COLUMN

ALTER TABLE games DROP COLUMN hltb_main_s;
ALTER TABLE games DROP COLUMN hltb_main_plus_s;
ALTER TABLE games DROP COLUMN hltb_completionist_s;
ALTER TABLE games DROP COLUMN hltb_game_id;
