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

    let base_cond = format!("{SESSION_FILTER} AND started_at >= ?1 AND started_at <= ?2");

    // 1) Totals from sessions in range
    let (total_play_time_s, total_sessions, total_games_played): (i64, i64, i64) = tx
        .query_row(
            &format!(
                "SELECT
                    COALESCE(SUM(duration_s), 0),
                    COUNT(*),
                    COUNT(DISTINCT game_id)
                 FROM play_sessions WHERE {}",
                base_cond
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
                    SELECT game_id FROM play_sessions WHERE {}
                    GROUP BY game_id
                    HAVING MIN(started_at) >= ?1 AND MIN(started_at) <= ?2
                )",
                SESSION_FILTER
            ),
            params![start_iso, end_iso],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    // 5) Top games by play time in period (for most_played_game and top_games)
    let top_games_sql = format!(
        "SELECT g.id, g.name, g.cover_url, g.source,
                COALESCE(SUM(ps.duration_s), 0) as play_time_s, COUNT(*) as session_count
         FROM play_sessions ps
         JOIN games g ON g.id = ps.game_id
         WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
         GROUP BY ps.game_id
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
            "SELECT ps.game_id, COALESCE(SUM(ps.duration_s), 0) as play_time_s, g.genres
             FROM play_sessions ps
             JOIN games g ON g.id = ps.game_id
             WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
             GROUP BY ps.game_id",
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
             JOIN games g ON g.id = ps.game_id
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
                "SELECT ps.game_id, COALESCE(g.name, ps.game_name, 'Unknown') as game_name,
                        ps.started_at, ps.duration_s
                 FROM play_sessions ps
                 LEFT JOIN games g ON g.id = ps.game_id
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
                "SELECT g.id, g.name, g.cover_url, g.source,
                        COALESCE(SUM(ps.duration_s), 0) as play_time_s, COUNT(*) as session_count
                 FROM play_sessions ps JOIN games g ON g.id = ps.game_id
                 WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
                 GROUP BY ps.game_id
                 ORDER BY MIN(ps.started_at) ASC LIMIT 1",
                SESSION_FILTER_PS
            ),
            params![start_iso, end_iso],
            |row| {
                Ok(WrappedGame {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    cover_url: row.get(2)?,
                    play_time_s: row.get(4)?,
                    session_count: row.get(5)?,
                    source: row.get::<_, String>(3).unwrap_or_else(|_| "unknown".to_string()),
                })
            },
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let last_game: Option<WrappedGame> = tx
        .query_row(
            &format!(
                "SELECT g.id, g.name, g.cover_url, g.source,
                        COALESCE(SUM(ps.duration_s), 0) as play_time_s, COUNT(*) as session_count
                 FROM play_sessions ps JOIN games g ON g.id = ps.game_id
                 WHERE {} AND ps.started_at >= ?1 AND ps.started_at <= ?2
                 GROUP BY ps.game_id
                 ORDER BY MAX(ps.started_at) DESC LIMIT 1",
                SESSION_FILTER_PS
            ),
            params![start_iso, end_iso],
            |row| {
                Ok(WrappedGame {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    cover_url: row.get(2)?,
                    play_time_s: row.get(4)?,
                    session_count: row.get(5)?,
                    source: row.get::<_, String>(3).unwrap_or_else(|_| "unknown".to_string()),
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
        mood_tagline: None,
        hidden_gem: None,
        trivia: vec![],
    })
}

#[tauri::command]
pub fn get_wrapped_report(db: State<'_, DbState>, period: WrappedPeriod) -> Result<WrappedReport, CommandError> {
    get_wrapped_report_inner(&db, period, &now_iso())
}

fn build_genre_breakdown(
    per_game_play: &[(String, i64, Option<String>)],
) -> (Vec<GenreShare>, Option<String>, Option<String>) {
    let mut by_genre: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for (_, play_time_s, genres_json) in per_game_play {
        let names: Vec<String> = match genres_json.as_deref() {
            None | Some("") => continue,
            Some(s) => {
                serde_json::from_str(s).unwrap_or_default()
            }
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
    fn get_available_wrapped_periods_returns_years() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Game", "steam", "2026-01-01T00:00:00Z", None);
        insert_session(&conn, "s1", "g1", "2026-02-01T10:00:00Z", Some("2026-02-01T11:00:00Z"), Some(3600));
        drop(conn);

        let avail = get_available_wrapped_periods_inner(&state).unwrap();
        assert!(avail.years_with_sessions.contains(&2026));
    }
}
