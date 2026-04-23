//! Session-based Twitch watch history (Story E1).
//!
//! Each call to [`start_session`] inserts a row with `started_at = now`, `ended_at = NULL`,
//! `duration_secs = 0`. The frontend (`useWatchSession`) ticks effective watch time while the
//! window is visible and calls [`end_session`] on unmount with the final duration. We trust
//! the frontend's duration value because only it can observe `document.visibilityState` and
//! window focus correctly across the inline panel and the pop-out window.
//!
//! Aggregation helpers ([`aggregate_for_period`], [`aggregate_for_year`]) power the Stats
//! tile and the Wrapped slide; they cap top-N lists at the values shown in the UI so we
//! don't pull more rows than needed.

use rusqlite::{params, Connection};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::commands::error::CommandError;

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Insert a new watch session and return its rowid. `started_at` is recorded as the current
/// unix timestamp regardless of caller-provided wallclock to avoid clock-skew confusion.
pub fn start_session(
    conn: &Connection,
    channel_login: &str,
    channel_display_name: Option<&str>,
    twitch_game_id: Option<&str>,
    twitch_game_name: Option<&str>,
    nexus_game_id: Option<&str>,
) -> Result<i64, CommandError> {
    conn.execute(
        "INSERT INTO twitch_watch_sessions
            (channel_login, channel_display_name, twitch_game_id, twitch_game_name,
             nexus_game_id, started_at, ended_at, duration_secs)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0)",
        params![
            channel_login,
            channel_display_name,
            twitch_game_id,
            twitch_game_name,
            nexus_game_id,
            now_secs(),
        ],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(conn.last_insert_rowid())
}

