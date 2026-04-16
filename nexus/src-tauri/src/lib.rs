mod commands;
pub mod db;
pub mod dedup;
pub mod metadata;
pub mod models;
pub mod sources;
pub mod gdrive;
pub mod twitch;
mod utils;

use std::sync::atomic::{AtomicBool, Ordering};
use rusqlite::params;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use tauri::WindowEvent;

use crate::db::DbState;
use crate::models::settings::keys;

/// Shared flag: when `true`, the next close-requested event should exit
/// immediately without showing the confirmation dialog. Set by the tray
/// "Exit" menu item so the close handler in `on_window_event` lets it through.
pub static TRAY_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Shared flag: when `true`, the next close-requested event should proceed
/// without re-showing the dialog. Set by `confirm_app_close` so the
/// programmatic `window.close()` is not intercepted by the guard.
pub static CLOSE_CONFIRMED: AtomicBool = AtomicBool::new(false);

use commands::{
    achievements::{evaluate_achievements, get_achievement_definitions, get_achievement_status, get_unlocked_achievements},
    analytics::{get_per_game_session_stats, get_session_distribution},
    collections::{
        add_to_collection, create_collection, delete_collection, evaluate_smart_collection,
        get_collection_games, get_collections, get_collections_with_game_ids,
        remove_from_collection, reorder_collections, update_collection,
    },
    database::{clear_play_history, debug_wrapped_sessions, get_db_status, relink_play_sessions, reset_all, reset_keep_keys, reset_library_keep_stats},
    hardware::get_system_hardware,
    health::check_library_health,
    events::emit_test_event,
    games::{confirm_games, delete_game, get_game, get_games, search_games, update_game},
    launcher::{check_process_running, find_game_process, launch_game, list_running_processes, stop_game},
    metadata::{
        apply_steamgrid_artwork, clear_cache, clear_hltb_data, fetch_all_metadata, fetch_artwork,
        fetch_metadata, fetch_metadata_with_igdb_id, get_cache_stats, get_key_status,
        get_metadata, get_placeholder_cover, run_score_backfill, save_hltb_data, search_metadata,
        search_steamgrid_artwork, verify_igdb_keys, verify_steamgrid_key,
    },
    ping::ping,
    playtime::get_playtime,
    scanner::scan_directory,
    sessions::{
        bulk_delete_short_sessions, count_short_sessions, create_session, end_session,
        get_activity_data, get_all_sessions, get_library_stats, get_orphaned_sessions,
        get_play_sessions, get_play_stats, get_top_games, update_session_note,
    },
    clipboard::write_image_to_clipboard,
    mastery::{get_mastery_tier, get_mastery_tiers_bulk},
    milestones::{check_session_milestones, evaluate_milestones_batch},
    streak::{get_streak, recalculate_streak},
    wrapped::{get_available_wrapped_periods, get_wrapped_report},
    xp::{award_xp, backfill_xp_from_history, get_xp_breakdown, get_xp_history, get_xp_summary},
    settings::{
        add_watched_folder, get_setting, get_settings, get_watched_folders, remove_watched_folder,
        set_setting,
    },
    sources::{
        detect_launchers, get_active_watchers, scan_sources, start_folder_watchers,
        stop_folder_watcher, stop_folder_watchers,
    },
    dedup::{
        find_duplicates, get_duplicate_groups, get_game_sources, resolve_duplicate_group,
        update_duplicate_resolution,
    },
    twitch::{
        check_connectivity, clear_twitch_cache, get_twitch_followed_channels, get_twitch_live_streams,
        get_twitch_streams_by_game, get_twitch_trending_library_games, set_twitch_favorite,
        twitch_auth_logout, twitch_auth_start, twitch_auth_status, validate_twitch_token,
    },
    backup::{
        gdrive_auth_start, gdrive_auth_status, gdrive_auth_logout,
        run_backup, list_backups, restore_backup,
        get_backup_status, set_backup_frequency, set_backup_retention,
    },
    known_issues::fetch_known_issues,
    version_check::check_update_available,
    window::{confirm_app_close, hide_main_window},
    queue::{
        get_play_queue, add_to_play_queue, remove_from_play_queue,
        reorder_play_queue, clear_play_queue,
    },
    tags::{
        get_tags, create_tag, delete_tag, rename_tag, update_tag_color,
        add_tag_to_game, remove_tag_from_game, get_game_tags, get_games_by_tag,
        get_all_game_tag_ids,
    },
};

