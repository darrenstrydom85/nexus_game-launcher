use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::db::DbState;
use crate::metadata::cache;
use crate::metadata::hltb::HltbClient;
use crate::metadata::igdb::IgdbClient;
use crate::metadata::steamgriddb::{ArtworkType, SteamGridDbClient};
use crate::models::settings::keys;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataProgressEvent {
    pub game_id: String,
    pub game_name: String,
    pub status: MetadataStatus,
    pub progress: Option<f32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MetadataStatus {
    Queued,
    Fetching,
    Complete,
    Failed,
}

const MAX_RETRIES: u32 = 3;
const BACKOFF_BASE_MS: u64 = 1000;

struct FetchContext {
    steamgrid: Option<SteamGridDbClient>,
    igdb: Option<IgdbClient>,
    http: reqwest::Client,
}

fn get_setting_value(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
}

fn build_context(db: &DbState) -> Result<FetchContext, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;

    let steamgrid = get_setting_value(&conn, keys::STEAMGRID_API_KEY)
        .map(SteamGridDbClient::new);

    let igdb = {
        let client_id = get_setting_value(&conn, keys::IGDB_CLIENT_ID);
        let client_secret = get_setting_value(&conn, keys::IGDB_CLIENT_SECRET);
        let cached_token = get_setting_value(&conn, keys::IGDB_ACCESS_TOKEN);
        let cached_expires = get_setting_value(&conn, keys::IGDB_TOKEN_EXPIRES)
            .and_then(|s| s.parse::<i64>().ok());

        match (client_id, client_secret) {
            (Some(id), Some(secret)) => {
                if let (Some(token), Some(expires)) = (cached_token, cached_expires) {
                    Some(IgdbClient::with_cached_token(id, secret, token, expires))
                } else {
                    Some(IgdbClient::new(id, secret))
                }
            }
            _ => None,
        }
    };

    Ok(FetchContext {
        steamgrid,
        igdb,
        http: reqwest::Client::new(),
    })
}

fn save_igdb_token(db: &DbState, token: &str, expires: i64) {
    if let Ok(conn) = db.conn.lock() {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![keys::IGDB_ACCESS_TOKEN, token],
        );
        let _ = conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![keys::IGDB_TOKEN_EXPIRES, expires.to_string()],
        );
    }
}

