//! Story 20.1: Window lifecycle commands for close confirmation and minimize-to-tray.

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};

use crate::CLOSE_CONFIRMED;

/// Closes the main window, which exits the app when it is the last window.
/// Called from the frontend when the user chooses "Close" in the close-confirmation dialog.
#[tauri::command]
pub fn confirm_app_close(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    CLOSE_CONFIRMED.store(true, Ordering::SeqCst);
    window.close().map_err(|e| e.to_string())
}

/// Hides the main window (e.g. minimize to system tray).
/// Called from the frontend when the user chooses "Minimize to system tray".
#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.hide().map_err(|e| e.to_string())
}
