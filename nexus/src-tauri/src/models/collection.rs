use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i64,
    pub is_smart: bool,
    pub rules_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Collection {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        let is_smart_int: i32 = row.get("is_smart")?;
        Ok(Collection {
            id: row.get("id")?,
            name: row.get("name")?,
            icon: row.get("icon")?,
            color: row.get("color")?,
            sort_order: row.get("sort_order")?,
            is_smart: is_smart_int != 0,
            rules_json: row.get("rules_json")?,
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
    pub is_smart: bool,
    pub rules_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub game_count: i64,
}

impl CollectionWithCount {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        let is_smart_int: i32 = row.get("is_smart")?;
        Ok(CollectionWithCount {
            id: row.get("id")?,
            name: row.get("name")?,
            icon: row.get("icon")?,
            color: row.get("color")?,
            sort_order: row.get("sort_order")?,
            is_smart: is_smart_int != 0,
            rules_json: row.get("rules_json")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            game_count: row.get("game_count")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionWithGameIds {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i64,
    pub is_smart: bool,
    pub rules_json: Option<String>,
    pub game_ids: Vec<String>,
}

// ── Smart Collection Rule Types ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartCollectionRuleGroup {
    pub operator: GroupOperator,
    pub conditions: Vec<SmartCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GroupOperator {
    And,
    Or,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SmartCondition {
    Rule(SmartCollectionRule),
    Group(SmartCollectionRuleGroup),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartCollectionRule {
    pub field: String,
    pub op: String,
    pub value: serde_json::Value,
}
