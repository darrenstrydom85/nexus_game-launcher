use serde::{Deserialize, Serialize};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::error::CommandError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub session_id: String,
    pub game_id: String,
    pub status: String,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningProcess {
    pub exe_name: String,
    pub pid: u32,
}

/// Find a running process whose executable path is inside the given folder.
/// Uses WMIC to get the full executable path of all running processes and
/// checks if any reside within `folder_path`. Returns the first match.
#[tauri::command]
pub fn find_game_process(folder_path: String) -> Result<Option<RunningProcess>, CommandError> {
    if folder_path.is_empty() {
        return Ok(None);
    }

    let output = Command::new("wmic")
        .args(["process", "get", "ExecutablePath,Name,ProcessId", "/FORMAT:CSV"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();

    let out = match output {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };

    let stdout = String::from_utf8_lossy(&out.stdout);
    let folder_lower = folder_path.to_lowercase().replace('/', "\\");

    for line in stdout.lines() {
        let cols: Vec<&str> = line.split(',').collect();
        // CSV format: Node,ExecutablePath,Name,ProcessId
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
