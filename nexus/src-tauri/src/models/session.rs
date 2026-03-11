use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaySession {
    pub id: String,
    pub game_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_s: Option<i64>,
    pub tracking: String,
    pub note: Option<String>,
}

impl PlaySession {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(PlaySession {
            id: row.get("id")?,
            game_id: row.get("game_id")?,
            started_at: row.get("started_at")?,
            ended_at: row.get("ended_at")?,
            duration_s: row.get("duration_s")?,
            tracking: row.get("tracking")?,
            note: row.get("note")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayStats {
    pub game_id: String,
    pub total_time: i64,
    pub session_count: i64,
    pub average_session: i64,
    pub longest_session: i64,
    pub last_played: Option<String>,
    pub first_played: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityBucket {
    pub period: String,
    pub total_time: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStatsData {
    pub total_play_time_s: i64,
    pub games_played: i64,
    pub games_unplayed: i64,
    pub most_played_game: Option<String>,
    pub weekly_play_time_s: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopGameEntry {
    pub id: String,
    pub name: String,
    pub cover_url: Option<String>,
    pub total_play_time_s: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEntry {
    pub id: String,
    pub game_id: String,
    pub game_name: String,
    pub started_at: String,
    pub ended_at: String,
    pub duration_s: i64,
    pub note: Option<String>,
}
