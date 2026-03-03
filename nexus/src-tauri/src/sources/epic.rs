use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::models::game::GameSource as GameSourceType;

use super::{resolve_path, DetectedGame, GameSource, SourceError};

// ---------------------------------------------------------------------------
// Task 1: Path resolution — override → default
// ---------------------------------------------------------------------------

pub struct EpicScanner {
    path_override: Option<PathBuf>,
    resolved: Option<PathBuf>,
}

impl EpicScanner {
    pub fn new() -> Self {
        Self {
            path_override: None,
            resolved: None,
        }
    }

    fn resolve(&mut self) {
        let (path, _method) = resolve_path(
            &self.path_override,
            || None, // Epic has no registry-based auto-detection
            &self.default_paths(),
        );
        self.resolved = path;
    }
}

// ---------------------------------------------------------------------------
// Task 2: LauncherInstalled.dat JSON parsing
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct LauncherInstalled {
    installation_list: Vec<InstalledApp>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InstalledApp {
    app_name: String,
    install_location: String,
}

fn parse_launcher_installed(epic_path: &Path) -> Result<Vec<InstalledApp>, SourceError> {
    let dat_path = epic_path
        .join("UnrealEngineLauncher")
        .join("LauncherInstalled.dat");

    let content = std::fs::read_to_string(&dat_path).map_err(|e| {
        SourceError::Parse(format!(
            "failed to read LauncherInstalled.dat at {}: {e}",
            dat_path.display()
        ))
    })?;

    let data: LauncherInstalled = serde_json::from_str(&content).map_err(|e| {
        SourceError::Parse(format!(
            "failed to parse LauncherInstalled.dat: {e}"
        ))
    })?;

    Ok(data.installation_list)
}

// ---------------------------------------------------------------------------
// Task 3: Manifest .item file scanning for display names
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ManifestItem {
    app_name: String,
    display_name: String,
}

fn scan_manifest_items(epic_path: &Path) -> Result<HashMap<String, String>, SourceError> {
    let manifests_dir = epic_path
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");

    if !manifests_dir.is_dir() {
        return Ok(HashMap::new());
    }

    let mut name_map: HashMap<String, String> = HashMap::new();
    let entries = std::fs::read_dir(&manifests_dir)?;

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = match path.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };

        if !file_name.ends_with(".item") {
            continue;
        }

        match parse_manifest_item(&path) {
            Ok(item) => {
                name_map.insert(item.app_name, item.display_name);
            }
            Err(e) => {
                log::warn!("failed to parse manifest {}: {e}", path.display());
            }
        }
    }

    Ok(name_map)
}

fn parse_manifest_item(path: &Path) -> Result<ManifestItem, SourceError> {
    let content = std::fs::read_to_string(path)?;
    let item: ManifestItem = serde_json::from_str(&content).map_err(|e| {
        SourceError::Parse(format!(
            "failed to parse manifest item {}: {e}",
            path.display()
        ))
    })?;
    Ok(item)
}

// ---------------------------------------------------------------------------
// Tasks 4 & 5: Cross-reference by AppName + Assemble DetectedGame
// ---------------------------------------------------------------------------

impl EpicScanner {
    pub fn scan(&self) -> Result<Vec<DetectedGame>, SourceError> {
        let epic_path = match &self.resolved {
            Some(p) => p.clone(),
            None => {
                return Err(SourceError::Unavailable(
                    "Epic Games data directory not found".into(),
                ))
            }
        };

        let installed_apps = parse_launcher_installed(&epic_path)?;
        let display_names = scan_manifest_items(&epic_path)?;

        let mut games = Vec::new();

        for app in &installed_apps {
            let name = display_names
                .get(&app.app_name)
                .cloned()
                .unwrap_or_else(|| app.app_name.clone());

            let install_path = PathBuf::from(&app.install_location);
            if !install_path.is_dir() {
                log::debug!(
                    "skipping Epic app {} ({}): install path does not exist: {}",
                    app.app_name,
                    name,
                    install_path.display()
                );
                continue;
            }

            games.push(DetectedGame {
                name,
                source: GameSourceType::Epic,
                source_id: Some(app.app_name.clone()),
                source_hint: None,
                folder_path: Some(install_path),
                exe_path: None,
                exe_name: None,
                launch_url: Some(format!(
                    "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                    app.app_name
                )),
                potential_exe_names: None,
            });
        }

        Ok(games)
    }
}

// ---------------------------------------------------------------------------
// Task 6: Availability check + GameSource trait
// ---------------------------------------------------------------------------

