//! EventSub WebSocket worker (Story C3).
//!
//! Replaces the followed-streams polling loop with a push-based connection to
//! `wss://eventsub.wss.twitch.tv/ws`. The follow-stream poll in `twitchStore` is
//! kept as a fallback (a slower interval) because:
//!
//! * The WS has a hard cap of 300 subscriptions per session — power-followers
//!   beyond that limit miss events; the poll still catches them (slowly).
//! * If the WS reconnects, there is a small window where notifications can be
//!   dropped; the next poll converges the UI back to truth.
//!
//! State machine:
//!   1. Connect to the WS endpoint.
//!   2. Wait for `session_welcome` → record `session.id`.
//!   3. POST one `stream.online` + one `stream.offline` subscription per followed
//!      broadcaster (capped at `MAX_SUBSCRIPTIONS`), with a small concurrency cap
//!      so we do not burst Helix.
//!   4. Process `session_keepalive`, `notification`, `session_reconnect`,
//!      `revocation` frames forever.
//!   5. On `notification` → emit `twitch-stream-online`/`twitch-stream-offline`
//!      Tauri events; the frontend `twitchStore` re-fetches followed streams.
//!   6. Reconnect with exponential backoff on close. Resubscribe on each new
//!      session id (welcome or reconnect URL).
//!
//! Lifetime is owned by [`crate::twitch::token_manager::TwitchTokenManager`].

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;
use tokio::time::sleep;
use tokio_tungstenite::tungstenite::protocol::Message;

use crate::commands::error::CommandError;
use crate::db::DbState;
use crate::twitch::api;
use crate::twitch::cache;
use crate::twitch::token_manager::TwitchTokenManager;

const DEFAULT_WS_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
/// Twitch caps WebSocket subscriptions at 300 per session for user tokens. We cap
/// our subscribe set just under that since each broadcaster needs two
/// (`stream.online` + `stream.offline`).
const MAX_SUBSCRIPTIONS: usize = 145;
/// Initial reconnect backoff after a transport-level close.
const BACKOFF_START_SECS: u64 = 2;
const BACKOFF_MAX_SECS: u64 = 60;

/// Worker entry point. Runs until its `JoinHandle` is aborted.
pub async fn run(mgr: TwitchTokenManager, app: AppHandle, wake: Arc<Notify>) {
    eprintln!("[twitch-eventsub-worker] started");
    let mut backoff = BACKOFF_START_SECS;

    loop {
        let snap = mgr.snapshot().await;
        if !snap.is_authenticated() {
            // Idle until auth completes (or worker is aborted).
            tokio::select! {
                _ = sleep(Duration::from_secs(60)) => {}
                _ = wake.notified() => {}
            }
            continue;
        }

        match connect_and_run(&mgr, &app, &wake, DEFAULT_WS_URL).await {
            Ok(_) => {
                // Normal close (e.g. reconnect signal returned from inner loop).
                backoff = BACKOFF_START_SECS;
            }
            Err(e) => {
                eprintln!("[twitch-eventsub-worker] session ended: {e}");
                mgr.set_eventsub_state(None, 0);
                let _ = app.emit(
                    "twitch-eventsub-status",
                    json!({ "connected": false, "error": format!("{e}") }),
                );
                tokio::select! {
                    _ = sleep(Duration::from_secs(backoff)) => {}
                    _ = wake.notified() => {}
                }
                backoff = (backoff * 2).min(BACKOFF_MAX_SECS);
            }
        }
    }
}

/// Connect to one WebSocket session. Returns `Ok(())` on a clean close (the
/// outer loop will reconnect with reset backoff) or `Err` on a real failure.
async fn connect_and_run(
    mgr: &TwitchTokenManager,
    app: &AppHandle,
    wake: &Arc<Notify>,
    url: &str,
) -> Result<(), CommandError> {
    let (mut ws, _resp) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|e| CommandError::Api(format!("eventsub connect: {e}")))?;
    eprintln!("[twitch-eventsub-worker] connected to {url}");

    let mut session_id: Option<String> = None;

    loop {
        tokio::select! {
            // Wake from the manager (e.g. followed-list refreshed). Reload subs
            // by closing this session — the outer loop reconnects fresh.
            _ = wake.notified() => {
                eprintln!("[twitch-eventsub-worker] wake -> reconnecting to refresh subs");
                let _ = ws.close(None).await;
                return Ok(());
            }

            msg = ws.next() => {
                let msg = match msg {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => {
                        return Err(CommandError::Api(format!("eventsub ws error: {e}")));
                    }
                    None => return Err(CommandError::Api("eventsub ws closed".into())),
                };

                match msg {
                    Message::Text(txt) => {
                        if let Some(reconnect_url) = handle_frame(
                            mgr,
                            app,
                            &mut session_id,
                            &txt,
                        ).await? {
                            eprintln!("[twitch-eventsub-worker] reconnecting to {reconnect_url}");
                            let _ = ws.close(None).await;
                            // Re-enter via outer loop with the provided URL.
                            return Box::pin(connect_and_run(mgr, app, wake, &reconnect_url)).await;
                        }
                    }
                    Message::Ping(p) => {
                        let _ = ws.send(Message::Pong(p)).await;
                    }
                    Message::Close(_) => {
                        return Err(CommandError::Api("eventsub server sent close".into()));
                    }
                    _ => {}
                }
            }
        }
    }
}

