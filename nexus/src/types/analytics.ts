/**
 * Session analytics types for Epic 17.
 * Mirrors the Rust structs in `models/analytics.rs`.
 */

import type { MonthBucket, DayBucket } from "./wrapped";

/**
 * Scope selector for `getSessionDistribution`.
 * Matches Rust `SessionScope` enum (serde tag = "type", content = "value").
 */
export type SessionScope =
  | { type: "library" }
  | { type: "game"; value: string }
  | { type: "source"; value: string };

/** One histogram bucket in a session-length distribution. */
export interface DistributionBucket {
  /** Human-readable label, e.g. "15–30m". */
  label: string;
  /** Lower bound in seconds (inclusive). */
  minS: number;
  /** Upper bound in seconds (exclusive). `null` means unbounded (last bucket). */
  maxS: number | null;
  /** Number of sessions in this bucket. */
  count: number;
  /** Total play time across sessions in this bucket, in seconds. */
  totalPlayTimeS: number;
}

/** Session-length distribution histogram with summary statistics. */
export interface SessionDistribution {
  buckets: DistributionBucket[];
  totalSessions: number;
  meanDurationS: number;
  medianDurationS: number;
  p75DurationS: number;
  p95DurationS: number;
  shortestSessionS: number;
  longestSessionS: number;
}

/** A single session record returned in per-game analytics. */
export interface SessionRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  trackingMethod: string;
}

/** Full per-game session analytics response. */
export interface PerGameSessionStats {
  /** All sessions for the game, newest first (default 50, max 200). */
  sessions: SessionRecord[];
  /** Session-length histogram for this game only. */
  distribution: SessionDistribution;
  /** Monthly play time for the last 12 months. */
  playTimeByMonth: MonthBucket[];
  /** Play time by day of week (7 entries, 0 = Monday). */
  playTimeByDayOfWeek: DayBucket[];
  /** Average number of days between consecutive sessions (0 if < 2 sessions). */
  averageGapDays: number;
}
