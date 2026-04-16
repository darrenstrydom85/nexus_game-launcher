use rusqlite::params;
use tauri::State;

use super::error::CommandError;
use super::utils::iso_to_epoch_secs;
use crate::db::DbState;
use crate::models::SessionMilestone;

const SESSION_FILTER: &str = "ended_at IS NOT NULL AND duration_s >= 30";

struct SessionRow {
    id: String,
    game_id: String,
    game_name: String,
    started_at: String,
    ended_at: String,
    duration_s: i64,
}

struct CumulativeContext {
    total_session_count: i64,
    game_session_count: i64,
    distinct_games_played: i64,
    days_since_last_game_session: Option<i64>,
    is_first_game_session: bool,
}

fn hour_from_iso(ts: &str) -> Option<u32> {
    let epoch = iso_to_epoch_secs(ts).ok()?;
    let secs_in_day = ((epoch % 86400) + 86400) % 86400;
    Some((secs_in_day / 3600) as u32)
}

fn check_duration_milestones(session: &SessionRow) -> Vec<SessionMilestone> {
    let dur = session.duration_s;
    let mut results = Vec::new();

    if dur >= 30 && dur < 900 {
        results.push(SessionMilestone {
            id: "quick-round".into(),
            title: "Quick Round".into(),
            description: "A session under 15 minutes — short but sweet!".into(),
            icon: "timer".into(),
            category: "duration".into(),
            game_name: String::new(),
        });
    }
    if dur >= 3600 && dur < 7200 {
        results.push(SessionMilestone {
            id: "solid-session".into(),
            title: "Solid Session".into(),
            description: "A solid 1–2 hour gaming session.".into(),
            icon: "timer".into(),
            category: "duration".into(),
            game_name: String::new(),
        });
    }
    if dur >= 14400 && dur < 28800 {
        results.push(SessionMilestone {
            id: "marathon".into(),
            title: "Marathon".into(),
            description: "4+ hours of gaming — now that's dedication!".into(),
            icon: "timer".into(),
            category: "duration".into(),
            game_name: String::new(),
        });
    }
    if dur >= 28800 && dur < 43200 {
        results.push(SessionMilestone {
            id: "ultra-marathon".into(),
            title: "Ultra Marathon".into(),
            description: "8+ hours straight — legendary endurance.".into(),
            icon: "timer".into(),
            category: "duration".into(),
            game_name: String::new(),
        });
    }
    if dur >= 43200 {
        results.push(SessionMilestone {
            id: "all-nighter".into(),
            title: "All-Nighter".into(),
            description: "12+ hours — you pulled an all-nighter!".into(),
            icon: "timer".into(),
            category: "duration".into(),
            game_name: String::new(),
        });
    }

    results
}

fn check_time_of_day_milestones(session: &SessionRow) -> Vec<SessionMilestone> {
    let mut results = Vec::new();

    if let Some(start_hour) = hour_from_iso(&session.started_at) {
        if start_hour < 7 {
            results.push(SessionMilestone {
                id: "early-bird".into(),
                title: "Early Bird".into(),
                description: "Started gaming before 7 AM — rise and game!".into(),
                icon: "sunrise".into(),
                category: "time-of-day".into(),
                game_name: String::new(),
            });
        }
        if start_hour >= 11 && start_hour < 13 && session.duration_s < 3600 {
            results.push(SessionMilestone {
                id: "lunch-break-gamer".into(),
                title: "Lunch Break Gamer".into(),
                description: "A quick session during the lunch hour.".into(),
                icon: "utensils".into(),
                category: "time-of-day".into(),
                game_name: String::new(),
            });
        }
    }

    if let Some(end_hour) = hour_from_iso(&session.ended_at) {
        if end_hour < 6 {
            results.push(SessionMilestone {
                id: "night-owl".into(),
                title: "Night Owl".into(),
                description: "Ended a session past midnight — night owl spotted!".into(),
                icon: "moon".into(),
                category: "time-of-day".into(),
                game_name: String::new(),
            });
        }
    }

    results
}

