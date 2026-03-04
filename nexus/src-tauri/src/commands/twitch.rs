//! Tauri commands for Twitch OAuth (19.1) and Twitch data + offline cache (19.2).

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

use super::error::CommandError;
use crate::db::DbState;
use crate::twitch::auth;
use crate::twitch::cache::{self, CachedChannel, CachedStream};
use crate::twitch::tokens;
use crate::twitch::api;

/// Twitch OAuth2 client ID, embedded at compile time. Set NEXUS_TWITCH_CLIENT_ID when building
/// (e.g. `$env:NEXUS_TWITCH_CLIENT_ID="your_id"; cargo build`).
const TWITCH_CLIENT_ID: &str = env!("NEXUS_TWITCH_CLIENT_ID");

/// Check for internet by attempting a connection to Twitch auth host.
fn check_network_available() -> Result<(), CommandError> {
    use std::net::ToSocketAddrs;
    let addr = ("id.twitch.tv", 443)
        .to_socket_addrs()
        .map_err(|e| CommandError::NetworkUnavailable(e.to_string()))?
        .next()
        .ok_or_else(|| CommandError::NetworkUnavailable("no address for id.twitch.tv".to_string()))?;
    std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(5))
        .map_err(|_| {
            CommandError::NetworkUnavailable(
                "No internet connection. Please check your network and try again.".to_string(),
            )
        })?;
    Ok(())
}

/// Check if Twitch API is reachable (for offline fallback). Uses TCP to api.twitch.tv:443.
fn check_twitch_api_available() -> bool {
    use std::net::ToSocketAddrs;
    let addr = match ("api.twitch.tv", 443).to_socket_addrs() {
        Ok(mut a) => match a.next() {
            Some(addr) => addr,
            None => return false,
        },
        Err(_) => return false,
    };
    std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(3)).is_ok()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchAuthStatus {
    pub authenticated: bool,
    pub display_name: Option<String>,
    pub expires_at: Option<i64>,
}

/// Response envelope for all Twitch data commands (Story 19.2).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchResponse<T> {
    pub data: T,
    pub stale: bool,
    pub cached_at: Option<i64>,
}

/// Followed channel with optional live stream (Story 19.2).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchChannel {
    pub id: String,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: String,
    pub is_live: bool,
    pub stream: Option<TwitchStream>,
}

/// Live stream info (Story 19.2).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchStream {
    pub title: String,
    pub game_name: String,
    pub game_id: String,
    pub viewer_count: i64,
    pub thumbnail_url: String,
    pub started_at: String,
}

/// Initiate Twitch OAuth2 Authorization Code flow with PKCE. Opens browser, captures callback,
/// exchanges code for tokens, fetches user, stores encrypted tokens and emits twitch-auth-changed.
#[tauri::command]
pub async fn twitch_auth_start(app: AppHandle, db: State<'_, DbState>) -> Result<(), CommandError> {
    check_network_available()?;

    let opener = app.opener();
    let open_url = move |url: &str| {
        let _ = opener.open_url(url, None::<&str>);
    };

    let (access_token, refresh_token, expires_at, user_id, display_name) =
        auth::run_auth_flow(TWITCH_CLIENT_ID, open_url).await?;

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::store_tokens(
        &conn,
        &access_token,
        &refresh_token,
        expires_at,
        &user_id,
        &display_name,
    )?;
    drop(conn);

    app.emit(
        "twitch-auth-changed",
        serde_json::json!({ "authenticated": true, "displayName": display_name }),
    )
    .map_err(|e| CommandError::Unknown(e.to_string()))?;

    Ok(())
}

const REFRESH_THRESHOLD_SECS: i64 = 300; // 5 minutes

