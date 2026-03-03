-- Migration 005: Add HowLongToBeat completion time columns to games table
ALTER TABLE games ADD COLUMN hltb_main_s          INTEGER;
ALTER TABLE games ADD COLUMN hltb_main_plus_s     INTEGER;
ALTER TABLE games ADD COLUMN hltb_completionist_s INTEGER;
ALTER TABLE games ADD COLUMN hltb_game_id         INTEGER;
