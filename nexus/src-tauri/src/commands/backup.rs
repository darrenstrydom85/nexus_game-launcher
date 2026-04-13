//! Tauri commands for Google Drive backup: OAuth, backup/restore, status, and configuration.

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;
use crate::gdrive::{api, auth, tokens};
use crate::models::settings::keys;

const REFRESH_THRESHOLD_SECS: i64 = 300;

fn google_client_id() -> Result<&'static str, CommandError> {
    option_env!("NEXUS_GOOGLE_CLIENT_ID").ok_or_else(|| {
        CommandError::Auth(
            "Google Drive integration is not configured. Set NEXUS_GOOGLE_CLIENT_ID when building."
                .to_string(),
        )
    })
}

fn google_client_secret() -> Result<&'static str, CommandError> {
    option_env!("NEXUS_GOOGLE_CLIENT_SECRET").ok_or_else(|| {
        CommandError::Auth(
            "Google Drive integration is not configured. Set NEXUS_GOOGLE_CLIENT_SECRET when building."
                .to_string(),
        )
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GDriveAuthStatus {
    pub authenticated: bool,
    pub email: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub file_id: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub pruned_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub last_backup_at: Option<String>,
    pub frequency: String,
    pub retention_count: u32,
}

/// Ensure we have a valid Google Drive access token, refreshing if needed.
/// Returns the current access token.
async fn ensure_valid_token(db: &State<'_, DbState>) -> Result<String, CommandError> {
    let (refresh_token_opt, expires_at_opt) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let refresh = tokens::load_refresh_token(&conn)?;
        let expires = tokens::load_expires_at(&conn)?;
        (refresh, expires)
    };

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let need_refresh = refresh_token_opt.is_some()
        && expires_at_opt.map_or(true, |e| now_secs >= e - REFRESH_THRESHOLD_SECS);

    if need_refresh {
        if let Some(refresh_token) = refresh_token_opt {
            let client_id = google_client_id()?;
            let client_secret = google_client_secret()?;
            match auth::refresh_access_token(client_id, client_secret, &refresh_token).await {
                Ok((access_token, new_refresh, expires_in)) => {
                    let new_expires_at = now_secs + expires_in;
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    let enc_access = tokens::encrypt(&access_token)?;
                    let enc_refresh = tokens::encrypt(&new_refresh)?;
                    tokens::set_setting_raw(&conn, keys::GDRIVE_ACCESS_TOKEN, &enc_access)?;
                    tokens::set_setting_raw(&conn, keys::GDRIVE_REFRESH_TOKEN, &enc_refresh)?;
                    tokens::set_setting_raw(
                        &conn,
                        keys::GDRIVE_TOKEN_EXPIRES_AT,
                        &new_expires_at.to_string(),
                    )?;
                    return Ok(access_token);
                }
                Err(e) => {
                    if matches!(e, CommandError::Auth(_)) {
                        let conn = db
                            .conn
                            .lock()
                            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                        let _ = tokens::clear_all(&conn);
                        return Err(e);
                    }
                    let hard_expired = expires_at_opt.map_or(true, |e| now_secs >= e);
                    if hard_expired {
                        return Err(e);
                    }
                }
            }
        }
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::load_access_token(&conn)?
        .ok_or_else(|| CommandError::Auth("Not connected to Google Drive".to_string()))
}

/// Get or resolve the backup folder ID, caching in settings.
async fn resolve_folder_id(
    db: &State<'_, DbState>,
    access_token: &str,
) -> Result<String, CommandError> {
    {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        if let Some(id) = tokens::load_folder_id(&conn)? {
            return Ok(id);
        }
    }

    let folder_id = api::ensure_backup_folder(access_token).await?;

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::set_setting_raw(&conn, keys::GDRIVE_FOLDER_ID, &folder_id)?;
    Ok(folder_id)
}

// ── Auth Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn gdrive_auth_start(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<GDriveAuthStatus, CommandError> {
    let opener = app.opener();
    let open_url = move |url: &str| {
        let _ = opener.open_url(url, None::<&str>);
    };

    let client_id = google_client_id()?;
    let client_secret = google_client_secret()?;
    let (access_token, refresh_token, expires_at, email) =
        auth::run_auth_flow(client_id, client_secret, open_url).await?;

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::store_tokens(&conn, &access_token, &refresh_token, expires_at, &email)?;
    drop(conn);

    let status = GDriveAuthStatus {
        authenticated: true,
        email: Some(email.clone()),
        expires_at: Some(expires_at),
    };

    let _ = app.emit(
        "gdrive-auth-changed",
        serde_json::json!({ "authenticated": true, "email": email }),
    );

    Ok(status)
}

#[tauri::command]
pub async fn gdrive_auth_status(
    db: State<'_, DbState>,
) -> Result<GDriveAuthStatus, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    let email = tokens::load_user_email(&conn)?;
    let expires_at = tokens::load_expires_at(&conn)?;
    let has_token = tokens::load_access_token(&conn)?.is_some();
    Ok(GDriveAuthStatus {
        authenticated: has_token,
        email,
        expires_at,
    })
}

