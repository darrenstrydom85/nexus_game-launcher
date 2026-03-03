use rusqlite::params;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

use super::error::CommandError;
use crate::db::DbState;
use crate::sources::battlenet::BattleNetScanner;
use crate::sources::epic::EpicScanner;
use crate::sources::gog::GogScanner;
use crate::sources::standalone::StandaloneScanner;
use crate::sources::steam::SteamScanner;
use crate::sources::ubisoft::UbisoftScanner;
use crate::sources::watcher::{FolderWatcher, WatcherEvent};
use crate::sources::xbox::XboxScanner;
use crate::sources::{DetectedGame, GameSource, LauncherInfo, ScanProgress, ScanStatus};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSourcesResult {
    pub games: Vec<DetectedGame>,
    pub errors: Vec<SourceScanError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceScanError {
    pub source: String,
    pub message: String,
}

/// Load `source_{id}_path_override` from settings and apply it to the scanner.
fn load_override_for_source(
    db: &DbState,
    source: &mut dyn GameSource,
) -> Result<(), CommandError> {
    let key = format!("source_{}_path_override", source.id());
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, Option<String>>(0),
    );

    match result {
        Ok(Some(path_str)) if !path_str.is_empty() => {
            source.set_path_override(Some(std::path::PathBuf::from(path_str)));
        }
        _ => {
            source.set_path_override(None);
        }
    }

    Ok(())
}

/// Load watched folder paths from the database.
fn load_watched_folders(db: &DbState) -> Result<Vec<std::path::PathBuf>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT path FROM watched_folders")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let paths = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            Ok(std::path::PathBuf::from(path))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(paths)
}

/// Orchestrates scanning across all enabled sources.
///
/// 1. Loads watched folders from DB for the standalone scanner
/// 2. Loads path overrides from settings for each source
/// 3. Runs each source's `detect_games()`
/// 4. Emits `scan-progress` events per source
/// 5. Isolates per-source failures so one broken scanner doesn't crash the whole scan
#[tauri::command]
pub async fn scan_sources(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<ScanSourcesResult, CommandError> {
    let watched_folders = load_watched_folders(&db)?;
    let mut sources = get_registered_sources(watched_folders);

    for source in sources.iter_mut() {
        load_override_for_source(&db, source.as_mut())?;
    }

    let mut all_games: Vec<DetectedGame> = Vec::new();
    let mut all_errors: Vec<SourceScanError> = Vec::new();

    for source in sources.iter() {
        let source_id = source.id().to_string();
        let source_name = source.display_name().to_string();

        if !source.is_available() {
            let _ = app.emit(
                "scan-progress",
                ScanProgress {
                    source: source_id.clone(),
                    found_count: 0,
                    status: ScanStatus::Skipped,
                },
            );
            log::info!("source '{source_name}' is unavailable, skipping");
            continue;
        }

        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                source: source_id.clone(),
                found_count: 0,
                status: ScanStatus::Scanning,
            },
        );

        match source.detect_games() {
            Ok(games) => {
                let count = games.len();
                all_games.extend(games);

                let _ = app.emit(
                    "scan-progress",
                    ScanProgress {
                        source: source_id,
                        found_count: count,
                        status: ScanStatus::Complete,
                    },
                );
                log::info!("source '{source_name}' found {count} games");
            }
            Err(e) => {
                let msg = e.to_string();
                all_errors.push(SourceScanError {
                    source: source_id.clone(),
                    message: msg.clone(),
                });

                let _ = app.emit(
                    "scan-progress",
                    ScanProgress {
                        source: source_id,
                        found_count: 0,
                        status: ScanStatus::Error,
                    },
                );
                log::error!("source '{source_name}' failed: {msg}");
            }
        }
    }

    Ok(ScanSourcesResult {
        games: all_games,
        errors: all_errors,
    })
}