/// Ensure we have a valid access token (refresh if needed). Returns (user_id, access_token) or error.
async fn ensure_valid_twitch_token(
    app: &AppHandle,
    db: &State<'_, DbState>,
) -> Result<(String, String), CommandError> {
    let (refresh_token_opt, expires_at_opt, user_id_opt) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let refresh = tokens::load_refresh_token(&conn)?;
        let expires = tokens::load_expires_at(&conn)?;
        let user_id = tokens::load_user_id(&conn)?;
        (refresh, expires, user_id)
    };

    let user_id = user_id_opt.ok_or_else(|| CommandError::Auth("Not logged in to Twitch".to_string()))?;

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let need_refresh = refresh_token_opt.is_some()
        && expires_at_opt.map_or(true, |e| now_secs >= e - REFRESH_THRESHOLD_SECS);

    if need_refresh {
        if let Some(refresh_token) = refresh_token_opt {
            match auth::refresh_access_token(TWITCH_CLIENT_ID, &refresh_token).await {
                Ok((access_token, new_refresh, expires_in)) => {
                    let new_expires_at = now_secs + expires_in;
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    let enc_access = tokens::encrypt(&access_token)?;
                    let enc_refresh = tokens::encrypt(&new_refresh)?;
                    tokens::set_setting_raw(&conn, crate::models::settings::keys::TWITCH_ACCESS_TOKEN, &enc_access)?;
                    tokens::set_setting_raw(&conn, crate::models::settings::keys::TWITCH_REFRESH_TOKEN, &enc_refresh)?;
                    tokens::set_setting_raw(&conn, crate::models::settings::keys::TWITCH_TOKEN_EXPIRES_AT, &new_expires_at.to_string())?;
                    drop(conn);
                    let _ = app.emit("twitch-auth-changed", serde_json::json!({ "authenticated": true }));
                    return Ok((user_id, access_token));
                }
                Err(_) => {
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    let _ = tokens::clear_all(&conn);
                    drop(conn);
                    let _ = app.emit("twitch-auth-changed", serde_json::json!({ "authenticated": false }));
                    return Err(CommandError::Auth("Twitch token refresh failed".to_string()));
                }
            }
        }
    }

    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    let access_token = tokens::load_access_token(&conn)?
        .ok_or_else(|| CommandError::Auth("No Twitch access token".to_string()))?;
    drop(conn);
    Ok((user_id, access_token))
}

fn cached_at_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Merge cached channels with cached streams into TwitchChannel list.
fn merge_channels_streams(
    channels: Vec<CachedChannel>,
    streams: Vec<CachedStream>,
) -> Vec<TwitchChannel> {
    let stream_map: std::collections::HashMap<String, TwitchStream> = streams
        .into_iter()
        .map(|s| {
            (
                s.channel_id.clone(),
                TwitchStream {
                    title: s.title,
                    game_name: s.game_name,
                    game_id: s.game_id,
                    viewer_count: s.viewer_count,
                    thumbnail_url: s.thumbnail_url,
                    started_at: s.started_at,
                },
            )
        })
        .collect();
    channels
        .into_iter()
        .map(|c| {
            let stream = stream_map.get(&c.channel_id).cloned();
            TwitchChannel {
                id: c.channel_id,
                login: c.login,
                display_name: c.display_name,
                profile_image_url: c.profile_image_url,
                is_live: stream.is_some(),
                stream,
            }
        })
        .collect()
}

