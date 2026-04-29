//! Tauri commands for Twitch OAuth (Story 19.1) and Twitch data + offline cache (Story 19.2).
//!
//! All token state goes through [`crate::twitch::token_manager::TwitchTokenManager`]; this
//! file is intentionally free of refresh logic, cooldown timers, and direct token DB writes.

use std::sync::Arc;

use serde::Serialize;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use super::error::CommandError;
use crate::db::DbState;
use crate::twitch::api;
use crate::twitch::auth;
use crate::twitch::cache::{self, CachedChannel, CachedStream};
use crate::twitch::token_manager::TwitchTokenManager;
use crate::twitch::trending;

/// Twitch OAuth2 client ID, optional at compile time. Set NEXUS_TWITCH_CLIENT_ID when building
/// to enable Twitch (e.g. `$env:NEXUS_TWITCH_CLIENT_ID="your_id"; cargo build`).
fn twitch_client_id() -> Result<&'static str, CommandError> {
    option_env!("NEXUS_TWITCH_CLIENT_ID").ok_or_else(|| {
        CommandError::Auth(
            "Twitch integration is not configured. Set NEXUS_TWITCH_CLIENT_ID when building (e.g. in .env or your shell).".to_string(),
        )
    })
}

/// Optional client secret for confidential Twitch apps.
fn twitch_client_secret() -> Option<&'static str> {
    option_env!("NEXUS_TWITCH_CLIENT_SECRET")
}

/// Locate the manager. Available iff `TwitchTokenManager` was registered as managed state.
fn manager(app: &AppHandle) -> Result<Arc<TwitchTokenManager>, CommandError> {
    app.try_state::<Arc<TwitchTokenManager>>()
        .map(|s| s.inner().clone())
        .ok_or_else(|| {
            CommandError::Unknown(
                "Twitch token manager not registered (Twitch client id missing at build?)"
                    .to_string(),
            )
        })
}

/// Check for internet by attempting a connection to Twitch auth host.
fn check_network_available() -> Result<(), CommandError> {
    use std::net::ToSocketAddrs;
    let addr = ("id.twitch.tv", 443)
        .to_socket_addrs()
        .map_err(|e| CommandError::NetworkUnavailable(e.to_string()))?
        .next()
        .ok_or_else(|| {
            CommandError::NetworkUnavailable("no address for id.twitch.tv".to_string())
        })?;
    std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(5)).map_err(
        |_| {
            CommandError::NetworkUnavailable(
                "No internet connection. Please check your network and try again.".to_string(),
            )
        },
    )?;
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
    /// Logged-in user's Twitch avatar URL (Helix `users.profile_image_url`).
    /// May be `None` for users authenticated before this field was added; the
    /// next `validate_twitch_token` call will backfill it.
    pub profile_image_url: Option<String>,
}

/// Response envelope for all Twitch data commands (Story 19.2).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchResponse<T> {
    pub data: T,
    pub stale: bool,
    pub cached_at: Option<i64>,
}

/// Followed channel with optional live stream (Story 19.2). is_favorite (Story 19.7).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchChannel {
    pub id: String,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: String,
    pub is_live: bool,
    pub stream: Option<TwitchStream>,
    pub is_favorite: bool,
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

/// Stream with broadcaster identity for game detail "Live on Twitch" (Story 19.5).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchStreamByGame {
    pub user_id: String,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: String,
    pub title: String,
    pub game_name: String,
    pub game_id: String,
    pub viewer_count: i64,
    pub thumbnail_url: String,
    pub started_at: String,
}

/// One game in the user's library that is trending on Twitch (Story 19.9).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendingLibraryGame {
    pub game_id: String,
    pub game_name: String,
    pub twitch_game_name: String,
    pub twitch_viewer_count: i64,
    pub twitch_stream_count: i64,
    pub twitch_rank: i64,
}

/// Response payload for get_twitch_streams_by_game (Story 19.5).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamsByGameData {
    pub streams: Vec<TwitchStreamByGame>,
    pub twitch_game_name: String,
}

/// Initiate Twitch OAuth2 Authorization Code flow with PKCE + CSRF state. Opens browser,
/// captures callback (with branded HTML response), exchanges code for tokens, fetches user
/// (including avatar), persists via the manager, and starts the background refresh worker.
#[tauri::command]
pub async fn twitch_auth_start(app: AppHandle) -> Result<(), CommandError> {
    check_network_available()?;

    let mgr = manager(&app)?;

    let opener = app.opener();
    let open_url = move |url: &str| {
        let _ = opener.open_url(url, None::<&str>);
    };

    let result = auth::run_auth_flow(
        twitch_client_id()?,
        twitch_client_secret(),
        open_url,
    )
    .await?;

    mgr.store_initial(
        result.access_token,
        result.refresh_token,
        result.expires_at,
        result.user,
    )
    .await?;

    mgr.ensure_worker_running().await;
    Ok(())
}

/// Return current Twitch auth state. Pure read of the manager's in-memory snapshot --
/// no refresh side-effects (the background worker handles refresh).
#[tauri::command]
pub async fn twitch_auth_status(app: AppHandle) -> Result<TwitchAuthStatus, CommandError> {
    let mgr = match manager(&app) {
        Ok(m) => m,
        Err(_) => {
            return Ok(TwitchAuthStatus {
                authenticated: false,
                display_name: None,
                expires_at: None,
                profile_image_url: None,
            });
        }
    };
    let snap = mgr.snapshot().await;
    Ok(TwitchAuthStatus {
        authenticated: snap.is_authenticated(),
        display_name: snap.display_name,
        expires_at: snap.expires_at,
        profile_image_url: snap.profile_image_url,
    })
}

