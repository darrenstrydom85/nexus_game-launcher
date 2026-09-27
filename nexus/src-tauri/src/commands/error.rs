use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error("database error: {0}")]
    Database(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("parse error: {0}")]
    Parse(String),

    #[error("permission denied: {0}")]
    Permission(String),

    #[error("network unavailable: {0}")]
    NetworkUnavailable(String),

    #[error("auth error: {0}")]
    Auth(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("unknown error: {0}")]
    Unknown(String),
}

impl From<rusqlite::Error> for CommandError {
    fn from(e: rusqlite::Error) -> Self {
        CommandError::Database(e.to_string())
    }
}

/// Serialized for the frontend as `{ "kind": "<camelCase variant>", "message": "<Display>" }`.
impl Serialize for CommandError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let kind = match self {
            Self::Io(_) => "io",
            Self::Database(_) => "database",
            Self::NotFound(_) => "notFound",
            Self::Parse(_) => "parse",
            Self::Permission(_) => "permission",
            Self::NetworkUnavailable(_) => "networkUnavailable",
            Self::Auth(_) => "auth",
            Self::Api(_) => "api",
            Self::Unknown(_) => "unknown",
        };
        let mut s = serializer.serialize_struct("CommandError", 2)?;
        s.serialize_field("kind", kind)?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_error_serializes_with_auth_kind() {
        let e = CommandError::Auth("invalid grant".to_string());
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json.get("kind").and_then(|v| v.as_str()), Some("auth"));
        assert!(json
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap()
            .contains("invalid grant"));
    }

    #[test]
    fn network_unavailable_error_serializes_with_network_unavailable_kind() {
        let e = CommandError::NetworkUnavailable("No internet.".to_string());
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(
            json.get("kind").and_then(|v| v.as_str()),
            Some("networkUnavailable")
        );
    }
}