/// Checks which launchers are installed and returns their resolved path
/// and detection method.
#[tauri::command]
pub async fn detect_launchers(
    db: State<'_, DbState>,
) -> Result<Vec<LauncherInfo>, CommandError> {
    let watched_folders = load_watched_folders(&db)?;
    let mut sources = get_registered_sources(watched_folders);

    for source in sources.iter_mut() {
        load_override_for_source(&db, source.as_mut())?;
    }

    let mut results = Vec::new();
    for source in sources.iter() {
        let resolved = source.resolved_path();
        let method = if resolved.is_some() {
            // Determine how the path was resolved by checking override first
            determine_detection_method(source.as_ref())
        } else {
            crate::sources::DetectionMethod::Unavailable
        };

        results.push(LauncherInfo {
            source_id: source.id().to_string(),
            display_name: source.display_name().to_string(),
            resolved_path: resolved,
            detection_method: method,
        });
    }

    Ok(results)
}

fn determine_detection_method(source: &dyn GameSource) -> crate::sources::DetectionMethod {
    // The resolved_path() implementation in each source already encodes
    // the priority chain. We re-check: if default_paths contain the resolved
    // path, it was a default; otherwise it was auto or override.
    // For the orchestrator layer, we rely on the source's own knowledge.
    // Since the trait doesn't expose the method directly, we use a heuristic:
    // check if any default path matches the resolved path.
    if let Some(resolved) = source.resolved_path() {
        for default in source.default_paths() {
            if resolved == default {
                return crate::sources::DetectionMethod::Default;
            }
        }
        // If it's not a default path, it was either auto-detected or overridden.
        // Without deeper introspection, we report Auto as the fallback.
        // Individual source implementations can override this via LauncherInfo
        // if they track their own detection method.
        crate::sources::DetectionMethod::Auto
    } else {
        crate::sources::DetectionMethod::Unavailable
    }
}

/// Returns all registered source scanners.
///
/// The `watched_folders` parameter is injected into the standalone scanner.
/// New scanners are added here as they are implemented in future stories
/// (3.4 Steam, 3.5 Epic, etc.).
fn get_registered_sources(watched_folders: Vec<std::path::PathBuf>) -> Vec<Box<dyn GameSource>> {
    let mut standalone = StandaloneScanner::new();
    standalone.set_watched_folders(watched_folders);

    vec![
        Box::new(standalone),
        Box::new(SteamScanner::new()),
        Box::new(EpicScanner::new()),
        Box::new(GogScanner::new()),
        Box::new(UbisoftScanner::new()),
        Box::new(BattleNetScanner::new()),
        Box::new(XboxScanner::new()),
    ]
}

// ---------------------------------------------------------------------------
// Filesystem watcher commands (Story 3.3)
// ---------------------------------------------------------------------------

/// Load watched folders that have `auto_scan = 1` from the database.
fn load_auto_scan_folders(
    db: &DbState,
) -> Result<Vec<(String, PathBuf)>, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT id, path FROM watched_folders WHERE auto_scan = 1")
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let folders = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let path: String = row.get(1)?;
            Ok((id, PathBuf::from(path)))
        })
        .map_err(|e| CommandError::Database(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(folders)
}

/// Start a watcher for a single folder, wiring up the callback to emit
/// Tauri events and update the database (mark games hidden on delete).
fn start_watcher_for_folder(
    app: &AppHandle,
    db: &DbState,
    watcher: &FolderWatcher,
    folder_id: &str,
    folder_path: &std::path::Path,
) -> Result<(), CommandError> {
    let app_handle = app.clone();
    let db_conn_path = db.db_path.clone();
    let fid = folder_id.to_string();

    watcher
        .watch_folder(folder_id, folder_path, move |event| {
            match event {
                WatcherEvent::GameDetected(game) => {
                    log::info!(
                        "watcher detected new game '{}' in folder {}",
                        game.name,
                        fid
                    );
                    let _ = app_handle.emit("watcher-game-detected", &game);
                }
                WatcherEvent::GameRemoved { folder_path } => {
                    log::info!(
                        "watcher detected removed folder: {}",
                        folder_path.display()
                    );
                    if let Err(e) =
                        mark_game_hidden_by_folder(&db_conn_path, &folder_path)
                    {
                        log::error!("failed to mark game hidden: {e}");
                    }
                    let _ = app_handle.emit(
                        "watcher-game-removed",
                        folder_path.to_string_lossy().to_string(),
                    );
                }
            }
        })
        .map_err(|e| CommandError::Unknown(e.to_string()))?;

    Ok(())
}

/// Mark a game as hidden (`is_hidden = 1`) by matching its `folder_path`.
fn mark_game_hidden_by_folder(
    db_path: &std::path::Path,
    folder_path: &std::path::Path,
) -> Result<(), String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("failed to open db: {e}"))?;

    let folder_str = folder_path.to_string_lossy();
    conn.execute(
        "UPDATE games SET is_hidden = 1, updated_at = datetime('now') WHERE folder_path = ?1 AND is_hidden = 0",
        params![folder_str.as_ref()],
    )
    .map_err(|e| format!("failed to update game: {e}"))?;

    Ok(())
}

