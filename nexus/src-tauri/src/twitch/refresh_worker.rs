//! Background task that proactively refreshes the Twitch access token before it expires.
//!
//! This eliminates on-demand refresh races: previously every Helix data call could trigger
//! its own refresh, and Twitch rotates refresh tokens on every successful use. With this
//! worker, the manager performs at most one scheduled refresh per validity window. Per-API
//! 401 recovery still goes through `TwitchTokenManager::force_refresh`, which uses the same
//! mutex as the worker, so they cannot collide.
//!
//! Lifecycle is owned by [`crate::twitch::token_manager::TwitchTokenManager`]:
//! it spawns the worker on `store_initial` (and on app startup if hydration finds tokens),
//! and cancels it on `logout` or auth-class refresh failure.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::sync::Notify;
use tokio::time::sleep;

use crate::commands::error::CommandError;
use crate::twitch::token_manager::{TwitchTokenManager, REFRESH_THRESHOLD_SECS};

/// Smallest sleep between iterations. Prevents a hot loop if the clock or expiry is nonsense.
const MIN_SLEEP_SECS: u64 = 30;
/// Sleep when there is nothing to refresh (e.g. between transient network failures or until
/// `wake` is notified). Bounded so that, even if `notify_waiters` is missed, the worker will
/// recover within at most this many seconds.
const IDLE_SLEEP_SECS: u64 = 5 * 60;

/// Worker entry point. Runs until its `JoinHandle` is aborted (called by `stop_worker`).
pub async fn run(mgr: TwitchTokenManager, wake: Arc<Notify>) {
    eprintln!("[twitch-refresh-worker] started");
    loop {
        let snap = mgr.snapshot().await;
        if !snap.is_authenticated() {
            // No tokens: idle until something wakes us (auth flow completes).
            tokio::select! {
                _ = sleep(Duration::from_secs(IDLE_SLEEP_SECS)) => {}
                _ = wake.notified() => {}
            }
            continue;
        }

        let now = now_secs();
        let sleep_secs = match snap.expires_at {
            Some(expires_at) => {
                // Refresh REFRESH_THRESHOLD_SECS before hard expiry, but never less than
                // MIN_SLEEP_SECS to avoid a busy-loop on a very-short or stale expiry.
                let target = expires_at - REFRESH_THRESHOLD_SECS;
                let delta = target - now;
                if delta < MIN_SLEEP_SECS as i64 {
                    MIN_SLEEP_SECS
                } else {
                    delta as u64
                }
            }
            // No expiry recorded: refresh immediately so we get a real `expires_at`.
            None => MIN_SLEEP_SECS,
        };

        tokio::select! {
            _ = sleep(Duration::from_secs(sleep_secs)) => {
                match mgr.force_refresh().await {
                    Ok(_) => {
                        // Loop and recompute next sleep from the new expiry.
                    }
                    Err(CommandError::Auth(msg)) => {
                        // Refresh token rejected (rotated/revoked). Manager has already
                        // cleared state and emitted unauthenticated; nothing left to do.
                        eprintln!("[twitch-refresh-worker] auth error, exiting: {msg}");
                        return;
                    }
                    Err(e) => {
                        // Transient error (network/5xx). Back off and retry.
                        eprintln!("[twitch-refresh-worker] transient refresh error: {e}");
                        tokio::select! {
                            _ = sleep(Duration::from_secs(60)) => {}
                            _ = wake.notified() => {}
                        }
                    }
                }
            }
            _ = wake.notified() => {
                // Token state changed (re-auth, manual validate, etc.). Re-evaluate.
            }
        }
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
