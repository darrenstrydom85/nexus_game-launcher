//! Google Drive API v3 REST client for backup operations.
//! Handles folder management, resumable uploads, listing, downloading, and deletion.

use crate::commands::error::CommandError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_NAME: &str = "NexusBackups";
const FOLDER_MIME: &str = "application/vnd.google-apps.folder";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub created_at: String,
    pub schema_version: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveFile {
    id: Option<String>,
    name: Option<String>,
    size: Option<String>,
    created_time: Option<String>,
    #[serde(default)]
    app_properties: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct DriveFileList {
    files: Option<Vec<DriveFile>>,
}

fn http_client() -> Result<reqwest::Client, CommandError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))
}

fn map_reqwest_error(e: reqwest::Error) -> CommandError {
    if e.is_connect() || e.is_timeout() {
        CommandError::NetworkUnavailable(e.to_string())
    } else {
        CommandError::Unknown(e.to_string())
    }
}

/// Ensure the NexusBackups folder exists on Drive. Returns the folder ID.
pub async fn ensure_backup_folder(access_token: &str) -> Result<String, CommandError> {
    let client = http_client()?;

    let query = format!(
        "name='{}' and mimeType='{}' and trashed=false",
        FOLDER_NAME, FOLDER_MIME
    );
    let res = client
        .get(DRIVE_FILES_URL)
        .bearer_auth(access_token)
        .query(&[("q", query.as_str()), ("fields", "files(id,name)")])
        .send()
        .await
        .map_err(map_reqwest_error)?;

    check_response_status(&res)?;
    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    let list: DriveFileList = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("drive list json: {e}")))?;

    if let Some(files) = &list.files {
        if let Some(folder) = files.first() {
            if let Some(id) = &folder.id {
                eprintln!("[gdrive-api] found existing folder: {id}");
                return Ok(id.clone());
            }
        }
    }

    eprintln!("[gdrive-api] creating NexusBackups folder");
    let metadata = serde_json::json!({
        "name": FOLDER_NAME,
        "mimeType": FOLDER_MIME,
    });
    let res = client
        .post(DRIVE_FILES_URL)
        .bearer_auth(access_token)
        .json(&metadata)
        .send()
        .await
        .map_err(map_reqwest_error)?;

    check_response_status(&res)?;
    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    let file: DriveFile = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("drive create folder json: {e}")))?;
    file.id
        .ok_or_else(|| CommandError::Api("created folder has no id".to_string()))
}

/// Upload a file to Drive using resumable upload. Returns the file ID.
pub async fn upload_backup(
    access_token: &str,
    folder_id: &str,
    file_path: &Path,
    file_name: &str,
    schema_version: u32,
) -> Result<String, CommandError> {
    let client = http_client()?;
    let file_bytes = std::fs::read(file_path).map_err(CommandError::Io)?;
    let file_size = file_bytes.len();

    let metadata = serde_json::json!({
        "name": file_name,
        "parents": [folder_id],
        "appProperties": {
            "schemaVersion": schema_version.to_string(),
        },
    });

    eprintln!(
        "[gdrive-api] initiating resumable upload: {file_name} ({file_size} bytes)"
    );

    let init_res = client
        .post(format!("{DRIVE_UPLOAD_URL}?uploadType=resumable"))
        .bearer_auth(access_token)
        .header("Content-Type", "application/json; charset=UTF-8")
        .header("X-Upload-Content-Type", "application/x-sqlite3")
        .header("X-Upload-Content-Length", file_size.to_string())
        .body(metadata.to_string())
        .send()
        .await
        .map_err(map_reqwest_error)?;

    if !init_res.status().is_success() {
        let status = init_res.status().as_u16();
        let body = init_res
            .text()
            .await
            .unwrap_or_default();
        return Err(CommandError::Api(format!(
            "resumable upload init failed ({status}): {body}"
        )));
    }

    let session_uri = init_res
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| CommandError::Api("no Location header in resumable init".to_string()))?
        .to_string();

    eprintln!("[gdrive-api] uploading file bytes to session URI");
    let upload_res = client
        .put(&session_uri)
        .header("Content-Length", file_size.to_string())
        .header("Content-Type", "application/x-sqlite3")
        .body(file_bytes)
        .send()
        .await
        .map_err(map_reqwest_error)?;

    if !upload_res.status().is_success() {
        let status = upload_res.status().as_u16();
        let body = upload_res.text().await.unwrap_or_default();
        return Err(CommandError::Api(format!(
            "resumable upload failed ({status}): {body}"
        )));
    }

    let body = upload_res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    let file: DriveFile = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("upload response json: {e}")))?;
    let file_id = file
        .id
        .ok_or_else(|| CommandError::Api("uploaded file has no id".to_string()))?;
    eprintln!("[gdrive-api] upload complete: {file_id}");
    Ok(file_id)
}