/// Validate the current access token with Twitch (`GET /oauth2/validate`). On success,
/// updates the stored expiry; if the avatar/display name is missing (legacy users), also
/// fetches `helix/users` to backfill them. On `Auth` error, asks the manager to refresh
/// (which is serialized through the same mutex the worker uses).
#[tauri::command]
pub async fn validate_twitch_token(app: AppHandle) -> Result<TwitchAuthStatus, CommandError> {
    let mgr = manager(&app)?;
    let snap = mgr.snapshot().await;
    let access_token = match snap.access_token.clone() {
        Some(t) => t,
        None => {
            return Ok(TwitchAuthStatus {
                authenticated: false,
                display_name: None,
                expires_at: None,
                profile_image_url: None,
            });
        }
    };

    match auth::validate_token(&access_token).await {
        Ok(expires_in) => {
            let new_expires_at = now_secs() + expires_in;
            mgr.update_expires_at(new_expires_at).await?;

            // Backfill avatar/display name for users authenticated before this field existed.
            if snap.profile_image_url.is_none() || snap.display_name.is_none() {
                if let Ok(client_id) = twitch_client_id() {
                    if let Ok(user) = auth::get_twitch_user(client_id, &access_token).await {
                        let _ = mgr.update_user_info(user).await;
                    }
                }
            }

            let snap = mgr.snapshot().await;
            Ok(TwitchAuthStatus {
                authenticated: snap.is_authenticated(),
                display_name: snap.display_name,
                expires_at: snap.expires_at,
                profile_image_url: snap.profile_image_url,
            })
        }
        Err(CommandError::Auth(_)) => {
            // Token confirmed invalid; ask the manager to refresh. If that fails, the manager
            // has already cleared state and emitted unauthenticated.
            match mgr.force_refresh().await {
                Ok(_) => {
                    let snap = mgr.snapshot().await;
                    Ok(TwitchAuthStatus {
                        authenticated: snap.is_authenticated(),
                        display_name: snap.display_name,
                        expires_at: snap.expires_at,
                        profile_image_url: snap.profile_image_url,
                    })
                }
                Err(CommandError::Auth(_)) => Ok(TwitchAuthStatus {
                    authenticated: false,
                    display_name: None,
                    expires_at: None,
                    profile_image_url: None,
                }),
                Err(_) => {
                    // Transient refresh failure: keep the user authenticated in the UI; the
                    // worker will retry shortly. Returning `authenticated: true` avoids the
                    // connect-prompt flash.
                    let snap = mgr.snapshot().await;
                    Ok(TwitchAuthStatus {
                        authenticated: true,
                        display_name: snap.display_name,
                        expires_at: snap.expires_at,
                        profile_image_url: snap.profile_image_url,
                    })
                }
            }
        }
        Err(_) => {
            // Transient validate failure (network/5xx) -- keep current state.
            Ok(TwitchAuthStatus {
                authenticated: snap.is_authenticated(),
                display_name: snap.display_name,
                expires_at: snap.expires_at,
                profile_image_url: snap.profile_image_url,
            })
        }
    }
}

/// On a Helix `Auth` error, ask the manager to force-refresh. Non-auth errors are returned
/// unchanged so the caller can fall back to cache.
async fn try_recover_auth_error(
    err: CommandError,
    mgr: &Arc<TwitchTokenManager>,
) -> Result<(String, String), CommandError> {
    if matches!(err, CommandError::Auth(_)) {
        mgr.force_refresh().await
    } else {
        Err(err)
    }
}

fn cached_at_now() -> i64 {
    now_secs()
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn fallback_trending_cache(
    cached: Vec<cache::CachedTrendingEntry>,
) -> TwitchResponse<Vec<TrendingLibraryGame>> {
    if cached.is_empty() {
        return TwitchResponse {
            data: vec![],
            stale: false,
            cached_at: None,
        };
    }
    let cached_at_secs = cached.first().map(|e| e.cached_at);
    let data = cached
        .into_iter()
        .map(|e| TrendingLibraryGame {
            game_id: e.game_id,
            game_name: e.game_name,
            twitch_game_name: e.twitch_game_name,
            twitch_viewer_count: e.twitch_viewer_count,
            twitch_stream_count: e.twitch_stream_count,
            twitch_rank: e.twitch_rank,
        })
        .collect();
    TwitchResponse {
        data,
        stale: true,
        cached_at: cached_at_secs,
    }
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
                is_favorite: c.is_favorite,
            }
        })
        .collect()
}