#[tauri::command]
pub async fn gdrive_auth_logout(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::clear_all(&conn)?;
    drop(conn);

    let _ = app.emit(
        "gdrive-auth-changed",
        serde_json::json!({ "authenticated": false, "email": null }),
    );

    Ok(())
}

// ── Backup Commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn run_backup(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<BackupResult, CommandError> {
    let access_token = ensure_valid_token(&db).await?;
    let folder_id = resolve_folder_id(&db, &access_token).await?;

    let schema_version = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        crate::db::migrations::current_version(&conn)
            .map_err(|e| CommandError::Database(e.to_string()))?
    };

    let app_data = std::env::var("APPDATA")
        .map_err(|_| CommandError::Unknown("APPDATA not set".to_string()))?;
    let temp_path = std::path::PathBuf::from(&app_data)
        .join("nexus")
        .join("backup_temp.db");

    {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let vacuum_sql = format!("VACUUM INTO '{}'", temp_path.to_string_lossy().replace('\'', "''"));
        conn.execute_batch(&vacuum_sql)
            .map_err(|e| CommandError::Database(format!("VACUUM INTO failed: {e}")))?;
    }

    let file_size = std::fs::metadata(&temp_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let now_str = now_iso().replace(':', "-").trim_end_matches('Z').to_string();
    let file_name = format!("nexus-backup-{now_str}.db");

    let upload_result = api::upload_backup(
        &access_token,
        &folder_id,
        &temp_path,
        &file_name,
        schema_version,
    )
    .await;

    let _ = std::fs::remove_file(&temp_path);

    let file_id = upload_result?;

    let retention = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        tokens::get_setting_raw(&conn, keys::BACKUP_RETENTION_COUNT)?
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(5)
    };

    let pruned_count = api::prune_old_backups(&access_token, &folder_id, retention).await?;

    let completed_at = now_iso();
    {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        tokens::set_setting_raw(&conn, keys::BACKUP_LAST_AT, &completed_at)?;
    }

    let result = BackupResult {
        file_id,
        file_name: file_name.clone(),
        size_bytes: file_size,
        pruned_count,
    };

    let _ = app.emit(
        "backup-status-changed",
        serde_json::json!({
            "lastBackupAt": completed_at,
            "success": true,
            "fileName": file_name,
        }),
    );

    Ok(result)
}

#[tauri::command]
pub async fn list_backups(
    db: State<'_, DbState>,
) -> Result<Vec<api::BackupEntry>, CommandError> {
    let access_token = ensure_valid_token(&db).await?;
    let folder_id = resolve_folder_id(&db, &access_token).await?;
    api::list_backups(&access_token, &folder_id).await
}

#[tauri::command]
pub async fn restore_backup(
    app: AppHandle,
    db: State<'_, DbState>,
    backup_id: String,
) -> Result<(), CommandError> {
    let access_token = ensure_valid_token(&db).await?;

    let app_data = std::env::var("APPDATA")
        .map_err(|_| CommandError::Unknown("APPDATA not set".to_string()))?;
    let temp_path = std::path::PathBuf::from(&app_data)
        .join("nexus")
        .join("restore_temp.db");

    api::download_backup(&access_token, &backup_id, &temp_path).await?;

    {
        let temp_conn = rusqlite::Connection::open(&temp_path)
            .map_err(|e| CommandError::Database(format!("failed to open backup db: {e}")))?;
        let has_schema_table: bool = temp_conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='schema_version'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !has_schema_table {
            let _ = std::fs::remove_file(&temp_path);
            return Err(CommandError::Parse(
                "Invalid backup file: no schema_version table found".to_string(),
            ));
        }

        let backup_version: u32 = temp_conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Database(format!("failed to read backup schema: {e}")))?;

        let current_version = {
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            crate::db::migrations::current_version(&conn)
                .map_err(|e| CommandError::Database(e.to_string()))?
        };

        if backup_version > current_version {
            let _ = std::fs::remove_file(&temp_path);
            return Err(CommandError::Parse(format!(
                "Backup schema version ({backup_version}) is newer than the app ({current_version}). Please update Nexus first."
            )));
        }
    }

    let db_path = db.db_path.clone();

    {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| CommandError::Database(format!("checkpoint failed: {e}")))?;
    }

    db.reopen_with_file(&temp_path)
        .map_err(|e| CommandError::Database(format!("restore failed: {e}")))?;

    let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
    let _ = std::fs::remove_file(db_path.with_extension("db-shm"));

    let _ = app.emit("backup-restored", serde_json::json!({}));

    eprintln!("[backup] restore complete");
    Ok(())
}