/// List backup files in the NexusBackups folder, newest first.
pub async fn list_backups(
    access_token: &str,
    folder_id: &str,
) -> Result<Vec<BackupEntry>, CommandError> {
    let client = http_client()?;
    let query = format!("'{}' in parents and trashed=false", folder_id);
    let res = client
        .get(DRIVE_FILES_URL)
        .bearer_auth(access_token)
        .query(&[
            ("q", query.as_str()),
            (
                "fields",
                "files(id,name,size,createdTime,appProperties)",
            ),
            ("orderBy", "createdTime desc"),
            ("pageSize", "100"),
        ])
        .send()
        .await
        .map_err(map_reqwest_error)?;

    check_response_status(&res)?;
    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    let list: DriveFileList = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("list backups json: {e}")))?;

    let entries = list
        .files
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| {
            let id = f.id?;
            let name = f.name.unwrap_or_default();
            let size = f
                .size
                .as_deref()
                .unwrap_or("0")
                .parse::<u64>()
                .unwrap_or(0);
            let created_at = f.created_time.unwrap_or_default();
            let schema_version = f
                .app_properties
                .as_ref()
                .and_then(|p| p.get("schemaVersion"))
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);
            Some(BackupEntry {
                id,
                name,
                size,
                created_at,
                schema_version,
            })
        })
        .collect();

    Ok(entries)
}

/// Download a backup file from Drive to a local path.
pub async fn download_backup(
    access_token: &str,
    file_id: &str,
    dest_path: &Path,
) -> Result<(), CommandError> {
    let client = http_client()?;
    let url = format!("{DRIVE_FILES_URL}/{file_id}?alt=media");
    eprintln!("[gdrive-api] downloading backup {file_id}");

    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(map_reqwest_error)?;

    check_response_status(&res)?;
    let bytes = res
        .bytes()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    std::fs::write(dest_path, &bytes).map_err(CommandError::Io)?;
    eprintln!(
        "[gdrive-api] downloaded {} bytes to {}",
        bytes.len(),
        dest_path.display()
    );
    Ok(())
}

/// Delete a file from Drive by ID.
pub async fn delete_file(access_token: &str, file_id: &str) -> Result<(), CommandError> {
    let client = http_client()?;
    let url = format!("{DRIVE_FILES_URL}/{file_id}");
    let res = client
        .delete(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(map_reqwest_error)?;

    if res.status().as_u16() == 404 {
        return Ok(());
    }
    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(CommandError::Api(format!(
            "delete file failed ({status}): {body}"
        )));
    }
    Ok(())
}

/// Prune old backups beyond the retention count.
pub async fn prune_old_backups(
    access_token: &str,
    folder_id: &str,
    retention_count: usize,
) -> Result<u32, CommandError> {
    let backups = list_backups(access_token, folder_id).await?;
    let mut deleted = 0u32;
    if backups.len() > retention_count {
        for entry in backups.iter().skip(retention_count) {
            eprintln!("[gdrive-api] pruning old backup: {} ({})", entry.name, entry.id);
            delete_file(access_token, &entry.id).await?;
            deleted += 1;
        }
    }
    Ok(deleted)
}

fn check_response_status(res: &reqwest::Response) -> Result<(), CommandError> {
    let status = res.status().as_u16();
    if status == 401 {
        return Err(CommandError::Auth(
            "Google Drive token expired or revoked".to_string(),
        ));
    }
    if status == 403 {
        return Err(CommandError::Permission(
            "Google Drive access denied — check permissions".to_string(),
        ));
    }
    Ok(())
}
