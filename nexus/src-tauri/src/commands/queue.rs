use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;
use crate::models::queue::PlayQueueEntry;

#[tauri::command]
pub fn get_play_queue(db: State<'_, DbState>) -> Result<Vec<PlayQueueEntry>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare(
            "SELECT pq.id, pq.game_id, pq.position, pq.added_at,
                    g.name, g.cover_url, g.custom_cover, g.status, g.source
             FROM play_queue pq
             INNER JOIN games g ON g.id = pq.game_id
             ORDER BY pq.position ASC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let entries = stmt
        .query_map([], PlayQueueEntry::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(entries)
}

#[tauri::command]
pub fn add_to_play_queue(
    db: State<'_, DbState>,
    game_id: String,
) -> Result<PlayQueueEntry, CommandError> {
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

    let already_queued: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM play_queue WHERE game_id = ?1",
            params![game_id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if already_queued {
        return Err(CommandError::Database(format!(
            "game {game_id} is already in the queue"
        )));
    }

    let max_pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM play_queue",
            [],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let position = max_pos + 1;

    conn.execute(
        "INSERT INTO play_queue (id, game_id, position, added_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, game_id, position, now],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let entry = conn
        .query_row(
            "SELECT pq.id, pq.game_id, pq.position, pq.added_at,
                    g.name, g.cover_url, g.custom_cover, g.status, g.source
             FROM play_queue pq
             INNER JOIN games g ON g.id = pq.game_id
             WHERE pq.id = ?1",
            params![id],
            PlayQueueEntry::from_row,
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(entry)
}

#[tauri::command]
pub fn remove_from_play_queue(
    db: State<'_, DbState>,
    game_id: String,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let position: Option<i64> = conn
        .query_row(
            "SELECT position FROM play_queue WHERE game_id = ?1",
            params![game_id],
            |row| row.get(0),
        )
        .ok();

    let Some(removed_pos) = position else {
        return Err(CommandError::NotFound(format!(
            "game {game_id} not in queue"
        )));
    };

    conn.execute(
        "DELETE FROM play_queue WHERE game_id = ?1",
        params![game_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    conn.execute(
        "UPDATE play_queue SET position = position - 1 WHERE position > ?1",
        params![removed_pos],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn reorder_play_queue(
    db: State<'_, DbState>,
    game_ids: Vec<String>,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    for (index, gid) in game_ids.iter().enumerate() {
        let rows = tx
            .execute(
                "UPDATE play_queue SET position = ?1 WHERE game_id = ?2",
                params![index as i64, gid],
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CommandError::NotFound(format!(
                "game {gid} not in queue"
            )));
        }
    }

    tx.commit()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn clear_play_queue(db: State<'_, DbState>) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    conn.execute("DELETE FROM play_queue", [])
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
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

    fn get_queue_inner(state: &DbState) -> Result<Vec<PlayQueueEntry>, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let mut stmt = conn
            .prepare(
                "SELECT pq.id, pq.game_id, pq.position, pq.added_at,
                        g.name, g.cover_url, g.custom_cover, g.status, g.source
                 FROM play_queue pq
                 INNER JOIN games g ON g.id = pq.game_id
                 ORDER BY pq.position ASC",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let entries = stmt
            .query_map([], PlayQueueEntry::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(entries)
    }

    fn add_inner(state: &DbState, game_id: &str) -> Result<PlayQueueEntry, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let max_pos: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) FROM play_queue",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let already_queued: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM play_queue WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if already_queued {
            return Err(CommandError::Database(format!(
                "game {game_id} is already in the queue"
            )));
        }

        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let position = max_pos + 1;

        conn.execute(
            "INSERT INTO play_queue (id, game_id, position, added_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, game_id, position, now],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        let entry = conn
            .query_row(
                "SELECT pq.id, pq.game_id, pq.position, pq.added_at,
                        g.name, g.cover_url, g.custom_cover, g.status, g.source
                 FROM play_queue pq
                 INNER JOIN games g ON g.id = pq.game_id
                 WHERE pq.id = ?1",
                params![id],
                PlayQueueEntry::from_row,
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(entry)
    }

    fn remove_inner(state: &DbState, game_id: &str) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let position: Option<i64> = conn
            .query_row(
                "SELECT position FROM play_queue WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .ok();

        let Some(removed_pos) = position else {
            return Err(CommandError::NotFound(format!(
                "game {game_id} not in queue"
            )));
        };

        conn.execute(
            "DELETE FROM play_queue WHERE game_id = ?1",
            params![game_id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        conn.execute(
            "UPDATE play_queue SET position = position - 1 WHERE position > ?1",
            params![removed_pos],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    fn reorder_inner(state: &DbState, game_ids: Vec<String>) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let tx = conn
            .unchecked_transaction()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        for (index, gid) in game_ids.iter().enumerate() {
            let rows = tx
                .execute(
                    "UPDATE play_queue SET position = ?1 WHERE game_id = ?2",
                    params![index as i64, gid],
                )
                .map_err(|e| CommandError::Database(e.to_string()))?;

            if rows == 0 {
                return Err(CommandError::NotFound(format!(
                    "game {gid} not in queue"
                )));
            }
        }

        tx.commit()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    fn clear_inner(state: &DbState) -> Result<(), CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        conn.execute("DELETE FROM play_queue", [])
            .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    #[test]
    fn add_to_empty_queue_gets_position_0() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        drop(conn);

        let entry = add_inner(&state, "g1").unwrap();
        assert_eq!(entry.position, 0);
        assert_eq!(entry.game_id, "g1");
        assert_eq!(entry.name, "Game A");
    }

    #[test]
    fn add_second_game_gets_position_1() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        drop(conn);

        let e1 = add_inner(&state, "g1").unwrap();
        let e2 = add_inner(&state, "g2").unwrap();
        assert_eq!(e1.position, 0);
        assert_eq!(e2.position, 1);
    }

    #[test]
    fn add_duplicate_game_returns_error() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        drop(conn);

        add_inner(&state, "g1").unwrap();
        let result = add_inner(&state, "g1");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already in the queue"));
    }

    #[test]
    fn remove_middle_game_recompacts_positions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        insert_game(&conn, "g3", "Game C");
        drop(conn);

        add_inner(&state, "g1").unwrap();
        add_inner(&state, "g2").unwrap();
        add_inner(&state, "g3").unwrap();

        remove_inner(&state, "g2").unwrap();

        let queue = get_queue_inner(&state).unwrap();
        assert_eq!(queue.len(), 2);
        assert_eq!(queue[0].game_id, "g1");
        assert_eq!(queue[0].position, 0);
        assert_eq!(queue[1].game_id, "g3");
        assert_eq!(queue[1].position, 1);
    }

    #[test]
    fn remove_nonexistent_returns_not_found() {
        let state = setup_db();
        let result = remove_inner(&state, "g1");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn reorder_updates_positions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        insert_game(&conn, "g3", "Game C");
        drop(conn);

        add_inner(&state, "g1").unwrap();
        add_inner(&state, "g2").unwrap();
        add_inner(&state, "g3").unwrap();

        reorder_inner(
            &state,
            vec!["g3".into(), "g1".into(), "g2".into()],
        )
        .unwrap();

        let queue = get_queue_inner(&state).unwrap();
        assert_eq!(queue[0].game_id, "g3");
        assert_eq!(queue[0].position, 0);
        assert_eq!(queue[1].game_id, "g1");
        assert_eq!(queue[1].position, 1);
        assert_eq!(queue[2].game_id, "g2");
        assert_eq!(queue[2].position, 2);
    }

    #[test]
    fn clear_queue_removes_all() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        drop(conn);

        add_inner(&state, "g1").unwrap();
        add_inner(&state, "g2").unwrap();

        clear_inner(&state).unwrap();

        let queue = get_queue_inner(&state).unwrap();
        assert!(queue.is_empty());
    }

    #[test]
    fn get_queue_returns_ordered_entries() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        insert_game(&conn, "g2", "Game B");
        insert_game(&conn, "g3", "Game C");
        drop(conn);

        add_inner(&state, "g1").unwrap();
        add_inner(&state, "g2").unwrap();
        add_inner(&state, "g3").unwrap();

        let queue = get_queue_inner(&state).unwrap();
        assert_eq!(queue.len(), 3);
        assert_eq!(queue[0].name, "Game A");
        assert_eq!(queue[1].name, "Game B");
        assert_eq!(queue[2].name, "Game C");
    }

    #[test]
    fn cascade_delete_removes_from_queue() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game A");
        drop(conn);

        add_inner(&state, "g1").unwrap();

        let conn = state.conn.lock().unwrap();
        conn.execute("DELETE FROM games WHERE id = 'g1'", []).unwrap();
        drop(conn);

        let queue = get_queue_inner(&state).unwrap();
        assert!(queue.is_empty());
    }

    #[test]
    fn get_queue_empty_returns_empty_vec() {
        let state = setup_db();
        let queue = get_queue_inner(&state).unwrap();
        assert!(queue.is_empty());
    }
}
