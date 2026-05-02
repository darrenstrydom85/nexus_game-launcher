//! Wrapped (Spotify Wrapped–style) report commands.
//! Aggregates play_sessions over a date range into a single summary report.

use rusqlite::{params, OptionalExtension};
use tauri::State;

use super::error::CommandError;
use super::utils::{
    date_only_to_end_epoch_secs, date_only_to_start_epoch_secs, epoch_secs_to_iso_date,
    now_iso,
};
use crate::db::DbState;
use crate::models::wrapped::*;

const SESSION_FILTER: &str = "ended_at IS NOT NULL AND duration_s >= 30";
const SESSION_FILTER_PS: &str = "ps.ended_at IS NOT NULL AND ps.duration_s >= 30";

/// JOIN condition that matches sessions to games via three strategies:
/// 1. Direct ID match (normal case)
/// 2. (source, source_id) natural key (for relinked sessions from store-sourced games)
/// 3. (source, name) match (for standalone/manual games that lack a source_id)
const GAME_JOIN: &str =
    "JOIN games g ON (g.id = ps.game_id) \
     OR (ps.game_source_id IS NOT NULL AND g.source = ps.game_source AND g.source_id = ps.game_source_id) \
     OR (ps.game_source_id IS NULL AND ps.game_name IS NOT NULL AND g.source = ps.game_source AND g.name = ps.game_name)";

const GAME_LEFT_JOIN: &str =
    "LEFT JOIN games g ON (g.id = ps.game_id) \
     OR (ps.game_source_id IS NOT NULL AND g.source = ps.game_source AND g.source_id = ps.game_source_id) \
     OR (ps.game_source_id IS NULL AND ps.game_name IS NOT NULL AND g.source = ps.game_source AND g.name = ps.game_name)";

const MONTH_NAMES: [&str; 12] = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December",
];

/// Resolves a WrappedPeriod to (start_iso, end_iso, period_label). Uses `today_iso` for presets (injectable for tests).
pub(crate) fn resolve_period_to_range(
    period: &WrappedPeriod,
    today_iso: &str,
) -> Result<(String, String, String), CommandError> {
    let today_date = if today_iso.len() >= 10 {
        &today_iso[..10]
    } else {
        return Err(CommandError::Parse("invalid today_iso".into()));
    };

    match period {
        WrappedPeriod::Year(y) => {
            let start = format!("{y}-01-01T00:00:00Z");
            let end = format!("{y}-12-31T23:59:59Z");
            let label = y.to_string();
            Ok((start, end, label))
        }
        WrappedPeriod::Month { year: y, month: m } => {
            let (start, end) = month_range_iso(*y, *m)?;
            let label = format!("{} {}", MONTH_NAMES.get((*m as usize).saturating_sub(1)).unwrap_or(&"?"), y);
            Ok((start, end, label))
        }
        WrappedPeriod::Preset(preset) => {
            preset_range_and_label(preset, today_date).map_err(CommandError::Parse)
        }
        WrappedPeriod::Custom { start_date, end_date } => {
            let start_epoch = date_only_to_start_epoch_secs(start_date).map_err(CommandError::Parse)?;
            let end_epoch = date_only_to_end_epoch_secs(end_date).map_err(CommandError::Parse)?;
            if start_epoch > end_epoch {
                return Err(CommandError::Parse("start_date must be <= end_date".into()));
            }
            let start = format!("{}T00:00:00Z", &start_date.trim()[..10.min(start_date.len())]);
            let end = format!("{}T23:59:59Z", &end_date.trim()[..10.min(end_date.len())]);
            let label = format!("{} – {}", start_date.trim(), end_date.trim());
            Ok((start, end, label))
        }
    }
}

fn month_range_iso(year: i32, month: u8) -> Result<(String, String), CommandError> {
    if month < 1 || month > 12 {
        return Err(CommandError::Parse(format!("invalid month: {month}")));
    }
    let start = format!("{year:04}-{month:02}-01T00:00:00Z");
    let days = days_in_month(year, month);
    let end = format!("{year:04}-{month:02}-{days:02}T23:59:59Z");
    Ok((start, end))
}

fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
            if leap { 29 } else { 28 }
        }
        _ => 28,
    }
}

fn preset_range_and_label(preset: &str, today_date: &str) -> Result<(String, String, String), String> {
    let today_epoch = date_only_to_start_epoch_secs(today_date)?;
    match preset {
        "this_month" => {
            let (y, m) = parse_ymd(today_date)?;
            let (start, end) = month_range_iso(y, m).map_err(|e| e.to_string())?;
            Ok((start, end, "This month".into()))
        }
        "last_month" => {
            let (y, m) = parse_ymd(today_date)?;
            let (prev_y, prev_m) = if m == 1 { (y - 1, 12) } else { (y, m - 1) };
            let (start, end) = month_range_iso(prev_y, prev_m).map_err(|e| e.to_string())?;
            Ok((start, end, "Last month".into()))
        }
        "this_year" => {
            let y: i32 = today_date[..4].parse().map_err(|_| "invalid year")?;
            Ok((
                format!("{y}-01-01T00:00:00Z"),
                format!("{y}-12-31T23:59:59Z"),
                "This year".into(),
            ))
        }
        "last_year" => {
            let y: i32 = today_date[..4].parse().map_err(|_| "invalid year")?;
            let py = y - 1;
            Ok((
                format!("{py}-01-01T00:00:00Z"),
                format!("{py}-12-31T23:59:59Z"),
                "Last year".into(),
            ))
        }
        "last_7_days" => {
            let start_epoch = today_epoch - 6 * 86400;
            let start = format!("{}T00:00:00Z", epoch_secs_to_iso_date(start_epoch));
            let end = format!("{}T23:59:59Z", today_date);
            Ok((start, end, "Last 7 days".into()))
        }
        "last_30_days" => {
            let start_epoch = today_epoch - 29 * 86400;
            let start = format!("{}T00:00:00Z", epoch_secs_to_iso_date(start_epoch));
            let end = format!("{}T23:59:59Z", today_date);
            Ok((start, end, "Last 30 days".into()))
        }
        _ => Err(format!("unknown preset: {preset}")),
    }
}

fn parse_ymd(date: &str) -> Result<(i32, u8), String> {
    if date.len() < 7 {
        return Err("date too short".into());
    }
    let y: i32 = date[..4].parse().map_err(|_| "invalid year")?;
    let m: u8 = date[5..7].parse().map_err(|_| "invalid month")?;
    Ok((y, m))
}

