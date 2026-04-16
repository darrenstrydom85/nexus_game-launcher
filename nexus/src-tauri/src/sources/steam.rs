use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::models::game::GameSource as GameSourceType;

use super::{resolve_path, DetectedGame, GameSource, SourceError};

// ---------------------------------------------------------------------------
// Task 1: Path resolution — override → registry → default
// ---------------------------------------------------------------------------

pub struct SteamScanner {
    path_override: Option<PathBuf>,
    resolved: Option<PathBuf>,
}

impl SteamScanner {
    pub fn new() -> Self {
        Self {
            path_override: None,
            resolved: None,
        }
    }

    /// Re-resolve the Steam install path using the priority chain.
    fn resolve(&mut self) {
        let (path, _method) = resolve_path(
            &self.path_override,
            detect_steam_from_registry,
            &self.default_paths(),
        );
        self.resolved = path;
    }
}

/// Attempt to read the Steam install path from the Windows registry.
///
/// Checks two locations in order:
/// 1. `HKLM\SOFTWARE\WOW6432Node\Valve\Steam` → `InstallPath`
/// 2. `HKLM\SOFTWARE\Valve\Steam` → `InstallPath`
#[cfg(target_os = "windows")]
fn detect_steam_from_registry() -> Option<PathBuf> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    let registry_paths = [
        r"SOFTWARE\WOW6432Node\Valve\Steam",
        r"SOFTWARE\Valve\Steam",
    ];

    for reg_path in &registry_paths {
        if let Ok(key) = hklm.open_subkey(reg_path) {
            if let Ok(install_path) = key.get_value::<String, _>("InstallPath") {
                let path = PathBuf::from(&install_path);
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn detect_steam_from_registry() -> Option<PathBuf> {
    None
}

// ---------------------------------------------------------------------------
// Task 2: VDF / ACF parser (custom, lightweight)
// ---------------------------------------------------------------------------

/// A minimal Valve Data Format (VDF) / ACF parser.
///
/// VDF is a nested key-value format used by Steam for configuration files.
/// Structure: `"key" "value"` for string pairs, `"key" { ... }` for sections.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum VdfValue {
    String(String),
    Section(HashMap<String, VdfValue>),
}

impl VdfValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            VdfValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_section(&self) -> Option<&HashMap<String, VdfValue>> {
        match self {
            VdfValue::Section(map) => Some(map),
            _ => None,
        }
    }

    pub fn get(&self, key: &str) -> Option<&VdfValue> {
        self.as_section()?.get(key)
    }

    #[allow(dead_code)]
    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key)?.as_str()
    }
}

/// Parse a VDF/ACF text into a root `VdfValue::Section`.
pub(crate) fn parse_vdf(input: &str) -> Result<VdfValue, SourceError> {
    let tokens = tokenize_vdf(input)?;
    let mut pos = 0;
    let (root_key, root_val) = parse_pair(&tokens, &mut pos)?;

    let mut root = HashMap::new();
    root.insert(root_key, root_val);
    Ok(VdfValue::Section(root))
}

/// Tokenize VDF text into a flat list of tokens (quoted strings and braces).
fn tokenize_vdf(input: &str) -> Result<Vec<String>, SourceError> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = input.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        let ch = chars[i];

        if ch == '/' && i + 1 < len && chars[i + 1] == '/' {
            while i < len && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }

        if ch.is_whitespace() {
            i += 1;
            continue;
        }

        if ch == '{' || ch == '}' {
            tokens.push(ch.to_string());
            i += 1;
            continue;
        }

        if ch == '"' {
            i += 1;
            let mut s = String::new();
            while i < len && chars[i] != '"' {
                if chars[i] == '\\' && i + 1 < len {
                    i += 1;
                    match chars[i] {
                        'n' => s.push('\n'),
                        't' => s.push('\t'),
                        '\\' => s.push('\\'),
                        '"' => s.push('"'),
                        other => {
                            s.push('\\');
                            s.push(other);
                        }
                    }
                } else {
                    s.push(chars[i]);
                }
                i += 1;
            }
            if i < len {
                i += 1; // skip closing quote
            }
            tokens.push(s);
            continue;
        }

        // Unquoted token (some ACF files have unquoted values)
        let mut s = String::new();
        while i < len && !chars[i].is_whitespace() && chars[i] != '{' && chars[i] != '}' && chars[i] != '"' {
            s.push(chars[i]);
            i += 1;
        }
        if !s.is_empty() {
            tokens.push(s);
        }
    }

    Ok(tokens)
}

