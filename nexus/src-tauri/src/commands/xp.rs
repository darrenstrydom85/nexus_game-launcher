use rusqlite::{params, Connection};
use tauri::State;

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;
use crate::models::xp::{
    build_xp_summary, calculate_level, XpBreakdownRow, XpEvent, XpSummary,
};

// ── Helpers ──────────────────────────────────────────────────────────

fn get_total_xp(conn: &Connection) -> Result<i64, CommandError> {
    conn.query_row(
        "SELECT COALESCE(SUM(xp_amount), 0) FROM xp_events",
        [],
        |row| row.get(0),
    )
    .map_err(|e| CommandError::Database(e.to_string()))
}

// ── Commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_xp_summary(db: State<'_, DbState>) -> Result<XpSummary, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let total_xp = get_total_xp(&conn)?;
    Ok(build_xp_summary(total_xp))
}

#[tauri::command]
pub fn get_xp_history(
    db: State<'_, DbState>,
    limit: Option<i64>,
) -> Result<Vec<XpEvent>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    get_xp_history_inner(&conn, limit)
}

fn get_xp_history_inner(
    conn: &Connection,
    limit: Option<i64>,
) -> Result<Vec<XpEvent>, CommandError> {
    let limit = limit.unwrap_or(50).max(1);
    let mut stmt = conn
        .prepare(
            "SELECT id, source, source_id, xp_amount, description, created_at
             FROM xp_events ORDER BY created_at DESC, rowid DESC LIMIT ?1",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let events = stmt
        .query_map(params![limit], XpEvent::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(events)
}

#[tauri::command]
pub fn get_xp_breakdown(db: State<'_, DbState>) -> Result<Vec<XpBreakdownRow>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    get_xp_breakdown_inner(&conn)
}

fn get_xp_breakdown_inner(conn: &Connection) -> Result<Vec<XpBreakdownRow>, CommandError> {
    let mut stmt = conn
        .prepare(
            "SELECT source, SUM(xp_amount) as total_xp, COUNT(*) as event_count
             FROM xp_events GROUP BY source ORDER BY total_xp DESC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(XpBreakdownRow {
                source_type: row.get(0)?,
                total_xp: row.get(1)?,
                event_count: row.get(2)?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(rows)
}

/// Awards XP for an activity. Deduplicates via source + source_id.
/// Returns the updated XP summary with level-up detection.
#[tauri::command]
pub fn award_xp(
    db: State<'_, DbState>,
    source: String,
    source_id: Option<String>,
    xp_amount: i64,
    description: String,
) -> Result<XpSummary, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    award_xp_inner(&conn, &source, source_id.as_deref(), xp_amount, &description)
}

/// Inner implementation callable without State wrapper.
pub fn award_xp_inner(
    conn: &Connection,
    source: &str,
    source_id: Option<&str>,
    xp_amount: i64,
    description: &str,
) -> Result<XpSummary, CommandError> {
    let old_total = get_total_xp(conn)?;
    let (old_level, _, _, _) = calculate_level(old_total);

    if let Some(sid) = source_id {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM xp_events WHERE source = ?1 AND source_id = ?2",
                params![source, sid],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        if exists {
            return Ok(build_xp_summary(old_total));
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO xp_events (id, source, source_id, xp_amount, description, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, source, source_id, xp_amount, description, now],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    let new_total = get_total_xp(conn)?;
    let (new_level, current_level_xp, next_level_xp, progress) = calculate_level(new_total);

    let leveled_up = new_level > old_level;

    Ok(XpSummary {
        total_xp: new_total,
        current_level: new_level,
        current_level_xp,
        next_level_xp,
        progress_to_next_level: progress,
        leveled_up,
        new_level: if leveled_up { Some(new_level) } else { None },
    })
}

/// One-time retroactive XP grant for existing play data.
/// Safe to call multiple times — uses award_xp deduplication.
#[tauri::command]
pub fn backfill_xp_from_history(db: State<'_, DbState>) -> Result<XpSummary, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    backfill_xp_inner(&conn)
}

pub fn backfill_xp_inner(conn: &Connection) -> Result<XpSummary, CommandError> {
    // Session XP: 10 + floor(duration_s / 600) for each qualifying session
    let mut stmt = conn
        .prepare(
            "SELECT id, game_id, duration_s FROM play_sessions
             WHERE ended_at IS NOT NULL AND duration_s >= 30",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let sessions: Vec<(String, String, i64)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let game_names: std::collections::HashMap<String, String> = {
        let mut stmt = conn
            .prepare("SELECT id, name FROM games")
            .map_err(|e| CommandError::Database(e.to_string()))?;
        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| CommandError::Database(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();
        rows.into_iter().collect()
    };

    for (session_id, game_id, duration_s) in &sessions {
        let xp = 10 + duration_s / 600;
        let game_name = game_names
            .get(game_id)
            .map(String::as_str)
            .unwrap_or("Unknown");
        let mins = duration_s / 60;
        let desc = format!("Completed {mins}-minute session of {game_name} (+{xp} XP)");

        let _ = award_xp_inner(
            conn,
            crate::models::xp::sources::SESSION_COMPLETE,
            Some(session_id),
            xp,
            &desc,
        );

        if *duration_s >= 3600 {
            let bonus_desc =
                format!("1-hour session bonus for {game_name} (+15 XP)");
            let _ = award_xp_inner(
                conn,
                crate::models::xp::sources::SESSION_BONUS_1H,
                Some(session_id),
                15,
                &bonus_desc,
            );
        }
    }

    // Game completion XP: 100 XP per completed game
    let completed_games: Vec<(String, String)> = conn
        .prepare("SELECT id, name FROM games WHERE completed = 1")
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    for (game_id, game_name) in &completed_games {
        let desc = format!("Completed {game_name} (+100 XP)");
        let _ = award_xp_inner(
            conn,
            crate::models::xp::sources::GAME_COMPLETE,
            Some(game_id),
            100,
            &desc,
        );
    }

    // Achievement XP: points value per unlocked achievement
    let unlocked_achievements: Vec<(String,)> = conn
        .prepare("SELECT id FROM achievements")
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map([], |row| Ok((row.get(0)?,)))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let definitions = super::achievements::ACHIEVEMENT_DEFINITIONS;
    for (ach_id,) in &unlocked_achievements {
        if let Some(def) = definitions.iter().find(|d| d.id == ach_id) {
            let xp = def.points as i64;
            let desc = format!("Unlocked '{}' achievement (+{xp} XP)", def.name);
            let _ = award_xp_inner(
                conn,
                crate::models::xp::sources::ACHIEVEMENT_UNLOCK,
                Some(ach_id),
                xp,
                &desc,
            );
        }
    }

    let total_xp = get_total_xp(conn)?;
    Ok(build_xp_summary(total_xp))
}

/// Checks if backfill should run: xp_events table has 0 rows AND play_sessions has rows.
pub fn should_run_backfill(conn: &Connection) -> bool {
    let xp_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM xp_events", [], |row| row.get(0))
        .unwrap_or(0);
    if xp_count > 0 {
        return false;
    }
    let session_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM play_sessions", [], |row| row.get(0))
        .unwrap_or(0);
    session_count > 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::models::xp::sources;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_pending(&conn).unwrap();
        conn
    }

    fn insert_game(conn: &Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, added_at, updated_at)
             VALUES (?1, ?2, 'manual', '2026-01-01', '2026-01-01')",
            params![id, name],
        )
        .unwrap();
    }

    fn insert_session(conn: &Connection, id: &str, game_id: &str, duration_s: i64) {
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s)
             VALUES (?1, ?2, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', ?3)",
            params![id, game_id, duration_s],
        )
        .unwrap();
    }

    #[test]
    fn award_xp_creates_event_and_returns_summary() {
        let conn = setup_db();
        let summary = award_xp_inner(&conn, "test", Some("t1"), 50, "test award").unwrap();
        assert_eq!(summary.total_xp, 50);
        assert_eq!(summary.current_level, 0);
    }

    #[test]
    fn award_xp_deduplication() {
        let conn = setup_db();
        award_xp_inner(&conn, "test", Some("t1"), 50, "first").unwrap();
        let summary = award_xp_inner(&conn, "test", Some("t1"), 50, "duplicate").unwrap();
        assert_eq!(summary.total_xp, 50);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM xp_events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn award_xp_without_source_id_always_inserts() {
        let conn = setup_db();
        award_xp_inner(&conn, "test", None, 50, "first").unwrap();
        let summary = award_xp_inner(&conn, "test", None, 50, "second").unwrap();
        assert_eq!(summary.total_xp, 100);
    }

    #[test]
    fn get_xp_history_returns_desc_order() {
        let conn = setup_db();
        award_xp_inner(&conn, "test", Some("a"), 10, "first").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        award_xp_inner(&conn, "test", Some("b"), 20, "second").unwrap();

        let history = get_xp_history_inner(&conn, Some(50)).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].description, "second");
        assert_eq!(history[1].description, "first");
    }

    #[test]
    fn get_xp_history_respects_limit() {
        let conn = setup_db();
        for i in 0..10 {
            award_xp_inner(&conn, "test", Some(&format!("x{i}")), 10, &format!("ev{i}"))
                .unwrap();
        }
        let history = get_xp_history_inner(&conn, Some(3)).unwrap();
        assert_eq!(history.len(), 3);
    }

    #[test]
    fn level_up_detected() {
        let conn = setup_db();
        award_xp_inner(&conn, "test", Some("a"), 90, "almost").unwrap();
        let summary = award_xp_inner(&conn, "test", Some("b"), 20, "level up!").unwrap();
        assert!(summary.leveled_up);
        assert_eq!(summary.new_level, Some(1));
        assert_eq!(summary.current_level, 1);
    }

    #[test]
    fn no_level_up_when_same_level() {
        let conn = setup_db();
        let summary = award_xp_inner(&conn, "test", Some("a"), 50, "half").unwrap();
        assert!(!summary.leveled_up);
        assert_eq!(summary.new_level, None);
    }

    #[test]
    fn backfill_sessions() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Elden Ring");
        insert_session(&conn, "s1", "g1", 5400); // 90 min → 10 + 9 = 19 XP + 15 bonus (>= 1h)
        insert_session(&conn, "s2", "g1", 3600); // 60 min → 10 + 6 = 16 XP + 15 bonus (>= 1h)

        let summary = backfill_xp_inner(&conn).unwrap();
        // s1: 19 + 15 = 34 XP, s2: 16 + 15 = 31 XP, total = 65
        assert_eq!(summary.total_xp, 65);
    }

    #[test]
    fn backfill_completed_games() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Elden Ring");
        conn.execute(
            "UPDATE games SET completed = 1 WHERE id = 'g1'",
            [],
        )
        .unwrap();

        let summary = backfill_xp_inner(&conn).unwrap();
        assert_eq!(summary.total_xp, 100);
    }

    #[test]
    fn backfill_idempotent() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Test Game");
        insert_session(&conn, "s1", "g1", 1800);

        let first = backfill_xp_inner(&conn).unwrap();
        let second = backfill_xp_inner(&conn).unwrap();
        assert_eq!(first.total_xp, second.total_xp);
    }

    #[test]
    fn should_run_backfill_empty_xp_with_sessions() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Test");
        insert_session(&conn, "s1", "g1", 60);
        assert!(should_run_backfill(&conn));
    }

    #[test]
    fn should_not_run_backfill_when_xp_exists() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Test");
        insert_session(&conn, "s1", "g1", 60);
        award_xp_inner(&conn, "test", Some("x"), 10, "existing").unwrap();
        assert!(!should_run_backfill(&conn));
    }

    #[test]
    fn should_not_run_backfill_no_sessions() {
        let conn = setup_db();
        assert!(!should_run_backfill(&conn));
    }

    #[test]
    fn xp_breakdown_groups_by_source() {
        let conn = setup_db();
        award_xp_inner(&conn, sources::SESSION_COMPLETE, Some("s1"), 20, "s1").unwrap();
        award_xp_inner(&conn, sources::SESSION_COMPLETE, Some("s2"), 30, "s2").unwrap();
        award_xp_inner(&conn, sources::GAME_COMPLETE, Some("g1"), 100, "g1").unwrap();

        let breakdown = get_xp_breakdown_inner(&conn).unwrap();
        assert_eq!(breakdown.len(), 2);

        let game_row = breakdown.iter().find(|r| r.source_type == sources::GAME_COMPLETE).unwrap();
        assert_eq!(game_row.total_xp, 100);
        assert_eq!(game_row.event_count, 1);

        let session_row = breakdown.iter().find(|r| r.source_type == sources::SESSION_COMPLETE).unwrap();
        assert_eq!(session_row.total_xp, 50);
        assert_eq!(session_row.event_count, 2);
    }
}
