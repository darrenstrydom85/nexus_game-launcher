use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection};
use tauri::State;

use crate::db::DbState;
use crate::models::achievement::{
    AchievementCategory, AchievementDefinition, AchievementRarity, AchievementStatus,
    NewlyUnlocked, UnlockedAchievement,
};

use super::error::CommandError;
use super::utils::now_iso;

// ── Static Achievement Registry ────────────────────────────────────

pub const ACHIEVEMENT_DEFINITIONS: &[AchievementDefinition] = &[
    // ── Library ────────────────────────────────────────────────────
    AchievementDefinition {
        id: "library_starter_10",
        name: "Starter Collection",
        description: "Add 10 games to your library",
        icon: "Library",
        category: AchievementCategory::Library,
        rarity: AchievementRarity::Common,
        points: 25,
    },
    AchievementDefinition {
        id: "library_collector_50",
        name: "Collector",
        description: "Add 50 games to your library",
        icon: "BookOpen",
        category: AchievementCategory::Library,
        rarity: AchievementRarity::Uncommon,
        points: 50,
    },
    AchievementDefinition {
        id: "library_hoarder_200",
        name: "Hoarder",
        description: "Add 200 games to your library",
        icon: "Archive",
        category: AchievementCategory::Library,
        rarity: AchievementRarity::Rare,
        points: 100,
    },
    AchievementDefinition {
        id: "library_archivist_500",
        name: "Archivist",
        description: "Add 500 games to your library",
        icon: "Warehouse",
        category: AchievementCategory::Library,
        rarity: AchievementRarity::Epic,
        points: 250,
    },
    AchievementDefinition {
        id: "library_curator_10_collections",
        name: "Curator",
        description: "Create 10 collections",
        icon: "FolderHeart",
        category: AchievementCategory::Library,
        rarity: AchievementRarity::Uncommon,
        points: 50,
    },
    // ── Play ───────────────────────────────────────────────────────
    AchievementDefinition {
        id: "play_first_launch",
        name: "First Launch",
        description: "Launch any game for the first time",
        icon: "Rocket",
        category: AchievementCategory::Play,
        rarity: AchievementRarity::Common,
        points: 10,
    },
    AchievementDefinition {
        id: "play_100_hours",
        name: "Century Gamer",
        description: "Play for 100 total hours",
        icon: "Clock",
        category: AchievementCategory::Play,
        rarity: AchievementRarity::Rare,
        points: 150,
    },
    AchievementDefinition {
        id: "play_500_hours",
        name: "Veteran",
        description: "Play for 500 total hours",
        icon: "Timer",
        category: AchievementCategory::Play,
        rarity: AchievementRarity::Epic,
        points: 300,
    },
    AchievementDefinition {
        id: "play_1000_hours",
        name: "Legendary Gamer",
        description: "Play for 1000 total hours",
        icon: "Flame",
        category: AchievementCategory::Play,
        rarity: AchievementRarity::Legendary,
        points: 500,
    },
    AchievementDefinition {
        id: "play_100_sessions",
        name: "Session Centurion",
        description: "Complete 100 play sessions",
        icon: "Repeat",
        category: AchievementCategory::Play,
        rarity: AchievementRarity::Uncommon,
        points: 75,
    },
    AchievementDefinition {
        id: "play_500_sessions",
        name: "Session Master",
        description: "Complete 500 play sessions",
        icon: "Infinity",
        category: AchievementCategory::Play,
        rarity: AchievementRarity::Rare,
        points: 150,
    },
    // ── Completion ─────────────────────────────────────────────────
    AchievementDefinition {
        id: "complete_first",
        name: "Finisher",
        description: "Complete your first game",
        icon: "CheckCircle",
        category: AchievementCategory::Completion,
        rarity: AchievementRarity::Common,
        points: 50,
    },
    AchievementDefinition {
        id: "complete_5",
        name: "Closer",
        description: "Complete 5 games",
        icon: "CheckCheck",
        category: AchievementCategory::Completion,
        rarity: AchievementRarity::Uncommon,
        points: 100,
    },
    AchievementDefinition {
        id: "complete_10_backlog",
        name: "Backlog Slayer",
        description: "Complete 10 games that were in your backlog",
        icon: "Swords",
        category: AchievementCategory::Completion,
        rarity: AchievementRarity::Rare,
        points: 200,
    },
    AchievementDefinition {
        id: "complete_25",
        name: "Completionist",
        description: "Complete 25 games",
        icon: "Crown",
        category: AchievementCategory::Completion,
        rarity: AchievementRarity::Epic,
        points: 350,
    },
    // ── Streak ─────────────────────────────────────────────────────
    AchievementDefinition {
        id: "streak_7",
        name: "Week Warrior",
        description: "Maintain a 7-day play streak",
        icon: "Zap",
        category: AchievementCategory::Streak,
        rarity: AchievementRarity::Common,
        points: 50,
    },
    AchievementDefinition {
        id: "streak_14",
        name: "Fortnight Fighter",
        description: "Maintain a 14-day play streak",
        icon: "ZapOff",
        category: AchievementCategory::Streak,
        rarity: AchievementRarity::Uncommon,
        points: 75,
    },
    AchievementDefinition {
        id: "streak_30",
        name: "Monthly Dedication",
        description: "Maintain a 30-day play streak",
        icon: "CalendarCheck",
        category: AchievementCategory::Streak,
        rarity: AchievementRarity::Rare,
        points: 150,
    },
    AchievementDefinition {
        id: "streak_90",
        name: "Quarterly Commitment",
        description: "Maintain a 90-day play streak",
        icon: "CalendarHeart",
        category: AchievementCategory::Streak,
        rarity: AchievementRarity::Epic,
        points: 300,
    },
    AchievementDefinition {
        id: "streak_365",
        name: "Year of Gaming",
        description: "Maintain a 365-day play streak",
        icon: "Star",
        category: AchievementCategory::Streak,
        rarity: AchievementRarity::Legendary,
        points: 1000,
    },
    // ── Exploration ────────────────────────────────────────────────
    AchievementDefinition {
        id: "explore_5_genres",
        name: "Genre Hopper",
        description: "Play 5+ different genres in a single month",
        icon: "Compass",
        category: AchievementCategory::Exploration,
        rarity: AchievementRarity::Uncommon,
        points: 50,
    },
    AchievementDefinition {
        id: "explore_10_genres",
        name: "Renaissance Gamer",
        description: "Play 10+ genres all-time",
        icon: "Globe",
        category: AchievementCategory::Exploration,
        rarity: AchievementRarity::Rare,
        points: 100,
    },
    AchievementDefinition {
        id: "explore_hidden_gem_3",
        name: "Hidden Gem Hunter",
        description: "Play 3 games rated under 70 for 5+ hours each",
        icon: "Gem",
        category: AchievementCategory::Exploration,
        rarity: AchievementRarity::Rare,
        points: 100,
    },
    // ── Session ────────────────────────────────────────────────────
    AchievementDefinition {
        id: "session_night_owl_10",
        name: "Night Owl",
        description: "End 10 sessions after midnight",
        icon: "Moon",
        category: AchievementCategory::Session,
        rarity: AchievementRarity::Uncommon,
        points: 50,
    },
    AchievementDefinition {
        id: "session_early_bird_10",
        name: "Early Bird",
        description: "Start 10 sessions before 7 AM",
        icon: "Sunrise",
        category: AchievementCategory::Session,
        rarity: AchievementRarity::Uncommon,
        points: 50,
    },
    AchievementDefinition {
        id: "session_marathon_5",
        name: "Marathon Runner",
        description: "Complete 5 sessions of 4+ hours",
        icon: "Activity",
        category: AchievementCategory::Session,
        rarity: AchievementRarity::Uncommon,
        points: 75,
    },
    AchievementDefinition {
        id: "session_weekend_warrior",
        name: "Weekend Warrior",
        description: "Play only on weekends for 4 consecutive weeks",
        icon: "Calendar",
        category: AchievementCategory::Session,
        rarity: AchievementRarity::Rare,
        points: 100,
    },
];

