use std::collections::HashSet;
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;
use crate::models::game::{Game, GameSource};
use crate::sources::standalone::derive_potential_exe_names;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GetGamesParams {
    pub sort_by: Option<String>,
    pub sort_dir: Option<String>,
}

#[tauri::command]
pub fn get_games(
    db: State<'_, DbState>,
    params: GetGamesParams,
) -> Result<Vec<Game>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let sort_column = match params.sort_by.as_deref() {
        Some("name") => "name",
        Some("lastPlayed" | "last_played") => "last_played",
        Some("totalPlayTime" | "total_play_time") => "total_play_time",
        Some("addedAt" | "added_at") => "added_at",
        Some("status") => "status",
        Some("source") => "source",
        _ => "name",
    };

    let sort_direction = match params.sort_dir.as_deref() {
        Some("desc" | "DESC") => "DESC",
        _ => "ASC",
    };

    // Return all games (including hidden) so the frontend can sync hidden state; exclude removed so they don't show in the library.
    let sql = format!(
        "SELECT * FROM games WHERE (status IS NULL OR status != 'removed') ORDER BY {sort_column} {sort_direction}"
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let games = stmt
        .query_map([], Game::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(games)
}

#[tauri::command]
pub fn get_game(db: State<'_, DbState>, id: String) -> Result<Game, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let game = conn
        .query_row("SELECT * FROM games WHERE id = ?1", params![id], Game::from_row)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                CommandError::NotFound(format!("game {id}"))
            }
            other => CommandError::Database(other.to_string()),
        })?;

    Ok(game)
}

#[tauri::command]
pub fn search_games(
    db: State<'_, DbState>,
    query: String,
) -> Result<Vec<Game>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let pattern = format!("%{query}%");

    let mut stmt = conn
        .prepare("SELECT * FROM games WHERE name LIKE ?1 AND (status IS NULL OR status != 'removed') ORDER BY name ASC")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let games = stmt
        .query_map(params![pattern], Game::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(games)
}

/// Deserializes a nullable field where:
/// - key absent  → `None`          (don't touch the column)
/// - key = null  → `Some(None)`    (set column to NULL)
/// - key = value → `Some(Some(v))` (set column to value)
fn deserialize_nullable<'de, D, T>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    Ok(Some(Option::<T>::deserialize(de)?))
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateGameFields {
    pub name: Option<String>,
    pub source: Option<String>,
    pub source_id: Option<String>,
    pub source_hint: Option<String>,
    pub folder_path: Option<String>,
    pub exe_path: Option<String>,
    pub exe_name: Option<String>,
    pub launch_url: Option<String>,
    pub igdb_id: Option<i64>,
    pub steamgrid_id: Option<i64>,
    pub description: Option<String>,
    pub release_date: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub genres: Option<String>,
    pub cover_url: Option<String>,
    pub hero_url: Option<String>,
    pub logo_url: Option<String>,
    pub screenshot_urls: Option<String>,
    pub trailer_url: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub custom_cover: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub custom_hero: Option<Option<String>>,
    pub potential_exe_names: Option<String>,
    pub status: Option<String>,
    pub rating: Option<i32>,
    pub total_play_time: Option<i64>,
    pub last_played: Option<String>,
    pub play_count: Option<i64>,
    pub source_folder_id: Option<String>,
    pub is_hidden: Option<bool>,
}

