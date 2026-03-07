//! Version check against JSONBin.io. Compares current app version with the
//! published latest version and reports if an update is available.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::error::CommandError;
use super::jsonbin;

const JSONBIN_URL: &str = "https://api.jsonbin.io/v3/b/69a917a6ae596e708f60ee80/latest";
const DOWNLOAD_URL: &str = "https://rebrand.ly/nexus-launch";

#[derive(Debug, Deserialize)]
struct JsonBinRecord {
    version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub update_available: bool,
    pub latest_version: Option<String>,
    pub download_url: String,
}

/// Parses a "major.minor.patch" string into (major, minor, patch). Non-numeric segments default to 0.
fn parse_semver(s: &str) -> (u32, u32, u32) {
    let parts: Vec<&str> = s.trim().split('.').collect();
    let major = parts.get(0).and_then(|p| p.parse::<u32>().ok()).unwrap_or(0);
    let minor = parts.get(1).and_then(|p| p.parse::<u32>().ok()).unwrap_or(0);
    let patch = parts.get(2).and_then(|p| p.parse::<u32>().ok()).unwrap_or(0);
    (major, minor, patch)
}

/// Returns true if `latest` is strictly greater than `current` (e.g. 0.1.6 > 0.1.5).
fn version_greater_than(latest: &str, current: &str) -> bool {
    let (lmaj, lmin, lpat) = parse_semver(latest);
    let (cmaj, cmin, cpat) = parse_semver(current);
    if lmaj != cmaj {
        return lmaj > cmaj;
    }
    if lmin != cmin {
        return lmin > cmin;
    }
    lpat > cpat
}

#[tauri::command]
pub async fn check_update_available(app: AppHandle) -> Result<UpdateCheckResult, CommandError> {
    let current = app.package_info().version.to_string();

    let auth = match jsonbin::resolve_auth() {
        Some(a) => a,
        None => {
            return Ok(UpdateCheckResult {
                update_available: false,
                latest_version: None,
                download_url: DOWNLOAD_URL.to_string(),
            });
        }
    };

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client: {e}")))?;

    let res = client
        .get(JSONBIN_URL)
        .query(&[("meta", "false")])
        .header(auth.header_name, &auth.key_value)
        .send()
        .await
        .map_err(|e| CommandError::NetworkUnavailable(e.to_string()))?;

    if !res.status().is_success() {
        return Ok(UpdateCheckResult {
            update_available: false,
            latest_version: None,
            download_url: DOWNLOAD_URL.to_string(),
        });
    }

    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(format!("read body: {e}")))?;

    let record: JsonBinRecord = serde_json::from_str(&body).map_err(|e| {
        CommandError::Parse(format!("jsonbin response: {e}"))
    })?;

    let latest = record.version.trim().to_string();
    let update_available = !latest.is_empty() && version_greater_than(&latest, &current);

    Ok(UpdateCheckResult {
        update_available,
        latest_version: if update_available { Some(latest) } else { None },
        download_url: DOWNLOAD_URL.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_semver_three_parts() {
        assert_eq!(parse_semver("0.1.5"), (0, 1, 5));
        assert_eq!(parse_semver("1.0.0"), (1, 0, 0));
    }

    #[test]
    fn parse_semver_missing_parts() {
        assert_eq!(parse_semver("0.1"), (0, 1, 0));
        assert_eq!(parse_semver("2"), (2, 0, 0));
    }

    #[test]
    fn version_greater_patch() {
        assert!(version_greater_than("0.1.6", "0.1.5"));
        assert!(!version_greater_than("0.1.5", "0.1.5"));
        assert!(!version_greater_than("0.1.4", "0.1.5"));
    }

    #[test]
    fn version_greater_minor() {
        assert!(version_greater_than("0.2.0", "0.1.9"));
        assert!(!version_greater_than("0.1.9", "0.2.0"));
    }

    #[test]
    fn version_greater_major() {
        assert!(version_greater_than("1.0.0", "0.9.9"));
        assert!(!version_greater_than("0.9.9", "1.0.0"));
    }
}