/// Initialize watchers for all `auto_scan = 1` folders on app startup.
///
/// Should be called once during app initialization after the database is ready.
#[tauri::command]
pub async fn start_folder_watchers(
    app: AppHandle,
    db: State<'_, DbState>,
    watcher: State<'_, FolderWatcher>,
) -> Result<usize, CommandError> {
    let folders = load_auto_scan_folders(&db)?;
    let mut started = 0;

    for (id, path) in &folders {
        match start_watcher_for_folder(&app, &db, &watcher, id, path) {
            Ok(()) => started += 1,
            Err(e) => {
                log::error!(
                    "failed to start watcher for folder '{}' ({}): {e}",
                    path.display(),
                    id
                );
            }
        }
    }

    log::info!("started {started}/{} folder watchers", folders.len());
    Ok(started)
}

/// Stop all active folder watchers.
#[tauri::command]
pub async fn stop_folder_watchers(
    watcher: State<'_, FolderWatcher>,
) -> Result<(), CommandError> {
    watcher
        .unwatch_all()
        .map_err(|e| CommandError::Unknown(e.to_string()))
}

/// Stop watching a specific folder (e.g., when user removes a watched folder).
#[tauri::command]
pub async fn stop_folder_watcher(
    watcher: State<'_, FolderWatcher>,
    folder_id: String,
) -> Result<(), CommandError> {
    watcher
        .unwatch_folder(&folder_id)
        .map_err(|e| CommandError::Unknown(e.to_string()))
}