/// Get followed channels (and live status). Online: fetch from API, update cache, return fresh.
/// Offline/unreachable: return cache with stale: true.
#[tauri::command]
pub async fn get_twitch_followed_channels(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<TwitchResponse<Vec<TwitchChannel>>, CommandError> {
    let mgr = manager(&app)?;
    let (mut user_id, mut access_token) = mgr.get_valid_access_token().await?;

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
        let client_id = twitch_client_id()?;
        let http = reqwest::Client::new();
        let channels = match api::fetch_followed_channels(&http, client_id, &access_token, &user_id).await {
            Ok(ch) => ch,
            Err(e) => match try_recover_auth_error(e, &mgr).await {
                Ok((new_uid, new_tok)) => {
                    user_id = new_uid;
                    access_token = new_tok;
                    api::fetch_followed_channels(&http, client_id, &access_token, &user_id)
                        .await
                        .unwrap_or_default()
                }
                Err(_) => vec![],
            },
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
            let streams = api::fetch_live_streams(&http, client_id, &access_token, &user_ids)
                .await
                .unwrap_or_default();
            {
                let conn = db
                    .conn
                    .lock()
                    .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                cache::cache_live_streams(&conn, &streams)?;
            }
            // Re-read channels from DB so is_favorite is preserved (Story 19.7)
            let channels_with_favorites = {
                let conn = db
                    .conn
                    .lock()
                    .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                cache::get_cached_followed_channels(&conn)?
            };
            let merged = merge_channels_streams(channels_with_favorites, streams.clone());
            let channel_count = merged.len();
            let live_count = streams.len();
            let _ = app.emit(
                "twitch-data-updated",
                serde_json::json!({ "channelCount": channel_count, "liveCount": live_count, "stale": false }),
            );
            // Followed list potentially changed -> wake the EventSub worker so it
            // resubscribes against the new set on its next reconnect.
            mgr.wake_handle().notify_waiters();
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
    let mgr = manager(&app)?;
    let (mut user_id, mut access_token) = mgr.get_valid_access_token().await?;

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
        let client_id = twitch_client_id()?;
        let http = reqwest::Client::new();
        let channels = match api::fetch_followed_channels(&http, client_id, &access_token, &user_id).await {
            Ok(ch) => Some(ch),
            Err(e) => match try_recover_auth_error(e, &mgr).await {
                Ok((new_uid, new_tok)) => {
                    user_id = new_uid;
                    access_token = new_tok;
                    api::fetch_followed_channels(&http, client_id, &access_token, &user_id)
                        .await
                        .ok()
                }
                Err(_) => None,
            },
        };
        if let Some(chs) = channels {
            let user_ids: Vec<String> = chs.iter().map(|c| c.channel_id.clone()).collect();
            let streams = api::fetch_live_streams(&http, client_id, &access_token, &user_ids).await.ok();
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

/// Get top streams for a game/category by name. Resolves game name via Twitch API (or cache),
/// then fetches streams.
#[tauri::command]
pub async fn get_twitch_streams_by_game(
    app: AppHandle,
    db: State<'_, DbState>,
    game_name: String,
) -> Result<TwitchResponse<StreamsByGameData>, CommandError> {
    if game_name.trim().is_empty() {
        return Ok(TwitchResponse {
            data: StreamsByGameData {
                streams: vec![],
                twitch_game_name: String::new(),
            },
            stale: false,
            cached_at: None,
        });
    }

    let mgr = manager(&app)?;
    let (_, mut access_token) = mgr.get_valid_access_token().await?;

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
        let client_id = twitch_client_id()?;
        let http = reqwest::Client::new();
        let game_id_opt = match &cached_mapping {
            Some(m) => Some((m.twitch_game_id.clone(), m.twitch_game_name.clone())),
            None => match api::fetch_twitch_game(&http, client_id, &access_token, game_name.trim()).await {
                Ok(opt) => opt,
                Err(e) => match try_recover_auth_error(e, &mgr).await {
                    Ok((_, new_tok)) => {
                        access_token = new_tok;
                        api::fetch_twitch_game(&http, client_id, &access_token, game_name.trim())
                            .await
                            .ok()
                            .flatten()
                    }
                    Err(_) => None,
                },
            },
        };
        if let Some((twitch_id, twitch_name)) = game_id_opt {
            match api::fetch_streams_by_game(&http, client_id, &access_token, game_name.trim()).await
            {
                Ok((streams, twitch_game_name)) => {
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    cache::cache_game_mapping(&conn, game_name.trim(), &twitch_id, &twitch_name)?;
                    drop(conn);
                    let out: Vec<TwitchStreamByGame> = streams
                        .into_iter()
                        .map(|s| TwitchStreamByGame {
                            user_id: s.user_id,
                            login: s.user_login,
                            display_name: s.user_name,
                            profile_image_url: s.profile_image_url,
                            title: s.title,
                            game_name: s.game_name,
                            game_id: s.game_id,
                            viewer_count: s.viewer_count,
                            thumbnail_url: s.thumbnail_url,
                            started_at: s.started_at,
                        })
                        .collect();
                    return Ok(TwitchResponse {
                        data: StreamsByGameData {
                            streams: out,
                            twitch_game_name,
                        },
                        stale: false,
                        cached_at: Some(cached_at_now()),
                    });
                }
                Err(e) => {
                    if let Ok((_, new_tok)) = try_recover_auth_error(e, &mgr).await {
                        access_token = new_tok;
                        if let Ok((streams, twitch_game_name)) =
                            api::fetch_streams_by_game(&http, client_id, &access_token, game_name.trim()).await
                        {
                            let conn = db
                                .conn
                                .lock()
                                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                            cache::cache_game_mapping(&conn, game_name.trim(), &twitch_id, &twitch_name)?;
                            drop(conn);
                            let out: Vec<TwitchStreamByGame> = streams
                                .into_iter()
                                .map(|s| TwitchStreamByGame {
                                    user_id: s.user_id,
                                    login: s.user_login,
                                    display_name: s.user_name,
                                    profile_image_url: s.profile_image_url,
                                    title: s.title,
                                    game_name: s.game_name,
                                    game_id: s.game_id,
                                    viewer_count: s.viewer_count,
                                    thumbnail_url: s.thumbnail_url,
                                    started_at: s.started_at,
                                })
                                .collect();
                            return Ok(TwitchResponse {
                                data: StreamsByGameData {
                                    streams: out,
                                    twitch_game_name,
                                },
                                stale: false,
                                cached_at: Some(cached_at_now()),
                            });
                        }
                    }
                }
            }
        }
    }

    // No per-game stream cache; return empty when offline.
    Ok(TwitchResponse {
        data: StreamsByGameData {
            streams: vec![],
            twitch_game_name: String::new(),
        },
        stale: true,
        cached_at: cached_at_secs,
    })
}

/// Set favorite state for a followed channel (Story 19.7).
#[tauri::command]
pub fn set_twitch_favorite(
    db: State<'_, DbState>,
    channel_id: String,
    is_favorite: bool,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    cache::set_channel_favorite(&conn, &channel_id, is_favorite)?;
    Ok(())
}

/// Get library games that are in Twitch's top 100 (Story 19.9).
#[tauri::command]
pub async fn get_twitch_trending_library_games(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<TwitchResponse<Vec<TrendingLibraryGame>>, CommandError> {
    let mgr = manager(&app)?;
    let (_, mut access_token) = mgr.get_valid_access_token().await?;

    let cached = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        cache::get_cached_trending_library(&conn)?
    };

    // When online and cache is still valid (15 min TTL), return cache to avoid unnecessary API calls (rate limits).
    if !cached.is_empty() && check_twitch_api_available() {
        let cached_at_secs = cached.first().map(|e| e.cached_at);
        let data = cached
            .iter()
            .map(|e| TrendingLibraryGame {
                game_id: e.game_id.clone(),
                game_name: e.game_name.clone(),
                twitch_game_name: e.twitch_game_name.clone(),
                twitch_viewer_count: e.twitch_viewer_count,
                twitch_stream_count: e.twitch_stream_count,
                twitch_rank: e.twitch_rank,
            })
            .collect();
        return Ok(TwitchResponse {
            data,
            stale: false,
            cached_at: cached_at_secs,
        });
    }

    if check_twitch_api_available() {
        let client_id = twitch_client_id()?;
        let http = reqwest::Client::new();
        let top_games = match api::fetch_top_games(&http, client_id, &access_token).await {
            Ok(t) => t,
            Err(e) => match try_recover_auth_error(e, &mgr).await {
                Ok((_, new_tok)) => {
                    access_token = new_tok;
                    match api::fetch_top_games(&http, client_id, &access_token).await {
                        Ok(t) => t,
                        Err(_) => return Ok(fallback_trending_cache(cached)),
                    }
                }
                Err(_) => return Ok(fallback_trending_cache(cached)),
            },
        };

        let library = {
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            trending::load_library_games(&conn)?
        };

        let mut entries = trending::match_trending_library(&top_games, &library);
        let _ = trending::enrich_trending_with_viewer_counts(
            &http,
            client_id,
            &access_token,
            &mut entries,
        )
        .await;

        {
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            cache::cache_trending_library(&conn, &entries)?;
        }

        let data = entries
            .into_iter()
            .map(|e| TrendingLibraryGame {
                game_id: e.game_id,
                game_name: e.game_name,
                twitch_game_name: e.twitch_game_name,
                twitch_viewer_count: e.twitch_viewer_count,
                twitch_stream_count: e.twitch_stream_count,
                twitch_rank: e.twitch_rank,
            })
            .collect();

        return Ok(TwitchResponse {
            data,
            stale: false,
            cached_at: Some(cached_at_now()),
        });
    }

    Ok(fallback_trending_cache(cached))
}

/// Clear all Twitch tokens, user data, and offline cache; emit twitch-auth-changed.
#[tauri::command]
pub async fn twitch_auth_logout(app: AppHandle) -> Result<(), CommandError> {
    let mgr = manager(&app)?;
    mgr.logout().await?;
    Ok(())
}

/// Clear Twitch cached data only (no disconnect).
#[tauri::command]
pub fn clear_twitch_cache(db: State<'_, DbState>) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    cache::clear_twitch_cache(&conn)?;
    Ok(())
}

/// Check if Twitch API is reachable (Story 19.11).
#[tauri::command]
pub fn check_connectivity() -> Result<CheckConnectivityResult, CommandError> {
    let online = crate::utils::connectivity::check_online();
    Ok(CheckConnectivityResult { online })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckConnectivityResult {
    pub online: bool,
}

/// Convenience used by `lib.rs` startup wiring.
pub fn build_token_manager(app: AppHandle) -> Option<Arc<TwitchTokenManager>> {
    let client_id = option_env!("NEXUS_TWITCH_CLIENT_ID")?;
    // `client_secret` is baked in at compile time via option_env! and forwarded
    // to the refresh flow. Without it, Twitch rejects refresh with
    // `400 invalid_client: missing client secret`.
    let client_secret = twitch_client_secret();
    Some(Arc::new(TwitchTokenManager::new(
        app,
        client_id,
        client_secret,
    )))
}

// ---------------------------------------------------------------------------
// Story E1: Watch history commands.
// Logged from the StreamEmbed React component (inline + pop-out window).
// ---------------------------------------------------------------------------

use crate::twitch::watch_history;

/// Begin a watch session. Returns the new session id; pass it back to
/// [`twitch_watch_session_end`] when the embed closes.
#[tauri::command]
pub fn twitch_watch_session_start(
    db: State<'_, DbState>,
    channel_login: String,
    channel_display_name: Option<String>,
    twitch_game_id: Option<String>,
    twitch_game_name: Option<String>,
    nexus_game_id: Option<String>,
) -> Result<i64, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    watch_history::start_session(
        &conn,
        &channel_login,
        channel_display_name.as_deref(),
        twitch_game_id.as_deref(),
        twitch_game_name.as_deref(),
        nexus_game_id.as_deref(),
    )
}

/// End a watch session. `duration_secs` is the *effective* watch time tracked by the
/// frontend (visibility-aware); `watch_history::end_session` clamps it to a 24h ceiling.
#[tauri::command]
pub fn twitch_watch_session_end(
    db: State<'_, DbState>,
    session_id: i64,
    duration_secs: i64,
) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    watch_history::end_session(&conn, session_id, duration_secs)
}

/// Aggregate the last `period_days` of watch history for the Stats tile.
#[tauri::command]
pub fn get_twitch_watch_stats(
    db: State<'_, DbState>,
    period_days: i64,
    top_n: Option<usize>,
) -> Result<watch_history::WatchAggregate, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    watch_history::aggregate_for_recent_days(&conn, period_days, top_n.unwrap_or(3))
}

/// Aggregate a calendar year (UTC) of watch history for Wrapped.
#[tauri::command]
pub fn get_twitch_watch_year(
    db: State<'_, DbState>,
    year: i32,
    top_n: Option<usize>,
) -> Result<watch_history::WatchAggregate, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    watch_history::aggregate_for_year(&conn, year, top_n.unwrap_or(3))
}

