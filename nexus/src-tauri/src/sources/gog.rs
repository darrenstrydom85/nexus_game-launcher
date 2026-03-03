use std::path::PathBuf;

use crate::models::game::GameSource as GameSourceType;

use super::{resolve_path, DetectedGame, GameSource, SourceError};

// ---------------------------------------------------------------------------
// Task 1 & 2: Registry enumeration + read game data
// ---------------------------------------------------------------------------

pub struct GogScanner {
    path_override: Option<PathBuf>,
    resolved: Option<PathBuf>,
}

impl GogScanner {
    pub fn new() -> Self {
        Self {
            path_override: None,
            resolved: None,
        }
    }

    fn resolve(&mut self) {
        let (path, _method) = resolve_path(
            &self.path_override,
            detect_gog_from_registry,
            &self.default_paths(),
        );
        self.resolved = path;
    }
}

struct GogGame {
    game_id: String,
    game_name: String,
    exe_path: PathBuf,
    folder_path: PathBuf,
}

/// Attempt to read the GOG Galaxy client path from the Windows registry.
///
/// Checks `HKLM\SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths` → `client`.
#[cfg(target_os = "windows")]
fn detect_gog_from_registry() -> Option<PathBuf> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths") {
        if let Ok(client_path) = key.get_value::<String, _>("client") {
            let path = PathBuf::from(&client_path);
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn detect_gog_from_registry() -> Option<PathBuf> {
    None
}

/// Enumerate all GOG game subkeys from the registry and extract game data.
///
/// Registry path: `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\{gameID}`
/// Values read: `gameName`, `path`, `exe`, `gameID`
#[cfg(target_os = "windows")]
fn enumerate_gog_games() -> Result<Vec<GogGame>, SourceError> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let games_key = hklm
        .open_subkey(r"SOFTWARE\WOW6432Node\GOG.com\Games")
        .map_err(|e| {
            SourceError::Unavailable(format!("GOG Games registry key not found: {e}"))
        })?;

    let mut games = Vec::new();

    for subkey_name in games_key.enum_keys().flatten() {
        match read_gog_game_subkey(&games_key, &subkey_name) {
            Ok(Some(game)) => games.push(game),
            Ok(None) => {
                log::debug!("skipped GOG subkey with missing fields: {subkey_name}");
            }
            Err(e) => {
                log::warn!("failed to read GOG subkey {subkey_name}: {e}");
            }
        }
    }

    Ok(games)
}

#[cfg(not(target_os = "windows"))]
fn enumerate_gog_games() -> Result<Vec<GogGame>, SourceError> {
    Ok(Vec::new())
}

/// Read a single GOG game subkey and extract gameName, path, exe, gameID.
#[cfg(target_os = "windows")]
fn read_gog_game_subkey(
    parent: &winreg::RegKey,
    subkey_name: &str,
) -> Result<Option<GogGame>, SourceError> {
    let key = parent.open_subkey(subkey_name)?;

    let game_id: String = match key.get_value("gameID") {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };

    let game_name: String = match key.get_value("gameName") {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };

    let path_str: String = match key.get_value("path") {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };

    let exe_str: String = match key.get_value("exe") {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };

    let folder_path = PathBuf::from(&path_str);
    let exe_path = PathBuf::from(&exe_str);

    Ok(Some(GogGame {
        game_id,
        game_name,
        exe_path,
        folder_path,
    }))
}

// ---------------------------------------------------------------------------
// Task 3: Detect GOG Galaxy installation for launch_url
// ---------------------------------------------------------------------------

/// Check if GOG Galaxy client is installed by looking for its registry key.
#[cfg(target_os = "windows")]
fn is_galaxy_installed() -> bool {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    hklm.open_subkey(r"SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths")
        .and_then(|key| key.get_value::<String, _>("client"))
        .is_ok()
}

#[cfg(not(target_os = "windows"))]
fn is_galaxy_installed() -> bool {
    false
}

