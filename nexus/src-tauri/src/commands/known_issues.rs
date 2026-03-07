//! Fetches the Known Issues list from a JSONBin bin so the frontend can
//! display current known issues to users on demand.

use serde::{Deserialize, Serialize};

use super::jsonbin;

const JSONBIN_URL: &str = "https://api.jsonbin.io/v3/b/69abc8dd43b1c97be9bcc177/latest";

/// Raw JSONBin payload shape: `{ "Known_Issues": ["…", "…"] }`.
#[derive(Debug, Deserialize)]
struct KnownIssuesResponse {
    #[serde(rename = "Known_Issues", default)]
    known_issues: Vec<String>,
}

/// Value returned to the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownIssuesResult {
    pub issues: Vec<String>,
}

impl KnownIssuesResult {
    fn empty() -> Self {
        Self { issues: Vec::new() }
    }
}

#[tauri::command]
pub async fn fetch_known_issues() -> Result<KnownIssuesResult, String> {
    let auth = match jsonbin::resolve_auth() {
        Some(a) => a,
        None => return Ok(KnownIssuesResult::empty()),
    };

    let client = match reqwest::Client::builder().build() {
        Ok(c) => c,
        Err(_) => return Ok(KnownIssuesResult::empty()),
    };

    let res = match client
        .get(JSONBIN_URL)
        .query(&[("meta", "false")])
        .header(auth.header_name, &auth.key_value)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Ok(KnownIssuesResult::empty()),
    };

    if !res.status().is_success() {
        return Ok(KnownIssuesResult::empty());
    }

    let body = match res.text().await {
        Ok(b) => b,
        Err(_) => return Ok(KnownIssuesResult::empty()),
    };

    let parsed: KnownIssuesResponse = match serde_json::from_str(&body) {
        Ok(p) => p,
        Err(_) => return Ok(KnownIssuesResult::empty()),
    };

    Ok(KnownIssuesResult {
        issues: parsed.known_issues,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_valid_known_issues_json() {
        let json = r#"{ "Known_Issues": ["issue one", "issue two"] }"#;
        let parsed: KnownIssuesResponse = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.known_issues, vec!["issue one", "issue two"]);
    }

    #[test]
    fn deserializes_empty_known_issues_array() {
        let json = r#"{ "Known_Issues": [] }"#;
        let parsed: KnownIssuesResponse = serde_json::from_str(json).unwrap();
        assert!(parsed.known_issues.is_empty());
    }

    #[test]
    fn missing_known_issues_key_defaults_to_empty() {
        let json = r#"{ "other_field": "value" }"#;
        let parsed: KnownIssuesResponse = serde_json::from_str(json).unwrap();
        assert!(parsed.known_issues.is_empty());
    }

    #[test]
    fn malformed_json_returns_error() {
        let json = r#"not valid json"#;
        let result = serde_json::from_str::<KnownIssuesResponse>(json);
        assert!(result.is_err());
    }

    #[test]
    fn result_serializes_as_camel_case() {
        let result = KnownIssuesResult {
            issues: vec!["bug A".to_string()],
        };
        let json = serde_json::to_value(&result).unwrap();
        assert!(json.get("issues").is_some());
        assert_eq!(
            json["issues"].as_array().unwrap()[0].as_str().unwrap(),
            "bug A"
        );
    }

    #[test]
    fn empty_result_has_empty_issues_vec() {
        let result = KnownIssuesResult::empty();
        assert!(result.issues.is_empty());
    }
}