pub async fn fetch_metadata_for_game(
    db: &DbState,
    app_handle: &tauri::AppHandle,
    game_id: &str,
) -> Result<(), String> {
    let ctx = build_context(db)?;

    let (game_name, source, source_id) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| format!("lock poisoned: {e}"))?;
        let row = conn
            .query_row(
                "SELECT name, source, source_id FROM games WHERE id = ?1",
                params![game_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .map_err(|e| format!("game not found: {e}"))?;
        row
    };

    emit_progress(app_handle, game_id, &game_name, MetadataStatus::Fetching, None, None);

    // Fetch IGDB metadata if available
    if let Some(ref igdb) = ctx.igdb {
        match fetch_igdb_metadata(igdb, db, game_id, &game_name).await {
            Ok(()) => {
                if let Some(info) = igdb.get_cached_token_info() {
                    save_igdb_token(db, &info.0, info.1);
                }
            }
            Err(e) => {
                log::warn!("IGDB metadata fetch failed for {game_name}: {e}");
            }
        }
    }

    // Fetch HLTB data (no API key required; runs after IGDB at lower priority)
    {
        let needs_hltb = {
            let conn = db.conn.lock().map_err(|e| format!("lock poisoned: {e}"))?;
            conn.query_row(
                "SELECT hltb_main_s FROM games WHERE id = ?1",
                params![game_id],
                |row| row.get::<_, Option<i64>>(0),
            )
            .ok()
            .flatten()
            .is_none()
        };

        if needs_hltb {
            let hltb = HltbClient::new();
            match hltb.search(&game_name).await {
                Ok(Some(result)) => {
                    if let Ok(conn) = db.conn.lock() {
                        let _ = conn.execute(
                            "UPDATE games SET hltb_game_id = ?1, hltb_main_s = ?2, \
                             hltb_main_plus_s = ?3, hltb_completionist_s = ?4, updated_at = ?5 \
                             WHERE id = ?6",
                            params![
                                result.game_id,
                                result.comp_main,
                                result.comp_plus,
                                result.comp_100,
                                crate::commands::utils::now_iso(),
                                game_id,
                            ],
                        );
                    }
                }
                Ok(None) => {
                    // No match — store sentinel to prevent repeated searches
                    if let Ok(conn) = db.conn.lock() {
                        let _ = conn.execute(
                            "UPDATE games SET hltb_main_s = -1, updated_at = ?1 WHERE id = ?2",
                            params![crate::commands::utils::now_iso(), game_id],
                        );
                    }
                }
                Err(e) => {
                    log::warn!("HLTB fetch failed for {game_name}: {e}");
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }

    // Fetch SteamGridDB artwork if available
    if let Some(ref steamgrid) = ctx.steamgrid {
        let steam_appid = if source == "steam" { source_id.as_deref() } else { None };
        match fetch_steamgrid_artwork(steamgrid, &ctx.http, db, game_id, &game_name, steam_appid).await {
            Ok(()) => {}
            Err(e) => {
                log::warn!("SteamGridDB artwork fetch failed for {game_name}: {e}");
            }
        }
    }

    emit_progress(app_handle, game_id, &game_name, MetadataStatus::Complete, Some(1.0), None);
    Ok(())
}

async fn fetch_igdb_metadata(
    igdb: &IgdbClient,
    db: &DbState,
    game_id: &str,
    game_name: &str,
) -> Result<(), String> {
    let results = igdb.search_game(game_name).await?;
    let best = IgdbClient::best_match(&results, game_name)
        .ok_or_else(|| format!("no IGDB match for {game_name}"))?;

    let meta = IgdbClient::extract_metadata(best);

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;

    let screenshot_json = if meta.screenshot_urls.is_empty() {
        None
    } else {
        Some(meta.screenshot_urls.join(","))
    };

    conn.execute(
        "UPDATE games SET igdb_id = ?1, description = ?2, release_date = ?3, \
         developer = ?4, publisher = ?5, genres = ?6, screenshot_urls = ?7, \
         trailer_url = ?8, critic_score = ?9, critic_score_count = ?10, \
         community_score = ?11, community_score_count = ?12, updated_at = ?13 WHERE id = ?14",
        params![
            meta.igdb_id,
            meta.description,
            meta.release_date,
            meta.developer,
            meta.publisher,
            meta.genres,
            screenshot_json,
            meta.trailer_url,
            meta.critic_score,
            meta.critic_score_count,
            meta.community_score,
            meta.community_score_count,
            crate::commands::utils::now_iso(),
            game_id,
        ],
    )
    .map_err(|e| format!("failed to update game metadata: {e}"))?;

    // If IGDB provided a cover and we don't have SteamGridDB artwork, use it
    if let Some(ref cover_url) = meta.cover_url {
        let existing_cover: Option<String> = conn
            .query_row(
                "SELECT cover_url FROM games WHERE id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        if existing_cover.is_none() {
            let _ = conn.execute(
                "UPDATE games SET cover_url = ?1 WHERE id = ?2",
                params![cover_url, game_id],
            );
        }
    }

    Ok(())
}

async fn fetch_steamgrid_artwork(
    steamgrid: &SteamGridDbClient,
    http: &reqwest::Client,
    db: &DbState,
    game_id: &str,
    game_name: &str,
    steam_appid: Option<&str>,
) -> Result<(), String> {
    let steamgrid_id = if let Some(appid) = steam_appid {
        // Steam shortcut: try to get images directly by Steam AppID
        let images = steamgrid
            .get_images_by_steam_appid(appid, ArtworkType::Grid)
            .await;
        if images.is_ok() {
            // Search for the game to get the steamgrid_id for other artwork types
            let results = steamgrid.search_game(game_name).await?;
            SteamGridDbClient::best_match(&results, game_name).map(|r| r.id)
        } else {
            let results = steamgrid.search_game(game_name).await?;
            SteamGridDbClient::best_match(&results, game_name).map(|r| r.id)
        }
    } else {
        let results = steamgrid.search_game(game_name).await?;
        SteamGridDbClient::best_match(&results, game_name).map(|r| r.id)
    };

    let steamgrid_id = steamgrid_id.ok_or_else(|| format!("no SteamGridDB match for {game_name}"))?;

    let artwork = steamgrid.fetch_artwork_set(steamgrid_id).await?;

    // Download and cache images
    let cached = cache::download_and_cache_artwork(
        http,
        game_id,
        artwork.grid.as_deref(),
        artwork.hero.as_deref(),
        artwork.logo.as_deref(),
        artwork.icon.as_deref(),
        &[],
    )
    .await?;

    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;

    let cover_url = artwork.grid.clone()
        .or(cached.cover_path);
    let hero_url = artwork.hero.clone()
        .or(cached.hero_path);
    let logo_url = artwork.logo.clone()
        .or(cached.logo_path);

    conn.execute(
        "UPDATE games SET steamgrid_id = ?1, cover_url = ?2, hero_url = ?3, \
         logo_url = ?4, updated_at = ?5 WHERE id = ?6",
        params![
            steamgrid_id,
            cover_url,
            hero_url,
            logo_url,
            crate::commands::utils::now_iso(),
            game_id,
        ],
    )
    .map_err(|e| format!("failed to update game artwork: {e}"))?;

    Ok(())
}

pub async fn fetch_artwork_for_game(
    db: &DbState,
    app_handle: &tauri::AppHandle,
    game_id: &str,
) -> Result<(), String> {
    let ctx = build_context(db)?;

    let (game_name, source, source_id) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| format!("lock poisoned: {e}"))?;
        conn.query_row(
            "SELECT name, source, source_id FROM games WHERE id = ?1",
            params![game_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .map_err(|e| format!("game not found: {e}"))?
    };

    emit_progress(app_handle, game_id, &game_name, MetadataStatus::Fetching, None, None);

    if let Some(ref steamgrid) = ctx.steamgrid {
        let steam_appid = if source == "steam" { source_id.as_deref() } else { None };
        fetch_steamgrid_artwork(steamgrid, &ctx.http, db, game_id, &game_name, steam_appid).await?;
    }

    emit_progress(app_handle, game_id, &game_name, MetadataStatus::Complete, Some(1.0), None);
    Ok(())
}

pub async fn run_background_pipeline(
    db: Arc<DbState>,
    app_handle: tauri::AppHandle,
    game_ids: Vec<String>,
) {
    let total = game_ids.len() as f32;

    for (i, game_id) in game_ids.iter().enumerate() {
        let progress = (i as f32) / total;

        let mut last_err = None;
        for attempt in 0..MAX_RETRIES {
            match fetch_metadata_for_game(&db, &app_handle, game_id).await {
                Ok(()) => {
                    last_err = None;
                    break;
                }
                Err(e) => {
                    last_err = Some(e.clone());
                    if attempt < MAX_RETRIES - 1 {
                        let delay = BACKOFF_BASE_MS * 2u64.pow(attempt);
                        tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                    }
                }
            }
        }

        if let Some(err) = last_err {
            let game_name = {
                db.conn
                    .lock()
                    .ok()
                    .and_then(|conn| {
                        conn.query_row(
                            "SELECT name FROM games WHERE id = ?1",
                            params![game_id],
                            |row| row.get::<_, String>(0),
                        )
                        .ok()
                    })
                    .unwrap_or_else(|| game_id.clone())
            };
            emit_progress(
                &app_handle,
                game_id,
                &game_name,
                MetadataStatus::Failed,
                Some(progress),
                Some(err),
            );
        }
    }
}

fn emit_progress(
    app_handle: &tauri::AppHandle,
    game_id: &str,
    game_name: &str,
    status: MetadataStatus,
    progress: Option<f32>,
    error: Option<String>,
) {
    use tauri::Emitter;
    let event = MetadataProgressEvent {
        game_id: game_id.to_string(),
        game_name: game_name.to_string(),
        status,
        progress,
        error,
    };
    let _ = app_handle.emit("metadata-progress", &event);
}

// ── Score Backfill ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreBackfillProgressEvent {
    pub completed: usize,
    pub total: usize,
}

const BACKFILL_BATCH_SIZE: usize = 10;

/// Returns (igdb_id, game_id) pairs for games that have an IGDB match but no critic score yet.
pub fn find_games_needing_score_backfill(conn: &rusqlite::Connection) -> Vec<(i64, String)> {
    let mut stmt = match conn.prepare(
        "SELECT igdb_id, id FROM games \
         WHERE igdb_id IS NOT NULL AND critic_score IS NULL AND is_hidden = 0",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let rows = match stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    rows.filter_map(|r| r.ok()).collect()
}

/// Fetches rating fields for up to `BACKFILL_BATCH_SIZE` IGDB IDs in a single request.
pub async fn fetch_scores_batch(
    igdb: &IgdbClient,
    igdb_ids: &[i64],
) -> Result<Vec<crate::metadata::igdb::IgdbGame>, String> {
    if igdb_ids.is_empty() {
        return Ok(vec![]);
    }
    let ids_str = igdb_ids
        .iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let query = format!(
        "fields aggregated_rating,aggregated_rating_count,rating,rating_count,\
         total_rating,total_rating_count; where id = ({ids_str}); limit {BACKFILL_BATCH_SIZE};"
    );

    let body = igdb.igdb_post_pub("games", &query).await?;
    let games: Vec<crate::metadata::igdb::IgdbGame> =
        serde_json::from_str(&body).map_err(|e| format!("IGDB parse error: {e}"))?;
    Ok(games)
}

/// Persists score fields for a single game by IGDB ID.
fn persist_scores(
    conn: &rusqlite::Connection,
    game_id: &str,
    igdb_game: &crate::metadata::igdb::IgdbGame,
) -> Result<(), String> {
    conn.execute(
        "UPDATE games SET critic_score = ?1, critic_score_count = ?2, \
         community_score = ?3, community_score_count = ?4, updated_at = ?5 \
         WHERE id = ?6",
        params![
            igdb_game.aggregated_rating,
            igdb_game.aggregated_rating_count,
            igdb_game.rating,
            igdb_game.rating_count,
            crate::commands::utils::now_iso(),
            game_id,
        ],
    )
    .map_err(|e| format!("failed to persist scores: {e}"))?;
    Ok(())
}

/// Runs the score backfill pipeline. Fetches rating fields for all library games that have
/// an IGDB ID but no critic score yet. Runs at lower priority than the main metadata pipeline.
/// Safe to call multiple times — idempotent (skips already-scored games).
pub async fn run_score_backfill(db: Arc<DbState>, app_handle: tauri::AppHandle) {
    use tauri::Emitter;

    // Build IGDB client — silently skip if keys are not configured.
    let igdb = {
        let conn = match db.conn.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        let client_id = get_setting_value(&conn, keys::IGDB_CLIENT_ID);
        let client_secret = get_setting_value(&conn, keys::IGDB_CLIENT_SECRET);
        let cached_token = get_setting_value(&conn, keys::IGDB_ACCESS_TOKEN);
        let cached_expires = get_setting_value(&conn, keys::IGDB_TOKEN_EXPIRES)
            .and_then(|s| s.parse::<i64>().ok());

        match (client_id, client_secret) {
            (Some(id), Some(secret)) => {
                if let (Some(token), Some(expires)) = (cached_token, cached_expires) {
                    IgdbClient::with_cached_token(id, secret, token, expires)
                } else {
                    IgdbClient::new(id, secret)
                }
            }
            _ => return, // No IGDB keys — silent skip
        }
    };

    // Collect games needing backfill.
    let games_to_backfill: Vec<(i64, String)> = {
        let conn = match db.conn.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        find_games_needing_score_backfill(&conn)
    };

    let total = games_to_backfill.len();
    if total == 0 {
        return;
    }

    let mut completed = 0usize;

    // Process in batches of BACKFILL_BATCH_SIZE.
    for chunk in games_to_backfill.chunks(BACKFILL_BATCH_SIZE) {
        let igdb_ids: Vec<i64> = chunk.iter().map(|(igdb_id, _)| *igdb_id).collect();

        let igdb_games = match fetch_scores_batch(&igdb, &igdb_ids).await {
            Ok(g) => g,
            Err(e) => {
                log::warn!("Score backfill batch failed: {e}");
                // Count the batch as processed even on error to keep progress accurate.
                completed += chunk.len();
                let _ = app_handle.emit(
                    "score-backfill-progress",
                    &ScoreBackfillProgressEvent { completed, total },
                );
                continue;
            }
        };

        // Build a map from igdb_id → game data for fast lookup.
        let igdb_map: std::collections::HashMap<i64, &crate::metadata::igdb::IgdbGame> =
            igdb_games.iter().map(|g| (g.id, g)).collect();

        if let Ok(conn) = db.conn.lock() {
            for (igdb_id, game_id) in chunk {
                if let Some(igdb_game) = igdb_map.get(igdb_id) {
                    let _ = persist_scores(&conn, game_id, igdb_game);
                }
                completed += 1;
            }
        }

        let _ = app_handle.emit(
            "score-backfill-progress",
            &ScoreBackfillProgressEvent { completed, total },
        );
    }

    // Persist updated token if refreshed.
    if let Some(info) = igdb.get_cached_token_info() {
        if let Ok(conn) = db.conn.lock() {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![keys::IGDB_ACCESS_TOKEN, info.0],
            );
            let _ = conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![keys::IGDB_TOKEN_EXPIRES, info.1.to_string()],
            );
        }
    }
}

// ── HLTB Backfill ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HltbBackfillProgressEvent {
    pub completed: usize,
    pub total: usize,
    pub current_game: String,
    pub found: usize,
    pub not_found: usize,
    pub errored: usize,
}

