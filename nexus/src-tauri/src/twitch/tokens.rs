//! Encrypted storage and retrieval of Twitch OAuth tokens in the SQLite `settings` table.
//! Uses AES-256-GCM with a device-bound key stored in app data.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm,
};
use base64::Engine;
use rusqlite::params;
use std::path::PathBuf;

use crate::commands::error::CommandError;
use crate::models::settings::keys;

const TWITCH_KEY_FILENAME: &str = "twitch_key.bin";
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

/// Device-bound encryption key for Twitch tokens. Stored in app data dir.
fn key_path() -> Result<PathBuf, CommandError> {
    let app_data = std::env::var("APPDATA").map_err(|_| {
        CommandError::Unknown("APPDATA not set (non-Windows?)".to_string())
    })?;
    Ok(PathBuf::from(app_data).join("nexus").join(TWITCH_KEY_FILENAME))
}

/// Ensure the nexus app dir exists and return the key path.
fn ensure_key_file() -> Result<PathBuf, CommandError> {
    let path = key_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| CommandError::Io(std::io::Error::new(std::io::ErrorKind::Other, e)))?;
    }
    if !path.exists() {
        let mut key = [0u8; KEY_LEN];
        getrandom::getrandom(&mut key).map_err(|e| CommandError::Unknown(e.to_string()))?;
        std::fs::write(&path, &key).map_err(|e| CommandError::Io(e))?;
    }
    Ok(path)
}

fn load_key() -> Result<[u8; KEY_LEN], CommandError> {
    let path = ensure_key_file()?;
    let bytes = std::fs::read(&path).map_err(|e| CommandError::Io(e))?;
    let mut key = [0u8; KEY_LEN];
    if bytes.len() != KEY_LEN {
        return Err(CommandError::Unknown(format!(
            "invalid key file length: {}",
            bytes.len()
        )));
    }
    key.copy_from_slice(&bytes);
    Ok(key)
}

/// Encrypt plaintext with AES-256-GCM. Returns "base64(nonce || ciphertext)".
pub fn encrypt(plaintext: &str) -> Result<String, CommandError> {
    let key = load_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| CommandError::Unknown(e.to_string()))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| CommandError::Unknown(e.to_string()))?;
    let nonce = aes_gcm::Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
}

/// Decrypt a value produced by `encrypt`.
pub fn decrypt(encoded: &str) -> Result<String, CommandError> {
    let key = load_key()?;
    let combined = base64::engine::general_purpose::STANDARD.decode(encoded.trim()).map_err(|e| {
        CommandError::Parse(format!("twitch token decode: {e}"))
    })?;
    if combined.len() < NONCE_LEN {
        return Err(CommandError::Parse("twitch token too short".to_string()));
    }
    let (nonce_slice, ct) = combined.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| CommandError::Unknown(e.to_string()))?;
    let nonce = aes_gcm::Nonce::from_slice(nonce_slice);
    let plaintext = cipher
        .decrypt(nonce, ct)
        .map_err(|_| CommandError::Auth("token decryption failed (wrong machine or corrupted)".to_string()))?;
    String::from_utf8(plaintext).map_err(|e| CommandError::Parse(e.to_string()))
}

/// Keys in settings that belong to Twitch auth. Used for logout (clear all).
pub fn twitch_setting_keys() -> &'static [&'static str] {
    &[
        keys::TWITCH_ACCESS_TOKEN,
        keys::TWITCH_REFRESH_TOKEN,
        keys::TWITCH_TOKEN_EXPIRES_AT,
        keys::TWITCH_USER_ID,
        keys::TWITCH_DISPLAY_NAME,
        keys::TWITCH_PROFILE_IMAGE_URL,
    ]
}

/// Read a setting value (plain or encrypted). For expiry we store plain.
pub fn get_setting_raw(
    conn: &rusqlite::Connection,
    key: &str,
) -> Result<Option<String>, CommandError> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let mut rows = stmt
        .query(params![key])
        .map_err(|e| CommandError::Database(e.to_string()))?;
    if let Some(row) = rows.next().map_err(|e| CommandError::Database(e.to_string()))? {
        let v: Option<String> = row.get(0).map_err(|e| CommandError::Database(e.to_string()))?;
        Ok(v)
    } else {
        Ok(None)
    }
}

/// Write a setting value.
pub fn set_setting_raw(
    conn: &rusqlite::Connection,
    key: &str,
    value: &str,
) -> Result<(), CommandError> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(())
}

/// Delete a setting by key.
pub fn delete_setting(conn: &rusqlite::Connection, key: &str) -> Result<(), CommandError> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])
        .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(())
}

