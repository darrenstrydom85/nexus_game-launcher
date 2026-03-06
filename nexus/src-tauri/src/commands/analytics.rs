use rusqlite::params;
use tauri::State;

use super::error::CommandError;
use crate::db::DbState;
use crate::models::analytics::{
    DistributionBucket, PerGameSessionStats, SessionDistribution, SessionRecord, SessionScope,
    BUCKET_DEFINITIONS, MIN_SESSION_DURATION_S,
};
use crate::models::wrapped::{DayBucket, MonthBucket};

// ── Shared helpers ─────────────────────────────────────────────────────────

/// Compute a `SessionDistribution` from a sorted (ascending) slice of `duration_s` values.
/// The slice must already be filtered (no orphans, no accidental launches).
fn build_distribution(durations: &[i64]) -> SessionDistribution {
    let n = durations.len() as i64;

    if n == 0 {
        let buckets = BUCKET_DEFINITIONS
            .iter()
            .map(|(label, min_s, max_s)| DistributionBucket {
                label: label.to_string(),
                min_s: *min_s,
                max_s: *max_s,
                count: 0,
                total_play_time_s: 0,
            })
            .collect();

        return SessionDistribution {
            buckets,
            total_sessions: 0,
            mean_duration_s: 0.0,
            median_duration_s: 0.0,
            p75_duration_s: 0.0,
            p95_duration_s: 0.0,
            shortest_session_s: 0,
            longest_session_s: 0,
        };
    }

    // Build histogram buckets.
    let mut buckets: Vec<DistributionBucket> = BUCKET_DEFINITIONS
        .iter()
        .map(|(label, min_s, max_s)| DistributionBucket {
            label: label.to_string(),
            min_s: *min_s,
            max_s: *max_s,
            count: 0,
            total_play_time_s: 0,
        })
        .collect();

    for &d in durations {
        for bucket in &mut buckets {
            let in_bucket = match bucket.max_s {
                Some(max) => d >= bucket.min_s && d < max,
                None => d >= bucket.min_s,
            };
            if in_bucket {
                bucket.count += 1;
                bucket.total_play_time_s += d;
                break;
            }
        }
    }

    let total_s: i64 = durations.iter().sum();
    let mean_duration_s = total_s as f64 / n as f64;

    // Percentile helper: floor(n * p), clamped to valid index.
    let percentile = |p: f64| -> f64 {
        let idx = ((n as f64) * p).floor() as usize;
        durations[idx.min(durations.len() - 1)] as f64
    };

    SessionDistribution {
        buckets,
        total_sessions: n,
        mean_duration_s,
        median_duration_s: percentile(0.5),
        p75_duration_s: percentile(0.75),
        p95_duration_s: percentile(0.95),
        shortest_session_s: durations[0],
        longest_session_s: durations[durations.len() - 1],
    }
}

