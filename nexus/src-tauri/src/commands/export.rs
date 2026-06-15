//! Stats export commands.
//!
//! `export_stats_zip` packages a frontend-built HTML page together with the
//! cover images it references into a single `.zip`. The HTML references images
//! by relative path (e.g. `assets/covers/<id>.jpg`); this command writes those
//! files alongside `index.html` so the unpacked folder can be hosted as a
//! static site or opened locally. Image bytes come from the local artwork cache
//! (file paths) or are fetched from remote URLs (e.g. SteamGridDB). Failed
//! images are skipped, not fatal -- the HTML falls back to a gradient tile.

use std::collections::HashSet;
use std::io::Write;

use serde::{Deserialize, Serialize};
use tauri::{command, Emitter};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::commands::error::CommandError;

/// Event name the frontend listens on for HTML/zip export progress.
const PROGRESS_EVENT: &str = "nexus://stats-export-progress";

/// One image to package into the zip. `source` is the original cover URL or
/// local cache path; `rel_path` is where it should live inside the archive
/// (and must match the `src` the HTML references).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAsset {
    pub source: String,
    pub rel_path: String,
}

/// Summary returned to the frontend so it can surface "N images packaged".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportZipResult {
    pub assets_written: usize,
    pub assets_failed: usize,
}

/// Progress event payload emitted while packaging images so the UI can render
/// a progress bar. `current` counts processed images (success or skip).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    current: usize,
    total: usize,
}

/// Resolve an asset's bytes from either a remote URL or a local file path.
/// Returns `None` on any failure so the caller can skip it gracefully.
async fn fetch_asset_bytes(client: &reqwest::Client, source: &str) -> Option<Vec<u8>> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let resp = client.get(trimmed).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let bytes = resp.bytes().await.ok()?;
        Some(bytes.to_vec())
    } else {
        std::fs::read(trimmed).ok()
    }
}

/// Write a frontend-built HTML page plus its referenced cover images into a zip
/// at `dest_path`. The archive contains `index.html` and the assets at their
/// `rel_path`s. Image retrieval is best-effort: failures are counted and
/// skipped rather than aborting the whole export.
#[command]
pub async fn export_stats_zip(
    app: tauri::AppHandle,
    dest_path: String,
    html: String,
    assets: Vec<ExportAsset>,
) -> Result<ExportZipResult, CommandError> {
    let client = reqwest::Client::new();

    // De-duplicate by rel_path so the same cover shared across sections is
    // fetched once, and so the emitted total matches the work actually done.
    let mut seen: HashSet<String> = HashSet::new();
    let unique: Vec<&ExportAsset> = assets
        .iter()
        .filter(|a| seen.insert(a.rel_path.clone()))
        .collect();

    let total = unique.len();
    let _ = app.emit(PROGRESS_EVENT, ExportProgress { current: 0, total });

    // Resolve all asset bytes first (a simple sequential pass keeps memory
    // bounded and lets us report progress per image -- the network fetches are
    // the slow part the progress bar is for).
    let mut resolved: Vec<(String, Vec<u8>)> = Vec::new();
    let mut assets_failed = 0usize;

    for (i, asset) in unique.iter().enumerate() {
        match fetch_asset_bytes(&client, &asset.source).await {
            Some(bytes) => resolved.push((asset.rel_path.clone(), bytes)),
            None => assets_failed += 1,
        }
        let _ = app.emit(
            PROGRESS_EVENT,
            ExportProgress {
                current: i + 1,
                total,
            },
        );
    }

    // Build the archive on disk.
    let file = std::fs::File::create(&dest_path)?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    archive
        .start_file("index.html", options)
        .map_err(|e| CommandError::Unknown(format!("zip index.html: {e}")))?;
    archive
        .write_all(html.as_bytes())
        .map_err(|e| CommandError::Unknown(format!("zip write html: {e}")))?;

    let mut assets_written = 0usize;
    for (rel_path, bytes) in resolved {
        // Images are already compressed (jpg/png/webp); store them without
        // re-deflating to save CPU and avoid pointless work.
        let img_options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        if archive.start_file(&rel_path, img_options).is_err() {
            assets_failed += 1;
            continue;
        }
        if archive.write_all(&bytes).is_err() {
            assets_failed += 1;
            continue;
        }
        assets_written += 1;
    }

    archive
        .finish()
        .map_err(|e| CommandError::Unknown(format!("zip finish: {e}")))?;

    Ok(ExportZipResult {
        assets_written,
        assets_failed,
    })
}