/// Aggregate Twitch watch history for an arbitrary inclusive date range
/// (`YYYY-MM-DD` strings, UTC).
///
/// Used by both the Stats `Twitch watch time` tile (driven by the date-range
/// picker) and the Wrapped Twitch slide (driven by the period selector). Pass
/// the date range that has already been resolved on the frontend so this command
/// stays free of preset-resolution logic.
#[tauri::command]
pub fn get_twitch_watch_for_range(
    db: State<'_, DbState>,
    start_date: String,
    end_date: String,
    top_n: Option<usize>,
) -> Result<watch_history::WatchAggregate, CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    watch_history::aggregate_for_iso_dates(&conn, &start_date, &end_date, top_n.unwrap_or(3))
}

// ---------------------------------------------------------------------------
// Story A1: Twitch stream pop-out window.
// ---------------------------------------------------------------------------

/// Sanitize a Twitch login (alphanumeric + underscore, max 25 chars per Twitch's rules)
/// for use as a window label. We never trust the frontend payload as a label directly
/// because Tauri labels affect capability matching.
fn sanitize_login_for_label(login: &str) -> String {
    login
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .take(25)
        .collect::<String>()
        .to_ascii_lowercase()
}

/// Whitelist of URL schemes we will hand off to the OS default browser when
/// the pop-out webview asks to open a new window. Twitch chat links, profile
/// links, and shared URLs all land as `http`/`https`; occasionally an
/// `irc://` or `ftp://` slips through Twitch's URL parser and we explicitly
/// do not want to launch whatever handler is registered for those. `mailto:`
/// is included because legitimate chat links use it.
fn is_safe_external_url(url_str: &str) -> bool {
    let lower = url_str.to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
}

/// Route a new-window request from a pop-out Twitch window (stream or clip)
/// to the user's OS default browser via the opener plugin.
///
/// Why this exists: links clicked inside the Twitch chat iframe are
/// `target="_blank"`, which in WebView2 fires `NewWindowRequested` on the
/// host webview. By default Tauri swallows the request silently, so clicking
/// a username, a shared link, or any other chat link does nothing. Routing
/// the URL out to the system browser restores the expected behaviour without
/// reopening the window inside Nexus (which would load `twitch.tv` at
/// `tauri.localhost` and trip Twitch's `frame-ancestors` CSP).
fn route_new_window_to_browser(app: &AppHandle, url: &tauri::Url) {
    let url_str = url.as_str();
    if !is_safe_external_url(url_str) {
        eprintln!(
            "[twitch-popout] refusing to route non-http(s) new-window url: {url_str}"
        );
        return;
    }
    if let Err(e) = app.opener().open_url(url_str, None::<&str>) {
        eprintln!("[twitch-popout] failed to open new-window url in browser: {e}");
    }
}