#[tauri::command]
pub fn update_game(
    db: State<'_, DbState>,
    id: String,
    fields: UpdateGameFields,
) -> Result<Game, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    // Verify game exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM games WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !exists {
        return Err(CommandError::NotFound(format!("game {id}")));
    }

    if let Some(ref source) = fields.source {
        GameSource::from_str(source).map_err(CommandError::Parse)?;
    }
    if let Some(ref status) = fields.status {
        crate::models::game::GameStatus::from_str(status).map_err(CommandError::Parse)?;
    }

    let mut set_clauses: Vec<String> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    macro_rules! push_field {
        ($field:expr, $col:expr) => {
            if let Some(ref val) = $field {
                set_clauses.push(format!("{} = ?", $col));
                values.push(Box::new(val.clone()));
            }
        };
    }

    // Handles Option<Option<T>>: Some(Some(v)) → set value, Some(None) → set NULL, None → skip
    macro_rules! push_nullable_field {
        ($field:expr, $col:expr) => {
            if let Some(ref inner) = $field {
                set_clauses.push(format!("{} = ?", $col));
                values.push(Box::new(inner.clone()));
            }
        };
    }

    push_field!(fields.name, "name");
    push_field!(fields.source, "source");
    push_field!(fields.source_id, "source_id");
    push_field!(fields.source_hint, "source_hint");
    push_field!(fields.folder_path, "folder_path");
    push_field!(fields.exe_path, "exe_path");
    push_field!(fields.exe_name, "exe_name");
    push_field!(fields.launch_url, "launch_url");
    push_field!(fields.igdb_id, "igdb_id");
    push_field!(fields.steamgrid_id, "steamgrid_id");
    push_field!(fields.description, "description");
    push_field!(fields.release_date, "release_date");
    push_field!(fields.developer, "developer");
    push_field!(fields.publisher, "publisher");
    push_field!(fields.genres, "genres");
    push_field!(fields.cover_url, "cover_url");
    push_field!(fields.hero_url, "hero_url");
    push_field!(fields.logo_url, "logo_url");
    push_field!(fields.screenshot_urls, "screenshot_urls");
    push_field!(fields.trailer_url, "trailer_url");
    push_nullable_field!(fields.custom_cover, "custom_cover");
    push_nullable_field!(fields.custom_hero, "custom_hero");
    push_field!(fields.potential_exe_names, "potential_exe_names");
    push_field!(fields.status, "status");
    push_field!(fields.rating, "rating");
    push_field!(fields.total_play_time, "total_play_time");
    push_field!(fields.last_played, "last_played");
    push_field!(fields.play_count, "play_count");
    push_field!(fields.source_folder_id, "source_folder_id");
    push_field!(fields.is_hidden, "is_hidden");

    if set_clauses.is_empty() {
        return Err(CommandError::Parse("no fields provided for update".into()));
    }

    // Always set updated_at
    let now = now_iso();
    set_clauses.push("updated_at = ?".to_string());
    values.push(Box::new(now));

    values.push(Box::new(id.clone()));

    let sql = format!(
        "UPDATE games SET {} WHERE id = ?",
        set_clauses.join(", ")
    );

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let game = conn
        .query_row("SELECT * FROM games WHERE id = ?1", params![id], Game::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(game)
}