// ── Commands ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_achievement_definitions() -> Vec<AchievementDefinition> {
    ACHIEVEMENT_DEFINITIONS.to_vec()
}

#[tauri::command]
pub fn get_unlocked_achievements(
    db: State<'_, DbState>,
) -> Result<Vec<UnlockedAchievement>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT id, unlocked_at, context_json FROM achievements ORDER BY unlocked_at DESC")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let rows = stmt
        .query_map([], UnlockedAchievement::from_row)
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| CommandError::Database(e.to_string()))?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_achievement_status(
    db: State<'_, DbState>,
) -> Result<Vec<AchievementStatus>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut unlocked_map = std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, unlocked_at, context_json FROM achievements")
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>("id")?,
                    row.get::<_, String>("unlocked_at")?,
                    row.get::<_, Option<String>>("context_json")?,
                ))
            })
            .map_err(|e| CommandError::Database(e.to_string()))?;

        for row in rows {
            let (id, at, ctx) = row.map_err(|e| CommandError::Database(e.to_string()))?;
            unlocked_map.insert(id, (at, ctx));
        }
    }

    let statuses = ACHIEVEMENT_DEFINITIONS
        .iter()
        .map(|def| {
            let (unlocked, unlocked_at, context_json) =
                if let Some((at, ctx)) = unlocked_map.get(def.id) {
                    (true, Some(at.clone()), ctx.clone())
                } else {
                    (false, None, None)
                };

            AchievementStatus {
                id: def.id.to_string(),
                name: def.name.to_string(),
                description: def.description.to_string(),
                icon: def.icon.to_string(),
                category: def.category.clone(),
                rarity: def.rarity.clone(),
                points: def.points,
                unlocked,
                unlocked_at,
                context_json,
            }
        })
        .collect();

    Ok(statuses)
}

