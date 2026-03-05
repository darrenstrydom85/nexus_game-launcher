mod commands;
pub mod db;
pub mod dedup;
pub mod metadata;
pub mod models;
pub mod sources;
pub mod twitch;
mod utils;

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
        apply_steamgrid_artwork, clear_cache, fetch_all_metadata, fetch_artwork, fetch_metadata,
        fetch_metadata_with_igdb_id, get_cache_stats, get_key_status, get_metadata,
        get_placeholder_cover, run_score_backfill, search_metadata, search_steamgrid_artwork,
        verify_igdb_keys, verify_steamgrid_key,
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
    twitch::{
        check_connectivity, clear_twitch_cache, get_twitch_followed_channels, get_twitch_live_streams,
        get_twitch_streams_by_game, get_twitch_trending_library_games, set_twitch_favorite,
        twitch_auth_logout, twitch_auth_start, twitch_auth_status, validate_twitch_token,
    },
    version_check::check_update_available,
};

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
        .setup(|_app| Ok(()))
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
            check_library_health,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
