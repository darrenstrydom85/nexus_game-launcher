pub mod battlenet;
pub mod epic;
pub mod gog;
pub mod standalone;
pub mod steam;
pub mod ubisoft;
pub mod watcher;
pub mod xbox;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::models::game::GameSource as GameSourceType;

/// Describes how a launcher's base path was resolved.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DetectionMethod {
    Override,
    Auto,
    Default,
    Unavailable,
}

impl DetectionMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Override => "override",
            Self::Auto => "auto",
            Self::Default => "default",
            Self::Unavailable => "unavailable",
        }
    }
}

/// A game discovered by a scanner before it is persisted to the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGame {
    pub name: String,
    pub source: GameSourceType,
    pub source_id: Option<String>,
    pub source_hint: Option<String>,
    pub folder_path: Option<PathBuf>,
    pub exe_path: Option<PathBuf>,
    pub exe_name: Option<String>,
    pub launch_url: Option<String>,
    /// Comma-separated list of candidate exe filenames for process tracking.
    #[serde(default)]
    pub potential_exe_names: Option<String>,
}

/// Progress payload emitted to the frontend during scanning.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub source: String,
    pub found_count: usize,
    pub status: ScanStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScanStatus {
    Scanning,
    Complete,
    Error,
    Skipped,
}

/// Per-source result returned by `detect_launchers`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherInfo {
    pub source_id: String,
    pub display_name: String,
    pub resolved_path: Option<PathBuf>,
    pub detection_method: DetectionMethod,
}

/// Common interface every game-source scanner must implement.
///
/// Path resolution order:
/// 1. User-provided override (`set_path_override`)
/// 2. Auto-detected path (registry, env vars) — scanner-specific
/// 3. Hardcoded default paths (`default_paths`)
/// 4. If all fail → `is_available() == false`
pub trait GameSource: Send + Sync {
    /// Short identifier, e.g. `"steam"`.
    fn id(&self) -> &str;

    /// Human-readable name, e.g. `"Steam"`.
    fn display_name(&self) -> &str;

    /// Whether this launcher is currently reachable on the system.
    fn is_available(&self) -> bool;

    /// Scan and return every game this source can find.
    fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError>;

    /// Known default install locations for this launcher.
    fn default_paths(&self) -> Vec<PathBuf>;

    /// Set (or clear) a user-provided launcher install path.
    fn set_path_override(&mut self, path: Option<PathBuf>);

    /// Returns the override if set, otherwise the auto-detected or default path.
    fn resolved_path(&self) -> Option<PathBuf>;
}

/// Resolve the best available path for a source using the priority chain.
///
/// 1. `path_override` — user-supplied value from settings
/// 2. `auto_detect`   — closure that attempts registry / env-var lookup
/// 3. `defaults`      — hardcoded fallback paths
///
/// Returns `(Option<PathBuf>, DetectionMethod)`.
pub fn resolve_path(
    path_override: &Option<PathBuf>,
    auto_detect: impl FnOnce() -> Option<PathBuf>,
    defaults: &[PathBuf],
) -> (Option<PathBuf>, DetectionMethod) {
    if let Some(p) = path_override {
        if p.exists() {
            return (Some(p.clone()), DetectionMethod::Override);
        }
    }

    if let Some(p) = auto_detect() {
        if p.exists() {
            return (Some(p), DetectionMethod::Auto);
        }
    }

    for p in defaults {
        if p.exists() {
            return (Some(p.clone()), DetectionMethod::Default);
        }
    }

    (None, DetectionMethod::Unavailable)
}

