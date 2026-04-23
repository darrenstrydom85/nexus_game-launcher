//! Twitch OAuth, token management (Story 19.1), Helix API and cache (Story 19.2).
//!
//! Auth/token state is owned by [`token_manager::TwitchTokenManager`]: it is the only
//! component that talks to `id.twitch.tv/oauth2/token` and writes to the SQLite settings
//! table. Background refresh runs in [`refresh_worker`].

pub mod api;
pub mod auth;
pub mod cache;
pub mod eventsub_worker;
pub mod refresh_worker;
pub mod token_manager;
pub mod tokens;
pub mod trending;
pub mod watch_history;