#[tauri::command]
pub fn delete_game(db: State<'_, DbState>, id: String) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let now = now_iso();
    let rows = conn
        .execute(
            "UPDATE games SET is_hidden = 1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if rows == 0 {
        return Err(CommandError::NotFound(format!("game {id}")));
    }

    Ok(())
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DetectedGame {
    pub name: String,
    pub source: String,
    pub source_id: Option<String>,
    pub source_hint: Option<String>,
    pub folder_path: Option<String>,
    pub exe_path: Option<String>,
    pub exe_name: Option<String>,
    pub launch_url: Option<String>,
    pub source_folder_id: Option<String>,
    pub potential_exe_names: Option<String>,
}

/// Core confirm_games logic. Used by the Tauri command and by tests.
pub(crate) fn confirm_games_impl(
    db: &DbState,
    detected_games: Vec<DetectedGame>,
) -> Result<Vec<Game>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    for g in &detected_games {
        GameSource::from_str(&g.source).map_err(CommandError::Parse)?;
    }

    // Build set of (source, identifier) for all detected games so we can mark
    // no-longer-detected games as removed. Identifier is source_id or folder_path.
    let detected_keys: HashSet<(String, String)> = detected_games
        .iter()
        .map(|g| {
            let id = g
                .source_id
                .clone()
                .or_else(|| g.folder_path.clone())
                .unwrap_or_default();
            (g.source.clone(), id)
        })
        .collect();
    let scanned_sources: HashSet<String> = detected_games.iter().map(|g| g.source.clone()).collect();

    let now = now_iso();
    let mut results = Vec::with_capacity(detected_games.len());

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    for g in &detected_games {
        // Derive potential exe names from folder_path if not already provided.
        // This covers store-based sources (Steam, Epic, GOG, etc.) that supply
        // a folder_path but don't scan for executables themselves.
        let potential_exe_names = g.potential_exe_names.clone().or_else(|| {
            g.folder_path
                .as_ref()
                .and_then(|p| derive_potential_exe_names(std::path::Path::new(p)))
        });

        // Check if a game with the same source+source_id already exists.
        // For standalone games (no source_id), match on folder_path instead.
        let existing_id: Option<String> = if let Some(ref sid) = g.source_id {
            tx.query_row(
                "SELECT id FROM games WHERE source = ?1 AND source_id = ?2 LIMIT 1",
                params![g.source, sid],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| CommandError::Database(e.to_string()))?
        } else if let Some(ref fp) = g.folder_path {
            tx.query_row(
                "SELECT id FROM games WHERE folder_path = ?1 LIMIT 1",
                params![fp],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| CommandError::Database(e.to_string()))?
        } else {
            None
        };

        let game_id = if let Some(ref id) = existing_id {
            // Update mutable fields on the existing game, always refreshing
            // exe_path, exe_name, and potential_exe_names from the latest scan.
            // If the game was previously 'removed' (re-installed), set status back to 'backlog'.
            // Do not update name: preserve any user-edited name; only new games get the source name.
            tx.execute(
                "UPDATE games SET
                    folder_path = ?1,
                    exe_path = ?2,
                    exe_name = ?3,
                    launch_url = ?4,
                    source_folder_id = ?5,
                    potential_exe_names = COALESCE(?6, potential_exe_names),
                    status = CASE WHEN status = 'removed' THEN 'backlog' ELSE status END,
                    updated_at = ?7
                 WHERE id = ?8",
                params![
                    g.folder_path,
                    g.exe_path,
                    g.exe_name,
                    g.launch_url,
                    g.source_folder_id,
                    potential_exe_names,
                    now,
                    id,
                ],
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;
            id.clone()
        } else {
            // Insert new game (normalize title so TM/(R)/® etc. are never stored)
            let id = Uuid::new_v4().to_string();
            let name = crate::commands::utils::normalize_game_title(&g.name);
            tx.execute(
                "INSERT INTO games (id, name, source, source_id, source_hint, folder_path, exe_path, exe_name, launch_url, source_folder_id, potential_exe_names, status, added_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'backlog', ?12, ?12)",
                params![
                    id,
                    name,
                    g.source,
                    g.source_id,
                    g.source_hint,
                    g.folder_path,
                    g.exe_path,
                    g.exe_name,
                    g.launch_url,
                    g.source_folder_id,
                    potential_exe_names,
                    now,
                ],
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;
            id
        };

        let game = tx
            .query_row("SELECT * FROM games WHERE id = ?1", params![game_id], Game::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?;

        results.push(game);
    }

    // Mark games that were not in this scan as removed (uninstalled / no longer present).
    // They stay in the DB for stats; re-installing will un-remove them on a future sync.
    for source in &scanned_sources {
        let mut sel = tx
            .prepare(
                "SELECT id, source_id, folder_path FROM games WHERE source = ?1 AND status != 'removed'",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;
        let rows = sel
            .query_map(params![source], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|e| CommandError::Database(e.to_string()))?
            .filter_map(|r| r.ok());
        for (id, source_id, folder_path) in rows {
            let key = (
                source.clone(),
                source_id.or(folder_path).unwrap_or_default(),
            );
            if !detected_keys.contains(&key) {
                tx.execute(
                    "UPDATE games SET status = 'removed', updated_at = ?1 WHERE id = ?2",
                    params![now, id],
                )
                .map_err(|e| CommandError::Database(e.to_string()))?;
            }
        }
    }

    tx.commit()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(results)
}

#[tauri::command]
pub fn confirm_games(
    db: State<'_, DbState>,
    detected_games: Vec<DetectedGame>,
) -> Result<Vec<Game>, CommandError> {
    confirm_games_impl(&db, detected_games)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_test_game(conn: &rusqlite::Connection, id: &str, name: &str, source: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) VALUES (?1, ?2, ?3, 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name, source],
        ).unwrap();
    }

    fn insert_hidden_game(conn: &rusqlite::Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, is_hidden, added_at, updated_at) VALUES (?1, ?2, 'steam', 'backlog', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name],
        ).unwrap();
    }

    // ── get_games ──

    #[test]
    fn get_games_returns_all_non_removed_including_hidden() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Visible Game", "steam");
        insert_hidden_game(&conn, "g2", "Hidden Game");
        drop(conn);

        let params = GetGamesParams {
            sort_by: None,
            sort_dir: None,
        };
        let games = get_games_inner(&state, params).unwrap();
        assert_eq!(games.len(), 2, "returns both visible and hidden so frontend can sync hidden state");
        assert!(games.iter().any(|g| g.name == "Visible Game"));
        assert!(games.iter().any(|g| g.name == "Hidden Game" && g.is_hidden));
    }

    fn insert_removed_game(conn: &rusqlite::Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) VALUES (?1, ?2, 'steam', 'removed', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name],
        )
        .unwrap();
    }

    #[test]
    fn get_games_excludes_removed() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Present", "steam");
        insert_removed_game(&conn, "g2", "Uninstalled");
        drop(conn);

        let params = GetGamesParams {
            sort_by: None,
            sort_dir: None,
        };
        let games = get_games_inner(&state, params).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].name, "Present");
    }

    #[test]
    fn get_games_sorts_by_name_asc_by_default() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Zelda", "steam");
        insert_test_game(&conn, "g2", "Apex", "epic");
        insert_test_game(&conn, "g3", "Minecraft", "standalone");
        drop(conn);

        let params = GetGamesParams {
            sort_by: None,
            sort_dir: None,
        };
        let games = get_games_inner(&state, params).unwrap();
        assert_eq!(games[0].name, "Apex");
        assert_eq!(games[1].name, "Minecraft");
        assert_eq!(games[2].name, "Zelda");
    }

    #[test]
    fn get_games_sorts_by_name_desc() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Zelda", "steam");
        insert_test_game(&conn, "g2", "Apex", "epic");
        drop(conn);

        let params = GetGamesParams {
            sort_by: Some("name".into()),
            sort_dir: Some("desc".into()),
        };
        let games = get_games_inner(&state, params).unwrap();
        assert_eq!(games[0].name, "Zelda");
        assert_eq!(games[1].name, "Apex");
    }

    #[test]
    fn get_games_sorts_by_status() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A", "steam");
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) VALUES ('g2', 'Game B', 'steam', 'playing', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        drop(conn);

        let params = GetGamesParams {
            sort_by: Some("status".into()),
            sort_dir: Some("ASC".into()),
        };
        let games = get_games_inner(&state, params).unwrap();
        assert_eq!(games.len(), 2);
    }

    // ── get_game ──

    #[test]
    fn get_game_returns_existing() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game", "gog");
        drop(conn);

        let game = get_game_inner(&state, "g1".into()).unwrap();
        assert_eq!(game.name, "Test Game");
        assert_eq!(game.source, "gog");
    }

    #[test]
    fn get_game_returns_not_found() {
        let state = setup_db();
        let result = get_game_inner(&state, "nonexistent".into());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    #[test]
    fn get_game_returns_all_fields() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO games (id, name, source, source_id, description, developer, publisher, genres, status, rating, total_play_time, play_count, is_hidden, added_at, updated_at)
             VALUES ('g1', 'Full Game', 'steam', 'app_12345', 'A great game', 'DevCo', 'PubCo', 'RPG,Action', 'playing', 4, 3600, 5, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        drop(conn);

        let game = get_game_inner(&state, "g1".into()).unwrap();
        assert_eq!(game.source_id, Some("app_12345".into()));
        assert_eq!(game.description, Some("A great game".into()));
        assert_eq!(game.developer, Some("DevCo".into()));
        assert_eq!(game.publisher, Some("PubCo".into()));
        assert_eq!(game.genres, Some("RPG,Action".into()));
        assert_eq!(game.status, "playing");
        assert_eq!(game.rating, Some(4));
        assert_eq!(game.total_play_time, 3600);
        assert_eq!(game.play_count, 5);
        assert!(!game.is_hidden);
    }

    // ── search_games ──

    #[test]
    fn search_games_matches_partial_name() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "The Witcher 3", "gog");
        insert_test_game(&conn, "g2", "Witchfire", "epic");
        insert_test_game(&conn, "g3", "Doom Eternal", "steam");
        drop(conn);

        let results = search_games_inner(&state, "witch".into()).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn search_games_returns_all_non_removed_including_hidden() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Halo Infinite", "xbox");
        insert_hidden_game(&conn, "g2", "Halo Wars");
        drop(conn);

        let results = search_games_inner(&state, "Halo".into()).unwrap();
        assert_eq!(results.len(), 2, "returns both so frontend can sync hidden state");
        assert!(results.iter().any(|g| g.name == "Halo Infinite" && !g.is_hidden));
        assert!(results.iter().any(|g| g.name == "Halo Wars" && g.is_hidden));
    }

    #[test]
    fn search_games_returns_empty_for_no_match() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Some Game", "steam");
        drop(conn);

        let results = search_games_inner(&state, "zzzzz".into()).unwrap();
        assert!(results.is_empty());
    }

    // ── update_game ──

    #[test]
    fn update_game_partial_fields() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Old Name", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            name: Some("New Name".into()),
            status: Some("playing".into()),
            ..Default::default()
        };

        let updated = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert_eq!(updated.name, "New Name");
        assert_eq!(updated.status, "playing");
        assert_ne!(updated.updated_at, "2026-01-01T00:00:00Z");
    }

    #[test]
    fn update_game_sets_updated_at() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            name: Some("Updated".into()),
            ..Default::default()
        };

        let game = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert!(game.updated_at.as_str() > "2026-01-01T00:00:00Z");
    }

    #[test]
    fn update_game_not_found() {
        let state = setup_db();
        let fields = UpdateGameFields {
            name: Some("X".into()),
            ..Default::default()
        };

        let result = update_game_inner(&state, "nope".into(), fields);
        assert!(result.is_err());
    }

    #[test]
    fn update_game_rejects_empty_fields() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields::default();

        let result = update_game_inner(&state, "g1".into(), fields);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("no fields"));
    }

    #[test]
    fn update_game_rejects_invalid_source() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            source: Some("invalid_source".into()),
            ..Default::default()
        };

        let result = update_game_inner(&state, "g1".into(), fields);
        assert!(result.is_err());
    }

    #[test]
    fn update_game_rejects_invalid_status() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            status: Some("invalid_status".into()),
            ..Default::default()
        };

        let result = update_game_inner(&state, "g1".into(), fields);
        assert!(result.is_err());
    }

    // ── delete_game ──

    #[test]
    fn delete_game_soft_deletes() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Doomed Game", "steam");
        drop(conn);

        delete_game_inner(&state, "g1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let hidden: i32 = conn
            .query_row("SELECT is_hidden FROM games WHERE id = 'g1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(hidden, 1);
    }

    #[test]
    fn delete_game_updates_timestamp() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        delete_game_inner(&state, "g1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let updated_at: String = conn
            .query_row("SELECT updated_at FROM games WHERE id = 'g1'", [], |r| r.get(0))
            .unwrap();
        assert_ne!(updated_at, "2026-01-01T00:00:00Z");
    }

    #[test]
    fn delete_game_not_found() {
        let state = setup_db();
        let result = delete_game_inner(&state, "nonexistent".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn deleted_game_still_returned_with_hidden_flag() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Visible", "steam");
        insert_test_game(&conn, "g2", "Will Hide", "steam");
        drop(conn);

        delete_game_inner(&state, "g2".into()).unwrap();

        let params = GetGamesParams { sort_by: None, sort_dir: None };
        let games = get_games_inner(&state, params).unwrap();
        assert_eq!(games.len(), 2, "get_games returns all non-removed including hidden so frontend can sync");
        assert_eq!(games.iter().find(|g| g.id == "g1").unwrap().is_hidden, false);
        assert_eq!(games.iter().find(|g| g.id == "g2").unwrap().is_hidden, true);
    }

    // ── confirm_games ──

    #[test]
    fn confirm_games_bulk_insert() {
        let state = setup_db();
        let detected = vec![
            DetectedGame {
                name: "Game A".into(),
                source: "steam".into(),
                source_id: Some("app_100".into()),
                source_hint: None,
                folder_path: Some("C:\\Games\\A".into()),
                exe_path: Some("C:\\Games\\A\\game.exe".into()),
                exe_name: Some("game.exe".into()),
                launch_url: None,
                source_folder_id: None,
                potential_exe_names: None,
            },
            DetectedGame {
                name: "Game B".into(),
                source: "epic".into(),
                source_id: None,
                source_hint: Some("Epic Store".into()),
                folder_path: None,
                exe_path: None,
                exe_name: None,
                launch_url: Some("com.epicgames.launcher://apps/gameb".into()),
                source_folder_id: None,
                potential_exe_names: None,
            },
        ];

        let games = confirm_games_impl(&state, detected).unwrap();
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].name, "Game A");
        assert_eq!(games[0].source, "steam");
        assert_eq!(games[0].status, "backlog");
        assert!(!games[0].id.is_empty());
        assert!(!games[0].added_at.is_empty());
        assert_eq!(games[1].name, "Game B");
    }

    #[test]
    fn confirm_games_generates_unique_uuids() {
        let state = setup_db();
        let detected = vec![
            DetectedGame {
                name: "G1".into(), source: "steam".into(), source_id: None,
                source_hint: None, folder_path: None, exe_path: None, exe_name: None,
                launch_url: None, source_folder_id: None, potential_exe_names: None,
            },
            DetectedGame {
                name: "G2".into(), source: "steam".into(), source_id: None,
                source_hint: None, folder_path: None, exe_path: None, exe_name: None,
                launch_url: None, source_folder_id: None, potential_exe_names: None,
            },
        ];

        let games = confirm_games_impl(&state, detected).unwrap();
        assert_ne!(games[0].id, games[1].id);
    }

    #[test]
    fn confirm_games_rejects_invalid_source() {
        let state = setup_db();
        let detected = vec![DetectedGame {
            name: "Bad".into(), source: "origin".into(), source_id: None,
            source_hint: None, folder_path: None, exe_path: None, exe_name: None,
            launch_url: None, source_folder_id: None, potential_exe_names: None,
        }];

        let result = confirm_games_impl(&state, detected);
        assert!(result.is_err());
    }

    #[test]
    fn confirm_games_empty_list() {
        let state = setup_db();
        let games = confirm_games_impl(&state, vec![]).unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn confirm_games_preserves_name_on_resync() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO games (id, name, source, source_id, status, added_at, updated_at) \
             VALUES ('existing-id', 'My Custom Name', 'steam', 'app_100', 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        drop(conn);

        let detected = vec![DetectedGame {
            name: "Store Title From Scan".into(),
            source: "steam".into(),
            source_id: Some("app_100".into()),
            source_hint: None,
            folder_path: Some("C:\\Games\\A".into()),
            exe_path: Some("C:\\Games\\A\\game.exe".into()),
            exe_name: Some("game.exe".into()),
            launch_url: None,
            source_folder_id: None,
            potential_exe_names: None,
        }];

        let games = confirm_games_impl(&state, detected).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "existing-id");
        assert_eq!(games[0].name, "My Custom Name", "resync must not overwrite user-edited name");
    }

    // ── Test helpers: non-Tauri wrappers ──

    fn get_games_inner(state: &DbState, params: GetGamesParams) -> Result<Vec<Game>, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let sort_column = match params.sort_by.as_deref() {
            Some("name") => "name",
            Some("lastPlayed" | "last_played") => "last_played",
            Some("totalPlayTime" | "total_play_time") => "total_play_time",
            Some("addedAt" | "added_at") => "added_at",
            Some("status") => "status",
            Some("source") => "source",
            _ => "name",
        };
        let sort_direction = match params.sort_dir.as_deref() {
            Some("desc" | "DESC") => "DESC",
            _ => "ASC",
        };

        let sql = format!("SELECT * FROM games WHERE (status IS NULL OR status != 'removed') ORDER BY {sort_column} {sort_direction}");
        let mut stmt = conn.prepare(&sql).map_err(|e| CommandError::Database(e.to_string()))?;
        let games = stmt.query_map([], Game::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(games)
    }

    fn get_game_inner(state: &DbState, id: String) -> Result<Game, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let game = conn
            .query_row("SELECT * FROM games WHERE id = ?1", params![id], Game::from_row)
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => CommandError::NotFound(format!("game {id}")),
                other => CommandError::Database(other.to_string()),
            })?;
        Ok(game)
    }

    fn search_games_inner(state: &DbState, query: String) -> Result<Vec<Game>, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let pattern = format!("%{query}%");
        let mut stmt = conn
            .prepare("SELECT * FROM games WHERE name LIKE ?1 AND (status IS NULL OR status != 'removed') ORDER BY name ASC")
            .map_err(|e| CommandError::Database(e.to_string()))?;
        let games = stmt.query_map(params![pattern], Game::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(games)
    }

    fn update_game_inner(state: &DbState, id: String, fields: UpdateGameFields) -> Result<Game, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let exists: bool = conn
            .query_row("SELECT COUNT(*) > 0 FROM games WHERE id = ?1", params![id], |row| row.get(0))
            .map_err(|e| CommandError::Database(e.to_string()))?;
        if !exists {
            return Err(CommandError::NotFound(format!("game {id}")));
        }

        if let Some(ref source) = fields.source {
            GameSource::from_str(source).map_err(CommandError::Parse)?;
        }
        if let Some(ref status) = fields.status {
            crate::models::game::GameStatus::from_str(status).map_err(CommandError::Parse)?;
        }

        let mut set_clauses: Vec<String> = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        macro_rules! push_field {
            ($field:expr, $col:expr) => {
                if let Some(ref val) = $field {
                    set_clauses.push(format!("{} = ?", $col));
                    values.push(Box::new(val.clone()));
                }
            };
        }

        macro_rules! push_nullable_field {
            ($field:expr, $col:expr) => {
                if let Some(ref inner) = $field {
                    set_clauses.push(format!("{} = ?", $col));
                    values.push(Box::new(inner.clone()));
                }
            };
        }

        push_field!(fields.name, "name");
        push_field!(fields.source, "source");
        push_field!(fields.source_id, "source_id");
        push_field!(fields.source_hint, "source_hint");
        push_field!(fields.folder_path, "folder_path");
        push_field!(fields.exe_path, "exe_path");
        push_field!(fields.exe_name, "exe_name");
        push_field!(fields.launch_url, "launch_url");
        push_field!(fields.igdb_id, "igdb_id");
        push_field!(fields.steamgrid_id, "steamgrid_id");
        push_field!(fields.description, "description");
        push_field!(fields.release_date, "release_date");
        push_field!(fields.developer, "developer");
        push_field!(fields.publisher, "publisher");
        push_field!(fields.genres, "genres");
        push_field!(fields.cover_url, "cover_url");
        push_field!(fields.hero_url, "hero_url");
        push_field!(fields.logo_url, "logo_url");
        push_field!(fields.screenshot_urls, "screenshot_urls");
        push_field!(fields.trailer_url, "trailer_url");
        push_nullable_field!(fields.custom_cover, "custom_cover");
        push_nullable_field!(fields.custom_hero, "custom_hero");
        push_field!(fields.potential_exe_names, "potential_exe_names");
        push_field!(fields.status, "status");
        push_field!(fields.rating, "rating");
        push_field!(fields.total_play_time, "total_play_time");
        push_field!(fields.last_played, "last_played");
        push_field!(fields.play_count, "play_count");
        push_field!(fields.source_folder_id, "source_folder_id");

        if set_clauses.is_empty() {
            return Err(CommandError::Parse("no fields provided for update".into()));
        }

        let now = now_iso();
        set_clauses.push("updated_at = ?".to_string());
        values.push(Box::new(now));
        values.push(Box::new(id.clone()));

        let sql = format!("UPDATE games SET {} WHERE id = ?", set_clauses.join(", "));
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params_refs.as_slice()).map_err(|e| CommandError::Database(e.to_string()))?;

        let game = conn
            .query_row("SELECT * FROM games WHERE id = ?1", params![id], Game::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(game)
    }

    fn delete_game_inner(state: &DbState, id: String) -> Result<(), CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let now = now_iso();
        let rows = conn
            .execute("UPDATE games SET is_hidden = 1, updated_at = ?1 WHERE id = ?2", params![now, id])
            .map_err(|e| CommandError::Database(e.to_string()))?;
        if rows == 0 {
            return Err(CommandError::NotFound(format!("game {id}")));
        }
        Ok(())
    }

}
