use rusqlite::params;
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;
use crate::models::collection::{Collection, CollectionWithCount, CollectionWithGameIds};
use crate::models::game::Game;

#[tauri::command]
pub fn get_collections(
    db: State<'_, DbState>,
) -> Result<Vec<CollectionWithCount>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare(
            "SELECT c.*, COUNT(cg.game_id) AS game_count
             FROM collections c
             LEFT JOIN collection_games cg ON cg.collection_id = c.id
             GROUP BY c.id
             ORDER BY c.sort_order ASC, c.name ASC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let collections = stmt
        .query_map([], CollectionWithCount::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(collections)
}

#[tauri::command]
pub fn get_collections_with_game_ids(
    db: State<'_, DbState>,
) -> Result<Vec<CollectionWithGameIds>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut coll_stmt = conn
        .prepare(
            "SELECT id, name, icon, color, sort_order
             FROM collections
             ORDER BY sort_order ASC, name ASC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let collections: Vec<(String, String, Option<String>, Option<String>, i64)> = coll_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>("id")?,
                row.get::<_, String>("name")?,
                row.get::<_, Option<String>>("icon")?,
                row.get::<_, Option<String>>("color")?,
                row.get::<_, i64>("sort_order")?,
            ))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let mut game_stmt = conn
        .prepare("SELECT game_id FROM collection_games WHERE collection_id = ?1")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let result = collections
        .into_iter()
        .map(|(id, name, icon, color, sort_order)| {
            let game_ids = game_stmt
                .query_map(params![id], |row| row.get::<_, String>(0))
                .map_err(|e| CommandError::Database(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| CommandError::Database(e.to_string()))?;

            Ok(CollectionWithGameIds {
                id,
                name,
                icon,
                color,
                sort_order,
                game_ids,
            })
        })
        .collect::<Result<Vec<_>, CommandError>>()?;

    Ok(result)
}

