//! Single source of truth for the Twitch user's OAuth tokens.
//!
//! All token reads/writes go through this manager. The manager:
//!
//! * Caches tokens in memory so per-Helix-call reads do not hit SQLite.
//! * Serializes refresh through a `tokio::sync::Mutex<()>` so concurrent callers
//!   collapse onto one HTTP `POST /oauth2/token` per refresh window. (Twitch
//!   rotates the refresh token on every successful use; two parallel refreshes
//!   permanently kill it, which is the bug we are fixing.)
//! * Emits the same `twitch-auth-changed` event the rest of the app already
//!   listens for, from a single place.
//! * Owns the lifecycle of the [`crate::twitch::refresh_worker`] background task.
//!
//! Rest of the codebase should never call [`crate::twitch::auth::refresh_access_token`]
//! directly -- always go through [`TwitchTokenManager::get_valid_access_token`] or
//! [`TwitchTokenManager::force_refresh`].

use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::SystemTime;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, Notify};
use tokio::task::JoinHandle;

use crate::commands::error::CommandError;
use crate::db::DbState;
use crate::models::settings::keys;
use crate::twitch::auth::{self, TwitchUserInfo};
use crate::twitch::cache;
use crate::twitch::tokens;

/// Refresh tokens this many seconds before they hard-expire.
pub const REFRESH_THRESHOLD_SECS: i64 = 300;

/// In-memory snapshot of all Twitch identity/auth state.
#[derive(Debug, Default, Clone)]
pub struct TokenState {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub user_id: Option<String>,
    pub display_name: Option<String>,
    pub profile_image_url: Option<String>,
}

impl TokenState {
    pub fn is_authenticated(&self) -> bool {
        self.refresh_token.is_some() && self.user_id.is_some()
    }

    fn needs_refresh(&self, now_secs: i64) -> bool {
        self.refresh_token.is_some()
            && self.expires_at.map_or(true, |e| now_secs >= e - REFRESH_THRESHOLD_SECS)
    }
}

/// Internal state shared with the worker.
struct ManagerInner {
    /// In-memory token state.
    state: Mutex<TokenState>,
    /// Held for the entire duration of an actual `refresh_access_token` HTTP call so that
    /// concurrent callers serialize and collapse onto the resulting tokens.
    refresh_lock: Mutex<()>,
    /// Worker bookkeeping. Held briefly to start/stop the background task.
    worker: Mutex<WorkerSlot>,
    /// The Tauri client id (compile-time embedded).
    client_id: &'static str,
    /// AppHandle so we can resolve `DbState` and emit events from any context.
    app: AppHandle,
    /// Notified whenever tokens change so the worker can re-evaluate its sleep window.
    wake: Arc<Notify>,

    // ── Diagnostics observability (Story D1) ────────────────────────────────
    /// Unix timestamp of the last successful refresh, or 0 if none yet.
    last_refresh_at: AtomicI64,
    /// Last refresh error message, if any. Set from a sync context after refresh failure.
    last_refresh_error: StdMutex<Option<String>>,
    /// Bookkeeping for EventSub (populated by `eventsub_worker`).
    eventsub_connected: std::sync::atomic::AtomicBool,
    eventsub_subscription_count: AtomicU32,
    eventsub_session_id: StdMutex<Option<String>>,
    last_event_at: AtomicI64,
}

#[derive(Default)]
struct WorkerSlot {
    handle: Option<JoinHandle<()>>,
    eventsub_handle: Option<JoinHandle<()>>,
}

/// Public manager handle. Cheap to clone (`Arc` inside).
#[derive(Clone)]
pub struct TwitchTokenManager {
    inner: Arc<ManagerInner>,
}

