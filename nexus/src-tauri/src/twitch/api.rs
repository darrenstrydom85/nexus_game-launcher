//! Twitch Helix API client: followed channels, live streams, game resolution (Story 19.2).
//! Uses token-bucket rate limiting (800 req/min) and retries once on 429 after Ratelimit-Reset.

use serde::Deserialize;
use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::commands::error::CommandError;
use crate::twitch::cache::{CachedChannel, CachedStream};

const HELIX_BASE: &str = "https://api.twitch.tv/helix";
const RATE_LIMIT_CAP: u32 = 800;
const RATE_LIMIT_WINDOW_SECS: i64 = 60;

/// Simple global rate limiter: refill 800 tokens every 60s. Not exact but avoids burst over 800/min.
static RATE_LAST_RESET: AtomicI64 = AtomicI64::new(0);
static RATE_TOKENS_USED: AtomicU32 = AtomicU32::new(0);

fn rate_limit_wait_if_needed() {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let last = RATE_LAST_RESET.load(Ordering::Relaxed);
    if now - last >= RATE_LIMIT_WINDOW_SECS || last == 0 {
        RATE_LAST_RESET.store(now, Ordering::Relaxed);
        RATE_TOKENS_USED.store(0, Ordering::Relaxed);
    }
    let used = RATE_TOKENS_USED.fetch_add(1, Ordering::Relaxed);
    if used >= RATE_LIMIT_CAP {
        let reset_at = RATE_LAST_RESET.load(Ordering::Relaxed) + RATE_LIMIT_WINDOW_SECS;
        let wait_secs = (reset_at - now).max(0).min(RATE_LIMIT_WINDOW_SECS) as u64;
        if wait_secs > 0 {
            std::thread::sleep(Duration::from_secs(wait_secs));
        }
        RATE_LAST_RESET.store(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
            Ordering::Relaxed,
        );
        RATE_TOKENS_USED.store(0, Ordering::Relaxed);
    }
}

