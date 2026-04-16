use serde::{Deserialize, Serialize};

// ── Tier thresholds (seconds) ──────────────────────────────────────

pub const THRESHOLD_BRONZE: i64 = 3_600;      // 1 hour
pub const THRESHOLD_SILVER: i64 = 36_000;     // 10 hours
pub const THRESHOLD_GOLD: i64 = 90_000;       // 25 hours
pub const THRESHOLD_PLATINUM: i64 = 180_000;  // 50 hours
pub const THRESHOLD_DIAMOND: i64 = 360_000;   // 100 hours

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MasteryTier {
    None,
    Bronze,
    Silver,
    Gold,
    Platinum,
    Diamond,
}

impl MasteryTier {
    /// Minimum play time (seconds) for this tier.
    pub fn min_seconds(&self) -> i64 {
        match self {
            MasteryTier::None => 0,
            MasteryTier::Bronze => THRESHOLD_BRONZE,
            MasteryTier::Silver => THRESHOLD_SILVER,
            MasteryTier::Gold => THRESHOLD_GOLD,
            MasteryTier::Platinum => THRESHOLD_PLATINUM,
            MasteryTier::Diamond => THRESHOLD_DIAMOND,
        }
    }

    /// The next tier above this one, if any.
    pub fn next(&self) -> Option<MasteryTier> {
        match self {
            MasteryTier::None => Some(MasteryTier::Bronze),
            MasteryTier::Bronze => Some(MasteryTier::Silver),
            MasteryTier::Silver => Some(MasteryTier::Gold),
            MasteryTier::Gold => Some(MasteryTier::Platinum),
            MasteryTier::Platinum => Some(MasteryTier::Diamond),
            MasteryTier::Diamond => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMasteryTier {
    pub game_id: String,
    pub tier: MasteryTier,
    pub total_play_time_s: i64,
    pub next_tier_threshold_s: Option<i64>,
    pub progress_to_next_tier: f64,
}

/// Pure function: resolve a mastery tier from cumulative play time.
pub fn resolve_tier(total_play_time_s: i64) -> MasteryTier {
    if total_play_time_s >= THRESHOLD_DIAMOND {
        MasteryTier::Diamond
    } else if total_play_time_s >= THRESHOLD_PLATINUM {
        MasteryTier::Platinum
    } else if total_play_time_s >= THRESHOLD_GOLD {
        MasteryTier::Gold
    } else if total_play_time_s >= THRESHOLD_SILVER {
        MasteryTier::Silver
    } else if total_play_time_s >= THRESHOLD_BRONZE {
        MasteryTier::Bronze
    } else {
        MasteryTier::None
    }
}

/// Pure function: compute progress toward the next tier (0.0–1.0).
/// Diamond tier always returns 1.0.
pub fn progress_to_next(total_play_time_s: i64, tier: &MasteryTier) -> f64 {
    match tier.next() {
        None => 1.0,
        Some(next) => {
            let current_min = tier.min_seconds();
            let next_min = next.min_seconds();
            let range = next_min - current_min;
            if range <= 0 {
                return 1.0;
            }
            let elapsed = total_play_time_s - current_min;
            (elapsed as f64 / range as f64).clamp(0.0, 1.0)
        }
    }
}

/// Build a full `GameMasteryTier` from a game ID and its play time.
pub fn build_game_mastery_tier(game_id: String, total_play_time_s: i64) -> GameMasteryTier {
    let tier = resolve_tier(total_play_time_s);
    let progress = progress_to_next(total_play_time_s, &tier);
    let next_threshold = tier.next().map(|t| t.min_seconds());

    GameMasteryTier {
        game_id,
        tier,
        total_play_time_s,
        next_tier_threshold_s: next_threshold,
        progress_to_next_tier: progress,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tier_resolution_boundaries() {
        assert_eq!(resolve_tier(0), MasteryTier::None);
        assert_eq!(resolve_tier(3_599), MasteryTier::None);
        assert_eq!(resolve_tier(3_600), MasteryTier::Bronze);
        assert_eq!(resolve_tier(35_999), MasteryTier::Bronze);
        assert_eq!(resolve_tier(36_000), MasteryTier::Silver);
        assert_eq!(resolve_tier(89_999), MasteryTier::Silver);
        assert_eq!(resolve_tier(90_000), MasteryTier::Gold);
        assert_eq!(resolve_tier(179_999), MasteryTier::Gold);
        assert_eq!(resolve_tier(180_000), MasteryTier::Platinum);
        assert_eq!(resolve_tier(359_999), MasteryTier::Platinum);
        assert_eq!(resolve_tier(360_000), MasteryTier::Diamond);
        assert_eq!(resolve_tier(1_000_000), MasteryTier::Diamond);
    }

    #[test]
    fn progress_at_tier_boundary_minimum_is_zero() {
        assert_eq!(progress_to_next(0, &MasteryTier::None), 0.0);
        assert_eq!(progress_to_next(THRESHOLD_BRONZE, &MasteryTier::Bronze), 0.0);
        assert_eq!(progress_to_next(THRESHOLD_SILVER, &MasteryTier::Silver), 0.0);
        assert_eq!(progress_to_next(THRESHOLD_GOLD, &MasteryTier::Gold), 0.0);
        assert_eq!(progress_to_next(THRESHOLD_PLATINUM, &MasteryTier::Platinum), 0.0);
    }

    #[test]
    fn progress_just_below_next_tier_is_near_one() {
        let p = progress_to_next(35_999, &MasteryTier::Bronze);
        assert!(p > 0.99 && p < 1.0, "expected ~1.0, got {p}");

        let p = progress_to_next(89_999, &MasteryTier::Silver);
        assert!(p > 0.99 && p < 1.0, "expected ~1.0, got {p}");
    }

    #[test]
    fn diamond_progress_always_one() {
        assert_eq!(progress_to_next(360_000, &MasteryTier::Diamond), 1.0);
        assert_eq!(progress_to_next(999_999, &MasteryTier::Diamond), 1.0);
    }

    #[test]
    fn build_game_mastery_tier_gold() {
        let gmt = build_game_mastery_tier("game-1".into(), 120_000);
        assert_eq!(gmt.tier, MasteryTier::Gold);
        assert_eq!(gmt.next_tier_threshold_s, Some(THRESHOLD_PLATINUM));
        let expected_progress = (120_000 - THRESHOLD_GOLD) as f64
            / (THRESHOLD_PLATINUM - THRESHOLD_GOLD) as f64;
        assert!((gmt.progress_to_next_tier - expected_progress).abs() < 1e-9);
    }

    #[test]
    fn build_game_mastery_tier_diamond_has_no_next() {
        let gmt = build_game_mastery_tier("game-2".into(), 500_000);
        assert_eq!(gmt.tier, MasteryTier::Diamond);
        assert_eq!(gmt.next_tier_threshold_s, None);
        assert_eq!(gmt.progress_to_next_tier, 1.0);
    }

    #[test]
    fn serialization_uses_lowercase_tier_names() {
        let json = serde_json::to_value(&MasteryTier::Platinum).unwrap();
        assert_eq!(json, serde_json::json!("platinum"));
    }

    #[test]
    fn serialization_uses_camel_case_struct_fields() {
        let gmt = build_game_mastery_tier("g".into(), 50_000);
        let json = serde_json::to_value(&gmt).unwrap();
        assert!(json.get("gameId").is_some());
        assert!(json.get("totalPlayTimeS").is_some());
        assert!(json.get("nextTierThresholdS").is_some());
        assert!(json.get("progressToNextTier").is_some());
    }
}
