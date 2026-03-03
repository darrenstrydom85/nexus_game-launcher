use serde::Serialize;

use super::error::CommandError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaytimeRecord {
    pub game_id: String,
    pub total_seconds: u64,
    pub last_played: String,
}

#[tauri::command]
pub fn get_playtime(game_id: String) -> Result<PlaytimeRecord, CommandError> {
    let _ = game_id;
    Err(CommandError::Unknown("get_playtime not yet implemented".into()))
}
