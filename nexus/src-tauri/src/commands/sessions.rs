use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use super::error::CommandError;
use super::utils::{iso_to_epoch_secs, now_iso};
use crate::db::DbState;
use crate::models::session::{ActivityBucket, LibraryStatsData, PlaySession, PlayStats, SessionEntry, TopGameEntry};

/// Three-strategy LEFT JOIN that resolves orphaned sessions (from removed/re-added games)
/// to the current game entry via: 1) direct ID, 2) (source, source_id) natural key,
/// 3) (source, name) fallback for standalone games without a source_id.
const GAME_LEFT_JOIN: &str =
    "LEFT JOIN games g ON (g.id = ps.game_id) \
     OR (ps.game_source_id IS NOT NULL AND g.source = ps.game_source AND g.source_id = ps.game_source_id) \
     OR (ps.game_source_id IS NULL AND ps.game_name IS NOT NULL AND g.source = ps.game_source AND g.name = ps.game_name)";

#[tauri::command]
pub fn create_session(
    db: State<'_, DbState>,
    game_id: String,
) -> Result<PlaySession, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let (game_name, game_source, game_source_id): (String, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT name, source, source_id FROM games WHERE id = ?1",
            params![game_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                CommandError::NotFound(format!("game {game_id}"))
            }
            other => CommandError::Database(other.to_string()),
        })?;

    let id = Uuid::new_v4().to_string();
    let started_at = now_iso();

    conn.execute(
        "INSERT INTO play_sessions (id, game_id, started_at, tracking, game_source, game_source_id, game_name) VALUES (?1, ?2, ?3, 'auto', ?4, ?5, ?6)",
        params![id, game_id, started_at, game_source, game_source_id, game_name],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let session = conn
        .query_row(
            "SELECT * FROM play_sessions WHERE id = ?1",
            params![id],
            PlaySession::from_row,
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(session)
}

#[tauri::command]
pub fn end_session(
    db: State<'_, DbState>,
    session_id: String,
    ended_at: String,
) -> Result<PlaySession, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let (game_id, started_at): (String, String) = conn
        .query_row(
            "SELECT game_id, started_at FROM play_sessions WHERE id = ?1",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                CommandError::NotFound(format!("session {session_id}"))
            }
            other => CommandError::Database(other.to_string()),
        })?;

    let start_epoch = iso_to_epoch_secs(&started_at).map_err(CommandError::Parse)?;
    let end_epoch = iso_to_epoch_secs(&ended_at).map_err(CommandError::Parse)?;
    let duration_s = (end_epoch - start_epoch).max(0);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    tx.execute(
        "UPDATE play_sessions SET ended_at = ?1, duration_s = ?2 WHERE id = ?3",
        params![ended_at, duration_s, session_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let now = now_iso();
    tx.execute(
        "UPDATE games SET total_play_time = total_play_time + ?1, last_played = ?2, play_count = play_count + 1, updated_at = ?3 WHERE id = ?4",
        params![duration_s, ended_at, now, game_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    tx.commit()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let session = conn
        .query_row(
            "SELECT * FROM play_sessions WHERE id = ?1",
            params![session_id],
            PlaySession::from_row,
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(session)
}

#[tauri::command]
pub fn get_play_sessions(
    db: State<'_, DbState>,
    game_id: String,
) -> Result<Vec<PlaySession>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT * FROM play_sessions WHERE game_id = ?1 ORDER BY started_at DESC")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let sessions = stmt
        .query_map(params![game_id], PlaySession::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(sessions)
}

#[tauri::command]
pub fn get_play_stats(
    db: State<'_, DbState>,
    game_id: String,
) -> Result<PlayStats, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let stats = conn
        .query_row(
            "SELECT
                COALESCE(SUM(duration_s), 0) as total_time,
                COUNT(*) as session_count,
                CAST(COALESCE(AVG(duration_s), 0) AS INTEGER) as avg_session,
                COALESCE(MAX(duration_s), 0) as longest_session,
                MAX(started_at) as last_played,
                MIN(started_at) as first_played
             FROM play_sessions
             WHERE game_id = ?1 AND ended_at IS NOT NULL",
            params![game_id],
            |row| {
                Ok(PlayStats {
                    game_id: game_id.clone(),
                    total_time: row.get("total_time")?,
                    session_count: row.get("session_count")?,
                    average_session: row.get("avg_session")?,
                    longest_session: row.get("longest_session")?,
                    last_played: row.get("last_played")?,
                    first_played: row.get("first_played")?,
                })
            },
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(stats)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityParams {
    pub period: String,
}

#[tauri::command]
pub fn get_activity_data(
    db: State<'_, DbState>,
    params: ActivityParams,
) -> Result<Vec<ActivityBucket>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let date_format = match params.period.as_str() {
        "daily" => "%Y-%m-%d",
        "weekly" => "%Y-W%W",
        "monthly" => "%Y-%m",
        other => return Err(CommandError::Parse(format!("invalid period: {other}, expected daily|weekly|monthly"))),
    };

    let sql = format!(
        "SELECT
            strftime('{date_format}', started_at) as period,
            COALESCE(SUM(duration_s), 0) as total_time,
            COUNT(*) as session_count
         FROM play_sessions
         WHERE ended_at IS NOT NULL
         GROUP BY period
         ORDER BY period ASC"
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let buckets = stmt
        .query_map([], |row| {
            Ok(ActivityBucket {
                period: row.get("period")?,
                total_time: row.get("total_time")?,
                session_count: row.get("session_count")?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(buckets)
}

#[tauri::command]
pub fn get_orphaned_sessions(
    db: State<'_, DbState>,
) -> Result<Vec<PlaySession>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT * FROM play_sessions WHERE ended_at IS NULL ORDER BY started_at DESC")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let sessions = stmt
        .query_map([], PlaySession::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(sessions)
}

#[tauri::command]
pub fn get_library_stats(db: State<'_, DbState>) -> Result<LibraryStatsData, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let total_play_time_s: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total_play_time), 0) FROM games WHERE is_hidden = 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let games_played: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM games WHERE play_count > 0 AND is_hidden = 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let games_unplayed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM games WHERE play_count = 0 AND is_hidden = 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // Use the smart JOIN to find the most-played game so that sessions from
    // removed-and-re-added games are merged under the current game entry.
    let most_played_game: Option<String> = {
        let sql = format!(
            "SELECT g.name, SUM(ps.duration_s) as total
             FROM play_sessions ps
             {GAME_LEFT_JOIN}
             WHERE ps.ended_at IS NOT NULL AND g.id IS NOT NULL AND g.is_hidden = 0
             GROUP BY g.id
             ORDER BY total DESC
             LIMIT 1"
        );
        conn.query_row(&sql, [], |row| row.get(0))
            .optional()
            .map_err(|e| CommandError::Database(e.to_string()))?
    };

    let week_start = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        now - 7 * 24 * 3600
    };
    let week_start_iso = {
        let secs = week_start as i64;
        let days = secs / 86400;
        let rem = secs % 86400;
        let h = rem / 3600;
        let m = (rem % 3600) / 60;
        let s = rem % 60;
        let mut y = 1970i64;
        let mut d = days;
        loop {
            let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
            if d < days_in_year { break; }
            d -= days_in_year;
            y += 1;
        }
        let month_days: [i64; 12] = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
            [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        } else {
            [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        };
        let mut mo = 1i64;
        for &md in &month_days {
            if d < md { break; }
            d -= md;
            mo += 1;
        }
        format!("{y:04}-{mo:02}-{:02}T{h:02}:{m:02}:{s:02}Z", d + 1)
    };

    let weekly_play_time_s: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(duration_s), 0) FROM play_sessions WHERE ended_at IS NOT NULL AND started_at >= ?1",
            params![week_start_iso],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(LibraryStatsData {
        total_play_time_s,
        games_played,
        games_unplayed,
        most_played_game,
        weekly_play_time_s,
    })
}

#[tauri::command]
pub fn get_top_games(db: State<'_, DbState>) -> Result<Vec<TopGameEntry>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    // Aggregate from play_sessions using the smart JOIN so that sessions belonging
    // to removed-and-re-added games (different UUID, same name/source_id) are merged
    // under the current game entry.
    let sql = format!(
        "SELECT g.id, g.name, g.cover_url, SUM(ps.duration_s) as total_play_time_s
         FROM play_sessions ps
         {GAME_LEFT_JOIN}
         WHERE ps.ended_at IS NOT NULL AND g.id IS NOT NULL AND g.is_hidden = 0
         GROUP BY g.id
         ORDER BY total_play_time_s DESC
         LIMIT 10"
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let entries = stmt
        .query_map([], |row| {
            Ok(TopGameEntry {
                id: row.get("id")?,
                name: row.get("name")?,
                cover_url: row.get("cover_url")?,
                total_play_time_s: row.get("total_play_time_s")?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(entries)
}

#[tauri::command]
pub fn update_session_note(
    db: State<'_, DbState>,
    session_id: String,
    note: Option<String>,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM play_sessions WHERE id = ?1)",
            params![session_id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if !exists {
        return Err(CommandError::NotFound(format!("session {session_id}")));
    }

    conn.execute(
        "UPDATE play_sessions SET note = ?1 WHERE id = ?2",
        params![note, session_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn get_all_sessions(db: State<'_, DbState>) -> Result<Vec<SessionEntry>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let sql = format!(
        "SELECT ps.id,
                COALESCE(g.id, ps.game_id) as game_id,
                COALESCE(g.name, ps.game_name, 'Unknown Game') as game_name,
                ps.started_at, ps.ended_at, ps.duration_s, ps.note
         FROM play_sessions ps
         {GAME_LEFT_JOIN}
         WHERE ps.ended_at IS NOT NULL
         ORDER BY ps.started_at DESC"
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let entries = stmt
        .query_map([], |row| {
            Ok(SessionEntry {
                id: row.get("id")?,
                game_id: row.get("game_id")?,
                game_name: row.get("game_name")?,
                started_at: row.get("started_at")?,
                ended_at: row.get("ended_at")?,
                duration_s: row.get::<_, Option<i64>>("duration_s")?.unwrap_or(0),
                note: row.get("note")?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(entries)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortSessionsCount {
    pub sessions_count: i64,
    pub games_affected: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkDeleteResult {
    pub sessions_removed: i64,
    pub games_affected: i64,
}

#[tauri::command]
pub fn count_short_sessions(
    db: State<'_, DbState>,
    threshold_secs: i64,
) -> Result<ShortSessionsCount, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let (sessions_count, games_affected): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COUNT(DISTINCT game_id) FROM play_sessions
             WHERE duration_s IS NOT NULL AND duration_s < ?1 AND ended_at IS NOT NULL",
            params![threshold_secs],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(ShortSessionsCount {
        sessions_count,
        games_affected,
    })
}

#[tauri::command]
pub fn bulk_delete_short_sessions(
    db: State<'_, DbState>,
    threshold_secs: i64,
) -> Result<BulkDeleteResult, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let mut stmt = tx
        .prepare(
            "SELECT DISTINCT game_id FROM play_sessions
             WHERE duration_s IS NOT NULL AND duration_s < ?1 AND ended_at IS NOT NULL",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let affected_game_ids: Vec<String> = stmt
        .query_map(params![threshold_secs], |row| row.get(0))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;
    drop(stmt);

    let sessions_removed = tx
        .execute(
            "DELETE FROM play_sessions
             WHERE duration_s IS NOT NULL AND duration_s < ?1 AND ended_at IS NOT NULL",
            params![threshold_secs],
        )
        .map_err(|e| CommandError::Database(e.to_string()))? as i64;

    let now = now_iso();
    for game_id in &affected_game_ids {
        tx.execute(
            "UPDATE games SET
                total_play_time = COALESCE((SELECT SUM(duration_s) FROM play_sessions WHERE game_id = ?1 AND ended_at IS NOT NULL), 0),
                play_count = (SELECT COUNT(*) FROM play_sessions WHERE game_id = ?1 AND ended_at IS NOT NULL),
                last_played = (SELECT MAX(ended_at) FROM play_sessions WHERE game_id = ?1 AND ended_at IS NOT NULL),
                updated_at = ?2
             WHERE id = ?1",
            params![game_id, now],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    }

    tx.commit()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(BulkDeleteResult {
        sessions_removed,
        games_affected: affected_game_ids.len() as i64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_test_game(conn: &rusqlite::Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) VALUES (?1, ?2, 'steam', 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name],
        ).unwrap();
    }

    fn insert_test_session(
        conn: &rusqlite::Connection,
        id: &str,
        game_id: &str,
        started_at: &str,
        ended_at: Option<&str>,
        duration_s: Option<i64>,
    ) {
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s, tracking) VALUES (?1, ?2, ?3, ?4, ?5, 'auto')",
            params![id, game_id, started_at, ended_at, duration_s],
        ).unwrap();
    }

    // ── create_session ──

    #[test]
    fn create_session_returns_new_session() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        drop(conn);

        let session = create_session_inner(&state, "g1".into()).unwrap();
        assert_eq!(session.game_id, "g1");
        assert!(!session.id.is_empty());
        assert!(!session.started_at.is_empty());
        assert!(session.ended_at.is_none());
        assert!(session.duration_s.is_none());
        assert_eq!(session.tracking, "auto");
    }

    #[test]
    fn create_session_rejects_nonexistent_game() {
        let state = setup_db();
        let result = create_session_inner(&state, "nonexistent".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn create_session_generates_unique_ids() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        drop(conn);

        let s1 = create_session_inner(&state, "g1".into()).unwrap();
        let s2 = create_session_inner(&state, "g1".into()).unwrap();
        assert_ne!(s1.id, s2.id);
    }

    // ── end_session ──

    #[test]
    fn end_session_sets_duration_and_updates_game() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-15T10:00:00Z", None, None);
        drop(conn);

        let session = end_session_inner(
            &state,
            "s1".into(),
            "2026-01-15T11:00:00Z".into(),
        )
        .unwrap();

        assert_eq!(session.ended_at, Some("2026-01-15T11:00:00Z".into()));
        assert_eq!(session.duration_s, Some(3600));

        let conn = state.conn.lock().unwrap();
        let (total_play_time, play_count): (i64, i64) = conn
            .query_row(
                "SELECT total_play_time, play_count FROM games WHERE id = 'g1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(total_play_time, 3600);
        assert_eq!(play_count, 1);

        let last_played: String = conn
            .query_row("SELECT last_played FROM games WHERE id = 'g1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(last_played, "2026-01-15T11:00:00Z");
    }

    #[test]
    fn end_session_not_found() {
        let state = setup_db();
        let result = end_session_inner(&state, "nonexistent".into(), "2026-01-15T11:00:00Z".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn end_session_accumulates_play_time() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-15T10:00:00Z", None, None);
        insert_test_session(&conn, "s2", "g1", "2026-01-16T10:00:00Z", None, None);
        drop(conn);

        end_session_inner(&state, "s1".into(), "2026-01-15T10:30:00Z".into()).unwrap();
        end_session_inner(&state, "s2".into(), "2026-01-16T11:00:00Z".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let total: i64 = conn
            .query_row(
                "SELECT total_play_time FROM games WHERE id = 'g1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(total, 1800 + 3600); // 30min + 60min
    }

    // ── get_play_sessions ──

    #[test]
    fn get_play_sessions_returns_ordered_desc() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s2", "g1", "2026-01-15T10:00:00Z", Some("2026-01-15T11:00:00Z"), Some(3600));
        drop(conn);

        let sessions = get_play_sessions_inner(&state, "g1".into()).unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].id, "s2"); // newer first
        assert_eq!(sessions[1].id, "s1");
    }

    #[test]
    fn get_play_sessions_empty_for_unknown_game() {
        let state = setup_db();
        let sessions = get_play_sessions_inner(&state, "nonexistent".into()).unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn get_play_sessions_only_returns_matching_game() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_game(&conn, "g2", "Game B");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s2", "g2", "2026-01-10T12:00:00Z", Some("2026-01-10T13:00:00Z"), Some(3600));
        drop(conn);

        let sessions = get_play_sessions_inner(&state, "g1".into()).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].game_id, "g1");
    }

    // ── get_play_stats ──

    #[test]
    fn get_play_stats_computes_correctly() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s2", "g1", "2026-01-15T10:00:00Z", Some("2026-01-15T10:30:00Z"), Some(1800));
        insert_test_session(&conn, "s3", "g1", "2026-01-20T10:00:00Z", Some("2026-01-20T12:00:00Z"), Some(7200));
        drop(conn);

        let stats = get_play_stats_inner(&state, "g1".into()).unwrap();
        assert_eq!(stats.game_id, "g1");
        assert_eq!(stats.total_time, 12600); // 3600+1800+7200
        assert_eq!(stats.session_count, 3);
        assert_eq!(stats.average_session, 4200); // 12600/3
        assert_eq!(stats.longest_session, 7200);
        assert_eq!(stats.last_played, Some("2026-01-20T10:00:00Z".into()));
        assert_eq!(stats.first_played, Some("2026-01-10T10:00:00Z".into()));
    }

    #[test]
    fn get_play_stats_excludes_orphaned_sessions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s2", "g1", "2026-01-15T10:00:00Z", None, None); // orphaned
        drop(conn);

        let stats = get_play_stats_inner(&state, "g1".into()).unwrap();
        assert_eq!(stats.session_count, 1);
        assert_eq!(stats.total_time, 3600);
    }

    #[test]
    fn get_play_stats_zero_for_no_sessions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        drop(conn);

        let stats = get_play_stats_inner(&state, "g1".into()).unwrap();
        assert_eq!(stats.total_time, 0);
        assert_eq!(stats.session_count, 0);
        assert_eq!(stats.average_session, 0);
        assert_eq!(stats.longest_session, 0);
        assert!(stats.last_played.is_none());
        assert!(stats.first_played.is_none());
    }

    // ── get_activity_data ──

    #[test]
    fn get_activity_data_daily_buckets() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s2", "g1", "2026-01-10T14:00:00Z", Some("2026-01-10T15:00:00Z"), Some(3600));
        insert_test_session(&conn, "s3", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T10:30:00Z"), Some(1800));
        drop(conn);

        let buckets = get_activity_data_inner(
            &state,
            ActivityParams { period: "daily".into() },
        )
        .unwrap();

        assert_eq!(buckets.len(), 2);
        assert_eq!(buckets[0].period, "2026-01-10");
        assert_eq!(buckets[0].total_time, 7200);
        assert_eq!(buckets[0].session_count, 2);
        assert_eq!(buckets[1].period, "2026-01-11");
        assert_eq!(buckets[1].total_time, 1800);
        assert_eq!(buckets[1].session_count, 1);
    }

    #[test]
    fn get_activity_data_monthly_buckets() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s2", "g1", "2026-02-10T10:00:00Z", Some("2026-02-10T11:00:00Z"), Some(3600));
        drop(conn);

        let buckets = get_activity_data_inner(
            &state,
            ActivityParams { period: "monthly".into() },
        )
        .unwrap();

        assert_eq!(buckets.len(), 2);
        assert_eq!(buckets[0].period, "2026-01");
        assert_eq!(buckets[1].period, "2026-02");
    }

    #[test]
    fn get_activity_data_rejects_invalid_period() {
        let state = setup_db();
        let result = get_activity_data_inner(
            &state,
            ActivityParams { period: "yearly".into() },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("invalid period"));
    }

    #[test]
    fn get_activity_data_excludes_orphaned() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s2", "g1", "2026-01-10T14:00:00Z", None, None); // orphaned
        drop(conn);

        let buckets = get_activity_data_inner(
            &state,
            ActivityParams { period: "daily".into() },
        )
        .unwrap();

        assert_eq!(buckets.len(), 1);
        assert_eq!(buckets[0].session_count, 1);
    }

    // ── get_orphaned_sessions ──

    #[test]
    fn get_orphaned_sessions_finds_null_ended_at() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", None, None);
        insert_test_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s3", "g1", "2026-01-12T10:00:00Z", None, None);
        drop(conn);

        let orphaned = get_orphaned_sessions_inner(&state).unwrap();
        assert_eq!(orphaned.len(), 2);
        assert_eq!(orphaned[0].id, "s3"); // newer first
        assert_eq!(orphaned[1].id, "s1");
    }

    #[test]
    fn get_orphaned_sessions_empty_when_all_ended() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        drop(conn);

        let orphaned = get_orphaned_sessions_inner(&state).unwrap();
        assert!(orphaned.is_empty());
    }

    // ── Test helpers: non-Tauri wrappers ──

    fn create_session_inner(state: &DbState, game_id: String) -> Result<PlaySession, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let (game_name, game_source, game_source_id): (String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT name, source, source_id FROM games WHERE id = ?1",
                params![game_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => CommandError::NotFound(format!("game {game_id}")),
                other => CommandError::Database(other.to_string()),
            })?;

        let id = Uuid::new_v4().to_string();
        let started_at = now_iso();

        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, tracking, game_source, game_source_id, game_name) VALUES (?1, ?2, ?3, 'auto', ?4, ?5, ?6)",
            params![id, game_id, started_at, game_source, game_source_id, game_name],
        ).map_err(|e| CommandError::Database(e.to_string()))?;

        let session = conn
            .query_row("SELECT * FROM play_sessions WHERE id = ?1", params![id], PlaySession::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(session)
    }

    fn end_session_inner(state: &DbState, session_id: String, ended_at: String) -> Result<PlaySession, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let (game_id, started_at): (String, String) = conn
            .query_row(
                "SELECT game_id, started_at FROM play_sessions WHERE id = ?1",
                params![session_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => CommandError::NotFound(format!("session {session_id}")),
                other => CommandError::Database(other.to_string()),
            })?;

        let start_epoch = iso_to_epoch_secs(&started_at).map_err(CommandError::Parse)?;
        let end_epoch = iso_to_epoch_secs(&ended_at).map_err(CommandError::Parse)?;
        let duration_s = (end_epoch - start_epoch).max(0);

        let tx = conn.unchecked_transaction().map_err(|e| CommandError::Database(e.to_string()))?;

        tx.execute(
            "UPDATE play_sessions SET ended_at = ?1, duration_s = ?2 WHERE id = ?3",
            params![ended_at, duration_s, session_id],
        ).map_err(|e| CommandError::Database(e.to_string()))?;

        let now = now_iso();
        tx.execute(
            "UPDATE games SET total_play_time = total_play_time + ?1, last_played = ?2, play_count = play_count + 1, updated_at = ?3 WHERE id = ?4",
            params![duration_s, ended_at, now, game_id],
        ).map_err(|e| CommandError::Database(e.to_string()))?;

        tx.commit().map_err(|e| CommandError::Database(e.to_string()))?;

        let session = conn
            .query_row("SELECT * FROM play_sessions WHERE id = ?1", params![session_id], PlaySession::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(session)
    }

    fn get_play_sessions_inner(state: &DbState, game_id: String) -> Result<Vec<PlaySession>, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let mut stmt = conn
            .prepare("SELECT * FROM play_sessions WHERE game_id = ?1 ORDER BY started_at DESC")
            .map_err(|e| CommandError::Database(e.to_string()))?;
        let sessions = stmt
            .query_map(params![game_id], PlaySession::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(sessions)
    }

    fn get_play_stats_inner(state: &DbState, game_id: String) -> Result<PlayStats, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let stats = conn
            .query_row(
                "SELECT
                    COALESCE(SUM(duration_s), 0) as total_time,
                    COUNT(*) as session_count,
                    CAST(COALESCE(AVG(duration_s), 0) AS INTEGER) as avg_session,
                    COALESCE(MAX(duration_s), 0) as longest_session,
                    MAX(started_at) as last_played,
                    MIN(started_at) as first_played
                 FROM play_sessions
                 WHERE game_id = ?1 AND ended_at IS NOT NULL",
                params![game_id],
                |row| {
                    Ok(PlayStats {
                        game_id: game_id.clone(),
                        total_time: row.get("total_time")?,
                        session_count: row.get("session_count")?,
                        average_session: row.get("avg_session")?,
                        longest_session: row.get("longest_session")?,
                        last_played: row.get("last_played")?,
                        first_played: row.get("first_played")?,
                    })
                },
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(stats)
    }

    fn get_activity_data_inner(state: &DbState, params: ActivityParams) -> Result<Vec<ActivityBucket>, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let date_format = match params.period.as_str() {
            "daily" => "%Y-%m-%d",
            "weekly" => "%Y-W%W",
            "monthly" => "%Y-%m",
            other => return Err(CommandError::Parse(format!("invalid period: {other}, expected daily|weekly|monthly"))),
        };

        let sql = format!(
            "SELECT
                strftime('{date_format}', started_at) as period,
                COALESCE(SUM(duration_s), 0) as total_time,
                COUNT(*) as session_count
             FROM play_sessions
             WHERE ended_at IS NOT NULL
             GROUP BY period
             ORDER BY period ASC"
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| CommandError::Database(e.to_string()))?;
        let buckets = stmt
            .query_map([], |row| {
                Ok(ActivityBucket {
                    period: row.get("period")?,
                    total_time: row.get("total_time")?,
                    session_count: row.get("session_count")?,
                })
            })
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(buckets)
    }

    fn get_orphaned_sessions_inner(state: &DbState) -> Result<Vec<PlaySession>, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let mut stmt = conn
            .prepare("SELECT * FROM play_sessions WHERE ended_at IS NULL ORDER BY started_at DESC")
            .map_err(|e| CommandError::Database(e.to_string()))?;
        let sessions = stmt
            .query_map([], PlaySession::from_row)
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(sessions)
    }

    fn insert_test_game_with_source(
        conn: &rusqlite::Connection,
        id: &str,
        name: &str,
        source: &str,
        source_id: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO games (id, name, source, source_id, status, added_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name, source, source_id],
        ).unwrap();
    }

    fn insert_session_with_source(
        conn: &rusqlite::Connection,
        id: &str,
        game_id: &str,
        started_at: &str,
        ended_at: &str,
        duration_s: i64,
        game_source: &str,
        game_source_id: Option<&str>,
        game_name: &str,
    ) {
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s, tracking, game_source, game_source_id, game_name) VALUES (?1, ?2, ?3, ?4, ?5, 'auto', ?6, ?7, ?8)",
            params![id, game_id, started_at, ended_at, duration_s, game_source, game_source_id, game_name],
        ).unwrap();
    }

    fn get_all_sessions_inner(state: &DbState) -> Result<Vec<SessionEntry>, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let sql = format!(
            "SELECT ps.id,
                    COALESCE(g.id, ps.game_id) as game_id,
                    COALESCE(g.name, ps.game_name, 'Unknown Game') as game_name,
                    ps.started_at, ps.ended_at, ps.duration_s, ps.note
             FROM play_sessions ps
             {GAME_LEFT_JOIN}
             WHERE ps.ended_at IS NOT NULL
             ORDER BY ps.started_at DESC"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| CommandError::Database(e.to_string()))?;
        let entries = stmt
            .query_map([], |row| {
                Ok(SessionEntry {
                    id: row.get("id")?,
                    game_id: row.get("game_id")?,
                    game_name: row.get("game_name")?,
                    started_at: row.get("started_at")?,
                    ended_at: row.get("ended_at")?,
                    duration_s: row.get::<_, Option<i64>>("duration_s")?.unwrap_or(0),
                    note: row.get("note")?,
                })
            })
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(entries)
    }

    fn get_top_games_inner(state: &DbState) -> Result<Vec<TopGameEntry>, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let sql = format!(
            "SELECT g.id, g.name, g.cover_url, SUM(ps.duration_s) as total_play_time_s
             FROM play_sessions ps
             {GAME_LEFT_JOIN}
             WHERE ps.ended_at IS NOT NULL AND g.id IS NOT NULL AND g.is_hidden = 0
             GROUP BY g.id
             ORDER BY total_play_time_s DESC
             LIMIT 10"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| CommandError::Database(e.to_string()))?;
        let entries = stmt
            .query_map([], |row| {
                Ok(TopGameEntry {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    cover_url: row.get("cover_url")?,
                    total_play_time_s: row.get("total_play_time_s")?,
                })
            })
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(entries)
    }

    // ── re-added game merging (source_id strategy) ──

    #[test]
    fn get_all_sessions_merges_relinked_game_via_source_id() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        // Old game UUID (deleted) — sessions still reference it
        insert_test_game_with_source(&conn, "old-uuid", "Half-Life 2", "steam", Some("220"));
        // New game UUID (re-added) with same steam source_id
        insert_test_game_with_source(&conn, "new-uuid", "Half-Life 2", "steam", Some("220"));
        // Session recorded against old UUID, but stores game_source + game_source_id
        insert_session_with_source(&conn, "s1", "old-uuid", "2026-01-10T10:00:00Z", "2026-01-10T11:00:00Z", 3600, "steam", Some("220"), "Half-Life 2");
        // Session recorded against new UUID
        insert_session_with_source(&conn, "s2", "new-uuid", "2026-02-10T10:00:00Z", "2026-02-10T11:00:00Z", 1800, "steam", Some("220"), "Half-Life 2");
        // Remove old game to simulate it being deleted and re-added (FK off to allow orphaned sessions)
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn.execute("DELETE FROM games WHERE id = 'old-uuid'", []).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        drop(conn);

        let sessions = get_all_sessions_inner(&state).unwrap();
        // Both sessions should resolve to new-uuid
        assert_eq!(sessions.len(), 2);
        assert!(sessions.iter().all(|s| s.game_id == "new-uuid"), "all sessions should resolve to new-uuid");
    }

    #[test]
    fn get_top_games_merges_relinked_game_via_source_id() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game_with_source(&conn, "old-uuid", "Half-Life 2", "steam", Some("220"));
        insert_test_game_with_source(&conn, "new-uuid", "Half-Life 2", "steam", Some("220"));
        insert_session_with_source(&conn, "s1", "old-uuid", "2026-01-10T10:00:00Z", "2026-01-10T11:00:00Z", 3600, "steam", Some("220"), "Half-Life 2");
        insert_session_with_source(&conn, "s2", "new-uuid", "2026-02-10T10:00:00Z", "2026-02-10T11:00:00Z", 1800, "steam", Some("220"), "Half-Life 2");
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn.execute("DELETE FROM games WHERE id = 'old-uuid'", []).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        drop(conn);

        let top = get_top_games_inner(&state).unwrap();
        assert_eq!(top.len(), 1);
        assert_eq!(top[0].id, "new-uuid");
        assert_eq!(top[0].total_play_time_s, 5400); // 3600 + 1800 merged
    }

    // ── re-added game merging (name fallback strategy for standalone games) ──

    #[test]
    fn get_all_sessions_merges_standalone_game_via_name() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game_with_source(&conn, "old-uuid", "My Indie Game", "manual", None);
        insert_test_game_with_source(&conn, "new-uuid", "My Indie Game", "manual", None);
        insert_session_with_source(&conn, "s1", "old-uuid", "2026-01-10T10:00:00Z", "2026-01-10T11:00:00Z", 3600, "manual", None, "My Indie Game");
        insert_session_with_source(&conn, "s2", "new-uuid", "2026-02-10T10:00:00Z", "2026-02-10T11:00:00Z", 1800, "manual", None, "My Indie Game");
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn.execute("DELETE FROM games WHERE id = 'old-uuid'", []).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        drop(conn);

        let sessions = get_all_sessions_inner(&state).unwrap();
        assert_eq!(sessions.len(), 2);
        assert!(sessions.iter().all(|s| s.game_id == "new-uuid"), "all sessions should resolve to new-uuid via name fallback");
    }

    #[test]
    fn get_top_games_merges_standalone_game_via_name() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game_with_source(&conn, "old-uuid", "My Indie Game", "manual", None);
        insert_test_game_with_source(&conn, "new-uuid", "My Indie Game", "manual", None);
        insert_session_with_source(&conn, "s1", "old-uuid", "2026-01-10T10:00:00Z", "2026-01-10T11:00:00Z", 7200, "manual", None, "My Indie Game");
        insert_session_with_source(&conn, "s2", "new-uuid", "2026-02-10T10:00:00Z", "2026-02-10T11:00:00Z", 3600, "manual", None, "My Indie Game");
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn.execute("DELETE FROM games WHERE id = 'old-uuid'", []).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        drop(conn);

        let top = get_top_games_inner(&state).unwrap();
        assert_eq!(top.len(), 1);
        assert_eq!(top[0].id, "new-uuid");
        assert_eq!(top[0].total_play_time_s, 10800); // 7200 + 3600 merged
    }

    // ── update_session_note ──

    fn update_session_note_inner(state: &DbState, session_id: String, note: Option<String>) -> Result<(), CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM play_sessions WHERE id = ?1)",
                params![session_id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if !exists {
            return Err(CommandError::NotFound(format!("session {session_id}")));
        }

        conn.execute(
            "UPDATE play_sessions SET note = ?1 WHERE id = ?2",
            params![note, session_id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        Ok(())
    }

    #[test]
    fn update_session_note_persists() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        drop(conn);

        update_session_note_inner(&state, "s1".into(), Some("Beat the boss".into())).unwrap();

        let conn = state.conn.lock().unwrap();
        let note: Option<String> = conn
            .query_row("SELECT note FROM play_sessions WHERE id = 's1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(note, Some("Beat the boss".into()));
    }

    #[test]
    fn update_session_note_clears_with_none() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        drop(conn);

        update_session_note_inner(&state, "s1".into(), Some("A note".into())).unwrap();
        update_session_note_inner(&state, "s1".into(), None).unwrap();

        let conn = state.conn.lock().unwrap();
        let note: Option<String> = conn
            .query_row("SELECT note FROM play_sessions WHERE id = 's1'", [], |row| row.get(0))
            .unwrap();
        assert!(note.is_none());
    }

    #[test]
    fn update_session_note_not_found() {
        let state = setup_db();
        let result = update_session_note_inner(&state, "nonexistent".into(), Some("note".into()));
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn get_play_sessions_returns_note() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        conn.execute("UPDATE play_sessions SET note = 'My note' WHERE id = 's1'", []).unwrap();
        drop(conn);

        let sessions = get_play_sessions_inner(&state, "g1".into()).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].note, Some("My note".into()));
    }

    #[test]
    fn get_all_sessions_returns_note() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Test Game");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        conn.execute("UPDATE play_sessions SET note = 'Session note' WHERE id = 's1'", []).unwrap();
        drop(conn);

        let sessions = get_all_sessions_inner(&state).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].note, Some("Session note".into()));
    }

    // ── count_short_sessions / bulk_delete_short_sessions helpers ──

    fn count_short_sessions_inner(state: &DbState, threshold_secs: i64) -> Result<ShortSessionsCount, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let (sessions_count, games_affected): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), COUNT(DISTINCT game_id) FROM play_sessions
                 WHERE duration_s IS NOT NULL AND duration_s < ?1 AND ended_at IS NOT NULL",
                params![threshold_secs],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(ShortSessionsCount { sessions_count, games_affected })
    }

    fn bulk_delete_short_sessions_inner(state: &DbState, threshold_secs: i64) -> Result<BulkDeleteResult, CommandError> {
        let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let tx = conn.unchecked_transaction().map_err(|e| CommandError::Database(e.to_string()))?;

        let mut stmt = tx
            .prepare(
                "SELECT DISTINCT game_id FROM play_sessions
                 WHERE duration_s IS NOT NULL AND duration_s < ?1 AND ended_at IS NOT NULL",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;
        let affected_game_ids: Vec<String> = stmt
            .query_map(params![threshold_secs], |row| row.get(0))
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;
        drop(stmt);

        let sessions_removed = tx
            .execute(
                "DELETE FROM play_sessions
                 WHERE duration_s IS NOT NULL AND duration_s < ?1 AND ended_at IS NOT NULL",
                params![threshold_secs],
            )
            .map_err(|e| CommandError::Database(e.to_string()))? as i64;

        let now = now_iso();
        for game_id in &affected_game_ids {
            tx.execute(
                "UPDATE games SET
                    total_play_time = COALESCE((SELECT SUM(duration_s) FROM play_sessions WHERE game_id = ?1 AND ended_at IS NOT NULL), 0),
                    play_count = (SELECT COUNT(*) FROM play_sessions WHERE game_id = ?1 AND ended_at IS NOT NULL),
                    last_played = (SELECT MAX(ended_at) FROM play_sessions WHERE game_id = ?1 AND ended_at IS NOT NULL),
                    updated_at = ?2
                 WHERE id = ?1",
                params![game_id, now],
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;
        }

        tx.commit().map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(BulkDeleteResult { sessions_removed, games_affected: affected_game_ids.len() as i64 })
    }

    // ── count_short_sessions ──

    #[test]
    fn count_short_sessions_with_mixed_durations() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_game(&conn, "g2", "Game B");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T10:00:30Z"), Some(30));
        insert_test_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s3", "g2", "2026-01-12T10:00:00Z", Some("2026-01-12T10:00:45Z"), Some(45));
        insert_test_session(&conn, "s4", "g2", "2026-01-13T10:00:00Z", Some("2026-01-13T10:02:00Z"), Some(120));
        drop(conn);

        let result = count_short_sessions_inner(&state, 60).unwrap();
        assert_eq!(result.sessions_count, 2); // s1 (30s) and s3 (45s)
        assert_eq!(result.games_affected, 2); // g1 and g2
    }

    #[test]
    fn count_short_sessions_excludes_orphaned() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", None, None); // orphaned, no ended_at
        insert_test_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T10:00:10Z"), Some(10));
        drop(conn);

        let result = count_short_sessions_inner(&state, 60).unwrap();
        assert_eq!(result.sessions_count, 1); // only s2
        assert_eq!(result.games_affected, 1);
    }

    #[test]
    fn count_short_sessions_zero_when_none_match() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        drop(conn);

        let result = count_short_sessions_inner(&state, 60).unwrap();
        assert_eq!(result.sessions_count, 0);
        assert_eq!(result.games_affected, 0);
    }

    // ── bulk_delete_short_sessions ──

    #[test]
    fn bulk_delete_removes_only_short_sessions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T10:00:30Z"), Some(30));
        insert_test_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T11:00:00Z"), Some(3600));
        conn.execute(
            "UPDATE games SET total_play_time = 3630, play_count = 2, last_played = '2026-01-11T11:00:00Z' WHERE id = 'g1'",
            [],
        ).unwrap();
        drop(conn);

        let result = bulk_delete_short_sessions_inner(&state, 60).unwrap();
        assert_eq!(result.sessions_removed, 1);
        assert_eq!(result.games_affected, 1);

        let conn = state.conn.lock().unwrap();
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM play_sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 1);

        let (total_play_time, play_count): (i64, i64) = conn
            .query_row(
                "SELECT total_play_time, play_count FROM games WHERE id = 'g1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(total_play_time, 3600);
        assert_eq!(play_count, 1);
    }

    #[test]
    fn bulk_delete_recomputes_last_played() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s2", "g1", "2026-01-15T10:00:00Z", Some("2026-01-15T10:00:05Z"), Some(5));
        conn.execute(
            "UPDATE games SET total_play_time = 3605, play_count = 2, last_played = '2026-01-15T10:00:05Z' WHERE id = 'g1'",
            [],
        ).unwrap();
        drop(conn);

        bulk_delete_short_sessions_inner(&state, 60).unwrap();

        let conn = state.conn.lock().unwrap();
        let last_played: String = conn
            .query_row("SELECT last_played FROM games WHERE id = 'g1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(last_played, "2026-01-10T11:00:00Z");
    }

    #[test]
    fn bulk_delete_sets_null_when_all_sessions_removed() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T10:00:05Z"), Some(5));
        insert_test_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T10:00:10Z"), Some(10));
        conn.execute(
            "UPDATE games SET total_play_time = 15, play_count = 2, last_played = '2026-01-11T10:00:10Z' WHERE id = 'g1'",
            [],
        ).unwrap();
        drop(conn);

        let result = bulk_delete_short_sessions_inner(&state, 60).unwrap();
        assert_eq!(result.sessions_removed, 2);

        let conn = state.conn.lock().unwrap();
        let (total_play_time, play_count): (i64, i64) = conn
            .query_row(
                "SELECT total_play_time, play_count FROM games WHERE id = 'g1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(total_play_time, 0);
        assert_eq!(play_count, 0);

        let last_played: Option<String> = conn
            .query_row("SELECT last_played FROM games WHERE id = 'g1'", [], |row| row.get(0))
            .unwrap();
        assert!(last_played.is_none());
    }

    #[test]
    fn bulk_delete_noop_when_no_sessions_match() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        drop(conn);

        let result = bulk_delete_short_sessions_inner(&state, 60).unwrap();
        assert_eq!(result.sessions_removed, 0);
        assert_eq!(result.games_affected, 0);
    }

    #[test]
    fn bulk_delete_skips_orphaned_sessions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", None, None); // orphaned
        insert_test_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T10:00:10Z"), Some(10));
        drop(conn);

        let result = bulk_delete_short_sessions_inner(&state, 60).unwrap();
        assert_eq!(result.sessions_removed, 1); // only s2

        let conn = state.conn.lock().unwrap();
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM play_sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 1); // orphaned s1 still exists
    }

    #[test]
    fn bulk_delete_handles_multiple_games() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_test_game(&conn, "g1", "Game A");
        insert_test_game(&conn, "g2", "Game B");
        insert_test_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T10:00:20Z"), Some(20));
        insert_test_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T11:00:00Z"), Some(3600));
        insert_test_session(&conn, "s3", "g2", "2026-01-12T10:00:00Z", Some("2026-01-12T10:00:15Z"), Some(15));
        insert_test_session(&conn, "s4", "g2", "2026-01-13T10:00:00Z", Some("2026-01-13T10:30:00Z"), Some(1800));
        conn.execute("UPDATE games SET total_play_time = 3620, play_count = 2, last_played = '2026-01-11T11:00:00Z' WHERE id = 'g1'", []).unwrap();
        conn.execute("UPDATE games SET total_play_time = 1815, play_count = 2, last_played = '2026-01-13T10:30:00Z' WHERE id = 'g2'", []).unwrap();
        drop(conn);

        let result = bulk_delete_short_sessions_inner(&state, 60).unwrap();
        assert_eq!(result.sessions_removed, 2);
        assert_eq!(result.games_affected, 2);

        let conn = state.conn.lock().unwrap();
        let (g1_time, g1_count): (i64, i64) = conn
            .query_row("SELECT total_play_time, play_count FROM games WHERE id = 'g1'", [], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap();
        assert_eq!(g1_time, 3600);
        assert_eq!(g1_count, 1);

        let (g2_time, g2_count): (i64, i64) = conn
            .query_row("SELECT total_play_time, play_count FROM games WHERE id = 'g2'", [], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap();
        assert_eq!(g2_time, 1800);
        assert_eq!(g2_count, 1);
    }
}
