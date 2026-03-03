use std::path::{Path, PathBuf};

use crate::models::game::GameSource as GameSourceType;

use super::{resolve_path, DetectedGame, GameSource, SourceError};

// ---------------------------------------------------------------------------
// Task 1: Path resolution + registry scanning for installed games
// ---------------------------------------------------------------------------

pub struct UbisoftScanner {
    path_override: Option<PathBuf>,
    resolved: Option<PathBuf>,
}

impl UbisoftScanner {
    pub fn new() -> Self {
        Self {
            path_override: None,
            resolved: None,
        }
    }

    fn resolve(&mut self) {
        let (path, _method) = resolve_path(
            &self.path_override,
            detect_ubisoft_from_registry,
            &self.default_paths(),
        );
        self.resolved = path;
    }
}

/// Read the Ubisoft Connect install path from the Windows registry.
///
/// Checks `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher` → `InstallDir`.
#[cfg(target_os = "windows")]
fn detect_ubisoft_from_registry() -> Option<PathBuf> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Ubisoft\Launcher") {
        if let Ok(install_dir) = key.get_value::<String, _>("InstallDir") {
            let path = PathBuf::from(&install_dir);
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn detect_ubisoft_from_registry() -> Option<PathBuf> {
    None
}

struct UbisoftGame {
    game_id: String,
    install_dir: PathBuf,
}

/// Enumerate installed Ubisoft games from the registry.
///
/// Scans `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\` subkeys.
/// Each subkey name is a numeric game ID; the `InstallDir` value gives the path.
#[cfg(target_os = "windows")]
fn enumerate_ubisoft_installs() -> Result<Vec<UbisoftGame>, SourceError> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let installs_key = hklm
        .open_subkey(r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs")
        .map_err(|e| {
            SourceError::Unavailable(format!("Ubisoft Installs registry key not found: {e}"))
        })?;

    let mut games = Vec::new();

    for subkey_name in installs_key.enum_keys().flatten() {
        if let Ok(subkey) = installs_key.open_subkey(&subkey_name) {
            if let Ok(install_dir) = subkey.get_value::<String, _>("InstallDir") {
                let path = PathBuf::from(&install_dir);
                games.push(UbisoftGame {
                    game_id: subkey_name,
                    install_dir: path,
                });
            } else {
                log::debug!("Ubisoft subkey {subkey_name}: no InstallDir value");
            }
        }
    }

    Ok(games)
}

#[cfg(not(target_os = "windows"))]
fn enumerate_ubisoft_installs() -> Result<Vec<UbisoftGame>, SourceError> {
    Ok(Vec::new())
}

// ---------------------------------------------------------------------------
// Task 2: Name resolution — uninstall registry lookup + folder name fallback
// ---------------------------------------------------------------------------

/// Resolve a display name for a Ubisoft game ID.
///
/// Strategy 1: Check uninstall registry for `Uplay Install {id}` → `DisplayName`.
/// Strategy 2: Use the install folder's directory name as a fallback.
#[cfg(target_os = "windows")]
fn resolve_game_name(game_id: &str, install_dir: &Path) -> String {
    if let Some(name) = lookup_ubisoft_uninstall_name(game_id) {
        return name;
    }

    folder_name_fallback(install_dir, game_id)
}

#[cfg(not(target_os = "windows"))]
fn resolve_game_name(_game_id: &str, install_dir: &Path) -> String {
    folder_name_fallback(install_dir, _game_id)
}

/// Look up the display name from the Windows uninstall registry.
///
/// Checks `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Uplay Install {id}`.
#[cfg(target_os = "windows")]
fn lookup_ubisoft_uninstall_name(game_id: &str) -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let uninstall_key = format!(
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Uplay Install {game_id}"
    );

    if let Ok(key) = hklm.open_subkey(&uninstall_key) {
        if let Ok(display_name) = key.get_value::<String, _>("DisplayName") {
            if !display_name.is_empty() {
                return Some(display_name);
            }
        }
    }

    None
}

