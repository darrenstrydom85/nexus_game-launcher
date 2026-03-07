//! Shared JSONBin.io helpers — API key resolution and authenticated GET requests.

const ENV_JSONBIN_ACCESS_KEY: &str = "NEXUS_JSONBIN_ACCESS_KEY";
const ENV_JSONBIN_MASTER_KEY: &str = "NEXUS_JSONBIN_MASTER_KEY";

/// Resolved JSONBin authentication header (name + value).
pub struct JsonBinAuth {
    pub header_name: &'static str,
    pub key_value: String,
}

/// Resolves the JSONBin API key from compile-time env (`option_env!`) or
/// runtime env (`std::env::var`). Returns `None` when no key is available.
pub fn resolve_auth() -> Option<JsonBinAuth> {
    let access_key = option_env!("NEXUS_JSONBIN_ACCESS_KEY")
        .map(String::from)
        .or_else(|| std::env::var(ENV_JSONBIN_ACCESS_KEY).ok());
    let master_key = option_env!("NEXUS_JSONBIN_MASTER_KEY")
        .map(String::from)
        .or_else(|| std::env::var(ENV_JSONBIN_MASTER_KEY).ok());

    match (access_key.as_deref(), master_key.as_deref()) {
        (Some(k), _) if !k.trim().is_empty() => Some(JsonBinAuth {
            header_name: "X-Access-Key",
            key_value: k.trim().to_string(),
        }),
        (_, Some(k)) if !k.trim().is_empty() => Some(JsonBinAuth {
            header_name: "X-Master-Key",
            key_value: k.trim().to_string(),
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_auth_returns_some_or_none_without_panic() {
        // Depending on CI env this may be Some or None — just ensure no panic.
        let _auth = resolve_auth();
    }
}