/// Store encrypted access and refresh tokens, plain expiry, user info, and avatar.
pub fn store_tokens(
    conn: &rusqlite::Connection,
    access_token: &str,
    refresh_token: &str,
    expires_at_secs: i64,
    user_id: &str,
    display_name: &str,
    profile_image_url: Option<&str>,
) -> Result<(), CommandError> {
    let enc_access = encrypt(access_token)?;
    let enc_refresh = encrypt(refresh_token)?;
    set_setting_raw(conn, keys::TWITCH_ACCESS_TOKEN, &enc_access)?;
    set_setting_raw(conn, keys::TWITCH_REFRESH_TOKEN, &enc_refresh)?;
    set_setting_raw(conn, keys::TWITCH_TOKEN_EXPIRES_AT, &expires_at_secs.to_string())?;
    set_setting_raw(conn, keys::TWITCH_USER_ID, user_id)?;
    set_setting_raw(conn, keys::TWITCH_DISPLAY_NAME, display_name)?;
    if let Some(url) = profile_image_url {
        set_setting_raw(conn, keys::TWITCH_PROFILE_IMAGE_URL, url)?;
    }
    Ok(())
}

/// Load access token (decrypted). Returns None if not present or decrypt fails.
pub fn load_access_token(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    match get_setting_raw(conn, keys::TWITCH_ACCESS_TOKEN)? {
        Some(enc) => decrypt(&enc).map(Some),
        None => Ok(None),
    }
}

/// Load refresh token (decrypted).
pub fn load_refresh_token(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    match get_setting_raw(conn, keys::TWITCH_REFRESH_TOKEN)? {
        Some(enc) => decrypt(&enc).map(Some),
        None => Ok(None),
    }
}

/// Load expiry timestamp (seconds since epoch).
pub fn load_expires_at(conn: &rusqlite::Connection) -> Result<Option<i64>, CommandError> {
    match get_setting_raw(conn, keys::TWITCH_TOKEN_EXPIRES_AT)? {
        Some(s) => s.parse::<i64>().map(Some).map_err(|_| {
            CommandError::Parse(format!("invalid twitch_token_expires_at: {s}"))
        }),
        None => Ok(None),
    }
}

/// Load display name (plain).
pub fn load_display_name(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    get_setting_raw(conn, keys::TWITCH_DISPLAY_NAME)
}

/// Load Twitch user ID (plain). Used for Helix API calls (e.g. followed channels).
pub fn load_user_id(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    get_setting_raw(conn, keys::TWITCH_USER_ID)
}

/// Load logged-in user's profile image URL (plain). May be None for users authenticated
/// before this field was added; the manager backfills it on next validate/refresh.
pub fn load_profile_image_url(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    get_setting_raw(conn, keys::TWITCH_PROFILE_IMAGE_URL)
}

/// Clear all Twitch-related keys from settings.
pub fn clear_all(conn: &rusqlite::Connection) -> Result<(), CommandError> {
    for key in twitch_setting_keys() {
        delete_setting(conn, key)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let temp = std::env::temp_dir().join("nexus_twitch_test_key.bin");
        let mut key = [0u8; KEY_LEN];
        getrandom::getrandom(&mut key).unwrap();
        std::fs::write(&temp, &key).unwrap();
        let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
        let mut nonce_bytes = [0u8; NONCE_LEN];
        getrandom::getrandom(&mut nonce_bytes).unwrap();
        let nonce = aes_gcm::Nonce::from_slice(&nonce_bytes);
        let plain = "my_secret_token_123";
        let ct = cipher.encrypt(nonce, plain.as_bytes()).unwrap();
        let mut combined = nonce_bytes.to_vec();
        combined.extend(ct);
        let encoded = base64::engine::general_purpose::STANDARD.encode(&combined);
        let decoded = base64::engine::general_purpose::STANDARD.decode(&encoded).unwrap();
        let (n, c) = decoded.split_at(NONCE_LEN);
        let cipher2 = Aes256Gcm::new_from_slice(&key).unwrap();
        let out = cipher2.decrypt(aes_gcm::Nonce::from_slice(n), c).unwrap();
        assert_eq!(String::from_utf8(out).unwrap(), plain);
        let _ = std::fs::remove_file(&temp);
    }

    #[test]
    fn load_access_token_returns_none_when_no_tokens_stored() {
        let conn = in_memory_conn();
        assert!(load_access_token(&conn).unwrap().is_none());
        assert!(load_expires_at(&conn).unwrap().is_none());
    }

    #[test]
    fn clear_all_removes_all_twitch_keys() {
        let conn = in_memory_conn();
        for key in twitch_setting_keys() {
            set_setting_raw(&conn, key, "dummy").unwrap();
        }
        for key in twitch_setting_keys() {
            assert!(get_setting_raw(&conn, key).unwrap().is_some());
        }
        clear_all(&conn).unwrap();
        for key in twitch_setting_keys() {
            assert!(get_setting_raw(&conn, key).unwrap().is_none());
        }
    }
}
