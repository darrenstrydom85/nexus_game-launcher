use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use std::collections::HashSet;
use tauri::State;
use uuid::Uuid;

use super::error::CommandError;
use super::utils::{now_iso, open_dir};
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
    let conn = db.conn()?;

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

    // Return all games (including hidden and removed) so the frontend can manage visibility.
    // The frontend filters removed/hidden games from the library; the Archive view shows removed games.
    let sql = format!("SELECT * FROM games ORDER BY {sort_column} {sort_direction}");

    let mut stmt = conn
        .prepare(&sql)?;

    let games = stmt
        .query_map([], Game::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

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
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub notes: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub progress: Option<Option<i32>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub milestones_json: Option<Option<String>>,
    pub completed: Option<bool>,
}

#[tauri::command]
pub fn update_game(
    db: State<'_, DbState>,
    id: String,
    fields: UpdateGameFields,
) -> Result<Game, CommandError> {
    let conn = db.conn()?;

    // Verify game exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM games WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

    if !exists {
        return Err(CommandError::NotFound(format!("game {id}")));
    }

    if let Some(ref source) = fields.source {
        GameSource::from_str(source).map_err(CommandError::Parse)?;
    }
    if let Some(ref status) = fields.status {
        crate::models::game::GameStatus::from_str(status).map_err(CommandError::Parse)?;
    }
    if let Some(Some(val)) = fields.progress {
        if val < 0 || val > 100 {
            return Err(CommandError::Parse(
                "progress must be between 0 and 100".into(),
            ));
        }
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
    if fields.completed.is_some() {
        set_clauses.push("completed = ?".to_string());
        values.push(Box::new(fields.completed.unwrap() as i32));
    } else if let Some(ref status) = fields.status {
        let is_completed = status == "completed";
        set_clauses.push("completed = ?".to_string());
        values.push(Box::new(is_completed as i32));
    }
    push_field!(fields.rating, "rating");
    push_field!(fields.total_play_time, "total_play_time");
    push_field!(fields.last_played, "last_played");
    push_field!(fields.play_count, "play_count");
    push_field!(fields.source_folder_id, "source_folder_id");
    push_field!(fields.is_hidden, "is_hidden");
    push_nullable_field!(fields.notes, "notes");
    push_nullable_field!(fields.progress, "progress");
    push_nullable_field!(fields.milestones_json, "milestones_json");

    if set_clauses.is_empty() {
        return Err(CommandError::Parse("no fields provided for update".into()));
    }

    // Always set updated_at
    let now = now_iso();
    set_clauses.push("updated_at = ?".to_string());
    values.push(Box::new(now));

    values.push(Box::new(id.clone()));

    let sql = format!("UPDATE games SET {} WHERE id = ?", set_clauses.join(", "));

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())?;

    let game = conn
        .query_row(
            "SELECT * FROM games WHERE id = ?1",
            params![id],
            Game::from_row,
        )?;

    // XP award for game completion — fire-and-forget
    if let Some(ref status) = fields.status {
        if status == "completed" {
            let _ = super::xp::award_xp_inner(
                &conn,
                crate::models::xp::sources::GAME_COMPLETE,
                Some(&id),
                100,
                &format!("Completed {} (+100 XP)", game.name),
            );
        }
    }

    Ok(game)
}

/// Open a game's install folder in Explorer. Path comes from the DB, not the
/// webview, and must be a directory (see `open_dir`).
#[tauri::command]
pub fn open_game_folder(db: State<'_, DbState>, id: String) -> Result<(), CommandError> {
    let folder: Option<String> = {
        let conn = db.conn()?;
        conn.query_row(
            "SELECT folder_path FROM games WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()?
        .flatten()
    };
    let folder = folder.ok_or_else(|| CommandError::NotFound(format!("folder for game {id}")))?;
    open_dir(std::path::Path::new(&folder))
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
    /// When true the game is inserted as hidden (user opted out during onboarding).
    /// On subsequent resyncs the UPDATE path never touches is_hidden, so the
    /// user's choice is preserved.
    pub is_hidden: bool,
}

/// Merge two comma-separated exe-name lists, preserving all unique entries
/// (case-insensitive dedup). The `existing` value comes from the DB and may
/// contain manually-selected process names that must survive a resync.
fn merge_potential_exe_names(existing: Option<&str>, scanned: Option<&str>) -> Option<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut merged: Vec<String> = Vec::new();

    for source in [existing, scanned] {
        if let Some(csv) = source {
            for entry in csv.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
                let key = entry.to_lowercase();
                if seen.insert(key) {
                    merged.push(entry.to_string());
                }
            }
        }
    }

    if merged.is_empty() {
        None
    } else {
        Some(merged.join(", "))
    }
}

