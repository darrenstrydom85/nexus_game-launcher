use rusqlite::params;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

use super::error::CommandError;
use crate::db::DbState;
use crate::metadata::igdb::IgdbClient;
use crate::metadata::placeholders;
use crate::metadata::steamgriddb::{ArtworkType, SteamGridDbClient};
use crate::models::settings::keys;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMetadata {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub genres: Option<Vec<String>>,
}

#[tauri::command]
pub fn get_metadata(db: State<'_, DbState>, game_id: String) -> Result<GameMetadata, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let row = conn
        .query_row(
            "SELECT id, name, description, cover_url, genres FROM games WHERE id = ?1",
            params![game_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                CommandError::NotFound(format!("game {game_id}"))
            }
            other => CommandError::Database(other.to_string()),
        })?;

    let (id, title, description, cover_url, genres_str) = row;

    let cover_url = cover_url.or_else(|| {
        Some(placeholders::gradient_data_uri(&title))
    });

    let genres = genres_str.map(|g| g.split(',').map(|s| s.trim().to_string()).collect());

    Ok(GameMetadata {
        id,
        title,
        description,
        cover_url,
        genres,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyKeyResult {
    pub valid: bool,
    pub message: String,
}

#[tauri::command]
pub async fn verify_steamgrid_key(
    db: State<'_, DbState>,
) -> Result<VerifyKeyResult, CommandError> {
    let api_key = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        get_setting(&conn, keys::STEAMGRID_API_KEY)
    };

    let api_key = api_key.ok_or_else(|| {
        CommandError::NotFound("SteamGridDB API key not configured".into())
    })?;

    let client = SteamGridDbClient::new(api_key);
    match client.verify_key().await {
        Ok(true) => Ok(VerifyKeyResult {
            valid: true,
            message: "SteamGridDB API key is valid".into(),
        }),
        Ok(false) => Ok(VerifyKeyResult {
            valid: false,
            message: "SteamGridDB API key is invalid or expired".into(),
        }),
        Err(e) => Ok(VerifyKeyResult {
            valid: false,
            message: format!("Failed to verify key: {e}"),
        }),
    }
}

#[tauri::command]
pub async fn verify_igdb_keys(db: State<'_, DbState>) -> Result<VerifyKeyResult, CommandError> {
    let (client_id, client_secret) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let id = get_setting(&conn, keys::IGDB_CLIENT_ID);
        let secret = get_setting(&conn, keys::IGDB_CLIENT_SECRET);
        (id, secret)
    };

    let client_id = client_id.ok_or_else(|| {
        CommandError::NotFound("IGDB Client ID not configured".into())
    })?;
    let client_secret = client_secret.ok_or_else(|| {
        CommandError::NotFound("IGDB Client Secret not configured".into())
    })?;

    let client = IgdbClient::new(client_id, client_secret);
    match client.verify_keys().await {
        Ok(true) => {
            if let Some((token, expires)) = client.get_cached_token_info() {
                let conn = db
                    .conn
                    .lock()
                    .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                    params![keys::IGDB_ACCESS_TOKEN, token],
                );
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                    params![keys::IGDB_TOKEN_EXPIRES, expires.to_string()],
                );
            }
            Ok(VerifyKeyResult {
                valid: true,
                message: "IGDB/Twitch credentials are valid".into(),
            })
        }
        Ok(false) => Ok(VerifyKeyResult {
            valid: false,
            message: "IGDB/Twitch credentials are invalid".into(),
        }),
        Err(e) => Ok(VerifyKeyResult {
            valid: false,
            message: format!("Failed to verify keys: {e}"),
        }),
    }
}