// ── Status & Config Commands ──────────────────────────────────────────

#[tauri::command]
pub async fn get_backup_status(
    db: State<'_, DbState>,
) -> Result<BackupStatus, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let email = tokens::load_user_email(&conn)?;
    let has_token = tokens::load_access_token(&conn)?.is_some();
    let last_backup_at = tokens::get_setting_raw(&conn, keys::BACKUP_LAST_AT)?;
    let frequency = tokens::get_setting_raw(&conn, keys::BACKUP_FREQUENCY)?
        .unwrap_or_else(|| "manual".to_string());
    let retention_count = tokens::get_setting_raw(&conn, keys::BACKUP_RETENTION_COUNT)?
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(5);

    Ok(BackupStatus {
        connected: has_token,
        email,
        last_backup_at,
        frequency,
        retention_count,
    })
}

#[tauri::command]
pub async fn set_backup_frequency(
    db: State<'_, DbState>,
    frequency: String,
) -> Result<(), CommandError> {
    let valid = ["manual", "daily", "weekly"];
    if !valid.contains(&frequency.as_str()) {
        return Err(CommandError::Parse(format!(
            "invalid frequency: {frequency}. Must be one of: manual, daily, weekly"
        )));
    }
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::set_setting_raw(&conn, keys::BACKUP_FREQUENCY, &frequency)?;
    Ok(())
}

#[tauri::command]
pub async fn set_backup_retention(
    db: State<'_, DbState>,
    count: u32,
) -> Result<(), CommandError> {
    if count == 0 || count > 100 {
        return Err(CommandError::Parse(
            "retention count must be between 1 and 100".to_string(),
        ));
    }
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::set_setting_raw(&conn, keys::BACKUP_RETENTION_COUNT, &count.to_string())?;
    Ok(())
}

// ── Backup Scheduler ──────────────────────────────────────────────────

const CHECK_INTERVAL_SECS: u64 = 30 * 60; // 30 minutes
const DAILY_SECS: i64 = 86400;
const WEEKLY_SECS: i64 = 7 * 86400;

/// Start the background backup scheduler. Checks every 30 minutes whether an
/// automatic backup is due based on the configured frequency and last backup time.
pub fn start_backup_scheduler(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(60));
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;

            let db = match app.try_state::<DbState>() {
                Some(s) => s,
                None => continue,
            };

            let should_backup = match check_backup_due(&db) {
                Ok(due) => due,
                Err(_) => continue,
            };

            if !should_backup {
                continue;
            }

            eprintln!("[backup-scheduler] automatic backup is due, starting...");

            let access_token = match ensure_valid_token_unmanaged(&db).await {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("[backup-scheduler] token error, skipping: {e}");
                    continue;
                }
            };

            let folder_id = match resolve_folder_id_unmanaged(&db, &access_token).await {
                Ok(id) => id,
                Err(e) => {
                    eprintln!("[backup-scheduler] folder error, skipping: {e}");
                    continue;
                }
            };

            let schema_version = {
                let conn = match db.conn.lock() {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                crate::db::migrations::current_version(&conn).unwrap_or(0)
            };

            let app_data = match std::env::var("APPDATA") {
                Ok(v) => v,
                Err(_) => continue,
            };
            let temp_path = std::path::PathBuf::from(&app_data)
                .join("nexus")
                .join("backup_temp.db");

            let vacuum_ok = {
                let conn = match db.conn.lock() {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                let sql = format!(
                    "VACUUM INTO '{}'",
                    temp_path.to_string_lossy().replace('\'', "''")
                );
                conn.execute_batch(&sql).is_ok()
            };

            if !vacuum_ok {
                eprintln!("[backup-scheduler] VACUUM INTO failed, skipping");
                continue;
            }

            let now_str = now_iso().replace(':', "-").trim_end_matches('Z').to_string();
            let file_name = format!("nexus-backup-{now_str}.db");

            match api::upload_backup(&access_token, &folder_id, &temp_path, &file_name, schema_version).await {
                Ok(_file_id) => {
                    eprintln!("[backup-scheduler] upload complete: {file_name}");
                    let completed_at = now_iso();
                    if let Ok(conn) = db.conn.lock() {
                        let _ = tokens::set_setting_raw(&conn, keys::BACKUP_LAST_AT, &completed_at);
                    }
                    let retention = db.conn.lock().ok()
                        .and_then(|c| tokens::get_setting_raw(&c, keys::BACKUP_RETENTION_COUNT).ok().flatten())
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(5);
                    let _ = api::prune_old_backups(&access_token, &folder_id, retention).await;
                    let _ = app.emit(
                        "backup-status-changed",
                        serde_json::json!({
                            "lastBackupAt": completed_at,
                            "success": true,
                            "fileName": file_name,
                            "automatic": true,
                        }),
                    );
                }
                Err(e) => {
                    eprintln!("[backup-scheduler] upload failed: {e}");
                    let _ = app.emit(
                        "backup-status-changed",
                        serde_json::json!({ "success": false, "error": e.to_string(), "automatic": true }),
                    );
                }
            }

            let _ = std::fs::remove_file(&temp_path);
        }
        });
    });
}

