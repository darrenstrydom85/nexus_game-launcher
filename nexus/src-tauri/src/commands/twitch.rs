//! Tauri commands for Twitch OAuth: twitch_auth_start, twitch_auth_status, twitch_auth_logout.

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

use super::error::CommandError;
use crate::db::DbState;
use crate::twitch::auth;
use crate::twitch::tokens;

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchAuthStatus {
    pub authenticated: bool,
    pub display_name: Option<String>,
    pub expires_at: Option<i64>,
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

/// Clear all Twitch tokens and user data; emit twitch-auth-changed (authenticated: false).
#[tauri::command]
pub fn twitch_auth_logout(app: AppHandle, db: State<'_, DbState>) -> Result<(), CommandError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
    tokens::clear_all(&conn)?;
    drop(conn);

    app.emit(
        "twitch-auth-changed",
        serde_json::json!({ "authenticated": false, "displayName": null }),
    )
    .map_err(|e| CommandError::Unknown(e.to_string()))?;

    Ok(())
}
