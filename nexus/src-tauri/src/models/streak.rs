use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakSnapshot {
    pub id: String,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub last_play_date: Option<String>,
    pub streak_started_at: Option<String>,
    pub updated_at: String,
}

impl StreakSnapshot {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(StreakSnapshot {
            id: row.get("id")?,
            current_streak: row.get("current_streak")?,
            longest_streak: row.get("longest_streak")?,
            last_play_date: row.get("last_play_date")?,
            streak_started_at: row.get("streak_started_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
