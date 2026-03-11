use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;
use crate::models::tag::{Tag, TagWithCount};

#[tauri::command]
pub fn get_tags(db: State<'_, DbState>) -> Result<Vec<TagWithCount>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare(
            "SELECT t.*, COUNT(gt.game_id) AS game_count
             FROM tags t
             LEFT JOIN game_tags gt ON gt.tag_id = t.id
             GROUP BY t.id
             ORDER BY t.name ASC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let tags = stmt
        .query_map([], TagWithCount::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(tags)
}

#[tauri::command]
pub fn create_tag(
    db: State<'_, DbState>,
    name: String,
    color: Option<String>,
) -> Result<Tag, CommandError> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(CommandError::Parse("tag name cannot be empty".into()));
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM tags WHERE name = ?1 COLLATE NOCASE",
            params![trimmed],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if exists {
        return Err(CommandError::Database(format!(
            "tag '{}' already exists",
            trimmed
        )));
    }

    let id = Uuid::new_v4().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, trimmed, color, now],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let tag = conn
        .query_row("SELECT * FROM tags WHERE id = ?1", params![id], Tag::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(tag)
}

#[tauri::command]
pub fn delete_tag(db: State<'_, DbState>, tag_id: String) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let rows = conn
        .execute("DELETE FROM tags WHERE id = ?1", params![tag_id])
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if rows == 0 {
        return Err(CommandError::NotFound(format!("tag {tag_id}")));
    }

    Ok(())
}