#[derive(Debug, Deserialize)]
struct HelixPagination {
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelixFollowedChannel {
    broadcaster_id: String,
    broadcaster_login: String,
    broadcaster_name: String,
    #[serde(default)]
    broadcaster_profile_image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelixChannelsFollowedResponse {
    data: Vec<HelixFollowedChannel>,
    pagination: Option<HelixPagination>,
}

#[derive(Debug, Deserialize)]
struct HelixStream {
    user_id: String,
    user_login: String,
    user_name: String,
    game_id: String,
    game_name: String,
    title: String,
    viewer_count: u64,
    started_at: String,
    thumbnail_url: String,
}

#[derive(Debug, Deserialize)]
struct HelixStreamsResponse {
    data: Vec<HelixStream>,
}

#[derive(Debug, Deserialize)]
struct HelixGame {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct HelixGamesResponse {
    data: Vec<HelixGame>,
}

fn map_reqwest(e: reqwest::Error) -> CommandError {
    if e.is_connect() || e.is_timeout() {
        CommandError::NetworkUnavailable(e.to_string())
    } else {
        CommandError::Unknown(e.to_string())
    }
}

/// Build a GET request to Helix with auth headers. Caller adds path and query.
/// `base` is the API base URL (e.g. HELIX_BASE or a wiremock server URI in tests).
async fn helix_get(
    base: &str,
    client: &reqwest::Client,
    path: &str,
    query: &[(&str, String)],
    client_id: &str,
    access_token: &str,
) -> Result<reqwest::Response, CommandError> {
    rate_limit_wait_if_needed();
    let base = base.trim_end_matches('/');
    let url = format!("{base}{path}");
    let mut req = client.get(&url).header("Client-ID", client_id).header(
        "Authorization",
        format!("Bearer {access_token}"),
    );
    for (k, v) in query {
        req = req.query(&[(k, v.as_str())]);
    }
    let res = req.send().await.map_err(map_reqwest)?;

    if res.status().as_u16() == 429 {
        let reset = res
            .headers()
            .get("Ratelimit-Reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok());
        if let Some(reset_ts) = reset {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            let wait_secs = (reset_ts - now).max(0).min(3600) as u64;
            if wait_secs > 0 {
                tokio::time::sleep(Duration::from_secs(wait_secs)).await;
            }
            RATE_LAST_RESET.store(reset_ts, Ordering::Relaxed);
            RATE_TOKENS_USED.store(0, Ordering::Relaxed);
        }
        rate_limit_wait_if_needed();
        let retry = client.get(&url).header("Client-ID", client_id).header(
            "Authorization",
            format!("Bearer {access_token}"),
        );
        let mut retry_req = retry;
        for (k, v) in query {
            retry_req = retry_req.query(&[(k, v.as_str())]);
        }
        return retry_req.send().await.map_err(map_reqwest);
    }

    if res.status().as_u16() == 401 {
        let body = res.text().await.unwrap_or_default();
        return Err(CommandError::Auth(
            serde_json::from_str::<serde_json::Value>(&body)
                                .ok()
                                .and_then(|j| j.get("message").and_then(|v| v.as_str()).map(String::from))
                                .unwrap_or_else(|| "Twitch token invalid or expired".to_string()),
        ));
    }

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(CommandError::Api(format!(
            "Twitch API error {}: {}",
            status,
            body.chars().take(200).collect::<String>()
        )));
    }

    Ok(res)
}

/// Paginated fetch of all channels the user follows. Uses GET /channels/followed (first=100).
pub async fn fetch_followed_channels(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    user_id: &str,
) -> Result<Vec<CachedChannel>, CommandError> {
    let mut all = Vec::new();
    let mut cursor: Option<String> = None;
    let cached_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    loop {
        let mut query: Vec<(&str, String)> = vec![
            ("user_id", user_id.to_string()),
            ("first", "100".to_string()),
        ];
        if let Some(ref c) = cursor {
            query.push(("after", c.clone()));
        }
        let res = helix_get(
            HELIX_BASE,
            client,
            "/channels/followed",
            &query,
            client_id,
            access_token,
        )
        .await?;
        let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
        let json: HelixChannelsFollowedResponse =
            serde_json::from_str(&body).map_err(|e| CommandError::Parse(format!("channels/followed: {e}")))?;

        for ch in json.data {
            all.push(CachedChannel {
                channel_id: ch.broadcaster_id,
                login: ch.broadcaster_login,
                display_name: ch.broadcaster_name,
                profile_image_url: ch
                    .broadcaster_profile_image_url
                    .unwrap_or_else(|| "".to_string()),
                is_favorite: false,
                cached_at,
            });
        }

        cursor = json
            .pagination
            .and_then(|p| p.cursor)
            .filter(|c| !c.is_empty());
        if cursor.is_none() {
            break;
        }
    }

    let user_ids: Vec<String> = all.iter().map(|c| c.channel_id.clone()).collect();
    if !user_ids.is_empty() {
        if let Ok(avatars) = fetch_user_avatars(client, client_id, access_token, &user_ids).await {
            for ch in &mut all {
                if let Some(url) = avatars.get(&ch.channel_id) {
                    ch.profile_image_url = url.clone();
                }
            }
        }
    }

    Ok(all)
}

/// Batch fetch live streams for up to 100 user IDs per request. If more than 100, batches automatically.
pub async fn fetch_live_streams(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    user_ids: &[String],
) -> Result<Vec<CachedStream>, CommandError> {
    let cached_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let mut all = Vec::new();

    for chunk in user_ids.chunks(100) {
        let query: Vec<(&str, String)> = chunk
            .iter()
            .map(|id| ("user_id", id.clone()))
            .collect();
        let res = helix_get(HELIX_BASE, client, "/streams", &query, client_id, access_token).await?;
        let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
        let json: HelixStreamsResponse =
            serde_json::from_str(&body).map_err(|e| CommandError::Parse(format!("streams: {e}")))?;

        for s in json.data {
            all.push(CachedStream {
                channel_id: s.user_id,
                title: s.title,
                game_name: s.game_name,
                game_id: s.game_id,
                viewer_count: s.viewer_count as i64,
                thumbnail_url: s.thumbnail_url,
                started_at: s.started_at,
                cached_at,
            });
        }
    }

    Ok(all)
}

/// Top game from GET /games/top (Story 19.9). Rank is 1-based position in response.
pub struct TopGame {
    pub id: String,
    pub name: String,
    pub rank: u32,
}

#[derive(Debug, Deserialize)]
struct HelixTopGame {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct HelixTopGamesResponse {
    data: Vec<HelixTopGame>,
    pagination: Option<HelixPagination>,
}

/// Fetch top 100 games on Twitch by current viewership. Returns (id, name, rank).
pub async fn fetch_top_games(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
) -> Result<Vec<TopGame>, CommandError> {
    let mut all = Vec::new();
    let mut cursor: Option<String> = None;
    let mut rank: u32 = 0;

    loop {
        let mut query: Vec<(&str, String)> = vec![("first", "100".to_string())];
        if let Some(ref c) = cursor {
            query.push(("after", c.clone()));
        }
        let res = helix_get(
            HELIX_BASE,
            client,
            "/games/top",
            &query,
            client_id,
            access_token,
        )
        .await?;
        let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
        let json: HelixTopGamesResponse =
            serde_json::from_str(&body).map_err(|e| CommandError::Parse(format!("games/top: {e}")))?;

        for g in json.data {
            rank += 1;
            all.push(TopGame {
                id: g.id,
                name: g.name,
                rank,
            });
        }

        cursor = json
            .pagination
            .and_then(|p| p.cursor)
            .filter(|c| !c.is_empty());
        if cursor.is_none() || all.len() >= 100 {
            break;
        }
    }

    Ok(all)
}

/// Fetch streams for a game and return (total viewer count, stream count). Used for trending viewership (Story 19.9).
pub async fn fetch_game_viewer_stream_counts(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    game_id: &str,
) -> Result<(i64, i64), CommandError> {
    let query = vec![
        ("game_id", game_id.to_string()),
        ("first", "100".to_string()),
    ];
    let res = helix_get(HELIX_BASE, client, "/streams", &query, client_id, access_token).await?;
    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
    let json: HelixStreamsResponse =
        serde_json::from_str(&body).map_err(|e| CommandError::Parse(format!("streams: {e}")))?;
    let total_viewers: i64 = json.data.iter().map(|s| s.viewer_count).sum::<u64>() as i64;
    let stream_count = json.data.len() as i64;
    Ok((total_viewers, stream_count))
}

/// Resolve a game/category name to (Twitch game ID, Twitch game name). Uses GET /games?name=.
/// Case-insensitive; returns first result if no exact match.
pub async fn fetch_twitch_game(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    name: &str,
) -> Result<Option<(String, String)>, CommandError> {
    let query = vec![("name", name.to_string())];
    let res = helix_get(HELIX_BASE, client, "/games", &query, client_id, access_token).await?;
    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
    let json: HelixGamesResponse =
        serde_json::from_str(&body).map_err(|e| CommandError::Parse(format!("games: {e}")))?;

    let game = json.data.into_iter().next();
    Ok(game.map(|g| (g.id, g.name)))
}

/// Stream with broadcaster identity for "streams by game" (Story 19.5).
pub struct StreamWithBroadcaster {
    pub user_id: String,
    pub user_login: String,
    pub user_name: String,
    pub profile_image_url: String,
    pub title: String,
    pub game_name: String,
    pub game_id: String,
    pub viewer_count: i64,
    pub thumbnail_url: String,
    pub started_at: String,
}

#[derive(Debug, Deserialize)]
struct HelixUser {
    id: String,
    profile_image_url: String,
}

#[derive(Debug, Deserialize)]
struct HelixUsersResponse {
    data: Vec<HelixUser>,
}

/// Batch fetch profile_image_url for up to 100 user IDs via GET /users.
async fn fetch_user_avatars(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    user_ids: &[String],
) -> Result<std::collections::HashMap<String, String>, CommandError> {
    let mut map = std::collections::HashMap::new();
    for chunk in user_ids.chunks(100) {
        let query: Vec<(&str, String)> = chunk.iter().map(|id| ("id", id.clone())).collect();
        let res = helix_get(HELIX_BASE, client, "/users", &query, client_id, access_token).await?;
        let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
        let json: HelixUsersResponse =
            serde_json::from_str(&body).map_err(|e| CommandError::Parse(format!("users: {e}")))?;
        for u in json.data {
            map.insert(u.id, u.profile_image_url);
        }
    }
    Ok(map)
}

/// Resolve game name to Twitch game ID then fetch top 10 streams for that game.
/// Enriches each stream with the broadcaster's profile_image_url via a batch /users call.
pub async fn fetch_streams_by_game(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    game_name: &str,
) -> Result<(Vec<StreamWithBroadcaster>, String), CommandError> {
    let (game_id, twitch_game_name) = fetch_twitch_game(client, client_id, access_token, game_name)
        .await?
        .ok_or_else(|| CommandError::NotFound(format!("No Twitch game/category for: {game_name}")))?;

    let query = vec![
        ("game_id", game_id.clone()),
        ("first", "10".to_string()),
    ];
    let res = helix_get(HELIX_BASE, client, "/streams", &query, client_id, access_token).await?;
    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
    let json: HelixStreamsResponse =
        serde_json::from_str(&body).map_err(|e| CommandError::Parse(format!("streams: {e}")))?;

    let user_ids: Vec<String> = json.data.iter().map(|s| s.user_id.clone()).collect();
    let avatars = if user_ids.is_empty() {
        std::collections::HashMap::new()
    } else {
        fetch_user_avatars(client, client_id, access_token, &user_ids)
            .await
            .unwrap_or_default()
    };

    let streams: Vec<StreamWithBroadcaster> = json
        .data
        .into_iter()
        .map(|s| {
            let avatar = avatars.get(&s.user_id).cloned().unwrap_or_default();
            StreamWithBroadcaster {
                user_id: s.user_id,
                user_login: s.user_login,
                user_name: s.user_name,
                profile_image_url: avatar,
                title: s.title,
                game_name: s.game_name,
                game_id: s.game_id,
                viewer_count: s.viewer_count as i64,
                thumbnail_url: s.thumbnail_url,
                started_at: s.started_at,
            }
        })
        .collect();
    Ok((streams, twitch_game_name))
}

// ---------------------------------------------------------------------------
// Story A2: Top clips per game.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct HelixClip {
    id: String,
    url: String,
    embed_url: String,
    broadcaster_id: String,
    broadcaster_name: String,
    creator_name: Option<String>,
    title: String,
    view_count: i64,
    duration: f64,
    thumbnail_url: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct HelixClipsResponse {
    data: Vec<HelixClip>,
    #[allow(dead_code)]
    pagination: Option<HelixPagination>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchClip {
    pub id: String,
    pub url: String,
    pub embed_url: String,
    pub broadcaster_id: String,
    pub broadcaster_name: String,
    pub creator_name: Option<String>,
    pub title: String,
    pub view_count: i64,
    pub duration_secs: f64,
    pub thumbnail_url: String,
    pub created_at: String,
}

/// Fetch top clips for a Twitch game id over the last `period_days` (Story A2).
/// `count` is capped at 100 by Twitch (`first` query param). The Helix endpoint accepts
/// RFC3339 timestamps in `started_at`; we always pass UTC.
pub async fn get_top_clips(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    game_id: &str,
    period_days: u32,
    count: u32,
) -> Result<Vec<TwitchClip>, CommandError> {
    get_top_clips_with_base(HELIX_BASE, client, client_id, access_token, game_id, period_days, count).await
}

/// Same as [`get_top_clips`] but allows overriding the base URL — used in tests with
/// `wiremock` and intentionally `pub(crate)` so production callers cannot accidentally
/// point at a non-Twitch host.
pub(crate) async fn get_top_clips_with_base(
    base: &str,
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    game_id: &str,
    period_days: u32,
    count: u32,
) -> Result<Vec<TwitchClip>, CommandError> {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let started_at_secs = now_secs - (period_days as i64) * 24 * 60 * 60;

    // Format as RFC3339 (UTC). We avoid pulling chrono just for this — clips' started_at
    // only needs second precision.
    let started_at = format_rfc3339_utc(started_at_secs);
    let first = count.min(100).to_string();

    let query = vec![
        ("game_id", game_id.to_string()),
        ("first", first),
        ("started_at", started_at),
    ];

    let res = helix_get(base, client, "/clips", &query, client_id, access_token).await?;
    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
    let json: HelixClipsResponse =
        serde_json::from_str(&body).map_err(|e| CommandError::Parse(format!("clips: {e}")))?;

    Ok(json
        .data
        .into_iter()
        .map(|c| TwitchClip {
            id: c.id,
            url: c.url,
            embed_url: c.embed_url,
            broadcaster_id: c.broadcaster_id,
            broadcaster_name: c.broadcaster_name,
            creator_name: c.creator_name,
            title: c.title,
            view_count: c.view_count,
            duration_secs: c.duration,
            thumbnail_url: c.thumbnail_url,
            created_at: c.created_at,
        })
        .collect())
}

/// Minimal RFC3339 UTC formatter ("YYYY-MM-DDThh:mm:ssZ"). Used by clip queries; correctness
/// matters but we don't need timezone names or fractional seconds.
fn format_rfc3339_utc(secs_since_epoch: i64) -> String {
    let secs = secs_since_epoch.max(0) as u64;
    let days_since_epoch = secs / 86_400;
    let mut secs_of_day = secs % 86_400;
    let hour = secs_of_day / 3600;
    secs_of_day %= 3600;
    let minute = secs_of_day / 60;
    let second = secs_of_day % 60;

    // Days -> Y/M/D using Howard Hinnant's algorithm (civil_from_days).
    let z: i64 = days_since_epoch as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, m, d, hour, minute, second)
}

/// Snapshot of rate-limit state for the diagnostics view (Story D1).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitSnapshot {
    pub tokens_used: u32,
    pub tokens_remaining: u32,
    pub window_reset_at: i64,
    pub window_secs: i64,
    pub cap: u32,
}

/// Read-only view of the global rate limiter.
pub fn rate_limit_snapshot() -> RateLimitSnapshot {
    let used = RATE_TOKENS_USED.load(Ordering::Relaxed);
    let last = RATE_LAST_RESET.load(Ordering::Relaxed);
    RateLimitSnapshot {
        tokens_used: used,
        tokens_remaining: RATE_LIMIT_CAP.saturating_sub(used),
        window_reset_at: if last == 0 { 0 } else { last + RATE_LIMIT_WINDOW_SECS },
        window_secs: RATE_LIMIT_WINDOW_SECS,
        cap: RATE_LIMIT_CAP,
    }
}

/// POST to a Helix endpoint with a JSON body. Used by the EventSub worker to create
/// WebSocket subscriptions. Goes through the same rate limiter as GETs since EventSub
/// subscription POSTs count against the user's Helix budget.
async fn helix_post_json(
    base: &str,
    client: &reqwest::Client,
    path: &str,
    body: &serde_json::Value,
    client_id: &str,
    access_token: &str,
) -> Result<reqwest::Response, CommandError> {
    rate_limit_wait_if_needed();
    let url = format!("{}{}", base.trim_end_matches('/'), path);
    let res = client
        .post(&url)
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(map_reqwest)?;

    if res.status().as_u16() == 401 {
        let body_txt = res.text().await.unwrap_or_default();
        return Err(CommandError::Auth(
            serde_json::from_str::<serde_json::Value>(&body_txt)
                .ok()
                .and_then(|j| j.get("message").and_then(|v| v.as_str()).map(String::from))
                .unwrap_or_else(|| "Twitch token invalid or expired".to_string()),
        ));
    }
    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body_txt = res.text().await.unwrap_or_default();
        return Err(CommandError::Api(format!(
            "Twitch API error {}: {}",
            status,
            body_txt.chars().take(200).collect::<String>()
        )));
    }
    Ok(res)
}

/// Create a single EventSub WebSocket subscription. Returns `Ok(())` on success
/// (HTTP 202). Conflicts (409) are tolerated and reported as `Ok(())` because they
/// just mean "already subscribed to this event for this session".
pub async fn create_eventsub_subscription(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    session_id: &str,
    sub_type: &str,
    broadcaster_id: &str,
) -> Result<(), CommandError> {
    let body = serde_json::json!({
        "type": sub_type,
        "version": "1",
        "condition": { "broadcaster_user_id": broadcaster_id },
        "transport": { "method": "websocket", "session_id": session_id },
    });
    match helix_post_json(
        HELIX_BASE,
        client,
        "/eventsub/subscriptions",
        &body,
        client_id,
        access_token,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(CommandError::Api(msg)) if msg.contains("409") => Ok(()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reset rate limit state so tests that depend on "starts at zero" are deterministic.
    fn reset_rate_limit_state() {
        RATE_LAST_RESET.store(0, Ordering::Relaxed);
        RATE_TOKENS_USED.store(0, Ordering::Relaxed);
    }

    #[test]
    fn rfc3339_format_known_dates() {
        assert_eq!(format_rfc3339_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_rfc3339_utc(1_700_000_000), "2023-11-14T22:13:20Z");
    }

    #[test]
    fn rate_limit_state_starts_zero() {
        reset_rate_limit_state();
        assert_eq!(RATE_TOKENS_USED.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn rate_limit_snapshot_reports_used_and_remaining() {
        reset_rate_limit_state();
        // Manually bump the counter without going through the wait path to keep this
        // test quick and deterministic.
        RATE_TOKENS_USED.store(7, Ordering::Relaxed);
        RATE_LAST_RESET.store(1_700_000_000, Ordering::Relaxed);
        let snap = rate_limit_snapshot();
        assert_eq!(snap.cap, RATE_LIMIT_CAP);
        assert_eq!(snap.tokens_used, 7);
        assert_eq!(snap.tokens_remaining, RATE_LIMIT_CAP - 7);
        assert_eq!(snap.window_secs, RATE_LIMIT_WINDOW_SECS);
        assert_eq!(snap.window_reset_at, 1_700_000_000 + RATE_LIMIT_WINDOW_SECS);
    }

    #[tokio::test]
    async fn get_top_clips_parses_helix_payload() {
        use wiremock::matchers::{method, path, query_param};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        reset_rate_limit_state();
        let server = MockServer::start().await;

        let body = serde_json::json!({
            "data": [
                {
                    "id": "AbcClip",
                    "url": "https://clips.twitch.tv/AbcClip",
                    "embed_url": "https://clips.twitch.tv/embed?clip=AbcClip",
                    "broadcaster_id": "111",
                    "broadcaster_name": "Shroud",
                    "creator_name": "Editor",
                    "title": "Insane play",
                    "view_count": 4242,
                    "duration": 24.5,
                    "thumbnail_url": "https://clips-media-assets2.twitch.tv/abc.jpg",
                    "created_at": "2024-01-01T00:00:00Z"
                }
            ],
            "pagination": {}
        });

        Mock::given(method("GET"))
            .and(path("/clips"))
            .and(query_param("game_id", "32982"))
            .and(query_param("first", "6"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let clips = get_top_clips_with_base(
            &server.uri(),
            &client,
            "client_id",
            "token",
            "32982",
            7,
            6,
        )
        .await
        .expect("should parse");

        assert_eq!(clips.len(), 1);
        let c = &clips[0];
        assert_eq!(c.id, "AbcClip");
        assert_eq!(c.broadcaster_name, "Shroud");
        assert_eq!(c.view_count, 4242);
        assert_eq!(c.duration_secs, 24.5);
        assert_eq!(c.embed_url, "https://clips.twitch.tv/embed?clip=AbcClip");
    }

    #[tokio::test]
    async fn create_eventsub_subscription_posts_correct_payload() {
        use wiremock::matchers::{body_partial_json, header, method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        reset_rate_limit_state();
        let server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/eventsub/subscriptions"))
            .and(header("Client-ID", "cid"))
            .and(header("Authorization", "Bearer token"))
            .and(body_partial_json(serde_json::json!({
                "type": "stream.online",
                "version": "1",
                "condition": {"broadcaster_user_id": "111"},
                "transport": {"method": "websocket", "session_id": "SESS"},
            })))
            .respond_with(ResponseTemplate::new(202).set_body_json(serde_json::json!({"data": []})))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let res = helix_post_json(
            &server.uri(),
            &client,
            "/eventsub/subscriptions",
            &serde_json::json!({
                "type": "stream.online",
                "version": "1",
                "condition": { "broadcaster_user_id": "111" },
                "transport": { "method": "websocket", "session_id": "SESS" },
            }),
            "cid",
            "token",
        )
        .await;

        assert!(res.is_ok(), "subscribe POST should succeed: {res:?}");
    }

    #[tokio::test]
    async fn rate_limit_429_triggers_retry_and_succeeds() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        let reset_ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let reset_str = reset_ts.to_string();
        Mock::given(method("GET"))
            .and(path("/channels/followed"))
            .respond_with(ResponseTemplate::new(429).insert_header("Ratelimit-Reset", reset_str.as_str()))
            .up_to_n_times(1)
            .mount(&server)
            .await;

        Mock::given(method("GET"))
            .and(path("/channels/followed"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "data": [], "pagination": {} })))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let base = server.uri();
        let res = helix_get(
            &base,
            &client,
            "/channels/followed",
            &[("user_id", "123".to_string()), ("first", "100".to_string())],
            "client_id",
            "token",
        )
        .await
        .expect("request should succeed after retry");

        assert_eq!(res.status().as_u16(), 200);
    }
}