#[tauri::command]
pub async fn fetch_metadata(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    game_id: String,
) -> Result<(), CommandError> {
    crate::metadata::pipeline::fetch_metadata_for_game(&db, &app_handle, &game_id, None)
        .await
        .map_err(|e| CommandError::Unknown(e.message))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSearchResult {
    pub id: i64,
    pub name: String,
    pub release_date: Option<i64>,
    pub cover_url: Option<String>,
}

#[tauri::command]
pub async fn search_metadata(
    db: State<'_, DbState>,
    query: String,
) -> Result<Vec<MetadataSearchResult>, CommandError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let (client_id, client_secret) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let id = get_setting(&conn, keys::IGDB_CLIENT_ID);
        let secret = get_setting(&conn, keys::IGDB_CLIENT_SECRET);
        match (id, secret) {
            (Some(id), Some(secret)) => (id, secret),
            _ => return Ok(Vec::new()),
        }
    };

    let cached_token = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let token = get_setting(&conn, keys::IGDB_ACCESS_TOKEN);
        let expires = get_setting(&conn, keys::IGDB_TOKEN_EXPIRES).and_then(|s| s.parse::<i64>().ok());
        match (token, expires) {
            (Some(t), Some(exp)) => Some((t, exp)),
            _ => None,
        }
    };

    let igdb = match cached_token {
        Some((token, expires)) => IgdbClient::with_cached_token(
            client_id.clone(),
            client_secret.clone(),
            token,
            expires,
        ),
        None => IgdbClient::new(client_id, client_secret),
    };

    let games = igdb.search_game(query).await.map_err(CommandError::Unknown)?;

    let results: Vec<MetadataSearchResult> = games
        .into_iter()
        .map(|g| {
            let cover_url = g.cover.as_ref().map(|c| {
                format!(
                    "https://images.igdb.com/igdb/image/upload/t_cover_small/{}.jpg",
                    c.image_id
                )
            });
            MetadataSearchResult {
                id: g.id,
                name: g.name,
                release_date: g.first_release_date,
                cover_url,
            }
        })
        .collect();

    Ok(results)
}

