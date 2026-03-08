use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::error::CommandError;

// ── System Process Blocklist ──────────────────────────────────────
// Filtered from `list_running_processes` results. Generous blocklist
// because the user picks from this list during a time-sensitive
// game-launch moment — fewer irrelevant entries means faster selection.
const SYSTEM_PROCESS_BLOCKLIST: &[&str] = &[
    // Windows core
    "svchost.exe",
    "csrss.exe",
    "smss.exe",
    "wininit.exe",
    "winlogon.exe",
    "lsass.exe",
    "services.exe",
    "dwm.exe",
    "fontdrvhost.exe",
    "sihost.exe",
    "taskhostw.exe",
    "explorer.exe",
    "ctfmon.exe",
    "conhost.exe",
    "dllhost.exe",
    "spoolsv.exe",
    "wudfhost.exe",
    "dashost.exe",
    "lsaiso.exe",
    "memory compression",
    "registry",
    "system",
    "idle",
    // Windows runtime / UWP
    "runtimebroker.exe",
    "applicationframehost.exe",
    "systemsettings.exe",
    "shellexperiencehost.exe",
    "startmenuexperiencehost.exe",
    "textinputhost.exe",
    "windowsinternal.composableshell.experiences.textinput.inputapp.exe",
    "lockapp.exe",
    "searchhost.exe",
    "searchindexer.exe",
    "searchprotocolhost.exe",
    "searchfilterhost.exe",
    "widgetservice.exe",
    "widgets.exe",
    "phoneexperiencehost.exe",
    // Windows security / defender
    "securityhealthservice.exe",
    "securityhealthsystray.exe",
    "msmpeng.exe",
    "nissrv.exe",
    "mpcmdrun.exe",
    "sgrmbroker.exe",
    "smartscreen.exe",
    // Windows networking / services
    "lsm.exe",
    "wlanext.exe",
    "wlms.exe",
    "audiodg.exe",
    "audioses.exe",
    // Windows management
    "tasklist.exe",
    "taskmgr.exe",
    "wmic.exe",
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "wmiprvse.exe",
    "msiexec.exe",
    "trustedinstaller.exe",
    "tiworker.exe",
    "musnotification.exe",
    "musnotifyicon.exe",
    // Graphics / display drivers
    "igfxem.exe",
    "igfxhk.exe",
    "igfxtray.exe",
    "nvcontainer.exe",
    "nvdisplay.container.exe",
    "nvspcaps64.exe",
    "nvoawrappercache.exe",
    "atiesrxx.exe",
    "atieclxx.exe",
    "amdrsserv.exe",
    "amddvr.exe",
    "radarsilence.exe",
    // Common background / tray apps
    "onedrive.exe",
    "msedge.exe",
    "msedgewebview2.exe",
    "gamebarpresencewriter.exe",
    "gamebar.exe",
    "gamebarftserver.exe",
    "gameinputsvc.exe",
    "xbox.tcui.exe",
    "xboxgamebarsvc.exe",
    // Tauri / this app
    "nexus.exe",
];

