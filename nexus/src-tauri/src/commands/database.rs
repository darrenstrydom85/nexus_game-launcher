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

/// Clears the game library but preserves play sessions and API keys.
/// Play sessions keep their `game_source` / `game_source_id` columns so they
/// can be re-linked to newly imported games via `relink_play_sessions`.
#[tauri::command]
pub fn reset_library_keep_stats(db: State<'_, DbState>) -> Result<(), CommandError> {
    reset_library_keep_stats_impl(&db)
}

pub(crate) fn reset_library_keep_stats_impl(db: &DbState) -> Result<(), CommandError> {
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
         DELETE FROM games;
         DELETE FROM watched_folders;
         DELETE FROM settings
           WHERE key NOT IN ('steamgrid_api_key', 'igdb_client_id', 'igdb_client_secret');
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelinkResult {
    pub relinked: i64,
    pub orphaned: i64,
}

/// After a library re-import, matches orphaned play sessions back to the new
/// game rows using the stable (game_source, game_source_id) natural key, then
/// recomputes the denormalized stats on every game.
#[tauri::command]
pub fn relink_play_sessions(db: State<'_, DbState>) -> Result<RelinkResult, CommandError> {
    relink_play_sessions_impl(&db)
}

pub(crate) fn relink_play_sessions_impl(db: &DbState) -> Result<RelinkResult, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // Re-point sessions whose game_id no longer exists in the games table
    // but whose (game_source, game_source_id) matches a newly imported game.
    let relinked_by_source_id = tx
        .execute(
            "UPDATE play_sessions
             SET game_id = (
                 SELECT g.id FROM games g
                 WHERE g.source = play_sessions.game_source
                   AND g.source_id = play_sessions.game_source_id
                 LIMIT 1
             )
             WHERE game_source IS NOT NULL
               AND game_source_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM games WHERE id = play_sessions.game_id)
               AND EXISTS (
                   SELECT 1 FROM games g
                   WHERE g.source = play_sessions.game_source
                     AND g.source_id = play_sessions.game_source_id
               )",
            [],
        )
        .map_err(|e| CommandError::Database(e.to_string()))? as i64;

    // Fallback: match by (source, name) for standalone/manual games that lack a source_id.
    let relinked_by_name = tx
        .execute(
            "UPDATE play_sessions
             SET game_id = (
                 SELECT g.id FROM games g
                 WHERE g.source = play_sessions.game_source
                   AND g.name = play_sessions.game_name
                 LIMIT 1
             )
             WHERE game_source IS NOT NULL
               AND game_source_id IS NULL
               AND game_name IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM games WHERE id = play_sessions.game_id)
               AND EXISTS (
                   SELECT 1 FROM games g
                   WHERE g.source = play_sessions.game_source
                     AND g.name = play_sessions.game_name
               )",
            [],
        )
        .map_err(|e| CommandError::Database(e.to_string()))? as i64;

    let relinked = relinked_by_source_id + relinked_by_name;

    // Count sessions that are still orphaned (no matching game found).
    let orphaned: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM play_sessions
             WHERE NOT EXISTS (SELECT 1 FROM games WHERE id = play_sessions.game_id)",
            [],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // Recompute denormalized stats on all games from their linked sessions.
    tx.execute_batch(
        "UPDATE games SET
            total_play_time = COALESCE((
                SELECT SUM(ps.duration_s) FROM play_sessions ps
                WHERE ps.game_id = games.id AND ps.ended_at IS NOT NULL
            ), 0),
            play_count = COALESCE((
                SELECT COUNT(*) FROM play_sessions ps
                WHERE ps.game_id = games.id AND ps.ended_at IS NOT NULL
            ), 0),
            last_played = (
                SELECT MAX(ps.ended_at) FROM play_sessions ps
                WHERE ps.game_id = games.id AND ps.ended_at IS NOT NULL
            );",
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    tx.commit()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(RelinkResult { relinked, orphaned })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedDiagnostics {
    pub total_sessions: i64,
    pub sessions_with_valid_game_id: i64,
    pub sessions_with_orphaned_game_id: i64,
    pub sessions_with_source_metadata: i64,
    pub sessions_resolvable_via_source: i64,
    pub sample_orphaned: Vec<OrphanedSessionInfo>,
    pub sample_valid: Vec<ValidSessionInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanedSessionInfo {
    pub session_id: String,
    pub game_id: String,
    pub game_source: Option<String>,
    pub game_source_id: Option<String>,
    pub game_name: Option<String>,
    pub duration_s: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidSessionInfo {
    pub session_id: String,
    pub game_id: String,
    pub game_name: String,
    pub game_genres: Option<String>,
    pub duration_s: Option<i64>,
}

#[tauri::command]
pub fn debug_wrapped_sessions(db: State<'_, DbState>) -> Result<WrappedDiagnostics, CommandError> {
    let conn = db.conn.lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let total_sessions: i64 = conn.query_row(
        "SELECT COUNT(*) FROM play_sessions WHERE ended_at IS NOT NULL AND duration_s >= 30",
        [], |row| row.get(0),
    ).map_err(|e| CommandError::Database(e.to_string()))?;

    let sessions_with_valid_game_id: i64 = conn.query_row(
        "SELECT COUNT(*) FROM play_sessions ps WHERE ps.ended_at IS NOT NULL AND ps.duration_s >= 30 AND EXISTS (SELECT 1 FROM games g WHERE g.id = ps.game_id)",
        [], |row| row.get(0),
    ).map_err(|e| CommandError::Database(e.to_string()))?;

    let sessions_with_orphaned_game_id: i64 = total_sessions - sessions_with_valid_game_id;

    let sessions_with_source_metadata: i64 = conn.query_row(
        "SELECT COUNT(*) FROM play_sessions WHERE ended_at IS NOT NULL AND duration_s >= 30 AND game_source IS NOT NULL AND game_source_id IS NOT NULL",
        [], |row| row.get(0),
    ).map_err(|e| CommandError::Database(e.to_string()))?;

    let sessions_resolvable_via_source: i64 = conn.query_row(
        "SELECT COUNT(*) FROM play_sessions ps WHERE ps.ended_at IS NOT NULL AND ps.duration_s >= 30 AND NOT EXISTS (SELECT 1 FROM games g WHERE g.id = ps.game_id) AND EXISTS (SELECT 1 FROM games g WHERE g.source = ps.game_source AND g.source_id = ps.game_source_id)",
        [], |row| row.get(0),
    ).map_err(|e| CommandError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT ps.id, ps.game_id, ps.game_source, ps.game_source_id, ps.game_name, ps.duration_s FROM play_sessions ps WHERE ps.ended_at IS NOT NULL AND ps.duration_s >= 30 AND NOT EXISTS (SELECT 1 FROM games g WHERE g.id = ps.game_id) LIMIT 5",
    ).map_err(|e| CommandError::Database(e.to_string()))?;
    let sample_orphaned: Vec<OrphanedSessionInfo> = stmt.query_map([], |row| {
        Ok(OrphanedSessionInfo {
            session_id: row.get(0)?,
            game_id: row.get(1)?,
            game_source: row.get(2)?,
            game_source_id: row.get(3)?,
            game_name: row.get(4)?,
            duration_s: row.get(5)?,
        })
    }).map_err(|e| CommandError::Database(e.to_string()))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let mut stmt2 = conn.prepare(
        "SELECT ps.id, ps.game_id, g.name, g.genres, ps.duration_s FROM play_sessions ps JOIN games g ON g.id = ps.game_id WHERE ps.ended_at IS NOT NULL AND ps.duration_s >= 30 ORDER BY ps.duration_s DESC LIMIT 5",
    ).map_err(|e| CommandError::Database(e.to_string()))?;
    let sample_valid: Vec<ValidSessionInfo> = stmt2.query_map([], |row| {
        Ok(ValidSessionInfo {
            session_id: row.get(0)?,
            game_id: row.get(1)?,
            game_name: row.get(2)?,
            game_genres: row.get(3)?,
            duration_s: row.get(4)?,
        })
    }).map_err(|e| CommandError::Database(e.to_string()))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(WrappedDiagnostics {
        total_sessions,
        sessions_with_valid_game_id,
        sessions_with_orphaned_game_id,
        sessions_with_source_metadata,
        sessions_resolvable_via_source,
        sample_orphaned,
        sample_valid,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use rusqlite::params;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_game(conn: &rusqlite::Connection, id: &str, name: &str, source: &str, source_id: Option<&str>) {
        conn.execute(
            "INSERT INTO games (id, name, source, source_id, status, added_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name, source, source_id],
        )
        .unwrap();
    }

    fn insert_session(
        conn: &rusqlite::Connection,
        id: &str,
        game_id: &str,
        game_source: Option<&str>,
        game_source_id: Option<&str>,
        game_name: Option<&str>,
        duration_s: Option<i64>,
    ) {
        let ended_at = duration_s.map(|_| "2026-01-15T11:00:00Z");
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s, tracking, game_source, game_source_id, game_name)
             VALUES (?1, ?2, '2026-01-15T10:00:00Z', ?3, ?4, 'auto', ?5, ?6, ?7)",
            params![id, game_id, ended_at, duration_s, game_source, game_source_id, game_name],
        )
        .unwrap();
    }

    // ── reset_library_keep_stats ──

    #[test]
    fn reset_library_keep_stats_preserves_sessions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Test Game", "steam", Some("app_100"));
        insert_session(&conn, "s1", "g1", Some("steam"), Some("app_100"), Some("Test Game"), Some(3600));
        insert_session(&conn, "s2", "g1", Some("steam"), Some("app_100"), Some("Test Game"), Some(1800));
        drop(conn);

        reset_library_keep_stats_impl(&state).unwrap();

        let conn = state.conn.lock().unwrap();
        let game_count: i64 = conn.query_row("SELECT COUNT(*) FROM games", [], |r| r.get(0)).unwrap();
        assert_eq!(game_count, 0, "games should be deleted");

        let session_count: i64 = conn.query_row("SELECT COUNT(*) FROM play_sessions", [], |r| r.get(0)).unwrap();
        assert_eq!(session_count, 2, "play sessions should be preserved");
    }

    #[test]
    fn reset_library_keep_stats_preserves_api_keys() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute("INSERT INTO settings (key, value) VALUES ('steamgrid_api_key', 'abc123')", []).unwrap();
        conn.execute("INSERT INTO settings (key, value) VALUES ('igdb_client_id', 'def456')", []).unwrap();
        conn.execute("INSERT INTO settings (key, value) VALUES ('some_other_setting', 'xyz')", []).unwrap();
        drop(conn);

        reset_library_keep_stats_impl(&state).unwrap();

        let conn = state.conn.lock().unwrap();
        let key_count: i64 = conn.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get(0)).unwrap();
        assert_eq!(key_count, 2, "only API keys should remain");
    }

    #[test]
    fn reset_library_keep_stats_clears_collections_and_folders() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO collections (id, name, created_at, updated_at) VALUES ('c1', 'Favs', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO watched_folders (id, path, added_at) VALUES ('w1', 'D:\\Games', '2026-01-01')",
            [],
        ).unwrap();
        drop(conn);

        reset_library_keep_stats_impl(&state).unwrap();

        let conn = state.conn.lock().unwrap();
        let coll_count: i64 = conn.query_row("SELECT COUNT(*) FROM collections", [], |r| r.get(0)).unwrap();
        let folder_count: i64 = conn.query_row("SELECT COUNT(*) FROM watched_folders", [], |r| r.get(0)).unwrap();
        assert_eq!(coll_count, 0);
        assert_eq!(folder_count, 0);
    }

    // ── relink_play_sessions ──

    #[test]
    fn relink_reconnects_orphaned_sessions_to_new_games() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "old-g1", "Test Game", "steam", Some("app_100"));
        insert_session(&conn, "s1", "old-g1", Some("steam"), Some("app_100"), Some("Test Game"), Some(3600));
        insert_session(&conn, "s2", "old-g1", Some("steam"), Some("app_100"), Some("Test Game"), Some(1800));
        drop(conn);

        // Simulate library reset (delete games, keep sessions)
        reset_library_keep_stats_impl(&state).unwrap();

        // Re-import the same game with a new UUID
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "new-g1", "Test Game", "steam", Some("app_100"));
        drop(conn);

        let result = relink_play_sessions_impl(&state).unwrap();
        assert_eq!(result.relinked, 2);
        assert_eq!(result.orphaned, 0);

        // Verify sessions now point to the new game
        let conn = state.conn.lock().unwrap();
        let game_id: String = conn
            .query_row("SELECT game_id FROM play_sessions WHERE id = 's1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(game_id, "new-g1");
    }

    #[test]
    fn relink_recomputes_denormalized_stats() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "old-g1", "Test Game", "steam", Some("app_100"));
        insert_session(&conn, "s1", "old-g1", Some("steam"), Some("app_100"), Some("Test Game"), Some(3600));
        insert_session(&conn, "s2", "old-g1", Some("steam"), Some("app_100"), Some("Test Game"), Some(1800));
        drop(conn);

        reset_library_keep_stats_impl(&state).unwrap();

        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "new-g1", "Test Game", "steam", Some("app_100"));
        drop(conn);

        relink_play_sessions_impl(&state).unwrap();

        let conn = state.conn.lock().unwrap();
        let (total_play_time, play_count): (i64, i64) = conn
            .query_row(
                "SELECT total_play_time, play_count FROM games WHERE id = 'new-g1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(total_play_time, 5400, "3600 + 1800");
        assert_eq!(play_count, 2);

        let last_played: Option<String> = conn
            .query_row("SELECT last_played FROM games WHERE id = 'new-g1'", [], |r| r.get(0))
            .unwrap();
        assert!(last_played.is_some());
    }

    #[test]
    fn relink_reports_orphaned_sessions_without_matching_game() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A", "steam", Some("app_100"));
        insert_game(&conn, "g2", "Game B", "epic", Some("epic_200"));
        insert_session(&conn, "s1", "g1", Some("steam"), Some("app_100"), Some("Game A"), Some(3600));
        insert_session(&conn, "s2", "g2", Some("epic"), Some("epic_200"), Some("Game B"), Some(1800));
        drop(conn);

        reset_library_keep_stats_impl(&state).unwrap();

        // Only re-import Game A, not Game B
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "new-g1", "Game A", "steam", Some("app_100"));
        drop(conn);

        let result = relink_play_sessions_impl(&state).unwrap();
        assert_eq!(result.relinked, 1, "only Game A session should relink");
        assert_eq!(result.orphaned, 1, "Game B session remains orphaned");
    }

    #[test]
    fn relink_skips_sessions_without_source_info() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A", "steam", Some("app_100"));
        // Session with no source info (e.g. pre-migration data that wasn't backfilled)
        insert_session(&conn, "s1", "g1", None, None, Some("Game A"), Some(3600));
        drop(conn);

        reset_library_keep_stats_impl(&state).unwrap();

        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "new-g1", "Game A", "steam", Some("app_100"));
        drop(conn);

        let result = relink_play_sessions_impl(&state).unwrap();
        assert_eq!(result.relinked, 0, "no source info means no relink");
        assert_eq!(result.orphaned, 1);
    }

    #[test]
    fn relink_is_idempotent_on_already_linked_sessions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Test Game", "steam", Some("app_100"));
        insert_session(&conn, "s1", "g1", Some("steam"), Some("app_100"), Some("Test Game"), Some(3600));
        drop(conn);

        // Sessions are already linked — relink should be a no-op
        let result = relink_play_sessions_impl(&state).unwrap();
        assert_eq!(result.relinked, 0);
        assert_eq!(result.orphaned, 0);

        // Stats should still be correct
        let conn = state.conn.lock().unwrap();
        let total: i64 = conn
            .query_row("SELECT total_play_time FROM games WHERE id = 'g1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total, 3600);
    }

    #[test]
    fn relink_standalone_by_name_when_source_id_is_null() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Eriksholm", "standalone", None);
        insert_session(&conn, "s1", "g1", Some("standalone"), None, Some("Eriksholm"), Some(5000));
        drop(conn);

        reset_library_keep_stats_impl(&state).unwrap();

        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "new-g1", "Eriksholm", "standalone", None);
        drop(conn);

        let result = relink_play_sessions_impl(&state).unwrap();
        assert_eq!(result.relinked, 1, "standalone session should relink by name");
        assert_eq!(result.orphaned, 0);

        let conn = state.conn.lock().unwrap();
        let game_id: String = conn
            .query_row("SELECT game_id FROM play_sessions WHERE id = 's1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(game_id, "new-g1", "session should point to the new game");

        let total: i64 = conn
            .query_row("SELECT total_play_time FROM games WHERE id = 'new-g1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total, 5000, "denormalized stats should be recomputed");
    }
}