/// Returns (game_id, name) pairs for games that need HLTB data fetched.
/// When `force` is true, also includes games with the sentinel value -1 (previously not found).
pub fn find_games_needing_hltb_backfill(conn: &rusqlite::Connection, force: bool) -> Vec<(String, String)> {
    let sql = if force {
        "SELECT id, name FROM games WHERE (hltb_main_s IS NULL OR hltb_main_s = -1) AND name IS NOT NULL AND name != '' AND is_hidden = 0"
    } else {
        "SELECT id, name FROM games WHERE hltb_main_s IS NULL AND name IS NOT NULL AND name != '' AND is_hidden = 0"
    };
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let rows = match stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    rows.filter_map(|r| r.ok()).collect()
}

/// Runs the HLTB backfill pipeline. Fetches completion times for all library games
/// that have not yet been searched. Uses 1 req/s rate limiting. Idempotent — safe to run
/// multiple times. Games with no HLTB match are marked with sentinel value -1.
pub async fn run_hltb_backfill(
    db: Arc<DbState>,
    app_handle: tauri::AppHandle,
    cancel: Arc<AtomicBool>,
    force: bool,
) {
    let games_to_backfill: Vec<(String, String)> = {
        let conn = match db.conn.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        find_games_needing_hltb_backfill(&conn, force)
    };

    run_hltb_backfill_for_games(db, app_handle, cancel, games_to_backfill).await;
}