// ── Structs ───────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub session_id: String,
    pub game_id: String,
    pub status: String,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningProcess {
    pub exe_name: String,
    pub pid: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunningProcessInfo {
    pub exe_name: String,
    pub pid: u32,
    pub window_title: Option<String>,
}

// ── Launch Commands ───────────────────────────────────────────────

#[tauri::command(async)]
pub fn launch_game(
    game_id: String,
    protocol: String,
    target: String,
) -> Result<LaunchResult, CommandError> {
    match protocol.as_str() {
        "direct_exe" => launch_direct_exe(&game_id, &target),
        "steam_url" | "epic_url" | "gog_url" | "ubisoft_url" | "battlenet_url" | "xbox_shell" => {
            launch_url(&game_id, &target)
        }
        _ => Err(CommandError::Unknown(format!(
            "unsupported protocol: {protocol}"
        ))),
    }
}

fn launch_direct_exe(game_id: &str, exe_path: &str) -> Result<LaunchResult, CommandError> {
    if exe_path.is_empty() {
        return Ok(LaunchResult {
            session_id: String::new(),
            game_id: game_id.to_string(),
            status: "failed".to_string(),
            pid: None,
            error: Some("No executable path configured".to_string()),
        });
    }

    let path = std::path::Path::new(exe_path);
    let working_dir = path.parent();

    // Use cmd /C start to launch the exe — this is the most reliable way on
    // Windows, handling UAC, paths with spaces, and detaching from the parent.
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "start", "", exe_path]);
    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW — hide the transient cmd window

    match cmd.spawn() {
        Ok(_child) => Ok(LaunchResult {
            session_id: uuid::Uuid::new_v4().to_string(),
            game_id: game_id.to_string(),
            status: "launched".to_string(),
            pid: None, // cmd exits immediately; tracking uses folder/exe name polling
            error: None,
        }),
        Err(e) => Ok(LaunchResult {
            session_id: String::new(),
            game_id: game_id.to_string(),
            status: "failed".to_string(),
            pid: None,
            error: Some(format!("Failed to launch: {e}")),
        }),
    }
}

fn launch_url(game_id: &str, url: &str) -> Result<LaunchResult, CommandError> {
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "start", "", url]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    match cmd.spawn() {
        Ok(_) => Ok(LaunchResult {
            session_id: uuid::Uuid::new_v4().to_string(),
            game_id: game_id.to_string(),
            status: "launched".to_string(),
            pid: None,
            error: None,
        }),
        Err(e) => Ok(LaunchResult {
            session_id: String::new(),
            game_id: game_id.to_string(),
            status: "failed".to_string(),
            pid: None,
            error: Some(format!("Failed to open URL: {e}")),
        }),
    }
}

// ── Process Management Commands ───────────────────────────────────

#[tauri::command(async)]
pub fn stop_game(pid: u32) -> Result<(), CommandError> {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .creation_flags(0x08000000)
            .spawn();
    }
    Ok(())
}

#[tauri::command(async)]
pub fn check_process_running(pid: Option<u32>, exe_name: Option<String>) -> Result<bool, CommandError> {
    if let Some(pid) = pid {
        return Ok(is_pid_alive(pid));
    }

    if let Some(ref name) = exe_name {
        return Ok(is_exe_running(name));
    }

    Ok(false)
}

fn is_pid_alive(pid: u32) -> bool {
    let output = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .creation_flags(0x08000000)
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.contains(&pid.to_string())
        }
        Err(_) => false,
    }
}

fn is_exe_running(exe_name: &str) -> bool {
    let output = Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {exe_name}"), "/NH", "/FO", "CSV"])
        .creation_flags(0x08000000)
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let lower = stdout.to_lowercase();
            lower.contains(&exe_name.to_lowercase())
        }
        Err(_) => false,
    }
}

/// Find a running process whose executable path is inside the given folder.
/// Uses WMIC to get the full executable path of all running processes and
/// checks if any reside within `folder_path`. Returns the first match.
#[tauri::command(async)]
pub fn find_game_process(folder_path: String) -> Result<Option<RunningProcess>, CommandError> {
    if folder_path.is_empty() {
        return Ok(None);
    }

    let output = Command::new("wmic")
        .args(["process", "get", "ExecutablePath,Name,ProcessId", "/FORMAT:CSV"])
        .creation_flags(0x08000000)
        .output();

    let out = match output {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };

    let stdout = String::from_utf8_lossy(&out.stdout);
    let folder_lower = folder_path.to_lowercase().replace('/', "\\");

    for line in stdout.lines() {
        let cols: Vec<&str> = line.split(',').collect();
        if cols.len() < 4 {
            continue;
        }

        let exe_path = cols[1].trim().to_lowercase().replace('/', "\\");
        if exe_path.is_empty() {
            continue;
        }

        if exe_path.starts_with(&folder_lower) && exe_path.ends_with(".exe") {
            let name = cols[2].trim().to_string();
            if let Ok(pid) = cols[3].trim().parse::<u32>() {
                return Ok(Some(RunningProcess {
                    exe_name: name,
                    pid,
                }));
            }
        }
    }

    Ok(None)
}