impl TwitchTokenManager {
    /// Construct a manager. Does not perform IO; call [`hydrate_from_db`] afterwards.
    pub fn new(app: AppHandle, client_id: &'static str) -> Self {
        Self {
            inner: Arc::new(ManagerInner {
                state: Mutex::new(TokenState::default()),
                refresh_lock: Mutex::new(()),
                worker: Mutex::new(WorkerSlot::default()),
                client_id,
                app,
                wake: Arc::new(Notify::new()),
                last_refresh_at: AtomicI64::new(0),
                last_refresh_error: StdMutex::new(None),
                eventsub_connected: std::sync::atomic::AtomicBool::new(false),
                eventsub_subscription_count: AtomicU32::new(0),
                eventsub_session_id: StdMutex::new(None),
                last_event_at: AtomicI64::new(0),
            }),
        }
    }

    // ── Observability accessors (Story D1) ──────────────────────────────────

    pub fn last_refresh_at(&self) -> i64 {
        self.inner.last_refresh_at.load(Ordering::Relaxed)
    }
    pub fn last_refresh_error(&self) -> Option<String> {
        self.inner.last_refresh_error.lock().ok().and_then(|g| g.clone())
    }
    pub fn eventsub_connected(&self) -> bool {
        self.inner.eventsub_connected.load(Ordering::Relaxed)
    }
    pub fn eventsub_subscription_count(&self) -> u32 {
        self.inner.eventsub_subscription_count.load(Ordering::Relaxed)
    }
    pub fn eventsub_session_id(&self) -> Option<String> {
        self.inner.eventsub_session_id.lock().ok().and_then(|g| g.clone())
    }
    pub fn last_event_at(&self) -> i64 {
        self.inner.last_event_at.load(Ordering::Relaxed)
    }

    /// Set EventSub session/connected state from the worker. `session_id == None` means
    /// disconnected (and resets the subscription count).
    pub fn set_eventsub_state(
        &self,
        session_id: Option<String>,
        subscription_count: u32,
    ) {
        self.inner
            .eventsub_connected
            .store(session_id.is_some(), Ordering::Relaxed);
        self.inner
            .eventsub_subscription_count
            .store(if session_id.is_some() { subscription_count } else { 0 }, Ordering::Relaxed);
        if let Ok(mut g) = self.inner.eventsub_session_id.lock() {
            *g = session_id;
        }
    }

    /// Called from the EventSub worker on every notification frame so the diagnostics
    /// view can show "last event N seconds ago" liveness.
    pub fn note_event(&self) {
        self.inner
            .last_event_at
            .store(now_secs(), Ordering::Relaxed);
    }

    /// Notify channel used by the background refresh worker to wake up early when tokens change.
    pub fn wake_handle(&self) -> Arc<Notify> {
        self.inner.wake.clone()
    }

