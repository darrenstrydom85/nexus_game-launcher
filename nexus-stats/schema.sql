-- The entire database. One row per counter; nothing that identifies anyone.
--   daily     / 2026-10-21  installs that opened Nexus that day
--   weekly    / 2026-10-19  installs that opened it that week (period = the Monday)
--   monthly   / 2026-10     installs that opened it that month
--   v1.0.2    / 2026-10-21  of that day's opens, how many ran version 1.0.2
CREATE TABLE IF NOT EXISTS counts (
  metric TEXT NOT NULL,
  period TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (metric, period)
);
