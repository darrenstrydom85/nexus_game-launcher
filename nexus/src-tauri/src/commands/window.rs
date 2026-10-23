//! Story 20.1: Window lifecycle commands for close confirmation and minimize-to-tray.

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::commands::twitch::NEXUS_WEBVIEW_ARGS;
use crate::CLOSE_CONFIRMED;

/// Label of the desktop card shown while a game runs and the main window is
/// minimized or in the tray. `main.tsx` renders the widget for this label.
pub const NOW_PLAYING_WIDGET: &str = "now-playing";

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

/// Shows and focuses the main window. Used when native notification clicks
/// should bring Nexus back from the tray or minimized state.
#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

/// Opens or closes the now-playing desktop widget. The main window decides
/// when; the widget gets its state from the main window over events.
///
/// Must stay `async`: building a window in a sync command deadlocks the event
/// loop on Windows (blank widget, frozen main window).
#[tauri::command]
pub async fn set_now_playing_widget(app: AppHandle, open: bool) -> Result<(), String> {
    let existing = app.get_webview_window(NOW_PLAYING_WIDGET);
    if !open {
        return existing.map_or(Ok(()), |w| w.close().map_err(|e| e.to_string()));
    }
    if existing.is_some() {
        return Ok(());
    }

    const WIDTH: f64 = 320.0;
    const HEIGHT: f64 = 96.0;
    const MARGIN: f64 = 16.0;
    let mut builder = WebviewWindowBuilder::new(
        &app,
        NOW_PLAYING_WIDGET,
        WebviewUrl::App("index.html".into()),
    )
    .title("Nexus")
    .inner_size(WIDTH, HEIGHT)
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    // Above the wallpaper, below every app window.
    .always_on_bottom(true)
    // Built fresh on every open and never re-shown: tao only shows a window
    // without activating it on its first show, so this can't take focus
    // from the game.
    .focused(false)
    // Must match the main window so the WebView2 data directory is shared.
    .additional_browser_args(NEXUS_WEBVIEW_ARGS);

    // Bottom-right of the primary monitor's work area, clear of the taskbar.
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let pos = area.position.to_logical::<f64>(scale);
        let size = area.size.to_logical::<f64>(scale);
        builder = builder.position(
            pos.x + size.width - WIDTH - MARGIN,
            pos.y + size.height - HEIGHT - MARGIN,
        );
    }

    builder.build().map(|_| ()).map_err(|e| e.to_string())
}
