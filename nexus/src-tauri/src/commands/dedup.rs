use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;
use crate::dedup::{
    self, DuplicateCandidate, DuplicateGroup, DuplicateMember, DuplicateResolution,
};

#[tauri::command]
pub fn find_duplicates(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<Vec<DuplicateCandidate>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let candidates = dedup::find_duplicates(&conn).map_err(CommandError::Database)?;

    if !candidates.is_empty() {
        let _ = app.emit("dedup-candidates-found", &candidates);
    }

    Ok(candidates)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveDuplicateParams {
    pub game_ids: Vec<String>,
    pub preferred_game_id: String,
    pub resolution: String,
}

#[tauri::command]
pub fn resolve_duplicate_group(
    db: State<'_, DbState>,
    params: ResolveDuplicateParams,
) -> Result<DuplicateGroup, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let resolution =
        DuplicateResolution::from_str(&params.resolution).map_err(CommandError::Parse)?;

    let now = now_iso();

    dedup::create_duplicate_group(&conn, &params.game_ids, &params.preferred_game_id, &resolution, &now)
        .map_err(CommandError::Database)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResolutionParams {
    pub group_id: String,
    pub preferred_game_id: String,
    pub resolution: String,
}

#[tauri::command]
pub fn update_duplicate_resolution(
    db: State<'_, DbState>,
    params: UpdateResolutionParams,
) -> Result<DuplicateGroup, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let resolution =
        DuplicateResolution::from_str(&params.resolution).map_err(CommandError::Parse)?;

    let now = now_iso();

    dedup::resolve_duplicate(
        &conn,
        &params.group_id,
        &params.preferred_game_id,
        &resolution,
        &now,
    )
    .map_err(CommandError::Database)
}

#[tauri::command]
pub fn get_duplicate_groups(db: State<'_, DbState>) -> Result<Vec<DuplicateGroup>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    dedup::get_all_duplicate_groups(&conn).map_err(CommandError::Database)
}

#[tauri::command]
pub fn get_game_sources(
    db: State<'_, DbState>,
    game_id: String,
) -> Result<Vec<DuplicateMember>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    dedup::get_game_sources(&conn, &game_id).map_err(CommandError::Database)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use rusqlite::params;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_game(conn: &rusqlite::Connection, id: &str, name: &str, source: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at)
             VALUES (?1, ?2, ?3, 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name, source],
        )
        .unwrap();
    }

    #[test]
    fn find_duplicates_inner_works() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Halo Infinite", "steam");
        insert_game(&conn, "g2", "Halo Infinite", "xbox");
        drop(conn);

        let conn = state.conn.lock().unwrap();
        let dupes = dedup::find_duplicates(&conn).unwrap();
        assert_eq!(dupes.len(), 1);
    }

    #[test]
    fn resolve_duplicate_group_inner_works() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Halo Infinite", "steam");
        insert_game(&conn, "g2", "Halo Infinite", "xbox");

        let now = now_iso();
        let group = dedup::create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::PreferSource,
            &now,
        )
        .unwrap();

        assert_eq!(group.members.len(), 2);
        assert_eq!(group.resolution, "prefer_source");
    }

    #[test]
    fn update_resolution_inner_works() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Halo Infinite", "steam");
        insert_game(&conn, "g2", "Halo Infinite", "xbox");

        let now = now_iso();
        let group = dedup::create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::Unresolved,
            &now,
        )
        .unwrap();

        let updated = dedup::resolve_duplicate(
            &conn,
            &group.id,
            "g2",
            &DuplicateResolution::HideOne,
            &now,
        )
        .unwrap();

        assert_eq!(updated.resolution, "hide_one");
        let preferred = updated.members.iter().find(|m| m.is_preferred).unwrap();
        assert_eq!(preferred.game_id, "g2");
    }

    #[test]
    fn get_game_sources_inner_works() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Doom Eternal", "steam");
        insert_game(&conn, "g2", "Doom Eternal", "epic");

        let now = now_iso();
        dedup::create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::PreferSource,
            &now,
        )
        .unwrap();

        let sources = dedup::get_game_sources(&conn, "g1").unwrap();
        assert_eq!(sources.len(), 2);
    }

    #[test]
    fn get_game_sources_returns_empty_for_non_grouped() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Solo Game", "steam");

        let sources = dedup::get_game_sources(&conn, "g1").unwrap();
        assert!(sources.is_empty());
    }
}
