use serde::{Deserialize, Serialize};

pub mod sources {
    pub const SESSION_COMPLETE: &str = "session_complete";
    pub const SESSION_BONUS_1H: &str = "session_bonus_1h";
    pub const GAME_LAUNCH: &str = "game_launch";
    pub const GAME_COMPLETE: &str = "game_complete";
    pub const STREAK_DAY: &str = "streak_day";
    pub const ACHIEVEMENT_UNLOCK: &str = "achievement_unlock";
    pub const GOAL_COMPLETE: &str = "goal_complete";
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XpEvent {
    pub id: String,
    pub source: String,
    pub source_id: Option<String>,
    pub xp_amount: i64,
    pub description: String,
    pub created_at: String,
}

impl XpEvent {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(XpEvent {
            id: row.get("id")?,
            source: row.get("source")?,
            source_id: row.get("source_id")?,
            xp_amount: row.get("xp_amount")?,
            description: row.get("description")?,
            created_at: row.get("created_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XpSummary {
    pub total_xp: i64,
    pub current_level: i32,
    pub current_level_xp: i64,
    pub next_level_xp: i64,
    pub progress_to_next_level: f64,
    pub leveled_up: bool,
    pub new_level: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XpBreakdownRow {
    pub source_type: String,
    pub total_xp: i64,
    pub event_count: i64,
}

/// Calculates level info from total XP.
/// Formula: level = floor(sqrt(total_xp / 100))
/// XP for level n: n^2 * 100
pub fn calculate_level(total_xp: i64) -> (i32, i64, i64, f64) {
    if total_xp <= 0 {
        return (0, 0, 100, 0.0);
    }

    let level = ((total_xp as f64 / 100.0).sqrt()).floor() as i32;
    let level_floor_xp = (level as i64) * (level as i64) * 100;
    let next_level_floor_xp = ((level + 1) as i64) * ((level + 1) as i64) * 100;

    let current_level_xp = total_xp - level_floor_xp;
    let next_level_xp = next_level_floor_xp - level_floor_xp;

    let progress = if next_level_xp > 0 {
        (current_level_xp as f64 / next_level_xp as f64).clamp(0.0, 1.0)
    } else {
        0.0
    };

    (level, current_level_xp, next_level_xp, progress)
}

pub fn build_xp_summary(total_xp: i64) -> XpSummary {
    let (level, current_level_xp, next_level_xp, progress) = calculate_level(total_xp);
    XpSummary {
        total_xp,
        current_level: level,
        current_level_xp,
        next_level_xp,
        progress_to_next_level: progress,
        leveled_up: false,
        new_level: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_0_at_0_xp() {
        let (level, clxp, nlxp, progress) = calculate_level(0);
        assert_eq!(level, 0);
        assert_eq!(clxp, 0);
        assert_eq!(nlxp, 100);
        assert_eq!(progress, 0.0);
    }

    #[test]
    fn level_1_at_100_xp() {
        let (level, clxp, nlxp, _) = calculate_level(100);
        assert_eq!(level, 1);
        assert_eq!(clxp, 0);
        assert_eq!(nlxp, 300); // (2^2 * 100) - (1^2 * 100) = 400 - 100 = 300
    }

    #[test]
    fn level_1_at_399_xp() {
        let (level, _, _, _) = calculate_level(399);
        assert_eq!(level, 1);
    }

    #[test]
    fn level_2_at_400_xp() {
        let (level, clxp, nlxp, _) = calculate_level(400);
        assert_eq!(level, 2);
        assert_eq!(clxp, 0);
        assert_eq!(nlxp, 500); // (3^2 * 100) - (2^2 * 100) = 900 - 400 = 500
    }

    #[test]
    fn level_10_at_10000_xp() {
        let (level, _, _, _) = calculate_level(10_000);
        assert_eq!(level, 10);
    }

    #[test]
    fn progress_mid_level() {
        let (level, clxp, nlxp, progress) = calculate_level(250);
        assert_eq!(level, 1);
        assert_eq!(clxp, 150);
        assert_eq!(nlxp, 300);
        let expected = 150.0 / 300.0;
        assert!((progress - expected).abs() < 0.001);
    }

    #[test]
    fn negative_xp_gives_level_0() {
        let (level, _, _, _) = calculate_level(-50);
        assert_eq!(level, 0);
    }
}