fn check_cumulative_milestones(ctx: &CumulativeContext) -> Vec<SessionMilestone> {
    let mut results = Vec::new();

    if ctx.total_session_count == 100 {
        results.push(SessionMilestone {
            id: "century-club".into(),
            title: "Century Club".into(),
            description: "100 gaming sessions completed!".into(),
            icon: "trophy".into(),
            category: "cumulative".into(),
            game_name: String::new(),
        });
    }
    if ctx.total_session_count == 1000 {
        results.push(SessionMilestone {
            id: "thousand-club".into(),
            title: "Thousand Club".into(),
            description: "1,000 gaming sessions — truly dedicated!".into(),
            icon: "trophy".into(),
            category: "cumulative".into(),
            game_name: String::new(),
        });
    }
    if ctx.game_session_count == 50 {
        results.push(SessionMilestone {
            id: "dedicated-fan".into(),
            title: "Dedicated Fan".into(),
            description: "50 sessions for this game — you're a true fan!".into(),
            icon: "trophy".into(),
            category: "cumulative".into(),
            game_name: String::new(),
        });
    }
    if ctx.is_first_game_session {
        results.push(SessionMilestone {
            id: "first-timer".into(),
            title: "First Timer".into(),
            description: "Your first session with this game!".into(),
            icon: "sparkles".into(),
            category: "cumulative".into(),
            game_name: String::new(),
        });
    }
    if let Some(days) = ctx.days_since_last_game_session {
        if days >= 30 && !ctx.is_first_game_session {
            results.push(SessionMilestone {
                id: "welcome-back".into(),
                title: "Welcome Back".into(),
                description: "First session for this game in 30+ days — welcome back!".into(),
                icon: "hand-metal".into(),
                category: "cumulative".into(),
                game_name: String::new(),
            });
        }
    }

    results
}

fn check_play_count_milestones(distinct_games: i64) -> Vec<SessionMilestone> {
    let mut results = Vec::new();

    if distinct_games == 10 {
        results.push(SessionMilestone {
            id: "double-digits".into(),
            title: "Double Digits".into(),
            description: "10 different games played — expanding your horizons!".into(),
            icon: "star".into(),
            category: "play-count".into(),
            game_name: String::new(),
        });
    }
    if distinct_games == 25 {
        results.push(SessionMilestone {
            id: "diverse-gamer".into(),
            title: "Diverse Gamer".into(),
            description: "25 different games played — variety is the spice of life!".into(),
            icon: "star".into(),
            category: "play-count".into(),
            game_name: String::new(),
        });
    }

    results
}

fn build_cumulative_context(
    conn: &rusqlite::Connection,
    session: &SessionRow,
) -> Result<CumulativeContext, CommandError> {
    let total_session_count: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM play_sessions WHERE {SESSION_FILTER} AND id <= ?1"
            ),
            params![session.id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let game_session_count: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM play_sessions WHERE game_id = ?1 AND {SESSION_FILTER} AND id <= ?2"
            ),
            params![session.game_id, session.id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let distinct_games_played: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(DISTINCT game_id) FROM play_sessions WHERE {SESSION_FILTER} AND id <= ?1"
            ),
            params![session.id],
            |row| row.get(0),
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let is_first_game_session = game_session_count == 1;

    let days_since_last_game_session: Option<i64> = if is_first_game_session {
        None
    } else {
        let prev_ended_at: Option<String> = conn
            .query_row(
                &format!(
                    "SELECT ended_at FROM play_sessions
                     WHERE game_id = ?1 AND {SESSION_FILTER} AND id != ?2
                     ORDER BY ended_at DESC LIMIT 1"
                ),
                params![session.game_id, session.id],
                |row| row.get(0),
            )
            .ok();

        match prev_ended_at {
            Some(prev) => {
                let prev_epoch = iso_to_epoch_secs(&prev).unwrap_or(0);
                let curr_epoch = iso_to_epoch_secs(&session.started_at).unwrap_or(0);
                Some((curr_epoch - prev_epoch) / 86400)
            }
            None => None,
        }
    };

    Ok(CumulativeContext {
        total_session_count,
        game_session_count,
        distinct_games_played,
        days_since_last_game_session,
        is_first_game_session,
    })
}

fn evaluate_session(
    conn: &rusqlite::Connection,
    session: &SessionRow,
) -> Result<Vec<SessionMilestone>, CommandError> {
    if session.duration_s < 30 {
        return Ok(Vec::new());
    }

    let mut milestones = Vec::new();
    milestones.extend(check_duration_milestones(session));
    milestones.extend(check_time_of_day_milestones(session));

    let ctx = build_cumulative_context(conn, session)?;
    milestones.extend(check_cumulative_milestones(&ctx));
    milestones.extend(check_play_count_milestones(ctx.distinct_games_played));

    for m in &mut milestones {
        m.game_name = session.game_name.clone();
    }

    Ok(milestones)
}

