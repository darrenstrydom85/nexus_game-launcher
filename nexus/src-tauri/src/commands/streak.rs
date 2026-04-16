use rusqlite::params;
use tauri::State;

use super::error::CommandError;
use super::utils::{date_only_to_start_epoch_secs, now_iso, today_date};

#[cfg(test)]
use super::utils::epoch_secs_to_iso_date;
use crate::db::DbState;
use crate::models::StreakSnapshot;

const SESSION_FILTER: &str = "ended_at IS NOT NULL AND duration_s >= 30";

/// Grace period in hours — a streak survives if the gap between the last
/// qualifying session's calendar day and today is at most this many hours
/// measured from end-of-day. In practice with calendar-day granularity this
/// means: played on day D → streak alive through day D+1 → breaks on day D+2.
const STREAK_GRACE_DAYS: i64 = 1;

#[tauri::command]
pub fn get_streak(db: State<'_, DbState>) -> Result<StreakSnapshot, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    conn.query_row(
        "SELECT id, current_streak, longest_streak, last_play_date, streak_started_at, updated_at
         FROM streak_snapshots WHERE id = 'singleton'",
        [],
        StreakSnapshot::from_row,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            CommandError::NotFound("streak snapshot not found".to_string())
        }
        other => CommandError::Database(other.to_string()),
    })
}

#[tauri::command]
pub fn recalculate_streak(db: State<'_, DbState>) -> Result<StreakSnapshot, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let snapshot = recalculate_streak_inner(&conn)?;
    Ok(snapshot)
}

