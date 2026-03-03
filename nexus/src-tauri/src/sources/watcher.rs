use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEvent, DebouncedEventKind};

use super::standalone::scan_game_directory;
use super::DetectedGame;

/// Manages filesystem watchers for standalone watched folders.
///
/// Only folders with `auto_scan = true` get active watchers.
/// The watcher fires on subfolder create/delete events and
/// notifies via a callback so the command layer can persist changes.
pub struct FolderWatcher {
    watchers: Arc<Mutex<HashMap<String, WatcherHandle>>>,
}

struct WatcherHandle {
    path: PathBuf,
    _debouncer: notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>,
}

/// Event emitted when the watcher detects a filesystem change.
#[derive(Debug, Clone)]
pub enum WatcherEvent {
    GameDetected(DetectedGame),
    GameRemoved {
        folder_path: PathBuf,
    },
}

impl FolderWatcher {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register a watcher for a single folder.
    ///
    /// `folder_id` is the watched_folders table primary key.
    /// The `callback` is invoked for each watcher event (create/delete).
    pub fn watch_folder<F>(
        &self,
        folder_id: &str,
        folder_path: &Path,
        callback: F,
    ) -> Result<(), WatcherError>
    where
        F: Fn(WatcherEvent) + Send + Sync + 'static,
    {
        if !folder_path.is_dir() {
            return Err(WatcherError::PathNotDirectory(
                folder_path.display().to_string(),
            ));
        }

        let mut watchers = self
            .watchers
            .lock()
            .map_err(|e| WatcherError::Internal(format!("lock poisoned: {e}")))?;

        if watchers.contains_key(folder_id) {
            log::warn!(
                "watcher already active for folder '{}', replacing",
                folder_id
            );
            watchers.remove(folder_id);
        }

        let watched_path = folder_path.to_path_buf();
        let callback = Arc::new(callback);

        let cb = callback.clone();
        let wp = watched_path.clone();
        let mut debouncer = new_debouncer(
            std::time::Duration::from_secs(1),
            move |result: Result<Vec<DebouncedEvent>, notify::Error>| {
                match result {
                    Ok(events) => {
                        handle_events(&events, &wp, cb.as_ref());
                    }
                    Err(e) => {
                        log::error!("filesystem watcher error: {e}");
                    }
                }
            },
        )
        .map_err(|e| WatcherError::Notify(e.to_string()))?;

        debouncer
            .watcher()
            .watch(folder_path, RecursiveMode::NonRecursive)
            .map_err(|e| WatcherError::Notify(e.to_string()))?;

        log::info!(
            "started watching folder '{}' (id={})",
            folder_path.display(),
            folder_id
        );

        watchers.insert(
            folder_id.to_string(),
            WatcherHandle {
                path: folder_path.to_path_buf(),
                _debouncer: debouncer,
            },
        );

        Ok(())
    }

    /// Stop watching a specific folder by its ID.
    /// The watcher handle is dropped, which cleans up the OS-level watcher.
    pub fn unwatch_folder(&self, folder_id: &str) -> Result<(), WatcherError> {
        let mut watchers = self
            .watchers
            .lock()
            .map_err(|e| WatcherError::Internal(format!("lock poisoned: {e}")))?;

        if watchers.remove(folder_id).is_some() {
            log::info!("stopped watching folder (id={})", folder_id);
            Ok(())
        } else {
            log::warn!(
                "attempted to unwatch folder '{}' but no active watcher found",
                folder_id
            );
            Ok(())
        }
    }

    /// Stop all active watchers.
    pub fn unwatch_all(&self) -> Result<(), WatcherError> {
        let mut watchers = self
            .watchers
            .lock()
            .map_err(|e| WatcherError::Internal(format!("lock poisoned: {e}")))?;

        let count = watchers.len();
        watchers.clear();
        log::info!("stopped all {count} folder watchers");
        Ok(())
    }

    /// Returns the IDs of all currently watched folders.
    pub fn active_watcher_ids(&self) -> Result<Vec<String>, WatcherError> {
        let watchers = self
            .watchers
            .lock()
            .map_err(|e| WatcherError::Internal(format!("lock poisoned: {e}")))?;
        Ok(watchers.keys().cloned().collect())
    }

    /// Returns the path for a watched folder by ID, if active.
    pub fn watched_path(&self, folder_id: &str) -> Result<Option<PathBuf>, WatcherError> {
        let watchers = self
            .watchers
            .lock()
            .map_err(|e| WatcherError::Internal(format!("lock poisoned: {e}")))?;
        Ok(watchers.get(folder_id).map(|h| h.path.clone()))
    }
}