#[tauri::command]
pub fn create_collection(
    db: State<'_, DbState>,
    name: String,
    icon: Option<String>,
    color: Option<String>,
) -> Result<Collection, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let id = Uuid::new_v4().to_string();
    let now = now_iso();

    let max_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM collections",
            [],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    conn.execute(
        "INSERT INTO collections (id, name, icon, color, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, name, icon, color, max_order + 1, now],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let collection = conn
        .query_row(
            "SELECT * FROM collections WHERE id = ?1",
            params![id],
            Collection::from_row,
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(collection)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCollectionFields {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i64>,
}

#[tauri::command]
pub fn update_collection(
    db: State<'_, DbState>,
    id: String,
    fields: UpdateCollectionFields,
) -> Result<Collection, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM collections WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !exists {
        return Err(CommandError::NotFound(format!("collection {id}")));
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

    push_field!(fields.name, "name");
    push_field!(fields.icon, "icon");
    push_field!(fields.color, "color");
    push_field!(fields.sort_order, "sort_order");

    if set_clauses.is_empty() {
        return Err(CommandError::Parse(
            "no fields provided for update".into(),
        ));
    }

    let now = now_iso();
    set_clauses.push("updated_at = ?".to_string());
    values.push(Box::new(now));

    values.push(Box::new(id.clone()));

    let sql = format!(
        "UPDATE collections SET {} WHERE id = ?",
        set_clauses.join(", ")
    );

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        values.iter().map(|v| v.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let collection = conn
        .query_row(
            "SELECT * FROM collections WHERE id = ?1",
            params![id],
            Collection::from_row,
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(collection)
}

#[tauri::command]
pub fn delete_collection(db: State<'_, DbState>, id: String) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM collections WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !exists {
        return Err(CommandError::NotFound(format!("collection {id}")));
    }

    conn.execute(
        "DELETE FROM collection_games WHERE collection_id = ?1",
        params![id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    conn.execute("DELETE FROM collections WHERE id = ?1", params![id])
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn add_to_collection(
    db: State<'_, DbState>,
    collection_id: String,
    game_id: String,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let collection_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM collections WHERE id = ?1",
            params![collection_id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !collection_exists {
        return Err(CommandError::NotFound(format!(
            "collection {collection_id}"
        )));
    }

    let game_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM games WHERE id = ?1",
            params![game_id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !game_exists {
        return Err(CommandError::NotFound(format!("game {game_id}")));
    }

    let now = now_iso();
    conn.execute(
        "INSERT INTO collection_games (collection_id, game_id, added_at) VALUES (?1, ?2, ?3)",
        params![collection_id, game_id, now],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") || e.to_string().contains("PRIMARY KEY") {
            CommandError::Database(format!(
                "game {game_id} already in collection {collection_id}"
            ))
        } else {
            CommandError::Database(e.to_string())
        }
    })?;

    Ok(())
}

#[tauri::command]
pub fn remove_from_collection(
    db: State<'_, DbState>,
    collection_id: String,
    game_id: String,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let rows = conn
        .execute(
            "DELETE FROM collection_games WHERE collection_id = ?1 AND game_id = ?2",
            params![collection_id, game_id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if rows == 0 {
        return Err(CommandError::NotFound(format!(
            "game {game_id} in collection {collection_id}"
        )));
    }

    Ok(())
}

#[tauri::command]
pub fn reorder_collections(
    db: State<'_, DbState>,
    ids: Vec<String>,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let now = now_iso();
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    for (index, id) in ids.iter().enumerate() {
        let rows = tx
            .execute(
                "UPDATE collections SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![index as i64, now, id],
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CommandError::NotFound(format!("collection {id}")));
        }
    }

    tx.commit()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn get_collection_games(
    db: State<'_, DbState>,
    collection_id: String,
) -> Result<Vec<Game>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM collections WHERE id = ?1",
            params![collection_id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !exists {
        return Err(CommandError::NotFound(format!(
            "collection {collection_id}"
        )));
    }

    let mut stmt = conn
        .prepare(
            "SELECT g.* FROM games g
             INNER JOIN collection_games cg ON cg.game_id = g.id
             WHERE cg.collection_id = ?1
             ORDER BY g.name ASC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let games = stmt
        .query_map(params![collection_id], Game::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(games)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_collection(conn: &rusqlite::Connection, id: &str, name: &str, sort_order: i64) {
        conn.execute(
            "INSERT INTO collections (id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name, sort_order],
        ).unwrap();
    }

    fn insert_game(conn: &rusqlite::Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) VALUES (?1, ?2, 'steam', 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name],
        ).unwrap();
    }

    fn insert_junction(conn: &rusqlite::Connection, collection_id: &str, game_id: &str) {
        conn.execute(
            "INSERT INTO collection_games (collection_id, game_id, added_at) VALUES (?1, ?2, '2026-01-01T00:00:00Z')",
            params![collection_id, game_id],
        ).unwrap();
    }

    // ── get_collections ──

    #[test]
    fn get_collections_returns_all_with_counts() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Favorites", 0);
        insert_collection(&conn, "c2", "Backlog", 1);
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        insert_junction(&conn, "c1", "g1");
        insert_junction(&conn, "c1", "g2");
        drop(conn);

        let collections = get_collections_inner(&state).unwrap();
        assert_eq!(collections.len(), 2);
        assert_eq!(collections[0].name, "Favorites");
        assert_eq!(collections[0].game_count, 2);
        assert_eq!(collections[1].name, "Backlog");
        assert_eq!(collections[1].game_count, 0);
    }

    #[test]
    fn get_collections_empty() {
        let state = setup_db();
        let collections = get_collections_inner(&state).unwrap();
        assert!(collections.is_empty());
    }

    #[test]
    fn get_collections_ordered_by_sort_order() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Zebra", 2);
        insert_collection(&conn, "c2", "Alpha", 0);
        insert_collection(&conn, "c3", "Middle", 1);
        drop(conn);

        let collections = get_collections_inner(&state).unwrap();
        assert_eq!(collections[0].name, "Alpha");
        assert_eq!(collections[1].name, "Middle");
        assert_eq!(collections[2].name, "Zebra");
    }

    // ── create_collection ──

    #[test]
    fn create_collection_basic() {
        let state = setup_db();
        let c = create_collection_inner(&state, "My List".into(), None, None).unwrap();
        assert_eq!(c.name, "My List");
        assert!(!c.id.is_empty());
        assert!(c.icon.is_none());
        assert!(c.color.is_none());
        assert_eq!(c.sort_order, 0);
    }

    #[test]
    fn create_collection_with_icon_and_color() {
        let state = setup_db();
        let c = create_collection_inner(
            &state,
            "RPGs".into(),
            Some("sword".into()),
            Some("#ff0000".into()),
        )
        .unwrap();
        assert_eq!(c.icon, Some("sword".into()));
        assert_eq!(c.color, Some("#ff0000".into()));
    }

    #[test]
    fn create_collection_auto_increments_sort_order() {
        let state = setup_db();
        let c1 = create_collection_inner(&state, "First".into(), None, None).unwrap();
        let c2 = create_collection_inner(&state, "Second".into(), None, None).unwrap();
        let c3 = create_collection_inner(&state, "Third".into(), None, None).unwrap();
        assert_eq!(c1.sort_order, 0);
        assert_eq!(c2.sort_order, 1);
        assert_eq!(c3.sort_order, 2);
    }

    // ── update_collection ──

    #[test]
    fn update_collection_partial() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Old Name", 0);
        drop(conn);

        let fields = UpdateCollectionFields {
            name: Some("New Name".into()),
            icon: None,
            color: None,
            sort_order: None,
        };
        let updated = update_collection_inner(&state, "c1".into(), fields).unwrap();
        assert_eq!(updated.name, "New Name");
        assert_ne!(updated.updated_at, "2026-01-01T00:00:00Z");
    }

    #[test]
    fn update_collection_not_found() {
        let state = setup_db();
        let fields = UpdateCollectionFields {
            name: Some("X".into()),
            icon: None,
            color: None,
            sort_order: None,
        };
        let result = update_collection_inner(&state, "nope".into(), fields);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn update_collection_rejects_empty_fields() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Test", 0);
        drop(conn);

        let fields = UpdateCollectionFields {
            name: None,
            icon: None,
            color: None,
            sort_order: None,
        };
        let result = update_collection_inner(&state, "c1".into(), fields);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("no fields"));
    }

    // ── delete_collection ──

    #[test]
    fn delete_collection_removes_collection_and_junctions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Doomed", 0);
        insert_game(&conn, "g1", "Game A");
        insert_junction(&conn, "c1", "g1");
        drop(conn);

        delete_collection_inner(&state, "c1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM collections WHERE id = 'c1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);

        let junction_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM collection_games WHERE collection_id = 'c1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(junction_count, 0);
    }

    #[test]
    fn delete_collection_does_not_delete_games() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Doomed", 0);
        insert_game(&conn, "g1", "Survivor");
        insert_junction(&conn, "c1", "g1");
        drop(conn);

        delete_collection_inner(&state, "c1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let game_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM games WHERE id = 'g1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(game_count, 1);
    }

    #[test]
    fn delete_collection_not_found() {
        let state = setup_db();
        let result = delete_collection_inner(&state, "nope".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ── add_to_collection ──

    #[test]
    fn add_to_collection_success() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Favs", 0);
        insert_game(&conn, "g1", "Game A");
        drop(conn);

        add_to_collection_inner(&state, "c1".into(), "g1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM collection_games WHERE collection_id = 'c1' AND game_id = 'g1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn add_to_collection_duplicate_rejected() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Favs", 0);
        insert_game(&conn, "g1", "Game A");
        drop(conn);

        add_to_collection_inner(&state, "c1".into(), "g1".into()).unwrap();
        let result = add_to_collection_inner(&state, "c1".into(), "g1".into());
        assert!(result.is_err());
    }

    #[test]
    fn add_to_collection_missing_collection() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        drop(conn);

        let result = add_to_collection_inner(&state, "nope".into(), "g1".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn add_to_collection_missing_game() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Favs", 0);
        drop(conn);

        let result = add_to_collection_inner(&state, "c1".into(), "nope".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ── remove_from_collection ──

    #[test]
    fn remove_from_collection_success() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Favs", 0);
        insert_game(&conn, "g1", "Game A");
        insert_junction(&conn, "c1", "g1");
        drop(conn);

        remove_from_collection_inner(&state, "c1".into(), "g1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM collection_games WHERE collection_id = 'c1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn remove_from_collection_not_found() {
        let state = setup_db();
        let result = remove_from_collection_inner(&state, "c1".into(), "g1".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ── reorder_collections ──

    #[test]
    fn reorder_collections_updates_sort_order() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "First", 0);
        insert_collection(&conn, "c2", "Second", 1);
        insert_collection(&conn, "c3", "Third", 2);
        drop(conn);

        reorder_collections_inner(&state, vec!["c3".into(), "c1".into(), "c2".into()]).unwrap();

        let conn = state.conn.lock().unwrap();
        let order: Vec<(String, i64)> = conn
            .prepare("SELECT id, sort_order FROM collections ORDER BY sort_order ASC")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(order[0], ("c3".into(), 0));
        assert_eq!(order[1], ("c1".into(), 1));
        assert_eq!(order[2], ("c2".into(), 2));
    }

    #[test]
    fn reorder_collections_not_found() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "First", 0);
        drop(conn);

        let result = reorder_collections_inner(&state, vec!["c1".into(), "nonexistent".into()]);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ── get_collection_games ──

    #[test]
    fn get_collection_games_returns_games() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Favs", 0);
        insert_game(&conn, "g1", "Zelda");
        insert_game(&conn, "g2", "Apex");
        insert_junction(&conn, "c1", "g1");
        insert_junction(&conn, "c1", "g2");
        drop(conn);

        let games = get_collection_games_inner(&state, "c1".into()).unwrap();
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].name, "Apex");
        assert_eq!(games[1].name, "Zelda");
    }

    #[test]
    fn get_collection_games_empty_collection() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_collection(&conn, "c1", "Empty", 0);
        drop(conn);

        let games = get_collection_games_inner(&state, "c1".into()).unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn get_collection_games_not_found() {
        let state = setup_db();
        let result = get_collection_games_inner(&state, "nope".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ── Test helpers: non-Tauri wrappers ──

    fn get_collections_inner(state: &DbState) -> Result<Vec<CollectionWithCount>, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let mut stmt = conn
            .prepare(
                "SELECT c.*, COUNT(cg.game_id) AS game_count
                 FROM collections c
                 LEFT JOIN collection_games cg ON cg.collection_id = c.id
                 GROUP BY c.id
                 ORDER BY c.sort_order ASC, c.name ASC",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let collections = stmt
            .query_map([], CollectionWithCount::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(collections)
    }

    fn create_collection_inner(
        state: &DbState,
        name: String,
        icon: Option<String>,
        color: Option<String>,
    ) -> Result<Collection, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let id = Uuid::new_v4().to_string();
        let now = now_iso();

        let max_order: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM collections",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        conn.execute(
            "INSERT INTO collections (id, name, icon, color, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![id, name, icon, color, max_order + 1, now],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        let collection = conn
            .query_row(
                "SELECT * FROM collections WHERE id = ?1",
                params![id],
                Collection::from_row,
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(collection)
    }

    fn update_collection_inner(
        state: &DbState,
        id: String,
        fields: UpdateCollectionFields,
    ) -> Result<Collection, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM collections WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if !exists {
            return Err(CommandError::NotFound(format!("collection {id}")));
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

        push_field!(fields.name, "name");
        push_field!(fields.icon, "icon");
        push_field!(fields.color, "color");
        push_field!(fields.sort_order, "sort_order");

        if set_clauses.is_empty() {
            return Err(CommandError::Parse(
                "no fields provided for update".into(),
            ));
        }

        let now = now_iso();
        set_clauses.push("updated_at = ?".to_string());
        values.push(Box::new(now));
        values.push(Box::new(id.clone()));

        let sql = format!(
            "UPDATE collections SET {} WHERE id = ?",
            set_clauses.join(", ")
        );
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params_refs.as_slice())
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let collection = conn
            .query_row(
                "SELECT * FROM collections WHERE id = ?1",
                params![id],
                Collection::from_row,
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(collection)
    }

    fn delete_collection_inner(state: &DbState, id: String) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM collections WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if !exists {
            return Err(CommandError::NotFound(format!("collection {id}")));
        }

        conn.execute(
            "DELETE FROM collection_games WHERE collection_id = ?1",
            params![id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        conn.execute("DELETE FROM collections WHERE id = ?1", params![id])
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    fn add_to_collection_inner(
        state: &DbState,
        collection_id: String,
        game_id: String,
    ) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let collection_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM collections WHERE id = ?1",
                params![collection_id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if !collection_exists {
            return Err(CommandError::NotFound(format!(
                "collection {collection_id}"
            )));
        }

        let game_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM games WHERE id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if !game_exists {
            return Err(CommandError::NotFound(format!("game {game_id}")));
        }

        let now = now_iso();
        conn.execute(
            "INSERT INTO collection_games (collection_id, game_id, added_at) VALUES (?1, ?2, ?3)",
            params![collection_id, game_id, now],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") || e.to_string().contains("PRIMARY KEY") {
                CommandError::Database(format!(
                    "game {game_id} already in collection {collection_id}"
                ))
            } else {
                CommandError::Database(e.to_string())
            }
        })?;

        Ok(())
    }

    fn remove_from_collection_inner(
        state: &DbState,
        collection_id: String,
        game_id: String,
    ) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let rows = conn
            .execute(
                "DELETE FROM collection_games WHERE collection_id = ?1 AND game_id = ?2",
                params![collection_id, game_id],
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CommandError::NotFound(format!(
                "game {game_id} in collection {collection_id}"
            )));
        }

        Ok(())
    }

    fn reorder_collections_inner(
        state: &DbState,
        ids: Vec<String>,
    ) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let now = now_iso();
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        for (index, id) in ids.iter().enumerate() {
            let rows = tx
                .execute(
                    "UPDATE collections SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                    params![index as i64, now, id],
                )
                .map_err(|e| CommandError::Database(e.to_string()))?;

            if rows == 0 {
                return Err(CommandError::NotFound(format!("collection {id}")));
            }
        }

        tx.commit()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    fn get_collection_games_inner(
        state: &DbState,
        collection_id: String,
    ) -> Result<Vec<Game>, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM collections WHERE id = ?1",
                params![collection_id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if !exists {
            return Err(CommandError::NotFound(format!(
                "collection {collection_id}"
            )));
        }

        let mut stmt = conn
            .prepare(
                "SELECT g.* FROM games g
                 INNER JOIN collection_games cg ON cg.game_id = g.id
                 WHERE cg.collection_id = ?1
                 ORDER BY g.name ASC",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let games = stmt
            .query_map(params![collection_id], Game::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(games)
    }
}
