use tauri::State;

use crate::db::DbState;
use crate::models::achievement::{
    AchievementCategory, AchievementDefinition, AchievementRarity, AchievementStatus,
    UnlockedAchievement,
};

use super::error::CommandError;

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