/// Return current Twitch auth state. If token is within 5 min of expiry or expired, attempts
/// refresh; if refresh fails, returns authenticated: false and emits twitch-auth-changed.
#[tauri::command]
pub async fn twitch_auth_status(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<TwitchAuthStatus, CommandError> {
    let (refresh_token_opt, expires_at_opt, display_name) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let refresh = tokens::load_refresh_token(&conn)?;
        let expires = tokens::load_expires_at(&conn)?;
        let name = tokens::load_display_name(&conn)?;
        (refresh, expires, name)
    };

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let need_refresh = refresh_token_opt.is_some()
        && expires_at_opt.map_or(true, |e| now_secs >= e - REFRESH_THRESHOLD_SECS);

    if need_refresh {
        if let Some(refresh_token) = refresh_token_opt {
            match auth::refresh_access_token(TWITCH_CLIENT_ID, &refresh_token).await {
                Ok((access_token, new_refresh, expires_in)) => {
                    let new_expires_at = now_secs + expires_in;
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    let enc_access = tokens::encrypt(&access_token)?;
                    let enc_refresh = tokens::encrypt(&new_refresh)?;
                    tokens::set_setting_raw(&conn, crate::models::settings::keys::TWITCH_ACCESS_TOKEN, &enc_access)?;
                    tokens::set_setting_raw(&conn, crate::models::settings::keys::TWITCH_REFRESH_TOKEN, &enc_refresh)?;
                    tokens::set_setting_raw(&conn, crate::models::settings::keys::TWITCH_TOKEN_EXPIRES_AT, &new_expires_at.to_string())?;
                    drop(conn);
                    let _ = app.emit(
                        "twitch-auth-changed",
                        serde_json::json!({ "authenticated": true, "displayName": display_name }),
                    );
                    return Ok(TwitchAuthStatus {
                        authenticated: true,
                        display_name,
                        expires_at: Some(new_expires_at),
                    });
                }
                Err(_) => {
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    let _ = tokens::clear_all(&conn);
                    drop(conn);
                    let _ = app.emit(
                        "twitch-auth-changed",
                        serde_json::json!({ "authenticated": false, "displayName": null }),
                    );
                    return Ok(TwitchAuthStatus {
                        authenticated: false,
                        display_name: None,
                        expires_at: None,
                    });
                }
            }
        }
    }

    let authenticated = refresh_token_opt.is_some() && expires_at_opt.is_some();
    Ok(TwitchAuthStatus {
        authenticated,
        display_name: display_name,
        expires_at: expires_at_opt,
    })
}

/// Get followed channels (and live status). Online: fetch from API, update cache, return fresh. Offline/unreachable: return cache with stale: true.
#[tauri::command]
pub async fn get_twitch_followed_channels(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<TwitchResponse<Vec<TwitchChannel>>, CommandError> {
    let (user_id, access_token) = ensure_valid_twitch_token(&app, &db).await?;

    let (cached_channels, cached_streams) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let ch = cache::get_cached_followed_channels(&conn)?;
        let st = cache::get_cached_live_streams(&conn)?;
        (ch, st)
    };

    if check_twitch_api_available() {
        let http = reqwest::Client::new();
        let channels = match api::fetch_followed_channels(&http, TWITCH_CLIENT_ID, &access_token, &user_id).await {
            Ok(ch) => ch,
            Err(_) => { /* fall through to cache */ vec![] }
        };
        if !channels.is_empty() {
            {
                let conn = db
                    .conn
                    .lock()
                    .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                cache::cache_followed_channels(&conn, &channels)?;
            }
            let user_ids: Vec<String> = channels.iter().map(|c| c.channel_id.clone()).collect();
            let streams = api::fetch_live_streams(&http, TWITCH_CLIENT_ID, &access_token, &user_ids).await.unwrap_or_default();
            {
                let conn = db
                    .conn
                    .lock()
                    .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                cache::cache_live_streams(&conn, &streams)?;
            }
            let merged = merge_channels_streams(channels, streams.clone());
            let channel_count = merged.len();
            let live_count = streams.len();
            let _ = app.emit(
                "twitch-data-updated",
                serde_json::json!({ "channelCount": channel_count, "liveCount": live_count, "stale": false }),
            );
            return Ok(TwitchResponse {
                data: merged,
                stale: false,
                cached_at: Some(cached_at_now()),
            });
        }
    }

    let cached_at_secs = cached_channels.first().map(|c| c.cached_at);
    let data = merge_channels_streams(cached_channels, cached_streams);
    Ok(TwitchResponse {
        data,
        stale: true,
        cached_at: cached_at_secs,
    })
}