fn check_backup_due(db: &DbState) -> Result<bool, ()> {
    let conn = db.conn.lock().map_err(|_| ())?;

    let has_token = tokens::load_access_token(&conn).ok().flatten().is_some();
    if !has_token {
        return Ok(false);
    }

    let frequency = tokens::get_setting_raw(&conn, keys::BACKUP_FREQUENCY)
        .ok()
        .flatten()
        .unwrap_or_else(|| "manual".to_string());

    let interval_secs = match frequency.as_str() {
        "daily" => DAILY_SECS,
        "weekly" => WEEKLY_SECS,
        _ => return Ok(false),
    };

    let last_at = tokens::get_setting_raw(&conn, keys::BACKUP_LAST_AT).ok().flatten();

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    match last_at {
        Some(iso) => {
            let last_secs = super::utils::iso_to_epoch_secs(&iso).unwrap_or(0);
            Ok(now_secs - last_secs >= interval_secs)
        }
        None => Ok(true),
    }
}

/// Like `ensure_valid_token` but takes `&DbState` directly instead of `State<'_, DbState>`.
async fn ensure_valid_token_unmanaged(db: &DbState) -> Result<String, CommandError> {
    let (refresh_token_opt, expires_at_opt) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let refresh = tokens::load_refresh_token(&conn)?;
        let expires = tokens::load_expires_at(&conn)?;
        (refresh, expires)
    };

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let need_refresh = refresh_token_opt.is_some()
        && expires_at_opt.map_or(true, |e| now_secs >= e - REFRESH_THRESHOLD_SECS);

    if need_refresh {
        if let Some(refresh_token) = refresh_token_opt {
            let client_id = google_client_id()?;
            let client_secret = google_client_secret()?;
            match auth::refresh_access_token(client_id, client_secret, &refresh_token).await {
                Ok((access_token, new_refresh, expires_in)) => {
                    let new_expires_at = now_secs + expires_in;
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    let enc_access = tokens::encrypt(&access_token)?;
                    let enc_refresh = tokens::encrypt(&new_refresh)?;
                    tokens::set_setting_raw(&conn, keys::GDRIVE_ACCESS_TOKEN, &enc_access)?;
                    tokens::set_setting_raw(&conn, keys::GDRIVE_REFRESH_TOKEN, &enc_refresh)?;
                    tokens::set_setting_raw(
                        &conn,
                        keys::GDRIVE_TOKEN_EXPIRES_AT,
                        &new_expires_at.to_string(),
                    )?;
                    return Ok(access_token);
                }
                Err(e) => {
                    if matches!(e, CommandError::Auth(_)) {
                        let conn = db
                            .conn
                            .lock()
                            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                        let _ = tokens::clear_all(&conn);
                        return Err(e);
                    }
                    let hard_expired = expires_at_opt.map_or(true, |e| now_secs >= e);
                    if hard_expired {
                        return Err(e);
                    }
                }
            }
        }
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::load_access_token(&conn)?
        .ok_or_else(|| CommandError::Auth("Not connected to Google Drive".to_string()))
}

/// Like `resolve_folder_id` but takes `&DbState` directly.
async fn resolve_folder_id_unmanaged(
    db: &DbState,
    access_token: &str,
) -> Result<String, CommandError> {
    {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        if let Some(id) = tokens::load_folder_id(&conn)? {
            return Ok(id);
        }
    }

    let folder_id = api::ensure_backup_folder(access_token).await?;

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::set_setting_raw(&conn, keys::GDRIVE_FOLDER_ID, &folder_id)?;
    Ok(folder_id)
}
