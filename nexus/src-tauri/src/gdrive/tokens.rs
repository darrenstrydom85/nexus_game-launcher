//! Google Drive OAuth tokens in the SQLite `settings` table, encrypted via `crate::secrets`.

use crate::commands::error::CommandError;
use crate::models::settings::keys;
pub use crate::secrets::{delete_setting, get_setting_raw, set_setting_raw};

const KEY_FILE: &str = "gdrive_key.bin";

pub fn encrypt(plaintext: &str) -> Result<String, CommandError> {
    crate::secrets::encrypt(KEY_FILE, plaintext)
}

pub fn decrypt(encoded: &str) -> Result<String, CommandError> {
    crate::secrets::decrypt(KEY_FILE, encoded)
}

pub fn gdrive_setting_keys() -> &'static [&'static str] {
    &[
        keys::GDRIVE_ACCESS_TOKEN,
        keys::GDRIVE_REFRESH_TOKEN,
        keys::GDRIVE_TOKEN_EXPIRES_AT,
        keys::GDRIVE_USER_EMAIL,
        keys::GDRIVE_FOLDER_ID,
    ]
}

pub fn store_tokens(
    conn: &rusqlite::Connection,
    access_token: &str,
    refresh_token: &str,
    expires_at_secs: i64,
    email: &str,
) -> Result<(), CommandError> {
    let enc_access = encrypt(access_token)?;
    let enc_refresh = encrypt(refresh_token)?;
    set_setting_raw(conn, keys::GDRIVE_ACCESS_TOKEN, &enc_access)?;
    set_setting_raw(conn, keys::GDRIVE_REFRESH_TOKEN, &enc_refresh)?;
    set_setting_raw(
        conn,
        keys::GDRIVE_TOKEN_EXPIRES_AT,
        &expires_at_secs.to_string(),
    )?;
    set_setting_raw(conn, keys::GDRIVE_USER_EMAIL, email)?;
    Ok(())
}

pub fn load_access_token(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    match get_setting_raw(conn, keys::GDRIVE_ACCESS_TOKEN)? {
        Some(enc) => decrypt(&enc).map(Some),
        None => Ok(None),
    }
}

pub fn load_refresh_token(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    match get_setting_raw(conn, keys::GDRIVE_REFRESH_TOKEN)? {
        Some(enc) => decrypt(&enc).map(Some),
        None => Ok(None),
    }
}

pub fn load_expires_at(conn: &rusqlite::Connection) -> Result<Option<i64>, CommandError> {
    match get_setting_raw(conn, keys::GDRIVE_TOKEN_EXPIRES_AT)? {
        Some(s) => s
            .parse::<i64>()
            .map(Some)
            .map_err(|_| CommandError::Parse(format!("invalid gdrive_token_expires_at: {s}"))),
        None => Ok(None),
    }
}

pub fn load_user_email(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    get_setting_raw(conn, keys::GDRIVE_USER_EMAIL)
}

pub fn load_folder_id(conn: &rusqlite::Connection) -> Result<Option<String>, CommandError> {
    get_setting_raw(conn, keys::GDRIVE_FOLDER_ID)
}

pub fn clear_all(conn: &rusqlite::Connection) -> Result<(), CommandError> {
    for key in gdrive_setting_keys() {
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
    fn clear_all_removes_all_gdrive_keys() {
        let conn = in_memory_conn();
        for key in gdrive_setting_keys() {
            set_setting_raw(&conn, key, "dummy").unwrap();
        }
        for key in gdrive_setting_keys() {
            assert!(get_setting_raw(&conn, key).unwrap().is_some());
        }
        clear_all(&conn).unwrap();
        for key in gdrive_setting_keys() {
            assert!(get_setting_raw(&conn, key).unwrap().is_none());
        }
    }
}