fn folder_name_fallback(install_dir: &Path, game_id: &str) -> String {
    install_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("Ubisoft Game {game_id}"))
}

// ---------------------------------------------------------------------------
// Task 6 (Ubisoft part): Assemble DetectedGame
// ---------------------------------------------------------------------------

impl UbisoftScanner {
    pub fn scan(&self) -> Result<Vec<DetectedGame>, SourceError> {
        let ubisoft_games = enumerate_ubisoft_installs()?;

        let mut games = Vec::new();

        for ubi in &ubisoft_games {
            if !ubi.install_dir.is_dir() {
                log::debug!(
                    "skipping Ubisoft game {}: install dir does not exist: {}",
                    ubi.game_id,
                    ubi.install_dir.display()
                );
                continue;
            }

            let name = resolve_game_name(&ubi.game_id, &ubi.install_dir);

            games.push(DetectedGame {
                name,
                source: GameSourceType::Ubisoft,
                source_id: Some(ubi.game_id.clone()),
                source_hint: None,
                folder_path: Some(ubi.install_dir.clone()),
                exe_path: None,
                exe_name: None,
                launch_url: Some(format!("uplay://launch/{}/0", ubi.game_id)),
                potential_exe_names: None,
            });
        }

        Ok(games)
    }
}

// ---------------------------------------------------------------------------
// Task 7 (Ubisoft part): Availability check + GameSource trait
// ---------------------------------------------------------------------------

