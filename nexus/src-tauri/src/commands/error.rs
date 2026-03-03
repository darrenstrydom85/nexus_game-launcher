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
            Self::Unknown(_) => ErrorKind::Unknown(msg),
        };
        kind.serialize(serializer)
    }
}