/// Returns `Ok(Some(reconnect_url))` if the frame was a `session_reconnect`,
/// `Ok(None)` otherwise. Errors propagate to the outer reconnect loop.
async fn handle_frame(
    mgr: &TwitchTokenManager,
    app: &AppHandle,
    session_id: &mut Option<String>,
    txt: &str,
) -> Result<Option<String>, CommandError> {
    let frame: EventSubFrame = match serde_json::from_str(txt) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("[twitch-eventsub-worker] unparseable frame: {e}; raw={}", short(txt));
            return Ok(None);
        }
    };

    match frame.metadata.message_type.as_str() {
        "session_welcome" => {
            let session = frame.payload.session.ok_or_else(|| {
                CommandError::Api("session_welcome missing session payload".into())
            })?;
            let id = session.id.clone();
            *session_id = Some(id.clone());

            // Subscribe to followed channels for this session. Run subscription
            // in the background so a slow Helix call cannot stall keepalive
            // processing on the WS read side.
            let mgr_c = mgr.clone();
            let app_c = app.clone();
            let id_c = id.clone();
            tokio::spawn(async move {
                match subscribe_followed(&mgr_c, &app_c, &id_c).await {
                    Ok(count) => {
                        mgr_c.set_eventsub_state(Some(id_c.clone()), count);
                        let _ = app_c.emit(
                            "twitch-eventsub-status",
                            json!({
                                "connected": true,
                                "sessionId": id_c,
                                "subscriptionCount": count,
                            }),
                        );
                    }
                    Err(e) => {
                        eprintln!("[twitch-eventsub-worker] subscribe failed: {e}");
                        mgr_c.set_eventsub_state(Some(id_c.clone()), 0);
                    }
                }
            });
            Ok(None)
        }
        "session_keepalive" => Ok(None),
        "session_reconnect" => {
            let session = frame.payload.session.ok_or_else(|| {
                CommandError::Api("session_reconnect missing session payload".into())
            })?;
            let url = session
                .reconnect_url
                .ok_or_else(|| CommandError::Api("session_reconnect missing reconnect_url".into()))?;
            Ok(Some(url))
        }
        "notification" => {
            mgr.note_event();
            if let (Some(sub), Some(event)) = (frame.payload.subscription, frame.payload.event) {
                let event_name = match sub.r#type.as_str() {
                    "stream.online" => "twitch-stream-online",
                    "stream.offline" => "twitch-stream-offline",
                    _ => "twitch-eventsub-notification",
                };
                let _ = app.emit(
                    event_name,
                    json!({
                        "broadcasterUserId": event.get("broadcaster_user_id"),
                        "broadcasterUserLogin": event.get("broadcaster_user_login"),
                        "broadcasterUserName": event.get("broadcaster_user_name"),
                        "subscriptionType": sub.r#type,
                        "raw": event,
                    }),
                );
            }
            Ok(None)
        }
        "revocation" => {
            // A subscription was revoked (token loss, banned channel, etc).
            // Decrement the visible count by one if we know one was lost.
            let current = mgr.eventsub_subscription_count();
            mgr.set_eventsub_state(session_id.clone(), current.saturating_sub(1));
            Ok(None)
        }
        other => {
            eprintln!("[twitch-eventsub-worker] unknown message_type: {other}");
            Ok(None)
        }
    }
}