/// Core streak recalculation — separated from the Tauri command so it can be
/// called from `end_session` and app startup without needing a `State` wrapper.
pub fn recalculate_streak_inner(
    conn: &rusqlite::Connection,
) -> Result<StreakSnapshot, CommandError> {
    let distinct_dates: Vec<String> = conn
        .prepare(&format!(
            "SELECT DISTINCT date(started_at) as d FROM play_sessions
             WHERE {SESSION_FILTER} ORDER BY d DESC"
        ))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let today = today_date();
    let today_epoch = date_only_to_start_epoch_secs(&today).unwrap_or(0);

    let (current_streak, streak_started_at, last_play_date) =
        compute_current_streak(&distinct_dates, today_epoch);

    let longest_from_history = compute_longest_streak_all(&distinct_dates);

    let prev_longest: i64 = conn
        .query_row(
            "SELECT longest_streak FROM streak_snapshots WHERE id = 'singleton'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let longest_streak = prev_longest
        .max(longest_from_history)
        .max(current_streak);

    let now = now_iso();

    conn.execute(
        "INSERT OR REPLACE INTO streak_snapshots
         (id, current_streak, longest_streak, last_play_date, streak_started_at, updated_at)
         VALUES ('singleton', ?1, ?2, ?3, ?4, ?5)",
        params![
            current_streak,
            longest_streak,
            last_play_date,
            streak_started_at,
            now,
        ],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;

    conn.query_row(
        "SELECT id, current_streak, longest_streak, last_play_date, streak_started_at, updated_at
         FROM streak_snapshots WHERE id = 'singleton'",
        [],
        StreakSnapshot::from_row,
    )
    .map_err(|e| CommandError::Database(e.to_string()))
}

/// Walk backwards from today to compute the current active streak.
/// `dates` must be sorted descending (most recent first).
/// Returns (current_streak, streak_started_at, last_play_date).
fn compute_current_streak(
    dates: &[String],
    today_epoch: i64,
) -> (i64, Option<String>, Option<String>) {
    if dates.is_empty() {
        return (0, None, None);
    }

    let last_play_date = dates.first().map(String::clone);

    let most_recent_epoch = match dates.first() {
        Some(d) => date_only_to_start_epoch_secs(d).unwrap_or(0),
        None => return (0, None, None),
    };

    let day_diff = (today_epoch - most_recent_epoch) / 86400;
    if day_diff > STREAK_GRACE_DAYS + 1 {
        return (0, None, last_play_date);
    }

    let mut streak = 1i64;
    let mut streak_start = dates[0].clone();

    for i in 1..dates.len() {
        let curr_epoch = date_only_to_start_epoch_secs(&dates[i - 1]).unwrap_or(0);
        let prev_epoch = date_only_to_start_epoch_secs(&dates[i]).unwrap_or(0);
        let gap_days = (curr_epoch - prev_epoch) / 86400;

        if gap_days <= STREAK_GRACE_DAYS + 1 {
            streak += 1;
            streak_start = dates[i].clone();
        } else {
            break;
        }
    }

    (streak, Some(streak_start), last_play_date)
}

/// Compute the all-time longest streak from a descending list of distinct dates.
fn compute_longest_streak_all(dates: &[String]) -> i64 {
    if dates.is_empty() {
        return 0;
    }

    let mut sorted: Vec<&str> = dates.iter().map(String::as_str).collect();
    sorted.sort();
    sorted.dedup();

    let mut max_streak = 1i64;
    let mut streak = 1i64;

    for i in 1..sorted.len() {
        let prev_epoch = date_only_to_start_epoch_secs(sorted[i - 1]).unwrap_or(0);
        let curr_epoch = date_only_to_start_epoch_secs(sorted[i]).unwrap_or(0);

        if curr_epoch == prev_epoch + 86400 {
            streak += 1;
        } else {
            max_streak = max_streak.max(streak);
            streak = 1;
        }
    }

    max_streak.max(streak)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn setup_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        migrations::run_pending(&conn).unwrap();
        conn
    }

    fn insert_session(conn: &rusqlite::Connection, id: &str, date: &str, duration: i64) {
        let started = format!("{date}T12:00:00Z");
        let ended = format!("{date}T13:00:00Z");
        conn.execute(
            "INSERT INTO games (id, name, source, added_at, updated_at)
             VALUES (?1, 'Test', 'manual', ?2, ?2)
             ON CONFLICT(id) DO NOTHING",
            params![format!("game-{id}"), date],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                id,
                format!("game-{id}"),
                started,
                ended,
                duration,
            ],
        )
        .unwrap();
    }

    fn today_for_test() -> String {
        today_date()
    }

    fn days_ago(n: i64) -> String {
        let now_secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        epoch_secs_to_iso_date(now_secs - n * 86400)
    }

    #[test]
    fn streak_zero_no_sessions() {
        let conn = setup_db();
        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 0);
        assert_eq!(snap.longest_streak, 0);
        assert!(snap.last_play_date.is_none());
        assert!(snap.streak_started_at.is_none());
    }

    #[test]
    fn streak_one_after_single_session_today() {
        let conn = setup_db();
        let today = today_for_test();
        insert_session(&conn, "s1", &today, 60);

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 1);
        assert_eq!(snap.longest_streak, 1);
        assert_eq!(snap.last_play_date.as_deref(), Some(today.as_str()));
        assert_eq!(snap.streak_started_at.as_deref(), Some(today.as_str()));
    }

    #[test]
    fn streak_increments_consecutive_days() {
        let conn = setup_db();
        for i in 0..5 {
            let date = days_ago(i);
            insert_session(&conn, &format!("s{i}"), &date, 60);
        }

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 5);
        assert_eq!(snap.longest_streak, 5);
    }

    #[test]
    fn streak_resets_after_gap_exceeding_grace() {
        let conn = setup_db();
        insert_session(&conn, "s1", &days_ago(0), 60);
        insert_session(&conn, "s2", &days_ago(3), 60);

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 1);
        assert_eq!(snap.longest_streak, 1);
    }

    #[test]
    fn streak_survives_one_day_gap_grace_period() {
        let conn = setup_db();
        insert_session(&conn, "s1", &days_ago(0), 60);
        // Skip days_ago(1) — one-day gap
        insert_session(&conn, "s2", &days_ago(2), 60);

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 2);
    }

    #[test]
    fn longest_streak_updates_when_current_exceeds() {
        let conn = setup_db();
        // Old streak of 2
        insert_session(&conn, "s_old1", &days_ago(10), 60);
        insert_session(&conn, "s_old2", &days_ago(9), 60);
        // Current streak of 3
        for i in 0..3 {
            insert_session(&conn, &format!("s_new{i}"), &days_ago(i), 60);
        }

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 3);
        assert_eq!(snap.longest_streak, 3);
    }

    #[test]
    fn longest_streak_does_not_decrease_on_reset() {
        let conn = setup_db();
        // Build a 5-day streak in the past
        for i in 10..15 {
            insert_session(&conn, &format!("s_old{i}"), &days_ago(i as i64), 60);
        }
        // One session today (current streak = 1, but longest should be 5)
        insert_session(&conn, "s_today", &days_ago(0), 60);

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 1);
        assert_eq!(snap.longest_streak, 5);
    }

    #[test]
    fn sessions_under_30s_do_not_count() {
        let conn = setup_db();
        let today = today_for_test();
        insert_session(&conn, "s_short", &today, 29);

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 0);
    }

    #[test]
    fn streak_started_at_is_correct() {
        let conn = setup_db();
        for i in 0..3 {
            insert_session(&conn, &format!("s{i}"), &days_ago(i), 60);
        }

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.streak_started_at.as_deref(), Some(days_ago(2).as_str()));
    }

    #[test]
    fn retroactive_5_day_streak_on_first_launch() {
        let conn = setup_db();
        for i in 0..5 {
            insert_session(&conn, &format!("s{i}"), &days_ago(i), 120);
        }

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 5);
        assert_eq!(snap.longest_streak, 5);
        assert_eq!(snap.streak_started_at.as_deref(), Some(days_ago(4).as_str()));
    }

    #[test]
    fn retroactive_old_sessions_no_current_streak() {
        let conn = setup_db();
        for i in 5..10 {
            insert_session(&conn, &format!("s{i}"), &days_ago(i as i64), 120);
        }

        let snap = recalculate_streak_inner(&conn).unwrap();
        assert_eq!(snap.current_streak, 0);
        assert_eq!(snap.longest_streak, 5);
    }

    #[test]
    fn get_streak_returns_snapshot() {
        let conn = setup_db();
        let snap = conn
            .query_row(
                "SELECT id, current_streak, longest_streak, last_play_date, streak_started_at, updated_at
                 FROM streak_snapshots WHERE id = 'singleton'",
                [],
                StreakSnapshot::from_row,
            )
            .unwrap();
        assert_eq!(snap.id, "singleton");
        assert_eq!(snap.current_streak, 0);
    }
}
