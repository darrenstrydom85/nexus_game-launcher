use rusqlite::params;
use tauri::State;

use crate::db::DbState;
use crate::models::mastery::{build_game_mastery_tier, GameMasteryTier};

use super::error::CommandError;

#[tauri::command]
pub fn get_mastery_tier(
    db: State<'_, DbState>,
    game_id: String,
) -> Result<GameMasteryTier, CommandError> {
    let conn = db.conn()?;

    let total_play_time: i64 = conn
        .query_row(
            "SELECT total_play_time FROM games WHERE id = ?1",
            params![game_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                CommandError::NotFound(format!("game {game_id}"))
            }
            other => CommandError::Database(other.to_string()),
        })?;

    Ok(build_game_mastery_tier(game_id, total_play_time))
}

#[tauri::command]
pub fn get_mastery_tiers_bulk(
    db: State<'_, DbState>,
) -> Result<Vec<GameMasteryTier>, CommandError> {
    let conn = db.conn()?;

    let mut stmt = conn
        .prepare("SELECT id, total_play_time FROM games WHERE total_play_time > 0")?;

    let tiers = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let play_time: i64 = row.get(1)?;
            Ok(build_game_mastery_tier(id, play_time))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tiers)
}