// ── List Running Processes (Story 22.1) ───────────────────────────

/// Parse a single CSV field, handling double-quote escaping per RFC 4180.
fn parse_csv_field(input: &str) -> (&str, &str) {
    let s = input.trim_start();
    if s.starts_with('"') {
        let inner = &s[1..];
        let mut end = 0;
        let bytes = inner.as_bytes();
        while end < bytes.len() {
            if bytes[end] == b'"' {
                if end + 1 < bytes.len() && bytes[end + 1] == b'"' {
                    end += 2;
                    continue;
                }
                let value = &inner[..end];
                let rest = &inner[end + 1..];
                let rest = rest.strip_prefix(',').unwrap_or(rest);
                return (value, rest);
            }
            end += 1;
        }
        (inner, "")
    } else {
        match s.find(',') {
            Some(i) => (&s[..i], &s[i + 1..]),
            None => (s, ""),
        }
    }
}

/// Parse a full CSV line from `tasklist /V /FO CSV` into its fields.
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut remaining = line;
    while !remaining.is_empty() {
        let (field, rest) = parse_csv_field(remaining);
        fields.push(field.to_string());
        remaining = rest;
    }
    fields
}

/// Normalize a window title from tasklist output. Returns `None` for
/// titles that indicate no visible window ("N/A" or empty).
fn normalize_window_title(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "N/A" {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Check if an exe_name is in the system process blocklist (case-insensitive).
fn is_blocked(exe_name: &str) -> bool {
    let lower = exe_name.to_lowercase();
    SYSTEM_PROCESS_BLOCKLIST.contains(&lower.as_str())
}

/// Filter and deduplicate a parsed process list.
/// Accepts pre-parsed entries of (exe_name, pid, window_title) for testability.
/// Deduplicates by exe_name (case-insensitive), keeping the entry with the
/// highest PID (most recently spawned). Returns results sorted by PID
/// descending so the newest processes appear first.
pub(crate) fn filter_and_dedup_processes(
    entries: Vec<(String, u32, Option<String>)>,
    windowed_only: bool,
) -> Vec<RunningProcessInfo> {
    let mut best: HashMap<String, RunningProcessInfo> = HashMap::new();

    for (exe_name, pid, title) in entries {
        if is_blocked(&exe_name) {
            continue;
        }

        let window_title = title.as_deref().and_then(normalize_window_title);

        if windowed_only && window_title.is_none() {
            continue;
        }

        let key = exe_name.to_lowercase();
        best.entry(key)
            .and_modify(|existing| {
                if pid > existing.pid {
                    existing.exe_name = exe_name.clone();
                    existing.pid = pid;
                    existing.window_title = window_title.clone();
                }
            })
            .or_insert_with(|| RunningProcessInfo {
                exe_name,
                pid,
                window_title,
            });
    }

    let mut results: Vec<RunningProcessInfo> = best.into_values().collect();
    results.sort_by(|a, b| b.pid.cmp(&a.pid));
    results
}

/// Parse `tasklist /FO CSV` (non-verbose) output into (exe_name, pid) tuples.
/// Non-verbose format has 5 columns:
/// "Image Name","PID","Session Name","Session#","Mem Usage"
fn parse_tasklist_csv(stdout: &str) -> Vec<(String, u32, Option<String>)> {
    let mut entries = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let fields = parse_csv_line(line);

        if fields.first().map_or(false, |f| f == "Image Name") {
            continue;
        }

        if fields.len() < 2 {
            continue;
        }

        let exe_name = fields[0].clone();
        let pid: u32 = match fields[1].parse() {
            Ok(p) => p,
            Err(_) => continue,
        };

        entries.push((exe_name, pid, None));
    }

    entries
}

/// Fetch window titles for a set of PIDs using PowerShell's Get-Process.
/// Returns a map of PID -> window title for processes that have one.
fn fetch_window_titles(pids: &[u32]) -> HashMap<u32, String> {
    let mut titles = HashMap::new();
    if pids.is_empty() {
        return titles;
    }

    let pid_list: Vec<String> = pids.iter().map(|p| p.to_string()).collect();
    let script = format!(
        "Get-Process -Id {} -ErrorAction SilentlyContinue | \
         Where-Object {{ $_.MainWindowTitle -ne '' }} | \
         ForEach-Object {{ \"$($_.Id)`t$($_.MainWindowTitle)\" }}",
        pid_list.join(",")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x08000000)
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let line = line.trim();
            if let Some((pid_str, title)) = line.split_once('\t') {
                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                    let title = title.trim();
                    if !title.is_empty() {
                        titles.insert(pid, title.to_string());
                    }
                }
            }
        }
    }

    titles
}