/// Fetch all valid `duration_s` values for the given scope, sorted ascending.
/// Excludes orphaned sessions (ended_at IS NULL) and accidental launches (< 30s).
fn fetch_durations(
    conn: &rusqlite::Connection,
    scope: &SessionScope,
) -> Result<Vec<i64>, CommandError> {
    let sql = match scope {
        SessionScope::Library => format!(
            "SELECT duration_s FROM play_sessions \
             WHERE ended_at IS NOT NULL AND duration_s >= {MIN_SESSION_DURATION_S} \
             ORDER BY duration_s ASC"
        ),
        SessionScope::Game(_) => format!(
            "SELECT duration_s FROM play_sessions \
             WHERE game_id = ?1 AND ended_at IS NOT NULL AND duration_s >= {MIN_SESSION_DURATION_S} \
             ORDER BY duration_s ASC"
        ),
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let durations: Vec<i64> = match scope {
        SessionScope::Library => stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<_, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?,
        SessionScope::Game(game_id) => stmt
            .query_map(params![game_id], |row| row.get(0))
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<_, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?,
    };

    Ok(durations)
}

/// Compute the average gap in days between consecutive sessions.
/// Returns `0.0` if fewer than 2 sessions exist.
fn compute_average_gap_days(
    conn: &rusqlite::Connection,
    game_id: &str,
) -> Result<f64, CommandError> {
    let mut stmt = conn
        .prepare(
            "SELECT started_at FROM play_sessions \
             WHERE game_id = ?1 AND ended_at IS NOT NULL AND duration_s >= ?2 \
             ORDER BY started_at ASC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let timestamps: Vec<String> = stmt
        .query_map(params![game_id, MIN_SESSION_DURATION_S], |row| row.get(0))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<_, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if timestamps.len() < 2 {
        return Ok(0.0);
    }

    // Parse ISO timestamps to epoch seconds using the shared utility.
    use super::utils::iso_to_epoch_secs;

    let epochs: Vec<i64> = timestamps
        .iter()
        .map(|ts| iso_to_epoch_secs(ts).map_err(CommandError::Parse))
        .collect::<Result<_, _>>()?;

    let total_gap_s: i64 = epochs.windows(2).map(|w| (w[1] - w[0]).max(0)).sum();
    let pair_count = (epochs.len() - 1) as f64;
    let avg_gap_days = (total_gap_s as f64) / pair_count / 86400.0;

    Ok(avg_gap_days)
}

// ── Commands ───────────────────────────────────────────────────────────────

/// Return a session-length distribution histogram for the library or a single game.
#[tauri::command]
pub fn get_session_distribution(
    db: State<'_, DbState>,
    scope: SessionScope,
) -> Result<SessionDistribution, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let durations = fetch_durations(&conn, &scope)?;
    Ok(build_distribution(&durations))
}

/// Return full per-game session analytics: session list, distribution,
/// monthly play time, day-of-week play time, and average session gap.
#[tauri::command]
pub fn get_per_game_session_stats(
    db: State<'_, DbState>,
    game_id: String,
    limit: Option<i64>,
) -> Result<PerGameSessionStats, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let page_limit = limit.unwrap_or(50).min(200).max(1);

    // ── Session list ──────────────────────────────────────────────────
    let mut stmt = conn
        .prepare(
            "SELECT id, started_at, ended_at, duration_s, tracking \
             FROM play_sessions \
             WHERE game_id = ?1 AND ended_at IS NOT NULL \
             ORDER BY started_at DESC \
             LIMIT ?2",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let sessions: Vec<SessionRecord> = stmt
        .query_map(params![game_id, page_limit], |row| {
            Ok(SessionRecord {
                id: row.get("id")?,
                started_at: row.get("started_at")?,
                ended_at: row.get("ended_at")?,
                duration_s: row.get::<_, Option<i64>>("duration_s")?.unwrap_or(0),
                tracking_method: row.get("tracking")?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<_, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // ── Distribution ──────────────────────────────────────────────────
    let durations = fetch_durations(&conn, &SessionScope::Game(game_id.clone()))?;
    let distribution = build_distribution(&durations);

    // ── Monthly play time (last 12 months) ────────────────────────────
    // Build 12-month window: current month back 11 months.
    // We use SQLite strftime to group by month number and filter by year.
    let mut month_stmt = conn
        .prepare(
            "SELECT CAST(strftime('%m', started_at) AS INTEGER) as month, \
                    COALESCE(SUM(duration_s), 0) as play_time_s \
             FROM play_sessions \
             WHERE game_id = ?1 \
               AND ended_at IS NOT NULL \
               AND started_at >= datetime('now', '-12 months') \
             GROUP BY month \
             ORDER BY month ASC",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let month_rows: Vec<(u8, i64)> = month_stmt
        .query_map(params![game_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<_, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // Ensure all 12 months are present (fill missing with 0).
    let play_time_by_month: Vec<MonthBucket> = {
        use std::collections::HashMap;
        let map: HashMap<u8, i64> = month_rows.into_iter().collect();
        // Determine which 12 months to include (rolling window).
        // Use current month from SQLite to stay consistent.
        let current_month: u8 = conn
            .query_row(
                "SELECT CAST(strftime('%m', 'now') AS INTEGER)",
                [],
                |row| row.get(0),
            )
            .unwrap_or(1);

        (0u8..12)
            .map(|i| {
                // month numbers 1-12, rolling back from current
                let m = ((current_month as i32 - 1 - i as i32).rem_euclid(12) + 1) as u8;
                MonthBucket {
                    month: m,
                    play_time_s: *map.get(&m).unwrap_or(&0),
                }
            })
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    };

    // ── Day-of-week play time ─────────────────────────────────────────
    // SQLite strftime('%w') returns 0=Sunday..6=Saturday.
    // Story spec: 0 = Monday. We remap: Mon=0, Tue=1, ..., Sun=6.
    let mut dow_stmt = conn
        .prepare(
            "SELECT CAST(strftime('%w', started_at) AS INTEGER) as sqlite_dow, \
                    COALESCE(SUM(duration_s), 0) as play_time_s \
             FROM play_sessions \
             WHERE game_id = ?1 AND ended_at IS NOT NULL \
             GROUP BY sqlite_dow",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let dow_rows: Vec<(u8, i64)> = dow_stmt
        .query_map(params![game_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<_, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // Build 7-entry array (0=Mon..6=Sun), fill missing with 0.
    let play_time_by_day_of_week: Vec<DayBucket> = {
        use std::collections::HashMap;
        // sqlite_dow: 0=Sun,1=Mon,...,6=Sat → story_dow: Mon=0,...,Sun=6
        // story_dow = (sqlite_dow + 6) % 7
        let map: HashMap<u8, i64> = dow_rows
            .into_iter()
            .map(|(sqlite_dow, pts)| ((sqlite_dow + 6) % 7, pts))
            .collect();

        (0u8..7)
            .map(|day| DayBucket {
                day,
                play_time_s: *map.get(&day).unwrap_or(&0),
            })
            .collect()
    };

    // ── Average gap ───────────────────────────────────────────────────
    let average_gap_days = compute_average_gap_days(&conn, &game_id)?;

    Ok(PerGameSessionStats {
        sessions,
        distribution,
        play_time_by_month,
        play_time_by_day_of_week,
        average_gap_days,
    })
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_game(conn: &rusqlite::Connection, id: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) \
             VALUES (?1, ?2, 'steam', 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, id],
        )
        .unwrap();
    }

    fn insert_session(
        conn: &rusqlite::Connection,
        id: &str,
        game_id: &str,
        started_at: &str,
        ended_at: Option<&str>,
        duration_s: Option<i64>,
    ) {
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s, tracking) \
             VALUES (?1, ?2, ?3, ?4, ?5, 'direct')",
            params![id, game_id, started_at, ended_at, duration_s],
        )
        .unwrap();
    }

    // ── build_distribution ────────────────────────────────────────────

    #[test]
    fn distribution_empty_returns_zero_buckets() {
        let dist = build_distribution(&[]);
        assert_eq!(dist.total_sessions, 0);
        assert_eq!(dist.buckets.len(), 7);
        assert!(dist.buckets.iter().all(|b| b.count == 0));
        assert_eq!(dist.mean_duration_s, 0.0);
        assert_eq!(dist.shortest_session_s, 0);
        assert_eq!(dist.longest_session_s, 0);
    }

    #[test]
    fn distribution_single_session_in_correct_bucket() {
        // 20 minutes → "15–30m" bucket
        let dist = build_distribution(&[20 * 60]);
        assert_eq!(dist.total_sessions, 1);
        let bucket = dist.buckets.iter().find(|b| b.label == "15–30m").unwrap();
        assert_eq!(bucket.count, 1);
        assert_eq!(bucket.total_play_time_s, 20 * 60);
        // All other buckets empty
        let others: i64 = dist
            .buckets
            .iter()
            .filter(|b| b.label != "15–30m")
            .map(|b| b.count)
            .sum();
        assert_eq!(others, 0);
    }

    #[test]
    fn distribution_sessions_span_all_7_buckets() {
        let durations = vec![
            5 * 60,        // < 15m
            20 * 60,       // 15–30m
            45 * 60,       // 30m–1h
            90 * 60,       // 1–2h
            3 * 60 * 60,   // 2–4h
            6 * 60 * 60,   // 4–8h
            10 * 60 * 60,  // 8h+
        ];
        let dist = build_distribution(&durations);
        assert_eq!(dist.total_sessions, 7);
        assert!(dist.buckets.iter().all(|b| b.count == 1));
    }

    #[test]
    fn distribution_percentile_single_session() {
        let dist = build_distribution(&[3600]);
        assert_eq!(dist.median_duration_s, 3600.0);
        assert_eq!(dist.p75_duration_s, 3600.0);
        assert_eq!(dist.p95_duration_s, 3600.0);
    }

    #[test]
    fn distribution_percentile_two_sessions() {
        // sorted: [1800, 3600]
        let dist = build_distribution(&[1800, 3600]);
        // median: floor(2 * 0.5) = 1 → durations[1] = 3600
        assert_eq!(dist.median_duration_s, 3600.0);
        assert_eq!(dist.shortest_session_s, 1800);
        assert_eq!(dist.longest_session_s, 3600);
    }

    #[test]
    fn distribution_percentile_100_sessions() {
        // 100 sessions: 60s, 120s, ..., 6000s
        let durations: Vec<i64> = (1..=100).map(|i| i * 60).collect();
        let dist = build_distribution(&durations);
        assert_eq!(dist.total_sessions, 100);
        // median: floor(100 * 0.5) = 50 → durations[50] = 51 * 60
        assert_eq!(dist.median_duration_s, 51.0 * 60.0);
        // p75: floor(100 * 0.75) = 75 → durations[75] = 76 * 60
        assert_eq!(dist.p75_duration_s, 76.0 * 60.0);
        // p95: floor(100 * 0.95) = 95 → durations[95] = 96 * 60
        assert_eq!(dist.p95_duration_s, 96.0 * 60.0);
    }

    // ── fetch_durations ───────────────────────────────────────────────

    #[test]
    fn fetch_durations_excludes_orphaned_sessions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1");
        insert_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", None, None); // orphaned
        drop(conn);

        let conn = state.conn.lock().unwrap();
        let durations = fetch_durations(&conn, &SessionScope::Game("g1".into())).unwrap();
        assert_eq!(durations.len(), 1);
        assert_eq!(durations[0], 3600);
    }

    #[test]
    fn fetch_durations_excludes_accidental_launches() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1");
        insert_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T10:00:10Z"), Some(10)); // < 30s
        insert_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T11:00:00Z"), Some(3600));
        drop(conn);

        let conn = state.conn.lock().unwrap();
        let durations = fetch_durations(&conn, &SessionScope::Game("g1".into())).unwrap();
        assert_eq!(durations.len(), 1);
        assert_eq!(durations[0], 3600);
    }

    #[test]
    fn fetch_durations_library_scope_aggregates_all_games() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1");
        insert_game(&conn, "g2");
        insert_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_session(&conn, "s2", "g2", "2026-01-11T10:00:00Z", Some("2026-01-11T10:30:00Z"), Some(1800));
        drop(conn);

        let conn = state.conn.lock().unwrap();
        let durations = fetch_durations(&conn, &SessionScope::Library).unwrap();
        assert_eq!(durations.len(), 2);
    }

    // ── compute_average_gap_days ──────────────────────────────────────

    #[test]
    fn average_gap_returns_zero_for_single_session() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1");
        insert_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        drop(conn);

        let conn = state.conn.lock().unwrap();
        let gap = compute_average_gap_days(&conn, "g1").unwrap();
        assert_eq!(gap, 0.0);
    }

    #[test]
    fn average_gap_two_sessions_one_day_apart() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1");
        insert_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some("2026-01-10T11:00:00Z"), Some(3600));
        insert_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some("2026-01-11T11:00:00Z"), Some(3600));
        drop(conn);

        let conn = state.conn.lock().unwrap();
        let gap = compute_average_gap_days(&conn, "g1").unwrap();
        assert!((gap - 1.0).abs() < 0.01, "expected ~1.0 day gap, got {gap}");
    }

    #[test]
    fn average_gap_three_sessions() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1");
        // gaps: 2 days, 4 days → average = 3 days
        insert_session(&conn, "s1", "g1", "2026-01-01T00:00:00Z", Some("2026-01-01T01:00:00Z"), Some(3600));
        insert_session(&conn, "s2", "g1", "2026-01-03T00:00:00Z", Some("2026-01-03T01:00:00Z"), Some(3600));
        insert_session(&conn, "s3", "g1", "2026-01-07T00:00:00Z", Some("2026-01-07T01:00:00Z"), Some(3600));
        drop(conn);

        let conn = state.conn.lock().unwrap();
        let gap = compute_average_gap_days(&conn, "g1").unwrap();
        assert!((gap - 3.0).abs() < 0.01, "expected ~3.0 day gap, got {gap}");
    }

    #[test]
    fn average_gap_no_sessions_returns_zero() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1");
        drop(conn);

        let conn = state.conn.lock().unwrap();
        let gap = compute_average_gap_days(&conn, "g1").unwrap();
        assert_eq!(gap, 0.0);
    }
}
