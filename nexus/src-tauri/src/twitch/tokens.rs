//! Twitch OAuth tokens in the SQLite `settings` table, encrypted via `crate::secrets`.

use crate::commands::error::CommandError;
use crate::models::settings::keys;
pub use crate::secrets::{delete_setting, get_setting_raw, set_setting_raw};

const KEY_FILE: &str = "twitch_key.bin";

pub fn encrypt(plaintext: &str) -> Result<String, CommandError> {
    crate::secrets::encrypt(KEY_FILE, plaintext)
}

pub fn decrypt(encoded: &str) -> Result<String, CommandError> {
    crate::secrets::decrypt(KEY_FILE, encoded)
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
    set_setting_raw(
        conn,
        keys::TWITCH_TOKEN_EXPIRES_AT,
        &expires_at_secs.to_string(),
    )?;
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
        Some(s) => s
            .parse::<i64>()
            .map(Some)
            .map_err(|_| CommandError::Parse(format!("invalid twitch_token_expires_at: {s}"))),
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