#[tauri::command]
pub fn rename_tag(
    db: State<'_, DbState>,
    tag_id: String,
    name: String,
) -> Result<Tag, CommandError> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(CommandError::Parse("tag name cannot be empty".into()));
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM tags WHERE id = ?1",
            params![tag_id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !exists {
        return Err(CommandError::NotFound(format!("tag {tag_id}")));
    }

    let conflict: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM tags WHERE name = ?1 COLLATE NOCASE AND id != ?2",
            params![trimmed, tag_id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if conflict {
        return Err(CommandError::Database(format!(
            "tag '{}' already exists",
            trimmed
        )));
    }

    conn.execute(
        "UPDATE tags SET name = ?1 WHERE id = ?2",
        params![trimmed, tag_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let tag = conn
        .query_row(
            "SELECT * FROM tags WHERE id = ?1",
            params![tag_id],
            Tag::from_row,
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(tag)
}

#[tauri::command]
pub fn update_tag_color(
    db: State<'_, DbState>,
    tag_id: String,
    color: Option<String>,
) -> Result<Tag, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let rows = conn
        .execute(
            "UPDATE tags SET color = ?1 WHERE id = ?2",
            params![color, tag_id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if rows == 0 {
        return Err(CommandError::NotFound(format!("tag {tag_id}")));
    }

    let tag = conn
        .query_row(
            "SELECT * FROM tags WHERE id = ?1",
            params![tag_id],
            Tag::from_row,
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(tag)
}

#[tauri::command]
pub fn add_tag_to_game(
    db: State<'_, DbState>,
    game_id: String,
    tag_id: String,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

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

    let tag_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM tags WHERE id = ?1",
            params![tag_id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !tag_exists {
        return Err(CommandError::NotFound(format!("tag {tag_id}")));
    }

    conn.execute(
        "INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES (?1, ?2)",
        params![game_id, tag_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn remove_tag_from_game(
    db: State<'_, DbState>,
    game_id: String,
    tag_id: String,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    conn.execute(
        "DELETE FROM game_tags WHERE game_id = ?1 AND tag_id = ?2",
        params![game_id, tag_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn get_game_tags(db: State<'_, DbState>, game_id: String) -> Result<Vec<Tag>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare(
            "SELECT t.* FROM tags t
             INNER JOIN game_tags gt ON gt.tag_id = t.id
             WHERE gt.game_id = ?1
             ORDER BY t.name ASC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let tags = stmt
        .query_map(params![game_id], Tag::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(tags)
}

#[tauri::command]
pub fn get_games_by_tag(
    db: State<'_, DbState>,
    tag_id: String,
) -> Result<Vec<String>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT game_id FROM game_tags WHERE tag_id = ?1")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let game_ids = stmt
        .query_map(params![tag_id], |row| row.get::<_, String>(0))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(game_ids)
}

#[tauri::command]
pub fn get_all_game_tag_ids(
    db: State<'_, DbState>,
) -> Result<Vec<(String, String)>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT game_id, tag_id FROM game_tags")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let pairs = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(pairs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_game(conn: &rusqlite::Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) VALUES (?1, ?2, 'steam', 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name],
        ).unwrap();
    }

    fn insert_tag(conn: &rusqlite::Connection, id: &str, name: &str, color: Option<&str>) {
        conn.execute(
            "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z')",
            params![id, name, color],
        ).unwrap();
    }

    fn insert_game_tag(conn: &rusqlite::Connection, game_id: &str, tag_id: &str) {
        conn.execute(
            "INSERT INTO game_tags (game_id, tag_id) VALUES (?1, ?2)",
            params![game_id, tag_id],
        ).unwrap();
    }

    // ── create_tag ──

    #[test]
    fn create_tag_success() {
        let state = setup_db();
        let tag = create_tag_inner(&state, "RPG".into(), Some("#EF4444".into())).unwrap();
        assert_eq!(tag.name, "RPG");
        assert_eq!(tag.color, Some("#EF4444".into()));
        assert!(!tag.id.is_empty());
    }

    #[test]
    fn create_tag_trims_whitespace() {
        let state = setup_db();
        let tag = create_tag_inner(&state, "  RPG  ".into(), None).unwrap();
        assert_eq!(tag.name, "RPG");
    }

    #[test]
    fn create_tag_rejects_empty_name() {
        let state = setup_db();
        let result = create_tag_inner(&state, "   ".into(), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("empty"));
    }

    #[test]
    fn create_tag_rejects_duplicate_case_insensitive() {
        let state = setup_db();
        create_tag_inner(&state, "RPG".into(), None).unwrap();
        let result = create_tag_inner(&state, "rpg".into(), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));
    }

    // ── delete_tag ──

    #[test]
    fn delete_tag_removes_tag_and_junctions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_tag(&conn, "t1", "RPG", None);
        insert_game(&conn, "g1", "Game A");
        insert_game_tag(&conn, "g1", "t1");
        drop(conn);

        delete_tag_inner(&state, "t1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let tag_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags WHERE id = 't1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(tag_count, 0);

        let junction_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM game_tags WHERE tag_id = 't1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(junction_count, 0);
    }

    #[test]
    fn delete_tag_not_found() {
        let state = setup_db();
        let result = delete_tag_inner(&state, "nope".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ── rename_tag ──

    #[test]
    fn rename_tag_success() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_tag(&conn, "t1", "RPG", None);
        drop(conn);

        let tag = rename_tag_inner(&state, "t1".into(), "Action RPG".into()).unwrap();
        assert_eq!(tag.name, "Action RPG");
    }

    #[test]
    fn rename_tag_rejects_duplicate() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_tag(&conn, "t1", "RPG", None);
        insert_tag(&conn, "t2", "FPS", None);
        drop(conn);

        let result = rename_tag_inner(&state, "t1".into(), "fps".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));
    }

    #[test]
    fn rename_tag_not_found() {
        let state = setup_db();
        let result = rename_tag_inner(&state, "nope".into(), "X".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ── add_tag_to_game ──

    #[test]
    fn add_tag_to_game_success() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_tag(&conn, "t1", "RPG", None);
        drop(conn);

        add_tag_to_game_inner(&state, "g1".into(), "t1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM game_tags WHERE game_id = 'g1' AND tag_id = 't1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn add_tag_to_game_is_noop_if_already_tagged() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_tag(&conn, "t1", "RPG", None);
        insert_game_tag(&conn, "g1", "t1");
        drop(conn);

        let result = add_tag_to_game_inner(&state, "g1".into(), "t1".into());
        assert!(result.is_ok());
    }

    #[test]
    fn add_tag_to_game_missing_game() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_tag(&conn, "t1", "RPG", None);
        drop(conn);

        let result = add_tag_to_game_inner(&state, "nope".into(), "t1".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn add_tag_to_game_missing_tag() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        drop(conn);

        let result = add_tag_to_game_inner(&state, "g1".into(), "nope".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ── remove_tag_from_game ──

    #[test]
    fn remove_tag_from_game_success() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_tag(&conn, "t1", "RPG", None);
        insert_game_tag(&conn, "g1", "t1");
        drop(conn);

        remove_tag_from_game_inner(&state, "g1".into(), "t1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM game_tags WHERE game_id = 'g1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    // ── get_tags ──

    #[test]
    fn get_tags_returns_all_with_counts() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_tag(&conn, "t1", "RPG", None);
        insert_tag(&conn, "t2", "FPS", None);
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        insert_game_tag(&conn, "g1", "t1");
        insert_game_tag(&conn, "g2", "t1");
        drop(conn);

        let tags = get_tags_inner(&state).unwrap();
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].name, "FPS");
        assert_eq!(tags[0].game_count, 0);
        assert_eq!(tags[1].name, "RPG");
        assert_eq!(tags[1].game_count, 2);
    }

    #[test]
    fn get_tags_empty() {
        let state = setup_db();
        let tags = get_tags_inner(&state).unwrap();
        assert!(tags.is_empty());
    }

    // ── get_game_tags ──

    #[test]
    fn get_game_tags_returns_only_game_tags() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        insert_tag(&conn, "t1", "RPG", None);
        insert_tag(&conn, "t2", "FPS", None);
        insert_tag(&conn, "t3", "Indie", None);
        insert_game_tag(&conn, "g1", "t1");
        insert_game_tag(&conn, "g1", "t3");
        insert_game_tag(&conn, "g2", "t2");
        drop(conn);

        let tags = get_game_tags_inner(&state, "g1".into()).unwrap();
        assert_eq!(tags.len(), 2);
        let names: Vec<&str> = tags.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Indie"));
        assert!(names.contains(&"RPG"));
    }

    // ── get_games_by_tag ──

    #[test]
    fn get_games_by_tag_returns_game_ids() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        insert_tag(&conn, "t1", "RPG", None);
        insert_game_tag(&conn, "g1", "t1");
        insert_game_tag(&conn, "g2", "t1");
        drop(conn);

        let ids = get_games_by_tag_inner(&state, "t1".into()).unwrap();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"g1".to_string()));
        assert!(ids.contains(&"g2".to_string()));
    }

    // ── Test helpers: non-Tauri wrappers ──

    fn get_tags_inner(state: &DbState) -> Result<Vec<TagWithCount>, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let mut stmt = conn
            .prepare(
                "SELECT t.*, COUNT(gt.game_id) AS game_count
                 FROM tags t
                 LEFT JOIN game_tags gt ON gt.tag_id = t.id
                 GROUP BY t.id
                 ORDER BY t.name ASC",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let tags = stmt
            .query_map([], TagWithCount::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(tags)
    }

    fn create_tag_inner(
        state: &DbState,
        name: String,
        color: Option<String>,
    ) -> Result<Tag, CommandError> {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err(CommandError::Parse("tag name cannot be empty".into()));
        }

        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tags WHERE name = ?1 COLLATE NOCASE",
                params![trimmed],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if exists {
            return Err(CommandError::Database(format!(
                "tag '{}' already exists",
                trimmed
            )));
        }

        let id = Uuid::new_v4().to_string();
        let now = now_iso();

        conn.execute(
            "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, trimmed, color, now],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        let tag = conn
            .query_row("SELECT * FROM tags WHERE id = ?1", params![id], Tag::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(tag)
    }

    fn delete_tag_inner(state: &DbState, tag_id: String) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let rows = conn
            .execute("DELETE FROM tags WHERE id = ?1", params![tag_id])
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CommandError::NotFound(format!("tag {tag_id}")));
        }

        Ok(())
    }

    fn rename_tag_inner(
        state: &DbState,
        tag_id: String,
        name: String,
    ) -> Result<Tag, CommandError> {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err(CommandError::Parse("tag name cannot be empty".into()));
        }

        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tags WHERE id = ?1",
                params![tag_id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if !exists {
            return Err(CommandError::NotFound(format!("tag {tag_id}")));
        }

        let conflict: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tags WHERE name = ?1 COLLATE NOCASE AND id != ?2",
                params![trimmed, tag_id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if conflict {
            return Err(CommandError::Database(format!(
                "tag '{}' already exists",
                trimmed
            )));
        }

        conn.execute(
            "UPDATE tags SET name = ?1 WHERE id = ?2",
            params![trimmed, tag_id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        let tag = conn
            .query_row(
                "SELECT * FROM tags WHERE id = ?1",
                params![tag_id],
                Tag::from_row,
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(tag)
    }

    fn add_tag_to_game_inner(
        state: &DbState,
        game_id: String,
        tag_id: String,
    ) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

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

        let tag_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tags WHERE id = ?1",
                params![tag_id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if !tag_exists {
            return Err(CommandError::NotFound(format!("tag {tag_id}")));
        }

        conn.execute(
            "INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES (?1, ?2)",
            params![game_id, tag_id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    fn remove_tag_from_game_inner(
        state: &DbState,
        game_id: String,
        tag_id: String,
    ) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        conn.execute(
            "DELETE FROM game_tags WHERE game_id = ?1 AND tag_id = ?2",
            params![game_id, tag_id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    fn get_game_tags_inner(
        state: &DbState,
        game_id: String,
    ) -> Result<Vec<Tag>, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let mut stmt = conn
            .prepare(
                "SELECT t.* FROM tags t
                 INNER JOIN game_tags gt ON gt.tag_id = t.id
                 WHERE gt.game_id = ?1
                 ORDER BY t.name ASC",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let tags = stmt
            .query_map(params![game_id], Tag::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(tags)
    }

    fn get_games_by_tag_inner(
        state: &DbState,
        tag_id: String,
    ) -> Result<Vec<String>, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let mut stmt = conn
            .prepare("SELECT game_id FROM game_tags WHERE tag_id = ?1")
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let game_ids = stmt
            .query_map(params![tag_id], |row| row.get::<_, String>(0))
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(game_ids)
    }
}
