//! Encrypted token storage shared by the Twitch and Google Drive integrations.
//!
//! Tokens are AES-256-GCM encrypted into the `settings` table as
//! "base64(nonce || ciphertext)". Each integration has its own 32-byte key in
//! the app data dir, wrapped with Windows DPAPI so it only unwraps for this
//! Windows user on this machine: a copied data folder is useless elsewhere.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm,
};
use base64::Engine;
use rusqlite::{params, OptionalExtension};
use std::path::{Path, PathBuf};

use crate::commands::error::CommandError;

const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

fn key_path(key_file: &str) -> Result<PathBuf, CommandError> {
    let app_data = std::env::var("APPDATA")
        .map_err(|_| CommandError::Unknown("APPDATA not set (non-Windows?)".to_string()))?;
    Ok(PathBuf::from(app_data).join("nexus").join(key_file))
}

/// Write via temp file + rename so a crash never leaves a half-written key.
fn write_key_file(path: &Path, bytes: &[u8]) -> Result<(), CommandError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Load the key, creating it on first use. Key files from before DPAPI
/// wrapping (raw 32 bytes) are used as-is and rewrapped in place.
fn load_key_at(path: &Path) -> Result<Vec<u8>, CommandError> {
    match std::fs::read(path) {
        Ok(raw) if raw.len() == KEY_LEN => {
            // Best-effort: if rewrapping fails the raw key still works.
            if let Ok(wrapped) = dpapi::protect(&raw) {
                let _ = write_key_file(path, &wrapped);
            }
            Ok(raw)
        }
        Ok(wrapped) => dpapi::unprotect(&wrapped),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let mut key = vec![0u8; KEY_LEN];
            getrandom::getrandom(&mut key).map_err(|e| CommandError::Unknown(e.to_string()))?;
            write_key_file(path, &dpapi::protect(&key)?)?;
            Ok(key)
        }
        Err(e) => Err(e.into()),
    }
}

fn cipher_at(path: &Path) -> Result<Aes256Gcm, CommandError> {
    Aes256Gcm::new_from_slice(&load_key_at(path)?)
        .map_err(|e| CommandError::Unknown(e.to_string()))
}

fn seal(cipher: &Aes256Gcm, plaintext: &str) -> Result<String, CommandError> {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::getrandom(&mut nonce).map_err(|e| CommandError::Unknown(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(aes_gcm::Nonce::from_slice(&nonce), plaintext.as_bytes())
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    let mut combined = nonce.to_vec();
    combined.extend(ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
}

fn open(cipher: &Aes256Gcm, encoded: &str) -> Result<String, CommandError> {
    let combined = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|e| CommandError::Parse(format!("token decode: {e}")))?;
    if combined.len() < NONCE_LEN {
        return Err(CommandError::Parse("token too short".to_string()));
    }
    let (nonce, ciphertext) = combined.split_at(NONCE_LEN);
    let plaintext = cipher
        .decrypt(aes_gcm::Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| {
            CommandError::Auth("token decryption failed (wrong machine or corrupted)".to_string())
        })?;
    String::from_utf8(plaintext).map_err(|e| CommandError::Parse(e.to_string()))
}

/// Encrypt with the key stored in `%APPDATA%\nexus\<key_file>`.
pub fn encrypt(key_file: &str, plaintext: &str) -> Result<String, CommandError> {
    seal(&cipher_at(&key_path(key_file)?)?, plaintext)
}

/// Decrypt a value produced by `encrypt` with the same `key_file`.
pub fn decrypt(key_file: &str, encoded: &str) -> Result<String, CommandError> {
    open(&cipher_at(&key_path(key_file)?)?, encoded)
}

pub fn get_setting_raw(
    conn: &rusqlite::Connection,
    key: &str,
) -> Result<Option<String>, CommandError> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |r| r.get::<_, Option<String>>(0),
    )
    .optional()
    .map(Option::flatten)
    .map_err(|e| CommandError::Database(e.to_string()))
}

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

pub fn delete_setting(conn: &rusqlite::Connection, key: &str) -> Result<(), CommandError> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])
        .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(())
}

mod dpapi {
    use crate::commands::error::CommandError;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, CommandError> {
        run(data, true)
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, CommandError> {
        run(data, false)
    }

    fn run(data: &[u8], protect: bool) -> Result<Vec<u8>, CommandError> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut out = CRYPT_INTEGER_BLOB::default();
        // SAFETY: `input` borrows `data` for the duration of the call. On
        // success DPAPI hands back a LocalAlloc'd buffer in `out`, which is
        // copied and then released with LocalFree exactly once.
        unsafe {
            let ok = if protect {
                CryptProtectData(&input, null(), null(), null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            } else {
                CryptUnprotectData(&input, null_mut(), null(), null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            };
            if ok == 0 {
                return Err(CommandError::Auth(format!(
                    "token key unreadable for this Windows user: {}",
                    std::io::Error::last_os_error()
                )));
            }
            let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
            LocalFree(out.pbData.cast());
            Ok(bytes)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_raw_key_is_migrated_to_dpapi_and_still_decrypts() {
        let path = std::env::temp_dir().join(format!("nexus_secrets_test_{}.bin", std::process::id()));
        let legacy = [7u8; KEY_LEN];
        std::fs::write(&path, legacy).unwrap();

        // Token sealed with the legacy raw key before the upgrade.
        let legacy_cipher = Aes256Gcm::new_from_slice(&legacy).unwrap();
        let sealed = seal(&legacy_cipher, "refresh_abc").unwrap();

        // First load migrates the file; it must no longer hold the raw key.
        assert_eq!(load_key_at(&path).unwrap(), legacy);
        let on_disk = std::fs::read(&path).unwrap();
        assert_ne!(on_disk.len(), KEY_LEN);
        assert!(!on_disk.windows(KEY_LEN).any(|w| w == legacy));

        // Second load unwraps via DPAPI; old ciphertext still opens.
        assert_eq!(open(&cipher_at(&path).unwrap(), &sealed).unwrap(), "refresh_abc");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn new_key_roundtrip_and_tamper_detection() {
        let path = std::env::temp_dir().join(format!("nexus_secrets_new_{}.bin", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let cipher = cipher_at(&path).unwrap();
        let sealed = seal(&cipher, "token_123").unwrap();
        assert_eq!(open(&cipher_at(&path).unwrap(), &sealed).unwrap(), "token_123");
        assert_ne!(std::fs::read(&path).unwrap().len(), KEY_LEN);

        let other = Aes256Gcm::new_from_slice(&[1u8; KEY_LEN]).unwrap();
        assert!(open(&other, &sealed).is_err());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn settings_helpers_roundtrip() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)", [])
            .unwrap();
        assert_eq!(get_setting_raw(&conn, "k").unwrap(), None);
        set_setting_raw(&conn, "k", "v").unwrap();
        assert_eq!(get_setting_raw(&conn, "k").unwrap().as_deref(), Some("v"));
        delete_setting(&conn, "k").unwrap();
        assert_eq!(get_setting_raw(&conn, "k").unwrap(), None);
    }
}