/// Get the list of currently active watcher folder IDs.
#[tauri::command]
pub async fn get_active_watchers(
    watcher: State<'_, FolderWatcher>,
) -> Result<Vec<String>, CommandError> {
    watcher
        .active_watcher_ids()
        .map_err(|e| CommandError::Unknown(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::sources::watcher::FolderWatcher;
    use crate::sources::{DetectedGame, DetectionMethod, GameSource, SourceError};
    use std::path::PathBuf;

    struct MockSource {
        available: bool,
        games: Vec<DetectedGame>,
        fail: bool,
        path_override: Option<PathBuf>,
    }

    impl MockSource {
        fn new(available: bool, games: Vec<DetectedGame>, fail: bool) -> Self {
            Self {
                available,
                games,
                fail,
                path_override: None,
            }
        }
    }

    impl GameSource for MockSource {
        fn id(&self) -> &str {
            "mock"
        }
        fn display_name(&self) -> &str {
            "Mock Source"
        }
        fn is_available(&self) -> bool {
            self.available
        }
        fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError> {
            if self.fail {
                Err(SourceError::Other("mock failure".into()))
            } else {
                Ok(self.games.clone())
            }
        }
        fn default_paths(&self) -> Vec<PathBuf> {
            vec![]
        }
        fn set_path_override(&mut self, path: Option<PathBuf>) {
            self.path_override = path;
        }
        fn resolved_path(&self) -> Option<PathBuf> {
            self.path_override.clone()
        }
    }

    fn make_detected_game(name: &str) -> DetectedGame {
        DetectedGame {
            name: name.into(),
            source: crate::models::game::GameSource::Steam,
            source_id: None,
            source_hint: None,
            folder_path: None,
            exe_path: None,
            exe_name: None,
            launch_url: None,
            potential_exe_names: None,
        }
    }

    #[test]
    fn get_registered_sources_includes_all_scanners() {
        let sources = get_registered_sources(vec![]);
        assert_eq!(sources.len(), 7);
        assert_eq!(sources[0].id(), "standalone");
        assert_eq!(sources[1].id(), "steam");
        assert_eq!(sources[2].id(), "epic");
        assert_eq!(sources[3].id(), "gog");
        assert_eq!(sources[4].id(), "ubisoft");
        assert_eq!(sources[5].id(), "battlenet");
        assert_eq!(sources[6].id(), "xbox");
    }

    #[test]
    fn load_override_sets_path_from_settings() {
        let state = db::init_in_memory().unwrap();
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params!["source_mock_path_override", "C:\\MockLauncher"],
            )
            .unwrap();
        }

        let mut source = MockSource::new(true, vec![], false);
        load_override_for_source(&state, &mut source).unwrap();
        assert_eq!(
            source.path_override,
            Some(PathBuf::from("C:\\MockLauncher"))
        );
    }

    #[test]
    fn load_override_clears_when_no_setting() {
        let state = db::init_in_memory().unwrap();
        let mut source = MockSource::new(true, vec![], false);
        source.path_override = Some(PathBuf::from("old"));

        load_override_for_source(&state, &mut source).unwrap();
        assert!(source.path_override.is_none());
    }

    #[test]
    fn load_override_clears_when_empty_string() {
        let state = db::init_in_memory().unwrap();
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params!["source_mock_path_override", ""],
            )
            .unwrap();
        }

        let mut source = MockSource::new(true, vec![], false);
        load_override_for_source(&state, &mut source).unwrap();
        assert!(source.path_override.is_none());
    }

    #[test]
    fn mock_source_trait_implementation() {
        let games = vec![make_detected_game("Game A"), make_detected_game("Game B")];
        let source = MockSource::new(true, games, false);

        assert_eq!(source.id(), "mock");
        assert_eq!(source.display_name(), "Mock Source");
        assert!(source.is_available());

        let detected = source.detect_games().unwrap();
        assert_eq!(detected.len(), 2);
        assert_eq!(detected[0].name, "Game A");
    }

    #[test]
    fn mock_source_failure_returns_error() {
        let source = MockSource::new(true, vec![], true);
        let result = source.detect_games();
        assert!(result.is_err());
    }

    #[test]
    fn mock_source_unavailable() {
        let source = MockSource::new(false, vec![], false);
        assert!(!source.is_available());
    }

    #[test]
    fn mock_source_path_override() {
        let mut source = MockSource::new(true, vec![], false);
        assert!(source.resolved_path().is_none());

        source.set_path_override(Some(PathBuf::from("C:\\Custom")));
        assert_eq!(source.resolved_path(), Some(PathBuf::from("C:\\Custom")));

        source.set_path_override(None);
        assert!(source.resolved_path().is_none());
    }

    #[test]
    fn scan_sources_result_serializes() {
        let result = ScanSourcesResult {
            games: vec![make_detected_game("Test")],
            errors: vec![SourceScanError {
                source: "epic".into(),
                message: "not found".into(),
            }],
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"games\""));
        assert!(json.contains("\"errors\""));
        assert!(json.contains("Test"));
        assert!(json.contains("epic"));
    }

    #[test]
    fn determine_detection_method_returns_unavailable_for_no_path() {
        let source = MockSource::new(false, vec![], false);
        let method = determine_detection_method(&source);
        assert_eq!(method, DetectionMethod::Unavailable);
    }

    #[test]
    fn load_watched_folders_returns_paths() {
        let state = db::init_in_memory().unwrap();
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO watched_folders (id, path, auto_scan, added_at) VALUES (?1, ?2, 1, '2026-01-01')",
                params!["id1", "C:\\Games"],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO watched_folders (id, path, auto_scan, added_at) VALUES (?1, ?2, 0, '2026-01-01')",
                params!["id2", "D:\\Repacks"],
            )
            .unwrap();
        }

        let folders = load_watched_folders(&state).unwrap();
        assert_eq!(folders.len(), 2);
        assert!(folders.contains(&PathBuf::from("C:\\Games")));
        assert!(folders.contains(&PathBuf::from("D:\\Repacks")));
    }

    #[test]
    fn load_watched_folders_empty_table() {
        let state = db::init_in_memory().unwrap();
        let folders = load_watched_folders(&state).unwrap();
        assert!(folders.is_empty());
    }

    // -- Watcher command tests (Story 3.3) --

    #[test]
    fn load_auto_scan_folders_returns_only_auto_scan() {
        let state = db::init_in_memory().unwrap();
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO watched_folders (id, path, auto_scan, added_at) VALUES (?1, ?2, 1, '2026-01-01')",
                params!["id1", "C:\\Games"],
            ).unwrap();
            conn.execute(
                "INSERT INTO watched_folders (id, path, auto_scan, added_at) VALUES (?1, ?2, 0, '2026-01-01')",
                params!["id2", "D:\\ManualOnly"],
            ).unwrap();
            conn.execute(
                "INSERT INTO watched_folders (id, path, auto_scan, added_at) VALUES (?1, ?2, 1, '2026-01-01')",
                params!["id3", "E:\\Repacks"],
            ).unwrap();
        }

        let folders = load_auto_scan_folders(&state).unwrap();
        assert_eq!(folders.len(), 2);
        let ids: Vec<&str> = folders.iter().map(|(id, _)| id.as_str()).collect();
        assert!(ids.contains(&"id1"));
        assert!(ids.contains(&"id3"));
        assert!(!ids.contains(&"id2"));
    }

    #[test]
    fn load_auto_scan_folders_empty_table() {
        let state = db::init_in_memory().unwrap();
        let folders = load_auto_scan_folders(&state).unwrap();
        assert!(folders.is_empty());
    }

    fn init_file_db() -> (DbState, tempfile::TempDir) {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("test.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrations::run_pending(&conn).unwrap();
        let state = DbState {
            conn: std::sync::Mutex::new(conn),
            db_path,
        };
        (state, tmp)
    }

    #[test]
    fn mark_game_hidden_by_folder_updates_game() {
        let (state, _tmp) = init_file_db();
        let folder_path = PathBuf::from("C:\\Games\\MyGame");
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO games (id, name, source, folder_path, is_hidden, added_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, '2026-01-01', '2026-01-01')",
                params!["g1", "My Game", "standalone", folder_path.to_string_lossy().as_ref()],
            ).unwrap();
        }

        mark_game_hidden_by_folder(&state.db_path, &folder_path).unwrap();

        let conn = state.conn.lock().unwrap();
        let hidden: i64 = conn
            .query_row(
                "SELECT is_hidden FROM games WHERE id = 'g1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(hidden, 1);
    }

    #[test]
    fn mark_game_hidden_by_folder_no_match_is_ok() {
        let (state, _tmp) = init_file_db();
        let result = mark_game_hidden_by_folder(
            &state.db_path,
            &PathBuf::from("C:\\Nonexistent"),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn mark_game_hidden_skips_already_hidden() {
        let (state, _tmp) = init_file_db();
        let folder_path = PathBuf::from("C:\\Games\\HiddenGame");
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO games (id, name, source, folder_path, is_hidden, added_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, '2026-01-01', '2026-01-01')",
                params!["g2", "Hidden Game", "standalone", folder_path.to_string_lossy().as_ref()],
            ).unwrap();
        }

        let result = mark_game_hidden_by_folder(&state.db_path, &folder_path);
        assert!(result.is_ok());

        let conn = state.conn.lock().unwrap();
        let hidden: i64 = conn
            .query_row(
                "SELECT is_hidden FROM games WHERE id = 'g2'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(hidden, 1);
    }

    #[test]
    fn folder_watcher_state_integration() {
        let watcher = FolderWatcher::new();
        let ids = watcher.active_watcher_ids().unwrap();
        assert!(ids.is_empty());

        let tmp = tempfile::TempDir::new().unwrap();
        watcher.watch_folder("test-id", tmp.path(), |_| {}).unwrap();

        let ids = watcher.active_watcher_ids().unwrap();
        assert_eq!(ids.len(), 1);

        watcher.unwatch_folder("test-id").unwrap();
        let ids = watcher.active_watcher_ids().unwrap();
        assert!(ids.is_empty());
    }
}
