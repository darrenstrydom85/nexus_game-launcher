-- Migration 017: Add completed flag to games table
-- Tracks whether a user has ever marked a game as completed.
-- Survives status changes (including sync setting status to 'removed').
-- Backfill: set completed = 1 for games currently with status = 'completed'.

ALTER TABLE games ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;

UPDATE games SET completed = 1 WHERE status = 'completed';
