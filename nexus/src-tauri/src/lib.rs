mod commands;
pub mod db;
pub mod dedup;
pub mod metadata;
pub mod models;
pub mod sources;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use rusqlite;
use tauri::Manager;

use commands::{
    collections::{
        add_to_collection, create_collection, delete_collection, get_collection_games,
        get_collections, remove_from_collection, reorder_collections, update_collection,
    },
    database::{clear_play_history, get_db_status, reset_all, reset_keep_keys},
    health::check_library_health,
    events::emit_test_event,
    games::{confirm_games, delete_game, get_game, get_games, search_games, update_game},
    launcher::{check_process_running, find_game_process, launch_game, stop_game},
    metadata::{
        cancel_hltb_backfill, clear_cache, fetch_all_metadata, fetch_artwork, fetch_hltb,
        fetch_metadata, get_cache_stats, get_key_status, get_metadata, get_placeholder_cover,
        run_hltb_backfill, run_score_backfill, verify_igdb_keys, verify_steamgrid_key,
    },
    ping::ping,
    playtime::get_playtime,
    scanner::scan_directory,
    sessions::{
        create_session, end_session, get_activity_data, get_all_sessions, get_library_stats,
        get_orphaned_sessions, get_play_sessions, get_play_stats, get_top_games,
    },
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
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_state = db::init().expect("failed to initialize database");
    let folder_watcher = sources::watcher::FolderWatcher::new();
    let hltb_backfill_state = commands::metadata::HltbBackfillState {
        cancel: Arc::new(AtomicBool::new(false)),
    };

    tauri::Builder::default()
        .manage(db_state)
        .manage(folder_watcher)
        .manage(hltb_backfill_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let db_state = app.state::<db::DbState>();
            let db_path = db_state.db_path.clone();
            let cancel = app.state::<commands::metadata::HltbBackfillState>().cancel.clone();

            tauri::async_runtime::spawn(async move {
                // Defer backfill by 10s to avoid competing with library load
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;

                let db_arc = Arc::new(db::DbState {
                    conn: std::sync::Mutex::new(
                        match rusqlite::Connection::open(&db_path) {
                            Ok(c) => c,
                            Err(e) => {
                                log::warn!("HLTB backfill: failed to open db: {e}");
                                return;
                            }
                        },
                    ),
                    db_path,
                });

                metadata::pipeline::run_hltb_backfill(db_arc, app_handle, cancel, false).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            scan_directory,
            launch_game,
            stop_game,
            check_process_running,
            find_game_process,
            get_playtime,
            get_metadata,
            get_db_status,
            reset_all,
            reset_keep_keys,
            clear_play_history,
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
            get_collections,
            create_collection,
            update_collection,
            delete_collection,
            add_to_collection,
            remove_from_collection,
            reorder_collections,
            get_collection_games,
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
            fetch_artwork,
            fetch_all_metadata,
            get_key_status,
            get_cache_stats,
            clear_cache,
            get_placeholder_cover,
            run_score_backfill,
            fetch_hltb,
            run_hltb_backfill,
            cancel_hltb_backfill,
            check_library_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
