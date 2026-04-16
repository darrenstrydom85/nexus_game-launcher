//! Retirement ceremony models.
//!
//! `GameCeremonyData` is the full summary payload used by the frontend
//! ceremony overlay (Story 41.2) and the certificate share card (Story 41.3).
//! It is assembled by `commands::ceremony::get_game_ceremony_data` from a
//! single game and its qualifying play sessions.

use serde::{Deserialize, Serialize};

/// Play time aggregated to one calendar month.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthPlayTime {
    /// "YYYY-MM" label (e.g. "2026-03").
    pub month: String,
    pub play_time_s: i64,
}

/// Full ceremony data for a single game.
///
/// Returned by `get_game_ceremony_data`. If the game has no qualifying
/// sessions this is still a valid struct (all aggregates zeroed, empty
/// vectors, `first_played_at`/`last_played_at` empty strings).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCeremonyData {
    pub game_id: String,
    pub game_name: String,
    pub cover_art_url: Option<String>,
    pub hero_art_url: Option<String>,
    /// Raw `games.status` — "completed", "dropped", "backlog", "playing",
    /// "wishlist", or "removed" (for uninstalled/archived games).
    pub status: String,
    /// `games.completed` flag. Survives status changes, so a game that was
    /// completed and later uninstalled (status = "removed") still returns
    /// `completed: true` here. UI uses this — not `status == "completed"` —
    /// as the canonical "was this game finished?" signal.
    pub completed: bool,
    pub rating: Option<i32>,
    pub total_play_time_s: i64,
    pub total_sessions: i64,
    pub longest_session_s: i64,
    pub average_session_s: i64,
    /// ISO timestamp of the earliest qualifying session; empty string if none.
    pub first_played_at: String,
    /// ISO timestamp of the most recent qualifying session; empty string if none.
    pub last_played_at: String,
    /// Whole days between `first_played_at` and `last_played_at` (inclusive).
    /// Zero when there are no sessions or both fall on the same calendar day.
    pub days_between_first_and_last: i64,
    /// One entry per calendar month from first → last (no gaps).
    pub play_time_by_month: Vec<MonthPlayTime>,
    /// 7 entries, Monday=0 through Sunday=6.
    pub play_time_by_day_of_week: Vec<i64>,
    /// 24 entries, hour 0 through hour 23.
    pub play_time_by_hour_of_day: Vec<i64>,
    /// 2–4 human-readable fun facts derived from the data.
    pub fun_facts: Vec<String>,
    /// Mastery tier name (lowercase): "none" | "bronze" | "silver" | "gold" | "platinum" | "diamond".
    pub mastery_tier: String,
    /// Raw genres string from the game row, if any (JSON array or CSV).
    pub genres: Option<String>,
    /// 4-digit release year parsed from `games.release_date`, if available.
    pub release_year: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn struct_serializes_to_camel_case() {
        let data = GameCeremonyData {
            game_id: "g1".into(),
            game_name: "Game One".into(),
            cover_art_url: None,
            hero_art_url: None,
            status: "completed".into(),
            completed: true,
            rating: Some(4),
            total_play_time_s: 3600,
            total_sessions: 1,
            longest_session_s: 3600,
            average_session_s: 3600,
            first_played_at: "2026-01-01T00:00:00Z".into(),
            last_played_at: "2026-01-01T00:00:00Z".into(),
            days_between_first_and_last: 0,
            play_time_by_month: vec![MonthPlayTime {
                month: "2026-01".into(),
                play_time_s: 3600,
            }],
            play_time_by_day_of_week: vec![0, 0, 0, 0, 0, 0, 0],
            play_time_by_hour_of_day: vec![0; 24],
            fun_facts: vec!["A fact".into()],
            mastery_tier: "none".into(),
            genres: None,
            release_year: None,
        };
        let json = serde_json::to_value(&data).unwrap();
        assert!(json.get("gameId").is_some());
        assert!(json.get("gameName").is_some());
        assert!(json.get("coverArtUrl").is_some());
        assert!(json.get("completed").is_some());
        assert!(json.get("totalPlayTimeS").is_some());
        assert!(json.get("longestSessionS").is_some());
        assert!(json.get("firstPlayedAt").is_some());
        assert!(json.get("daysBetweenFirstAndLast").is_some());
        assert!(json.get("playTimeByMonth").is_some());
        assert!(json.get("playTimeByDayOfWeek").is_some());
        assert!(json.get("playTimeByHourOfDay").is_some());
        assert!(json.get("funFacts").is_some());
        assert!(json.get("masteryTier").is_some());
        assert!(json.get("releaseYear").is_some());
    }

    #[test]
    fn month_play_time_serializes_to_camel_case() {
        let m = MonthPlayTime {
            month: "2026-01".into(),
            play_time_s: 1800,
        };
        let json = serde_json::to_value(&m).unwrap();
        assert!(json.get("month").is_some());
        assert!(json.get("playTimeS").is_some());
    }
}