impl GameSource for EpicScanner {
    fn id(&self) -> &str {
        "epic"
    }

    fn display_name(&self) -> &str {
        "Epic Games Store"
    }

    fn is_available(&self) -> bool {
        match &self.resolved {
            Some(p) => p
                .join("UnrealEngineLauncher")
                .join("LauncherInstalled.dat")
                .is_file(),
            None => false,
        }
    }

    fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError> {
        self.scan()
    }

    fn default_paths(&self) -> Vec<PathBuf> {
        vec![PathBuf::from(r"C:\ProgramData\Epic")]
    }

    fn set_path_override(&mut self, path: Option<PathBuf>) {
        self.path_override = path;
        self.resolve();
    }

    fn resolved_path(&self) -> Option<PathBuf> {
        self.resolved.clone()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper: create a minimal Epic data directory structure.
    fn create_epic_dir(tmp: &TempDir) -> PathBuf {
        let epic = tmp.path().join("Epic");
        let uel = epic.join("UnrealEngineLauncher");
        let manifests = epic
            .join("EpicGamesLauncher")
            .join("Data")
            .join("Manifests");
        fs::create_dir_all(&uel).unwrap();
        fs::create_dir_all(&manifests).unwrap();
        epic
    }

    /// Helper: write a LauncherInstalled.dat with given apps.
    fn write_launcher_installed(epic_path: &Path, apps: &[(&str, &str)]) {
        let entries: Vec<String> = apps
            .iter()
            .map(|(app_name, install_location)| {
                format!(
                    r#"{{ "AppName": "{app_name}", "InstallLocation": "{}" }}"#,
                    install_location.replace('\\', "\\\\")
                )
            })
            .collect();

        let json = format!(
            r#"{{ "InstallationList": [{}] }}"#,
            entries.join(", ")
        );

        let dat_path = epic_path
            .join("UnrealEngineLauncher")
            .join("LauncherInstalled.dat");
        fs::write(dat_path, json).unwrap();
    }

    /// Helper: write a manifest .item file.
    fn write_manifest_item(epic_path: &Path, app_name: &str, display_name: &str) {
        let manifests = epic_path
            .join("EpicGamesLauncher")
            .join("Data")
            .join("Manifests");
        let json = format!(
            r#"{{ "AppName": "{app_name}", "DisplayName": "{display_name}" }}"#
        );
        fs::write(manifests.join(format!("{app_name}.item")), json).unwrap();
    }

    // -- Task 1: Path resolution --

    #[test]
    fn scanner_uses_override_path() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic.clone()));
        assert_eq!(scanner.resolved_path(), Some(epic));
    }

    #[test]
    fn scanner_default_paths_contains_programdata() {
        let scanner = EpicScanner::new();
        let defaults = scanner.default_paths();
        assert_eq!(defaults.len(), 1);
        assert!(defaults[0].to_string_lossy().contains("Epic"));
    }

    #[test]
    fn scanner_no_path_resolved_when_nothing_exists() {
        let scanner = EpicScanner::new();
        assert!(scanner.resolved_path().is_none());
    }

    // -- Task 2: LauncherInstalled.dat parsing --

    #[test]
    fn parse_launcher_installed_extracts_apps() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let install_dir = tmp.path().join("Games").join("Fortnite");
        fs::create_dir_all(&install_dir).unwrap();

        write_launcher_installed(
            &epic,
            &[("Fortnite", &install_dir.to_string_lossy())],
        );

        let apps = parse_launcher_installed(&epic).unwrap();
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].app_name, "Fortnite");
        assert_eq!(apps[0].install_location, install_dir.to_string_lossy().as_ref());
    }

    #[test]
    fn parse_launcher_installed_multiple_apps() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let dir1 = tmp.path().join("Games").join("GameA");
        let dir2 = tmp.path().join("Games").join("GameB");
        fs::create_dir_all(&dir1).unwrap();
        fs::create_dir_all(&dir2).unwrap();

        write_launcher_installed(
            &epic,
            &[
                ("AppA", &dir1.to_string_lossy()),
                ("AppB", &dir2.to_string_lossy()),
            ],
        );

        let apps = parse_launcher_installed(&epic).unwrap();
        assert_eq!(apps.len(), 2);
    }

    #[test]
    fn parse_launcher_installed_error_when_missing() {
        let tmp = TempDir::new().unwrap();
        let epic = tmp.path().join("Epic");
        fs::create_dir_all(epic.join("UnrealEngineLauncher")).unwrap();

        let result = parse_launcher_installed(&epic);
        assert!(result.is_err());
    }

    #[test]
    fn parse_launcher_installed_error_on_invalid_json() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);
        let dat_path = epic
            .join("UnrealEngineLauncher")
            .join("LauncherInstalled.dat");
        fs::write(dat_path, "NOT VALID JSON").unwrap();

        let result = parse_launcher_installed(&epic);
        assert!(result.is_err());
    }

    // -- Task 3: Manifest .item scanning --

    #[test]
    fn scan_manifest_items_finds_display_names() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        write_manifest_item(&epic, "Fortnite", "Fortnite");
        write_manifest_item(&epic, "CrabGame", "Crab Game");

        let names = scan_manifest_items(&epic).unwrap();
        assert_eq!(names.len(), 2);
        assert_eq!(names.get("Fortnite").unwrap(), "Fortnite");
        assert_eq!(names.get("CrabGame").unwrap(), "Crab Game");
    }

    #[test]
    fn scan_manifest_items_ignores_non_item_files() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        write_manifest_item(&epic, "Fortnite", "Fortnite");

        let manifests = epic
            .join("EpicGamesLauncher")
            .join("Data")
            .join("Manifests");
        fs::write(manifests.join("readme.txt"), "ignore me").unwrap();

        let names = scan_manifest_items(&epic).unwrap();
        assert_eq!(names.len(), 1);
    }

    #[test]
    fn scan_manifest_items_empty_when_no_manifests_dir() {
        let tmp = TempDir::new().unwrap();
        let epic = tmp.path().join("Epic");
        fs::create_dir_all(&epic).unwrap();

        let names = scan_manifest_items(&epic).unwrap();
        assert!(names.is_empty());
    }

    #[test]
    fn scan_manifest_items_skips_invalid_item() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        write_manifest_item(&epic, "GoodApp", "Good Game");

        let manifests = epic
            .join("EpicGamesLauncher")
            .join("Data")
            .join("Manifests");
        fs::write(manifests.join("bad.item"), "NOT JSON").unwrap();

        let names = scan_manifest_items(&epic).unwrap();
        assert_eq!(names.len(), 1);
        assert_eq!(names.get("GoodApp").unwrap(), "Good Game");
    }

    // -- Task 4: Cross-reference matching --

    #[test]
    fn scan_uses_display_name_from_manifest() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let install_dir = tmp.path().join("Games").join("Fortnite");
        fs::create_dir_all(&install_dir).unwrap();

        write_launcher_installed(
            &epic,
            &[("FortniteGame", &install_dir.to_string_lossy())],
        );
        write_manifest_item(&epic, "FortniteGame", "Fortnite");

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic));

        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].name, "Fortnite");
        assert_eq!(games[0].source_id, Some("FortniteGame".to_string()));
    }

    #[test]
    fn scan_falls_back_to_app_name_when_no_manifest() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let install_dir = tmp.path().join("Games").join("SomeGame");
        fs::create_dir_all(&install_dir).unwrap();

        write_launcher_installed(
            &epic,
            &[("SomeGameId", &install_dir.to_string_lossy())],
        );

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic));

        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].name, "SomeGameId");
    }

    // -- Task 5: DetectedGame assembly --

    #[test]
    fn scan_returns_detected_games_with_correct_fields() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let install_dir = tmp.path().join("Games").join("Fortnite");
        fs::create_dir_all(&install_dir).unwrap();

        write_launcher_installed(
            &epic,
            &[("FortniteGame", &install_dir.to_string_lossy())],
        );
        write_manifest_item(&epic, "FortniteGame", "Fortnite");

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic));

        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 1);

        let game = &games[0];
        assert_eq!(game.name, "Fortnite");
        assert_eq!(game.source, GameSourceType::Epic);
        assert_eq!(game.source_id, Some("FortniteGame".to_string()));
        assert!(game.source_hint.is_none());
        assert_eq!(game.folder_path, Some(install_dir));
        assert!(game.exe_path.is_none());
        assert!(game.exe_name.is_none());
        assert_eq!(
            game.launch_url,
            Some("com.epicgames.launcher://apps/FortniteGame?action=launch&silent=true".to_string())
        );
    }

    #[test]
    fn scan_skips_games_with_missing_install_dir() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let nonexistent = tmp.path().join("Games").join("Missing");

        write_launcher_installed(
            &epic,
            &[("MissingGame", &nonexistent.to_string_lossy())],
        );

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic));

        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scan_multiple_games() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let dir1 = tmp.path().join("Games").join("GameA");
        let dir2 = tmp.path().join("Games").join("GameB");
        fs::create_dir_all(&dir1).unwrap();
        fs::create_dir_all(&dir2).unwrap();

        write_launcher_installed(
            &epic,
            &[
                ("AppA", &dir1.to_string_lossy()),
                ("AppB", &dir2.to_string_lossy()),
            ],
        );
        write_manifest_item(&epic, "AppA", "Game Alpha");
        write_manifest_item(&epic, "AppB", "Game Beta");

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic));

        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 2);

        let names: Vec<&str> = games.iter().map(|g| g.name.as_str()).collect();
        assert!(names.contains(&"Game Alpha"));
        assert!(names.contains(&"Game Beta"));

        for game in &games {
            assert_eq!(game.source, GameSourceType::Epic);
            assert!(game.source_id.is_some());
            assert!(game.launch_url.is_some());
            assert!(game.folder_path.is_some());
        }
    }

    // -- Task 6: Availability check --

    #[test]
    fn is_available_true_when_launcher_installed_dat_exists() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let dat_path = epic
            .join("UnrealEngineLauncher")
            .join("LauncherInstalled.dat");
        fs::write(dat_path, r#"{"InstallationList":[]}"#).unwrap();

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic));
        assert!(scanner.is_available());
    }

    #[test]
    fn is_available_false_when_no_launcher_installed_dat() {
        let tmp = TempDir::new().unwrap();
        let epic = tmp.path().join("Epic");
        fs::create_dir_all(epic.join("UnrealEngineLauncher")).unwrap();

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic));
        assert!(!scanner.is_available());
    }

    #[test]
    fn is_available_false_when_no_resolved_path() {
        let scanner = EpicScanner::new();
        assert!(!scanner.is_available());
    }

    // -- GameSource trait --

    #[test]
    fn trait_id_and_display_name() {
        let scanner = EpicScanner::new();
        assert_eq!(scanner.id(), "epic");
        assert_eq!(scanner.display_name(), "Epic Games Store");
    }

    #[test]
    fn trait_path_override_round_trip() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let mut scanner = EpicScanner::new();
        assert!(scanner.resolved_path().is_none());

        scanner.set_path_override(Some(epic.clone()));
        assert_eq!(scanner.resolved_path(), Some(epic));

        scanner.set_path_override(None);
    }

    #[test]
    fn scan_returns_error_when_unavailable() {
        let scanner = EpicScanner::new();
        let result = scanner.scan();
        assert!(result.is_err());
    }

    // -- Full pipeline --

    #[test]
    fn full_pipeline_end_to_end() {
        let tmp = TempDir::new().unwrap();
        let epic = create_epic_dir(&tmp);

        let dir1 = tmp.path().join("Games").join("Fortnite");
        let dir2 = tmp.path().join("Games").join("RocketLeague");
        fs::create_dir_all(&dir1).unwrap();
        fs::create_dir_all(&dir2).unwrap();

        write_launcher_installed(
            &epic,
            &[
                ("FortniteGame", &dir1.to_string_lossy()),
                ("RocketLeagueId", &dir2.to_string_lossy()),
                ("MissingGame", "C:\\nonexistent_xyz_12345"),
            ],
        );
        write_manifest_item(&epic, "FortniteGame", "Fortnite");
        write_manifest_item(&epic, "RocketLeagueId", "Rocket League");

        let dat_path = epic
            .join("UnrealEngineLauncher")
            .join("LauncherInstalled.dat");
        assert!(dat_path.is_file());

        let mut scanner = EpicScanner::new();
        scanner.set_path_override(Some(epic));

        assert!(scanner.is_available());

        let games = scanner.detect_games().unwrap();
        assert_eq!(games.len(), 2);

        for game in &games {
            assert_eq!(game.source, GameSourceType::Epic);
            assert!(game.source_id.is_some());
            assert!(game.launch_url.is_some());
            assert!(game.folder_path.is_some());

            let launch_url = game.launch_url.as_ref().unwrap();
            let app_name = game.source_id.as_ref().unwrap();
            assert_eq!(
                launch_url,
                &format!(
                    "com.epicgames.launcher://apps/{app_name}?action=launch&silent=true"
                )
            );
        }

        let fortnite = games.iter().find(|g| g.name == "Fortnite").unwrap();
        assert_eq!(fortnite.source_id, Some("FortniteGame".to_string()));

        let rl = games.iter().find(|g| g.name == "Rocket League").unwrap();
        assert_eq!(rl.source_id, Some("RocketLeagueId".to_string()));
    }
}
