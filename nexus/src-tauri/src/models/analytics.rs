//! Session analytics models for Epic 17.
//! Used by `get_session_distribution` and `get_per_game_session_stats`.

use serde::{Deserialize, Serialize};

use super::wrapped::{DayBucket, MonthBucket};

/// Scope selector for `get_session_distribution`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "value")]
pub enum SessionScope {
    /// Aggregate across the entire library.
    Library,
    /// Single game by ID.
    Game(String),
    /// All games from a specific source (e.g. "steam", "epic").
    Source(String),
}

/// One histogram bucket in a session-length distribution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionBucket {
    /// Human-readable label, e.g. "15–30m".
    pub label: String,
    /// Lower bound in seconds (inclusive).
    pub min_s: i64,
    /// Upper bound in seconds (exclusive). `None` means unbounded (last bucket).
    pub max_s: Option<i64>,
    /// Number of sessions in this bucket.
    pub count: i64,
    /// Total play time across sessions in this bucket.
    pub total_play_time_s: i64,
}

/// Session-length distribution histogram with summary statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDistribution {
    pub buckets: Vec<DistributionBucket>,
    pub total_sessions: i64,
    pub mean_duration_s: f64,
    pub median_duration_s: f64,
    pub p75_duration_s: f64,
    pub p95_duration_s: f64,
    pub shortest_session_s: i64,
    pub longest_session_s: i64,
}

/// A single session record returned in per-game analytics.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub started_at: String,
    pub ended_at: String,
    pub duration_s: i64,
    pub tracking_method: String,
}

/// Full per-game session analytics response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerGameSessionStats {
    /// All sessions for the game, newest first, paginated (default 50, max 200).
    pub sessions: Vec<SessionRecord>,
    /// Session-length histogram for this game only.
    pub distribution: SessionDistribution,
    /// Monthly play time for the last 12 months.
    pub play_time_by_month: Vec<MonthBucket>,
    /// Play time by day of week (7 entries, 0 = Monday).
    pub play_time_by_day_of_week: Vec<DayBucket>,
    /// Average number of days between consecutive sessions (0.0 if < 2 sessions).
    pub average_gap_days: f64,
}

/// Fixed histogram bucket definitions (boundaries in seconds).
/// Labels and boundaries match the spec: [0-15m, 15-30m, 30m-1h, 1-2h, 2-4h, 4-8h, 8h+].
pub const BUCKET_DEFINITIONS: &[(&str, i64, Option<i64>)] = &[
    ("< 15m", 0, Some(15 * 60)),
    ("15–30m", 15 * 60, Some(30 * 60)),
    ("30m–1h", 30 * 60, Some(60 * 60)),
    ("1–2h", 60 * 60, Some(2 * 60 * 60)),
    ("2–4h", 2 * 60 * 60, Some(4 * 60 * 60)),
    ("4–8h", 4 * 60 * 60, Some(8 * 60 * 60)),
    ("8h+", 8 * 60 * 60, None),
];

/// Minimum session duration to include (< 30s = accidental launch).
pub const MIN_SESSION_DURATION_S: i64 = 30;