/// Runs the HLTB backfill for a specific list of (game_id, game_name) pairs.
/// Use this when the caller has already queried the games to avoid a TOCTOU race
/// where the startup backfill processes them between query and execution.
pub async fn run_hltb_backfill_for_games(
    db: Arc<DbState>,
    app_handle: tauri::AppHandle,
    cancel: Arc<AtomicBool>,
    games_to_backfill: Vec<(String, String)>,
) {
    use tauri::Emitter;

    let total = games_to_backfill.len();
    if total == 0 {
        return;
    }

    let hltb = crate::metadata::hltb::HltbClient::new();
    let mut completed = 0usize;
    let mut found = 0usize;
    let mut not_found = 0usize;
    let mut errored = 0usize;

    for (game_id, game_name) in &games_to_backfill {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        let _ = app_handle.emit(
            "hltb-backfill-progress",
            &HltbBackfillProgressEvent {
                completed,
                total,
                current_game: game_name.clone(),
                found,
                not_found,
                errored,
            },
        );

        match hltb.search(game_name).await {
            Ok(Some(result)) => {
                found += 1;
                if let Ok(conn) = db.conn.lock() {
                    let _ = conn.execute(
                        "UPDATE games SET hltb_game_id = ?1, hltb_main_s = ?2, \
                         hltb_main_plus_s = ?3, hltb_completionist_s = ?4, updated_at = ?5 \
                         WHERE id = ?6",
                        params![
                            result.game_id,
                            result.comp_main,
                            result.comp_plus,
                            result.comp_100,
                            crate::commands::utils::now_iso(),
                            game_id,
                        ],
                    );
                }
            }
            Ok(None) => {
                not_found += 1;
                if let Ok(conn) = db.conn.lock() {
                    let _ = conn.execute(
                        "UPDATE games SET hltb_main_s = -1, updated_at = ?1 WHERE id = ?2",
                        params![crate::commands::utils::now_iso(), game_id],
                    );
                }
            }
            Err(e) => {
                errored += 1;
                log::warn!("HLTB backfill failed for {game_name}: {e}");
            }
        }

        completed += 1;

        // Rate limit: 1 req/s
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    // Emit final progress with summary
    let _ = app_handle.emit(
        "hltb-backfill-progress",
        &HltbBackfillProgressEvent {
            completed,
            total,
            current_game: String::new(),
            found,
            not_found,
            errored,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_progress_event_serializes() {
        let event = MetadataProgressEvent {
            game_id: "g1".into(),
            game_name: "Test Game".into(),
            status: MetadataStatus::Fetching,
            progress: Some(0.5),
            error: None,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"gameId\":\"g1\""));
        assert!(json.contains("\"status\":\"fetching\""));
        assert!(json.contains("\"progress\":0.5"));
    }

    #[test]
    fn metadata_status_variants_serialize() {
        let statuses = [
            (MetadataStatus::Queued, "\"queued\""),
            (MetadataStatus::Fetching, "\"fetching\""),
            (MetadataStatus::Complete, "\"complete\""),
            (MetadataStatus::Failed, "\"failed\""),
        ];
        for (status, expected) in &statuses {
            let json = serde_json::to_string(status).unwrap();
            assert_eq!(&json, expected);
        }
    }

    // ── Score Backfill Tests ──

    fn setup_db() -> crate::db::DbState {
        crate::db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_game_with_igdb(
        conn: &rusqlite::Connection,
        id: &str,
        igdb_id: i64,
        critic_score: Option<f64>,
    ) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, igdb_id, critic_score, added_at, updated_at) \
             VALUES (?1, ?2, 'steam', 'backlog', ?3, ?4, '2026-01-01', '2026-01-01')",
            params![id, format!("Game {id}"), igdb_id, critic_score],
        )
        .unwrap();
    }

    fn insert_game_without_igdb(conn: &rusqlite::Connection, id: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) \
             VALUES (?1, ?2, 'steam', 'backlog', '2026-01-01', '2026-01-01')",
            params![id, format!("Game {id}")],
        )
        .unwrap();
    }

    #[test]
    fn find_games_needing_backfill_returns_unscored_igdb_games() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_with_igdb(&conn, "g1", 100, None);    // needs backfill
        insert_game_with_igdb(&conn, "g2", 200, Some(87.5)); // already scored
        insert_game_without_igdb(&conn, "g3");             // no igdb_id

        let results = find_games_needing_score_backfill(&conn);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, 100); // igdb_id
        assert_eq!(results[0].1, "g1"); // game_id
    }

    #[test]
    fn find_games_needing_backfill_empty_when_all_scored() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_with_igdb(&conn, "g1", 100, Some(90.0));
        insert_game_with_igdb(&conn, "g2", 200, Some(70.0));

        let results = find_games_needing_score_backfill(&conn);
        assert!(results.is_empty());
    }

    #[test]
    fn find_games_needing_backfill_empty_when_no_igdb_ids() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_without_igdb(&conn, "g1");
        insert_game_without_igdb(&conn, "g2");

        let results = find_games_needing_score_backfill(&conn);
        assert!(results.is_empty());
    }

    #[test]
    fn find_games_needing_backfill_idempotent_after_scoring() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_with_igdb(&conn, "g1", 100, None);

        // First call — should find the game.
        let first = find_games_needing_score_backfill(&conn);
        assert_eq!(first.len(), 1);

        // Simulate scoring the game.
        conn.execute(
            "UPDATE games SET critic_score = 85.0 WHERE id = 'g1'",
            [],
        )
        .unwrap();

        // Second call — should find nothing (idempotent).
        let second = find_games_needing_score_backfill(&conn);
        assert!(second.is_empty());
    }

    #[test]
    fn find_games_needing_backfill_returns_multiple() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        for i in 1..=12 {
            insert_game_with_igdb(&conn, &format!("g{i}"), i as i64 * 10, None);
        }

        let results = find_games_needing_score_backfill(&conn);
        assert_eq!(results.len(), 12);
    }

    #[test]
    fn score_backfill_progress_event_serializes() {
        let event = ScoreBackfillProgressEvent { completed: 5, total: 47 };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"completed\":5"));
        assert!(json.contains("\"total\":47"));
    }

    #[test]
    fn backfill_batch_size_is_10() {
        assert_eq!(BACKFILL_BATCH_SIZE, 10);
    }

    // ── HLTB Backfill Tests ──

    fn insert_game_for_hltb(
        conn: &rusqlite::Connection,
        id: &str,
        name: Option<&str>,
        hltb_main_s: Option<i64>,
    ) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, hltb_main_s, added_at, updated_at) \
             VALUES (?1, ?2, 'steam', 'backlog', ?3, '2026-01-01', '2026-01-01')",
            rusqlite::params![id, name, hltb_main_s],
        )
        .unwrap();
    }

    #[test]
    fn find_games_needing_hltb_backfill_returns_null_games() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_for_hltb(&conn, "g1", Some("Game One"), None);
        insert_game_for_hltb(&conn, "g2", Some("Game Two"), Some(36000));
        insert_game_for_hltb(&conn, "g3", Some("Game Three"), Some(-1));

        let results = find_games_needing_hltb_backfill(&conn, false);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "g1");
        assert_eq!(results[0].1, "Game One");
    }

    #[test]
    fn find_games_needing_hltb_backfill_skips_sentinel() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_for_hltb(&conn, "g1", Some("Obscure Game"), Some(-1));

        let results = find_games_needing_hltb_backfill(&conn, false);
        assert!(results.is_empty());
    }

    #[test]
    fn find_games_needing_hltb_backfill_skips_null_name() {
        // games.name has a NOT NULL constraint, so we test with empty string instead
        // (the query filters both NULL and empty string)
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_for_hltb(&conn, "g1", Some(""), None);

        let results = find_games_needing_hltb_backfill(&conn, false);
        assert!(results.is_empty());
    }

    #[test]
    fn find_games_needing_hltb_backfill_skips_empty_name() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_for_hltb(&conn, "g1", Some(""), None);

        let results = find_games_needing_hltb_backfill(&conn, false);
        assert!(results.is_empty());
    }

    #[test]
    fn find_games_needing_hltb_backfill_idempotent() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game_for_hltb(&conn, "g1", Some("Game One"), None);

        let first = find_games_needing_hltb_backfill(&conn, false);
        assert_eq!(first.len(), 1);

        conn.execute(
            "UPDATE games SET hltb_main_s = 36000 WHERE id = 'g1'",
            [],
        )
        .unwrap();

        let second = find_games_needing_hltb_backfill(&conn, false);
        assert!(second.is_empty());
    }

    #[test]
    fn find_games_needing_hltb_backfill_returns_multiple() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        for i in 1..=5 {
            insert_game_for_hltb(&conn, &format!("g{i}"), Some(&format!("Game {i}")), None);
        }

        let results = find_games_needing_hltb_backfill(&conn, false);
        assert_eq!(results.len(), 5);
    }

    #[test]
    fn hltb_backfill_progress_event_serializes() {
        let event = HltbBackfillProgressEvent {
            completed: 12,
            total: 47,
            current_game: "DOOM Eternal".into(),
            found: 8,
            not_found: 3,
            errored: 1,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"completed\":12"));
        assert!(json.contains("\"total\":47"));
        assert!(json.contains("\"currentGame\":\"DOOM Eternal\""));
        assert!(json.contains("\"found\":8"));
        assert!(json.contains("\"notFound\":3"));
        assert!(json.contains("\"errored\":1"));
    }
}
