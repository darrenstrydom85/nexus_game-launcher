//! Wrapped (Spotify Wrapped–style) report models and period types.
//! Used by `get_wrapped_report` and `get_available_wrapped_periods`.

use serde::{Deserialize, Serialize};

/// Date range selector for the wrapped report.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WrappedPeriod {
    /// Full calendar year (e.g. 2025).
    Year(i32),
    /// Single month.
    Month { year: i32, month: u8 },
    /// Preset: "this_month", "last_month", "this_year", "last_year", "last_7_days", "last_30_days".
    Preset(String),
    /// Custom start/end (ISO date strings YYYY-MM-DD).
    Custom {
        start_date: String,
        end_date: String,
    },
}

/// One game entry in top games or most-played.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedGame {
    pub id: String,
    pub name: String,
    pub cover_url: Option<String>,
    pub play_time_s: i64,
    pub session_count: i64,
    pub source: String,
}

/// Longest or notable session in the report.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedSession {
    pub game_id: String,
    pub game_name: String,
    pub started_at: String,
    pub duration_s: i64,
}

/// Genre share by play time.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreShare {
    pub name: String,
    pub play_time_s: i64,
    pub percent: f64,
}

/// Platform (source) share by play time.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformShare {
    pub source: String,
    pub play_time_s: i64,
    pub percent: f64,
}

/// Fun fact computed server-side (e.g. marathons, full days).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunFact {
    pub kind: String,
    pub value: f64,
    pub label: String,
}

/// Comparison to previous period (e.g. "Up 20% from last month").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub previous_total_s: i64,
    pub percent_change: f64,
    pub label: String,
}

/// Play time for one month (1–12).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthBucket {
    pub month: u8,
    pub play_time_s: i64,
}

/// Play time by day of week (0 = Monday).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayBucket {
    pub day: u8,
    pub play_time_s: i64,
}

/// Play time by hour of day (0–23).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HourBucket {
    pub hour: u8,
    pub play_time_s: i64,
}

/// Optional: low-rated but highly played game (Story 16.4).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HiddenGem {
    pub game_id: String,
    pub name: String,
    pub play_time_s: i64,
    pub rating: Option<f64>,
    pub tagline: String,
}

/// Full wrapped report for a date range.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedReport {
    pub period_label: String,
    pub total_play_time_s: i64,
    pub total_sessions: i64,
    pub total_games_played: i64,
    pub total_games_in_library: i64,
    pub new_games_added: i64,
    pub new_titles_in_period: i64,
    pub most_played_game: Option<WrappedGame>,
    pub most_played_genre: Option<String>,
    pub top_games: Vec<WrappedGame>,
    pub genre_breakdown: Vec<GenreShare>,
    pub genre_tagline: Option<String>,
    pub platform_breakdown: Vec<PlatformShare>,
    pub longest_session: Option<WrappedSession>,
    pub longest_streak_days: i64,
    pub busiest_day: Option<String>,
    pub busiest_day_play_time_s: i64,
    pub first_game_played: Option<WrappedGame>,
    pub last_game_played: Option<WrappedGame>,
    pub play_time_by_month: Vec<MonthBucket>,
    pub play_time_by_day_of_week: Vec<DayBucket>,
    pub play_time_by_hour_of_day: Vec<HourBucket>,
    pub fun_facts: Vec<FunFact>,
    pub comparison_previous_period: Option<Comparison>,
    pub mood_tagline: Option<String>,
    pub hidden_gem: Option<HiddenGem>,
    pub trivia: Vec<String>,
}

/// Response for get_available_wrapped_periods: years with session data and preset availability.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableWrappedPeriods {
    /// Years that have at least one (valid) session, sorted ascending.
    pub years_with_sessions: Vec<i32>,
    /// Whether "this_month" has data.
    pub this_month_has_data: bool,
    /// Whether "last_month" has data.
    pub last_month_has_data: bool,
    /// Whether "this_year" has data.
    pub this_year_has_data: bool,
    /// Whether "last_year" has data.
    pub last_year_has_data: bool,
}