#[tauri::command]
pub async fn fetch_metadata_with_igdb_id(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    game_id: String,
    igdb_id: i64,
    skip_steamgrid: Option<bool>,
) -> Result<(), CommandError> {
    let skip = skip_steamgrid.unwrap_or(false);
    crate::metadata::pipeline::fetch_metadata_for_game_with_igdb_id(
        &db,
        &app_handle,
        &game_id,
        igdb_id,
        skip,
    )
    .await
    .map_err(|e| CommandError::Unknown(e.message))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamGridSearchResult {
    pub id: i64,
    pub name: String,
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
}

#[tauri::command]
pub async fn search_steamgrid_artwork(
    db: State<'_, DbState>,
    query: String,
) -> Result<Vec<SteamGridSearchResult>, CommandError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let api_key = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        get_setting(&conn, keys::STEAMGRID_API_KEY)
    };

    let api_key = api_key.ok_or_else(|| CommandError::NotFound("SteamGridDB API key not configured".into()))?;

    let client = SteamGridDbClient::new(api_key);
    let results = client.search_game(query).await.map_err(CommandError::Unknown)?;

    let mut out = Vec::with_capacity(results.len());
    for r in results {
        let cover_url = client
            .get_images(r.id, ArtworkType::Grid)
            .await
            .ok()
            .and_then(|imgs| imgs.first().map(|i| i.thumb.clone()));
        out.push(SteamGridSearchResult {
            id: r.id,
            name: r.name,
            verified: r.verified,
            cover_url,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn apply_steamgrid_artwork(
    db: State<'_, DbState>,
    game_id: String,
    steamgrid_id: i64,
) -> Result<(), CommandError> {
    crate::metadata::pipeline::apply_steamgrid_artwork_for_game(&db, &game_id, steamgrid_id)
        .await
        .map_err(|e| CommandError::Unknown(e.message))
}

#[tauri::command]
pub async fn fetch_artwork(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    game_id: String,
) -> Result<(), CommandError> {
    crate::metadata::pipeline::fetch_artwork_for_game(&db, &app_handle, &game_id, None)
        .await
        .map_err(|e| CommandError::Unknown(e.message))
}

#[tauri::command]
pub async fn fetch_all_metadata(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<usize, CommandError> {
    let game_ids = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let mut stmt = conn
            .prepare(
                "SELECT id FROM games \
                 WHERE (description IS NULL OR cover_url IS NULL) \
                 AND (is_hidden = 0 OR is_hidden IS NULL) \
                 AND (status IS NULL OR status != 'removed')",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;
        let ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| CommandError::Database(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };

    let count = game_ids.len();
    if count == 0 {
        return Ok(0);
    }

    let db_arc = std::sync::Arc::new(crate::db::DbState {
        conn: std::sync::Mutex::new(
            rusqlite::Connection::open(&db.db_path)
                .map_err(|e| CommandError::Database(format!("failed to open db: {e}")))?,
        ),
        db_path: db.db_path.clone(),
    });

    tokio::spawn(async move {
        crate::metadata::pipeline::run_background_pipeline(db_arc, app_handle, game_ids, "resync")
            .await;
    });

    Ok(count)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub steamgrid: bool,
    pub igdb: bool,
    pub availability: String,
}

#[tauri::command]
pub fn get_key_status(db: State<'_, DbState>) -> Result<KeyStatus, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

    let steamgrid_key = get_setting(&conn, keys::STEAMGRID_API_KEY);
    let igdb_id = get_setting(&conn, keys::IGDB_CLIENT_ID);
    let igdb_secret = get_setting(&conn, keys::IGDB_CLIENT_SECRET);

    let availability = placeholders::check_key_availability(
        steamgrid_key.as_deref(),
        igdb_id.as_deref(),
        igdb_secret.as_deref(),
    );

    let availability_str = match availability {
        placeholders::KeyAvailability::Both => "both",
        placeholders::KeyAvailability::SteamGridOnly => "steamgrid_only",
        placeholders::KeyAvailability::IgdbOnly => "igdb_only",
        placeholders::KeyAvailability::Neither => "neither",
    };

    Ok(KeyStatus {
        steamgrid: steamgrid_key.is_some(),
        igdb: igdb_id.is_some() && igdb_secret.is_some(),
        availability: availability_str.to_string(),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub total_bytes: u64,
    pub game_bytes: Option<u64>,
}

#[tauri::command]
pub fn get_cache_stats(game_id: Option<String>) -> Result<CacheStats, CommandError> {
    let total_bytes = crate::metadata::cache::calculate_total_cache_size()
        .map_err(|e| CommandError::Unknown(e))?;

    let game_bytes = game_id
        .map(|id| crate::metadata::cache::calculate_cache_size(&id))
        .transpose()
        .map_err(|e| CommandError::Unknown(e))?;

    Ok(CacheStats {
        total_bytes,
        game_bytes,
    })
}

#[tauri::command]
pub fn clear_cache() -> Result<(), CommandError> {
    crate::metadata::cache::clear_all_cache_files().map_err(|e| CommandError::Unknown(e))
}

#[tauri::command]
pub fn get_placeholder_cover(name: String) -> Result<String, CommandError> {
    Ok(placeholders::gradient_data_uri(&name))
}

#[tauri::command]
pub async fn run_score_backfill(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<usize, CommandError> {
    let games_needing_backfill = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        crate::metadata::pipeline::find_games_needing_score_backfill(&conn)
    };

    let count = games_needing_backfill.len();
    if count == 0 {
        return Ok(0);
    }

    let db_arc = std::sync::Arc::new(crate::db::DbState {
        conn: std::sync::Mutex::new(
            rusqlite::Connection::open(&db.db_path)
                .map_err(|e| CommandError::Database(format!("failed to open db: {e}")))?,
        ),
        db_path: db.db_path.clone(),
    });

    tokio::spawn(async move {
        crate::metadata::pipeline::run_score_backfill(db_arc, app_handle).await;
    });

    Ok(count)
}

fn get_setting(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
    .filter(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_game(conn: &rusqlite::Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO games (id, name, source, status, added_at, updated_at) \
             VALUES (?1, ?2, 'steam', 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name],
        )
        .unwrap();
    }

    fn get_metadata_inner(state: &DbState, game_id: String) -> Result<GameMetadata, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let row = conn
            .query_row(
                "SELECT id, name, description, cover_url, genres FROM games WHERE id = ?1",
                params![game_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                    ))
                },
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    CommandError::NotFound(format!("game {game_id}"))
                }
                other => CommandError::Database(other.to_string()),
            })?;

        let (id, title, description, cover_url, genres_str) = row;
        let cover_url = cover_url.or_else(|| Some(placeholders::gradient_data_uri(&title)));
        let genres = genres_str.map(|g| g.split(',').map(|s| s.trim().to_string()).collect());

        Ok(GameMetadata {
            id,
            title,
            description,
            cover_url,
            genres,
        })
    }

    fn get_key_status_inner(state: &DbState) -> Result<KeyStatus, CommandError> {
        let conn = state
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let steamgrid_key = get_setting(&conn, keys::STEAMGRID_API_KEY);
        let igdb_id = get_setting(&conn, keys::IGDB_CLIENT_ID);
        let igdb_secret = get_setting(&conn, keys::IGDB_CLIENT_SECRET);

        let availability = placeholders::check_key_availability(
            steamgrid_key.as_deref(),
            igdb_id.as_deref(),
            igdb_secret.as_deref(),
        );

        let availability_str = match availability {
            placeholders::KeyAvailability::Both => "both",
            placeholders::KeyAvailability::SteamGridOnly => "steamgrid_only",
            placeholders::KeyAvailability::IgdbOnly => "igdb_only",
            placeholders::KeyAvailability::Neither => "neither",
        };

        Ok(KeyStatus {
            steamgrid: steamgrid_key.is_some(),
            igdb: igdb_id.is_some() && igdb_secret.is_some(),
            availability: availability_str.to_string(),
        })
    }

    #[test]
    fn get_metadata_returns_game_with_placeholder() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Test Game");
        drop(conn);

        let meta = get_metadata_inner(&state, "g1".into()).unwrap();
        assert_eq!(meta.id, "g1");
        assert_eq!(meta.title, "Test Game");
        assert!(meta.cover_url.is_some());
        assert!(meta.cover_url.unwrap().starts_with("data:image/svg+xml;base64,"));
    }

    #[test]
    fn get_metadata_returns_existing_cover_url() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Test Game");
        conn.execute(
            "UPDATE games SET cover_url = 'https://example.com/cover.jpg' WHERE id = 'g1'",
            [],
        )
        .unwrap();
        drop(conn);

        let meta = get_metadata_inner(&state, "g1".into()).unwrap();
        assert_eq!(meta.cover_url, Some("https://example.com/cover.jpg".into()));
    }

    #[test]
    fn get_metadata_parses_genres() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Test Game");
        conn.execute(
            "UPDATE games SET genres = 'RPG,Action,Adventure' WHERE id = 'g1'",
            [],
        )
        .unwrap();
        drop(conn);

        let meta = get_metadata_inner(&state, "g1".into()).unwrap();
        assert_eq!(
            meta.genres,
            Some(vec!["RPG".into(), "Action".into(), "Adventure".into()])
        );
    }

    #[test]
    fn get_metadata_not_found() {
        let state = setup_db();
        let result = get_metadata_inner(&state, "nonexistent".into());
        assert!(result.is_err());
    }

    #[test]
    fn key_status_neither_by_default() {
        let state = setup_db();
        let status = get_key_status_inner(&state).unwrap();
        assert!(!status.steamgrid);
        assert!(!status.igdb);
        assert_eq!(status.availability, "neither");
    }

    #[test]
    fn key_status_both_when_all_set() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)",
            params![keys::STEAMGRID_API_KEY, "test-key"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)",
            params![keys::IGDB_CLIENT_ID, "test-id"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)",
            params![keys::IGDB_CLIENT_SECRET, "test-secret"],
        )
        .unwrap();
        drop(conn);

        let status = get_key_status_inner(&state).unwrap();
        assert!(status.steamgrid);
        assert!(status.igdb);
        assert_eq!(status.availability, "both");
    }

    #[test]
    fn key_status_steamgrid_only() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)",
            params![keys::STEAMGRID_API_KEY, "test-key"],
        )
        .unwrap();
        drop(conn);

        let status = get_key_status_inner(&state).unwrap();
        assert!(status.steamgrid);
        assert!(!status.igdb);
        assert_eq!(status.availability, "steamgrid_only");
    }
}