/// Process debounced filesystem events.
///
/// - Create events on direct subdirectories trigger a rescan of that subfolder.
/// - Remove events on direct subdirectories emit a GameRemoved event.
fn handle_events<F>(events: &[DebouncedEvent], watched_root: &Path, callback: &F)
where
    F: Fn(WatcherEvent),
{
    let mut seen_paths: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for event in events {
        let path = &event.path;

        if !is_direct_child(path, watched_root) {
            continue;
        }

        if seen_paths.contains(path) {
            continue;
        }
        seen_paths.insert(path.clone());

        match event.kind {
            DebouncedEventKind::Any | DebouncedEventKind::AnyContinuous => {
                if path.is_dir() {
                    log::info!("new subfolder detected: {}", path.display());
                    if let Some(game) = scan_game_directory(path) {
                        callback(WatcherEvent::GameDetected(game));
                    }
                } else if !path.exists() {
                    log::info!("subfolder removed: {}", path.display());
                    callback(WatcherEvent::GameRemoved {
                        folder_path: path.clone(),
                    });
                }
            }
            _ => {}
        }
    }
}

/// Check if `path` is a direct child of `parent` (depth = 1).
fn is_direct_child(path: &Path, parent: &Path) -> bool {
    match path.parent() {
        Some(p) => p == parent,
        None => false,
    }
}

#[derive(Debug, thiserror::Error)]
pub enum WatcherError {
    #[error("path is not a directory: {0}")]
    PathNotDirectory(String),

    #[error("notify error: {0}")]
    Notify(String),

    #[error("internal error: {0}")]
    Internal(String),
}