/// Spawn (or focus) a Twitch player window for `channel_login`.
///
/// Each stream is its own regular, freely-draggable Tauri window — no
/// always-on-top, native decorations, minimise/close like any other window.
/// Dedup: the label is `popout-{login}`, so calling this twice for the same
/// channel just focuses the existing window.
///
/// ## URL origin
///
/// The window loads `http://localhost:PORT/watch?...` from the local embed
/// server — NOT the packaged React app at `https://tauri.localhost`. That's
/// the only way to satisfy Twitch's `frame-ancestors` CSP (which requires the
/// entire ancestor chain to be `localhost`). Native window decorations are
/// enabled so we don't have to ferry Tauri's drag/close permissions to the
/// remote origin via capabilities.
#[tauri::command]
pub async fn popout_stream(
    app: AppHandle,
    channel_login: String,
    channel_display_name: Option<String>,
    twitch_game_id: Option<String>,
    twitch_game_name: Option<String>,
) -> Result<(), CommandError> {
    let safe = sanitize_login_for_label(&channel_login);
    if safe.is_empty() {
        return Err(CommandError::Unknown("invalid channel login".to_string()));
    }
    let label = format!("popout-{}", safe);

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let watch_url = build_watch_url(
        &app,
        &channel_login,
        channel_display_name.as_deref(),
        twitch_game_id.as_deref(),
        twitch_game_name.as_deref(),
    )?;

    let title = match channel_display_name.as_deref() {
        Some(dn) => format!("{} · Twitch", dn),
        None => format!("{} · Twitch", channel_login),
    };

    let app_for_new_window = app.clone();
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(watch_url))
        .title(title)
        .inner_size(1024.0, 640.0)
        .min_inner_size(480.0, 320.0)
        .decorations(true)
        .resizable(true)
        .skip_taskbar(false)
        // Must match the main window so the WebView2 data directory (and
        // therefore the Twitch cookie jar) is shared across windows.
        .additional_browser_args(NEXUS_WEBVIEW_ARGS)
        // Every `target="_blank"` link clicked inside the Twitch chat iframe
        // (usernames, shared links, Twitch videos, etc.) surfaces here. We
        // hand them off to the OS default browser and deny the in-webview
        // pop-up so Nexus never tries to open twitch.tv inside its own
        // webview — that path fails Twitch's CSP and produces a blank
        // window.
        .on_new_window(move |url, _features| {
            route_new_window_to_browser(&app_for_new_window, &url);
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| CommandError::Unknown(format!("failed to create pop-out: {e}")))?;

    register_watch_session_for_window(
        &app,
        &window,
        &channel_login,
        channel_display_name.as_deref(),
        twitch_game_id.as_deref(),
        twitch_game_name.as_deref(),
    );

    Ok(())
}

/// Build the `http://localhost:PORT/watch?...` URL the pop-out windows load.
/// Pulls the embed-server base URL and random API token from Tauri state.
fn build_watch_url(
    app: &AppHandle,
    channel_login: &str,
    channel_display_name: Option<&str>,
    twitch_game_id: Option<&str>,
    twitch_game_name: Option<&str>,
) -> Result<tauri::Url, CommandError> {
    let base = app
        .try_state::<TwitchEmbedBaseUrl>()
        .map(|s| s.0.clone())
        .unwrap_or_default();
    if base.is_empty() {
        return Err(CommandError::Unknown(
            "Twitch embed server is not running".to_string(),
        ));
    }
    let token = app
        .try_state::<TwitchEmbedToken>()
        .map(|s| s.0.clone())
        .unwrap_or_default();

    let mut query = format!(
        "channel={}&token={}",
        urlencoding::encode(channel_login),
        urlencoding::encode(&token),
    );
    if let Some(dn) = channel_display_name {
        query.push_str(&format!("&display={}", urlencoding::encode(dn)));
    }
    if let Some(gid) = twitch_game_id {
        query.push_str(&format!("&gameId={}", urlencoding::encode(gid)));
    }
    if let Some(gn) = twitch_game_name {
        query.push_str(&format!("&gameName={}", urlencoding::encode(gn)));
    }
    let url = format!("{base}/watch?{query}");
    url.parse::<tauri::Url>()
        .map_err(|e| CommandError::Unknown(format!("bad watch url: {e}")))
}

/// Spawn (or focus) a Twitch clip player window.
///
/// Clips need the exact same `frame-ancestors=localhost` work-around as
/// streams — the inline modal-iframe approach shows "clips.twitch.tv
/// refused to connect" in packaged builds. Each clip gets its own window
/// keyed by clip id, so re-clicking the same clip re-focuses instead of
/// spawning duplicates.
#[tauri::command]
pub async fn popout_clip(
    app: AppHandle,
    clip_id: String,
    clip_title: Option<String>,
    broadcaster_name: Option<String>,
) -> Result<(), CommandError> {
    let safe = sanitize_clip_id_for_label(&clip_id);
    if safe.is_empty() {
        return Err(CommandError::Unknown("invalid clip id".to_string()));
    }
    let label = format!("clip-{}", safe);

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let clip_url = build_clip_url(&app, &clip_id)?;

    // Title preference: "<Clip title> · <Broadcaster>" → falls back through
    // the title alone, then the broadcaster, then a generic label.
    let title = match (clip_title.as_deref(), broadcaster_name.as_deref()) {
        (Some(t), Some(b)) if !t.is_empty() && !b.is_empty() => {
            format!("{} · {}", t, b)
        }
        (Some(t), _) if !t.is_empty() => t.to_string(),
        (_, Some(b)) if !b.is_empty() => format!("{} · Clip", b),
        _ => "Twitch clip".to_string(),
    };

    let app_for_new_window = app.clone();
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(clip_url))
        .title(title)
        .inner_size(960.0, 560.0)
        .min_inner_size(480.0, 320.0)
        .decorations(true)
        .resizable(true)
        .skip_taskbar(false)
        // Must match the main window so the WebView2 data directory (and
        // therefore the Twitch cookie jar) is shared across windows.
        .additional_browser_args(NEXUS_WEBVIEW_ARGS)
        // Links inside the clip's embedded chrome behave the same way chat
        // links do — route them to the OS default browser.
        .on_new_window(move |url, _features| {
            route_new_window_to_browser(&app_for_new_window, &url);
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| CommandError::Unknown(format!("failed to create clip pop-out: {e}")))?;

    Ok(())
}

/// Sanitiser for Twitch clip ids, mirrored from
/// `crate::twitch::embed_server::sanitize_clip_id` but re-implemented here
/// to keep the two modules decoupled (the embed server is otherwise a
/// self-contained module with no `commands::twitch` imports). Clip slugs
/// are ASCII alphanumeric + `-` + `_`; we cap length to keep window labels
/// well under Tauri/OS limits.
fn sanitize_clip_id_for_label(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(64)
        .collect()
}

/// Build the `http://localhost:PORT/clip?id=...&token=...` URL for the
/// clip-player page.
fn build_clip_url(app: &AppHandle, clip_id: &str) -> Result<tauri::Url, CommandError> {
    let base = app
        .try_state::<TwitchEmbedBaseUrl>()
        .map(|s| s.0.clone())
        .unwrap_or_default();
    if base.is_empty() {
        return Err(CommandError::Unknown(
            "Twitch embed server is not running".to_string(),
        ));
    }
    let token = app
        .try_state::<TwitchEmbedToken>()
        .map(|s| s.0.clone())
        .unwrap_or_default();

    let url = format!(
        "{base}/clip?id={}&token={}",
        urlencoding::encode(clip_id),
        urlencoding::encode(&token),
    );
    url.parse::<tauri::Url>()
        .map_err(|e| CommandError::Unknown(format!("bad clip url: {e}")))
}

