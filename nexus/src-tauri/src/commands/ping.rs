use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

use super::error::CommandError;

#[derive(Debug, Serialize)]
pub struct PingResponse {
    pub message: String,
    pub timestamp: u64,
}

#[tauri::command]
pub fn ping() -> Result<PingResponse, CommandError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| CommandError::Unknown(e.to_string()))?
        .as_millis() as u64;

    Ok(PingResponse {
        message: "pong".to_string(),
        timestamp,
    })
}
