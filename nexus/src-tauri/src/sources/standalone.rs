use std::path::{Path, PathBuf};

use crate::models::game::GameSource as GameSourceType;

use super::{DetectedGame, GameSource, SourceError};

/// Standalone / Repack game scanner.
///
/// Scans user-specified watched folders for games installed outside of store
/// launchers, including FitGirl, DODI, ElAmigos, and other repacks.
pub struct StandaloneScanner {
    watched_folders: Vec<PathBuf>,
    path_override: Option<PathBuf>,
}

impl StandaloneScanner {
    pub fn new() -> Self {
        Self {
            watched_folders: Vec::new(),
            path_override: None,
        }
    }

    pub fn set_watched_folders(&mut self, folders: Vec<PathBuf>) {
        self.watched_folders = folders;
    }

    /// Main scan entry point: iterate each watched folder and collect detected games.
    pub fn scan(&self) -> Result<Vec<DetectedGame>, SourceError> {
        let mut games = Vec::new();

        for folder in &self.watched_folders {
            if !folder.is_dir() {
                log::warn!("watched folder does not exist or is not a directory: {}", folder.display());
                continue;
            }

            let subdirs = enumerate_subdirectories(folder)?;
            for subdir in subdirs {
                if let Some(game) = scan_game_directory(&subdir) {
                    games.push(game);
                }
            }
        }

        Ok(games)
    }
}

impl GameSource for StandaloneScanner {
    fn id(&self) -> &str {
        "standalone"
    }

    fn display_name(&self) -> &str {
        "Standalone / Repack"
    }

    fn is_available(&self) -> bool {
        !self.watched_folders.is_empty()
    }

    fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError> {
        self.scan()
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

// ---------------------------------------------------------------------------
// Task 2: Directory enumeration (depth = 1)
// ---------------------------------------------------------------------------

/// Enumerate immediate subdirectories of a watched folder (depth = 1).
fn enumerate_subdirectories(folder: &Path) -> Result<Vec<PathBuf>, SourceError> {
    let mut subdirs = Vec::new();
    let entries = std::fs::read_dir(folder)?;
    for entry in entries {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            subdirs.push(entry.path());
        }
    }
    Ok(subdirs)
}

// ---------------------------------------------------------------------------
// Task 3: Exe search with max depth = 3
// ---------------------------------------------------------------------------

/// Recursively search for `.exe` files up to `max_depth` levels deep.
fn find_executables(dir: &Path, max_depth: u32) -> Vec<PathBuf> {
    let mut results = Vec::new();
    find_executables_recursive(dir, dir, max_depth, &mut results);
    results
}

fn find_executables_recursive(
    root: &Path,
    current: &Path,
    max_depth: u32,
    results: &mut Vec<PathBuf>,
) {
    let entries = match std::fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext.eq_ignore_ascii_case("exe") {
                    results.push(path);
                }
            }
        } else if path.is_dir() && max_depth > 0 {
            let depth_from_root = path
                .strip_prefix(root)
                .map(|rel| rel.components().count() as u32)
                .unwrap_or(max_depth);
            if depth_from_root < max_depth {
                find_executables_recursive(root, &path, max_depth, results);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Task 4: Blocklist filter from spec Section 5.2
// ---------------------------------------------------------------------------

const BLOCKLIST_NAME_PREFIXES: &[&str] = &[
    "uninstall", "unins",
    "setup", "install",
    "redist", "vc_redist", "vcredist",
    "dxsetup", "dxwebsetup",
    "unitycrashhandler",
    "crashreporter", "bugsplat",
    "dotnet",
    "quicksfv", // FitGirl repack checksum verifier — not a game exe
];

const BLOCKLIST_FOLDER_NAMES: &[&str] = &[
    "__redist",
    "_commonredist",
    "redist",
    "directx",
    "vcredist",
];

/// Returns `true` if the exe should be excluded from game detection.
fn is_blocklisted(exe_path: &Path) -> bool {
    let file_name = match exe_path.file_stem() {
        Some(s) => s.to_string_lossy().to_lowercase(),
        None => return true,
    };

    for prefix in BLOCKLIST_NAME_PREFIXES {
        if file_name.starts_with(prefix) {
            return true;
        }
    }

    for ancestor in exe_path.ancestors().skip(1) {
        if let Some(dir_name) = ancestor.file_name() {
            let dir_lower = dir_name.to_string_lossy().to_lowercase();
            if BLOCKLIST_FOLDER_NAMES.contains(&dir_lower.as_str()) {
                return true;
            }
        }
    }

    false
}

// ---------------------------------------------------------------------------
// Task 5: Exe ranking algorithm
// ---------------------------------------------------------------------------

const DEPRIORITIZED_NAMES: &[&str] = &[
    "launcher", "config", "settings", "editor",
    "crash", "reporter", "helper", "updater",
];

/// Score an executable for likelihood of being the main game binary.
/// Higher score = more likely to be the game exe.
fn score_executable(exe_path: &Path, game_folder: &Path) -> i64 {
    let mut score: i64 = 0;

    let depth = exe_path
        .strip_prefix(game_folder)
        .map(|rel| rel.components().count())
        .unwrap_or(4);
    score += match depth {
        1 => 100,  // directly in root
        2 => 50,
        3 => 25,
        _ => 0,
    };

    let folder_name = game_folder
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let exe_stem = exe_path
        .file_stem()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if !folder_name.is_empty() && !exe_stem.is_empty() {
        let cleaned_folder = clean_name_for_comparison(&folder_name);
        let cleaned_exe = clean_name_for_comparison(&exe_stem);
        if cleaned_exe == cleaned_folder {
            score += 80;
        } else if cleaned_folder.contains(&cleaned_exe) || cleaned_exe.contains(&cleaned_folder) {
            score += 40;
        }
    }

    if let Ok(metadata) = exe_path.metadata() {
        let size = metadata.len();
        score += match size {
            s if s > 100_000_000 => 60, // > 100 MB
            s if s > 50_000_000 => 50,  // > 50 MB
            s if s > 10_000_000 => 40,  // > 10 MB
            s if s > 1_000_000 => 20,   // > 1 MB
            _ => 0,
        };
    }

    for name in DEPRIORITIZED_NAMES {
        if exe_stem.contains(name) {
            score -= 80;
            break;
        }
    }

    score
}

/// Strip non-alphanumeric chars for fuzzy comparison.
fn clean_name_for_comparison(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

// ---------------------------------------------------------------------------
// Task 6: Name derivation / cleaning
// ---------------------------------------------------------------------------

/// Derive a clean display name from a game folder name.
pub fn derive_game_name(folder_name: &str) -> String {
    let mut name = folder_name.to_string();

    // Strip bracketed repack tags: [FitGirl Repack], [DODI Repack], [ElAmigos], etc.
    name = strip_bracketed_tags(&name);

    // Strip parenthesized version patterns: (v1.2.3), (Build 12345)
    name = strip_parenthesized_versions(&name);

    // Strip dash-prefixed build patterns: - Build 12345
    name = strip_dash_build(&name);

    // Strip trailing version patterns: v1.0, 1.2.3, Build 1234
    name = strip_trailing_versions(&name);

    // Normalize whitespace
    name = normalize_whitespace(&name);

    // Title-case if ALL CAPS or all lowercase
    name = smart_title_case(&name);

    name
}

fn strip_bracketed_tags(s: &str) -> String {
    let re_square = regex_lite::Regex::new(r"\[.*?\]").unwrap();
    re_square.replace_all(s, "").to_string()
}

fn strip_parenthesized_versions(s: &str) -> String {
    let re_paren = regex_lite::Regex::new(r"\(v?\d[\d.]*[^)]*\)").unwrap();
    re_paren.replace_all(s, "").to_string()
}

fn strip_dash_build(s: &str) -> String {
    let re_dash = regex_lite::Regex::new(r"(?i)\s*-\s*build\s+\d+").unwrap();
    re_dash.replace_all(s, "").to_string()
}

fn strip_trailing_versions(s: &str) -> String {
    let re_trailing = regex_lite::Regex::new(r"(?i)\s+(?:v\d[\d.]*|build\s*\d+|\d+\.\d+[\d.]*)$").unwrap();
    re_trailing.replace(s, "").to_string()
}

fn normalize_whitespace(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn smart_title_case(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let is_all_upper = trimmed.chars().all(|c| !c.is_alphabetic() || c.is_uppercase());
    let is_all_lower = trimmed.chars().all(|c| !c.is_alphabetic() || c.is_lowercase());

    if is_all_upper || is_all_lower {
        title_case(trimmed)
    } else {
        trimmed.to_string()
    }
}

fn title_case(s: &str) -> String {
    s.split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => {
                    let upper: String = first.to_uppercase().collect();
                    let rest: String = chars.map(|c| c.to_lowercase().next().unwrap_or(c)).collect();
                    format!("{upper}{rest}")
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------------------------------------------------------------------------
// Task 7: Origin hint detection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum OriginHint {
    FitGirl,
    Dodi,
    ElAmigos,
    GoldbergEmu,
}

impl OriginHint {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::FitGirl => "FitGirl",
            Self::Dodi => "DODI",
            Self::ElAmigos => "ElAmigos",
            Self::GoldbergEmu => "Goldberg Emu",
        }
    }
}

/// Scan the game folder (depth = 1) for telltale repack/emu files.
fn detect_origin_hint(game_folder: &Path) -> Option<OriginHint> {
    let entries = match std::fs::read_dir(game_folder) {
        Ok(e) => e,
        Err(_) => return None,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = match path.file_name() {
            Some(n) => n.to_string_lossy().to_lowercase(),
            None => continue,
        };

        if file_name.starts_with("fitgirl")
            || file_name == "verify bin files before installation.txt"
        {
            return Some(OriginHint::FitGirl);
        }

        if file_name.starts_with("dodi") || file_name == "dodi repacks.txt" {
            return Some(OriginHint::Dodi);
        }

        if file_name.starts_with("elamigos") {
            return Some(OriginHint::ElAmigos);
        }

        if file_name.starts_with("goldberg") {
            return Some(OriginHint::GoldbergEmu);
        }

        if file_name == "steam_api.ini" {
            if let Ok(contents) = std::fs::read_to_string(&path) {
                let lower = contents.to_lowercase();
                if lower.contains("goldberg") {
                    return Some(OriginHint::GoldbergEmu);
                }
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Task 8: Assemble DetectedGame
// ---------------------------------------------------------------------------

/// Scan a folder and return a comma-separated string of candidate exe filenames,
/// ranked best-first, with blocklisted entries excluded.
/// Returns `None` if no valid executables are found.
pub fn derive_potential_exe_names(folder: &Path) -> Option<String> {
    let executables = find_executables(folder, 3);
    let filtered: Vec<PathBuf> = executables
        .into_iter()
        .filter(|exe| !is_blocklisted(exe))
        .collect();

    if filtered.is_empty() {
        return None;
    }

    let mut scored: Vec<(PathBuf, i64)> = filtered
        .into_iter()
        .map(|exe| {
            let s = score_executable(&exe, folder);
            (exe, s)
        })
        .collect();
    scored.sort_by(|a, b| b.1.cmp(&a.1));

    let names: Vec<String> = scored
        .iter()
        .filter_map(|(p, _)| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .collect();

    if names.is_empty() { None } else { Some(names.join(",")) }
}

/// Scan a single game directory: find exes, filter, rank, derive name, detect origin.
pub(crate) fn scan_game_directory(game_folder: &Path) -> Option<DetectedGame> {
    let executables = find_executables(game_folder, 3);

    let filtered: Vec<PathBuf> = executables
        .into_iter()
        .filter(|exe| !is_blocklisted(exe))
        .collect();

    if filtered.is_empty() {
        return None;
    }

    let mut scored: Vec<(PathBuf, i64)> = filtered
        .into_iter()
        .map(|exe| {
            let s = score_executable(&exe, game_folder);
            (exe, s)
        })
        .collect();

    scored.sort_by(|a, b| b.1.cmp(&a.1));

    let best_exe = &scored[0].0;

    // Collect all candidate exe filenames (best-first) for process tracking.
    // Used by the launch lifecycle to identify when the game process is running.
    let potential_exe_names: Vec<String> = scored
        .iter()
        .filter_map(|(p, _)| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .collect();

    let potential_exe_names_str = if potential_exe_names.is_empty() {
        None
    } else {
        Some(potential_exe_names.join(","))
    };

    let folder_name = game_folder
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown Game".to_string());

    let display_name = derive_game_name(&folder_name);
    let origin = detect_origin_hint(game_folder);

    Some(DetectedGame {
        name: display_name,
        source: GameSourceType::Standalone,
        source_id: None,
        source_hint: origin.map(|o| o.as_str().to_string()),
        folder_path: Some(game_folder.to_path_buf()),
        exe_path: Some(best_exe.clone()),
        exe_name: best_exe
            .file_name()
            .map(|n| n.to_string_lossy().to_string()),
        launch_url: None,
        potential_exe_names: potential_exe_names_str,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_file(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, "MZ_FAKE_EXE").unwrap();
    }

    fn create_file_with_size(path: &Path, size: usize) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let data = vec![0u8; size];
        fs::write(path, data).unwrap();
    }

    // -- Task 1: Watched folder scanning --

    #[test]
    fn scanner_with_no_folders_returns_empty() {
        let scanner = StandaloneScanner::new();
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scanner_skips_nonexistent_folders() {
        let mut scanner = StandaloneScanner::new();
        scanner.set_watched_folders(vec![PathBuf::from("C:\\nonexistent_xyz_12345")]);
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scanner_finds_game_in_watched_folder() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("My Game");
        fs::create_dir(&game_dir).unwrap();
        create_file(&game_dir.join("game.exe"));

        let mut scanner = StandaloneScanner::new();
        scanner.set_watched_folders(vec![tmp.path().to_path_buf()]);
        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].name, "My Game");
        assert_eq!(games[0].source, GameSourceType::Standalone);
    }

    #[test]
    fn scanner_is_available_with_folders() {
        let mut scanner = StandaloneScanner::new();
        assert!(!scanner.is_available());
        scanner.set_watched_folders(vec![PathBuf::from("C:\\Games")]);
        assert!(scanner.is_available());
    }

    // -- Task 2: Directory enumeration --

    #[test]
    fn enumerate_subdirectories_finds_dirs() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join("Game1")).unwrap();
        fs::create_dir(tmp.path().join("Game2")).unwrap();
        fs::write(tmp.path().join("readme.txt"), "hi").unwrap();

        let subdirs = enumerate_subdirectories(tmp.path()).unwrap();
        assert_eq!(subdirs.len(), 2);
    }

    #[test]
    fn enumerate_subdirectories_empty_folder() {
        let tmp = TempDir::new().unwrap();
        let subdirs = enumerate_subdirectories(tmp.path()).unwrap();
        assert!(subdirs.is_empty());
    }

    // -- Task 3: Exe search --

    #[test]
    fn find_executables_at_root() {
        let tmp = TempDir::new().unwrap();
        create_file(&tmp.path().join("game.exe"));
        create_file(&tmp.path().join("readme.txt"));

        let exes = find_executables(tmp.path(), 3);
        assert_eq!(exes.len(), 1);
        assert!(exes[0].to_string_lossy().contains("game.exe"));
    }

    #[test]
    fn find_executables_respects_max_depth() {
        let tmp = TempDir::new().unwrap();
        create_file(&tmp.path().join("game.exe"));
        create_file(&tmp.path().join("bin").join("helper.exe"));
        create_file(&tmp.path().join("a").join("b").join("c").join("deep.exe"));
        // deep.exe is at depth 4 from root, should be excluded at max_depth=3

        let exes = find_executables(tmp.path(), 3);
        let names: Vec<String> = exes.iter().map(|p| p.file_name().unwrap().to_string_lossy().to_string()).collect();
        assert!(names.contains(&"game.exe".to_string()));
        assert!(names.contains(&"helper.exe".to_string()));
        assert!(!names.contains(&"deep.exe".to_string()));
    }

    #[test]
    fn find_executables_case_insensitive_extension() {
        let tmp = TempDir::new().unwrap();
        create_file(&tmp.path().join("Game.EXE"));

        let exes = find_executables(tmp.path(), 3);
        assert_eq!(exes.len(), 1);
    }

    // -- Task 4: Blocklist --

    #[test]
    fn blocklist_filters_uninstall() {
        assert!(is_blocklisted(Path::new("C:\\Game\\uninstall.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\Unins000.exe")));
    }

    #[test]
    fn blocklist_filters_setup() {
        assert!(is_blocklisted(Path::new("C:\\Game\\setup.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\Setup_Game.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\install.exe")));
    }

    #[test]
    fn blocklist_filters_redist() {
        assert!(is_blocklisted(Path::new("C:\\Game\\vcredist_x64.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\vc_redist.x64.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\dxsetup.exe")));
    }

    #[test]
    fn blocklist_filters_crash_handlers() {
        assert!(is_blocklisted(Path::new("C:\\Game\\UnityCrashHandler64.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\CrashReporter.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\BugSplatRc.exe")));
    }

    #[test]
    fn blocklist_filters_redist_folders() {
        assert!(is_blocklisted(Path::new("C:\\Game\\_CommonRedist\\vcredist\\vc.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\__redist\\setup.exe")));
        assert!(is_blocklisted(Path::new("C:\\Game\\DirectX\\dxsetup.exe")));
    }

    #[test]
    fn blocklist_filters_quicksfv() {
        assert!(is_blocklisted(Path::new("C:\\Game\\QuickSFV.EXE")));
        assert!(is_blocklisted(Path::new("C:\\Game\\quicksfv.exe")));
    }

    #[test]
    fn blocklist_allows_game_exe() {
        assert!(!is_blocklisted(Path::new("C:\\Game\\witcher3.exe")));
        assert!(!is_blocklisted(Path::new("C:\\Game\\bin\\game.exe")));
    }

    // -- Task 5: Exe ranking --

    #[test]
    fn ranking_prefers_root_exe() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("MyGame");
        fs::create_dir_all(game_dir.join("bin")).unwrap();
        create_file(&game_dir.join("game.exe"));
        create_file(&game_dir.join("bin").join("helper.exe"));

        let root_score = score_executable(&game_dir.join("game.exe"), &game_dir);
        let nested_score = score_executable(&game_dir.join("bin").join("helper.exe"), &game_dir);
        assert!(root_score > nested_score);
    }

    #[test]
    fn ranking_prefers_name_match() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("Cyberpunk 2077");
        fs::create_dir(&game_dir).unwrap();
        create_file_with_size(&game_dir.join("cyberpunk2077.exe"), 100);
        create_file_with_size(&game_dir.join("other.exe"), 100);

        let match_score = score_executable(&game_dir.join("cyberpunk2077.exe"), &game_dir);
        let other_score = score_executable(&game_dir.join("other.exe"), &game_dir);
        assert!(match_score > other_score);
    }

    #[test]
    fn ranking_prefers_larger_files() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("Game");
        fs::create_dir(&game_dir).unwrap();
        create_file_with_size(&game_dir.join("big.exe"), 60_000_000);
        create_file_with_size(&game_dir.join("small.exe"), 500);

        let big_score = score_executable(&game_dir.join("big.exe"), &game_dir);
        let small_score = score_executable(&game_dir.join("small.exe"), &game_dir);
        assert!(big_score > small_score);
    }

    #[test]
    fn ranking_deprioritizes_launcher_exe() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("Game");
        fs::create_dir(&game_dir).unwrap();
        create_file(&game_dir.join("game.exe"));
        create_file(&game_dir.join("launcher.exe"));

        let game_score = score_executable(&game_dir.join("game.exe"), &game_dir);
        let launcher_score = score_executable(&game_dir.join("launcher.exe"), &game_dir);
        assert!(game_score > launcher_score);
    }

    // -- Task 6: Name derivation --

    #[test]
    fn derive_name_strips_fitgirl_tag() {
        assert_eq!(derive_game_name("Elden Ring [FitGirl Repack]"), "Elden Ring");
    }

    #[test]
    fn derive_name_strips_dodi_tag() {
        assert_eq!(derive_game_name("Cyberpunk 2077 [DODI Repack]"), "Cyberpunk 2077");
    }

    #[test]
    fn derive_name_strips_elamigos_tag() {
        assert_eq!(derive_game_name("Game Name [ElAmigos]"), "Game Name");
    }

    #[test]
    fn derive_name_strips_version_parens() {
        assert_eq!(derive_game_name("Game Name (v1.2.3)"), "Game Name");
    }

    #[test]
    fn derive_name_strips_dash_build() {
        assert_eq!(derive_game_name("Game Name - Build 12345"), "Game Name");
    }

    #[test]
    fn derive_name_strips_trailing_version() {
        assert_eq!(derive_game_name("Game Name v1.0"), "Game Name");
        assert_eq!(derive_game_name("Game Name 1.2.3"), "Game Name");
    }

    #[test]
    fn derive_name_normalizes_whitespace() {
        assert_eq!(derive_game_name("  Game   Name  "), "Game Name");
    }

    #[test]
    fn derive_name_title_cases_all_caps() {
        assert_eq!(derive_game_name("ELDEN RING"), "Elden Ring");
    }

    #[test]
    fn derive_name_title_cases_all_lower() {
        assert_eq!(derive_game_name("elden ring"), "Elden Ring");
    }

    #[test]
    fn derive_name_preserves_mixed_case() {
        assert_eq!(derive_game_name("Elden Ring"), "Elden Ring");
    }

    #[test]
    fn derive_name_complex_repack() {
        assert_eq!(
            derive_game_name("Cyberpunk 2077 [FitGirl Repack] (v1.6.3)"),
            "Cyberpunk 2077"
        );
    }

    // -- Task 7: Origin hint detection --

    #[test]
    fn detect_fitgirl_by_txt() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("fitgirl.txt"), "info").unwrap();
        assert_eq!(detect_origin_hint(tmp.path()), Some(OriginHint::FitGirl));
    }

    #[test]
    fn detect_fitgirl_by_verify_txt() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("Verify BIN files before installation.txt"), "").unwrap();
        assert_eq!(detect_origin_hint(tmp.path()), Some(OriginHint::FitGirl));
    }

    #[test]
    fn detect_dodi_by_txt() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("DODI Repacks.txt"), "").unwrap();
        assert_eq!(detect_origin_hint(tmp.path()), Some(OriginHint::Dodi));
    }

    #[test]
    fn detect_elamigos_by_txt() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("ElAmigos.txt"), "").unwrap();
        assert_eq!(detect_origin_hint(tmp.path()), Some(OriginHint::ElAmigos));
    }

    #[test]
    fn detect_goldberg_by_txt() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("Goldberg.txt"), "").unwrap();
        assert_eq!(detect_origin_hint(tmp.path()), Some(OriginHint::GoldbergEmu));
    }

    #[test]
    fn detect_goldberg_by_steam_api_ini() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("steam_api.ini"), "[Settings]\n; Goldberg Steam Emu\n").unwrap();
        assert_eq!(detect_origin_hint(tmp.path()), Some(OriginHint::GoldbergEmu));
    }

    #[test]
    fn detect_no_origin_hint() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("readme.txt"), "hello").unwrap();
        assert_eq!(detect_origin_hint(tmp.path()), None);
    }

    // -- Task 8: Full pipeline --

    #[test]
    fn scan_game_directory_full_pipeline() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("Elden Ring [FitGirl Repack]");
        fs::create_dir(&game_dir).unwrap();
        create_file_with_size(&game_dir.join("eldenring.exe"), 50_000_000);
        create_file(&game_dir.join("uninstall.exe"));
        create_file(&game_dir.join("fitgirl.txt"));

        let game = scan_game_directory(&game_dir).unwrap();
        assert_eq!(game.name, "Elden Ring");
        assert_eq!(game.source, GameSourceType::Standalone);
        assert_eq!(game.source_hint, Some("FitGirl".to_string()));
        assert!(game.exe_path.unwrap().to_string_lossy().contains("eldenring.exe"));
        assert_eq!(game.exe_name, Some("eldenring.exe".to_string()));
        assert!(game.launch_url.is_none());
    }

    #[test]
    fn scan_game_directory_no_exe_returns_none() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("EmptyGame");
        fs::create_dir(&game_dir).unwrap();
        fs::write(game_dir.join("readme.txt"), "hi").unwrap();

        assert!(scan_game_directory(&game_dir).is_none());
    }

    #[test]
    fn scan_game_directory_only_blocklisted_returns_none() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("Game");
        fs::create_dir(&game_dir).unwrap();
        create_file(&game_dir.join("uninstall.exe"));
        create_file(&game_dir.join("setup.exe"));

        assert!(scan_game_directory(&game_dir).is_none());
    }

    #[test]
    fn full_scan_multiple_games() {
        let tmp = TempDir::new().unwrap();

        let game1 = tmp.path().join("Game One");
        fs::create_dir(&game1).unwrap();
        create_file(&game1.join("game1.exe"));

        let game2 = tmp.path().join("Game Two [DODI Repack]");
        fs::create_dir(&game2).unwrap();
        create_file(&game2.join("game2.exe"));
        fs::write(game2.join("DODI Repacks.txt"), "").unwrap();

        let mut scanner = StandaloneScanner::new();
        scanner.set_watched_folders(vec![tmp.path().to_path_buf()]);
        let games = scanner.scan().unwrap();

        assert_eq!(games.len(), 2);

        let names: Vec<&str> = games.iter().map(|g| g.name.as_str()).collect();
        assert!(names.contains(&"Game One"));
        assert!(names.contains(&"Game Two"));

        let dodi_game = games.iter().find(|g| g.name == "Game Two").unwrap();
        assert_eq!(dodi_game.source_hint, Some("DODI".to_string()));
    }

    #[test]
    fn game_source_trait_id_and_display_name() {
        let scanner = StandaloneScanner::new();
        assert_eq!(scanner.id(), "standalone");
        assert_eq!(scanner.display_name(), "Standalone / Repack");
    }

    #[test]
    fn game_source_trait_path_override() {
        let mut scanner = StandaloneScanner::new();
        assert!(scanner.resolved_path().is_none());
        scanner.set_path_override(Some(PathBuf::from("C:\\Custom")));
        assert_eq!(scanner.resolved_path(), Some(PathBuf::from("C:\\Custom")));
    }
}