/// Tauri-managed wrapper around the local Twitch embed server's base URL
/// (e.g. `http://localhost:53127`). Populated by `lib.rs` during setup; the
/// frontend reads it via [`get_twitch_embed_base_url`] and uses it to build
/// `<iframe src="...">` URLs that satisfy Twitch's `parent=` validation.
///
/// See `crate::twitch::embed_server` for the rationale.
pub struct TwitchEmbedBaseUrl(pub String);

/// Random per-session token required to call the embed server's `/__api/*`
/// endpoints (and to load `/watch`). Generated at startup by
/// `embed_server::start` and stashed in Tauri state so Rust-side code that
/// builds watch URLs can include `?token=...` in them.
pub struct TwitchEmbedToken(pub String);

/// Tracks active Twitch watch sessions by the window label that owns them.
/// Populated by [`popout_stream`] when it builds a window, and drained on the
/// window's `Destroyed` event to compute duration and call
/// [`crate::twitch::watch_history::end_session`].
///
/// Moving this bookkeeping from the frontend `useWatchSession` hook to Rust
/// was necessary because the popout / overlay windows now load directly from
/// the local HTTP embed server (`http://localhost:PORT/watch?...`) — a page
/// whose React bundle and `invoke` runtime have been stripped out. Tracking
/// via the window lifecycle is also more reliable (a crashed process can't
/// skip the unload handler).
pub struct WatchSessionRegistry(pub std::sync::Mutex<std::collections::HashMap<String, (i64, std::time::Instant)>>);

impl Default for WatchSessionRegistry {
    fn default() -> Self {
        Self(std::sync::Mutex::new(std::collections::HashMap::new()))
    }
}

/// Record a started Twitch watch session for the given Tauri window, and wire
/// the window's `Destroyed` event to close the session with the elapsed time.
fn register_watch_session_for_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
    channel_login: &str,
    channel_display_name: Option<&str>,
    twitch_game_id: Option<&str>,
    twitch_game_name: Option<&str>,
) {
    let db = match app.try_state::<DbState>() {
        Some(d) => d,
        None => return,
    };
    let session_id = {
        let conn = match db.conn.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        match crate::twitch::watch_history::start_session(
            &conn,
            channel_login,
            channel_display_name,
            twitch_game_id,
            twitch_game_name,
            None,
        ) {
            Ok(id) => id,
            Err(e) => {
                eprintln!("[twitch-watch] start_session failed: {e:?}");
                return;
            }
        }
    };

    let label = window.label().to_string();
    if let Some(reg) = app.try_state::<WatchSessionRegistry>() {
        if let Ok(mut map) = reg.0.lock() {
            map.insert(label.clone(), (session_id, std::time::Instant::now()));
        }
    }

    let app_for_event = app.clone();
    window.on_window_event(move |e| {
        if matches!(e, tauri::WindowEvent::Destroyed) {
            end_watch_session_for_label(&app_for_event, &label);
        }
    });
}

fn end_watch_session_for_label<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    let removed = match app.try_state::<WatchSessionRegistry>() {
        Some(reg) => match reg.0.lock() {
            Ok(mut map) => map.remove(label),
            Err(_) => return,
        },
        None => return,
    };
    let (session_id, started) = match removed {
        Some(v) => v,
        None => return,
    };
    let dur = started.elapsed().as_secs() as i64;
    if let Some(db) = app.try_state::<DbState>() {
        if let Ok(conn) = db.conn.lock() {
            let _ = crate::twitch::watch_history::end_session(&conn, session_id, dur);
        }
    }
}

/// WebView2 command-line arguments applied to every window the launcher creates.
///
/// **IMPORTANT: do NOT add `--disable-web-security` here.** It strips the
/// `Origin` header from every `fetch`, including the internal `ipc.localhost`
/// requests Tauri uses for `invoke(...)`. Tauri rejects Origin-less IPC with
/// HTTP 500 (`missing Origin header`), which breaks *every* settings read,
/// onboarding check, DB query, etc. Twitch CSP is worked around by hosting
/// the embed pages on `http://localhost:PORT` (see `twitch::embed_server` and
/// [`build_watch_url`]) instead.
///
/// **Why this is shared**: Tauri requires every window in the app to use the
/// same `additionalBrowserArgs` value, otherwise each window gets its own
/// WebView2 data directory and they stop sharing the cookie jar — which would
/// break the in-app Twitch login (it relies on the cookie jar being shared
/// between the login window and the embed iframes).
///
/// The flags repeat the defaults Tauri normally injects
/// (`msWebOOUI,msPdfOOUI,msSmartScreenProtection`) because setting this field
/// replaces the default list — we have to opt back in to keep them.
pub const NEXUS_WEBVIEW_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,BlockInsecurePrivateNetworkRequests --autoplay-policy=no-user-gesture-required";

/// Return the base URL of the local Twitch embed server (e.g.
/// `http://localhost:53127`). Frontend appends `/player?channel=...` or
/// `/chat?channel=...` to construct iframe `src` URLs.
///
/// Returns an empty string if the server failed to start (the frontend then
/// falls back to the direct twitch.tv embed URL — which works in `tauri dev`
/// but not in packaged builds).
#[tauri::command]
pub fn get_twitch_embed_base_url(state: State<'_, TwitchEmbedBaseUrl>) -> String {
    state.0.clone()
}

/// Stable label for the in-app Twitch login helper window.
const TWITCH_LOGIN_LABEL: &str = "twitch-login";