fn load_session(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<SessionRow, CommandError> {
    conn.query_row(
        &format!(
            "SELECT ps.id, ps.game_id, g.name AS game_name, ps.started_at, ps.ended_at, ps.duration_s
             FROM play_sessions ps
             JOIN games g ON g.id = ps.game_id
             WHERE ps.id = ?1 AND ps.ended_at IS NOT NULL AND ps.duration_s >= 30"
        ),
        params![session_id],
        |row| {
            Ok(SessionRow {
                id: row.get("id")?,
                game_id: row.get("game_id")?,
                game_name: row.get("game_name")?,
                started_at: row.get("started_at")?,
                ended_at: row.get("ended_at")?,
                duration_s: row.get("duration_s")?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            CommandError::NotFound(format!("session not found or not qualifying: {session_id}"))
        }
        other => CommandError::Database(other.to_string()),
    })
}

#[tauri::command]
pub fn check_session_milestones(
    db: State<'_, DbState>,
    session_id: String,
) -> Result<Vec<SessionMilestone>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let session = load_session(&conn, &session_id)?;
    evaluate_session(&conn, &session)
}

#[tauri::command]
pub fn evaluate_milestones_batch(
    db: State<'_, DbState>,
    session_ids: Vec<String>,
) -> Result<Vec<(String, Vec<SessionMilestone>)>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut results = Vec::new();
    for sid in &session_ids {
        let session = match load_session(&conn, sid) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let milestones = evaluate_session(&conn, &session)?;
        if !milestones.is_empty() {
            results.push((sid.clone(), milestones));
        }
    }
    Ok(results)
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

    fn insert_game(conn: &rusqlite::Connection, game_id: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, added_at, updated_at)
             VALUES (?1, ?1, 'manual', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
             ON CONFLICT(id) DO NOTHING",
            params![game_id],
        )
        .unwrap();
    }

    fn insert_session_full(
        conn: &rusqlite::Connection,
        id: &str,
        game_id: &str,
        started_at: &str,
        ended_at: &str,
        duration_s: i64,
    ) {
        insert_game(conn, game_id);
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at, ended_at, duration_s)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, game_id, started_at, ended_at, duration_s],
        )
        .unwrap();
    }

    #[test]
    fn quick_round_under_15_min() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T12:00:00Z", "2026-01-15T12:10:00Z", 600,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "quick-round"));
    }

    #[test]
    fn marathon_4h_session() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T12:00:00Z", "2026-01-15T16:30:00Z", 16200,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "marathon"));
    }

    #[test]
    fn early_bird_before_7am() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T06:00:00Z", "2026-01-15T07:30:00Z", 5400,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "early-bird"));
    }

    #[test]
    fn night_owl_past_midnight() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T22:00:00Z", "2026-01-16T01:30:00Z", 12600,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "night-owl"));
    }

    #[test]
    fn century_club_100th_session() {
        let conn = setup_db();
        for i in 1..=100 {
            let id = format!("s{i:04}");
            let game = format!("g{}", (i % 5) + 1);
            let started = format!("2026-01-{:02}T12:00:00Z", (i % 28) + 1);
            let ended = format!("2026-01-{:02}T13:00:00Z", (i % 28) + 1);
            insert_session_full(&conn, &id, &game, &started, &ended, 3600);
        }
        let session = load_session(&conn, "s0100").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "century-club"));
    }

    #[test]
    fn century_club_does_not_fire_on_101st() {
        let conn = setup_db();
        for i in 1..=101 {
            let id = format!("s{i:04}");
            let game = format!("g{}", (i % 5) + 1);
            let started = format!("2026-01-{:02}T12:00:00Z", (i % 28) + 1);
            let ended = format!("2026-01-{:02}T13:00:00Z", (i % 28) + 1);
            insert_session_full(&conn, &id, &game, &started, &ended, 3600);
        }
        let session = load_session(&conn, "s0101").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(!milestones.iter().any(|m| m.id == "century-club"));
    }

    #[test]
    fn first_timer_first_game_session() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T12:00:00Z", "2026-01-15T13:00:00Z", 3600,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "first-timer"));
    }

    #[test]
    fn welcome_back_after_30_day_gap() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-01T12:00:00Z", "2026-01-01T13:00:00Z", 3600,
        );
        insert_session_full(
            &conn, "s2", "g1",
            "2026-02-15T12:00:00Z", "2026-02-15T13:00:00Z", 3600,
        );
        let session = load_session(&conn, "s2").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "welcome-back"));
        assert!(!milestones.iter().any(|m| m.id == "first-timer"));
    }

    #[test]
    fn multiple_milestones_simultaneously() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T22:00:00Z", "2026-01-16T03:00:00Z", 18000,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "marathon"));
        assert!(milestones.iter().any(|m| m.id == "night-owl"));
        assert!(milestones.iter().any(|m| m.id == "first-timer"));
    }

    #[test]
    fn sessions_under_30s_trigger_nothing() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T12:00:00Z", "2026-01-15T12:00:25Z", 25,
        );
        let result = load_session(&conn, "s1");
        assert!(result.is_err());
    }

    #[test]
    fn batch_evaluation_attributes_century_club_correctly() {
        let conn = setup_db();
        let mut ids = Vec::new();
        for i in 1..=105 {
            let id = format!("s{i:04}");
            let game = format!("g{}", (i % 5) + 1);
            let day = (i % 28) + 1;
            let month = if i <= 28 { 1 } else if i <= 56 { 2 } else if i <= 84 { 3 } else { 4 };
            let started = format!("2026-{month:02}-{day:02}T12:00:00Z");
            let ended = format!("2026-{month:02}-{day:02}T13:00:00Z");
            insert_session_full(&conn, &id, &game, &started, &ended, 3600);
            ids.push(id);
        }

        let mut results = Vec::new();
        for sid in &ids {
            let session = match load_session(&conn, sid) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let milestones = evaluate_session(&conn, &session).unwrap();
            if !milestones.is_empty() {
                results.push((sid.clone(), milestones));
            }
        }

        let century_entry = results
            .iter()
            .find(|(_, ms)| ms.iter().any(|m| m.id == "century-club"));
        assert!(century_entry.is_some());
        assert_eq!(century_entry.unwrap().0, "s0100");
    }

    #[test]
    fn batch_evaluation_returns_chronological_order() {
        let conn = setup_db();
        let ids = vec!["s001", "s002", "s003"];
        for (i, id) in ids.iter().enumerate() {
            let day = i + 1;
            let started = format!("2026-01-{day:02}T12:00:00Z");
            let ended = format!("2026-01-{day:02}T13:00:00Z");
            insert_session_full(&conn, id, "g1", &started, &ended, 3600);
        }

        let mut results = Vec::new();
        for sid in &ids {
            let session = load_session(&conn, sid).unwrap();
            let milestones = evaluate_session(&conn, &session).unwrap();
            if !milestones.is_empty() {
                results.push((sid.to_string(), milestones));
            }
        }

        let first_timer_entry = results
            .iter()
            .find(|(_, ms)| ms.iter().any(|m| m.id == "first-timer"));
        assert!(first_timer_entry.is_some());
        assert_eq!(first_timer_entry.unwrap().0, "s001");
    }

    #[test]
    fn solid_session_1_to_2_hours() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T12:00:00Z", "2026-01-15T13:30:00Z", 5400,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "solid-session"));
    }

    #[test]
    fn ultra_marathon_8h() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T08:00:00Z", "2026-01-15T18:00:00Z", 36000,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "ultra-marathon"));
    }

    #[test]
    fn all_nighter_12h() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T14:00:00Z", "2026-01-16T03:00:00Z", 46800,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "all-nighter"));
    }

    #[test]
    fn lunch_break_gamer() {
        let conn = setup_db();
        insert_session_full(
            &conn, "s1", "g1",
            "2026-01-15T12:00:00Z", "2026-01-15T12:30:00Z", 1800,
        );
        let session = load_session(&conn, "s1").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "lunch-break-gamer"));
    }

    #[test]
    fn double_digits_10_games() {
        let conn = setup_db();
        for i in 1..=10 {
            let id = format!("s{i:03}");
            let game = format!("g{i}");
            insert_session_full(
                &conn, &id, &game,
                "2026-01-15T12:00:00Z", "2026-01-15T13:00:00Z", 3600,
            );
        }
        let session = load_session(&conn, "s010").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "double-digits"));
    }

    #[test]
    fn diverse_gamer_25_games() {
        let conn = setup_db();
        for i in 1..=25 {
            let id = format!("s{i:03}");
            let game = format!("g{i}");
            insert_session_full(
                &conn, &id, &game,
                "2026-01-15T12:00:00Z", "2026-01-15T13:00:00Z", 3600,
            );
        }
        let session = load_session(&conn, "s025").unwrap();
        let milestones = evaluate_session(&conn, &session).unwrap();
        assert!(milestones.iter().any(|m| m.id == "diverse-gamer"));
    }
}
