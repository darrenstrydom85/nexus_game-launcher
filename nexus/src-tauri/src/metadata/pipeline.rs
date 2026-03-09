use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::commands::utils;
use crate::db::DbState;
use crate::metadata::cache;
use crate::metadata::igdb::IgdbClient;
use crate::metadata::steamgriddb::{ArtworkType, SteamGridDbClient};
use crate::models::settings::keys;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSyncError {
    pub source: String,
    pub game_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataProgressEvent {
    pub phase: String,
    pub completed: usize,
    pub total: usize,
    pub current_game: Option<String>,
    pub trigger: String,
    pub error: Option<MetadataSyncError>,
    // Legacy fields for Story 4.4 / metadataStore backward compatibility
    pub game_id: String,
    pub game_name: String,
    pub status: MetadataStatus,
    pub progress: Option<f32>,
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

/// Context for emitting progress when running in a batch (run_background_pipeline).
pub struct ProgressContext {
    pub completed: usize,
    pub total: usize,
    pub trigger: String,
}

pub async fn fetch_metadata_for_game(
    db: &DbState,
    app_handle: &tauri::AppHandle,
    game_id: &str,
    progress: Option<&ProgressContext>,
) -> Result<(), MetadataSyncError> {
    let ctx = build_context(db).map_err(|e| MetadataSyncError {
        source: "Metadata".into(),
        game_id: game_id.to_string(),
        message: e,
    })?;

    let (game_name, source, source_id) = {
        let conn = db.conn.lock().map_err(|e| MetadataSyncError {
            source: "Metadata".into(),
            game_id: game_id.to_string(),
            message: format!("lock poisoned: {e}"),
        })?;
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
            .map_err(|e| MetadataSyncError {
                source: "Metadata".into(),
                game_id: game_id.to_string(),
                message: format!("game not found: {e}"),
            })?;
        row
    };

    let (completed, total, trigger) = progress
        .map(|p| (p.completed, p.total, p.trigger.as_str()))
        .unwrap_or((1, 1, "resync"));

    emit_progress(
        app_handle,
        "metadata",
        completed,
        total,
        Some(&game_name),
        trigger,
        game_id,
        &game_name,
        MetadataStatus::Fetching,
        None,
        None,
    );

    // Use normalized title for API lookups (TM, (R), ® etc. break IGDB/SteamGridDB matching)
    let search_name = utils::normalize_game_title(&game_name);

    // Fetch IGDB metadata if available
    if let Some(ref igdb) = ctx.igdb {
        match fetch_igdb_metadata(igdb, db, game_id, &search_name).await {
            Ok(()) => {
                if let Some(info) = igdb.get_cached_token_info() {
                    save_igdb_token(db, &info.0, info.1);
                }
            }
            Err(e) => {
                log::warn!("IGDB metadata fetch failed for {game_name}: {e}");
                return Err(MetadataSyncError {
                    source: "IGDB".into(),
                    game_id: game_id.to_string(),
                    message: e,
                });
            }
        }
    }

    // Fetch SteamGridDB artwork if available
    if let Some(ref steamgrid) = ctx.steamgrid {
        let steam_appid = if source == "steam" { source_id.as_deref() } else { None };
        if let Err(e) = fetch_steamgrid_artwork(
            steamgrid,
            &ctx.http,
            db,
            game_id,
            &search_name,
            steam_appid,
        )
        .await
        {
            log::warn!("SteamGridDB artwork fetch failed for {game_name}: {e}");
            return Err(MetadataSyncError {
                source: "SteamGridDB".into(),
                game_id: game_id.to_string(),
                message: e,
            });
        }
    }

    emit_progress(
        app_handle,
        "metadata",
        completed + 1,
        total,
        None,
        trigger,
        game_id,
        &game_name,
        MetadataStatus::Complete,
        Some(1.0),
        None,
    );
    Ok(())
}

/// Apply a specific IGDB game (by id) to a library game, then optionally SteamGridDB.
/// When `skip_steamgrid` is true, SteamGridDB is not fetched; caller can show artwork picker and call apply_steamgrid_artwork_for_game.
pub async fn fetch_metadata_for_game_with_igdb_id(
    db: &DbState,
    _app_handle: &tauri::AppHandle,
    game_id: &str,
    igdb_id: i64,
    skip_steamgrid: bool,
) -> Result<(), MetadataSyncError> {
    let ctx = build_context(db).map_err(|e| MetadataSyncError {
        source: "Metadata".into(),
        game_id: game_id.to_string(),
        message: e,
    })?;

    let (game_name, source, source_id) = {
        let conn = db.conn.lock().map_err(|e| MetadataSyncError {
            source: "Metadata".into(),
            game_id: game_id.to_string(),
            message: format!("lock poisoned: {e}"),
        })?;
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
            .map_err(|e| MetadataSyncError {
                source: "Metadata".into(),
                game_id: game_id.to_string(),
                message: format!("game not found: {e}"),
            })?;
        row
    };

    let igdb_game_name = if let Some(ref igdb) = ctx.igdb {
        match fetch_igdb_metadata_by_id(igdb, db, game_id, igdb_id).await {
            Ok(name) => {
                if let Some(info) = igdb.get_cached_token_info() {
                    save_igdb_token(db, &info.0, info.1);
                }
                Some(name)
            }
            Err(e) => {
                return Err(MetadataSyncError {
                    source: "IGDB".into(),
                    game_id: game_id.to_string(),
                    message: e,
                });
            }
        }
    } else {
        return Err(MetadataSyncError {
            source: "Metadata".into(),
            game_id: game_id.to_string(),
            message: "IGDB API keys not configured".into(),
        });
    };

    // SteamGridDB artwork: use the IGDB game name so artwork matches the game the user selected (unless caller will let user pick)
    if !skip_steamgrid {
        let search_name = utils::normalize_game_title(&game_name);
        let artwork_search_name = igdb_game_name.as_deref().unwrap_or(&search_name);
        if let Some(ref steamgrid) = ctx.steamgrid {
            let steam_appid = if source == "steam" { source_id.as_deref() } else { None };
            if let Err(e) = fetch_steamgrid_artwork(
                steamgrid,
                &ctx.http,
                db,
                game_id,
                artwork_search_name,
                steam_appid,
            )
            .await
            {
                log::warn!("SteamGridDB artwork fetch failed for {artwork_search_name}: {e}");
            }
        }
    }

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
    apply_igdb_metadata_to_game(db, game_id, &meta).await
}

/// Fetch a single game from IGDB by id and apply its metadata to the library game.
/// Returns the IGDB game's name so the caller can use it for SteamGridDB search.
async fn fetch_igdb_metadata_by_id(
    igdb: &IgdbClient,
    db: &DbState,
    game_id: &str,
    igdb_id: i64,
) -> Result<String, String> {
    let game = igdb
        .get_game_by_id(igdb_id)
        .await?
        .ok_or_else(|| format!("IGDB game {igdb_id} not found"))?;

    let name = game.name.clone();
    let meta = IgdbClient::extract_metadata(&game);
    apply_igdb_metadata_to_game(db, game_id, &meta).await?;
    Ok(name)
}

async fn apply_igdb_metadata_to_game(
    db: &DbState,
    game_id: &str,
    meta: &crate::metadata::igdb::GameMetadata,
) -> Result<(), String> {
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

    apply_steamgrid_artwork_by_id(steamgrid, http, db, game_id, steamgrid_id).await
}

/// Fetch a SteamGridDB artwork set by id and apply it to the library game (download, cache, update DB).
fn apply_steamgrid_artwork_by_id<'a>(
    steamgrid: &'a SteamGridDbClient,
    http: &'a reqwest::Client,
    db: &'a DbState,
    game_id: &'a str,
    steamgrid_id: i64,
) -> impl std::future::Future<Output = Result<(), String>> + 'a {
    async move {
        let artwork = steamgrid.fetch_artwork_set(steamgrid_id).await?;

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

        let cover_url = artwork.grid.clone().or(cached.cover_path);
        let hero_url = artwork.hero.clone().or(cached.hero_path);
        let logo_url = artwork.logo.clone().or(cached.logo_path);

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
}

/// Apply a specific SteamGridDB game (by id) artwork set to a library game.
/// Used when the user has manually chosen an artwork set from SteamGridDB search.
pub async fn apply_steamgrid_artwork_for_game(
    db: &DbState,
    game_id: &str,
    steamgrid_id: i64,
) -> Result<(), MetadataSyncError> {
    let ctx = build_context(db).map_err(|e| MetadataSyncError {
        source: "Metadata".into(),
        game_id: game_id.to_string(),
        message: e,
    })?;

    let steamgrid = ctx.steamgrid.ok_or_else(|| MetadataSyncError {
        source: "Metadata".into(),
        game_id: game_id.to_string(),
        message: "SteamGridDB API key not configured".into(),
    })?;

    apply_steamgrid_artwork_by_id(&steamgrid, &ctx.http, db, game_id, steamgrid_id)
        .await
        .map_err(|e| MetadataSyncError {
            source: "SteamGridDB".into(),
            game_id: game_id.to_string(),
            message: e,
        })
}

pub async fn fetch_artwork_for_game(
    db: &DbState,
    app_handle: &tauri::AppHandle,
    game_id: &str,
    progress: Option<&ProgressContext>,
) -> Result<(), MetadataSyncError> {
    let ctx = build_context(db).map_err(|e| MetadataSyncError {
        source: "Metadata".into(),
        game_id: game_id.to_string(),
        message: e,
    })?;

    let (game_name, source, source_id) = {
        let conn = db.conn.lock().map_err(|e| MetadataSyncError {
            source: "Metadata".into(),
            game_id: game_id.to_string(),
            message: format!("lock poisoned: {e}"),
        })?;
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
        .map_err(|e| MetadataSyncError {
            source: "Metadata".into(),
            game_id: game_id.to_string(),
            message: format!("game not found: {e}"),
        })?
    };

    let (completed, total, trigger) = progress
        .map(|p| (p.completed, p.total, p.trigger.as_str()))
        .unwrap_or((1, 1, "resync"));

    emit_progress(
        app_handle,
        "artwork",
        completed,
        total,
        Some(&game_name),
        trigger,
        game_id,
        &game_name,
        MetadataStatus::Fetching,
        None,
        None,
    );

    let search_name = utils::normalize_game_title(&game_name);
    if let Some(ref steamgrid) = ctx.steamgrid {
        let steam_appid = if source == "steam" { source_id.as_deref() } else { None };
        fetch_steamgrid_artwork(steamgrid, &ctx.http, db, game_id, &search_name, steam_appid)
            .await
            .map_err(|e| MetadataSyncError {
                source: "SteamGridDB".into(),
                game_id: game_id.to_string(),
                message: e,
            })?;
    }

    emit_progress(
        app_handle,
        "artwork",
        completed + 1,
        total,
        None,
        trigger,
        game_id,
        &game_name,
        MetadataStatus::Complete,
        Some(1.0),
        None,
    );
    Ok(())
}

pub async fn run_background_pipeline(
    db: Arc<DbState>,
    app_handle: tauri::AppHandle,
    game_ids: Vec<String>,
    trigger: &str,
) {
    let total = game_ids.len();

    for (i, game_id) in game_ids.iter().enumerate() {
        let progress_ctx = ProgressContext {
            completed: i,
            total,
            trigger: trigger.to_string(),
        };

        let mut last_err = None::<MetadataSyncError>;
        for attempt in 0..MAX_RETRIES {
            match fetch_metadata_for_game(&db, &app_handle, game_id, Some(&progress_ctx)).await {
                Ok(()) => {
                    last_err = None;
                    break;
                }
                Err(e) => {
                    last_err = Some(e);
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
            let progress_frac = (i as f32) / total as f32;
            emit_progress(
                &app_handle,
                "metadata",
                i + 1,
                total,
                Some(&game_name),
                trigger,
                game_id,
                &game_name,
                MetadataStatus::Failed,
                Some(progress_frac),
                Some(err),
            );
        }
    }
}

fn emit_progress(
    app_handle: &tauri::AppHandle,
    phase: &str,
    completed: usize,
    total: usize,
    current_game: Option<&str>,
    trigger: &str,
    game_id: &str,
    game_name: &str,
    status: MetadataStatus,
    progress: Option<f32>,
    error: Option<MetadataSyncError>,
) {
    use tauri::Emitter;
    let event = MetadataProgressEvent {
        phase: phase.to_string(),
        completed,
        total,
        current_game: current_game.map(String::from),
        trigger: trigger.to_string(),
        error: error.clone(),
        game_id: game_id.to_string(),
        game_name: game_name.to_string(),
        status,
        progress,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_progress_event_serializes_with_trigger_and_no_error() {
        let event = MetadataProgressEvent {
            phase: "metadata".into(),
            completed: 2,
            total: 10,
            current_game: Some("Test Game".into()),
            trigger: "resync".into(),
            error: None,
            game_id: "g1".into(),
            game_name: "Test Game".into(),
            status: MetadataStatus::Fetching,
            progress: Some(0.2),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"phase\":\"metadata\""));
        assert!(json.contains("\"completed\":2"));
        assert!(json.contains("\"total\":10"));
        assert!(json.contains("\"trigger\":\"resync\""));
        assert!(json.contains("\"gameId\":\"g1\""));
        assert!(json.contains("\"status\":\"fetching\""));
        assert!(json.contains("\"progress\":0.2"));
        assert!(json.contains("\"error\":null"));
    }

    #[test]
    fn metadata_progress_event_serializes_with_error() {
        let event = MetadataProgressEvent {
            phase: "metadata".into(),
            completed: 1,
            total: 5,
            current_game: Some("Failed Game".into()),
            trigger: "onboarding".into(),
            error: Some(MetadataSyncError {
                source: "IGDB".into(),
                game_id: "g2".into(),
                message: "no match".into(),
            }),
            game_id: "g2".into(),
            game_name: "Failed Game".into(),
            status: MetadataStatus::Failed,
            progress: Some(0.2),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"trigger\":\"onboarding\""));
        assert!(json.contains("\"error\":{"));
        assert!(json.contains("\"source\":\"IGDB\""));
        assert!(json.contains("\"gameId\":\"g2\""));
        assert!(json.contains("\"message\":\"no match\""));
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
}
