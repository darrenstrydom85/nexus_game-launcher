-- Migration 004: Add IGDB review score columns to games table
ALTER TABLE games ADD COLUMN critic_score      REAL;
ALTER TABLE games ADD COLUMN critic_score_count INTEGER;
ALTER TABLE games ADD COLUMN community_score   REAL;
ALTER TABLE games ADD COLUMN community_score_count INTEGER;