/// Core confirm_games logic. Used by the Tauri command and by tests.
pub(crate) fn confirm_games_impl(
    db: &DbState,
    detected_games: Vec<DetectedGame>,
) -> Result<Vec<Game>, CommandError> {
    let conn = db.conn()?;

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
    let scanned_sources: HashSet<String> =
        detected_games.iter().map(|g| g.source.clone()).collect();

    let now = now_iso();
    let mut results = Vec::with_capacity(detected_games.len());

    let tx = conn
        .unchecked_transaction()?;

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
        let existing: Option<(String, Option<String>)> = if let Some(ref sid) = g.source_id {
            tx.query_row(
                "SELECT id, potential_exe_names FROM games WHERE source = ?1 AND source_id = ?2 LIMIT 1",
                params![g.source, sid],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
        } else if let Some(ref fp) = g.folder_path {
            tx.query_row(
                "SELECT id, potential_exe_names FROM games WHERE folder_path = ?1 LIMIT 1",
                params![fp],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
        } else {
            None
        };

        let game_id = if let Some((ref id, ref existing_exe_names)) = existing {
            // Merge scanned potential_exe_names with existing DB value so that
            // manually-selected process names (from the process picker) are never
            // lost during a resync.
            let merged_exe_names = merge_potential_exe_names(
                existing_exe_names.as_deref(),
                potential_exe_names.as_deref(),
            );

            // Update mutable fields on the existing game.
            // exe_path and exe_name use COALESCE so a NULL from the scanner does
            // not overwrite a value the user set via manual process identification.
            // If the game was previously 'removed' (re-installed), set status back to 'backlog'.
            // Do not update name: preserve any user-edited name; only new games get the source name.
            tx.execute(
                "UPDATE games SET
                    folder_path = ?1,
                    exe_path = COALESCE(?2, exe_path),
                    exe_name = COALESCE(?3, exe_name),
                    launch_url = ?4,
                    source_folder_id = ?5,
                    potential_exe_names = ?6,
                    status = CASE WHEN status = 'removed' THEN 'backlog' ELSE status END,
                    updated_at = ?7
                 WHERE id = ?8",
                params![
                    g.folder_path,
                    g.exe_path,
                    g.exe_name,
                    g.launch_url,
                    g.source_folder_id,
                    merged_exe_names,
                    now,
                    id,
                ],
            )?;
            id.clone()
        } else {
            // Insert new game (normalize title so TM/(R)/® etc. are never stored).
            // is_hidden is set from the detected game — during onboarding the
            // frontend marks user-deselected games as hidden so a future resync
            // won't surface them as new additions.
            let id = Uuid::new_v4().to_string();
            let name = crate::commands::utils::normalize_game_title(&g.name);
            let is_hidden: i32 = if g.is_hidden { 1 } else { 0 };
            tx.execute(
                "INSERT INTO games (id, name, source, source_id, source_hint, folder_path, exe_path, exe_name, launch_url, source_folder_id, potential_exe_names, is_hidden, status, added_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'backlog', ?13, ?13)",
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
                    is_hidden,
                    now,
                ],
            )?;
            id
        };

        let game = tx
            .query_row(
                "SELECT * FROM games WHERE id = ?1",
                params![game_id],
                Game::from_row,
            )?;

        results.push(game);
    }

    // Mark games that were not in this scan as removed (uninstalled / no longer present).
    // They stay in the DB for stats; re-installing will un-remove them on a future sync.
    for source in &scanned_sources {
        let mut sel = tx
            .prepare(
                "SELECT id, source_id, folder_path FROM games WHERE source = ?1 AND status != 'removed'",
            )?;
        let rows = sel
            .query_map(params![source], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?
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
                )?;
            }
        }
    }

    tx.commit()?;

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
        assert_eq!(
            games.len(),
            2,
            "returns both visible and hidden so frontend can sync hidden state"
        );
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

    // ── search_games ──

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
    fn deleted_game_still_returned_with_hidden_flag() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Visible", "steam");
        insert_test_game(&conn, "g2", "Will Hide", "steam");
        drop(conn);

        delete_game_inner(&state, "g2".into()).unwrap();

        let params = GetGamesParams {
            sort_by: None,
            sort_dir: None,
        };
        let games = get_games_inner(&state, params).unwrap();
        assert_eq!(
            games.len(),
            2,
            "get_games returns all non-removed including hidden so frontend can sync"
        );
        assert_eq!(
            games.iter().find(|g| g.id == "g1").unwrap().is_hidden,
            false
        );
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
                is_hidden: false,
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
                is_hidden: false,
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
                name: "G1".into(),
                source: "steam".into(),
                source_id: None,
                source_hint: None,
                folder_path: None,
                exe_path: None,
                exe_name: None,
                launch_url: None,
                source_folder_id: None,
                potential_exe_names: None,
                is_hidden: false,
            },
            DetectedGame {
                name: "G2".into(),
                source: "steam".into(),
                source_id: None,
                source_hint: None,
                folder_path: None,
                exe_path: None,
                exe_name: None,
                launch_url: None,
                source_folder_id: None,
                potential_exe_names: None,
                is_hidden: false,
            },
        ];

        let games = confirm_games_impl(&state, detected).unwrap();
        assert_ne!(games[0].id, games[1].id);
    }

    #[test]
    fn confirm_games_rejects_invalid_source() {
        let state = setup_db();
        let detected = vec![DetectedGame {
            name: "Bad".into(),
            source: "origin".into(),
            source_id: None,
            source_hint: None,
            folder_path: None,
            exe_path: None,
            exe_name: None,
            launch_url: None,
            source_folder_id: None,
            potential_exe_names: None,
            is_hidden: false,
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
            is_hidden: false,
        }];

        let games = confirm_games_impl(&state, detected).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "existing-id");
        assert_eq!(
            games[0].name, "My Custom Name",
            "resync must not overwrite user-edited name"
        );
    }

    #[test]
    fn confirm_games_preserves_manual_exe_on_resync() {
        let state = setup_db();
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO games (id, name, source, source_id, exe_path, exe_name, potential_exe_names, status, added_at, updated_at) \
                 VALUES ('g-manual', 'Test Game', 'steam', 'app_200', 'C:\\Games\\Test\\game.exe', 'game.exe', 'game.exe, launcher.exe', 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        let detected = vec![DetectedGame {
            name: "Test Game".into(),
            source: "steam".into(),
            source_id: Some("app_200".into()),
            folder_path: Some("C:\\Games\\Test".into()),
            exe_path: None,
            exe_name: None,
            potential_exe_names: None,
            ..Default::default()
        }];

        let games = confirm_games_impl(&state, detected).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(
            games[0].exe_path.as_deref(),
            Some("C:\\Games\\Test\\game.exe"),
            "resync with NULL exe_path must not wipe manual value"
        );
        assert_eq!(
            games[0].exe_name.as_deref(),
            Some("game.exe"),
            "resync with NULL exe_name must not wipe manual value"
        );
        assert!(
            games[0]
                .potential_exe_names
                .as_ref()
                .unwrap()
                .contains("game.exe"),
            "manual exe must survive in potential_exe_names"
        );
        assert!(
            games[0]
                .potential_exe_names
                .as_ref()
                .unwrap()
                .contains("launcher.exe"),
            "previously stored exe must survive in potential_exe_names"
        );
    }

    #[test]
    fn confirm_games_merges_potential_exe_names_on_resync() {
        let state = setup_db();
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO games (id, name, source, source_id, folder_path, potential_exe_names, status, added_at, updated_at) \
                 VALUES ('g-merge', 'Merge Game', 'steam', 'app_300', 'C:\\Games\\Merge', 'manual-pick.exe', 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        let detected = vec![DetectedGame {
            name: "Merge Game".into(),
            source: "steam".into(),
            source_id: Some("app_300".into()),
            folder_path: Some("C:\\Games\\Merge".into()),
            potential_exe_names: Some("scanner-found.exe, manual-pick.exe".into()),
            ..Default::default()
        }];

        let games = confirm_games_impl(&state, detected).unwrap();
        let exe_names = games[0].potential_exe_names.as_ref().unwrap();
        assert!(
            exe_names.contains("manual-pick.exe"),
            "manually selected process must persist after resync"
        );
        assert!(
            exe_names.contains("scanner-found.exe"),
            "newly scanned exe must be added"
        );
        let count = exe_names
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .count();
        assert_eq!(count, 2, "duplicates must be deduped");
    }

    #[test]
    fn merge_potential_exe_names_unit() {
        assert_eq!(merge_potential_exe_names(None, None), None);
        assert_eq!(
            merge_potential_exe_names(Some("a.exe"), None),
            Some("a.exe".into())
        );
        assert_eq!(
            merge_potential_exe_names(None, Some("b.exe")),
            Some("b.exe".into())
        );
        assert_eq!(
            merge_potential_exe_names(Some("a.exe, b.exe"), Some("b.exe, c.exe")),
            Some("a.exe, b.exe, c.exe".into()),
        );
        assert_eq!(
            merge_potential_exe_names(Some("Game.exe"), Some("game.exe")),
            Some("Game.exe".into()),
            "dedup is case-insensitive, first occurrence wins"
        );
    }

    // ── Test helpers: non-Tauri wrappers ──

    fn get_games_inner(state: &DbState, params: GetGamesParams) -> Result<Vec<Game>, CommandError> {
        let conn = state.conn()?;

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
        let mut stmt = conn
            .prepare(&sql)?;
        let games = stmt
            .query_map([], Game::from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(games)
    }

    fn update_game_inner(
        state: &DbState,
        id: String,
        fields: UpdateGameFields,
    ) -> Result<Game, CommandError> {
        let conn = state.conn()?;

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM games WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )?;
        if !exists {
            return Err(CommandError::NotFound(format!("game {id}")));
        }

        if let Some(ref source) = fields.source {
            GameSource::from_str(source).map_err(CommandError::Parse)?;
        }
        if let Some(ref status) = fields.status {
            crate::models::game::GameStatus::from_str(status).map_err(CommandError::Parse)?;
        }
        if let Some(Some(val)) = fields.progress {
            if val < 0 || val > 100 {
                return Err(CommandError::Parse(
                    "progress must be between 0 and 100".into(),
                ));
            }
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
        push_nullable_field!(fields.notes, "notes");
        push_nullable_field!(fields.progress, "progress");
        push_nullable_field!(fields.milestones_json, "milestones_json");

        if set_clauses.is_empty() {
            return Err(CommandError::Parse("no fields provided for update".into()));
        }

        let now = now_iso();
        set_clauses.push("updated_at = ?".to_string());
        values.push(Box::new(now));
        values.push(Box::new(id.clone()));

        let sql = format!("UPDATE games SET {} WHERE id = ?", set_clauses.join(", "));
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params_refs.as_slice())?;

        let game = conn
            .query_row(
                "SELECT * FROM games WHERE id = ?1",
                params![id],
                Game::from_row,
            )?;
        Ok(game)
    }

    fn delete_game_inner(state: &DbState, id: String) -> Result<(), CommandError> {
        let conn = state.conn()?;
        let now = now_iso();
        let rows = conn
            .execute(
                "UPDATE games SET is_hidden = 1, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
        if rows == 0 {
            return Err(CommandError::NotFound(format!("game {id}")));
        }
        Ok(())
    }

    // ── notes field ──

    #[test]
    fn update_game_sets_notes() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            notes: Some(Some("my note".into())),
            ..Default::default()
        };
        let game = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert_eq!(game.notes, Some("my note".into()));
    }

    #[test]
    fn update_game_clears_notes_with_null() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO games (id, name, source, status, notes, added_at, updated_at) VALUES ('g1', 'Game', 'steam', 'backlog', 'old note', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        drop(conn);

        let fields = UpdateGameFields {
            notes: Some(None),
            ..Default::default()
        };
        let game = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert_eq!(game.notes, None);
    }

    #[test]
    fn update_game_leaves_notes_unchanged_when_absent() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO games (id, name, source, status, notes, added_at, updated_at) VALUES ('g1', 'Game', 'steam', 'backlog', 'keep me', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        drop(conn);

        let fields = UpdateGameFields {
            name: Some("Renamed".into()),
            ..Default::default()
        };
        let game = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert_eq!(game.notes, Some("keep me".into()));
    }

    // ── search_games with include_notes ──

    // ── progress field ──

    #[test]
    fn update_game_sets_progress_to_50() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            progress: Some(Some(50)),
            ..Default::default()
        };
        let game = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert_eq!(game.progress, Some(50));
    }

    #[test]
    fn update_game_sets_progress_to_zero() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            progress: Some(Some(0)),
            ..Default::default()
        };
        let game = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert_eq!(
            game.progress,
            Some(0),
            "0 is a valid progress value, not null"
        );
    }

    #[test]
    fn update_game_clears_progress_with_null() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO games (id, name, source, status, progress, added_at, updated_at) VALUES ('g1', 'Game', 'steam', 'backlog', 75, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        drop(conn);

        let fields = UpdateGameFields {
            progress: Some(None),
            ..Default::default()
        };
        let game = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert_eq!(game.progress, None);
    }

    #[test]
    fn update_game_rejects_progress_below_zero() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            progress: Some(Some(-1)),
            ..Default::default()
        };
        let result = update_game_inner(&state, "g1".into(), fields);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("progress"));
    }

    #[test]
    fn update_game_rejects_progress_above_100() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let fields = UpdateGameFields {
            progress: Some(Some(101)),
            ..Default::default()
        };
        let result = update_game_inner(&state, "g1".into(), fields);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("progress"));
    }

    #[test]
    fn update_game_milestones_json_round_trips() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game", "steam");
        drop(conn);

        let milestones = r#"[{"id":"m1","label":"Beat Act 1","completed":true,"completedAt":"2026-03-10T12:00:00Z"}]"#;
        let fields = UpdateGameFields {
            milestones_json: Some(Some(milestones.to_string())),
            ..Default::default()
        };
        let game = update_game_inner(&state, "g1".into(), fields).unwrap();
        assert_eq!(game.milestones_json, Some(milestones.to_string()));
    }

}