fn get_wrapped_report_inner(
    db: &DbState,
    period: WrappedPeriod,
    today_iso: &str,
) -> Result<WrappedReport, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let today_date = if today_iso.len() >= 10 { &today_iso[..10] } else { "1970-01-01" };
    let (start_iso, end_iso, period_label) = resolve_period_to_range(&period, today_iso)?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // 1) Totals from sessions in range — join to games so orphaned sessions
    //    (old game_id) are resolved via (source, source_id) fallback.
    let (total_play_time_s, total_sessions, total_games_played): (i64, i64, i64) = tx
        .query_row(
            &format!(
                "SELECT
                    COALESCE(SUM(ps.duration_s), 0),
                    COUNT(*),
                    COUNT(DISTINCT COALESCE(g.id, ps.game_id))
                 FROM play_sessions ps
                 {GAME_LEFT_JOIN}
                 WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2",
                SESSION_FILTER_PS
            ),
            params![start_iso, end_iso],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // 2) Total games in library (non-hidden, at report time)
    let total_games_in_library: i64 = tx
        .query_row("SELECT COUNT(*) FROM games WHERE is_hidden = 0", [], |row| row.get(0))
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // 3) New games added in period (added_at in range)
    let new_games_added: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM games WHERE is_hidden = 0 AND added_at >= ?1 AND added_at <= ?2",
            params![start_iso, end_iso],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // 4) New titles in period: games whose first-ever session (MIN(started_at)) falls in range
    let new_titles_in_period: i64 = tx
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM (
                    SELECT COALESCE(g.id, ps.game_id) as gid FROM play_sessions ps
                    {GAME_LEFT_JOIN}
                    WHERE {}
                    GROUP BY gid
                    HAVING MIN(ps.started_at) >= ?1 AND MIN(ps.started_at) <= ?2
                )",
                SESSION_FILTER_PS
            ),
            params![start_iso, end_iso],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // 5) Top games by play time in period (for most_played_game and top_games)
    let top_games_sql = format!(
        "SELECT g.id, g.name, g.cover_url, g.hero_url, g.logo_url, g.source,
                COALESCE(SUM(ps.duration_s), 0) as play_time_s, COUNT(*) as session_count
         FROM play_sessions ps
         {GAME_JOIN}
         WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
         GROUP BY g.id
         ORDER BY play_time_s DESC
         LIMIT 10",
        SESSION_FILTER_PS
    );
    let top_games: Vec<WrappedGame> = tx
        .prepare(&top_games_sql)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map(params![start_iso, end_iso], |row| {
            Ok(WrappedGame {
                id: row.get("id")?,
                name: row.get("name")?,
                cover_url: row.get("cover_url")?,
                hero_url: row.get("hero_url")?,
                logo_url: row.get("logo_url")?,
                play_time_s: row.get("play_time_s")?,
                session_count: row.get("session_count")?,
                source: row.get::<_, String>("source").unwrap_or_else(|_| "unknown".to_string()),
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let most_played_game = top_games.first().cloned();

    // 6) Per-game play time for genre breakdown (we need game_id, play_time_s, genres JSON)
    let per_game_play: Vec<(String, i64, Option<String>)> = tx
        .prepare(&format!(
            "SELECT g.id, COALESCE(SUM(ps.duration_s), 0) as play_time_s, g.genres
             FROM play_sessions ps
             {GAME_JOIN}
             WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
             GROUP BY g.id",
            SESSION_FILTER_PS
        ))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map(params![start_iso, end_iso], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let (genre_breakdown, most_played_genre, genre_tagline) = build_genre_breakdown(&per_game_play);

    // 7) Platform breakdown: GROUP BY source, SUM(duration_s)
    let platform_rows: Vec<(String, i64)> = tx
        .prepare(&format!(
            "SELECT COALESCE(g.source, 'unknown') as src, COALESCE(SUM(ps.duration_s), 0) as play_time_s
             FROM play_sessions ps
             {GAME_JOIN}
             WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
             GROUP BY g.source",
            SESSION_FILTER_PS
        ))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map(params![start_iso, end_iso], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let total_for_pct = total_play_time_s.max(1);
    let platform_breakdown: Vec<PlatformShare> = platform_rows
        .into_iter()
        .map(|(source, play_time_s)| {
            let percent = 100.0 * (play_time_s as f64) / (total_for_pct as f64);
            PlatformShare { source, play_time_s, percent }
        })
        .collect();

    // 8) Longest session in period
    let longest_session: Option<WrappedSession> = tx
        .query_row(
            &format!(
                "SELECT COALESCE(g.id, ps.game_id) as gid, COALESCE(g.name, ps.game_name, 'Unknown') as game_name,
                        ps.started_at, ps.duration_s
                 FROM play_sessions ps
                 {GAME_LEFT_JOIN}
                 WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
                 ORDER BY ps.duration_s DESC
                 LIMIT 1",
                SESSION_FILTER_PS
            ),
            params![start_iso, end_iso],
            |row| {
                Ok(WrappedSession {
                    game_id: row.get(0)?,
                    game_name: row.get(1)?,
                    started_at: row.get(2)?,
                    duration_s: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                })
            },
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // 9) Distinct session dates for streak (Rust loop)
    let distinct_dates: Vec<String> = tx
        .prepare(&format!(
            "SELECT DISTINCT date(started_at) as d FROM play_sessions
             WHERE {} AND started_at >= ?1 AND started_at <= ?2 ORDER BY d",
            SESSION_FILTER
        ))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map(params![start_iso, end_iso], |row| row.get::<_, String>(0))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let longest_streak_days = compute_longest_streak(&distinct_dates);

    // 10) Busiest day
    let busiest_row: Option<(String, i64)> = tx
        .query_row(
            &format!(
                "SELECT date(started_at) as d, COALESCE(SUM(duration_s), 0) as t
                 FROM play_sessions WHERE {} AND started_at >= ?1 AND started_at <= ?2
                 GROUP BY d ORDER BY t DESC LIMIT 1",
                SESSION_FILTER
            ),
            params![start_iso, end_iso],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let (busiest_day, busiest_day_play_time_s) = busiest_row.unwrap_or((String::new(), 0));

    // 11) First and last game played in period
    let first_game: Option<WrappedGame> = tx
        .query_row(
            &format!(
                "SELECT g.id, g.name, g.cover_url, g.hero_url, g.logo_url, g.source,
                        COALESCE(SUM(ps.duration_s), 0) as play_time_s, COUNT(*) as session_count
                 FROM play_sessions ps {GAME_JOIN}
                 WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
                 GROUP BY g.id
                 ORDER BY MIN(ps.started_at) ASC LIMIT 1",
                SESSION_FILTER_PS
            ),
            params![start_iso, end_iso],
            |row| {
                Ok(WrappedGame {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    cover_url: row.get(2)?,
                    hero_url: row.get(3)?,
                    logo_url: row.get(4)?,
                    play_time_s: row.get(6)?,
                    session_count: row.get(7)?,
                    source: row.get::<_, String>(5).unwrap_or_else(|_| "unknown".to_string()),
                })
            },
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let last_game: Option<WrappedGame> = tx
        .query_row(
            &format!(
                "SELECT g.id, g.name, g.cover_url, g.hero_url, g.logo_url, g.source,
                        COALESCE(SUM(ps.duration_s), 0) as play_time_s, COUNT(*) as session_count
                 FROM play_sessions ps {GAME_JOIN}
                 WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
                 GROUP BY g.id
                 ORDER BY MAX(ps.started_at) DESC LIMIT 1",
                SESSION_FILTER_PS
            ),
            params![start_iso, end_iso],
            |row| {
                Ok(WrappedGame {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    cover_url: row.get(2)?,
                    hero_url: row.get(3)?,
                    logo_url: row.get(4)?,
                    play_time_s: row.get(6)?,
                    session_count: row.get(7)?,
                    source: row.get::<_, String>(5).unwrap_or_else(|_| "unknown".to_string()),
                })
            },
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // 12) play_time_by_month (12 entries for year, 1 for month)
    let play_time_by_month: Vec<MonthBucket> = match &period {
        WrappedPeriod::Year(_) => {
            let mut buckets: Vec<(u8, i64)> = (1..=12).map(|m| (m as u8, 0i64)).collect();
            let rows: Vec<(i64, i64)> = tx
                .prepare(
                    "SELECT CAST(strftime('%m', started_at) AS INTEGER) as mo, COALESCE(SUM(duration_s), 0) as t
                     FROM play_sessions WHERE ended_at IS NOT NULL AND duration_s >= 30
                     AND started_at >= ?1 AND started_at <= ?2 GROUP BY mo",
                )
                .map_err(|e| CommandError::Database(e.to_string()))?
                .query_map(params![start_iso, end_iso], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| CommandError::Database(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| CommandError::Database(e.to_string()))?;
            for (mo, t) in rows {
                if (1..=12).contains(&mo) {
                    buckets[(mo - 1) as usize].1 = t;
                }
            }
            buckets.into_iter().map(|(month, play_time_s)| MonthBucket { month, play_time_s }).collect()
        }
        _ => {
            if let Ok((_, m)) = parse_ymd(if start_iso.len() >= 10 { &start_iso[..10] } else { "" }) {
                vec![MonthBucket { month: m, play_time_s: total_play_time_s }]
            } else {
                vec![]
            }
        }
    };

    // 13) play_time_by_day_of_week (0=Monday; SQLite %w: 0=Sun, 1=Mon -> (w+6)%7 gives 0=Mon)
    let dow_sql = format!(
        "SELECT (CAST(strftime('%w', started_at) AS INTEGER) + 6) % 7 as dow, COALESCE(SUM(duration_s), 0) as t
         FROM play_sessions WHERE {} AND started_at >= ?1 AND started_at <= ?2 GROUP BY dow",
        SESSION_FILTER
    );
    let mut day_buckets = vec![(0u8, 0i64); 7];
    for (dow, t) in tx
        .prepare(&dow_sql)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map(params![start_iso, end_iso], |row| Ok((row.get::<_, i64>(0)? as u8, row.get(1)?)))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?
    {
        if (0..7).contains(&dow) {
            day_buckets[dow as usize].1 = t;
        }
    }
    let play_time_by_day_of_week: Vec<DayBucket> = day_buckets
        .into_iter()
        .enumerate()
        .map(|(day, (_, play_time_s))| DayBucket { day: day as u8, play_time_s })
        .collect();

    // 14) play_time_by_hour_of_day
    let hour_sql = format!(
        "SELECT CAST(strftime('%H', started_at) AS INTEGER) as h, COALESCE(SUM(duration_s), 0) as t
         FROM play_sessions WHERE {} AND started_at >= ?1 AND started_at <= ?2 GROUP BY h",
        SESSION_FILTER
    );
    let mut hour_buckets = vec![0i64; 24];
    for (h, t) in tx
        .prepare(&hour_sql)
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map(params![start_iso, end_iso], |row| Ok((row.get::<_, i64>(0)?, row.get(1)?)))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::Database(e.to_string()))?
    {
        if (0..24).contains(&h) {
            hour_buckets[h as usize] = t;
        }
    }
    let play_time_by_hour_of_day: Vec<HourBucket> = hour_buckets
        .into_iter()
        .enumerate()
        .map(|(hour, play_time_s)| HourBucket { hour: hour as u8, play_time_s })
        .collect();

    // 15) Fun facts (marathons = 4h, full days, feature films ~2h)
    let fun_facts = build_fun_facts(total_play_time_s);

    // 16) Comparison to previous period (for presets only)
    let comparison_previous_period = if let WrappedPeriod::Preset(preset) = &period {
        compute_comparison_previous(&tx, preset, &start_iso, &end_iso, total_play_time_s, today_date)
            .ok()
            .flatten()
    } else {
        None
    };

    // 17) Mood tagline from top genres
    let mood_tagline = build_mood_tagline(&genre_breakdown);

    // 18) Hidden gem: low-rated but highly played
    let hidden_gem = build_hidden_gem(&tx, &start_iso, &end_iso);

    // 19) Trivia from game metadata
    let period_year = match &period {
        WrappedPeriod::Year(y) => Some(*y),
        WrappedPeriod::Month { year, .. } => Some(*year),
        _ => today_date[..4].parse::<i32>().ok(),
    };
    let trivia = build_trivia(&tx, &start_iso, &end_iso, &most_played_game, period_year);

    tx.commit().map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(WrappedReport {
        period_label,
        total_play_time_s,
        total_sessions,
        total_games_played,
        total_games_in_library,
        new_games_added,
        new_titles_in_period,
        most_played_game,
        most_played_genre: most_played_genre.clone(),
        top_games,
        genre_breakdown,
        genre_tagline,
        platform_breakdown,
        longest_session,
        longest_streak_days,
        busiest_day: if busiest_day.is_empty() { None } else { Some(busiest_day) },
        busiest_day_play_time_s,
        first_game_played: first_game,
        last_game_played: last_game,
        play_time_by_month,
        play_time_by_day_of_week,
        play_time_by_hour_of_day,
        fun_facts,
        comparison_previous_period,
        mood_tagline,
        hidden_gem,
        trivia,
    })
}

#[tauri::command]
pub fn get_wrapped_report(db: State<'_, DbState>, period: WrappedPeriod) -> Result<WrappedReport, CommandError> {
    get_wrapped_report_inner(&db, period, &now_iso())
}

fn parse_genres(raw: &str) -> Vec<String> {
    if let Ok(parsed) = serde_json::from_str::<Vec<String>>(raw) {
        return parsed;
    }
    raw.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn build_genre_breakdown(
    per_game_play: &[(String, i64, Option<String>)],
) -> (Vec<GenreShare>, Option<String>, Option<String>) {
    let mut by_genre: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for (_, play_time_s, genres_raw) in per_game_play {
        let names: Vec<String> = match genres_raw.as_deref() {
            None | Some("") => continue,
            Some(s) => parse_genres(s),
        };
        for name in names {
            if !name.is_empty() {
                *by_genre.entry(name).or_insert(0) += play_time_s;
            }
        }
    }
    let total: i64 = by_genre.values().sum::<i64>().max(1);
    let mut list: Vec<GenreShare> = by_genre
        .into_iter()
        .map(|(name, play_time_s)| {
            let percent = 100.0 * (play_time_s as f64) / (total as f64);
            GenreShare { name, play_time_s, percent }
        })
        .collect();
    list.sort_by(|a, b| b.play_time_s.cmp(&a.play_time_s));
    let list = list.into_iter().take(8).collect::<Vec<_>>();
    let top_name = list.first().map(|g| g.name.clone());
    let tagline = top_name.as_ref().and_then(|name| genre_tagline(name));
    (list, top_name, tagline)
}

fn genre_tagline(genre: &str) -> Option<String> {
    let s = genre.to_lowercase();
    let t = if s.contains("action") { "You're a true action hero" }
    else if s.contains("rpg") || s.contains("role") { "You're a true adventurer at heart" }
    else if s.contains("strategy") { "A master strategist" }
    else if s.contains("puzzle") { "You love a good brain teaser" }
    else if s.contains("adventure") { "You're a true adventurer at heart" }
    else if s.contains("racing") { "Speed is your middle name" }
    else if s.contains("sport") { "You bring the competitive spirit" }
    else { "You have great taste in games" };
    Some(t.to_string())
}

fn compute_longest_streak(dates: &[String]) -> i64 {
    if dates.is_empty() {
        return 0;
    }
    let mut sorted: Vec<&str> = dates.iter().map(String::as_str).collect();
    sorted.sort();
    sorted.dedup();
    let mut max_streak = 1i64;
    let mut streak = 1i64;
    for i in 1..sorted.len() {
        let prev = sorted[i - 1];
        let curr = sorted[i];
        let prev_epoch = date_only_to_start_epoch_secs(prev).unwrap_or(0);
        let curr_epoch = date_only_to_start_epoch_secs(curr).unwrap_or(0);
        if curr_epoch == prev_epoch + 86400 {
            streak += 1;
        } else {
            max_streak = max_streak.max(streak);
            streak = 1;
        }
    }
    max_streak.max(streak)
}

/// User-rating threshold (1-5 scale) at or below which a game qualifies as a
/// "hidden gem" candidate. Only games the user has rated are considered.
const HIDDEN_GEM_RATING_THRESHOLD: i64 = 3;

fn build_mood_tagline(genre_breakdown: &[GenreShare]) -> Option<String> {
    if genre_breakdown.is_empty() {
        return None;
    }

    fn mood_phrase(genre: &str) -> &'static str {
        let s = genre.to_lowercase();
        if s.contains("rpg") || s.contains("role") {
            "You're a true adventurer at heart"
        } else if s.contains("action") {
            "You lived for the action this period"
        } else if s.contains("puzzle") {
            "Mostly chill vibes with puzzle games"
        } else if s.contains("strategy") {
            "A master strategist through and through"
        } else if s.contains("adventure") {
            "Always chasing the next great story"
        } else if s.contains("racing") || s.contains("driving") {
            "Speed is your middle name"
        } else if s.contains("sport") {
            "You brought the competitive spirit"
        } else if s.contains("simulation") || s.contains("sim") {
            "Building worlds, one session at a time"
        } else if s.contains("shooter") || s.contains("fps") {
            "Locked, loaded, and ready to play"
        } else if s.contains("horror") {
            "You love a good scare"
        } else if s.contains("indie") {
            "An indie connoisseur at heart"
        } else if s.contains("platformer") {
            "Jumping through challenges like a pro"
        } else {
            "You have great taste in games"
        }
    }

    let top = &genre_breakdown[0].name;
    if genre_breakdown.len() >= 2 && genre_breakdown[1].percent >= 20.0 {
        let second = &genre_breakdown[1].name;
        Some(format!(
            "{} — with a side of {}",
            mood_phrase(top),
            second.to_lowercase()
        ))
    } else {
        Some(mood_phrase(top).to_string())
    }
}

fn build_hidden_gem(
    tx: &rusqlite::Transaction,
    start_iso: &str,
    end_iso: &str,
) -> Option<HiddenGem> {
    let sql = format!(
        "SELECT g.id, g.name, g.rating, COALESCE(SUM(ps.duration_s), 0) as pt
         FROM play_sessions ps
         {GAME_JOIN}
         WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
           AND g.rating IS NOT NULL AND g.rating <= ?3
         GROUP BY g.id
         ORDER BY pt DESC
         LIMIT 1",
        SESSION_FILTER_PS
    );

    tx.query_row(
        &sql,
        rusqlite::params![start_iso, end_iso, HIDDEN_GEM_RATING_THRESHOLD],
        |row| {
            let game_id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let rating: Option<i64> = row.get(2)?;
            let play_time_s: i64 = row.get(3)?;
            let hours = play_time_s as f64 / 3600.0;
            let tagline = match rating {
                Some(r) => format!(
                    "You put {:.1}h into a {}/5-rated title",
                    hours, r
                ),
                None => format!("You put {:.1}h into a low-rated title", hours),
            };
            Ok(HiddenGem {
                game_id,
                name,
                play_time_s,
                rating: rating.map(|r| r as f64),
                tagline,
            })
        },
    )
    .ok()
}

fn build_trivia(
    tx: &rusqlite::Transaction,
    start_iso: &str,
    end_iso: &str,
    most_played: &Option<WrappedGame>,
    period_year: Option<i32>,
) -> Vec<String> {
    let mut trivia: Vec<String> = Vec::new();

    if let Some(game) = most_played {
        let rating: Option<i64> = tx
            .query_row(
                "SELECT rating FROM games WHERE id = ?1",
                rusqlite::params![game.id],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        if let Some(r) = rating {
            trivia.push(format!("Your top game has a {}/5 rating", r));
        }
    }

    if let Some(year) = period_year {
        let year_str = year.to_string();
        let count: i64 = tx
            .query_row(
                &format!(
                    "SELECT COUNT(DISTINCT g.id)
                     FROM play_sessions ps
                     {GAME_JOIN}
                     WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
                       AND g.release_date LIKE ?3",
                    SESSION_FILTER_PS
                ),
                rusqlite::params![start_iso, end_iso, format!("{}%", year_str)],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if count > 0 {
            trivia.push(format!(
                "You played {} {} that released in {}",
                count,
                if count == 1 { "game" } else { "games" },
                year
            ));
        }
    }

    let oldest: Option<(String, String)> = tx
        .query_row(
            &format!(
                "SELECT g.name, g.release_date
                 FROM play_sessions ps
                 {GAME_JOIN}
                 WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
                   AND g.release_date IS NOT NULL AND g.release_date != ''
                 ORDER BY g.release_date ASC
                 LIMIT 1",
                SESSION_FILTER_PS
            ),
            rusqlite::params![start_iso, end_iso],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();
    if let Some((name, date)) = oldest {
        let year_part = &date[..4.min(date.len())];
        if year_part.len() == 4 {
            trivia.push(format!(
                "Your oldest game played was {} ({})",
                name, year_part
            ));
        }
    }

    trivia.truncate(3);
    trivia
}

fn build_fun_facts(total_play_time_s: i64) -> Vec<FunFact> {
    let mut facts = vec![];
    const MARATHON_HOURS: f64 = 4.0;
    let marathons = (total_play_time_s as f64) / (MARATHON_HOURS * 3600.0);
    if marathons >= 0.1 {
        facts.push(FunFact {
            kind: "marathons".into(),
            value: (marathons * 10.0).round() / 10.0,
            label: format!("That's equivalent to {:.1} marathons (4h each)", marathons),
        });
    }
    let full_days = (total_play_time_s as f64) / 86400.0;
    if full_days >= 0.5 {
        facts.push(FunFact {
            kind: "full_days".into(),
            value: (full_days * 10.0).round() / 10.0,
            label: format!("That's {:.1} full days of gaming", full_days),
        });
    }
    const FEATURE_FILM_MINUTES: f64 = 120.0;
    let films = (total_play_time_s as f64) / (FEATURE_FILM_MINUTES * 60.0);
    if films >= 0.5 {
        facts.push(FunFact {
            kind: "feature_films".into(),
            value: (films * 10.0).round() / 10.0,
            label: format!("That's {:.1} feature-length films (2h each)", films),
        });
    }
    facts
}

fn compute_comparison_previous(
    tx: &rusqlite::Transaction,
    preset: &str,
    _start_iso: &str,
    _end_iso: &str,
    current_total_s: i64,
    today_date: &str,
) -> Result<Option<Comparison>, CommandError> {
    let (prev_start, prev_end, label_suffix): (String, String, String) = match preset {
        "this_month" => {
            let (y, m) = parse_ymd(today_date).map_err(CommandError::Parse)?;
            let (prev_y, prev_m) = if m == 1 { (y - 1, 12) } else { (y, m - 1) };
            let (s, e) = month_range_iso(prev_y, prev_m)?;
            (s, e, "last month".to_string())
        }
        "last_month" => {
            let (y, m) = parse_ymd(today_date).map_err(CommandError::Parse)?;
            let (prev_y, prev_m) = if m == 1 { (y - 1, 11) } else if m == 2 { (y - 1, 12) } else { (y, m - 2) };
            let (s, e) = month_range_iso(prev_y, prev_m)?;
            (s, e, "the month before".to_string())
        }
        "this_year" => {
            let y: i32 = today_date[..4].parse().map_err(|_| CommandError::Parse("invalid year".into()))?;
            let py = y - 1;
            (
                format!("{py}-01-01T00:00:00Z"),
                format!("{py}-12-31T23:59:59Z"),
                "last year".to_string(),
            )
        }
        "last_year" => {
            let y: i32 = today_date[..4].parse().map_err(|_| CommandError::Parse("invalid year".into()))?;
            let py = y - 2;
            (
                format!("{py}-01-01T00:00:00Z"),
                format!("{py}-12-31T23:59:59Z"),
                "the year before".to_string(),
            )
        }
        _ => return Ok(None),
    };

    let previous_total_s: i64 = tx
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(duration_s), 0) FROM play_sessions
                 WHERE {} AND started_at >= ?1 AND started_at <= ?2",
                SESSION_FILTER
            ),
            params![prev_start, prev_end],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    if previous_total_s == 0 {
        return Ok(Some(Comparison {
            previous_total_s: 0,
            percent_change: 0.0,
            label: format!("No data for {}", label_suffix),
        }));
    }

    let diff = current_total_s - previous_total_s;
    let percent_change = 100.0 * (diff as f64) / (previous_total_s as f64);
    let label = if diff >= 0 {
        format!("Up {:.0}% from {}", percent_change, label_suffix)
    } else {
        format!("Down {:.0}% from {}", -percent_change, label_suffix)
    };
    Ok(Some(Comparison {
        previous_total_s,
        percent_change,
        label,
    }))
}

fn get_available_wrapped_periods_inner(db: &DbState) -> Result<AvailableWrappedPeriods, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let years_with_sessions: Vec<i32> = conn
        .prepare(&format!(
            "SELECT DISTINCT CAST(strftime('%Y', started_at) AS INTEGER) as y FROM play_sessions
             WHERE {} ORDER BY y ASC",
            SESSION_FILTER
        ))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| CommandError::Database(e.to_string()))?
        .filter_map(|r| r.ok())
        .filter(|y: &i64| *y >= 1970 && *y <= 2100)
        .map(|y| y as i32)
        .collect();

    let now = now_iso();
    let today = if now.len() >= 10 { &now[..10] } else { "1970-01-01" };

    let (this_month_start, this_month_end) = {
        let (y, m) = parse_ymd(today).unwrap_or((1970, 1));
        month_range_iso(y, m).unwrap_or((format!("{y}-01-01T00:00:00Z"), format!("{y}-01-31T23:59:59Z")))
    };
    let this_month_has_data: bool = conn
        .query_row(
            &format!(
                "SELECT 1 FROM play_sessions WHERE {} AND started_at >= ?1 AND started_at <= ?2 LIMIT 1",
                SESSION_FILTER
            ),
            params![this_month_start, this_month_end],
            |row| row.get::<_, i32>(0),
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?
        .is_some();

    let (last_month_start, last_month_end) = {
        let (y, m) = parse_ymd(today).unwrap_or((1970, 1));
        let (py, pm) = if m == 1 { (y - 1, 12) } else { (y, m - 1) };
        month_range_iso(py, pm).unwrap_or((format!("{py}-01-01T00:00:00Z"), format!("{py}-01-31T23:59:59Z")))
    };
    let last_month_has_data: bool = conn
        .query_row(
            &format!(
                "SELECT 1 FROM play_sessions WHERE {} AND started_at >= ?1 AND started_at <= ?2 LIMIT 1",
                SESSION_FILTER
            ),
            params![last_month_start, last_month_end],
            |row| row.get::<_, i32>(0),
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?
        .is_some();

    let y: i32 = today[..4].parse().unwrap_or(1970);
    let this_year_has_data: bool = conn
        .query_row(
            &format!(
                "SELECT 1 FROM play_sessions WHERE {} AND started_at >= ?1 AND started_at <= ?2 LIMIT 1",
                SESSION_FILTER
            ),
            params![format!("{y}-01-01T00:00:00Z"), format!("{y}-12-31T23:59:59Z")],
            |row| row.get::<_, i32>(0),
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?
        .is_some();

    let last_year_has_data: bool = conn
        .query_row(
            &format!(
                "SELECT 1 FROM play_sessions WHERE {} AND started_at >= ?1 AND started_at <= ?2 LIMIT 1",
                SESSION_FILTER
            ),
            params![format!("{}-01-01T00:00:00Z", y - 1), format!("{}-12-31T23:59:59Z", y - 1)],
            |row| row.get::<_, i32>(0),
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?
        .is_some();

    Ok(AvailableWrappedPeriods {
        years_with_sessions,
        this_month_has_data,
        last_month_has_data,
        this_year_has_data,
        last_year_has_data,
    })
}

#[tauri::command]
pub fn get_available_wrapped_periods(db: State<'_, DbState>) -> Result<AvailableWrappedPeriods, CommandError> {
    get_available_wrapped_periods_inner(&db)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use rusqlite::params;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_game(
        conn: &rusqlite::Connection,
        id: &str,
        name: &str,
        source: &str,
        added_at: &str,
        genres: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at, genres) VALUES (?1, ?2, ?3, 'backlog', ?4, ?4, ?5)",
            params![id, name, source, added_at, genres],
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
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s, tracking) VALUES (?1, ?2, ?3, ?4, ?5, 'auto')",
            params![id, game_id, started_at, ended_at, duration_s],
        )
        .unwrap();
    }

    #[test]
    fn empty_period_returns_zero_report() {
        let state = setup_db();
        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert_eq!(report.period_label, "2026");
        assert_eq!(report.total_play_time_s, 0);
        assert_eq!(report.total_sessions, 0);
        assert_eq!(report.total_games_played, 0);
        assert_eq!(report.longest_streak_days, 0);
        assert!(report.top_games.is_empty());
        assert!(report.most_played_game.is_none());
    }

    #[test]
    fn single_session_in_period() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game One", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(
            &conn,
            "s1",
            "g1",
            "2026-02-15T10:00:00Z",
            Some("2026-02-15T11:00:00Z"),
            Some(3600),
        );
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert_eq!(report.total_play_time_s, 3600);
        assert_eq!(report.total_sessions, 1);
        assert_eq!(report.total_games_played, 1);
        assert_eq!(report.top_games.len(), 1);
        assert_eq!(report.top_games[0].name, "Game One");
        assert_eq!(report.top_games[0].play_time_s, 3600);
    }

    #[test]
    fn preset_this_month_resolves_correct_range() {
        let (start, end, label) =
            resolve_period_to_range(&WrappedPeriod::Preset("this_month".into()), "2026-03-05T00:00:00Z").unwrap();
        assert_eq!(start, "2026-03-01T00:00:00Z");
        assert!(end.starts_with("2026-03-31T23:59:59"));
        assert_eq!(label, "This month");
    }

    #[test]
    fn preset_last_month_resolves_correct_range() {
        let (start, end, label) =
            resolve_period_to_range(&WrappedPeriod::Preset("last_month".into()), "2026-03-05T00:00:00Z").unwrap();
        assert_eq!(start, "2026-02-01T00:00:00Z");
        assert!(end.starts_with("2026-02-28")); // 2026 not leap
        assert_eq!(label, "Last month");
    }

    #[test]
    fn custom_range_boundary() {
        let (start, end, _) = resolve_period_to_range(
            &WrappedPeriod::Custom {
                start_date: "2026-01-10".into(),
                end_date: "2026-01-20".into(),
            },
            "2026-03-05T00:00:00Z",
        )
        .unwrap();
        assert_eq!(start, "2026-01-10T00:00:00Z");
        assert_eq!(end, "2026-01-20T23:59:59Z");
    }

    #[test]
    fn streak_one_day() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-10T10:00:00Z", Some("2026-02-10T11:00:00Z"), Some(3600));
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert_eq!(report.longest_streak_days, 1);
    }

    #[test]
    fn streak_seven_consecutive_days() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game", "steam", "2026-01-01T00:00:00Z", None);
        for d in 10..=16 {
            insert_session(
                &conn,
                &format!("s{d}"),
                "g1",
                &format!("2026-02-{d:02}T10:00:00Z"),
                Some(&format!("2026-02-{d:02}T11:00:00Z")),
                Some(3600),
            );
        }
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert_eq!(report.longest_streak_days, 7);
    }

    #[test]
    fn sessions_below_30s_excluded() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some("2026-02-15T10:00:20Z"), Some(20));
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert_eq!(report.total_sessions, 0);
        assert_eq!(report.total_play_time_s, 0);
    }

    #[test]
    fn orphaned_sessions_excluded() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", None, None);
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert_eq!(report.total_sessions, 0);
    }

    #[test]
    fn fun_facts_marathons() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game", "steam", "2026-01-01T00:00:00Z", None);
        // 4h = 1 marathon
        insert_session(&conn, "s1", "g1", "2026-02-15T10:00:00Z", Some("2026-02-15T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        let marathons = report.fun_facts.iter().find(|f| f.kind == "marathons").unwrap();
        assert!((marathons.value - 1.0).abs() < 0.01);
    }

    #[test]
    fn new_titles_in_period_only_first_session() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "A", "steam", "2026-01-01T00:00:00Z", None);
        insert_game(&conn, "g2", "B", "steam", "2026-01-01T00:00:00Z", None);
        // g1: first session in 2025, second in 2026 Feb -> not "new" in 2026
        insert_session(&conn, "s1", "g1", "2025-06-01T10:00:00Z", Some("2025-06-01T11:00:00Z"), Some(3600));
        insert_session(&conn, "s2", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T11:00:00Z"), Some(3600));
        // g2: first session in 2026 Feb -> new in 2026
        insert_session(&conn, "s3", "g2", "2026-02-15T10:00:00Z", Some("2026-02-15T11:00:00Z"), Some(3600));
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert_eq!(report.new_titles_in_period, 1);
    }

    #[test]
    fn platform_breakdown_sums_to_100() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "A", "steam", "2026-01-01T00:00:00Z", None);
        insert_game(&conn, "g2", "B", "epic", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T11:00:00Z"), Some(3600));
        insert_session(&conn, "s2", "g2", "2026-02-01T12:00:00Z", Some("2026-02-01T13:00:00Z"), Some(3600));
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        let total_pct: f64 = report.platform_breakdown.iter().map(|p| p.percent).sum();
        assert!((total_pct - 100.0).abs() < 0.01);
    }

    #[test]
    fn genre_breakdown_from_json() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(
            &conn,
            "g1",
            "RPG Game",
            "steam",
            "2026-01-01T00:00:00Z",
            Some(r#"["RPG", "Adventure"]"#),
        );
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T11:00:00Z"), Some(3600));
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert!(!report.genre_breakdown.is_empty());
        let names: Vec<&str> = report.genre_breakdown.iter().map(|g| g.name.as_str()).collect();
        assert!(names.contains(&"RPG"));
        assert!(names.contains(&"Adventure"));
    }

    #[test]
    fn genre_breakdown_from_comma_separated() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(
            &conn,
            "g1",
            "Action Game",
            "steam",
            "2026-01-01T00:00:00Z",
            Some("Action,Strategy,Indie"),
        );
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T11:00:00Z"), Some(3600));
        drop(conn);

        let report = get_wrapped_report_inner(
            &state,
            WrappedPeriod::Year(2026),
            "2026-03-05T12:00:00Z",
        )
        .unwrap();
        assert!(!report.genre_breakdown.is_empty());
        let names: Vec<&str> = report.genre_breakdown.iter().map(|g| g.name.as_str()).collect();
        assert!(names.contains(&"Action"));
        assert!(names.contains(&"Strategy"));
        assert!(names.contains(&"Indie"));
    }

    #[test]
    fn mood_tagline_from_comma_separated_genres() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "RPG Game", "steam", "2026-01-01T00:00:00Z", Some("RPG,Adventure"));
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert!(report.mood_tagline.is_some(), "mood_tagline should be set for comma-separated genres");
        assert!(!report.genre_breakdown.is_empty(), "genre_breakdown should be populated from comma-separated genres");
    }

    #[test]
    fn get_available_wrapped_periods_returns_years() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T11:00:00Z"), Some(3600));
        drop(conn);

        let avail = get_available_wrapped_periods_inner(&state).unwrap();
        assert!(avail.years_with_sessions.contains(&2026));
    }

    fn insert_game_full(
        conn: &rusqlite::Connection,
        id: &str,
        name: &str,
        source: &str,
        added_at: &str,
        genres: Option<&str>,
        rating: Option<i64>,
        release_date: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at, genres, rating, release_date) VALUES (?1, ?2, ?3, 'backlog', ?4, ?4, ?5, ?6, ?7)",
            params![id, name, source, added_at, genres, rating, release_date],
        )
        .unwrap();
    }

    // --- Story 16.4: mood tagline tests ---

    #[test]
    fn mood_tagline_rpg_top_genre() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "RPG Game", "steam", "2026-01-01T00:00:00Z", Some(r#"["RPG"]"#));
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        let tagline = report.mood_tagline.unwrap();
        assert!(tagline.contains("adventurer"), "expected adventurer phrase, got: {tagline}");
    }

    #[test]
    fn mood_tagline_puzzle_top_genre() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Puzzle Game", "steam", "2026-01-01T00:00:00Z", Some(r#"["Puzzle"]"#));
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        let tagline = report.mood_tagline.unwrap();
        assert!(tagline.contains("chill vibes"), "expected chill vibes phrase, got: {tagline}");
    }

    #[test]
    fn mood_tagline_action_top_genre() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Action Game", "steam", "2026-01-01T00:00:00Z", Some(r#"["Action"]"#));
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        let tagline = report.mood_tagline.unwrap();
        assert!(tagline.contains("action"), "expected action phrase, got: {tagline}");
    }

    #[test]
    fn mood_tagline_none_when_no_genres() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert!(report.mood_tagline.is_none());
    }

    #[test]
    fn mood_tagline_includes_second_genre_when_significant() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "RPG Game", "steam", "2026-01-01T00:00:00Z", Some(r#"["RPG", "Strategy"]"#));
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        let tagline = report.mood_tagline.unwrap();
        assert!(tagline.contains("side of"), "expected second genre mention, got: {tagline}");
    }

    // --- Story 16.4: hidden gem tests ---

    #[test]
    fn hidden_gem_found_when_low_rated_high_play() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_full(&conn, "g1", "Popular Game", "steam", "2026-01-01T00:00:00Z", None, Some(5), None);
        insert_game_full(&conn, "g2", "Hidden Gem", "steam", "2026-01-01T00:00:00Z", None, Some(2), None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T11:00:00Z"), Some(3600));
        insert_session(&conn, "s2", "g2", "2026-02-01T12:00:00Z", Some("2026-02-01T16:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        let gem = report.hidden_gem.unwrap();
        assert_eq!(gem.name, "Hidden Gem");
        assert_eq!(gem.play_time_s, 14400);
        assert!((gem.rating.unwrap() - 2.0).abs() < 0.01);
        assert!(gem.tagline.contains("2/5-rated"), "tagline should mention rating, got: {}", gem.tagline);
    }

    #[test]
    fn hidden_gem_none_when_no_low_rated_game() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_full(&conn, "g1", "Great Game", "steam", "2026-01-01T00:00:00Z", None, Some(5), None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert!(report.hidden_gem.is_none());
    }

    #[test]
    fn hidden_gem_none_when_no_ratings() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Unrated Game", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert!(report.hidden_gem.is_none());
    }

    #[test]
    fn hidden_gem_picks_highest_play_time_among_low_rated() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_full(&conn, "g1", "Low A", "steam", "2026-01-01T00:00:00Z", None, Some(2), None);
        insert_game_full(&conn, "g2", "Low B", "steam", "2026-01-01T00:00:00Z", None, Some(1), None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T11:00:00Z"), Some(3600));
        insert_session(&conn, "s2", "g2", "2026-02-01T12:00:00Z", Some("2026-02-01T16:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        let gem = report.hidden_gem.unwrap();
        assert_eq!(gem.name, "Low B");
        assert_eq!(gem.play_time_s, 14400);
    }

    // --- Story 16.4: trivia tests ---

    #[test]
    fn trivia_includes_top_game_rating() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_full(&conn, "g1", "Rated Game", "steam", "2026-01-01T00:00:00Z", None, Some(4), None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert!(!report.trivia.is_empty(), "trivia should not be empty");
        assert!(report.trivia.iter().any(|t| t.contains("4/5")), "expected rating trivia, got: {:?}", report.trivia);
    }

    #[test]
    fn trivia_includes_release_year_count() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_full(&conn, "g1", "New Game", "steam", "2026-01-01T00:00:00Z", None, None, Some("2026-06-15"));
        insert_game_full(&conn, "g2", "Old Game", "steam", "2026-01-01T00:00:00Z", None, None, Some("2020-01-01"));
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        insert_session(&conn, "s2", "g2", "2026-02-01T15:00:00Z", Some("2026-02-01T16:00:00Z"), Some(3600));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert!(report.trivia.iter().any(|t| t.contains("released in 2026")), "expected release year trivia, got: {:?}", report.trivia);
    }

    #[test]
    fn trivia_empty_when_no_metadata() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Plain Game", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert!(report.trivia.is_empty(), "trivia should be empty when no rating or release_date, got: {:?}", report.trivia);
    }

    #[test]
    fn trivia_includes_oldest_game() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_full(&conn, "g1", "Retro Classic", "steam", "2026-01-01T00:00:00Z", None, None, Some("1998-11-19"));
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T14:00:00Z"), Some(14400));
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert!(report.trivia.iter().any(|t| t.contains("Retro Classic") && t.contains("1998")),
            "expected oldest game trivia, got: {:?}", report.trivia);
    }

    fn insert_game_with_source_id(
        conn: &rusqlite::Connection,
        id: &str,
        name: &str,
        source: &str,
        source_id: &str,
        added_at: &str,
        genres: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO games (id, name, source, source_id, status, added_at, updated_at, genres) VALUES (?1, ?2, ?3, ?4, 'backlog', ?5, ?5, ?6)",
            params![id, name, source, source_id, added_at, genres],
        )
        .unwrap();
    }

    fn insert_session_with_source(
        conn: &rusqlite::Connection,
        id: &str,
        game_id: &str,
        started_at: &str,
        ended_at: Option<&str>,
        duration_s: Option<i64>,
        game_source: Option<&str>,
        game_source_id: Option<&str>,
        game_name: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s, tracking, game_source, game_source_id, game_name) VALUES (?1, ?2, ?3, ?4, ?5, 'auto', ?6, ?7, ?8)",
            params![id, game_id, started_at, ended_at, duration_s, game_source, game_source_id, game_name],
        )
        .unwrap();
    }

    #[test]
    fn orphaned_session_resolved_via_source_fallback() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_with_source_id(&conn, "new-uuid", "Elden Ring", "steam", "app_1245620", "2026-01-01T00:00:00Z", Some("RPG,Action"));
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        insert_session_with_source(
            &conn, "s1", "old-uuid",
            "2026-02-15T10:00:00Z", Some("2026-02-15T14:00:00Z"), Some(14400),
            Some("steam"), Some("app_1245620"), Some("Elden Ring"),
        );
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert_eq!(report.total_play_time_s, 14400, "orphaned session should contribute to total play time");
        assert_eq!(report.total_sessions, 1);
        assert_eq!(report.total_games_played, 1);
        assert!(report.most_played_game.is_some(), "most played game should resolve via source fallback");
        assert_eq!(report.most_played_game.as_ref().unwrap().name, "Elden Ring");
        assert!(!report.genre_breakdown.is_empty(), "genre breakdown should work via source fallback");
    }

    #[test]
    fn orphaned_session_no_source_metadata_still_counted_in_totals() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "new-uuid", "Some Game", "steam", "2026-01-01T00:00:00Z", None);
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        insert_session_with_source(
            &conn, "s1", "old-uuid",
            "2026-02-15T10:00:00Z", Some("2026-02-15T14:00:00Z"), Some(14400),
            None, None, Some("Some Game"),
        );
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert_eq!(report.total_play_time_s, 14400, "session time should still be counted even without source metadata");
        assert_eq!(report.total_sessions, 1);
    }

    #[test]
    fn orphaned_standalone_session_resolved_via_name_fallback() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "new-uuid", "Eriksholm - The Stolen Dream", "standalone", "2026-01-01T00:00:00Z", Some("Adventure,Stealth"));
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        insert_session_with_source(
            &conn, "s1", "old-uuid",
            "2026-02-15T10:00:00Z", Some("2026-02-15T12:00:00Z"), Some(7200),
            Some("standalone"), None, Some("Eriksholm - The Stolen Dream"),
        );
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        drop(conn);

        let report = get_wrapped_report_inner(&state, WrappedPeriod::Year(2026), "2026-03-05T12:00:00Z").unwrap();
        assert_eq!(report.total_play_time_s, 7200, "standalone orphaned session should contribute to total play time");
        assert_eq!(report.total_sessions, 1);
        assert_eq!(report.total_games_played, 1);
        assert!(report.most_played_game.is_some(), "most played game should resolve via name fallback");
        assert_eq!(report.most_played_game.as_ref().unwrap().name, "Eriksholm - The Stolen Dream");
        assert!(!report.genre_breakdown.is_empty(), "genre breakdown should work via name fallback");
    }
}