/// Open (or focus) a Tauri window navigated to `https://www.twitch.tv/login`.
///
/// Why this exists: the `player.twitch.tv` / `embed.twitch.tv` iframes know who
/// the viewer is via twitch.tv's own session cookies. They cannot accept the
/// Helix OAuth token we already hold — Twitch deliberately doesn't expose that
/// hook for embeds. A Tauri window navigated to twitch.tv shares the WebView2
/// (or WebKit) cookie jar with every other window in the app, so once the user
/// signs in here, every embed iframe in the launcher is automatically logged in
/// (chat, follow button, mature-content auto-confirm, etc.).
///
/// Closing the window emits `nexus://twitch-login-closed`. The frontend listens
/// for that and reloads any mounted embed iframes so they pick up the new
/// cookies without the user having to close-and-reopen the embed.
#[tauri::command]
pub async fn open_twitch_login(app: AppHandle) -> Result<(), CommandError> {
    if let Some(existing) = app.get_webview_window(TWITCH_LOGIN_LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let login_url: tauri::Url = "https://www.twitch.tv/login"
        .parse()
        .map_err(|e| CommandError::Unknown(format!("bad login url: {e}")))?;

    let window = WebviewWindowBuilder::new(
        &app,
        TWITCH_LOGIN_LABEL,
        WebviewUrl::External(login_url),
    )
    .title("Sign in to Twitch")
    .inner_size(960.0, 720.0)
    .min_inner_size(480.0, 480.0)
    .resizable(true)
    .decorations(true)
    .skip_taskbar(false)
    // Must match every other window so the WebView2 data directory (cookie
    // jar) is shared. Without this the user's twitch.tv login wouldn't
    // propagate to the embed iframes in the main and pop-out windows.
    .additional_browser_args(NEXUS_WEBVIEW_ARGS)
    .build()
    .map_err(|e| CommandError::Unknown(format!("failed to open login window: {e}")))?;

    // When the user closes the window (after signing in or giving up), notify the
    // frontend so it can reload any mounted embed iframes — that's what makes the
    // newly-set cookies take effect without the user having to reopen the embed.
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let _ = app_for_close.emit("nexus://twitch-login-closed", ());
        }
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Story A2: top clips per library game.
// ---------------------------------------------------------------------------

/// Default lookback window for "top clips per game" — matches the spec's 7 days.
const CLIPS_PERIOD_DAYS: u32 = 7;
/// Number of clips returned to the UI (the row in `DetailContent` shows 6 thumbnails).
const CLIPS_COUNT: u32 = 6;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameClipsResponse {
    pub clips: Vec<api::TwitchClip>,
    pub twitch_game_id: String,
    pub twitch_game_name: String,
    pub stale: bool,
    pub cached_at: Option<i64>,
}

/// Fetch top clips for a Nexus library game. The Twitch game id is resolved via the
/// existing `twitch_game_cache` (24h TTL) so we don't burn an API call on every detail
/// view open. Clip rows themselves are cached for 6h.
#[tauri::command]
pub async fn get_twitch_clips_for_game(
    app: AppHandle,
    db: State<'_, DbState>,
    game_name: String,
) -> Result<GameClipsResponse, CommandError> {
    if game_name.trim().is_empty() {
        return Ok(GameClipsResponse {
            clips: vec![],
            twitch_game_id: String::new(),
            twitch_game_name: String::new(),
            stale: false,
            cached_at: None,
        });
    }

    let mgr = manager(&app)?;
    let (_, mut access_token) = mgr.get_valid_access_token().await?;
    let client_id = twitch_client_id()?;

    // Resolve Twitch game id (cache first, network second).
    let cached_mapping = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        cache::get_cached_game_mapping(&conn, game_name.trim())?
    };

    let http = reqwest::Client::new();
    let (twitch_game_id, twitch_game_name) = match cached_mapping {
        Some(m) => (m.twitch_game_id, m.twitch_game_name),
        None => {
            let resolved = match api::fetch_twitch_game(
                &http,
                client_id,
                &access_token,
                game_name.trim(),
            )
            .await
            {
                Ok(opt) => opt,
                Err(e) => match try_recover_auth_error(e, &mgr).await {
                    Ok((_, new_tok)) => {
                        access_token = new_tok;
                        api::fetch_twitch_game(&http, client_id, &access_token, game_name.trim())
                            .await
                            .ok()
                            .flatten()
                    }
                    Err(_) => None,
                },
            };
            match resolved {
                Some((id, name)) => {
                    let conn = db
                        .conn
                        .lock()
                        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                    cache::cache_game_mapping(&conn, game_name.trim(), &id, &name)?;
                    (id, name)
                }
                None => {
                    return Ok(GameClipsResponse {
                        clips: vec![],
                        twitch_game_id: String::new(),
                        twitch_game_name: String::new(),
                        stale: false,
                        cached_at: None,
                    })
                }
            }
        }
    };

    // Try fresh cache.
    {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        if let Some((payload, fetched_at)) =
            cache::get_cached_clips_payload(&conn, &twitch_game_id, CLIPS_PERIOD_DAYS)?
        {
            if cache::is_clips_payload_fresh(fetched_at) {
                if let Ok(clips) = serde_json::from_str::<Vec<api::TwitchClip>>(&payload) {
                    return Ok(GameClipsResponse {
                        clips,
                        twitch_game_id,
                        twitch_game_name,
                        stale: false,
                        cached_at: Some(fetched_at),
                    });
                }
            }
        }
    }

    // Network fetch (with one auth recovery).
    let clips = match api::get_top_clips(
        &http,
        client_id,
        &access_token,
        &twitch_game_id,
        CLIPS_PERIOD_DAYS,
        CLIPS_COUNT,
    )
    .await
    {
        Ok(c) => c,
        Err(e) => match try_recover_auth_error(e, &mgr).await {
            Ok((_, new_tok)) => {
                access_token = new_tok;
                api::get_top_clips(
                    &http,
                    client_id,
                    &access_token,
                    &twitch_game_id,
                    CLIPS_PERIOD_DAYS,
                    CLIPS_COUNT,
                )
                .await
                .unwrap_or_default()
            }
            Err(_) => {
                // Fall back to stale cache if any exists.
                let conn = db
                    .conn
                    .lock()
                    .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
                if let Some((payload, fetched_at)) =
                    cache::get_cached_clips_payload(&conn, &twitch_game_id, CLIPS_PERIOD_DAYS)?
                {
                    if let Ok(clips) = serde_json::from_str::<Vec<api::TwitchClip>>(&payload) {
                        return Ok(GameClipsResponse {
                            clips,
                            twitch_game_id,
                            twitch_game_name,
                            stale: true,
                            cached_at: Some(fetched_at),
                        });
                    }
                }
                Vec::new()
            }
        },
    };

    if !clips.is_empty() {
        if let Ok(payload) = serde_json::to_string(&clips) {
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            let _ =
                cache::store_clips_payload(&conn, &twitch_game_id, CLIPS_PERIOD_DAYS, &payload);
        }
    }

    Ok(GameClipsResponse {
        clips,
        twitch_game_id,
        twitch_game_name,
        stale: false,
        cached_at: Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
        ),
    })
}

// ---------------------------------------------------------------------------
// Story D1: Twitch diagnostics commands.
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchDiagnostics {
    pub token_authenticated: bool,
    pub token_expires_at: Option<i64>,
    pub token_expires_in_secs: Option<i64>,
    pub last_refresh_at: Option<i64>,
    pub last_refresh_error: Option<String>,
    pub display_name: Option<String>,
    pub user_id: Option<String>,
    pub rate_limit: api::RateLimitSnapshot,
    pub eventsub_connected: bool,
    pub eventsub_session_id: Option<String>,
    pub eventsub_subscription_count: u32,
    pub last_event_at: Option<i64>,
    pub now_secs: i64,
}