// ── Evaluation Engine ──────────────────────────────────────────────

#[derive(Default)]
struct LibraryStats {
    game_count: i64,
    collection_count: i64,
    total_play_time_s: i64,
    completed_count: i64,
    session_count: i64,
    current_streak: i64,
}

fn fetch_library_stats(conn: &Connection) -> LibraryStats {
    // Achievements measure lifetime accomplishments — include hidden/removed games
    let game_count = conn
        .query_row("SELECT COUNT(*) FROM games", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0);

    let collection_count = conn
        .query_row("SELECT COUNT(*) FROM collections", [], |r| {
            r.get::<_, i64>(0)
        })
        .unwrap_or(0);

    let total_play_time_s = conn
        .query_row(
            "SELECT COALESCE(SUM(total_play_time), 0) FROM games",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);

    let completed_count = conn
        .query_row(
            "SELECT COUNT(*) FROM games WHERE completed = 1",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);

    let session_count = conn
        .query_row(
            "SELECT COUNT(*) FROM play_sessions WHERE ended_at IS NOT NULL AND duration_s >= 30",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);

    let current_streak = conn
        .query_row(
            "SELECT current_streak FROM streak_snapshots WHERE id = 'singleton'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);

    LibraryStats {
        game_count,
        collection_count,
        total_play_time_s,
        completed_count,
        session_count,
        current_streak,
    }
}

fn check_threshold(def: &AchievementDefinition, stats: &LibraryStats) -> bool {
    match def.id {
        "library_starter_10" => stats.game_count >= 10,
        "library_collector_50" => stats.game_count >= 50,
        "library_hoarder_200" => stats.game_count >= 200,
        "library_archivist_500" => stats.game_count >= 500,
        "library_curator_10_collections" => stats.collection_count >= 10,
        "play_first_launch" => stats.session_count >= 1,
        "play_100_hours" => stats.total_play_time_s >= 360_000,
        "play_500_hours" => stats.total_play_time_s >= 1_800_000,
        "play_1000_hours" => stats.total_play_time_s >= 3_600_000,
        "play_100_sessions" => stats.session_count >= 100,
        "play_500_sessions" => stats.session_count >= 500,
        "complete_first" => stats.completed_count >= 1,
        "complete_5" => stats.completed_count >= 5,
        "complete_25" => stats.completed_count >= 25,
        "streak_7" => stats.current_streak >= 7,
        "streak_14" => stats.current_streak >= 14,
        "streak_30" => stats.current_streak >= 30,
        "streak_90" => stats.current_streak >= 90,
        "streak_365" => stats.current_streak >= 365,
        _ => false,
    }
}

/// "Backlog Slayer" — completed games that had at least one session
/// before being marked complete (proxy for "was in backlog").
fn check_backlog_slayer(conn: &Connection) -> bool {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT g.id) FROM games g
             INNER JOIN play_sessions ps ON ps.game_id = g.id
             WHERE g.completed = 1
               AND ps.ended_at IS NOT NULL AND ps.duration_s >= 30",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    count >= 10
}

