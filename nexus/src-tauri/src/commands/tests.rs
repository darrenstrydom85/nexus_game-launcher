#[cfg(test)]
mod tests {
    use crate::commands::error::CommandError;
    use crate::commands::ping::ping;
    use serde_json::Value;

    #[test]
    fn ping_returns_pong() {
        let response = ping().expect("ping should succeed");
        assert_eq!(response.message, "pong");
        assert!(response.timestamp > 0);
    }

    #[test]
    fn command_error_io_serializes_to_tagged_json() {
        let err = CommandError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "file missing",
        ));
        let json = serde_json::to_value(&err).expect("should serialize");
        assert_eq!(json["kind"], "io");
        assert!(json["message"].as_str().unwrap().contains("file missing"));
    }

    #[test]
    fn command_error_not_found_serializes_correctly() {
        let err = CommandError::NotFound("game xyz".into());
        let json = serde_json::to_value(&err).expect("should serialize");
        assert_eq!(json["kind"], "notFound");
        assert!(json["message"].as_str().unwrap().contains("game xyz"));
    }

    #[test]
    fn command_error_database_serializes_correctly() {
        let err = CommandError::Database("connection refused".into());
        let json = serde_json::to_value(&err).expect("should serialize");
        assert_eq!(json["kind"], "database");
        assert!(json["message"]
            .as_str()
            .unwrap()
            .contains("connection refused"));
    }

    #[test]
    fn command_error_parse_serializes_correctly() {
        let err = CommandError::Parse("invalid json".into());
        let json = serde_json::to_value(&err).expect("should serialize");
        assert_eq!(json["kind"], "parse");
    }

    #[test]
    fn command_error_permission_serializes_correctly() {
        let err = CommandError::Permission("access denied".into());
        let json = serde_json::to_value(&err).expect("should serialize");
        assert_eq!(json["kind"], "permission");
    }

    #[test]
    fn command_error_unknown_serializes_correctly() {
        let err = CommandError::Unknown("something broke".into());
        let json = serde_json::to_value(&err).expect("should serialize");
        assert_eq!(json["kind"], "unknown");
    }

    fn load_capabilities() -> Value {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let path = std::path::Path::new(manifest_dir).join("capabilities/default.json");
        let content = std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()));
        serde_json::from_str(&content).expect("capabilities/default.json is not valid JSON")
    }

    fn permission_ids(caps: &Value) -> Vec<String> {
        caps["permissions"]
            .as_array()
            .expect("permissions should be an array")
            .iter()
            .map(|p| match p {
                Value::String(s) => s.clone(),
                Value::Object(obj) => obj["identifier"]
                    .as_str()
                    .expect("object permission must have identifier")
                    .to_string(),
                _ => panic!("unexpected permission entry type"),
            })
            .collect()
    }

    #[test]
    fn capabilities_file_is_valid_json() {
        let caps = load_capabilities();
        assert_eq!(caps["identifier"], "default");
        assert_eq!(caps["windows"][0], "main");
        assert!(caps["permissions"].as_array().unwrap().len() > 0);
    }

    #[test]
    fn capabilities_include_filesystem_permissions() {
        let caps = load_capabilities();
        let ids = permission_ids(&caps);

        let required_fs = [
            "fs:allow-read-dir",
            "fs:allow-read-file",
            "fs:allow-write-file",
            "fs:allow-write-text-file",
            "fs:allow-mkdir",
            "fs:allow-remove",
            "fs:allow-rename",
            "fs:allow-exists",
        ];
        for perm in &required_fs {
            assert!(ids.contains(&perm.to_string()), "missing fs permission: {perm}");
        }
    }

    #[test]
    fn filesystem_scopes_restricted_to_appdata_nexus() {
        let caps = load_capabilities();
        let perms = caps["permissions"].as_array().unwrap();

        for perm in perms {
            if let Some(id) = perm.get("identifier").and_then(|v| v.as_str()) {
                if id.starts_with("fs:") {
                    let allow = perm["allow"].as_array().expect("fs perm should have allow array");
                    for scope in allow {
                        let path = scope["path"].as_str().expect("scope should have path");
                        assert!(
                            path.starts_with("$APPDATA/nexus"),
                            "fs scope '{path}' is not restricted to $APPDATA/nexus"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn capabilities_include_shell_open() {
        let ids = permission_ids(&load_capabilities());
        assert!(ids.contains(&"shell:allow-open".to_string()), "missing shell:allow-open");
    }

    #[test]
    fn capabilities_do_not_include_broad_shell_execute() {
        let caps = load_capabilities();
        let perms = caps["permissions"].as_array().unwrap();

        for perm in perms {
            if let Some(id) = perm.get("identifier").and_then(|v| v.as_str()) {
                assert_ne!(id, "shell:default", "shell:default is too broad");
            }
            if let Some(s) = perm.as_str() {
                assert_ne!(s, "shell:default", "shell:default is too broad");
            }
        }
    }

    #[test]
    fn capabilities_include_process_default() {
        let ids = permission_ids(&load_capabilities());
        assert!(ids.contains(&"process:default".to_string()), "missing process:default");
    }

    #[test]
    fn capabilities_include_http_with_scoped_urls() {
        let caps = load_capabilities();
        let perms = caps["permissions"].as_array().unwrap();

        let http_perm = perms
            .iter()
            .find(|p| {
                p.get("identifier")
                    .and_then(|v| v.as_str())
                    .map_or(false, |id| id.starts_with("http:"))
            })
            .expect("should have an http permission entry");

        let allow = http_perm["allow"].as_array().expect("http perm should have allow array");
        let urls: Vec<&str> = allow.iter().map(|a| a["url"].as_str().unwrap()).collect();

        assert!(urls.iter().any(|u| u.contains("steamgriddb.com")), "missing steamgriddb.com scope");
        assert!(urls.iter().any(|u| u.contains("api.igdb.com")), "missing api.igdb.com scope");
        assert!(urls.iter().any(|u| u.contains("id.twitch.tv")), "missing id.twitch.tv scope");
    }

    #[test]
    fn http_scopes_are_https_only() {
        let caps = load_capabilities();
        let perms = caps["permissions"].as_array().unwrap();

        for perm in perms {
            if let Some(id) = perm.get("identifier").and_then(|v| v.as_str()) {
                if id.starts_with("http:") {
                    if let Some(allow) = perm["allow"].as_array() {
                        for scope in allow {
                            let url = scope["url"].as_str().unwrap();
                            assert!(url.starts_with("https://"), "HTTP scope '{url}' must use HTTPS");
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn no_wildcard_domain_http_scopes() {
        let caps = load_capabilities();
        let perms = caps["permissions"].as_array().unwrap();

        for perm in perms {
            if let Some(id) = perm.get("identifier").and_then(|v| v.as_str()) {
                if id.starts_with("http:") {
                    if let Some(allow) = perm["allow"].as_array() {
                        for scope in allow {
                            let url = scope["url"].as_str().unwrap();
                            let domain = url
                                .trim_start_matches("https://")
                                .split('/')
                                .next()
                                .unwrap();
                            assert!(!domain.contains('*'), "HTTP domain '{domain}' must not contain wildcards");
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn no_broad_fs_default_permission() {
        let ids = permission_ids(&load_capabilities());
        assert!(!ids.contains(&"fs:default".to_string()), "fs:default is too broad — use scoped permissions");
    }

    #[test]
    fn stub_commands_return_not_implemented() {
        use crate::commands::playtime::get_playtime;
        use crate::commands::scanner::scan_directory;

        let scan_err = scan_directory("/tmp".into()).unwrap_err();
        assert!(scan_err.to_string().contains("not yet implemented"));

        let playtime_err = get_playtime("game-1".into()).unwrap_err();
        assert!(playtime_err.to_string().contains("not yet implemented"));
    }
}