// Make scan_game_directory accessible from this module
// (it's pub(crate) in standalone.rs via the re-export below)

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn folder_watcher_new_has_no_active_watchers() {
        let fw = FolderWatcher::new();
        let ids = fw.active_watcher_ids().unwrap();
        assert!(ids.is_empty());
    }

    #[test]
    fn is_direct_child_returns_true_for_immediate_child() {
        let parent = Path::new("C:\\Games");
        let child = Path::new("C:\\Games\\MyGame");
        assert!(is_direct_child(child, parent));
    }

    #[test]
    fn is_direct_child_returns_false_for_nested_child() {
        let parent = Path::new("C:\\Games");
        let child = Path::new("C:\\Games\\MyGame\\bin");
        assert!(!is_direct_child(child, parent));
    }

    #[test]
    fn is_direct_child_returns_false_for_same_path() {
        let parent = Path::new("C:\\Games");
        assert!(!is_direct_child(parent, parent));
    }

    #[test]
    fn watch_folder_rejects_nonexistent_path() {
        let fw = FolderWatcher::new();
        let result = fw.watch_folder("id1", Path::new("C:\\nonexistent_xyz_99999"), |_| {});
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("not a directory"));
    }

    #[test]
    fn watch_and_unwatch_folder() {
        let tmp = TempDir::new().unwrap();
        let fw = FolderWatcher::new();

        fw.watch_folder("id1", tmp.path(), |_| {}).unwrap();
        let ids = fw.active_watcher_ids().unwrap();
        assert_eq!(ids.len(), 1);
        assert!(ids.contains(&"id1".to_string()));

        let watched = fw.watched_path("id1").unwrap();
        assert_eq!(watched, Some(tmp.path().to_path_buf()));

        fw.unwatch_folder("id1").unwrap();
        let ids = fw.active_watcher_ids().unwrap();
        assert!(ids.is_empty());
    }

    #[test]
    fn unwatch_nonexistent_folder_is_ok() {
        let fw = FolderWatcher::new();
        let result = fw.unwatch_folder("nonexistent");
        assert!(result.is_ok());
    }

    #[test]
    fn watch_multiple_folders() {
        let tmp1 = TempDir::new().unwrap();
        let tmp2 = TempDir::new().unwrap();
        let fw = FolderWatcher::new();

        fw.watch_folder("id1", tmp1.path(), |_| {}).unwrap();
        fw.watch_folder("id2", tmp2.path(), |_| {}).unwrap();

        let ids = fw.active_watcher_ids().unwrap();
        assert_eq!(ids.len(), 2);
    }

    #[test]
    fn unwatch_all_clears_everything() {
        let tmp1 = TempDir::new().unwrap();
        let tmp2 = TempDir::new().unwrap();
        let fw = FolderWatcher::new();

        fw.watch_folder("id1", tmp1.path(), |_| {}).unwrap();
        fw.watch_folder("id2", tmp2.path(), |_| {}).unwrap();

        fw.unwatch_all().unwrap();
        let ids = fw.active_watcher_ids().unwrap();
        assert!(ids.is_empty());
    }

    #[test]
    fn replacing_existing_watcher() {
        let tmp = TempDir::new().unwrap();
        let fw = FolderWatcher::new();

        fw.watch_folder("id1", tmp.path(), |_| {}).unwrap();
        fw.watch_folder("id1", tmp.path(), |_| {}).unwrap();

        let ids = fw.active_watcher_ids().unwrap();
        assert_eq!(ids.len(), 1);
    }

    #[test]
    fn watched_path_returns_none_for_unknown_id() {
        let fw = FolderWatcher::new();
        let result = fw.watched_path("unknown").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn handle_events_create_subfolder_triggers_scan() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("MyGame");
        fs::create_dir(&game_dir).unwrap();
        fs::write(game_dir.join("game.exe"), "MZ_FAKE").unwrap();

        let events = vec![DebouncedEvent {
            path: game_dir.clone(),
            kind: DebouncedEventKind::Any,
        }];

        let detected = Arc::new(Mutex::new(Vec::new()));
        let det_clone = detected.clone();

        handle_events(&events, tmp.path(), &move |evt| {
            det_clone.lock().unwrap().push(evt);
        });

        let results = detected.lock().unwrap();
        assert_eq!(results.len(), 1);
        match &results[0] {
            WatcherEvent::GameDetected(game) => {
                assert_eq!(game.name, "MyGame");
                assert!(game.exe_path.is_some());
            }
            _ => panic!("expected GameDetected event"),
        }
    }

    #[test]
    fn handle_events_delete_subfolder_triggers_removal() {
        let tmp = TempDir::new().unwrap();
        let removed_path = tmp.path().join("DeletedGame");
        // Path does not exist on disk — simulates deletion

        let events = vec![DebouncedEvent {
            path: removed_path.clone(),
            kind: DebouncedEventKind::Any,
        }];

        let detected = Arc::new(Mutex::new(Vec::new()));
        let det_clone = detected.clone();

        handle_events(&events, tmp.path(), &move |evt| {
            det_clone.lock().unwrap().push(evt);
        });

        let results = detected.lock().unwrap();
        assert_eq!(results.len(), 1);
        match &results[0] {
            WatcherEvent::GameRemoved { folder_path } => {
                assert_eq!(*folder_path, removed_path);
            }
            _ => panic!("expected GameRemoved event"),
        }
    }

    #[test]
    fn handle_events_ignores_nested_paths() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("Game").join("bin");
        fs::create_dir_all(&nested).unwrap();

        let events = vec![DebouncedEvent {
            path: nested,
            kind: DebouncedEventKind::Any,
        }];

        let detected = Arc::new(Mutex::new(Vec::new()));
        let det_clone = detected.clone();

        handle_events(&events, tmp.path(), &move |evt| {
            det_clone.lock().unwrap().push(evt);
        });

        let results = detected.lock().unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn handle_events_deduplicates_same_path() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("MyGame");
        fs::create_dir(&game_dir).unwrap();
        fs::write(game_dir.join("game.exe"), "MZ_FAKE").unwrap();

        let events = vec![
            DebouncedEvent {
                path: game_dir.clone(),
                kind: DebouncedEventKind::Any,
            },
            DebouncedEvent {
                path: game_dir.clone(),
                kind: DebouncedEventKind::Any,
            },
        ];

        let detected = Arc::new(Mutex::new(Vec::new()));
        let det_clone = detected.clone();

        handle_events(&events, tmp.path(), &move |evt| {
            det_clone.lock().unwrap().push(evt);
        });

        let results = detected.lock().unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn handle_events_continuous_create() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("ContinuousGame");
        fs::create_dir(&game_dir).unwrap();
        fs::write(game_dir.join("game.exe"), "MZ_FAKE").unwrap();

        let events = vec![DebouncedEvent {
            path: game_dir.clone(),
            kind: DebouncedEventKind::AnyContinuous,
        }];

        let detected = Arc::new(Mutex::new(Vec::new()));
        let det_clone = detected.clone();

        handle_events(&events, tmp.path(), &move |evt| {
            det_clone.lock().unwrap().push(evt);
        });

        let results = detected.lock().unwrap();
        assert_eq!(results.len(), 1);
        assert!(matches!(&results[0], WatcherEvent::GameDetected(_)));
    }
}
