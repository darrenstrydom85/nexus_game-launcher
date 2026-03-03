use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Setting {
    pub key: String,
    pub value: Option<String>,
}

impl Setting {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Setting {
            key: row.get("key")?,
            value: row.get("value")?,
        })
    }
}

pub type SettingsMap = HashMap<String, Option<String>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchedFolder {
    pub id: String,
    pub path: String,
    pub label: Option<String>,
    pub auto_scan: bool,
    pub added_at: String,
}

impl WatchedFolder {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        let auto_scan_int: i64 = row.get("auto_scan")?;
        Ok(WatchedFolder {
            id: row.get("id")?,
            path: row.get("path")?,
            label: row.get("label")?,
            auto_scan: auto_scan_int != 0,
            added_at: row.get("added_at")?,
        })
    }
}

/// Known setting keys from spec Section 4.2.6
pub mod keys {
    pub const STEAMGRID_API_KEY: &str = "steamgrid_api_key";
    pub const IGDB_CLIENT_ID: &str = "igdb_client_id";
    pub const IGDB_CLIENT_SECRET: &str = "igdb_client_secret";
    pub const IGDB_ACCESS_TOKEN: &str = "igdb_access_token";
    pub const IGDB_TOKEN_EXPIRES: &str = "igdb_token_expires";
    pub const ONBOARDING_COMPLETED: &str = "onboarding_completed";
    pub const ONBOARDING_SKIPPED_STEPS: &str = "onboarding_skipped_steps";
    pub const SOURCE_STEAM_ENABLED: &str = "source_steam_enabled";
    pub const SOURCE_EPIC_ENABLED: &str = "source_epic_enabled";
    pub const SOURCE_GOG_ENABLED: &str = "source_gog_enabled";
    pub const SOURCE_UBISOFT_ENABLED: &str = "source_ubisoft_enabled";
    pub const SOURCE_BATTLENET_ENABLED: &str = "source_battlenet_enabled";
    pub const SOURCE_XBOX_ENABLED: &str = "source_xbox_enabled";
    pub const SOURCE_STEAM_PATH_OVERRIDE: &str = "source_steam_path_override";
    pub const SOURCE_EPIC_PATH_OVERRIDE: &str = "source_epic_path_override";
    pub const SOURCE_GOG_PATH_OVERRIDE: &str = "source_gog_path_override";
    pub const SOURCE_UBISOFT_PATH_OVERRIDE: &str = "source_ubisoft_path_override";
    pub const SOURCE_BATTLENET_PATH_OVERRIDE: &str = "source_battlenet_path_override";
    pub const SOURCE_BATTLENET_DATA_PATH_OVERRIDE: &str = "source_battlenet_data_path_override";
    pub const THEME_ACCENT_COLOR: &str = "theme_accent_color";
    pub const LIBRARY_VIEW_MODE: &str = "library_view_mode";
    pub const LIBRARY_SORT_BY: &str = "library_sort_by";
    pub const LIBRARY_SORT_DIR: &str = "library_sort_dir";
}