/// Returns a filtered, deduplicated list of currently running processes.
/// When `windowed_only` is true, only processes with a visible window title
/// are included. Results are sorted alphabetically by exe_name.
///
/// Uses `tasklist /FO CSV` (fast, <1s) for the process list, then enriches
/// with window titles via `Get-Process` for the filtered subset.
#[tauri::command(async)]
pub fn list_running_processes(windowed_only: Option<bool>) -> Vec<RunningProcessInfo> {
    let windowed = windowed_only.unwrap_or(false);

    let output = Command::new("tasklist")
        .args(["/FO", "CSV"])
        .creation_flags(0x08000000)
        .output();

    let out = match output {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&out.stdout);
    let entries = parse_tasklist_csv(&stdout);
    let mut results = filter_and_dedup_processes(entries, false);

    let pids: Vec<u32> = results.iter().map(|p| p.pid).collect();
    let titles = fetch_window_titles(&pids);

    for proc in &mut results {
        if let Some(title) = titles.get(&proc.pid) {
            proc.window_title = Some(title.clone());
        }
    }

    if windowed {
        results.retain(|p| p.window_title.is_some());
    }

    results
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_entry(exe: &str, pid: u32, title: Option<&str>) -> (String, u32, Option<String>) {
        (exe.to_string(), pid, title.map(|t| t.to_string()))
    }

    #[test]
    fn blocklist_filters_system_processes() {
        let entries = vec![
            make_entry("svchost.exe", 100, None),
            make_entry("csrss.exe", 200, None),
            make_entry("MyGame.exe", 300, Some("My Game Window")),
        ];

        let result = filter_and_dedup_processes(entries, false);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].exe_name, "MyGame.exe");
    }

    #[test]
    fn blocklist_is_case_insensitive() {
        let entries = vec![
            make_entry("SVCHOST.EXE", 100, None),
            make_entry("Explorer.exe", 200, Some("Desktop")),
            make_entry("game.exe", 300, Some("Game")),
        ];

        let result = filter_and_dedup_processes(entries, false);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].exe_name, "game.exe");
    }

    #[test]
    fn dedup_keeps_highest_pid() {
        let entries = vec![
            make_entry("game.exe", 500, Some("Window A")),
            make_entry("game.exe", 200, Some("Window B")),
            make_entry("game.exe", 800, Some("Window C")),
        ];

        let result = filter_and_dedup_processes(entries, false);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pid, 800);
        assert_eq!(result[0].window_title, Some("Window C".to_string()));
    }

    #[test]
    fn dedup_is_case_insensitive() {
        let entries = vec![
            make_entry("Game.exe", 500, Some("Title A")),
            make_entry("game.exe", 200, Some("Title B")),
        ];

        let result = filter_and_dedup_processes(entries, false);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pid, 500);
    }

    #[test]
    fn windowed_only_filters_no_window() {
        let entries = vec![
            make_entry("background.exe", 100, None),
            make_entry("service.exe", 200, Some("N/A")),
            make_entry("empty.exe", 300, Some("")),
            make_entry("visible.exe", 400, Some("My Window")),
        ];

        let result = filter_and_dedup_processes(entries, true);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].exe_name, "visible.exe");
    }

    #[test]
    fn windowed_false_includes_all_non_blocked() {
        let entries = vec![
            make_entry("background.exe", 100, None),
            make_entry("service.exe", 200, Some("N/A")),
            make_entry("visible.exe", 400, Some("My Window")),
        ];

        let result = filter_and_dedup_processes(entries, false);
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn results_sorted_newest_first() {
        let entries = vec![
            make_entry("Zelda.exe", 100, Some("Zelda")),
            make_entry("Apex.exe", 200, Some("Apex")),
            make_entry("minecraft.exe", 300, Some("Minecraft")),
        ];

        let result = filter_and_dedup_processes(entries, false);
        assert_eq!(result[0].exe_name, "minecraft.exe");
        assert_eq!(result[0].pid, 300);
        assert_eq!(result[1].exe_name, "Apex.exe");
        assert_eq!(result[1].pid, 200);
        assert_eq!(result[2].exe_name, "Zelda.exe");
        assert_eq!(result[2].pid, 100);
    }

    #[test]
    fn empty_input_returns_empty() {
        let result = filter_and_dedup_processes(Vec::new(), false);
        assert!(result.is_empty());
    }

    #[test]
    fn window_title_na_normalized_to_none() {
        let entries = vec![make_entry("app.exe", 100, Some("N/A"))];
        let result = filter_and_dedup_processes(entries, false);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].window_title, None);
    }

    #[test]
    fn parse_csv_line_basic() {
        let line = r#""Image Name","PID","Session Name""#;
        let fields = parse_csv_line(line);
        assert_eq!(fields, vec!["Image Name", "PID", "Session Name"]);
    }

    #[test]
    fn parse_csv_line_with_embedded_comma() {
        let line = r#""notepad.exe","1234","Console","1","10,000 K","Running","USER","0:00:01","Untitled - Notepad""#;
        let fields = parse_csv_line(line);
        assert_eq!(fields.len(), 9);
        assert_eq!(fields[0], "notepad.exe");
        assert_eq!(fields[1], "1234");
        assert_eq!(fields[4], "10,000 K");
        assert_eq!(fields[8], "Untitled - Notepad");
    }

    #[test]
    fn parse_tasklist_csv_skips_header() {
        let csv = r#""Image Name","PID","Session Name","Session#","Mem Usage"
"notepad.exe","1234","Console","1","10,000 K"
"game.exe","5678","Console","1","50,000 K"
"#;
        let entries = parse_tasklist_csv(csv);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].0, "notepad.exe");
        assert_eq!(entries[0].1, 1234);
        assert_eq!(entries[0].2, None);
        assert_eq!(entries[1].0, "game.exe");
        assert_eq!(entries[1].1, 5678);
    }

    #[test]
    fn parse_tasklist_csv_skips_malformed_lines() {
        let csv = r#""short"
"valid.exe","999","Console","1","5,000 K"
"#;
        let entries = parse_tasklist_csv(csv);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, "valid.exe");
    }

    #[test]
    fn full_pipeline_integration() {
        let csv = r#""Image Name","PID","Session Name","Session#","Mem Usage"
"svchost.exe","100","Services","0","10,000 K"
"explorer.exe","200","Console","1","80,000 K"
"MyGame.exe","500","Console","1","200,000 K"
"MyGame.exe","300","Console","1","150,000 K"
"csrss.exe","50","Services","0","5,000 K"
"AnotherApp.exe","600","Console","1","30,000 K"
"#;
        let entries = parse_tasklist_csv(csv);
        let result = filter_and_dedup_processes(entries, false);

        assert_eq!(result.len(), 2);
        // Sorted by PID descending (newest first)
        assert_eq!(result[0].exe_name, "AnotherApp.exe");
        assert_eq!(result[0].pid, 600);
        assert_eq!(result[1].exe_name, "MyGame.exe");
        assert_eq!(result[1].pid, 500);
    }

    #[test]
    fn full_pipeline_windowed_only() {
        let entries = vec![
            make_entry("MyGame.exe", 300, Some("My Game")),
            make_entry("background.exe", 400, None),
        ];
        let result = filter_and_dedup_processes(entries, true);

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].exe_name, "MyGame.exe");
    }
}
