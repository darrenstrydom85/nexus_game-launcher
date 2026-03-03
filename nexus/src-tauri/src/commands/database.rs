use serde::Serialize;
use tauri::State;

use super::error::CommandError;
use crate::db::DbState;

#[derive(Debug, Serialize)]
pub struct DbStatus {
    pub connected: bool,
    pub version: u32,
    pub path: String,
}

#[tauri::command]
pub fn get_db_status(db: State<'_, DbState>) -> Result<DbStatus, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let version: u32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(DbStatus {
        connected: true,
        version,
        path: db.db_path.to_string_lossy().into_owned(),
    })
}

/// Wipes all user data from every table. The schema itself (including
/// schema_version) is preserved so migrations don't re-run on next launch.
#[tauri::command]
pub fn reset_all(db: State<'_, DbState>) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    conn.execute_batch(
        "PRAGMA foreign_keys = OFF;
         DELETE FROM game_duplicate_members;
         DELETE FROM game_duplicates;
         DELETE FROM collection_games;
         DELETE FROM collections;
         DELETE FROM play_sessions;
         DELETE FROM games;
         DELETE FROM watched_folders;
         DELETE FROM settings;
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

/// Deletes all play session rows and resets the denormalized play stats on
/// every game (total_play_time, play_count, last_played) so all stats pages
/// return to zero.
#[tauri::command]
pub fn clear_play_history(db: State<'_, DbState>) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    conn.execute_batch(
        "DELETE FROM play_sessions;
         UPDATE games SET total_play_time = 0, play_count = 0, last_played = NULL;",
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

/// Same as reset_all but preserves API key settings so the user doesn't have
/// to re-enter their SteamGridDB / IGDB credentials after a reset.
#[tauri::command]
pub fn reset_keep_keys(db: State<'_, DbState>) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    conn.execute_batch(
        "PRAGMA foreign_keys = OFF;
         DELETE FROM game_duplicate_members;
         DELETE FROM game_duplicates;
         DELETE FROM collection_games;
         DELETE FROM collections;
         DELETE FROM play_sessions;
         DELETE FROM games;
         DELETE FROM watched_folders;
         DELETE FROM settings
           WHERE key NOT IN ('steamgrid_api_key', 'igdb_client_id', 'igdb_client_secret');
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}
