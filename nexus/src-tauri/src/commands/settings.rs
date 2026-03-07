use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;
use crate::models::settings::{SettingsMap, WatchedFolder};

#[tauri::command]
pub fn get_setting(db: State<'_, DbState>, key: String) -> Result<Option<String>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, Option<String>>(0),
    );

    match result {
        Ok(value) => Ok(value),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(CommandError::Database(e.to_string())),
    }
}

#[tauri::command]
pub fn set_setting(
    db: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn get_settings(db: State<'_, DbState>) -> Result<SettingsMap, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>("key")?,
                row.get::<_, Option<String>>("value")?,
            ))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let mut map = SettingsMap::new();
    for row in rows {
        let (k, v) = row.map_err(|e| CommandError::Database(e.to_string()))?;
        map.insert(k, v);
    }

    Ok(map)
}

#[tauri::command]
pub fn get_watched_folders(db: State<'_, DbState>) -> Result<Vec<WatchedFolder>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT * FROM watched_folders ORDER BY added_at ASC")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let folders = stmt
        .query_map([], WatchedFolder::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(folders)
}

#[tauri::command]
pub fn add_watched_folder(
    db: State<'_, DbState>,
    path: String,
    label: Option<String>,
    auto_scan: Option<bool>,
) -> Result<WatchedFolder, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let auto_scan_val: i64 = if auto_scan.unwrap_or(true) { 1 } else { 0 };

    conn.execute(
        "INSERT INTO watched_folders (id, path, label, auto_scan, added_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, path, label, auto_scan_val, now],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let folder = conn
        .query_row(
            "SELECT * FROM watched_folders WHERE id = ?1",
            params![id],
            WatchedFolder::from_row,
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(folder)
}

#[tauri::command]
pub fn remove_watched_folder(db: State<'_, DbState>, id: String) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let changes = conn
        .execute("DELETE FROM watched_folders WHERE id = ?1", params![id])
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if changes == 0 {
        return Err(CommandError::NotFound(format!("watched folder {id}")));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::settings::keys;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    // ── Test helpers: non-Tauri wrappers ──

    fn get_setting_inner(state: &DbState, key: String) -> Result<Option<String>, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let result = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, Option<String>>(0),
        );

        match result {
            Ok(value) => Ok(value),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(CommandError::Database(e.to_string())),
        }
    }

    fn set_setting_inner(
        state: &DbState,
        key: String,
        value: String,
    ) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    fn get_settings_inner(state: &DbState) -> Result<SettingsMap, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>("key")?,
                    row.get::<_, Option<String>>("value")?,
                ))
            })
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let mut map = SettingsMap::new();
        for row in rows {
            let (k, v) = row.map_err(|e| CommandError::Database(e.to_string()))?;
            map.insert(k, v);
        }

        Ok(map)
    }

    fn get_watched_folders_inner(state: &DbState) -> Result<Vec<WatchedFolder>, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let mut stmt = conn
            .prepare("SELECT * FROM watched_folders ORDER BY added_at ASC")
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let folders = stmt
            .query_map([], WatchedFolder::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(folders)
    }

    fn add_watched_folder_inner(
        state: &DbState,
        path: String,
        label: Option<String>,
        auto_scan: Option<bool>,
    ) -> Result<WatchedFolder, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let auto_scan_val: i64 = if auto_scan.unwrap_or(true) { 1 } else { 0 };

        conn.execute(
            "INSERT INTO watched_folders (id, path, label, auto_scan, added_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, path, label, auto_scan_val, now],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        let folder = conn
            .query_row(
                "SELECT * FROM watched_folders WHERE id = ?1",
                params![id],
                WatchedFolder::from_row,
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(folder)
    }

    fn remove_watched_folder_inner(state: &DbState, id: String) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let changes = conn
            .execute("DELETE FROM watched_folders WHERE id = ?1", params![id])
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if changes == 0 {
            return Err(CommandError::NotFound(format!("watched folder {id}")));
        }

        Ok(())
    }

    // ── get_setting ──

    #[test]
    fn get_setting_returns_none_for_missing_key() {
        let state = setup_db();
        let result = get_setting_inner(&state, "nonexistent".into()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn get_setting_returns_value_after_set() {
        let state = setup_db();
        set_setting_inner(&state, keys::STEAMGRID_API_KEY.into(), "abc123".into()).unwrap();
        let val = get_setting_inner(&state, keys::STEAMGRID_API_KEY.into()).unwrap();
        assert_eq!(val, Some("abc123".into()));
    }

    // ── set_setting ──

    #[test]
    fn set_setting_inserts_new_key() {
        let state = setup_db();
        set_setting_inner(&state, "my_key".into(), "my_value".into()).unwrap();
        let val = get_setting_inner(&state, "my_key".into()).unwrap();
        assert_eq!(val, Some("my_value".into()));
    }

    #[test]
    fn set_setting_upserts_existing_key() {
        let state = setup_db();
        set_setting_inner(&state, "my_key".into(), "first".into()).unwrap();
        set_setting_inner(&state, "my_key".into(), "second".into()).unwrap();
        let val = get_setting_inner(&state, "my_key".into()).unwrap();
        assert_eq!(val, Some("second".into()));
    }

    // ── get_settings ──

    #[test]
    fn get_settings_returns_empty_map_initially() {
        let state = setup_db();
        let map = get_settings_inner(&state).unwrap();
        assert!(map.is_empty());
    }

    #[test]
    fn get_settings_returns_all_entries() {
        let state = setup_db();
        set_setting_inner(&state, "key_a".into(), "val_a".into()).unwrap();
        set_setting_inner(&state, "key_b".into(), "val_b".into()).unwrap();
        set_setting_inner(&state, "key_c".into(), "val_c".into()).unwrap();

        let map = get_settings_inner(&state).unwrap();
        assert_eq!(map.len(), 3);
        assert_eq!(map.get("key_a").unwrap(), &Some("val_a".into()));
        assert_eq!(map.get("key_b").unwrap(), &Some("val_b".into()));
        assert_eq!(map.get("key_c").unwrap(), &Some("val_c".into()));
    }

    // ── get_watched_folders ──

    #[test]
    fn get_watched_folders_returns_empty_initially() {
        let state = setup_db();
        let folders = get_watched_folders_inner(&state).unwrap();
        assert!(folders.is_empty());
    }

    // ── add_watched_folder ──

    #[test]
    fn add_watched_folder_basic() {
        let state = setup_db();
        let folder =
            add_watched_folder_inner(&state, "C:\\Games".into(), None, None).unwrap();
        assert_eq!(folder.path, "C:\\Games");
        assert!(folder.label.is_none());
        assert!(folder.auto_scan);
        assert!(!folder.id.is_empty());
    }

    #[test]
    fn add_watched_folder_with_label_and_auto_scan_off() {
        let state = setup_db();
        let folder = add_watched_folder_inner(
            &state,
            "D:\\Repacks".into(),
            Some("My Repacks".into()),
            Some(false),
        )
        .unwrap();
        assert_eq!(folder.path, "D:\\Repacks");
        assert_eq!(folder.label, Some("My Repacks".into()));
        assert!(!folder.auto_scan);
    }

    #[test]
    fn add_watched_folder_duplicate_path_fails() {
        let state = setup_db();
        add_watched_folder_inner(&state, "C:\\Games".into(), None, None).unwrap();
        let result = add_watched_folder_inner(&state, "C:\\Games".into(), None, None);
        assert!(result.is_err());
    }

    #[test]
    fn add_multiple_watched_folders_returns_all() {
        let state = setup_db();
        add_watched_folder_inner(&state, "C:\\Games".into(), None, None).unwrap();
        add_watched_folder_inner(&state, "D:\\Repacks".into(), Some("Repacks".into()), None)
            .unwrap();

        let folders = get_watched_folders_inner(&state).unwrap();
        assert_eq!(folders.len(), 2);
    }

    // ── remove_watched_folder ──

    #[test]
    fn remove_watched_folder_deletes_record() {
        let state = setup_db();
        let folder =
            add_watched_folder_inner(&state, "C:\\Games".into(), None, None).unwrap();
        remove_watched_folder_inner(&state, folder.id).unwrap();

        let folders = get_watched_folders_inner(&state).unwrap();
        assert!(folders.is_empty());
    }

    #[test]
    fn remove_watched_folder_nonexistent_returns_not_found() {
        let state = setup_db();
        let result = remove_watched_folder_inner(&state, "nonexistent-id".into());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    // ── key constants ──

    #[test]
    fn setting_key_constants_are_valid_strings() {
        let all_keys = [
            keys::STEAMGRID_API_KEY,
            keys::IGDB_CLIENT_ID,
            keys::IGDB_CLIENT_SECRET,
            keys::IGDB_ACCESS_TOKEN,
            keys::IGDB_TOKEN_EXPIRES,
            keys::ONBOARDING_COMPLETED,
            keys::ONBOARDING_SKIPPED_STEPS,
            keys::SOURCE_STEAM_ENABLED,
            keys::SOURCE_EPIC_ENABLED,
            keys::SOURCE_GOG_ENABLED,
            keys::SOURCE_UBISOFT_ENABLED,
            keys::SOURCE_BATTLENET_ENABLED,
            keys::SOURCE_XBOX_ENABLED,
            keys::SOURCE_STEAM_PATH_OVERRIDE,
            keys::SOURCE_EPIC_PATH_OVERRIDE,
            keys::SOURCE_GOG_PATH_OVERRIDE,
            keys::SOURCE_UBISOFT_PATH_OVERRIDE,
            keys::SOURCE_BATTLENET_PATH_OVERRIDE,
            keys::SOURCE_BATTLENET_DATA_PATH_OVERRIDE,
            keys::THEME_ACCENT_COLOR,
            keys::LIBRARY_VIEW_MODE,
            keys::LIBRARY_SORT_BY,
            keys::LIBRARY_SORT_DIR,
            keys::ASK_BEFORE_CLOSE,
        ];
        assert_eq!(all_keys.len(), 24);
        for key in &all_keys {
            assert!(!key.is_empty());
            assert!(key.chars().all(|c| c.is_ascii_lowercase() || c == '_'));
        }
    }

    #[test]
    fn setting_key_constants_can_be_stored_and_retrieved() {
        let state = setup_db();
        set_setting_inner(&state, keys::IGDB_CLIENT_ID.into(), "my-client-id".into()).unwrap();
        set_setting_inner(
            &state,
            keys::ONBOARDING_COMPLETED.into(),
            "true".into(),
        )
        .unwrap();
        set_setting_inner(
            &state,
            keys::LIBRARY_VIEW_MODE.into(),
            "grid".into(),
        )
        .unwrap();

        let map = get_settings_inner(&state).unwrap();
        assert_eq!(
            map.get(keys::IGDB_CLIENT_ID).unwrap(),
            &Some("my-client-id".into())
        );
        assert_eq!(
            map.get(keys::ONBOARDING_COMPLETED).unwrap(),
            &Some("true".into())
        );
        assert_eq!(
            map.get(keys::LIBRARY_VIEW_MODE).unwrap(),
            &Some("grid".into())
        );
    }
}