/// Record the end of a session. `duration_secs` is clamped to `[0, 24h]` to neutralise any
/// runaway counters from a stuck timer (e.g. a tab left open all night with the screen off
/// but the OS reporting it as visible).
pub fn end_session(
    conn: &Connection,
    session_id: i64,
    duration_secs: i64,
) -> Result<(), CommandError> {
    let clamped = duration_secs.clamp(0, 24 * 60 * 60);
    conn.execute(
        "UPDATE twitch_watch_sessions
         SET ended_at = ?1, duration_secs = ?2
         WHERE id = ?3",
        params![now_secs(), clamped, session_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchTotals {
    pub total_secs: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchByChannel {
    pub channel_login: String,
    pub channel_display_name: Option<String>,
    pub total_secs: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchByGame {
    pub twitch_game_id: Option<String>,
    pub twitch_game_name: Option<String>,
    pub nexus_game_id: Option<String>,
    pub total_secs: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchAggregate {
    pub totals: WatchTotals,
    pub top_channels: Vec<WatchByChannel>,
    pub top_games: Vec<WatchByGame>,
}

/// Aggregate watch sessions in the half-open range `[from, to)`.
/// `top_n` caps each of the per-channel and per-game lists.
pub fn aggregate_for_period(
    conn: &Connection,
    from_secs: i64,
    to_secs: i64,
    top_n: usize,
) -> Result<WatchAggregate, CommandError> {
    let totals: (i64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(duration_secs), 0), COUNT(*) FROM twitch_watch_sessions
             WHERE started_at >= ?1 AND started_at < ?2",
            params![from_secs, to_secs],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let mut by_channel_stmt = conn
        .prepare(
            "SELECT channel_login,
                    MAX(channel_display_name),
                    COALESCE(SUM(duration_secs), 0) AS total,
                    COUNT(*) AS sessions
             FROM twitch_watch_sessions
             WHERE started_at >= ?1 AND started_at < ?2
             GROUP BY channel_login
             ORDER BY total DESC
             LIMIT ?3",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let top_channels = by_channel_stmt
        .query_map(params![from_secs, to_secs, top_n as i64], |row| {
            Ok(WatchByChannel {
                channel_login: row.get(0)?,
                channel_display_name: row.get(1)?,
                total_secs: row.get(2)?,
                session_count: row.get(3)?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    let mut by_game_stmt = conn
        .prepare(
            "SELECT twitch_game_id,
                    MAX(twitch_game_name),
                    MAX(nexus_game_id),
                    COALESCE(SUM(duration_secs), 0) AS total,
                    COUNT(*) AS sessions
             FROM twitch_watch_sessions
             WHERE started_at >= ?1 AND started_at < ?2
               AND (twitch_game_id IS NOT NULL OR nexus_game_id IS NOT NULL)
             GROUP BY COALESCE(twitch_game_id, nexus_game_id)
             ORDER BY total DESC
             LIMIT ?3",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let top_games = by_game_stmt
        .query_map(params![from_secs, to_secs, top_n as i64], |row| {
            Ok(WatchByGame {
                twitch_game_id: row.get(0)?,
                twitch_game_name: row.get(1)?,
                nexus_game_id: row.get(2)?,
                total_secs: row.get(3)?,
                session_count: row.get(4)?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    Ok(WatchAggregate {
        totals: WatchTotals {
            total_secs: totals.0,
            session_count: totals.1,
        },
        top_channels,
        top_games,
    })
}

/// Convenience wrapper that aggregates the previous `period_days` ending now.
/// We bump the upper bound by 1s so sessions started in the exact same second as the call
/// are still included (half-open `[from, to)` would otherwise drop them).
pub fn aggregate_for_recent_days(
    conn: &Connection,
    period_days: i64,
    top_n: usize,
) -> Result<WatchAggregate, CommandError> {
    let now = now_secs();
    let from = now - period_days.max(0) * 24 * 60 * 60;
    aggregate_for_period(conn, from, now + 1, top_n)
}

/// Aggregate the entire calendar year (UTC) — used by the Wrapped slide.
pub fn aggregate_for_year(
    conn: &Connection,
    year: i32,
    top_n: usize,
) -> Result<WatchAggregate, CommandError> {
    // Compute Jan 1 of `year` and Jan 1 of `year + 1` in UTC seconds. We avoid a chrono dep
    // by using a simple days-from-1970 calculation that handles Gregorian leap years.
    fn jan1_secs(year: i32) -> i64 {
        let mut days: i64 = 0;
        let start = 1970;
        if year >= start {
            for y in start..year {
                days += if is_leap(y) { 366 } else { 365 };
            }
        } else {
            for y in year..start {
                days -= if is_leap(y) { 366 } else { 365 };
            }
        }
        days * 24 * 60 * 60
    }
    fn is_leap(y: i32) -> bool {
        (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
    }
    let from = jan1_secs(year);
    let to = jan1_secs(year + 1);
    aggregate_for_period(conn, from, to, top_n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_pending;

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_pending(&conn).unwrap();
        conn
    }

    #[test]
    fn start_then_end_persists_duration() {
        let conn = fresh_conn();
        let id = start_session(
            &conn,
            "shroud",
            Some("Shroud"),
            Some("32982"),
            Some("Grand Theft Auto V"),
            Some("nexus-123"),
        )
        .unwrap();
        end_session(&conn, id, 305).unwrap();

        let (login, dur, ended): (String, i64, Option<i64>) = conn
            .query_row(
                "SELECT channel_login, duration_secs, ended_at FROM twitch_watch_sessions WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(login, "shroud");
        assert_eq!(dur, 305);
        assert!(ended.is_some());
    }

    #[test]
    fn end_session_clamps_runaway_durations() {
        let conn = fresh_conn();
        let id = start_session(&conn, "x", None, None, None, None).unwrap();
        end_session(&conn, id, 7 * 24 * 60 * 60).unwrap();
        let dur: i64 = conn
            .query_row(
                "SELECT duration_secs FROM twitch_watch_sessions WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dur, 24 * 60 * 60);
    }

    #[test]
    fn aggregate_top_channels_and_games() {
        let conn = fresh_conn();
        // Two sessions of Shroud playing GTA V (60s + 120s = 180s)
        let a = start_session(&conn, "shroud", Some("Shroud"), Some("g1"), Some("GTA V"), None).unwrap();
        end_session(&conn, a, 60).unwrap();
        let b = start_session(&conn, "shroud", Some("Shroud"), Some("g1"), Some("GTA V"), None).unwrap();
        end_session(&conn, b, 120).unwrap();
        // One session of summit1g playing Valorant (90s)
        let c = start_session(&conn, "summit1g", Some("summit1g"), Some("g2"), Some("Valorant"), None).unwrap();
        end_session(&conn, c, 90).unwrap();

        let agg = aggregate_for_recent_days(&conn, 30, 5).unwrap();
        assert_eq!(agg.totals.total_secs, 270);
        assert_eq!(agg.totals.session_count, 3);
        assert_eq!(agg.top_channels.len(), 2);
        assert_eq!(agg.top_channels[0].channel_login, "shroud");
        assert_eq!(agg.top_channels[0].total_secs, 180);
        assert_eq!(agg.top_games.len(), 2);
        assert_eq!(agg.top_games[0].twitch_game_name.as_deref(), Some("GTA V"));
    }

    #[test]
    fn aggregate_period_excludes_outside_window() {
        let conn = fresh_conn();
        // Insert a row with a started_at in the distant past directly so it falls outside
        // the recent-30-day window.
        conn.execute(
            "INSERT INTO twitch_watch_sessions
                (channel_login, started_at, ended_at, duration_secs)
             VALUES ('old', 0, 60, 60)",
            [],
        )
        .unwrap();
        let agg = aggregate_for_recent_days(&conn, 30, 5).unwrap();
        assert_eq!(agg.totals.total_secs, 0);
        assert_eq!(agg.totals.session_count, 0);
    }
}