/// Count distinct genres played all-time.
fn count_all_time_genres(conn: &Connection) -> i64 {
    let mut stmt = match conn.prepare(
        "SELECT DISTINCT g.genres FROM games g
         INNER JOIN play_sessions ps ON ps.game_id = g.id
         WHERE g.genres IS NOT NULL AND g.genres != ''
           AND ps.ended_at IS NOT NULL AND ps.duration_s >= 30",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let rows = match stmt.query_map([], |row| row.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return 0,
    };

    let mut genres = HashSet::new();
    for row in rows {
        if let Ok(genre_str) = row {
            for genre in genre_str.split(',') {
                let trimmed = genre.trim().to_lowercase();
                if !trimmed.is_empty() {
                    genres.insert(trimmed);
                }
            }
        }
    }
    genres.len() as i64
}

/// Count distinct genres played in the current calendar month.
fn count_monthly_genres(conn: &Connection) -> i64 {
    let now = now_iso();
    let month_prefix = &now[..7]; // "YYYY-MM"

    let mut stmt = match conn.prepare(
        "SELECT DISTINCT g.genres FROM games g
         INNER JOIN play_sessions ps ON ps.game_id = g.id
         WHERE g.genres IS NOT NULL AND g.genres != ''
           AND ps.ended_at IS NOT NULL AND ps.duration_s >= 30
           AND ps.started_at >= ?1",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let start_of_month = format!("{month_prefix}-01T00:00:00Z");
    let rows = match stmt.query_map(params![start_of_month], |row| row.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return 0,
    };

    let mut genres = HashSet::new();
    for row in rows {
        if let Ok(genre_str) = row {
            for genre in genre_str.split(',') {
                let trimmed = genre.trim().to_lowercase();
                if !trimmed.is_empty() {
                    genres.insert(trimmed);
                }
            }
        }
    }
    genres.len() as i64
}

/// "Hidden Gem Hunter" — 3 games rated under 70 with 5+ hours each.
fn check_hidden_gem(conn: &Connection) -> bool {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM games
             WHERE community_score IS NOT NULL AND community_score > 0 AND community_score < 70
               AND total_play_time >= 18000",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    count >= 3
}

/// Count sessions ending after midnight (00:00–04:59 local approximation via UTC hour).
fn count_night_owl_sessions(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM play_sessions
         WHERE ended_at IS NOT NULL AND duration_s >= 30
           AND CAST(SUBSTR(ended_at, 12, 2) AS INTEGER) < 5",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// Count sessions starting before 7 AM.
fn count_early_bird_sessions(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM play_sessions
         WHERE ended_at IS NOT NULL AND duration_s >= 30
           AND CAST(SUBSTR(started_at, 12, 2) AS INTEGER) < 7",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// Count sessions 4+ hours (14400 seconds).
fn count_marathon_sessions(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM play_sessions
         WHERE ended_at IS NOT NULL AND duration_s >= 14400",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// "Weekend Warrior" — all sessions in last 28 days on Sat/Sun, none on weekdays,
/// and at least one session per weekend (4 weekends).
fn check_weekend_warrior(conn: &Connection) -> bool {
    let mut stmt = match conn.prepare(
        "SELECT started_at FROM play_sessions
         WHERE ended_at IS NOT NULL AND duration_s >= 30
           AND started_at >= date('now', '-28 days')
         ORDER BY started_at",
    ) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let rows = match stmt.query_map([], |row| row.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return false,
    };

    let mut weekends_with_sessions = HashSet::new();
    for row in rows {
        if let Ok(ts) = row {
            if let Some(dow) = day_of_week_from_iso(&ts) {
                // 0 = Sunday, 6 = Saturday
                if dow != 0 && dow != 6 {
                    return false; // weekday session found
                }
                let week_key = &ts[..10]; // rough week bucket by date
                weekends_with_sessions.insert(week_key.to_string());
            }
        }
    }

    weekends_with_sessions.len() >= 4
}

/// Returns day of week: 0=Sun, 1=Mon, ..., 6=Sat (Zeller-like from ISO date).
fn day_of_week_from_iso(iso: &str) -> Option<u32> {
    if iso.len() < 10 {
        return None;
    }
    let y: i64 = iso[..4].parse().ok()?;
    let m: i64 = iso[5..7].parse().ok()?;
    let d: i64 = iso[8..10].parse().ok()?;

    // Tomohiko Sakamoto's algorithm
    let t = [0i64, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = if m < 3 { y - 1 } else { y };
    let dow = (y + y / 4 - y / 100 + y / 400 + t[(m - 1) as usize] + d) % 7;
    Some(dow as u32)
}

fn build_context_num(key: &str, value: i64) -> String {
    format!("{{\"{key}\":{value}}}")
}

/// Core evaluation logic — callable without `State` (used by `end_session` and startup).
pub fn evaluate_achievements_inner(
    conn: &Connection,
) -> Result<Vec<NewlyUnlocked>, CommandError> {
    let already_unlocked: HashSet<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM achievements")
            .map_err(|e| CommandError::Database(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| CommandError::Database(e.to_string()))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let stats = fetch_library_stats(conn);
    let now = now_iso();
    let mut newly_unlocked = Vec::new();

    // Pre-compute expensive checks lazily
    let mut exploration_cache: HashMap<&str, bool> = HashMap::new();
    let mut session_cache: HashMap<&str, bool> = HashMap::new();

    for def in ACHIEVEMENT_DEFINITIONS {
        if already_unlocked.contains(def.id) {
            continue;
        }

        let earned = match def.id {
            // Threshold-based (library, play, completion, streak)
            id if check_threshold(def, &stats) => {
                // Build context based on category
                let ctx = match def.category {
                    AchievementCategory::Library => Some(build_context_num("gameCount", stats.game_count)),
                    AchievementCategory::Play => {
                        if id.contains("hours") {
                            Some(build_context_num("totalHours", stats.total_play_time_s / 3600))
                        } else if id.contains("sessions") {
                            Some(build_context_num("sessionCount", stats.session_count))
                        } else {
                            Some(build_context_num("sessionCount", stats.session_count))
                        }
                    }
                    AchievementCategory::Completion => Some(build_context_num("completedCount", stats.completed_count)),
                    AchievementCategory::Streak => Some(build_context_num("streakDays", stats.current_streak)),
                    _ => None,
                };
                Some(ctx)
            }

            "complete_10_backlog" => {
                if check_backlog_slayer(conn) {
                    Some(None)
                } else {
                    None
                }
            }

            "explore_5_genres" => {
                let passed = *exploration_cache
                    .entry("monthly_genres_5")
                    .or_insert_with(|| count_monthly_genres(conn) >= 5);
                if passed { Some(None) } else { None }
            }

            "explore_10_genres" => {
                let passed = *exploration_cache
                    .entry("all_time_genres_10")
                    .or_insert_with(|| count_all_time_genres(conn) >= 10);
                if passed { Some(None) } else { None }
            }

            "explore_hidden_gem_3" => {
                let passed = *exploration_cache
                    .entry("hidden_gem")
                    .or_insert_with(|| check_hidden_gem(conn));
                if passed { Some(None) } else { None }
            }

            "session_night_owl_10" => {
                let passed = *session_cache
                    .entry("night_owl")
                    .or_insert_with(|| count_night_owl_sessions(conn) >= 10);
                if passed { Some(None) } else { None }
            }

            "session_early_bird_10" => {
                let passed = *session_cache
                    .entry("early_bird")
                    .or_insert_with(|| count_early_bird_sessions(conn) >= 10);
                if passed { Some(None) } else { None }
            }

            "session_marathon_5" => {
                let passed = *session_cache
                    .entry("marathon")
                    .or_insert_with(|| count_marathon_sessions(conn) >= 5);
                if passed { Some(None) } else { None }
            }

            "session_weekend_warrior" => {
                let passed = *session_cache
                    .entry("weekend_warrior")
                    .or_insert_with(|| check_weekend_warrior(conn));
                if passed { Some(None) } else { None }
            }

            _ => None,
        };

        if let Some(context) = earned {
            newly_unlocked.push((def, now.clone(), context));
        }
    }

    // Always open a transaction to refresh context for already-unlocked achievements
    // and insert any new ones.
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let mut result = Vec::with_capacity(newly_unlocked.len());
    for (def, unlocked_at, context) in &newly_unlocked {
        tx.execute(
            "INSERT OR IGNORE INTO achievements (id, unlocked_at, context_json) VALUES (?1, ?2, ?3)",
            params![def.id, unlocked_at, context],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

        result.push(NewlyUnlocked {
            id: def.id.to_string(),
            name: def.name.to_string(),
            description: def.description.to_string(),
            icon: def.icon.to_string(),
            category: def.category.clone(),
            rarity: def.rarity.clone(),
            points: def.points,
            unlocked_at: unlocked_at.clone(),
            context_json: context.clone(),
        });
    }

    // Refresh context_json for already-unlocked threshold achievements
    // so the displayed stat stays current (e.g. "8 games completed" not "1").
    for def in ACHIEVEMENT_DEFINITIONS {
        if !already_unlocked.contains(def.id) {
            continue;
        }
        let ctx = match def.category {
            AchievementCategory::Library => Some(build_context_num("gameCount", stats.game_count)),
            AchievementCategory::Play => {
                if def.id.contains("hours") {
                    Some(build_context_num("totalHours", stats.total_play_time_s / 3600))
                } else {
                    Some(build_context_num("sessionCount", stats.session_count))
                }
            }
            AchievementCategory::Completion => Some(build_context_num("completedCount", stats.completed_count)),
            AchievementCategory::Streak => Some(build_context_num("streakDays", stats.current_streak)),
            _ => continue,
        };
        tx.execute(
            "UPDATE achievements SET context_json = ?1 WHERE id = ?2",
            params![ctx, def.id],
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    }

    tx.commit()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    Ok(result)
}

#[tauri::command]
pub fn evaluate_achievements(
    db: State<'_, DbState>,
) -> Result<Vec<NewlyUnlocked>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    evaluate_achievements_inner(&conn)
}
