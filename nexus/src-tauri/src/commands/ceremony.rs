//! Retirement ceremony data aggregation (Story 41.1).
//!
//! `get_game_ceremony_data` returns a `GameCeremonyData` payload for a single
//! game, summarising the player's journey. All aggregation is done in one
//! scope-scoped pass over `play_sessions` (filtered by the same rules Wrapped
//! uses: `ended_at IS NOT NULL AND duration_s >= 30`). If the game exists but
//! has no qualifying sessions, the struct is still returned with zeroed
//! aggregates so the UI can render an empty ceremony gracefully.

use rusqlite::{params, OptionalExtension};
use tauri::State;

use super::error::CommandError;
use super::utils::iso_to_epoch_secs;
use crate::db::DbState;
use crate::models::ceremony::{GameCeremonyData, MonthPlayTime};
use crate::models::mastery::{resolve_tier, MasteryTier};

/// Session filter used throughout the command — matches Wrapped's filter so
/// ceremony data is consistent with the year-in-review numbers.
const SESSION_FILTER: &str = "ended_at IS NOT NULL AND duration_s >= 30 AND game_id = ?1";

#[tauri::command]
pub fn get_game_ceremony_data(
    db: State<'_, DbState>,
    game_id: String,
) -> Result<GameCeremonyData, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    get_game_ceremony_data_inner(&conn, &game_id)
}