/// Get live streams for followed channels. Online: fetch and cache. Offline: return cache with stale: true.
#[tauri::command]
pub async fn get_twitch_live_streams(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<TwitchResponse<Vec<TwitchStream>>, CommandError> {
    let (user_id, access_token) = ensure_valid_twitch_token(&app, &db).await?;

    let (cached, cached_at_secs) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let c = cache::get_cached_live_streams(&conn)?;
        let at = c.first().map(|s| s.cached_at);
        (c, at)
    };

    if check_twitch_api_available() {
        let http = reqwest::Client::new();
        let channels = api::fetch_followed_channels(&http, TWITCH_CLIENT_ID, &access_token, &user_id).await.ok();
        if let Some(chs) = channels {
            let user_ids: Vec<String> = chs.iter().map(|c| c.channel_id.clone()).collect();
            let streams = api::fetch_live_streams(&http, TWITCH_CLIENT_ID, &access_token, &user_ids).await.ok();
            if let Some(streams) = streams {
                {
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    cache::cache_live_streams(&conn, &streams)?;
                }
                let out: Vec<TwitchStream> = streams
                    .into_iter()
                    .map(|s| TwitchStream {
                        title: s.title,
                        game_name: s.game_name,
                        game_id: s.game_id,
                        viewer_count: s.viewer_count,
                        thumbnail_url: s.thumbnail_url,
                        started_at: s.started_at,
                    })
                    .collect();
                let _ = app.emit(
                    "twitch-data-updated",
                    serde_json::json!({ "channelCount": chs.len(), "liveCount": out.len(), "stale": false }),
                );
                return Ok(TwitchResponse {
                    data: out,
                    stale: false,
                    cached_at: Some(cached_at_now()),
                });
            }
        }
    }

    Ok(TwitchResponse {
        data: cached
            .into_iter()
            .map(|s| TwitchStream {
                title: s.title,
                game_name: s.game_name,
                game_id: s.game_id,
                viewer_count: s.viewer_count,
                thumbnail_url: s.thumbnail_url,
                started_at: s.started_at,
            })
            .collect(),
        stale: true,
        cached_at: cached_at_secs,
    })
}

/// Get top streams for a game/category by name. Resolves game name via Twitch API (or cache), then fetches streams.
#[tauri::command]
pub async fn get_twitch_streams_by_game(
    app: AppHandle,
    db: State<'_, DbState>,
    game_name: String,
) -> Result<TwitchResponse<Vec<TwitchStream>>, CommandError> {
    if game_name.trim().is_empty() {
        return Ok(TwitchResponse {
            data: vec![],
            stale: false,
            cached_at: None,
        });
    }

    let (_, access_token) = ensure_valid_twitch_token(&app, &db).await?;

    let (cached_mapping, cached_at_secs) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let m = cache::get_cached_game_mapping(&conn, game_name.trim())?;
        let at = m.as_ref().map(|x| x.cached_at);
        (m, at)
    };

    if check_twitch_api_available() {
        let http = reqwest::Client::new();
        let game_id_opt = match &cached_mapping {
            Some(m) => Some((m.twitch_game_id.clone(), m.twitch_game_name.clone())),
            None => api::fetch_twitch_game(&http, TWITCH_CLIENT_ID, &access_token, game_name.trim())
                .await?
                .map(|(id, name)| (id, name)),
        };
        if let Some((twitch_id, twitch_name)) = game_id_opt {
            match api::fetch_streams_by_game(&http, TWITCH_CLIENT_ID, &access_token, game_name.trim()).await {
                Ok(streams) => {
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    cache::cache_game_mapping(&conn, game_name.trim(), &twitch_id, &twitch_name)?;
                    drop(conn);
                    let out: Vec<TwitchStream> = streams
                        .into_iter()
                        .map(|s| TwitchStream {
                            title: s.title,
                            game_name: s.game_name,
                            game_id: s.game_id,
                            viewer_count: s.viewer_count,
                            thumbnail_url: s.thumbnail_url,
                            started_at: s.started_at,
                        })
                        .collect();
                    return Ok(TwitchResponse {
                        data: out,
                        stale: false,
                        cached_at: Some(cached_at_now()),
                    });
                }
                Err(_) => { /* fall through */ }
            }
        }
    }

    // No per-game stream cache; return empty when offline.
    Ok(TwitchResponse {
        data: vec![],
        stale: true,
        cached_at: cached_at_secs,
    })
}

/// Clear all Twitch tokens, user data, and offline cache; emit twitch-auth-changed (authenticated: false).
#[tauri::command]
pub fn twitch_auth_logout(app: AppHandle, db: State<'_, DbState>) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::clear_all(&conn)?;
    cache::clear_twitch_cache(&conn)?;
    drop(conn);

    app.emit(
        "twitch-auth-changed",
        serde_json::json!({ "authenticated": false, "displayName": null }),
    )
    .map_err(|e| CommandError::Unknown(e.to_string()))?;

    Ok(())
}
