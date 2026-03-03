use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};

const IGDB_BASE: &str = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const MAX_CONCURRENT: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgdbGame {
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub first_release_date: Option<i64>,
    #[serde(default)]
    pub genres: Option<Vec<IgdbGenre>>,
    #[serde(default)]
    pub involved_companies: Option<Vec<IgdbInvolvedCompany>>,
    #[serde(default)]
    pub screenshots: Option<Vec<IgdbImage>>,
    #[serde(default)]
    pub videos: Option<Vec<IgdbVideo>>,
    #[serde(default)]
    pub cover: Option<IgdbCover>,
    #[serde(default)]
    pub aggregated_rating: Option<f64>,
    #[serde(default)]
    pub aggregated_rating_count: Option<i64>,
    #[serde(default)]
    pub rating: Option<f64>,
    #[serde(default)]
    pub rating_count: Option<i64>,
    #[serde(default)]
    pub total_rating: Option<f64>,
    #[serde(default)]
    pub total_rating_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgdbGenre {
    pub id: i64,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgdbInvolvedCompany {
    pub id: i64,
    #[serde(default)]
    pub developer: bool,
    #[serde(default)]
    pub publisher: bool,
    #[serde(default)]
    pub company: Option<IgdbCompany>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgdbCompany {
    pub id: i64,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgdbImage {
    pub id: i64,
    #[serde(default)]
    pub image_id: String,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgdbCover {
    pub id: i64,
    #[serde(default)]
    pub image_id: String,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgdbVideo {
    pub id: i64,
    #[serde(default)]
    pub video_id: String,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TwitchTokenResponse {
    access_token: String,
    expires_in: i64,
    token_type: String,
}

#[derive(Debug, Clone)]
pub struct GameMetadata {
    pub igdb_id: i64,
    pub description: Option<String>,
    pub release_date: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub genres: Option<String>,
    pub screenshot_urls: Vec<String>,
    pub trailer_url: Option<String>,
    pub cover_url: Option<String>,
    pub critic_score: Option<f64>,
    pub critic_score_count: Option<i64>,
    pub community_score: Option<f64>,
    pub community_score_count: Option<i64>,
}

struct TokenState {
    access_token: String,
    expires_at: i64,
}

pub struct IgdbClient {
    client_id: String,
    client_secret: String,
    http: reqwest::Client,
    token: Arc<Mutex<Option<TokenState>>>,
    semaphore: Arc<Semaphore>,
    rate_limiter: Arc<Mutex<Vec<std::time::Instant>>>,
}

impl IgdbClient {
    pub fn new(client_id: String, client_secret: String) -> Self {
        Self {
            client_id,
            client_secret,
            http: reqwest::Client::new(),
            token: Arc::new(Mutex::new(None)),
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT)),
            rate_limiter: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn with_cached_token(
        client_id: String,
        client_secret: String,
        access_token: String,
        expires_at: i64,
    ) -> Self {
        let client = Self::new(client_id, client_secret);
        let token_state = TokenState {
            access_token,
            expires_at,
        };
        let token = client.token.clone();
        // Synchronously set the token since we're constructing
        // This is safe because nothing else holds the lock yet
        if let Ok(mut guard) = token.try_lock() {
            *guard = Some(token_state);
        }
        client
    }

    async fn authenticate(&self) -> Result<(String, i64), String> {
        let resp = self
            .http
            .post(TWITCH_TOKEN_URL)
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("grant_type", "client_credentials"),
            ])
            .send()
            .await
            .map_err(|e| format!("Twitch OAuth request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Twitch OAuth returned {status}: {body}"));
        }

        let token_resp: TwitchTokenResponse = resp
            .json()
            .await
            .map_err(|e| format!("Twitch OAuth parse error: {e}"))?;

        let now = current_epoch_secs();
        let expires_at = now + token_resp.expires_in - 300; // 5 min buffer

        Ok((token_resp.access_token, expires_at))
    }

    async fn get_valid_token(&self) -> Result<String, String> {
        let mut guard = self.token.lock().await;

        if let Some(ref state) = *guard {
            let now = current_epoch_secs();
            if now < state.expires_at {
                return Ok(state.access_token.clone());
            }
        }

        let (access_token, expires_at) = self.authenticate().await?;
        *guard = Some(TokenState {
            access_token: access_token.clone(),
            expires_at,
        });

        Ok(access_token)
    }

    pub fn get_cached_token_info(&self) -> Option<(String, i64)> {
        if let Ok(guard) = self.token.try_lock() {
            guard
                .as_ref()
                .map(|s| (s.access_token.clone(), s.expires_at))
        } else {
            None
        }
    }

    async fn rate_limit(&self) {
        const MAX_PER_SEC: usize = 4;
        let mut timestamps = self.rate_limiter.lock().await;
        let now = std::time::Instant::now();
        let one_sec_ago = now - std::time::Duration::from_secs(1);

        timestamps.retain(|t| *t > one_sec_ago);

        if timestamps.len() >= MAX_PER_SEC {
            if let Some(oldest) = timestamps.first() {
                let wait = *oldest + std::time::Duration::from_secs(1) - now;
                drop(timestamps);
                tokio::time::sleep(wait).await;
                let mut timestamps = self.rate_limiter.lock().await;
                timestamps.push(std::time::Instant::now());
                return;
            }
        }

        timestamps.push(now);
    }

    pub async fn igdb_post_pub(&self, endpoint: &str, body: &str) -> Result<String, String> {
        self.igdb_post(endpoint, body).await
    }

    async fn igdb_post(&self, endpoint: &str, body: &str) -> Result<String, String> {
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| format!("semaphore error: {e}"))?;

        self.rate_limit().await;

        let token = self.get_valid_token().await?;
        let url = format!("{IGDB_BASE}/{endpoint}");

        let resp = self
            .http
            .post(&url)
            .header("Client-ID", &self.client_id)
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "text/plain")
            .body(body.to_string())
            .send()
            .await
            .map_err(|e| format!("IGDB request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("IGDB {endpoint} returned {status}: {body}"));
        }

        resp.text()
            .await
            .map_err(|e| format!("IGDB response read error: {e}"))
    }

    pub async fn verify_keys(&self) -> Result<bool, String> {
        let _token = self.get_valid_token().await?;
        Ok(true)
    }

    const GAME_FIELDS: &str = "name,summary,first_release_date,\
             genres.name,involved_companies.developer,involved_companies.publisher,\
             involved_companies.company.name,screenshots.image_id,screenshots.url,\
             videos.video_id,videos.name,cover.image_id,cover.url,\
             aggregated_rating,aggregated_rating_count,rating,rating_count,\
             total_rating,total_rating_count";

    pub async fn search_game(&self, name: &str) -> Result<Vec<IgdbGame>, String> {
        let escaped = name.replace('"', "\\\"");
        let query = format!(
            "search \"{escaped}\"; fields {}; limit 10;",
            Self::GAME_FIELDS
        );

        let body = self.igdb_post("games", &query).await?;
        let games: Vec<IgdbGame> =
            serde_json::from_str(&body).map_err(|e| format!("IGDB parse error: {e}"))?;

        Ok(games)
    }

    /// Fetch a single game by IGDB id. Returns None if not found.
    pub async fn get_game_by_id(&self, id: i64) -> Result<Option<IgdbGame>, String> {
        let query = format!(
            "where id = {id}; fields {}; limit 1;",
            Self::GAME_FIELDS
        );

        let body = self.igdb_post("games", &query).await?;
        let games: Vec<IgdbGame> =
            serde_json::from_str(&body).map_err(|e| format!("IGDB parse error: {e}"))?;

        Ok(games.into_iter().next())
    }

    pub fn best_match<'a>(results: &'a [IgdbGame], query: &str) -> Option<&'a IgdbGame> {
        if results.is_empty() {
            return None;
        }

        let query_lower = query.to_lowercase();

        for g in results {
            if g.name.to_lowercase() == query_lower {
                return Some(g);
            }
        }

        let mut best: Option<(f64, &IgdbGame)> = None;
        for g in results {
            let sim = strsim::jaro_winkler(&query_lower, &g.name.to_lowercase());
            match best {
                None => best = Some((sim, g)),
                Some((prev, _)) if sim > prev => best = Some((sim, g)),
                _ => {}
            }
        }

        best.map(|(_, g)| g)
    }

    pub fn extract_metadata(game: &IgdbGame) -> GameMetadata {
        let developer = game
            .involved_companies
            .as_ref()
            .and_then(|companies| {
                companies
                    .iter()
                    .find(|c| c.developer)
                    .and_then(|c| c.company.as_ref())
                    .map(|c| c.name.clone())
            });

        let publisher = game
            .involved_companies
            .as_ref()
            .and_then(|companies| {
                companies
                    .iter()
                    .find(|c| c.publisher)
                    .and_then(|c| c.company.as_ref())
                    .map(|c| c.name.clone())
            });

        let genres = game.genres.as_ref().map(|g| {
            g.iter()
                .map(|genre| genre.name.clone())
                .collect::<Vec<_>>()
                .join(",")
        });

        let release_date = game.first_release_date.map(|ts| epoch_to_date(ts));

        let screenshot_urls: Vec<String> = game
            .screenshots
            .as_ref()
            .map(|ss| {
                ss.iter()
                    .map(|s| igdb_image_url(&s.image_id, "screenshot_big"))
                    .collect()
            })
            .unwrap_or_default();

        let trailer_url = game
            .videos
            .as_ref()
            .and_then(|vids| vids.first())
            .map(|v| format!("https://www.youtube.com/watch?v={}", v.video_id));

        let cover_url = game
            .cover
            .as_ref()
            .map(|c| igdb_image_url(&c.image_id, "cover_big"));

        GameMetadata {
            igdb_id: game.id,
            description: game.summary.clone(),
            release_date,
            developer,
            publisher,
            genres,
            screenshot_urls,
            trailer_url,
            cover_url,
            critic_score: game.aggregated_rating,
            critic_score_count: game.aggregated_rating_count,
            community_score: game.rating,
            community_score_count: game.rating_count,
        }
    }
}

fn igdb_image_url(image_id: &str, size: &str) -> String {
    format!("https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg")
}

fn epoch_to_date(epoch_secs: i64) -> String {
    let secs_per_day: i64 = 86400;
    let days = epoch_secs / secs_per_day;

    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02}")
}

