use rusqlite::params;
use serde::Serialize;
use tauri::State;

use super::error::CommandError;
use crate::db::DbState;
use crate::metadata::igdb::IgdbClient;
use crate::metadata::steamgriddb::{ArtworkType, SteamGridDbClient};
use crate::models::settings::keys;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyKeyResult {
    pub valid: bool,
    pub message: String,
}

#[tauri::command]
pub async fn verify_steamgrid_key(db: State<'_, DbState>) -> Result<VerifyKeyResult, CommandError> {
    let api_key = {
        let conn = db.conn()?;

        get_setting(&conn, keys::STEAMGRID_API_KEY)
    };

    let api_key = api_key
        .ok_or_else(|| CommandError::NotFound("SteamGridDB API key not configured".into()))?;

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
        let conn = db.conn()?;

        let id = get_setting(&conn, keys::IGDB_CLIENT_ID);
        let secret = get_setting(&conn, keys::IGDB_CLIENT_SECRET);
        (id, secret)
    };

    let client_id =
        client_id.ok_or_else(|| CommandError::NotFound("IGDB Client ID not configured".into()))?;
    let client_secret = client_secret
        .ok_or_else(|| CommandError::NotFound("IGDB Client Secret not configured".into()))?;

    let client = IgdbClient::new(client_id, client_secret);
    match client.verify_keys().await {
        Ok(true) => {
            if let Some((token, expires)) = client.get_cached_token_info() {
                let conn = db.conn()?;
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
        let conn = db.conn()?;
        let id = get_setting(&conn, keys::IGDB_CLIENT_ID);
        let secret = get_setting(&conn, keys::IGDB_CLIENT_SECRET);
        match (id, secret) {
            (Some(id), Some(secret)) => (id, secret),
            _ => return Ok(Vec::new()),
        }
    };

    let cached_token = {
        let conn = db.conn()?;
        let token = get_setting(&conn, keys::IGDB_ACCESS_TOKEN);
        let expires =
            get_setting(&conn, keys::IGDB_TOKEN_EXPIRES).and_then(|s| s.parse::<i64>().ok());
        match (token, expires) {
            (Some(t), Some(exp)) => Some((t, exp)),
            _ => None,
        }
    };

    let igdb = match cached_token {
        Some((token, expires)) => {
            IgdbClient::with_cached_token(client_id.clone(), client_secret.clone(), token, expires)
        }
        None => IgdbClient::new(client_id, client_secret),
    };

    let games = igdb
        .search_game(query)
        .await
        .map_err(CommandError::Unknown)?;

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
        let conn = db.conn()?;
        get_setting(&conn, keys::STEAMGRID_API_KEY)
    };

    let api_key = api_key
        .ok_or_else(|| CommandError::NotFound("SteamGridDB API key not configured".into()))?;

    let client = SteamGridDbClient::new(api_key);
    let results = client
        .search_game(query)
        .await
        .map_err(CommandError::Unknown)?;

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
pub async fn fetch_all_metadata(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<usize, CommandError> {
    let game_ids = {
        let conn = db.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id FROM games \
                 WHERE (description IS NULL OR cover_url IS NULL) \
                 AND (is_hidden = 0 OR is_hidden IS NULL) \
                 AND (status IS NULL OR status != 'removed')",
            )?;
        let ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
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
pub async fn run_score_backfill(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<usize, CommandError> {
    let games_needing_backfill = {
        let conn = db.conn()?;
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

#[tauri::command]
pub fn save_hltb_data(
    db: State<'_, DbState>,
    game_id: String,
    hltb_id: String,
    main_h: Option<f64>,
    main_extra_h: Option<f64>,
    completionist_h: Option<f64>,
) -> Result<(), CommandError> {
    let conn = db.conn()?;

    let fetched_at = super::utils::now_iso();

    conn.execute(
        "UPDATE games SET hltb_id = ?1, hltb_main_h = ?2, hltb_main_extra_h = ?3, \
         hltb_completionist_h = ?4, hltb_fetched_at = ?5 WHERE id = ?6",
        params![
            hltb_id,
            main_h,
            main_extra_h,
            completionist_h,
            fetched_at,
            game_id
        ],
    )?;

    Ok(())
}

#[tauri::command]
pub fn clear_hltb_data(db: State<'_, DbState>, game_id: String) -> Result<(), CommandError> {
    let conn = db.conn()?;

    conn.execute(
        "UPDATE games SET hltb_id = NULL, hltb_main_h = NULL, hltb_main_extra_h = NULL, \
         hltb_completionist_h = NULL, hltb_fetched_at = NULL WHERE id = ?1",
        params![game_id],
    )?;

    Ok(())
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

    fn save_hltb_data_inner(
        state: &DbState,
        game_id: String,
        hltb_id: String,
        main_h: Option<f64>,
        main_extra_h: Option<f64>,
        completionist_h: Option<f64>,
    ) -> Result<(), CommandError> {
        let conn = state.conn()?;
        let fetched_at = super::super::utils::now_iso();
        conn.execute(
            "UPDATE games SET hltb_id = ?1, hltb_main_h = ?2, hltb_main_extra_h = ?3, \
             hltb_completionist_h = ?4, hltb_fetched_at = ?5 WHERE id = ?6",
            params![
                hltb_id,
                main_h,
                main_extra_h,
                completionist_h,
                fetched_at,
                game_id
            ],
        )?;
        Ok(())
    }

    fn clear_hltb_data_inner(state: &DbState, game_id: String) -> Result<(), CommandError> {
        let conn = state.conn()?;
        conn.execute(
            "UPDATE games SET hltb_id = NULL, hltb_main_h = NULL, hltb_main_extra_h = NULL, \
             hltb_completionist_h = NULL, hltb_fetched_at = NULL WHERE id = ?1",
            params![game_id],
        )?;
        Ok(())
    }

    #[test]
    fn save_hltb_data_persists_all_fields() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Test Game");
        drop(conn);

        save_hltb_data_inner(
            &state,
            "g1".into(),
            "12345".into(),
            Some(34.0),
            Some(50.5),
            Some(80.0),
        )
        .unwrap();

        let conn = state.conn.lock().unwrap();
        let (hltb_id, main_h, extra_h, comp_h, fetched_at): (
            Option<String>,
            Option<f64>,
            Option<f64>,
            Option<f64>,
            Option<String>,
        ) = conn
            .query_row(
                "SELECT hltb_id, hltb_main_h, hltb_main_extra_h, hltb_completionist_h, hltb_fetched_at FROM games WHERE id = 'g1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();

        assert_eq!(hltb_id, Some("12345".to_string()));
        assert_eq!(main_h, Some(34.0));
        assert_eq!(extra_h, Some(50.5));
        assert_eq!(comp_h, Some(80.0));
        assert!(fetched_at.is_some());
        assert!(fetched_at.unwrap().contains("T"));
    }

    #[test]
    fn clear_hltb_data_resets_all_columns() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Test Game");
        conn.execute(
            "UPDATE games SET hltb_id = '999', hltb_main_h = 10.0, hltb_main_extra_h = 20.0, \
             hltb_completionist_h = 30.0, hltb_fetched_at = '2026-01-01T00:00:00Z' WHERE id = 'g1'",
            [],
        )
        .unwrap();
        drop(conn);

        clear_hltb_data_inner(&state, "g1".into()).unwrap();

        let conn = state.conn.lock().unwrap();
        let (hltb_id, main_h, extra_h, comp_h, fetched_at): (
            Option<String>,
            Option<f64>,
            Option<f64>,
            Option<f64>,
            Option<String>,
        ) = conn
            .query_row(
                "SELECT hltb_id, hltb_main_h, hltb_main_extra_h, hltb_completionist_h, hltb_fetched_at FROM games WHERE id = 'g1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();

        assert_eq!(hltb_id, None);
        assert_eq!(main_h, None);
        assert_eq!(extra_h, None);
        assert_eq!(comp_h, None);
        assert_eq!(fetched_at, None);
    }

    #[test]
    fn save_hltb_data_sets_fetched_at_automatically() {
        let state = setup_db();
        let conn = state.conn.lock().unwrap();
        insert_game(&conn, "g1", "Test Game");
        drop(conn);

        save_hltb_data_inner(&state, "g1".into(), "555".into(), None, None, None).unwrap();

        let conn = state.conn.lock().unwrap();
        let fetched_at: Option<String> = conn
            .query_row(
                "SELECT hltb_fetched_at FROM games WHERE id = 'g1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert!(
            fetched_at.is_some(),
            "hltb_fetched_at should be set even when times are NULL"
        );
    }
}