    /// Compile-time client id this manager was built with.
    pub fn client_id(&self) -> &'static str {
        self.inner.client_id
    }

    /// Snapshot in-memory state. No IO.
    pub async fn snapshot(&self) -> TokenState {
        self.inner.state.lock().await.clone()
    }

    /// Load stored tokens from SQLite into the in-memory cache. Call once at app startup.
    /// Tolerates missing fields (e.g. `profile_image_url` for users authenticated before
    /// the avatar field was added) by leaving them as `None`.
    pub async fn hydrate_from_db(&self) -> Result<(), CommandError> {
        let loaded = self.read_from_db()?;
        let mut guard = self.inner.state.lock().await;
        *guard = loaded;
        Ok(())
    }

    fn read_from_db(&self) -> Result<TokenState, CommandError> {
        let db = self
            .inner
            .app
            .try_state::<DbState>()
            .ok_or_else(|| CommandError::Database("DbState not registered".to_string()))?;
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        Ok(TokenState {
            access_token: tokens::load_access_token(&conn)?,
            refresh_token: tokens::load_refresh_token(&conn)?,
            expires_at: tokens::load_expires_at(&conn)?,
            user_id: tokens::load_user_id(&conn)?,
            display_name: tokens::load_display_name(&conn)?,
            profile_image_url: tokens::load_profile_image_url(&conn)?,
        })
    }

    /// Persist a freshly authenticated user (initial OAuth code-exchange result).
    pub async fn store_initial(
        &self,
        access_token: String,
        refresh_token: String,
        expires_at: i64,
        user: TwitchUserInfo,
    ) -> Result<(), CommandError> {
        {
            let db = self
                .inner
                .app
                .try_state::<DbState>()
                .ok_or_else(|| CommandError::Database("DbState not registered".to_string()))?;
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            tokens::store_tokens(
                &conn,
                &access_token,
                &refresh_token,
                expires_at,
                &user.id,
                &user.display_name,
                user.profile_image_url.as_deref(),
            )?;
        }

        let display_name = user.display_name.clone();
        let profile_image_url = user.profile_image_url.clone();
        {
            let mut guard = self.inner.state.lock().await;
            *guard = TokenState {
                access_token: Some(access_token),
                refresh_token: Some(refresh_token),
                expires_at: Some(expires_at),
                user_id: Some(user.id),
                display_name: Some(user.display_name),
                profile_image_url: user.profile_image_url,
            };
        }

        self.emit_authenticated(true, Some(display_name), profile_image_url);
        self.inner.wake.notify_waiters();
        Ok(())
    }

    /// Returns `(user_id, access_token)` for a non-expired token. If the in-memory token is
    /// within [`REFRESH_THRESHOLD_SECS`] of expiry, this acquires the refresh lock and
    /// performs (at most) one network refresh; concurrent callers all wait on the same lock
    /// and re-read the new tokens after.
    pub async fn get_valid_access_token(&self) -> Result<(String, String), CommandError> {
        let now = now_secs();

        {
            let snap = self.inner.state.lock().await.clone();
            ensure_authenticated(&snap)?;
            if !snap.needs_refresh(now) {
                if let (Some(uid), Some(tok)) = (snap.user_id, snap.access_token) {
                    return Ok((uid, tok));
                }
            }
        }

        self.refresh_locked(/*allow_skip_if_already_fresh=*/ true).await
    }

    /// Always attempt a refresh, even if the in-memory token still looks valid. Intended for
    /// 401-recovery from a Helix data call (which proves the token is actually invalid).
    /// Still serialized through the same mutex so multiple parallel 401s collapse into one
    /// network round-trip.
    pub async fn force_refresh(&self) -> Result<(String, String), CommandError> {
        self.refresh_locked(/*allow_skip_if_already_fresh=*/ false).await
    }

    async fn refresh_locked(
        &self,
        allow_skip_if_already_fresh: bool,
    ) -> Result<(String, String), CommandError> {
        // Block until any in-flight refresh completes. Then re-check inside the lock so
        // that the second caller benefits from the first caller's freshly-rotated tokens
        // instead of sending its own refresh with a now-stale refresh token.
        let _refresh_guard = self.inner.refresh_lock.lock().await;

        let now = now_secs();
        let snap = self.inner.state.lock().await.clone();
        ensure_authenticated(&snap)?;

        if allow_skip_if_already_fresh && !snap.needs_refresh(now) {
            if let (Some(uid), Some(tok)) = (snap.user_id.clone(), snap.access_token.clone()) {
                return Ok((uid, tok));
            }
        }

        let refresh_token = snap
            .refresh_token
            .clone()
            .ok_or_else(|| CommandError::Auth("No Twitch refresh token".to_string()))?;
        let user_id = snap
            .user_id
            .clone()
            .ok_or_else(|| CommandError::Auth("Not logged in to Twitch".to_string()))?;

        match auth::refresh_access_token(self.inner.client_id, &refresh_token).await {
            Ok((new_access, new_refresh, expires_in)) => {
                let new_expires_at = now_secs() + expires_in;
                self.persist_refresh(&new_access, &new_refresh, new_expires_at)?;

                {
                    let mut guard = self.inner.state.lock().await;
                    guard.access_token = Some(new_access.clone());
                    guard.refresh_token = Some(new_refresh);
                    guard.expires_at = Some(new_expires_at);
                }

                self.inner
                    .last_refresh_at
                    .store(now_secs(), Ordering::Relaxed);
                if let Ok(mut g) = self.inner.last_refresh_error.lock() {
                    *g = None;
                }

                let (display_name, profile_image_url) = {
                    let s = self.inner.state.lock().await;
                    (s.display_name.clone(), s.profile_image_url.clone())
                };
                self.emit_authenticated(true, display_name, profile_image_url);
                self.inner.wake.notify_waiters();
                Ok((user_id, new_access))
            }
            Err(e) => {
                if let Ok(mut g) = self.inner.last_refresh_error.lock() {
                    *g = Some(format!("{e}"));
                }
                // Auth-class errors mean the refresh token was rejected (rotated, revoked,
                // or expired). The user must re-authenticate. Clear both DB and memory.
                if matches!(e, CommandError::Auth(_)) {
                    let _ = self.clear_internal().await;
                    self.emit_authenticated(false, None, None);
                }
                Err(e)
            }
        }
    }

    /// Update `display_name` and `profile_image_url` from a `helix/users` lookup. Used by
    /// [`crate::commands::twitch::validate_twitch_token`] to backfill the avatar for users
    /// authenticated before the avatar field existed.
    pub async fn update_user_info(&self, user: TwitchUserInfo) -> Result<(), CommandError> {
        {
            let db = self
                .inner
                .app
                .try_state::<DbState>()
                .ok_or_else(|| CommandError::Database("DbState not registered".to_string()))?;
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            tokens::set_setting_raw(&conn, keys::TWITCH_DISPLAY_NAME, &user.display_name)?;
            if let Some(url) = user.profile_image_url.as_deref() {
                tokens::set_setting_raw(&conn, keys::TWITCH_PROFILE_IMAGE_URL, url)?;
            }
        }
        {
            let mut guard = self.inner.state.lock().await;
            guard.user_id = Some(user.id);
            guard.display_name = Some(user.display_name.clone());
            if user.profile_image_url.is_some() {
                guard.profile_image_url = user.profile_image_url.clone();
            }
        }
        self.emit_authenticated(
            true,
            Some(user.display_name),
            user.profile_image_url,
        );
        Ok(())
    }

    /// Update only the stored `expires_at` (used after a successful `oauth2/validate`).
    pub async fn update_expires_at(&self, expires_at: i64) -> Result<(), CommandError> {
        {
            let db = self
                .inner
                .app
                .try_state::<DbState>()
                .ok_or_else(|| CommandError::Database("DbState not registered".to_string()))?;
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            tokens::set_setting_raw(
                &conn,
                keys::TWITCH_TOKEN_EXPIRES_AT,
                &expires_at.to_string(),
            )?;
        }
        {
            let mut guard = self.inner.state.lock().await;
            guard.expires_at = Some(expires_at);
        }
        self.inner.wake.notify_waiters();
        Ok(())
    }

    /// Logout: clear DB tokens, clear cached Twitch data, drop in-memory state, cancel worker,
    /// and emit `twitch-auth-changed: false`.
    pub async fn logout(&self) -> Result<(), CommandError> {
        self.clear_internal().await?;
        {
            let db = self
                .inner
                .app
                .try_state::<DbState>()
                .ok_or_else(|| CommandError::Database("DbState not registered".to_string()))?;
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            cache::clear_twitch_cache(&conn)?;
        }
        self.emit_authenticated(false, None, None);
        Ok(())
    }

    async fn clear_internal(&self) -> Result<(), CommandError> {
        {
            let db = self
                .inner
                .app
                .try_state::<DbState>()
                .ok_or_else(|| CommandError::Database("DbState not registered".to_string()))?;
            let conn = db
                .conn
                .lock()
                .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            tokens::clear_all(&conn)?;
        }
        {
            let mut guard = self.inner.state.lock().await;
            *guard = TokenState::default();
        }
        self.stop_worker().await;
        Ok(())
    }

    fn persist_refresh(
        &self,
        access_token: &str,
        refresh_token: &str,
        expires_at: i64,
    ) -> Result<(), CommandError> {
        let db = self
            .inner
            .app
            .try_state::<DbState>()
            .ok_or_else(|| CommandError::Database("DbState not registered".to_string()))?;
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
        let enc_access = tokens::encrypt(access_token)?;
        let enc_refresh = tokens::encrypt(refresh_token)?;
        tokens::set_setting_raw(&conn, keys::TWITCH_ACCESS_TOKEN, &enc_access)?;
        tokens::set_setting_raw(&conn, keys::TWITCH_REFRESH_TOKEN, &enc_refresh)?;
        tokens::set_setting_raw(
            &conn,
            keys::TWITCH_TOKEN_EXPIRES_AT,
            &expires_at.to_string(),
        )?;
        Ok(())
    }

    fn emit_authenticated(
        &self,
        authenticated: bool,
        display_name: Option<String>,
        profile_image_url: Option<String>,
    ) {
        let _ = self.inner.app.emit(
            "twitch-auth-changed",
            json!({
                "authenticated": authenticated,
                "displayName": display_name,
                "profileImageUrl": profile_image_url,
            }),
        );
    }

    /// Spawn the background refresh worker (and EventSub worker) if not already
    /// running and we are authenticated.
    pub async fn ensure_worker_running(&self) {
        let snap = self.snapshot().await;
        if !snap.is_authenticated() {
            return;
        }
        let mut slot = self.inner.worker.lock().await;
        if !slot
            .handle
            .as_ref()
            .map_or(false, |h| !h.is_finished())
        {
            let mgr = self.clone();
            let wake = self.inner.wake.clone();
            slot.handle = Some(tokio::spawn(async move {
                crate::twitch::refresh_worker::run(mgr, wake).await;
            }));
        }
        if !slot
            .eventsub_handle
            .as_ref()
            .map_or(false, |h| !h.is_finished())
        {
            let mgr = self.clone();
            let app = self.inner.app.clone();
            let wake = self.inner.wake.clone();
            slot.eventsub_handle = Some(tokio::spawn(async move {
                crate::twitch::eventsub_worker::run(mgr, app, wake).await;
            }));
        }
    }

    /// Stop both background workers (no-op if not running).
    pub async fn stop_worker(&self) {
        let mut slot = self.inner.worker.lock().await;
        if let Some(handle) = slot.handle.take() {
            handle.abort();
        }
        if let Some(handle) = slot.eventsub_handle.take() {
            handle.abort();
        }
        self.inner
            .eventsub_connected
            .store(false, Ordering::Relaxed);
        self.inner
            .eventsub_subscription_count
            .store(0, Ordering::Relaxed);
        if let Ok(mut g) = self.inner.eventsub_session_id.lock() {
            *g = None;
        }
        // Wake any pending wait so the workers observe their abort cooperatively if they have
        // not yet been polled.
        self.inner.wake.notify_waiters();
    }
}