fn current_epoch_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_to_date_known_values() {
        assert_eq!(epoch_to_date(0), "1970-01-01");
        assert_eq!(epoch_to_date(1767225600), "2026-01-01");
    }

    #[test]
    fn igdb_image_url_format() {
        let url = igdb_image_url("abc123", "cover_big");
        assert_eq!(url, "https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg");
    }

    fn make_igdb_game(id: i64, name: &str) -> IgdbGame {
        IgdbGame {
            id,
            name: name.into(),
            summary: None,
            first_release_date: None,
            genres: None,
            involved_companies: None,
            screenshots: None,
            videos: None,
            cover: None,
            aggregated_rating: None,
            aggregated_rating_count: None,
            rating: None,
            rating_count: None,
            total_rating: None,
            total_rating_count: None,
        }
    }

    #[test]
    fn best_match_exact() {
        let games = vec![
            make_igdb_game(1, "Halo Infinite"),
            make_igdb_game(2, "Halo: Combat Evolved"),
        ];
        let best = IgdbClient::best_match(&games, "Halo Infinite").unwrap();
        assert_eq!(best.id, 1);
    }

    #[test]
    fn best_match_empty() {
        let games: Vec<IgdbGame> = vec![];
        assert!(IgdbClient::best_match(&games, "anything").is_none());
    }

    #[test]
    fn extract_metadata_basic() {
        let game = IgdbGame {
            id: 42,
            name: "Test Game".into(),
            summary: Some("A great game".into()),
            first_release_date: Some(1767225600),
            genres: Some(vec![
                IgdbGenre { id: 1, name: "RPG".into() },
                IgdbGenre { id: 2, name: "Action".into() },
            ]),
            involved_companies: Some(vec![
                IgdbInvolvedCompany {
                    id: 1, developer: true, publisher: false,
                    company: Some(IgdbCompany { id: 10, name: "DevCo".into() }),
                },
                IgdbInvolvedCompany {
                    id: 2, developer: false, publisher: true,
                    company: Some(IgdbCompany { id: 20, name: "PubCo".into() }),
                },
            ]),
            screenshots: Some(vec![
                IgdbImage { id: 1, image_id: "ss1".into(), url: None },
            ]),
            videos: Some(vec![
                IgdbVideo { id: 1, video_id: "dQw4w9WgXcQ".into(), name: Some("Trailer".into()) },
            ]),
            cover: Some(IgdbCover { id: 1, image_id: "co1234".into(), url: None }),
            aggregated_rating: Some(87.5),
            aggregated_rating_count: Some(42),
            rating: Some(74.2),
            rating_count: Some(1500),
            total_rating: Some(80.1),
            total_rating_count: Some(1542),
        };

        let meta = IgdbClient::extract_metadata(&game);
        assert_eq!(meta.igdb_id, 42);
        assert_eq!(meta.description, Some("A great game".into()));
        assert_eq!(meta.release_date, Some("2026-01-01".into()));
        assert_eq!(meta.developer, Some("DevCo".into()));
        assert_eq!(meta.publisher, Some("PubCo".into()));
        assert_eq!(meta.genres, Some("RPG,Action".into()));
        assert_eq!(meta.screenshot_urls.len(), 1);
        assert!(meta.screenshot_urls[0].contains("ss1"));
        assert_eq!(meta.trailer_url, Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ".into()));
        assert!(meta.cover_url.unwrap().contains("co1234"));
        assert_eq!(meta.critic_score, Some(87.5));
        assert_eq!(meta.critic_score_count, Some(42));
        assert_eq!(meta.community_score, Some(74.2));
        assert_eq!(meta.community_score_count, Some(1500));
    }

    #[test]
    fn extract_metadata_missing_fields() {
        let game = make_igdb_game(1, "Minimal");
        let meta = IgdbClient::extract_metadata(&game);
        assert_eq!(meta.igdb_id, 1);
        assert!(meta.description.is_none());
        assert!(meta.developer.is_none());
        assert!(meta.publisher.is_none());
        assert!(meta.genres.is_none());
        assert!(meta.screenshot_urls.is_empty());
        assert!(meta.trailer_url.is_none());
        assert!(meta.cover_url.is_none());
        assert!(meta.critic_score.is_none());
        assert!(meta.community_score.is_none());
    }

    #[test]
    fn extract_metadata_critic_only() {
        let mut game = make_igdb_game(5, "Critic Only Game");
        game.aggregated_rating = Some(91.0);
        game.aggregated_rating_count = Some(10);
        let meta = IgdbClient::extract_metadata(&game);
        assert_eq!(meta.critic_score, Some(91.0));
        assert_eq!(meta.critic_score_count, Some(10));
        assert!(meta.community_score.is_none());
        assert!(meta.community_score_count.is_none());
    }

    #[test]
    fn extract_metadata_community_only() {
        let mut game = make_igdb_game(6, "Community Only Game");
        game.rating = Some(65.3);
        game.rating_count = Some(500);
        let meta = IgdbClient::extract_metadata(&game);
        assert!(meta.critic_score.is_none());
        assert_eq!(meta.community_score, Some(65.3));
        assert_eq!(meta.community_score_count, Some(500));
    }
}
