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

    #[error("unknown error: {0}")]
    Unknown(String),
}

#[derive(Serialize)]
#[serde(tag = "kind", content = "message")]
#[serde(rename_all = "camelCase")]
enum ErrorKind {
    Io(String),
    Database(String),
    NotFound(String),
    Parse(String),
    Permission(String),
    NetworkUnavailable(String),
    Auth(String),
    Unknown(String),
}

impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        let msg = self.to_string();
        let kind = match self {
            Self::Io(_) => ErrorKind::Io(msg),
            Self::Database(_) => ErrorKind::Database(msg),
            Self::NotFound(_) => ErrorKind::NotFound(msg),
            Self::Parse(_) => ErrorKind::Parse(msg),
            Self::Permission(_) => ErrorKind::Permission(msg),
            Self::NetworkUnavailable(_) => ErrorKind::NetworkUnavailable(msg),
            Self::Auth(_) => ErrorKind::Auth(msg),
            Self::Unknown(_) => ErrorKind::Unknown(msg),
        };
        kind.serialize(serializer)
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
        assert!(json.get("message").and_then(|v| v.as_str()).unwrap().contains("invalid grant"));
    }

    #[test]
    fn network_unavailable_error_serializes_with_network_unavailable_kind() {
        let e = CommandError::NetworkUnavailable("No internet.".to_string());
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json.get("kind").and_then(|v| v.as_str()), Some("networkUnavailable"));
    }
}