/// Story 20.1: Read ask_before_close from settings. Default true (show dialog).
fn read_ask_before_close(app: &tauri::AppHandle) -> bool {
    let db = match app.try_state::<DbState>() {
        Some(s) => s,
        None => return true,
    };
    let conn = match db.conn.lock() {
        Ok(c) => c,
        Err(_) => return true,
    };
    let val: Result<Option<String>, _> =
        conn.query_row("SELECT value FROM settings WHERE key = ?1", params![keys::ASK_BEFORE_CLOSE], |r| r.get(0));
    match val {
        Ok(Some(v)) => v != "false",
        _ => true,
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItemBuilder::with_id("open", "Open").build(app)?;
    let exit_item = MenuItemBuilder::with_id("exit", "Exit").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&open_item, &exit_item])
        .build()?;

    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    TrayIconBuilder::with_id("nexus-tray")
        .icon(icon)
        .tooltip("Nexus Game Launcher")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                show_main_window(app);
            }
            "exit" => {
                TRAY_EXIT_REQUESTED.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                show_main_window(tray.app_handle());
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_state = db::init().expect("failed to initialize database");
    let folder_watcher = sources::watcher::FolderWatcher::new();

    tauri::Builder::default()
        .manage(db_state)
        .manage(folder_watcher)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if TRAY_EXIT_REQUESTED.load(Ordering::SeqCst) {
                    return;
                }
                if CLOSE_CONFIRMED.swap(false, Ordering::SeqCst) {
                    return;
                }
                let app = window.app_handle();
                let ask = read_ask_before_close(&app);
                if ask {
                    api.prevent_close();
                    let _ = window.emit("nexus://show-close-dialog", ());
                }
            }
        })
        .setup(|app| {
            setup_tray(app)?;
            commands::backup::start_backup_scheduler(app.handle().clone());

            if let Some(db) = app.try_state::<DbState>() {
                if let Ok(conn) = db.conn.lock() {
                    let _ = commands::streak::recalculate_streak_inner(&conn);
                    let _ = commands::achievements::evaluate_achievements_inner(&conn);

                    if commands::xp::should_run_backfill(&conn) {
                        let _ = commands::xp::backfill_xp_inner(&conn);
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            scan_directory,
            launch_game,
            stop_game,
            check_process_running,
            find_game_process,
            list_running_processes,
            get_playtime,
            get_metadata,
            get_db_status,
            reset_all,
            reset_keep_keys,
            clear_play_history,
            reset_library_keep_stats,
            relink_play_sessions,
            debug_wrapped_sessions,
            emit_test_event,
            get_games,
            get_game,
            search_games,
            update_game,
            delete_game,
            confirm_games,
            create_session,
            end_session,
            get_play_sessions,
            get_play_stats,
            get_activity_data,
            get_orphaned_sessions,
            get_library_stats,
            get_top_games,
            get_all_sessions,
            update_session_note,
            count_short_sessions,
            bulk_delete_short_sessions,
            get_session_distribution,
            get_per_game_session_stats,
            get_wrapped_report,
            get_available_wrapped_periods,
            get_streak,
            recalculate_streak,
            check_session_milestones,
            evaluate_milestones_batch,
            get_mastery_tier,
            get_mastery_tiers_bulk,
            get_collections,
            get_collections_with_game_ids,
            create_collection,
            update_collection,
            delete_collection,
            add_to_collection,
            remove_from_collection,
            reorder_collections,
            get_collection_games,
            evaluate_smart_collection,
            get_setting,
            set_setting,
            get_settings,
            get_watched_folders,
            add_watched_folder,
            remove_watched_folder,
            scan_sources,
            detect_launchers,
            start_folder_watchers,
            stop_folder_watchers,
            stop_folder_watcher,
            get_active_watchers,
            find_duplicates,
            get_duplicate_groups,
            get_game_sources,
            resolve_duplicate_group,
            update_duplicate_resolution,
            verify_steamgrid_key,
            verify_igdb_keys,
            fetch_metadata,
            fetch_metadata_with_igdb_id,
            search_metadata,
            search_steamgrid_artwork,
            apply_steamgrid_artwork,
            fetch_artwork,
            fetch_all_metadata,
            get_key_status,
            get_cache_stats,
            clear_cache,
            get_placeholder_cover,
            run_score_backfill,
            save_hltb_data,
            clear_hltb_data,
            check_library_health,
            get_system_hardware,
            twitch_auth_start,
            twitch_auth_status,
            twitch_auth_logout,
            validate_twitch_token,
            get_twitch_followed_channels,
            get_twitch_live_streams,
            get_twitch_streams_by_game,
            get_twitch_trending_library_games,
            set_twitch_favorite,
            clear_twitch_cache,
            check_connectivity,
            check_update_available,
            fetch_known_issues,
            write_image_to_clipboard,
            confirm_app_close,
            hide_main_window,
            get_play_queue,
            add_to_play_queue,
            remove_from_play_queue,
            reorder_play_queue,
            clear_play_queue,
            get_tags,
            create_tag,
            delete_tag,
            rename_tag,
            update_tag_color,
            add_tag_to_game,
            remove_tag_from_game,
            get_game_tags,
            get_games_by_tag,
            get_all_game_tag_ids,
            gdrive_auth_start,
            gdrive_auth_status,
            gdrive_auth_logout,
            run_backup,
            list_backups,
            restore_backup,
            get_backup_status,
            set_backup_frequency,
            set_backup_retention,
            get_achievement_definitions,
            get_unlocked_achievements,
            get_achievement_status,
            evaluate_achievements,
            get_xp_summary,
            get_xp_history,
            get_xp_breakdown,
            award_xp,
            backfill_xp_from_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