fn ensure_authenticated(snap: &TokenState) -> Result<(), CommandError> {
    if !snap.is_authenticated() {
        return Err(CommandError::Auth("Not logged in to Twitch".to_string()));
    }
    Ok(())
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_state_default_is_not_authenticated() {
        let s = TokenState::default();
        assert!(!s.is_authenticated());
    }

    #[test]
    fn token_state_authenticated_requires_refresh_token_and_user_id() {
        let mut s = TokenState::default();
        s.refresh_token = Some("r".into());
        assert!(!s.is_authenticated(), "user_id missing");
        s.user_id = Some("u".into());
        assert!(s.is_authenticated());
    }

    #[test]
    fn needs_refresh_when_within_threshold() {
        let mut s = TokenState::default();
        s.refresh_token = Some("r".into());
        let now = 1_700_000_000;
        s.expires_at = Some(now + REFRESH_THRESHOLD_SECS - 1);
        assert!(s.needs_refresh(now));
        s.expires_at = Some(now + REFRESH_THRESHOLD_SECS + 60);
        assert!(!s.needs_refresh(now));
    }

    #[test]
    fn needs_refresh_when_no_expiry_recorded() {
        let mut s = TokenState::default();
        s.refresh_token = Some("r".into());
        s.expires_at = None;
        assert!(s.needs_refresh(0));
    }

    #[test]
    fn needs_refresh_false_when_not_authenticated() {
        let s = TokenState::default();
        assert!(!s.needs_refresh(0));
    }

    /// Demonstrates that the manager's refresh-lock-then-recheck pattern collapses N
    /// concurrent callers into exactly one "real" refresh. We model the pattern with the
    /// same primitives the manager uses and count how many times the simulated network
    /// call runs. This is the core invariant that fixes the rotation-race bug.
    #[tokio::test]
    async fn parallel_callers_perform_exactly_one_refresh() {
        use std::sync::atomic::{AtomicUsize, Ordering as AOrd};
        use tokio::sync::Mutex as AsyncMutex;
        use tokio::time::{sleep, Duration};

        struct MiniManager {
            state: AsyncMutex<TokenState>,
            refresh_lock: AsyncMutex<()>,
        }

        // Counts simulated POSTs to oauth2/token. After all callers complete, must equal 1.
        let http_calls = Arc::new(AtomicUsize::new(0));

        let mgr = Arc::new(MiniManager {
            state: AsyncMutex::new(TokenState {
                access_token: Some("old".into()),
                refresh_token: Some("rt".into()),
                expires_at: Some(0), // expired -> needs refresh
                user_id: Some("u1".into()),
                ..Default::default()
            }),
            refresh_lock: AsyncMutex::new(()),
        });

        // Mimics get_valid_access_token: read snapshot, if needs_refresh take refresh_lock
        // and re-check before doing the simulated HTTP call.
        async fn caller(
            mgr: Arc<MiniManager>,
            http_calls: Arc<AtomicUsize>,
        ) -> String {
            let snap = mgr.state.lock().await.clone();
            if !snap.needs_refresh(now_secs()) {
                return snap.access_token.clone().unwrap();
            }
            let _g = mgr.refresh_lock.lock().await;
            let snap = mgr.state.lock().await.clone();
            if !snap.needs_refresh(now_secs()) {
                return snap.access_token.clone().unwrap();
            }
            // Simulate the HTTP round-trip and the persistence write that follows.
            http_calls.fetch_add(1, AOrd::SeqCst);
            sleep(Duration::from_millis(40)).await;
            let mut s = mgr.state.lock().await;
            s.access_token = Some("new".into());
            s.refresh_token = Some("rt-rotated".into());
            s.expires_at = Some(now_secs() + 3600);
            "new".into()
        }

        let mut handles = Vec::new();
        for _ in 0..10 {
            let mgr = mgr.clone();
            let http_calls = http_calls.clone();
            handles.push(tokio::spawn(async move { caller(mgr, http_calls).await }));
        }

        let results = futures_join_all(handles).await;
        for tok in &results {
            assert_eq!(tok, "new", "every caller should observe the rotated token");
        }
        assert_eq!(
            http_calls.load(AOrd::SeqCst),
            1,
            "exactly one HTTP refresh should occur when N callers race; multiple refreshes \
             would invalidate Twitch's rotated refresh token"
        );
    }

    /// Tiny join-all helper so the test does not pull in the `futures` crate.
    async fn futures_join_all<T>(handles: Vec<tokio::task::JoinHandle<T>>) -> Vec<T> {
        let mut out = Vec::with_capacity(handles.len());
        for h in handles {
            out.push(h.await.expect("task should not panic"));
        }
        out
    }
}