/// Parse a key-value pair from the token stream.
fn parse_pair(tokens: &[String], pos: &mut usize) -> Result<(String, VdfValue), SourceError> {
    if *pos >= tokens.len() {
        return Err(SourceError::Parse("unexpected end of VDF input".into()));
    }

    let key = tokens[*pos].clone();
    *pos += 1;

    if *pos >= tokens.len() {
        return Err(SourceError::Parse(format!("expected value after key '{key}'")));
    }

    if tokens[*pos] == "{" {
        *pos += 1; // skip '{'
        let mut map = HashMap::new();
        while *pos < tokens.len() && tokens[*pos] != "}" {
            let (k, v) = parse_pair(tokens, pos)?;
            map.insert(k, v);
        }
        if *pos < tokens.len() {
            *pos += 1; // skip '}'
        }
        Ok((key, VdfValue::Section(map)))
    } else {
        let value = tokens[*pos].clone();
        *pos += 1;
        Ok((key, VdfValue::String(value)))
    }
}

// ---------------------------------------------------------------------------
// Task 3: Library folder discovery from libraryfolders.vdf
// ---------------------------------------------------------------------------

/// Parse `libraryfolders.vdf` and return the list of library folder paths.
fn discover_library_folders(steam_path: &Path) -> Result<Vec<PathBuf>, SourceError> {
    let vdf_path = steam_path.join("steamapps").join("libraryfolders.vdf");
    let content = std::fs::read_to_string(&vdf_path).map_err(|e| {
        SourceError::Parse(format!(
            "failed to read libraryfolders.vdf at {}: {e}",
            vdf_path.display()
        ))
    })?;

    let root = parse_vdf(&content)?;
    let library_folders = root
        .get("libraryfolders")
        .and_then(|v| v.as_section())
        .ok_or_else(|| SourceError::Parse("missing 'libraryfolders' section in VDF".into()))?;

    let mut paths = Vec::new();
    for (_key, entry) in library_folders {
        if let Some(section) = entry.as_section() {
            if let Some(path_str) = section.get("path").and_then(|v| v.as_str()) {
                let path = PathBuf::from(path_str);
                if path.is_dir() {
                    paths.push(path);
                }
            }
        }
    }

    Ok(paths)
}

// ---------------------------------------------------------------------------
// Task 4: ACF manifest parsing (appid, name, installdir)
// ---------------------------------------------------------------------------

struct SteamApp {
    appid: String,
    name: String,
    install_dir: String,
}

/// Enumerate and parse all `appmanifest_*.acf` files in a library's steamapps folder.
fn parse_manifests_in_library(library_path: &Path) -> Result<Vec<SteamApp>, SourceError> {
    let steamapps = library_path.join("steamapps");
    if !steamapps.is_dir() {
        return Ok(Vec::new());
    }

    let mut apps = Vec::new();
    let entries = std::fs::read_dir(&steamapps)?;

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = match path.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };

        if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
            continue;
        }

        match parse_acf_manifest(&path) {
            Ok(Some(app)) => apps.push(app),
            Ok(None) => {
                log::debug!("skipped manifest with missing fields: {}", path.display());
            }
            Err(e) => {
                log::warn!("failed to parse {}: {e}", path.display());
            }
        }
    }

    Ok(apps)
}

/// Parse a single ACF manifest file and extract appid, name, installdir.
fn parse_acf_manifest(path: &Path) -> Result<Option<SteamApp>, SourceError> {
    let content = std::fs::read_to_string(path)?;
    let root = parse_vdf(&content)?;

    let app_state = match root.get("AppState").and_then(|v| v.as_section()) {
        Some(s) => s,
        None => return Ok(None),
    };

    let appid = match app_state.get("appid").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return Ok(None),
    };

    let name = match app_state.get("name").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return Ok(None),
    };

    let install_dir = match app_state.get("installdir").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return Ok(None),
    };

    Ok(Some(SteamApp {
        appid,
        name,
        install_dir,
    }))
}

// ---------------------------------------------------------------------------
// Task 5 & 6: Validate paths + Assemble DetectedGame
// ---------------------------------------------------------------------------