/// Read followed channels from the cache and POST one subscription per (channel, type)
/// pair. Returns the number of subscriptions created (each broadcaster contributes 2).
async fn subscribe_followed(
    mgr: &TwitchTokenManager,
    app: &AppHandle,
    session_id: &str,
) -> Result<u32, CommandError> {
    let (_user_id, access_token) = mgr.get_valid_access_token().await?;

    let channels = {
        let db = app
            .try_state::<DbState>()
            .ok_or_else(|| CommandError::Database("DbState not registered".into()))?;
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        cache::get_cached_followed_channels(&conn)?
    };

    if channels.is_empty() {
        return Ok(0);
    }

    let mut targets: Vec<String> = channels.into_iter().map(|c| c.channel_id).collect();
    targets.truncate(MAX_SUBSCRIPTIONS);
    let total = targets.len();

    let client = reqwest::Client::new();
    let client_id = mgr.client_id();
    let session_id_owned = session_id.to_string();
    let mut created: u32 = 0;

    // Bounded concurrency: 8 in-flight subscribes is a good middle ground —
    // fast enough on the happy path but well below Helix burst limits.
    use futures_util::stream::{self, StreamExt as _};
    let results = stream::iter(targets.into_iter())
        .map(|broadcaster_id| {
            let client = client.clone();
            let access = access_token.clone();
            let session_id = session_id_owned.clone();
            async move {
                let online = api::create_eventsub_subscription(
                    &client, client_id, &access, &session_id, "stream.online", &broadcaster_id,
                )
                .await;
                let offline = api::create_eventsub_subscription(
                    &client, client_id, &access, &session_id, "stream.offline", &broadcaster_id,
                )
                .await;
                (online, offline)
            }
        })
        .buffer_unordered(8)
        .collect::<Vec<_>>()
        .await;

    for (online, offline) in results {
        if online.is_ok() {
            created += 1;
        }
        if offline.is_ok() {
            created += 1;
        }
    }

    eprintln!(
        "[twitch-eventsub-worker] subscribed to {} broadcasters ({} subs)",
        total, created,
    );
    Ok(created)
}

// ── Wire types ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct EventSubFrame {
    metadata: FrameMetadata,
    #[serde(default)]
    payload: FramePayload,
}

#[derive(Debug, Deserialize)]
struct FrameMetadata {
    message_type: String,
}

#[derive(Debug, Default, Deserialize)]
struct FramePayload {
    #[serde(default)]
    session: Option<SessionInfo>,
    #[serde(default)]
    subscription: Option<SubscriptionInfo>,
    #[serde(default)]
    event: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct SessionInfo {
    id: String,
    #[serde(default)]
    reconnect_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SubscriptionInfo {
    r#type: String,
}

fn short(s: &str) -> String {
    s.chars().take(160).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_welcome_frame() {
        let body = r#"{
            "metadata": {
                "message_id": "abc",
                "message_type": "session_welcome",
                "message_timestamp": "2024-01-01T00:00:00Z"
            },
            "payload": {
                "session": {
                    "id": "SESS",
                    "status": "connected",
                    "keepalive_timeout_seconds": 10,
                    "reconnect_url": null,
                    "connected_at": "2024-01-01T00:00:00Z"
                }
            }
        }"#;
        let f: EventSubFrame = serde_json::from_str(body).unwrap();
        assert_eq!(f.metadata.message_type, "session_welcome");
        assert_eq!(f.payload.session.unwrap().id, "SESS");
    }

    #[test]
    fn parses_notification_frame_with_event() {
        let body = r#"{
            "metadata": {
                "message_id": "n1",
                "message_type": "notification",
                "message_timestamp": "2024-01-01T00:00:00Z",
                "subscription_type": "stream.online",
                "subscription_version": "1"
            },
            "payload": {
                "subscription": {
                    "id": "sub1",
                    "type": "stream.online",
                    "version": "1",
                    "status": "enabled",
                    "cost": 0,
                    "condition": {"broadcaster_user_id": "111"},
                    "transport": {"method": "websocket", "session_id": "S"},
                    "created_at": "2024-01-01T00:00:00Z"
                },
                "event": {
                    "id": "evt",
                    "broadcaster_user_id": "111",
                    "broadcaster_user_login": "shroud",
                    "broadcaster_user_name": "Shroud",
                    "type": "live",
                    "started_at": "2024-01-01T00:00:00Z"
                }
            }
        }"#;
        let f: EventSubFrame = serde_json::from_str(body).unwrap();
        assert_eq!(f.metadata.message_type, "notification");
        assert_eq!(f.payload.subscription.unwrap().r#type, "stream.online");
        let ev = f.payload.event.unwrap();
        assert_eq!(ev.get("broadcaster_user_login").and_then(|v| v.as_str()), Some("shroud"));
    }

    #[test]
    fn parses_reconnect_frame() {
        let body = r#"{
            "metadata": {"message_id": "r1", "message_type": "session_reconnect", "message_timestamp": "2024-01-01T00:00:00Z"},
            "payload": {"session": {"id": "S", "status": "reconnecting", "keepalive_timeout_seconds": null, "reconnect_url": "wss://eventsub.wss.twitch.tv/ws?reconnect=true", "connected_at": "2024-01-01T00:00:00Z"}}
        }"#;
        let f: EventSubFrame = serde_json::from_str(body).unwrap();
        let s = f.payload.session.unwrap();
        assert_eq!(s.reconnect_url.as_deref(), Some("wss://eventsub.wss.twitch.tv/ws?reconnect=true"));
    }
}
