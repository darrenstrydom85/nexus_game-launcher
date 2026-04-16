use serde::{Deserialize, Serialize};

// ── Enums ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AchievementCategory {
    Library,
    Play,
    Completion,
    Streak,
    Exploration,
    Session,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AchievementRarity {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
}

// ── Definition (static, compiled into binary) ──────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
    pub category: AchievementCategory,
    pub rarity: AchievementRarity,
    pub points: u32,
}

// ── Unlocked record (from DB) ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockedAchievement {
    pub id: String,
    pub unlocked_at: String,
    pub context_json: Option<String>,
}

impl UnlockedAchievement {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(UnlockedAchievement {
            id: row.get("id")?,
            unlocked_at: row.get("unlocked_at")?,
            context_json: row.get("context_json")?,
        })
    }
}

// ── Merged view for the frontend ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub category: AchievementCategory,
    pub rarity: AchievementRarity,
    pub points: u32,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
    pub context_json: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn category_serializes_lowercase() {
        let json = serde_json::to_value(&AchievementCategory::Exploration).unwrap();
        assert_eq!(json, serde_json::json!("exploration"));
    }

    #[test]
    fn rarity_serializes_lowercase() {
        let json = serde_json::to_value(&AchievementRarity::Legendary).unwrap();
        assert_eq!(json, serde_json::json!("legendary"));
    }

    #[test]
    fn status_serializes_camel_case() {
        let status = AchievementStatus {
            id: "test".into(),
            name: "Test".into(),
            description: "desc".into(),
            icon: "Trophy".into(),
            category: AchievementCategory::Library,
            rarity: AchievementRarity::Common,
            points: 25,
            unlocked: true,
            unlocked_at: Some("2026-04-16T12:00:00Z".into()),
            context_json: None,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert!(json.get("unlockedAt").is_some());
        assert!(json.get("contextJson").is_some());
    }
}