impl SteamScanner {
    /// Full scan: resolve path → discover libraries → parse manifests → validate → assemble.
    pub fn scan(&self) -> Result<Vec<DetectedGame>, SourceError> {
        let steam_path = match &self.resolved {
            Some(p) => p.clone(),
            None => {
                return Err(SourceError::Unavailable(
                    "Steam installation not found".into(),
                ))
            }
        };

        let libraries = discover_library_folders(&steam_path)?;
        let mut games = Vec::new();

        for library in &libraries {
            let apps = parse_manifests_in_library(library)?;
            for app in apps {
                let install_path = library
                    .join("steamapps")
                    .join("common")
                    .join(&app.install_dir);

                // Task 5: validate install path exists
                if !install_path.is_dir() {
                    log::debug!(
                        "skipping Steam app {} ({}): install path does not exist: {}",
                        app.appid,
                        app.name,
                        install_path.display()
                    );
                    continue;
                }

                // Task 6: assemble DetectedGame
                games.push(DetectedGame {
                    name: app.name,
                    source: GameSourceType::Steam,
                    source_id: Some(app.appid.clone()),
                    source_hint: None,
                    folder_path: Some(install_path),
                    exe_path: None,
                    exe_name: None,
                    launch_url: Some(format!("steam://rungameid/{}", app.appid)),
                    potential_exe_names: None,
                });
            }
        }

        Ok(games)
    }
}

// ---------------------------------------------------------------------------
// Task 7: Availability check
// ---------------------------------------------------------------------------

impl GameSource for SteamScanner {
    fn id(&self) -> &str {
        "steam"
    }

    fn display_name(&self) -> &str {
        "Steam"
    }

    /// Steam is available if the resolved path contains `steam.exe` and
    /// `steamapps\libraryfolders.vdf`.
    fn is_available(&self) -> bool {
        match &self.resolved {
            Some(p) => {
                p.join("steam.exe").is_file()
                    && p.join("steamapps")
                        .join("libraryfolders.vdf")
                        .is_file()
            }
            None => false,
        }
    }

    fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError> {
        self.scan()
    }

    fn default_paths(&self) -> Vec<PathBuf> {
        vec![PathBuf::from(r"C:\Program Files (x86)\Steam")]
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

    /// Helper: create a minimal Steam directory structure.
    fn create_steam_dir(tmp: &TempDir) -> PathBuf {
        let steam = tmp.path().join("Steam");
        let steamapps = steam.join("steamapps");
        let common = steamapps.join("common");
        fs::create_dir_all(&common).unwrap();

        // steam.exe placeholder
        fs::write(steam.join("steam.exe"), "fake").unwrap();

        steam
    }

    /// Helper: write a libraryfolders.vdf pointing to the given library paths.
    fn write_library_folders_vdf(steam_path: &Path, library_paths: &[&Path]) {
        let steamapps = steam_path.join("steamapps");
        fs::create_dir_all(&steamapps).unwrap();

        let mut entries = String::new();
        for (i, lib_path) in library_paths.iter().enumerate() {
            let escaped = lib_path.to_string_lossy().replace('\\', "\\\\");
            entries.push_str(&format!(
                "\t\"{i}\"\n\t{{\n\t\t\"path\"\t\t\"{escaped}\"\n\t\t\"apps\"\n\t\t{{\n\t\t}}\n\t}}\n"
            ));
        }

        let vdf = format!("\"libraryfolders\"\n{{\n{entries}}}");
        fs::write(steamapps.join("libraryfolders.vdf"), vdf).unwrap();
    }

    /// Helper: write an appmanifest ACF file.
    fn write_acf(steamapps: &Path, appid: &str, name: &str, installdir: &str) {
        let content = format!(
            "\"AppState\"\n{{\n\t\"appid\"\t\t\"{appid}\"\n\t\"name\"\t\t\"{name}\"\n\t\"installdir\"\t\t\"{installdir}\"\n}}"
        );
        fs::write(
            steamapps.join(format!("appmanifest_{appid}.acf")),
            content,
        )
        .unwrap();
    }

    // -- Task 1: Path resolution --

    #[test]
    fn scanner_uses_override_path() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);

