use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
}

impl Tag {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Tag {
            id: row.get("id")?,
            name: row.get("name")?,
            color: row.get("color")?,
            created_at: row.get("created_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagWithCount {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
    pub game_count: i64,
}

impl TagWithCount {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(TagWithCount {
            id: row.get("id")?,
            name: row.get("name")?,
            color: row.get("color")?,
            created_at: row.get("created_at")?,
            game_count: row.get("game_count")?,
        })
    }
}