pub(crate) fn get_game_ceremony_data_inner(
    conn: &rusqlite::Connection,
    game_id: &str,
) -> Result<GameCeremonyData, CommandError> {
    // 1. Load the game row we need (not the full Game struct — only ceremony fields).
    let row: Option<(
        String,
        Option<String>,
        Option<String>,
        String,
        i64,
        Option<i32>,
        Option<String>,
        Option<String>,
        i64,
    )> = conn
        .query_row(
            "SELECT name, cover_url, hero_url, status, completed, rating, genres, release_date, total_play_time
             FROM games WHERE id = ?1",
            params![game_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                ))
            },
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let (
        name,
        cover_url,
        hero_url,
        status,
        completed_int,
        rating,
        genres,
        release_date,
        total_play_time_from_row,
    ) = row.ok_or_else(|| CommandError::NotFound(format!("game {game_id}")))?;

    let completed = completed_int != 0;

    let release_year = release_date.as_deref().and_then(parse_release_year);

    // Mastery tier comes from cached total_play_time on the game row — this
    // matches the `get_mastery_tier` command and stays correct even if a
    // session is sub-30s (and therefore excluded below).
    let mastery_tier = tier_to_string(resolve_tier(total_play_time_from_row));

    // 2. Headline aggregates over qualifying sessions only.
    let agg: Option<(i64, i64, i64, Option<String>, Option<String>)> = conn
        .query_row(
            &format!(
                "SELECT
                    COALESCE(SUM(duration_s), 0) AS total,
                    COALESCE(COUNT(*), 0) AS cnt,
                    COALESCE(MAX(duration_s), 0) AS longest,
                    MIN(started_at) AS first_at,
                    MAX(started_at) AS last_at
                 FROM play_sessions
                 WHERE {SESSION_FILTER}"
            ),
            params![game_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let (total_play_time_s, total_sessions, longest_session_s, first_played_at_opt, last_played_at_opt) =
        agg.unwrap_or((0, 0, 0, None, None));

    // 3. If no qualifying sessions, return a minimal-but-valid struct.
    if total_sessions == 0 {
        return Ok(GameCeremonyData {
            game_id: game_id.to_string(),
            game_name: name,
            cover_art_url: cover_url,
            hero_art_url: hero_url,
            status,
            completed,
            rating,
            total_play_time_s: 0,
            total_sessions: 0,
            longest_session_s: 0,
            average_session_s: 0,
            first_played_at: String::new(),
            last_played_at: String::new(),
            days_between_first_and_last: 0,
            play_time_by_month: Vec::new(),
            play_time_by_day_of_week: vec![0; 7],
            play_time_by_hour_of_day: vec![0; 24],
            fun_facts: Vec::new(),
            mastery_tier,
            genres,
            release_year,
        });
    }

    let first_played_at = first_played_at_opt.unwrap_or_default();
    let last_played_at = last_played_at_opt.unwrap_or_default();

    let average_session_s = if total_sessions > 0 {
        total_play_time_s / total_sessions
    } else {
        0
    };

    let days_between_first_and_last =
        days_between_iso(&first_played_at, &last_played_at).unwrap_or(0);

    // 4. play_time_by_month — gap-filled from first month to last month.
    let play_time_by_month = query_months(conn, game_id, &first_played_at, &last_played_at)?;

    // 5. play_time_by_day_of_week (0 = Monday .. 6 = Sunday). SQLite's %w
    // returns 0 = Sunday, so (w+6) % 7 gives 0 = Monday.
    let play_time_by_day_of_week = query_day_of_week(conn, game_id)?;

    // 6. play_time_by_hour_of_day (0..23).
    let play_time_by_hour_of_day = query_hour_of_day(conn, game_id)?;

    // 7. Fun facts — 2..=4 items from a prioritised template list.
    let fun_facts = build_fun_facts(
        total_play_time_s,
        total_sessions,
        longest_session_s,
        &play_time_by_day_of_week,
        &play_time_by_hour_of_day,
        days_between_first_and_last,
    );

    Ok(GameCeremonyData {
        game_id: game_id.to_string(),
        game_name: name,
        cover_art_url: cover_url,
        hero_art_url: hero_url,
        status,
        completed,
        rating,
        total_play_time_s,
        total_sessions,
        longest_session_s,
        average_session_s,
        first_played_at,
        last_played_at,
        days_between_first_and_last,
        play_time_by_month,
        play_time_by_day_of_week,
        play_time_by_hour_of_day,
        fun_facts,
        mastery_tier,
        genres,
        release_year,
    })
}

// ── Query helpers ────────────────────────────────────────────────────────────

fn query_months(
    conn: &rusqlite::Connection,
    game_id: &str,
    first_iso: &str,
    last_iso: &str,
) -> Result<Vec<MonthPlayTime>, CommandError> {
    let sql = format!(
        "SELECT strftime('%Y-%m', started_at) AS mo, COALESCE(SUM(duration_s), 0) AS t
         FROM play_sessions WHERE {SESSION_FILTER}
         GROUP BY mo ORDER BY mo"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let rows: Vec<(String, i64)> = stmt
        .query_map(params![game_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<_, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let (start_year, start_month) = parse_year_month(first_iso).unwrap_or((1970, 1));
    let (end_year, end_month) = parse_year_month(last_iso).unwrap_or((start_year, start_month));

    let mut months: Vec<MonthPlayTime> = Vec::new();
    let (mut y, mut m) = (start_year, start_month);
    loop {
        let label = format!("{y:04}-{m:02}");
        let play_time_s = rows
            .iter()
            .find(|(mo, _)| mo == &label)
            .map(|(_, t)| *t)
            .unwrap_or(0);
        months.push(MonthPlayTime {
            month: label,
            play_time_s,
        });

        if y == end_year && m == end_month {
            break;
        }
        m += 1;
        if m > 12 {
            m = 1;
            y += 1;
        }
        // Defensive cap in case of bad timestamps — 50 years of months.
        if months.len() > 12 * 50 {
            break;
        }
    }

    Ok(months)
}

fn query_day_of_week(
    conn: &rusqlite::Connection,
    game_id: &str,
) -> Result<Vec<i64>, CommandError> {
    let sql = format!(
        "SELECT (CAST(strftime('%w', started_at) AS INTEGER) + 6) % 7 AS dow,
                COALESCE(SUM(duration_s), 0) AS t
         FROM play_sessions WHERE {SESSION_FILTER}
         GROUP BY dow"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let mut buckets = vec![0i64; 7];
    let rows = stmt
        .query_map(params![game_id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?;
    for row in rows {
        let (dow, t) = row.map_err(|e| CommandError::Database(e.to_string()))?;
        if (0..7).contains(&dow) {
            buckets[dow as usize] = t;
        }
    }
    Ok(buckets)
}

fn query_hour_of_day(
    conn: &rusqlite::Connection,
    game_id: &str,
) -> Result<Vec<i64>, CommandError> {
    let sql = format!(
        "SELECT CAST(strftime('%H', started_at) AS INTEGER) AS h,
                COALESCE(SUM(duration_s), 0) AS t
         FROM play_sessions WHERE {SESSION_FILTER}
         GROUP BY h"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let mut buckets = vec![0i64; 24];
    let rows = stmt
        .query_map(params![game_id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?;
    for row in rows {
        let (h, t) = row.map_err(|e| CommandError::Database(e.to_string()))?;
        if (0..24).contains(&h) {
            buckets[h as usize] = t;
        }
    }
    Ok(buckets)
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

fn tier_to_string(tier: MasteryTier) -> String {
    match tier {
        MasteryTier::None => "none",
        MasteryTier::Bronze => "bronze",
        MasteryTier::Silver => "silver",
        MasteryTier::Gold => "gold",
        MasteryTier::Platinum => "platinum",
        MasteryTier::Diamond => "diamond",
    }
    .to_string()
}

fn parse_year_month(iso: &str) -> Option<(i32, u32)> {
    if iso.len() < 7 {
        return None;
    }
    let y: i32 = iso.get(0..4)?.parse().ok()?;
    let m: u32 = iso.get(5..7)?.parse().ok()?;
    if (1..=12).contains(&m) {
        Some((y, m))
    } else {
        None
    }
}

fn parse_release_year(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() >= 4 && trimmed[..4].chars().all(|c| c.is_ascii_digit()) {
        Some(trimmed[..4].to_string())
    } else {
        None
    }
}

fn days_between_iso(first: &str, last: &str) -> Option<i64> {
    let first_epoch = iso_to_epoch_secs(first).ok()?;
    let last_epoch = iso_to_epoch_secs(last).ok()?;
    let first_day = first_epoch.div_euclid(86400);
    let last_day = last_epoch.div_euclid(86400);
    Some((last_day - first_day).max(0))
}

/// Build 2-4 human-readable fun facts from ceremony data. Facts are only
/// included when they have "interesting" values so we never end up with
/// weak filler (e.g. "marathon" fact only when longest session ≥ 1h).
pub(crate) fn build_fun_facts(
    total_play_time_s: i64,
    total_sessions: i64,
    longest_session_s: i64,
    dow: &[i64],
    hour: &[i64],
    days_between: i64,
) -> Vec<String> {
    let mut facts: Vec<String> = Vec::new();

    // 1. Feature-film equivalence (~2h each).
    let film_minutes = (total_play_time_s as f64) / 60.0;
    let films = film_minutes / 120.0;
    if films >= 1.0 {
        let rounded = films.round() as i64;
        facts.push(format!(
            "You could have watched {rounded} movies in the time you played this"
        ));
    }

    // 2. Longest marathon session (≥ 1h so it actually feels like one).
    if longest_session_s >= 3600 {
        let hours = (longest_session_s as f64) / 3600.0;
        facts.push(format!(
            "Your longest session was {hours:.1} hours — that's a marathon!"
        ));
    }

    // 3. Number of distinct calendar days — communicated via days_between.
    if days_between >= 1 {
        facts.push(format!(
            "You played this across {} day{}",
            days_between + 1,
            if days_between + 1 == 1 { "" } else { "s" }
        ));
    }

    // 4. Favourite weekday.
    if let Some((idx, _)) = dow
        .iter()
        .enumerate()
        .filter(|(_, &v)| v > 0)
        .max_by_key(|(_, &v)| v)
    {
        let name = match idx {
            0 => "Monday",
            1 => "Tuesday",
            2 => "Wednesday",
            3 => "Thursday",
            4 => "Friday",
            5 => "Saturday",
            _ => "Sunday",
        };
        facts.push(format!("Most of your sessions were on {name}"));
    }

    // 5. Favourite time of day (hour range).
    if let Some((idx, _)) = hour
        .iter()
        .enumerate()
        .filter(|(_, &v)| v > 0)
        .max_by_key(|(_, &v)| v)
    {
        facts.push(format!(
            "Your favourite time to play was {}",
            hour_range_label(idx as u32)
        ));
    }

    // 6. Session count if high enough to be notable.
    if total_sessions >= 20 {
        facts.push(format!(
            "You booted this game up {total_sessions} times"
        ));
    }

    // Keep a minimum of 0 and a maximum of 4.
    facts.truncate(4);
    facts
}

fn hour_range_label(hour: u32) -> String {
    let end = (hour + 1) % 24;
    format!("{}–{}", format_hour_12(hour), format_hour_12(end))
}

fn format_hour_12(h: u32) -> String {
    let suffix = if h < 12 { "am" } else { "pm" };
    let hr = match h % 12 {
        0 => 12,
        n => n,
    };
    format!("{hr}{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use rusqlite::params;

    fn setup_db() -> rusqlite::Connection {
        let state = db::init_in_memory().expect("in-memory db");
        // Unwrap the Mutex to return the Connection directly for test convenience.
        state.conn.into_inner().unwrap()
    }

    fn insert_game(
        conn: &rusqlite::Connection,
        id: &str,
        name: &str,
        status: &str,
        total_play_time: i64,
    ) {
        // Migration 017 backfills `completed = 1` when status = 'completed', so
        // keep this helper consistent with that rule.
        let completed_int: i32 = if status == "completed" { 1 } else { 0 };
        conn.execute(
            "INSERT INTO games (id, name, source, status, completed, added_at, updated_at, total_play_time)
             VALUES (?1, ?2, 'steam', ?3, ?4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', ?5)",
            params![id, name, status, completed_int, total_play_time],
        )
        .unwrap();
    }

    /// Variant for tests that need to set `completed` independently of status
    /// — e.g. archived/uninstalled games where status = 'removed' but the
    /// completion flag must be preserved.
    fn insert_game_with_completed(
        conn: &rusqlite::Connection,
        id: &str,
        name: &str,
        status: &str,
        completed: bool,
        total_play_time: i64,
    ) {
        let completed_int: i32 = if completed { 1 } else { 0 };
        conn.execute(
            "INSERT INTO games (id, name, source, status, completed, added_at, updated_at, total_play_time)
             VALUES (?1, ?2, 'steam', ?3, ?4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', ?5)",
            params![id, name, status, completed_int, total_play_time],
        )
        .unwrap();
    }

    fn insert_session(
        conn: &rusqlite::Connection,
        id: &str,
        game_id: &str,
        started_at: &str,
        duration_s: Option<i64>,
    ) {
        let ended_at = duration_s.map(|d| {
            let epoch = iso_to_epoch_secs(started_at).unwrap() + d;
            // Build an ISO from epoch — simpler to just add seconds textually isn't safe,
            // so use our utility to compute date and format.
            crate::commands::utils::epoch_secs_to_iso_date(epoch) + "T00:00:00Z"
        });
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s, tracking)
             VALUES (?1, ?2, ?3, ?4, ?5, 'auto')",
            params![id, game_id, started_at, ended_at, duration_s],
        )
        .unwrap();
    }

    // ── aggregation tests ────────────────────────────────────────────────────

    #[test]
    fn returns_not_found_for_missing_game() {
        let conn = setup_db();
        let err = get_game_ceremony_data_inner(&conn, "nope").unwrap_err();
        assert!(matches!(err, CommandError::NotFound(_)));
    }

    #[test]
    fn game_with_no_sessions_returns_zeroed_struct() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Empty Game", "completed", 0);

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.game_id, "g1");
        assert_eq!(data.game_name, "Empty Game");
        assert_eq!(data.status, "completed");
        assert!(data.completed, "completed flag should mirror status");
        assert_eq!(data.total_play_time_s, 0);
        assert_eq!(data.total_sessions, 0);
        assert_eq!(data.longest_session_s, 0);
        assert_eq!(data.average_session_s, 0);
        assert_eq!(data.first_played_at, "");
        assert_eq!(data.last_played_at, "");
        assert_eq!(data.days_between_first_and_last, 0);
        assert!(data.play_time_by_month.is_empty());
        assert_eq!(data.play_time_by_day_of_week.len(), 7);
        assert_eq!(data.play_time_by_hour_of_day.len(), 24);
        assert!(data.fun_facts.is_empty());
        assert_eq!(data.mastery_tier, "none");
    }

    #[test]
    fn single_session_aggregates_correctly() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 3600);
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.total_play_time_s, 3600);
        assert_eq!(data.total_sessions, 1);
        assert_eq!(data.longest_session_s, 3600);
        assert_eq!(data.average_session_s, 3600);
        assert_eq!(data.first_played_at, "2026-02-15T10:00:00Z");
        assert_eq!(data.last_played_at, "2026-02-15T10:00:00Z");
        assert_eq!(data.days_between_first_and_last, 0);
        assert_eq!(data.play_time_by_month.len(), 1);
        assert_eq!(data.play_time_by_month[0].month, "2026-02");
        assert_eq!(data.play_time_by_month[0].play_time_s, 3600);
        // Bronze tier = 1h threshold.
        assert_eq!(data.mastery_tier, "bronze");
    }

    #[test]
    fn short_sessions_excluded_by_filter() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 0);
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some(10));
        insert_session(&conn, "s2", "g1", "2026-02-15T11:00:00Z", Some(60));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.total_sessions, 1);
        assert_eq!(data.total_play_time_s, 60);
    }

    #[test]
    fn unended_sessions_excluded_by_filter() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 0);
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s, tracking)
             VALUES ('open', 'g1', '2026-02-15T10:00:00Z', NULL, NULL, 'auto')",
            [],
        )
        .unwrap();
        insert_session(&conn, "s1", "g1", "2026-02-15T11:00:00Z", Some(120));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.total_sessions, 1);
        assert_eq!(data.total_play_time_s, 120);
    }

    #[test]
    fn longest_and_average_computed_correctly() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 0);
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some(1800));
        insert_session(&conn, "s2", "g1", "2026-02-16T10:00:00Z", Some(7200));
        insert_session(&conn, "s3", "g1", "2026-02-17T10:00:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.total_play_time_s, 1800 + 7200 + 3600);
        assert_eq!(data.total_sessions, 3);
        assert_eq!(data.longest_session_s, 7200);
        assert_eq!(data.average_session_s, (1800 + 7200 + 3600) / 3);
    }

    #[test]
    fn days_between_calculated_correctly() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 0);
        insert_session(&conn, "s1", "g1", "2026-01-01T10:00:00Z", Some(3600));
        insert_session(&conn, "s2", "g1", "2026-01-11T10:00:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.days_between_first_and_last, 10);
    }

    #[test]
    fn play_time_by_month_fills_gaps_with_zero() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 0);
        insert_session(&conn, "s1", "g1", "2026-01-10T10:00:00Z", Some(3600));
        insert_session(&conn, "s2", "g1", "2026-04-10T10:00:00Z", Some(7200));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.play_time_by_month.len(), 4);
        assert_eq!(data.play_time_by_month[0].month, "2026-01");
        assert_eq!(data.play_time_by_month[0].play_time_s, 3600);
        assert_eq!(data.play_time_by_month[1].month, "2026-02");
        assert_eq!(data.play_time_by_month[1].play_time_s, 0);
        assert_eq!(data.play_time_by_month[2].month, "2026-03");
        assert_eq!(data.play_time_by_month[2].play_time_s, 0);
        assert_eq!(data.play_time_by_month[3].month, "2026-04");
        assert_eq!(data.play_time_by_month[3].play_time_s, 7200);
    }

    #[test]
    fn day_of_week_is_seven_entries_with_monday_zero() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 0);
        // 2026-01-05 is a Monday.
        insert_session(&conn, "s1", "g1", "2026-01-05T10:00:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.play_time_by_day_of_week.len(), 7);
        assert_eq!(data.play_time_by_day_of_week[0], 3600, "Monday should have 3600s");
        for (i, &v) in data.play_time_by_day_of_week.iter().enumerate() {
            if i != 0 {
                assert_eq!(v, 0, "day {i} should be 0");
            }
        }
    }

    #[test]
    fn hour_of_day_is_twenty_four_entries() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 0);
        insert_session(&conn, "s1", "g1", "2026-02-15T14:00:00Z", Some(3600));
        insert_session(&conn, "s2", "g1", "2026-02-16T14:30:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.play_time_by_hour_of_day.len(), 24);
        assert_eq!(data.play_time_by_hour_of_day[14], 7200);
    }

    #[test]
    fn fun_facts_generate_at_least_two_for_well_played_game() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 50_000);
        // 12 hours over many days → films + marathon + days + weekday + hour facts.
        for i in 0..12 {
            let started = format!("2026-02-{:02}T20:00:00Z", i + 1);
            insert_session(&conn, &format!("s{i}"), "g1", &started, Some(3600));
        }

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert!(
            data.fun_facts.len() >= 2,
            "expected at least 2 fun facts, got {:?}",
            data.fun_facts
        );
        assert!(data.fun_facts.len() <= 4);
    }

    #[test]
    fn mastery_tier_reflects_total_play_time_on_row() {
        let conn = setup_db();
        // Gold tier = 90_000s
        insert_game(&conn, "g1", "Game", "completed", 100_000);
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.mastery_tier, "gold");
    }

    #[test]
    fn archived_game_preserves_completed_flag() {
        // Regression test for: a completed game that was uninstalled has its
        // status flipped to "removed", but `completed` stays = 1. The ceremony
        // must still recognise it as a completed retirement.
        let conn = setup_db();
        insert_game_with_completed(&conn, "g1", "Archived Game", "removed", true, 3600);
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.status, "removed");
        assert!(
            data.completed,
            "archived+completed game should still report completed = true"
        );
        assert_eq!(data.total_sessions, 1);
    }

    #[test]
    fn dropped_game_has_completed_false() {
        let conn = setup_db();
        insert_game_with_completed(&conn, "g1", "Dropped Game", "dropped", false, 3600);
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.status, "dropped");
        assert!(!data.completed);
    }

    #[test]
    fn release_year_extracted_from_release_date() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Game", "completed", 0);
        conn.execute(
            "UPDATE games SET release_date = '2015-05-19' WHERE id = 'g1'",
            [],
        )
        .unwrap();
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some(3600));

        let data = get_game_ceremony_data_inner(&conn, "g1").unwrap();
        assert_eq!(data.release_year.as_deref(), Some("2015"));
    }

    // ── pure helpers ─────────────────────────────────────────────────────────

    #[test]
    fn parse_year_month_handles_valid_iso() {
        assert_eq!(parse_year_month("2026-03-15T10:00:00Z"), Some((2026, 3)));
        assert_eq!(parse_year_month("1970-01-01T00:00:00Z"), Some((1970, 1)));
    }

    #[test]
    fn parse_year_month_rejects_invalid() {
        assert_eq!(parse_year_month("abc"), None);
        assert_eq!(parse_year_month("2026-13-01T00:00:00Z"), None);
    }

    #[test]
    fn parse_release_year_extracts_leading_four_digits() {
        assert_eq!(parse_release_year("2015-05-19"), Some("2015".into()));
        assert_eq!(parse_release_year("2015"), Some("2015".into()));
        assert_eq!(parse_release_year("May 2015"), None);
    }

    #[test]
    fn days_between_iso_computes_whole_days() {
        assert_eq!(
            days_between_iso("2026-01-01T10:00:00Z", "2026-01-11T23:59:00Z"),
            Some(10)
        );
        assert_eq!(
            days_between_iso("2026-01-01T00:00:00Z", "2026-01-01T23:59:59Z"),
            Some(0)
        );
    }

    #[test]
    fn format_hour_12_handles_midnight_and_noon() {
        assert_eq!(format_hour_12(0), "12am");
        assert_eq!(format_hour_12(11), "11am");
        assert_eq!(format_hour_12(12), "12pm");
        assert_eq!(format_hour_12(23), "11pm");
    }

    #[test]
    fn hour_range_label_wraps_at_midnight() {
        assert_eq!(hour_range_label(23), "11pm–12am");
        assert_eq!(hour_range_label(0), "12am–1am");
    }

    #[test]
    fn build_fun_facts_skips_weak_facts() {
        // Short game: no marathon, no films, 0 days_between.
        let facts = build_fun_facts(120, 1, 60, &vec![0; 7], &vec![0; 24], 0);
        assert!(facts.iter().all(|f| !f.contains("marathon")));
        assert!(facts.iter().all(|f| !f.contains("movies")));
    }

    #[test]
    fn build_fun_facts_caps_at_four() {
        let mut dow = vec![0i64; 7];
        dow[2] = 10_000;
        let mut hour = vec![0i64; 24];
        hour[20] = 10_000;
        let facts = build_fun_facts(36_000, 30, 7_200, &dow, &hour, 5);
        assert!(facts.len() <= 4);
    }
}
