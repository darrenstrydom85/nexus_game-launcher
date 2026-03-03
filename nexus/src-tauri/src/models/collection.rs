use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl Collection {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Collection {
            id: row.get("id")?,
            name: row.get("name")?,
            icon: row.get("icon")?,
            color: row.get("color")?,
            sort_order: row.get("sort_order")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionWithCount {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub game_count: i64,
}

impl CollectionWithCount {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(CollectionWithCount {
            id: row.get("id")?,
            name: row.get("name")?,
            icon: row.get("icon")?,
            color: row.get("color")?,
            sort_order: row.get("sort_order")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            game_count: row.get("game_count")?,
        })
    }
}
