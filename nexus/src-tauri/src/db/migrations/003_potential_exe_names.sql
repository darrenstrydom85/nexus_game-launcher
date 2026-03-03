-- Migration 003: Add potential_exe_names column
-- Stores a comma-separated list of candidate exe filenames for process tracking.
-- Populated automatically during library sync; editable by the user.

ALTER TABLE games ADD COLUMN potential_exe_names TEXT;