#[derive(Debug, thiserror::Error)]
pub enum SourceError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("parse error: {0}")]
    Parse(String),

    #[error("source unavailable: {0}")]
    Unavailable(String),

    #[error("{0}")]
    Other(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn resolve_path_prefers_override() {
        let tmp = TempDir::new().unwrap();
        let override_dir = tmp.path().join("override");
        fs::create_dir(&override_dir).unwrap();

        let (path, method) = resolve_path(
            &Some(override_dir.clone()),
            || None,
            &[],
        );
        assert_eq!(method, DetectionMethod::Override);
        assert_eq!(path.unwrap(), override_dir);
    }

    #[test]
    fn resolve_path_falls_back_to_auto_detect() {
        let tmp = TempDir::new().unwrap();
        let auto_dir = tmp.path().join("auto");
        fs::create_dir(&auto_dir).unwrap();

        let auto_clone = auto_dir.clone();
        let (path, method) = resolve_path(
            &None,
            move || Some(auto_clone),
            &[],
        );
        assert_eq!(method, DetectionMethod::Auto);
        assert_eq!(path.unwrap(), auto_dir);
    }

    #[test]
    fn resolve_path_falls_back_to_default() {
        let tmp = TempDir::new().unwrap();
        let default_dir = tmp.path().join("default");
        fs::create_dir(&default_dir).unwrap();

        let (path, method) = resolve_path(
            &None,
            || None,
            &[default_dir.clone()],
        );
        assert_eq!(method, DetectionMethod::Default);
        assert_eq!(path.unwrap(), default_dir);
    }

    #[test]
    fn resolve_path_returns_unavailable_when_nothing_exists() {
        let (path, method) = resolve_path(
            &None,
            || None,
            &[PathBuf::from("C:\\nonexistent_path_xyz_12345")],
        );
        assert_eq!(method, DetectionMethod::Unavailable);
        assert!(path.is_none());
    }

    #[test]
    fn resolve_path_skips_nonexistent_override() {
        let tmp = TempDir::new().unwrap();
        let default_dir = tmp.path().join("default");
        fs::create_dir(&default_dir).unwrap();

        let (path, method) = resolve_path(
            &Some(PathBuf::from("C:\\nonexistent_override_xyz")),
            || None,
            &[default_dir.clone()],
        );
        assert_eq!(method, DetectionMethod::Default);
        assert_eq!(path.unwrap(), default_dir);
    }

    #[test]
    fn detected_game_serializes_to_camel_case() {
        let game = DetectedGame {
            name: "Test Game".into(),
            source: GameSourceType::Steam,
            source_id: Some("12345".into()),
            source_hint: None,
            folder_path: Some(PathBuf::from("C:\\Games\\Test")),
            exe_path: Some(PathBuf::from("C:\\Games\\Test\\game.exe")),
            exe_name: Some("game.exe".into()),
            launch_url: Some("steam://rungameid/12345".into()),
            potential_exe_names: None,
        };
        let json = serde_json::to_string(&game).unwrap();
        assert!(json.contains("\"sourceId\""));
        assert!(json.contains("\"folderPath\""));
        assert!(json.contains("\"exePath\""));
        assert!(json.contains("\"exeName\""));
        assert!(json.contains("\"launchUrl\""));
        assert!(json.contains("\"sourceHint\""));
    }

    #[test]
    fn scan_progress_serializes_correctly() {
        let progress = ScanProgress {
            source: "steam".into(),
            found_count: 42,
            status: ScanStatus::Complete,
        };
        let json = serde_json::to_string(&progress).unwrap();
        assert!(json.contains("\"foundCount\""));
        assert!(json.contains("\"complete\""));
    }

    #[test]
    fn launcher_info_serializes_correctly() {
        let info = LauncherInfo {
            source_id: "steam".into(),
            display_name: "Steam".into(),
            resolved_path: Some(PathBuf::from("C:\\Steam")),
            detection_method: DetectionMethod::Auto,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"sourceId\""));
        assert!(json.contains("\"displayName\""));
        assert!(json.contains("\"resolvedPath\""));
        assert!(json.contains("\"detectionMethod\""));
        assert!(json.contains("\"auto\""));
    }

    #[test]
    fn detection_method_as_str() {
        assert_eq!(DetectionMethod::Override.as_str(), "override");
        assert_eq!(DetectionMethod::Auto.as_str(), "auto");
        assert_eq!(DetectionMethod::Default.as_str(), "default");
        assert_eq!(DetectionMethod::Unavailable.as_str(), "unavailable");
    }
}
