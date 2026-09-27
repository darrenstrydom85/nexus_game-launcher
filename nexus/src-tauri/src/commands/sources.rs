use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::error::CommandError;
use crate::db::DbState;
use crate::sources::battlenet::BattleNetScanner;
use crate::sources::epic::EpicScanner;
use crate::sources::gog::GogScanner;
use crate::sources::standalone::StandaloneScanner;
use crate::sources::steam::SteamScanner;
use crate::sources::ubisoft::UbisoftScanner;
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
fn load_override_for_source(db: &DbState, source: &mut dyn GameSource) -> Result<(), CommandError> {
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
pub async fn detect_launchers(db: State<'_, DbState>) -> Result<Vec<LauncherInfo>, CommandError> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
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
}
