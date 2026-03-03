use tauri::{AppHandle, Emitter};

use super::error::CommandError;

/// Emits a test event to verify the frontend event subscription pipeline.
/// In production, events would be emitted from long-running operations
/// (e.g., scan progress, download progress) rather than explicit commands.
#[tauri::command]
pub fn emit_test_event(app: AppHandle, message: String) -> Result<(), CommandError> {
    app.emit("test-event", &message)
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    Ok(())
}