/// Lightweight, cheap-to-call snapshot of every Twitch subsystem the user might want to
/// inspect from the Settings sheet (Story D1). Polled at ~5s while the diagnostics panel
/// is open; no IO beyond a few atomic reads + an in-memory `TokenState` clone.
#[tauri::command]
pub async fn get_twitch_diagnostics(app: AppHandle) -> Result<TwitchDiagnostics, CommandError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // Manager may not be registered when the build was made without
    // NEXUS_TWITCH_CLIENT_ID — surface that as "not authenticated" rather than an error,
    // so the diagnostics panel can still render and explain what's wrong.
    let mgr = match manager(&app) {
        Ok(m) => m,
        Err(_) => {
            return Ok(TwitchDiagnostics {
                token_authenticated: false,
                token_expires_at: None,
                token_expires_in_secs: None,
                last_refresh_at: None,
                last_refresh_error: Some("Twitch client id not configured at build".to_string()),
                display_name: None,
                user_id: None,
                rate_limit: api::rate_limit_snapshot(),
                eventsub_connected: false,
                eventsub_session_id: None,
                eventsub_subscription_count: 0,
                last_event_at: None,
                now_secs: now,
            });
        }
    };

    let snap = mgr.snapshot().await;
    let last_refresh = mgr.last_refresh_at();
    let last_event = mgr.last_event_at();

    Ok(TwitchDiagnostics {
        token_authenticated: snap.is_authenticated(),
        token_expires_at: snap.expires_at,
        token_expires_in_secs: snap.expires_at.map(|e| e - now),
        last_refresh_at: if last_refresh > 0 { Some(last_refresh) } else { None },
        last_refresh_error: mgr.last_refresh_error(),
        display_name: snap.display_name,
        user_id: snap.user_id,
        rate_limit: api::rate_limit_snapshot(),
        eventsub_connected: mgr.eventsub_connected(),
        eventsub_session_id: mgr.eventsub_session_id(),
        eventsub_subscription_count: mgr.eventsub_subscription_count(),
        last_event_at: if last_event > 0 { Some(last_event) } else { None },
        now_secs: now,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchTestConnectionResult {
    pub ok: bool,
    pub latency_ms: i64,
    pub error: Option<String>,
}

/// "Test connection" button (Story D1). Validates the current access token via
/// `oauth2/validate` and times the round-trip. Returns a structured result so the panel
/// can show ✓/✗ + latency without having to interpret thrown errors.
#[tauri::command]
pub async fn twitch_test_connection(
    app: AppHandle,
) -> Result<TwitchTestConnectionResult, CommandError> {
    let mgr = match manager(&app) {
        Ok(m) => m,
        Err(e) => {
            return Ok(TwitchTestConnectionResult {
                ok: false,
                latency_ms: 0,
                error: Some(format!("{e}")),
            });
        }
    };

    let start = std::time::Instant::now();
    let access_token = match mgr.get_valid_access_token().await {
        Ok((_, tok)) => tok,
        Err(e) => {
            return Ok(TwitchTestConnectionResult {
                ok: false,
                latency_ms: start.elapsed().as_millis() as i64,
                error: Some(format!("{e}")),
            });
        }
    };

    match auth::validate_token(&access_token).await {
        Ok(_) => Ok(TwitchTestConnectionResult {
            ok: true,
            latency_ms: start.elapsed().as_millis() as i64,
            error: None,
        }),
        Err(e) => Ok(TwitchTestConnectionResult {
            ok: false,
            latency_ms: start.elapsed().as_millis() as i64,
            error: Some(format!("{e}")),
        }),
    }
}

#[cfg(test)]
mod diagnostics_tests {
    use super::*;

    #[test]
    fn diagnostics_serializes_with_camel_case_keys() {
        let diag = TwitchDiagnostics {
            token_authenticated: true,
            token_expires_at: Some(1_700_000_000),
            token_expires_in_secs: Some(3600),
            last_refresh_at: Some(1_699_999_000),
            last_refresh_error: None,
            display_name: Some("Streamer".to_string()),
            user_id: Some("123".to_string()),
            rate_limit: api::RateLimitSnapshot {
                tokens_used: 5,
                tokens_remaining: 795,
                window_reset_at: 1_700_000_060,
                window_secs: 60,
                cap: 800,
            },
            eventsub_connected: true,
            eventsub_session_id: Some("SESS".to_string()),
            eventsub_subscription_count: 42,
            last_event_at: Some(1_699_999_900),
            now_secs: 1_700_000_500,
        };
        let json = serde_json::to_value(&diag).unwrap();
        // Spot-check a handful of camelCase keys; the frontend type asserts the rest.
        assert_eq!(json["tokenAuthenticated"], true);
        assert_eq!(json["tokenExpiresInSecs"], 3600);
        assert_eq!(json["eventsubConnected"], true);
        assert_eq!(json["eventsubSubscriptionCount"], 42);
        assert_eq!(json["rateLimit"]["tokensUsed"], 5);
        assert_eq!(json["rateLimit"]["cap"], 800);
        assert_eq!(json["nowSecs"], 1_700_000_500i64);
    }

    #[test]
    fn test_connection_result_serializes_camel_case() {
        let r = TwitchTestConnectionResult {
            ok: true,
            latency_ms: 123,
            error: None,
        };
        let json = serde_json::to_value(&r).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["latencyMs"], 123);
        assert!(json.get("error").map(|v| v.is_null()).unwrap_or(true));
    }

    #[test]
    fn is_safe_external_url_accepts_http_and_https() {
        assert!(is_safe_external_url("http://example.com/path"));
        assert!(is_safe_external_url("https://twitch.tv/shroud"));
        assert!(is_safe_external_url("HTTPS://EXAMPLE.COM"));
    }

    #[test]
    fn is_safe_external_url_accepts_mailto() {
        assert!(is_safe_external_url("mailto:user@example.com"));
        assert!(is_safe_external_url("MAILTO:user@example.com"));
    }

    #[test]
    fn is_safe_external_url_rejects_dangerous_schemes() {
        assert!(!is_safe_external_url("javascript:alert(1)"));
        assert!(!is_safe_external_url("data:text/html,<script>alert(1)</script>"));
        assert!(!is_safe_external_url("file:///C:/Windows/System32/cmd.exe"));
        assert!(!is_safe_external_url("vbscript:msgbox(1)"));
        assert!(!is_safe_external_url("ftp://example.com/"));
        assert!(!is_safe_external_url("steam://rungameid/1"));
        assert!(!is_safe_external_url(""));
    }
}
