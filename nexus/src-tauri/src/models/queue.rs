use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayQueueEntry {
    pub id: String,
    pub game_id: String,
    pub position: i64,
    pub added_at: String,
    pub name: String,
    pub cover_url: Option<String>,
    pub custom_cover: Option<String>,
    pub status: String,
    pub source: String,
}

impl PlayQueueEntry {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(PlayQueueEntry {
            id: row.get("id")?,
            game_id: row.get("game_id")?,
            position: row.get("position")?,
            added_at: row.get("added_at")?,
            name: row.get("name")?,
            cover_url: row.get("cover_url")?,
            custom_cover: row.get("custom_cover")?,
            status: row.get("status")?,
            source: row.get("source")?,
        })
    }
}
