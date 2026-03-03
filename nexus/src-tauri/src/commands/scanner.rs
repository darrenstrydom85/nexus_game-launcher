use serde::Serialize;

use super::error::CommandError;

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub path: String,
    pub name: String,
    pub executable: String,
}

#[tauri::command]
pub fn scan_directory(path: String) -> Result<Vec<ScanResult>, CommandError> {
    let _ = path;
    Err(CommandError::Unknown("scan_directory not yet implemented".into()))
}
