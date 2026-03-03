use std::path::{Path, PathBuf};

use crate::models::game::GameSource as GameSourceType;

use super::{DetectedGame, GameSource, SourceError};

// ---------------------------------------------------------------------------
// Task 1: PowerShell command execution (Get-AppxPackage)
// ---------------------------------------------------------------------------

pub struct XboxScanner {
    /// When set, bypass live PowerShell and use this pre-supplied JSON instead.
    /// Primarily used for testing.
    mock_powershell_output: Option<String>,
}

impl XboxScanner {
    pub fn new() -> Self {
        Self {
            mock_powershell_output: None,
        }
    }

    #[cfg(test)]
    pub fn with_mock_output(output: String) -> Self {
        Self {
            mock_powershell_output: Some(output),
        }
    }
}

/// Execute `Get-AppxPackage` via PowerShell and return the raw JSON string.
///
/// The command filters out framework packages (`-PackageTypeFilter Main`)
/// and converts the output to JSON for structured parsing.
#[cfg(target_os = "windows")]
fn run_get_appx_package() -> Result<String, SourceError> {
    use std::os::windows::process::CommandExt;
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-AppxPackage -PackageTypeFilter Main | Select-Object Name, PackageFamilyName, InstallLocation, IsFramework | ConvertTo-Json -Compress",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| SourceError::Other(format!("failed to execute PowerShell: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(SourceError::Other(format!(
            "Get-AppxPackage failed (exit {}): {stderr}",
            output.status
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[cfg(not(target_os = "windows"))]
fn run_get_appx_package() -> Result<String, SourceError> {
    Ok("[]".to_string())
}

// ---------------------------------------------------------------------------
// Task 2: JSON output parsing for Store packages
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AppxPackageEntry {
    name: Option<String>,
    package_family_name: Option<String>,
    install_location: Option<String>,
    is_framework: Option<bool>,
}

/// Parse the JSON output from Get-AppxPackage into structured entries.
///
/// PowerShell emits a single object (not array) when there is exactly one
/// result, so we handle both cases.
fn parse_appx_json(json_str: &str) -> Result<Vec<AppxPackageEntry>, SourceError> {
    let trimmed = json_str.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(Vec::new());
    }

    if trimmed.starts_with('[') {
        serde_json::from_str(trimmed).map_err(|e| {
            SourceError::Parse(format!("failed to parse AppxPackage JSON array: {e}"))
        })
    } else {
        let single: AppxPackageEntry = serde_json::from_str(trimmed).map_err(|e| {
            SourceError::Parse(format!("failed to parse AppxPackage JSON object: {e}"))
        })?;
        Ok(vec![single])
    }
}

// ---------------------------------------------------------------------------
// Task 3: AppxManifest.xml filtering to identify games
// ---------------------------------------------------------------------------

/// Read AppxManifest.xml from a package's install location and determine
/// if it is a game.
///
/// Heuristics:
/// - `<Category>` contains "game" (case-insensitive)
/// - `<Application>` has `Id` attribute (needed for launch)
/// - Presence of Xbox-related capabilities or extensions
fn read_manifest_info(install_location: &Path) -> Option<ManifestInfo> {
    let manifest_path = install_location.join("AppxManifest.xml");
    let content = std::fs::read_to_string(&manifest_path).ok()?;

    let app_id = extract_application_id(&content)?;
    let display_name = extract_display_name(&content);
    let is_game = content_indicates_game(&content);

    Some(ManifestInfo {
        app_id,
        display_name,
        is_game,
    })
}

struct ManifestInfo {
    app_id: String,
    display_name: Option<String>,
    is_game: bool,
}

/// Extract the Application Id attribute from AppxManifest.xml.
///
/// Looks for `<Application Id="..."` pattern. This is the value needed
/// for the shell launch command.
fn extract_application_id(xml: &str) -> Option<String> {
    // Pattern: <Application Id="App" or <Application Id="GameApp" etc.
    let marker = "Application Id=\"";
    let start = xml.find(marker)? + marker.len();
    let end = xml[start..].find('"')? + start;
    let id = xml[start..end].trim().to_string();
    if id.is_empty() {
        return None;
    }
    Some(id)
}

/// Extract the DisplayName from the Identity or Properties section.
///
/// Returns `None` if the name is a resource reference (`ms-resource:` or
/// `@{...}`) since those require special resolution.
fn extract_display_name(xml: &str) -> Option<String> {
    let marker = "<DisplayName>";
    let start = xml.find(marker)? + marker.len();
    let end = xml[start..].find("</DisplayName>")? + start;
    let name = xml[start..end].trim().to_string();

    if name.is_empty() || name.starts_with("ms-resource:") || name.starts_with("@{") {
        return None;
    }

    Some(name)
}

/// Determine if the manifest content indicates this package is a game.
///
/// Checks for game-related categories, Xbox Live extensions, and gaming
/// capabilities in the manifest XML.
fn content_indicates_game(xml: &str) -> bool {
    let lower = xml.to_lowercase();

    // Xbox Live / gaming extensions
    if lower.contains("xbox.live") || lower.contains("xboxlive") {
        return true;
    }

    // Windows.Gaming namespace
    if lower.contains("windows.gaming") {
        return true;
    }

    // Game category in the manifest
    if lower.contains("category=\"game") || lower.contains("category=\"windows.game") {
        return true;
    }

    // Xbox services capability
    if lower.contains("xboxaccessorymanagement")
        || lower.contains("gamebarservices")
        || lower.contains("broadfilesystemaccess")
    {
        // broadFileSystemAccess alone isn't definitive, but combined with
        // other signals it helps. We check it here as a weaker signal.
    }

    // Protocol activation for gaming
    if lower.contains("ms-xbl-") || lower.contains("ms-xbox-") {
        return true;
    }

    false
}

// ---------------------------------------------------------------------------
// Task 4: Non-game exclusion list
// ---------------------------------------------------------------------------

/// Known non-game package name prefixes/patterns that should always be excluded
/// even if they pass other heuristics.
const NON_GAME_PREFIXES: &[&str] = &[
    "Microsoft.WindowsStore",
    "Microsoft.WindowsCalculator",
    "Microsoft.WindowsCamera",
    "Microsoft.WindowsAlarms",
    "Microsoft.WindowsMaps",
    "Microsoft.WindowsSoundRecorder",
    "Microsoft.WindowsFeedbackHub",
    "Microsoft.WindowsTerminal",
    "Microsoft.WindowsNotepad",
    "Microsoft.Paint",
    "Microsoft.ScreenSketch",
    "Microsoft.GetHelp",
    "Microsoft.Getstarted",
    "Microsoft.MicrosoftEdge",
    "Microsoft.MicrosoftOffice",
    "Microsoft.Office",
    "Microsoft.OutlookForWindows",
    "Microsoft.Todos",
    "Microsoft.PowerAutomateDesktop",
    "Microsoft.BingWeather",
    "Microsoft.BingNews",
    "Microsoft.BingFinance",
    "Microsoft.BingSports",
    "Microsoft.People",
    "Microsoft.Photos",
    "Microsoft.ZuneMusic",
    "Microsoft.ZuneVideo",
    "Microsoft.SkypeApp",
    "Microsoft.MicrosoftStickyNotes",
    "Microsoft.MSPaint",
    "Microsoft.Whiteboard",
    "Microsoft.549981C3F5F10", // Cortana
    "Microsoft.YourPhone",
    "Microsoft.StorePurchaseApp",
    "Microsoft.VP9VideoExtensions",
    "Microsoft.WebMediaExtensions",
    "Microsoft.HEIFImageExtension",
    "Microsoft.HEVCVideoExtension",
    "Microsoft.WebpImageExtension",
    "Microsoft.RawImageExtension",
    "Microsoft.DesktopAppInstaller",
    "Microsoft.Services.Store.Engagement",
    "Microsoft.NET",
    "Microsoft.VCLibs",
    "Microsoft.UI.Xaml",
    "Microsoft.DirectX",
    "Microsoft.WindowsAppRuntime",
    "Microsoft.XboxApp",
    "Microsoft.XboxIdentityProvider",
    "Microsoft.XboxSpeechToTextOverlay",
    "Microsoft.XboxGamingOverlay",
    "Microsoft.XboxGameOverlay",
    "Microsoft.Xbox.TCUI",
    "Microsoft.GamingApp",
    "Microsoft.GamingServices",
    "Microsoft.OneDrive",
    "Microsoft.Copilot",
    "Microsoft.Windows.DevHome",
    "Microsoft.DevHome",
    "Microsoft.WinDbg",
    "Microsoft.PowerBI",
    "Microsoft.RemoteDesktop",
    "Microsoft.Teams",
    "Microsoft.Clipchamp",
    "Microsoft.Family",
    "Microsoft.MicrosoftJournal",
    "Microsoft.SecHealthUI",
    "MicrosoftCorporationII.QuickAssist",
    "MicrosoftWindows.",
    "Microsoft.Windows.",
    "Microsoft.AAD.",
    "Microsoft.Advertising.",
    "Microsoft.AccountsControl",
    "Microsoft.AsyncTextService",
    "Microsoft.CredDialogHost",
    "Microsoft.ECApp",
    "Microsoft.LockApp",
    "Microsoft.MicrosoftEdgeDevToolsClient",
    "Microsoft.PPIProjection",
    "Microsoft.Win32WebViewHost",
    "Microsoft.XboxGameCallableUI",
    "NcsiUwpApp",
    "Windows.CBSPreview",
    "windows.immersivecontrolpanel",
    "Windows.PrintDialog",
    "InputApp",
    "RealtimeBoard.RealtimeBoard",
    "SpotifyAB.SpotifyMusic",
    "CAF9E577.Plex",
    "Disney.37853FC22B2CE",
    "AmazonVideo.PrimeVideo",
    "Netflix",
    "AppleInc.AppleTV",
    "AppleInc.AppleMusic",
    "AppleInc.AppleDevices",
    "AppleInc.iCloud",
    "Clipchamp.Clipchamp",
    "FACEBOOK.FACEBOOK",
    "Facebook.Instagram",
    "BytedancePte.Ltd.TikTok",
    "5319275A.WhatsAppDesktop",
    "XINGAG.XING",
    "Telegram",
    "9E2F88E3.Twitter",
    "TuneIn.TuneInRadio",
    "ShazamEntertainment",
    "DolbyLaboratories.DolbyAccess",
    "Duolingo",
    "AdobeSystemsIncorporated.",
    "Canonical.",
    "TheDebianProject.",
    "46932SUSE.",
    "KaliLinux.",
];

/// Check if a package name matches any known non-game prefix.
fn is_known_non_game(package_name: &str) -> bool {
    NON_GAME_PREFIXES
        .iter()
        .any(|prefix| package_name.starts_with(prefix))
}

// ---------------------------------------------------------------------------
// Tasks 5 & 6: Extract metadata + Assemble DetectedGame
// ---------------------------------------------------------------------------

/// Build the shell launch URL for a UWP/Xbox game.
///
/// Format: `shell:AppsFolder\{PackageFamilyName}!{AppId}`
fn build_launch_url(package_family_name: &str, app_id: &str) -> String {
    format!("shell:AppsFolder\\{package_family_name}!{app_id}")
}

/// Resolve the best display name for a package.
///
/// Priority:
/// 1. DisplayName from AppxManifest.xml (if not a resource reference)
/// 2. The package Name field, cleaned up (remove publisher prefix, replace dots)
fn resolve_display_name(
    manifest_display_name: Option<&str>,
    package_name: &str,
) -> String {
    if let Some(name) = manifest_display_name {
        if !name.is_empty() {
            return name.to_string();
        }
    }

    clean_package_name(package_name)
}

/// Clean a raw package name into a human-readable display name.
///
/// Removes the first dot-separated segment if it looks like a publisher name
/// (starts with uppercase, is purely alphanumeric), then joins remaining
/// segments with spaces.
fn clean_package_name(name: &str) -> String {
    let segments: Vec<&str> = name.split('.').collect();
    if segments.len() <= 1 {
        return name.to_string();
    }

    // Skip leading publisher-like segments (e.g. "BethesdaSoftworks", "343Industries")
    let skip_count = segments
        .iter()
        .take_while(|seg| {
            seg.chars().next().map_or(false, |c| c.is_uppercase())
                && seg.chars().all(|c| c.is_alphanumeric())
                && seg.len() > 2
        })
        .count();

    // Keep at least one segment
    let start = skip_count.min(segments.len() - 1);
    let cleaned = segments[start..].join(" ");

    if cleaned.is_empty() {
        name.replace('.', " ")
    } else {
        cleaned
    }
}

// ---------------------------------------------------------------------------
// Task 7: Edge case handling (sandboxed paths, encrypted folders, resources)
// ---------------------------------------------------------------------------

/// Check if a package install location is accessible.
///
/// Some Microsoft Store games use WindowsApps paths that are sandboxed
/// or encrypted. We attempt to read the manifest as a proxy for accessibility.
fn is_install_location_accessible(install_location: &Path) -> bool {
    if !install_location.is_dir() {
        return false;
    }

    let manifest = install_location.join("AppxManifest.xml");
    manifest.is_file()
}

// ---------------------------------------------------------------------------
// Scan pipeline
// ---------------------------------------------------------------------------

impl XboxScanner {
    pub fn scan(&self) -> Result<Vec<DetectedGame>, SourceError> {
        let json_output = match &self.mock_powershell_output {
            Some(mock) => mock.clone(),
            None => run_get_appx_package()?,
        };

        let entries = parse_appx_json(&json_output)?;
        let mut games = Vec::new();

        for entry in &entries {
            // Skip framework packages that slipped through
            if entry.is_framework.unwrap_or(false) {
                continue;
            }

            let package_name = match &entry.name {
                Some(n) if !n.is_empty() => n.as_str(),
                _ => continue,
            };

            let package_family_name = match &entry.package_family_name {
                Some(pfn) if !pfn.is_empty() => pfn.as_str(),
                _ => continue,
            };

            let install_location = match &entry.install_location {
                Some(loc) if !loc.is_empty() => PathBuf::from(loc),
                _ => continue,
            };

            // Task 4: exclude known non-game packages
            if is_known_non_game(package_name) {
                continue;
            }

            // Task 7: check accessibility
            if !is_install_location_accessible(&install_location) {
                log::debug!(
                    "skipping Xbox/MS Store package {}: install location inaccessible: {}",
                    package_name,
                    install_location.display()
                );
                continue;
            }

            // Task 3: read manifest and check if it's a game
            let manifest_info = match read_manifest_info(&install_location) {
                Some(info) => info,
                None => {
                    log::debug!(
                        "skipping Xbox/MS Store package {}: could not read manifest",
                        package_name
                    );
                    continue;
                }
            };

            if !manifest_info.is_game {
                continue;
            }

            // Task 5: extract metadata
            let display_name = resolve_display_name(
                manifest_info.display_name.as_deref(),
                package_name,
            );

            // Task 6: assemble DetectedGame
            let launch_url = build_launch_url(package_family_name, &manifest_info.app_id);

            games.push(DetectedGame {
                name: display_name,
                source: GameSourceType::Xbox,
                source_id: Some(package_family_name.to_string()),
                source_hint: None,
                folder_path: Some(install_location),
                exe_path: None,
                exe_name: None,
                launch_url: Some(launch_url),
                potential_exe_names: None,
            });
        }

        Ok(games)
    }
}

// ---------------------------------------------------------------------------
// GameSource trait — always available on Windows 10/11
// ---------------------------------------------------------------------------

impl GameSource for XboxScanner {
    fn id(&self) -> &str {
        "xbox"
    }

    fn display_name(&self) -> &str {
        "Xbox / Microsoft Store"
    }

    /// Xbox/MS Store is always available on Windows 10/11 since
    /// Get-AppxPackage is a built-in PowerShell cmdlet.
    fn is_available(&self) -> bool {
        is_windows_10_or_later()
    }

    fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError> {
        self.scan()
    }

    fn default_paths(&self) -> Vec<PathBuf> {
        vec![PathBuf::from(r"C:\Program Files\WindowsApps")]
    }

    fn set_path_override(&mut self, _path: Option<PathBuf>) {
        // Xbox scanner doesn't use path-based resolution;
        // it relies on PowerShell enumeration.
    }

    fn resolved_path(&self) -> Option<PathBuf> {
        let default = PathBuf::from(r"C:\Program Files\WindowsApps");
        if default.exists() {
            Some(default)
        } else {
            None
        }
    }
}

#[cfg(target_os = "windows")]
fn is_windows_10_or_later() -> bool {
    true
}

#[cfg(not(target_os = "windows"))]
fn is_windows_10_or_later() -> bool {
    false
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // -- Helper: create a mock AppxManifest.xml --

    fn create_game_manifest(dir: &Path, app_id: &str, display_name: &str) {
        let xml = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<Package>
  <Identity Name="TestPublisher.TestGame" />
  <Properties>
    <DisplayName>{display_name}</DisplayName>
  </Properties>
  <Applications>
    <Application Id="{app_id}" Executable="game.exe">
      <Extensions>
        <Extension Category="windows.protocol">
          <Protocol Name="ms-xbl-gamertag" />
        </Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>"#
        );
        fs::write(dir.join("AppxManifest.xml"), xml).unwrap();
    }

    fn create_non_game_manifest(dir: &Path, app_id: &str, display_name: &str) {
        let xml = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<Package>
  <Identity Name="Microsoft.SomeApp" />
  <Properties>
    <DisplayName>{display_name}</DisplayName>
  </Properties>
  <Applications>
    <Application Id="{app_id}" Executable="app.exe">
    </Application>
  </Applications>
</Package>"#
        );
        fs::write(dir.join("AppxManifest.xml"), xml).unwrap();
    }

    fn create_xbox_live_manifest(dir: &Path, app_id: &str, display_name: &str) {
        let xml = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<Package>
  <Identity Name="Publisher.GameTitle" />
  <Properties>
    <DisplayName>{display_name}</DisplayName>
  </Properties>
  <Applications>
    <Application Id="{app_id}" Executable="game.exe">
      <Extensions>
        <uap:Extension Category="xbox.live" />
      </Extensions>
    </Application>
  </Applications>
</Package>"#
        );
        fs::write(dir.join("AppxManifest.xml"), xml).unwrap();
    }

    fn create_resource_ref_manifest(dir: &Path, app_id: &str) {
        let xml = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<Package>
  <Identity Name="Publisher.GameWithResource" />
  <Properties>
    <DisplayName>ms-resource:AppDisplayName</DisplayName>
  </Properties>
  <Applications>
    <Application Id="{app_id}" Executable="game.exe">
      <Extensions>
        <uap:Extension Category="xbox.live" />
      </Extensions>
    </Application>
  </Applications>
</Package>"#
        );
        fs::write(dir.join("AppxManifest.xml"), xml).unwrap();
    }

    fn make_appx_json(entries: &[(&str, &str, &str, bool)]) -> String {
        let items: Vec<String> = entries
            .iter()
            .map(|(name, pfn, install_loc, is_framework)| {
                let loc_escaped = install_loc.replace('\\', "\\\\");
                format!(
                    r#"{{"Name":"{name}","PackageFamilyName":"{pfn}","InstallLocation":"{loc_escaped}","IsFramework":{is_framework}}}"#
                )
            })
            .collect();

        if items.len() == 1 {
            items[0].clone()
        } else {
            format!("[{}]", items.join(","))
        }
    }

    // -- Task 1: PowerShell output parsing --

    #[test]
    fn parse_empty_json() {
        let entries = parse_appx_json("").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn parse_null_json() {
        let entries = parse_appx_json("null").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn parse_single_object_json() {
        let json = r#"{"Name":"TestGame","PackageFamilyName":"TestPFN_abc","InstallLocation":"C:\\test","IsFramework":false}"#;
        let entries = parse_appx_json(json).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name.as_deref(), Some("TestGame"));
        assert_eq!(entries[0].package_family_name.as_deref(), Some("TestPFN_abc"));
    }

    #[test]
    fn parse_array_json() {
        let json = r#"[{"Name":"A","PackageFamilyName":"A_pfn","InstallLocation":"C:\\a","IsFramework":false},{"Name":"B","PackageFamilyName":"B_pfn","InstallLocation":"C:\\b","IsFramework":true}]"#;
        let entries = parse_appx_json(json).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name.as_deref(), Some("A"));
        assert_eq!(entries[1].is_framework, Some(true));
    }

    #[test]
    fn parse_invalid_json_returns_error() {
        let result = parse_appx_json("NOT JSON");
        assert!(result.is_err());
    }

    // -- Task 3: Manifest parsing --

    #[test]
    fn extract_application_id_from_xml() {
        let xml = r#"<Application Id="App" Executable="game.exe">"#;
        assert_eq!(extract_application_id(xml), Some("App".to_string()));
    }

    #[test]
    fn extract_application_id_custom() {
        let xml = r#"<Application Id="GameLauncher" Executable="start.exe">"#;
        assert_eq!(
            extract_application_id(xml),
            Some("GameLauncher".to_string())
        );
    }

    #[test]
    fn extract_application_id_none_when_missing() {
        let xml = r#"<Package><Properties></Properties></Package>"#;
        assert!(extract_application_id(xml).is_none());
    }

    #[test]
    fn extract_display_name_from_xml() {
        let xml = r#"<DisplayName>Halo Infinite</DisplayName>"#;
        assert_eq!(
            extract_display_name(xml),
            Some("Halo Infinite".to_string())
        );
    }

    #[test]
    fn extract_display_name_none_for_resource_ref() {
        let xml = r#"<DisplayName>ms-resource:AppDisplayName</DisplayName>"#;
        assert!(extract_display_name(xml).is_none());
    }

    #[test]
    fn extract_display_name_none_for_at_resource_ref() {
        let xml = r#"<DisplayName>@{Microsoft.Game_1.0_x64__abc/resources.pri?ms-resource://Microsoft.Game/Resources/AppName}</DisplayName>"#;
        assert!(extract_display_name(xml).is_none());
    }

    #[test]
    fn extract_display_name_none_when_missing() {
        let xml = r#"<Package><Properties></Properties></Package>"#;
        assert!(extract_display_name(xml).is_none());
    }

    // -- Task 3: Game detection heuristics --

    #[test]
    fn content_indicates_game_xbox_live() {
        let xml = r#"<Extension Category="xbox.live" />"#;
        assert!(content_indicates_game(xml));
    }

    #[test]
    fn content_indicates_game_xboxlive() {
        let xml = r#"<Capability Name="xboxLive" />"#;
        assert!(content_indicates_game(xml));
    }

    #[test]
    fn content_indicates_game_windows_gaming() {
        let xml = r#"<Extension Category="windows.gaming.preview" />"#;
        assert!(content_indicates_game(xml));
    }

    #[test]
    fn content_indicates_game_ms_xbl_protocol() {
        let xml = r#"<Protocol Name="ms-xbl-gamertag" />"#;
        assert!(content_indicates_game(xml));
    }

    #[test]
    fn content_indicates_game_ms_xbox_protocol() {
        let xml = r#"<Protocol Name="ms-xbox-gameinfo" />"#;
        assert!(content_indicates_game(xml));
    }

    #[test]
    fn content_indicates_game_category() {
        let xml = r#"<Application Category="windows.game" />"#;
        assert!(content_indicates_game(xml));
    }

    #[test]
    fn content_does_not_indicate_game_for_plain_app() {
        let xml = r#"<Package><Application Id="App" Executable="app.exe"></Application></Package>"#;
        assert!(!content_indicates_game(xml));
    }

    // -- Task 4: Non-game exclusion --

    #[test]
    fn known_non_game_excludes_system_apps() {
        assert!(is_known_non_game("Microsoft.WindowsStore"));
        assert!(is_known_non_game("Microsoft.WindowsCalculator"));
        assert!(is_known_non_game("Microsoft.BingWeather"));
        assert!(is_known_non_game("Microsoft.XboxGamingOverlay"));
        assert!(is_known_non_game("Microsoft.GamingServices"));
        assert!(is_known_non_game("Microsoft.Photos"));
        assert!(is_known_non_game("Microsoft.WindowsTerminal"));
    }

    #[test]
    fn known_non_game_excludes_media_apps() {
        assert!(is_known_non_game("SpotifyAB.SpotifyMusic"));
        assert!(is_known_non_game("Netflix"));
        assert!(is_known_non_game("Disney.37853FC22B2CE"));
    }

    #[test]
    fn known_non_game_allows_actual_games() {
        assert!(!is_known_non_game("BethesdaSoftworks.SkyrimSE"));
        assert!(!is_known_non_game("343Industries.HaloInfinite"));
        assert!(!is_known_non_game("Playground.ForzaHorizon5"));
    }

    // -- Task 5: Display name resolution --

    #[test]
    fn resolve_display_name_prefers_manifest() {
        let name = resolve_display_name(Some("Halo Infinite"), "343Industries.HaloInfinite");
        assert_eq!(name, "Halo Infinite");
    }

    #[test]
    fn resolve_display_name_falls_back_to_cleaned_package_name() {
        let name = resolve_display_name(None, "BethesdaSoftworks.SkyrimSE");
        assert!(!name.is_empty());
        assert!(!name.contains("BethesdaSoftworks"));
    }

    #[test]
    fn resolve_display_name_empty_manifest_falls_back() {
        let name = resolve_display_name(Some(""), "Publisher.GameName");
        assert!(!name.is_empty());
    }

    // -- Task 6: Launch URL --

    #[test]
    fn build_launch_url_format() {
        let url = build_launch_url("343Industries.HaloInfinite_8wekyb3d8bbwe", "App");
        assert_eq!(
            url,
            "shell:AppsFolder\\343Industries.HaloInfinite_8wekyb3d8bbwe!App"
        );
    }

    #[test]
    fn build_launch_url_custom_app_id() {
        let url = build_launch_url("Publisher.Game_abc123", "GameLauncher");
        assert_eq!(
            url,
            "shell:AppsFolder\\Publisher.Game_abc123!GameLauncher"
        );
    }

    // -- Task 7: Accessibility check --

    #[test]
    fn accessible_when_manifest_exists() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("GameDir");
        fs::create_dir_all(&dir).unwrap();
        create_game_manifest(&dir, "App", "Test Game");

        assert!(is_install_location_accessible(&dir));
    }

    #[test]
    fn inaccessible_when_no_manifest() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("GameDir");
        fs::create_dir_all(&dir).unwrap();

        assert!(!is_install_location_accessible(&dir));
    }

    #[test]
    fn inaccessible_when_dir_missing() {
        let path = PathBuf::from("C:\\nonexistent_xbox_test_dir_xyz");
        assert!(!is_install_location_accessible(&path));
    }

    // -- Manifest info reading --

    #[test]
    fn read_manifest_info_for_game() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("HaloInfinite");
        fs::create_dir_all(&dir).unwrap();
        create_game_manifest(&dir, "App", "Halo Infinite");

        let info = read_manifest_info(&dir).unwrap();
        assert_eq!(info.app_id, "App");
        assert_eq!(info.display_name, Some("Halo Infinite".to_string()));
        assert!(info.is_game);
    }

    #[test]
    fn read_manifest_info_for_non_game() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("Calculator");
        fs::create_dir_all(&dir).unwrap();
        create_non_game_manifest(&dir, "App", "Calculator");

        let info = read_manifest_info(&dir).unwrap();
        assert_eq!(info.app_id, "App");
        assert!(!info.is_game);
    }

    #[test]
    fn read_manifest_info_xbox_live_game() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("XboxGame");
        fs::create_dir_all(&dir).unwrap();
        create_xbox_live_manifest(&dir, "GameApp", "Xbox Game");

        let info = read_manifest_info(&dir).unwrap();
        assert_eq!(info.app_id, "GameApp");
        assert_eq!(info.display_name, Some("Xbox Game".to_string()));
        assert!(info.is_game);
    }

    #[test]
    fn read_manifest_info_resource_ref_display_name() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("ResourceGame");
        fs::create_dir_all(&dir).unwrap();
        create_resource_ref_manifest(&dir, "App");

        let info = read_manifest_info(&dir).unwrap();
        assert_eq!(info.app_id, "App");
        assert!(info.display_name.is_none());
        assert!(info.is_game);
    }

    #[test]
    fn read_manifest_info_none_when_no_manifest() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("NoManifest");
        fs::create_dir_all(&dir).unwrap();

        assert!(read_manifest_info(&dir).is_none());
    }

    // -- Full scan pipeline with mock output --

    #[test]
    fn scan_detects_game_from_mock_output() {
        let tmp = TempDir::new().unwrap();
        let game_dir = tmp.path().join("HaloInfinite");
        fs::create_dir_all(&game_dir).unwrap();
        create_game_manifest(&game_dir, "App", "Halo Infinite");

        let json = make_appx_json(&[(
            "343Industries.HaloInfinite",
            "343Industries.HaloInfinite_8wekyb3d8bbwe",
            &game_dir.to_string_lossy(),
            false,
        )]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 1);

        let game = &games[0];
        assert_eq!(game.name, "Halo Infinite");
        assert_eq!(game.source, GameSourceType::Xbox);
        assert_eq!(
            game.source_id,
            Some("343Industries.HaloInfinite_8wekyb3d8bbwe".to_string())
        );
        assert_eq!(
            game.launch_url,
            Some("shell:AppsFolder\\343Industries.HaloInfinite_8wekyb3d8bbwe!App".to_string())
        );
        assert_eq!(game.folder_path, Some(game_dir));
    }

    #[test]
    fn scan_skips_non_game_packages() {
        let tmp = TempDir::new().unwrap();
        let calc_dir = tmp.path().join("Calculator");
        fs::create_dir_all(&calc_dir).unwrap();
        create_non_game_manifest(&calc_dir, "App", "Calculator");

        let json = make_appx_json(&[(
            "Microsoft.WindowsCalculator",
            "Microsoft.WindowsCalculator_8wekyb3d8bbwe",
            &calc_dir.to_string_lossy(),
            false,
        )]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scan_skips_framework_packages() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("Framework");
        fs::create_dir_all(&dir).unwrap();
        create_game_manifest(&dir, "App", "Framework");

        let json = make_appx_json(&[(
            "SomeFramework",
            "SomeFramework_pfn",
            &dir.to_string_lossy(),
            true,
        )]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scan_skips_packages_without_game_manifest() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("RegularApp");
        fs::create_dir_all(&dir).unwrap();
        create_non_game_manifest(&dir, "App", "Regular App");

        let json = make_appx_json(&[(
            "SomePublisher.RegularApp",
            "SomePublisher.RegularApp_pfn",
            &dir.to_string_lossy(),
            false,
        )]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scan_skips_inaccessible_install_locations() {
        let json = make_appx_json(&[(
            "Publisher.Game",
            "Publisher.Game_pfn",
            "C:\\nonexistent_xbox_test_xyz_12345",
            false,
        )]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scan_multiple_games() {
        let tmp = TempDir::new().unwrap();

        let halo_dir = tmp.path().join("Halo");
        fs::create_dir_all(&halo_dir).unwrap();
        create_game_manifest(&halo_dir, "App", "Halo Infinite");

        let forza_dir = tmp.path().join("Forza");
        fs::create_dir_all(&forza_dir).unwrap();
        create_xbox_live_manifest(&forza_dir, "ForzaApp", "Forza Horizon 5");

        let json = make_appx_json(&[
            (
                "343Industries.HaloInfinite",
                "343Industries.HaloInfinite_pfn",
                &halo_dir.to_string_lossy(),
                false,
            ),
            (
                "Playground.ForzaHorizon5",
                "Playground.ForzaHorizon5_pfn",
                &forza_dir.to_string_lossy(),
                false,
            ),
        ]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 2);

        let names: Vec<&str> = games.iter().map(|g| g.name.as_str()).collect();
        assert!(names.contains(&"Halo Infinite"));
        assert!(names.contains(&"Forza Horizon 5"));

        for game in &games {
            assert_eq!(game.source, GameSourceType::Xbox);
            assert!(game.source_id.is_some());
            assert!(game.launch_url.is_some());
            assert!(game.folder_path.is_some());
        }
    }

    #[test]
    fn scan_uses_package_name_when_display_name_is_resource_ref() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("ResourceGame");
        fs::create_dir_all(&dir).unwrap();
        create_resource_ref_manifest(&dir, "App");

        let json = make_appx_json(&[(
            "Publisher.AwesomeGame",
            "Publisher.AwesomeGame_pfn",
            &dir.to_string_lossy(),
            false,
        )]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 1);
        assert!(!games[0].name.is_empty());
        assert!(!games[0].name.contains("ms-resource"));
    }

    #[test]
    fn scan_empty_output() {
        let scanner = XboxScanner::with_mock_output("".to_string());
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scan_null_output() {
        let scanner = XboxScanner::with_mock_output("null".to_string());
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scan_mixed_games_and_non_games() {
        let tmp = TempDir::new().unwrap();

        let game_dir = tmp.path().join("RealGame");
        fs::create_dir_all(&game_dir).unwrap();
        create_game_manifest(&game_dir, "App", "Real Game");

        let calc_dir = tmp.path().join("Calc");
        fs::create_dir_all(&calc_dir).unwrap();
        create_non_game_manifest(&calc_dir, "App", "Calculator");

        let json = make_appx_json(&[
            (
                "Publisher.RealGame",
                "Publisher.RealGame_pfn",
                &game_dir.to_string_lossy(),
                false,
            ),
            (
                "Microsoft.WindowsCalculator",
                "Microsoft.WindowsCalculator_pfn",
                &calc_dir.to_string_lossy(),
                false,
            ),
        ]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].name, "Real Game");
    }

    // -- GameSource trait --

    #[test]
    fn trait_id_and_display_name() {
        let scanner = XboxScanner::new();
        assert_eq!(scanner.id(), "xbox");
        assert_eq!(scanner.display_name(), "Xbox / Microsoft Store");
    }

    #[test]
    fn trait_default_paths() {
        let scanner = XboxScanner::new();
        let defaults = scanner.default_paths();
        assert_eq!(defaults.len(), 1);
        assert!(defaults[0].to_string_lossy().contains("WindowsApps"));
    }

    // -- Serialization --

    #[test]
    fn detected_game_serializes_correctly() {
        let game = DetectedGame {
            name: "Halo Infinite".into(),
            source: GameSourceType::Xbox,
            source_id: Some("343Industries.HaloInfinite_8wekyb3d8bbwe".into()),
            source_hint: None,
            folder_path: Some(PathBuf::from(r"C:\Program Files\WindowsApps\HaloInfinite")),
            exe_path: None,
            exe_name: None,
            launch_url: Some(
                "shell:AppsFolder\\343Industries.HaloInfinite_8wekyb3d8bbwe!App".into(),
            ),
            potential_exe_names: None,
        };
        let json = serde_json::to_string(&game).unwrap();
        assert!(json.contains("\"sourceId\""));
        assert!(json.contains("343Industries.HaloInfinite_8wekyb3d8bbwe"));
        assert!(json.contains("shell:AppsFolder"));
        assert!(json.contains("\"xbox\""));
    }

    // -- Full pipeline --

    #[test]
    fn full_pipeline_end_to_end() {
        let tmp = TempDir::new().unwrap();

        let halo_dir = tmp.path().join("Halo");
        fs::create_dir_all(&halo_dir).unwrap();
        create_game_manifest(&halo_dir, "App", "Halo Infinite");

        let forza_dir = tmp.path().join("Forza");
        fs::create_dir_all(&forza_dir).unwrap();
        create_xbox_live_manifest(&forza_dir, "ForzaApp", "Forza Horizon 5");

        let calc_dir = tmp.path().join("Calc");
        fs::create_dir_all(&calc_dir).unwrap();
        create_non_game_manifest(&calc_dir, "App", "Calculator");

        let json = make_appx_json(&[
            (
                "343Industries.HaloInfinite",
                "343Industries.HaloInfinite_8wekyb3d8bbwe",
                &halo_dir.to_string_lossy(),
                false,
            ),
            (
                "Playground.ForzaHorizon5",
                "Playground.ForzaHorizon5_pfn",
                &forza_dir.to_string_lossy(),
                false,
            ),
            (
                "Microsoft.WindowsCalculator",
                "Microsoft.WindowsCalculator_pfn",
                &calc_dir.to_string_lossy(),
                false,
            ),
            (
                "SomeFramework",
                "SomeFramework_pfn",
                &tmp.path().to_string_lossy(),
                true,
            ),
            (
                "Publisher.MissingGame",
                "Publisher.MissingGame_pfn",
                "C:\\nonexistent_xbox_test_xyz_12345",
                false,
            ),
        ]);

        let scanner = XboxScanner::with_mock_output(json);
        let games = scanner.detect_games().unwrap();
        assert_eq!(games.len(), 2);

        for game in &games {
            assert_eq!(game.source, GameSourceType::Xbox);
            assert!(game.source_id.is_some());
            assert!(game.launch_url.is_some());
            assert!(game.folder_path.is_some());

            let launch_url = game.launch_url.as_ref().unwrap();
            assert!(launch_url.starts_with("shell:AppsFolder\\"));
            assert!(launch_url.contains('!'));
        }

        let halo = games.iter().find(|g| g.name == "Halo Infinite").unwrap();
        assert_eq!(
            halo.source_id,
            Some("343Industries.HaloInfinite_8wekyb3d8bbwe".to_string())
        );
        assert_eq!(
            halo.launch_url,
            Some("shell:AppsFolder\\343Industries.HaloInfinite_8wekyb3d8bbwe!App".to_string())
        );

        let forza = games.iter().find(|g| g.name == "Forza Horizon 5").unwrap();
        assert_eq!(
            forza.source_id,
            Some("Playground.ForzaHorizon5_pfn".to_string())
        );
        assert_eq!(
            forza.launch_url,
            Some("shell:AppsFolder\\Playground.ForzaHorizon5_pfn!ForzaApp".to_string())
        );
    }

    // -- Non-Windows stubs --

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn run_get_appx_package_returns_empty_on_non_windows() {
        let output = run_get_appx_package().unwrap();
        assert_eq!(output, "[]");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn is_available_false_on_non_windows() {
        let scanner = XboxScanner::new();
        assert!(!scanner.is_available());
    }
}