/// Check if the Ubisoft Installs registry key exists.
#[cfg(target_os = "windows")]
fn ubisoft_registry_exists() -> bool {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    hklm.open_subkey(r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs")
        .is_ok()
}

#[cfg(not(target_os = "windows"))]
fn ubisoft_registry_exists() -> bool {
    false
}

/// Check if UbisoftConnect.exe exists at the resolved path.
fn ubisoft_exe_exists(resolved: &Option<PathBuf>) -> bool {
    match resolved {
        Some(p) => p.join("UbisoftConnect.exe").is_file(),
        None => false,
    }
}

impl GameSource for UbisoftScanner {
    fn id(&self) -> &str {
        "ubisoft"
    }

    fn display_name(&self) -> &str {
        "Ubisoft Connect"
    }

    fn is_available(&self) -> bool {
        ubisoft_exe_exists(&self.resolved) || ubisoft_registry_exists()
    }

    fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError> {
        self.scan()
    }

    fn default_paths(&self) -> Vec<PathBuf> {
        vec![PathBuf::from(
            r"C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher",
        )]
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

    // -- folder_name_fallback --

    #[test]
    fn folder_name_fallback_uses_dir_name() {
        let path = PathBuf::from(r"C:\Games\Assassins Creed Valhalla");
        let name = folder_name_fallback(&path, "123");
        assert_eq!(name, "Assassins Creed Valhalla");
    }

    #[test]
    fn folder_name_fallback_uses_game_id_when_no_dir_name() {
        let path = PathBuf::from(r"C:\");
        let name = folder_name_fallback(&path, "456");
        assert_eq!(name, "Ubisoft Game 456");
    }

    // -- launch_url format --

    #[test]
    fn launch_url_format() {
        let url = format!("uplay://launch/{}/0", "4567");
        assert_eq!(url, "uplay://launch/4567/0");
    }

    // -- DetectedGame assembly --

    #[test]
    fn detected_game_has_correct_fields() {
        let tmp = TempDir::new().unwrap();
        let install_dir = tmp.path().join("Far Cry 6");
        fs::create_dir_all(&install_dir).unwrap();

        let game = DetectedGame {
            name: "Far Cry 6".into(),
            source: GameSourceType::Ubisoft,
            source_id: Some("5436".into()),
            source_hint: None,
            folder_path: Some(install_dir.clone()),
            exe_path: None,
            exe_name: None,
            launch_url: Some("uplay://launch/5436/0".into()),
            potential_exe_names: None,
        };

        assert_eq!(game.source, GameSourceType::Ubisoft);
        assert_eq!(game.source_id, Some("5436".to_string()));
        assert_eq!(game.name, "Far Cry 6");
        assert_eq!(game.launch_url, Some("uplay://launch/5436/0".to_string()));
        assert_eq!(game.folder_path, Some(install_dir));
        assert!(game.exe_path.is_none());
    }

    // -- GameSource trait --

    #[test]
    fn trait_id_and_display_name() {
        let scanner = UbisoftScanner::new();
        assert_eq!(scanner.id(), "ubisoft");
        assert_eq!(scanner.display_name(), "Ubisoft Connect");
    }

    #[test]
    fn scanner_default_paths() {
        let scanner = UbisoftScanner::new();
        let defaults = scanner.default_paths();
        assert_eq!(defaults.len(), 1);
        assert!(defaults[0].to_string_lossy().contains("Ubisoft"));
    }

    #[test]
    fn scanner_no_path_resolved_when_nothing_exists() {
        let scanner = UbisoftScanner::new();
        assert!(scanner.resolved_path().is_none());
    }

    #[test]
    fn scanner_uses_override_path() {
        let tmp = TempDir::new().unwrap();
        let ubi_dir = tmp.path().join("Ubisoft");
        fs::create_dir_all(&ubi_dir).unwrap();

        let mut scanner = UbisoftScanner::new();
        scanner.set_path_override(Some(ubi_dir.clone()));
        assert_eq!(scanner.resolved_path(), Some(ubi_dir));
    }

    #[test]
    fn trait_path_override_round_trip() {
        let tmp = TempDir::new().unwrap();
        let ubi_dir = tmp.path().join("Ubisoft");
        fs::create_dir_all(&ubi_dir).unwrap();

        let mut scanner = UbisoftScanner::new();
        assert!(scanner.resolved_path().is_none());

        scanner.set_path_override(Some(ubi_dir.clone()));
        assert_eq!(scanner.resolved_path(), Some(ubi_dir));

        scanner.set_path_override(None);
    }

    // -- Availability --

    #[test]
    fn ubisoft_exe_exists_true_when_exe_present() {
        let tmp = TempDir::new().unwrap();
        let ubi_dir = tmp.path().join("Ubisoft");
        fs::create_dir_all(&ubi_dir).unwrap();
        fs::write(ubi_dir.join("UbisoftConnect.exe"), "fake").unwrap();

        assert!(ubisoft_exe_exists(&Some(ubi_dir)));
    }

    #[test]
    fn ubisoft_exe_exists_false_when_no_exe() {
        let tmp = TempDir::new().unwrap();
        let ubi_dir = tmp.path().join("Ubisoft");
        fs::create_dir_all(&ubi_dir).unwrap();

        assert!(!ubisoft_exe_exists(&Some(ubi_dir)));
    }

    #[test]
    fn ubisoft_exe_exists_false_when_none() {
        assert!(!ubisoft_exe_exists(&None));
    }

    // -- Serialization --

    #[test]
    fn detected_game_serializes_correctly() {
        let game = DetectedGame {
            name: "Assassin's Creed".into(),
            source: GameSourceType::Ubisoft,
            source_id: Some("1234".into()),
            source_hint: None,
            folder_path: Some(PathBuf::from(r"C:\Games\AC")),
            exe_path: None,
            exe_name: None,
            launch_url: Some("uplay://launch/1234/0".into()),
            potential_exe_names: None,
        };
        let json = serde_json::to_string(&game).unwrap();
        assert!(json.contains("\"sourceId\""));
        assert!(json.contains("1234"));
        assert!(json.contains("uplay://launch/1234/0"));
    }

    // -- Non-Windows stubs --

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn enumerate_returns_empty_on_non_windows() {
        let games = enumerate_ubisoft_installs().unwrap();
        assert!(games.is_empty());
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn detect_from_registry_none_on_non_windows() {
        assert!(detect_ubisoft_from_registry().is_none());
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn registry_exists_false_on_non_windows() {
        assert!(!ubisoft_registry_exists());
    }
}