        let mut scanner = SteamScanner::new();
        scanner.set_path_override(Some(steam.clone()));
        assert_eq!(scanner.resolved_path(), Some(steam));
    }

    #[test]
    fn scanner_default_paths_contains_program_files() {
        let scanner = SteamScanner::new();
        let defaults = scanner.default_paths();
        assert_eq!(defaults.len(), 1);
        assert!(defaults[0].to_string_lossy().contains("Steam"));
    }

    #[test]
    fn scanner_no_path_resolved_when_nothing_exists() {
        let scanner = SteamScanner::new();
        // Without override and with no registry / default path existing
        assert!(scanner.resolved_path().is_none());
    }

    // -- Task 2: VDF parser --

    #[test]
    fn parse_simple_vdf() {
        let input = r#"
"AppState"
{
    "appid"     "440"
    "name"      "Team Fortress 2"
    "installdir"    "Team Fortress 2"
}
"#;
        let root = parse_vdf(input).unwrap();
        let app_state = root.get("AppState").unwrap();
        assert_eq!(app_state.get_str("appid"), Some("440"));
        assert_eq!(app_state.get_str("name"), Some("Team Fortress 2"));
        assert_eq!(app_state.get_str("installdir"), Some("Team Fortress 2"));
    }

    #[test]
    fn parse_nested_vdf() {
        let input = r#"
"libraryfolders"
{
    "0"
    {
        "path"      "C:\\Program Files (x86)\\Steam"
        "apps"
        {
            "440"   "12345"
        }
    }
}
"#;
        let root = parse_vdf(input).unwrap();
        let lf = root.get("libraryfolders").unwrap();
        let entry = lf.get("0").unwrap();
        assert_eq!(
            entry.get_str("path"),
            Some("C:\\Program Files (x86)\\Steam")
        );
        let apps = entry.get("apps").unwrap().as_section().unwrap();
        assert_eq!(apps.get("440").unwrap().as_str(), Some("12345"));
    }

    #[test]
    fn parse_vdf_with_comments() {
        let input = r#"
// This is a comment
"Root"
{
    // Another comment
    "key"   "value"
}
"#;
        let root = parse_vdf(input).unwrap();
        assert_eq!(root.get("Root").unwrap().get_str("key"), Some("value"));
    }

    #[test]
    fn parse_vdf_with_escaped_quotes() {
        let input = r#"
"Root"
{
    "key"   "value with \"quotes\""
}
"#;
        let root = parse_vdf(input).unwrap();
        assert_eq!(
            root.get("Root").unwrap().get_str("key"),
            Some("value with \"quotes\"")
        );
    }

    #[test]
    fn parse_empty_section() {
        let input = r#"
"Root"
{
    "empty"
    {
    }
}
"#;
        let root = parse_vdf(input).unwrap();
        let empty = root.get("Root").unwrap().get("empty").unwrap();
        assert!(empty.as_section().unwrap().is_empty());
    }

    #[test]
    fn parse_vdf_error_on_empty_input() {
        let result = parse_vdf("");
        assert!(result.is_err());
    }

    // -- Task 3: Library folder discovery --

    #[test]
    fn discover_library_folders_finds_paths() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);

        let lib2 = tmp.path().join("SteamLibrary");
        fs::create_dir_all(&lib2).unwrap();

        write_library_folders_vdf(&steam, &[steam.as_path(), lib2.as_path()]);

        let folders = discover_library_folders(&steam).unwrap();
        assert_eq!(folders.len(), 2);
        assert!(folders.contains(&steam));
        assert!(folders.contains(&lib2));
    }

    #[test]
    fn discover_library_folders_skips_nonexistent() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);

        let nonexistent = tmp.path().join("DoesNotExist");
        write_library_folders_vdf(&steam, &[steam.as_path(), nonexistent.as_path()]);

        let folders = discover_library_folders(&steam).unwrap();
        assert_eq!(folders.len(), 1);
        assert!(folders.contains(&steam));
    }

    #[test]
    fn discover_library_folders_error_when_vdf_missing() {
        let tmp = TempDir::new().unwrap();
        let steam = tmp.path().join("Steam");
        fs::create_dir_all(steam.join("steamapps")).unwrap();
        // No libraryfolders.vdf written

        let result = discover_library_folders(&steam);
        assert!(result.is_err());
    }

    // -- Task 4: ACF manifest parsing --

    #[test]
    fn parse_acf_manifest_extracts_fields() {
        let tmp = TempDir::new().unwrap();
        let steamapps = tmp.path().join("steamapps");
        fs::create_dir_all(&steamapps).unwrap();

        write_acf(&steamapps, "440", "Team Fortress 2", "Team Fortress 2");

        let app = parse_acf_manifest(&steamapps.join("appmanifest_440.acf"))
            .unwrap()
            .unwrap();
        assert_eq!(app.appid, "440");
        assert_eq!(app.name, "Team Fortress 2");
        assert_eq!(app.install_dir, "Team Fortress 2");
    }

    #[test]
    fn parse_acf_manifest_returns_none_for_missing_fields() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("bad.acf");
        fs::write(&path, "\"AppState\"\n{\n\t\"appid\"\t\"440\"\n}").unwrap();

        let result = parse_acf_manifest(&path).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn parse_manifests_in_library_finds_all() {
        let tmp = TempDir::new().unwrap();
        let lib = tmp.path().join("library");
        let steamapps = lib.join("steamapps");
        fs::create_dir_all(&steamapps).unwrap();

        write_acf(&steamapps, "440", "Team Fortress 2", "Team Fortress 2");
        write_acf(&steamapps, "570", "Dota 2", "dota 2 beta");

        // Non-manifest file should be ignored
        fs::write(steamapps.join("random.txt"), "ignore me").unwrap();

        let apps = parse_manifests_in_library(&lib).unwrap();
        assert_eq!(apps.len(), 2);

        let ids: Vec<&str> = apps.iter().map(|a| a.appid.as_str()).collect();
        assert!(ids.contains(&"440"));
        assert!(ids.contains(&"570"));
    }

    #[test]
    fn parse_manifests_in_library_empty_when_no_steamapps() {
        let tmp = TempDir::new().unwrap();
        let apps = parse_manifests_in_library(tmp.path()).unwrap();
        assert!(apps.is_empty());
    }

    // -- Task 5: Validate install paths --

    #[test]
    fn scan_skips_games_with_missing_install_dir() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);

        write_library_folders_vdf(&steam, &[steam.as_path()]);

        let steamapps = steam.join("steamapps");
        write_acf(&steamapps, "440", "Team Fortress 2", "Team Fortress 2");
        // Do NOT create steamapps/common/Team Fortress 2

        let mut scanner = SteamScanner::new();
        scanner.set_path_override(Some(steam));

        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    // -- Task 6: Assemble DetectedGame --

    #[test]
    fn scan_returns_detected_games() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);

        write_library_folders_vdf(&steam, &[steam.as_path()]);

        let steamapps = steam.join("steamapps");
        let common = steamapps.join("common");
        write_acf(&steamapps, "440", "Team Fortress 2", "Team Fortress 2");
        fs::create_dir_all(common.join("Team Fortress 2")).unwrap();

        write_acf(&steamapps, "570", "Dota 2", "dota 2 beta");
        fs::create_dir_all(common.join("dota 2 beta")).unwrap();

        let mut scanner = SteamScanner::new();
        scanner.set_path_override(Some(steam));

        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 2);

        let tf2 = games.iter().find(|g| g.name == "Team Fortress 2").unwrap();
        assert_eq!(tf2.source, GameSourceType::Steam);
        assert_eq!(tf2.source_id, Some("440".to_string()));
        assert_eq!(
            tf2.launch_url,
            Some("steam://rungameid/440".to_string())
        );
        assert!(tf2.folder_path.is_some());

        let dota = games.iter().find(|g| g.name == "Dota 2").unwrap();
        assert_eq!(dota.source_id, Some("570".to_string()));
        assert_eq!(
            dota.launch_url,
            Some("steam://rungameid/570".to_string())
        );
    }

    #[test]
    fn scan_across_multiple_libraries() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);

        let lib2 = tmp.path().join("SteamLibrary");
        let lib2_steamapps = lib2.join("steamapps");
        let lib2_common = lib2_steamapps.join("common");
        fs::create_dir_all(&lib2_common).unwrap();

        write_library_folders_vdf(&steam, &[steam.as_path(), lib2.as_path()]);

        // Game in primary library
        let steamapps = steam.join("steamapps");
        write_acf(&steamapps, "440", "Team Fortress 2", "Team Fortress 2");
        fs::create_dir_all(steamapps.join("common").join("Team Fortress 2")).unwrap();

        // Game in secondary library
        write_acf(&lib2_steamapps, "1245620", "Elden Ring", "ELDEN RING");
        fs::create_dir_all(lib2_common.join("ELDEN RING")).unwrap();

        let mut scanner = SteamScanner::new();
        scanner.set_path_override(Some(steam));

        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 2);

        let names: Vec<&str> = games.iter().map(|g| g.name.as_str()).collect();
        assert!(names.contains(&"Team Fortress 2"));
        assert!(names.contains(&"Elden Ring"));
    }

    // -- Task 7: Availability check --

    #[test]
    fn is_available_true_when_steam_exe_and_vdf_exist() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);
        write_library_folders_vdf(&steam, &[steam.as_path()]);

        let mut scanner = SteamScanner::new();
        scanner.set_path_override(Some(steam));
        assert!(scanner.is_available());
    }

    #[test]
    fn is_available_false_when_no_steam_exe() {
        let tmp = TempDir::new().unwrap();
        let steam = tmp.path().join("Steam");
        let steamapps = steam.join("steamapps");
        fs::create_dir_all(&steamapps).unwrap();
        fs::write(steamapps.join("libraryfolders.vdf"), "\"libraryfolders\"\n{\n}").unwrap();
        // No steam.exe

        let mut scanner = SteamScanner::new();
        scanner.set_path_override(Some(steam));
        assert!(!scanner.is_available());
    }

    #[test]
    fn is_available_false_when_no_vdf() {
        let tmp = TempDir::new().unwrap();
        let steam = tmp.path().join("Steam");
        fs::create_dir_all(steam.join("steamapps")).unwrap();
        fs::write(steam.join("steam.exe"), "fake").unwrap();
        // No libraryfolders.vdf

        let mut scanner = SteamScanner::new();
        scanner.set_path_override(Some(steam));
        assert!(!scanner.is_available());
    }

    #[test]
    fn is_available_false_when_no_resolved_path() {
        let scanner = SteamScanner::new();
        assert!(!scanner.is_available());
    }

    // -- GameSource trait --

    #[test]
    fn trait_id_and_display_name() {
        let scanner = SteamScanner::new();
        assert_eq!(scanner.id(), "steam");
        assert_eq!(scanner.display_name(), "Steam");
    }

    #[test]
    fn trait_path_override_round_trip() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);

        let mut scanner = SteamScanner::new();
        assert!(scanner.resolved_path().is_none());

        scanner.set_path_override(Some(steam.clone()));
        assert_eq!(scanner.resolved_path(), Some(steam));

        scanner.set_path_override(None);
        // Without registry or default, resolved should be None
        // (unless the default path exists on this machine)
    }

    #[test]
    fn scan_returns_error_when_unavailable() {
        let scanner = SteamScanner::new();
        let result = scanner.scan();
        assert!(result.is_err());
    }

    // -- Full pipeline --

    #[test]
    fn full_pipeline_end_to_end() {
        let tmp = TempDir::new().unwrap();
        let steam = create_steam_dir(&tmp);
        write_library_folders_vdf(&steam, &[steam.as_path()]);

        let steamapps = steam.join("steamapps");
        let common = steamapps.join("common");

        write_acf(&steamapps, "1245620", "Elden Ring", "ELDEN RING");
        fs::create_dir_all(common.join("ELDEN RING")).unwrap();

        write_acf(&steamapps, "292030", "The Witcher 3", "The Witcher 3");
        fs::create_dir_all(common.join("The Witcher 3")).unwrap();

        // Game with missing install dir should be skipped
        write_acf(&steamapps, "999999", "Missing Game", "MissingDir");

        let mut scanner = SteamScanner::new();
        scanner.set_path_override(Some(steam.clone()));

        assert!(scanner.is_available());

        let games = scanner.detect_games().unwrap();
        assert_eq!(games.len(), 2);

        for game in &games {
            assert_eq!(game.source, GameSourceType::Steam);
            assert!(game.source_id.is_some());
            assert!(game.launch_url.is_some());
            assert!(game.folder_path.is_some());

            let launch_url = game.launch_url.as_ref().unwrap();
            let appid = game.source_id.as_ref().unwrap();
            assert_eq!(launch_url, &format!("steam://rungameid/{appid}"));
        }
    }
}