/// Build the launch URL for a GOG game.
///
/// If Galaxy is installed: `goggalaxy://openGameView/{gameID}`
/// Otherwise: `None` (launch via exe directly)
fn build_launch_url(game_id: &str, galaxy_installed: bool) -> Option<String> {
    if galaxy_installed {
        Some(format!("goggalaxy://openGameView/{game_id}"))
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Task 4: Assemble DetectedGame + Task 5: Availability check
// ---------------------------------------------------------------------------

impl GogScanner {
    pub fn scan(&self) -> Result<Vec<DetectedGame>, SourceError> {
        let gog_games = enumerate_gog_games()?;
        let galaxy_installed = is_galaxy_installed();

        let mut games = Vec::new();

        for gog in &gog_games {
            if !gog.folder_path.is_dir() {
                log::debug!(
                    "skipping GOG game {} ({}): folder path does not exist: {}",
                    gog.game_id,
                    gog.game_name,
                    gog.folder_path.display()
                );
                continue;
            }

            games.push(DetectedGame {
                name: gog.game_name.clone(),
                source: GameSourceType::Gog,
                source_id: Some(gog.game_id.clone()),
                source_hint: None,
                folder_path: Some(gog.folder_path.clone()),
                exe_path: Some(gog.exe_path.clone()),
                exe_name: gog
                    .exe_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string()),
                launch_url: build_launch_url(&gog.game_id, galaxy_installed),
                potential_exe_names: None,
            });
        }

        Ok(games)
    }
}

/// Check if the GOG Games registry key exists and has at least one subkey.
#[cfg(target_os = "windows")]
fn gog_registry_has_games() -> bool {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    match hklm.open_subkey(r"SOFTWARE\WOW6432Node\GOG.com\Games") {
        Ok(key) => key.enum_keys().next().is_some(),
        Err(_) => false,
    }
}

#[cfg(not(target_os = "windows"))]
fn gog_registry_has_games() -> bool {
    false
}

impl GameSource for GogScanner {
    fn id(&self) -> &str {
        "gog"
    }

    fn display_name(&self) -> &str {
        "GOG"
    }

    fn is_available(&self) -> bool {
        gog_registry_has_games()
    }

    fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError> {
        self.scan()
    }

    fn default_paths(&self) -> Vec<PathBuf> {
        vec![PathBuf::from(r"C:\Program Files (x86)\GOG Galaxy")]
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

    // -- build_launch_url --

    #[test]
    fn launch_url_with_galaxy_installed() {
        let url = build_launch_url("1207658691", true);
        assert_eq!(
            url,
            Some("goggalaxy://openGameView/1207658691".to_string())
        );
    }

    #[test]
    fn launch_url_without_galaxy() {
        let url = build_launch_url("1207658691", false);
        assert!(url.is_none());
    }

    #[test]
    fn launch_url_format_varies_by_game_id() {
        let url1 = build_launch_url("111", true).unwrap();
        let url2 = build_launch_url("222", true).unwrap();
        assert_ne!(url1, url2);
        assert!(url1.ends_with("/111"));
        assert!(url2.ends_with("/222"));
    }

    // -- GogGame → DetectedGame assembly --

    fn make_gog_game(game_id: &str, name: &str, folder: &str, exe: &str) -> GogGame {
        GogGame {
            game_id: game_id.to_string(),
            game_name: name.to_string(),
            folder_path: PathBuf::from(folder),
            exe_path: PathBuf::from(exe),
        }
    }

    #[test]
    fn detected_game_has_correct_source_type() {
        let tmp = tempfile::TempDir::new().unwrap();
        let folder = tmp.path().join("TheWitcher3");
        std::fs::create_dir_all(&folder).unwrap();
        let exe = folder.join("witcher3.exe");
        std::fs::write(&exe, "fake").unwrap();

        let gog = GogGame {
            game_id: "1207658691".to_string(),
            game_name: "The Witcher 3".to_string(),
            folder_path: folder.clone(),
            exe_path: exe.clone(),
        };

        let galaxy_installed = true;

        let detected = DetectedGame {
            name: gog.game_name.clone(),
            source: GameSourceType::Gog,
            source_id: Some(gog.game_id.clone()),
            source_hint: None,
            folder_path: Some(gog.folder_path.clone()),
            exe_path: Some(gog.exe_path.clone()),
            exe_name: gog
                .exe_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string()),
            launch_url: build_launch_url(&gog.game_id, galaxy_installed),
            potential_exe_names: None,
        };

        assert_eq!(detected.source, GameSourceType::Gog);
        assert_eq!(detected.source_id, Some("1207658691".to_string()));
        assert_eq!(detected.name, "The Witcher 3");
        assert_eq!(detected.exe_path, Some(exe));
        assert_eq!(detected.exe_name, Some("witcher3.exe".to_string()));
        assert_eq!(detected.folder_path, Some(folder));
        assert_eq!(
            detected.launch_url,
            Some("goggalaxy://openGameView/1207658691".to_string())
        );
    }

    #[test]
    fn detected_game_without_galaxy_has_no_launch_url() {
        let tmp = tempfile::TempDir::new().unwrap();
        let folder = tmp.path().join("Game");
        std::fs::create_dir_all(&folder).unwrap();

        let gog = make_gog_game(
            "12345",
            "Test Game",
            &folder.to_string_lossy(),
            &folder.join("game.exe").to_string_lossy(),
        );

        let detected = DetectedGame {
            name: gog.game_name.clone(),
            source: GameSourceType::Gog,
            source_id: Some(gog.game_id.clone()),
            source_hint: None,
            folder_path: Some(gog.folder_path.clone()),
            exe_path: Some(gog.exe_path.clone()),
            exe_name: gog
                .exe_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string()),
            launch_url: build_launch_url(&gog.game_id, false),
            potential_exe_names: None,
        };

        assert!(detected.launch_url.is_none());
        assert_eq!(detected.source_id, Some("12345".to_string()));
    }

    // -- GameSource trait --

    #[test]
    fn trait_id_and_display_name() {
        let scanner = GogScanner::new();
        assert_eq!(scanner.id(), "gog");
        assert_eq!(scanner.display_name(), "GOG");
    }

    #[test]
    fn scanner_default_paths_contains_gog_galaxy() {
        let scanner = GogScanner::new();
        let defaults = scanner.default_paths();
        assert_eq!(defaults.len(), 1);
        assert!(defaults[0].to_string_lossy().contains("GOG Galaxy"));
    }

    #[test]
    fn scanner_no_path_resolved_when_nothing_exists() {
        let scanner = GogScanner::new();
        assert!(scanner.resolved_path().is_none());
    }

    #[test]
    fn scanner_uses_override_path() {
        let tmp = tempfile::TempDir::new().unwrap();
        let gog_dir = tmp.path().join("GOG Galaxy");
        std::fs::create_dir_all(&gog_dir).unwrap();

        let mut scanner = GogScanner::new();
        scanner.set_path_override(Some(gog_dir.clone()));
        assert_eq!(scanner.resolved_path(), Some(gog_dir));
    }

    #[test]
    fn trait_path_override_round_trip() {
        let tmp = tempfile::TempDir::new().unwrap();
        let gog_dir = tmp.path().join("GOG Galaxy");
        std::fs::create_dir_all(&gog_dir).unwrap();

        let mut scanner = GogScanner::new();
        assert!(scanner.resolved_path().is_none());

        scanner.set_path_override(Some(gog_dir.clone()));
        assert_eq!(scanner.resolved_path(), Some(gog_dir));

        scanner.set_path_override(None);
    }

    // -- Serialization --

    #[test]
    fn detected_game_serializes_correctly() {
        let game = DetectedGame {
            name: "The Witcher 3".into(),
            source: GameSourceType::Gog,
            source_id: Some("1207658691".into()),
            source_hint: None,
            folder_path: Some(PathBuf::from(r"C:\GOG Games\The Witcher 3")),
            exe_path: Some(PathBuf::from(r"C:\GOG Games\The Witcher 3\witcher3.exe")),
            exe_name: Some("witcher3.exe".into()),
            launch_url: Some("goggalaxy://openGameView/1207658691".into()),
            potential_exe_names: None,
        };
        let json = serde_json::to_string(&game).unwrap();
        assert!(json.contains("\"sourceId\""));
        assert!(json.contains("1207658691"));
        assert!(json.contains("\"exePath\""));
        assert!(json.contains("\"exeName\""));
        assert!(json.contains("witcher3.exe"));
        assert!(json.contains("goggalaxy://openGameView/1207658691"));
    }

    // -- Non-Windows: enumerate returns empty --

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn enumerate_returns_empty_on_non_windows() {
        let games = enumerate_gog_games().unwrap();
        assert!(games.is_empty());
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn is_available_false_on_non_windows() {
        let scanner = GogScanner::new();
        assert!(!scanner.is_available());
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn detect_gog_from_registry_none_on_non_windows() {
        assert!(detect_gog_from_registry().is_none());
    }
}
