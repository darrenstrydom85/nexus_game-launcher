use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

const HLTB_FINDER_URL: &str = "https://howlongtobeat.com/api/finder";
const HLTB_ORIGIN: &str = "https://howlongtobeat.com";
const HLTB_REFERER: &str = "https://howlongtobeat.com/";
const HLTB_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HltbGame {
    pub game_id: i64,
    pub game_name: String,
    pub comp_main: Option<i64>,
    pub comp_plus: Option<i64>,
    pub comp_100: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct HltbSearchResponse {
    data: Vec<HltbRawGame>,
}

#[derive(Debug, Deserialize)]
struct HltbRawGame {
    game_id: i64,
    game_name: String,
    #[serde(default)]
    comp_main: i64,
    #[serde(default)]
    comp_plus: i64,
    #[serde(default)]
    comp_100: i64,
}

#[derive(Debug, Deserialize)]
struct HltbInitResponse {
    token: String,
}

pub struct HltbClient {
    http: reqwest::Client,
    auth_token: Arc<Mutex<Option<String>>>,
}

impl HltbClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            auth_token: Arc::new(Mutex::new(None)),
        }
    }

    fn build_payload(name: &str) -> serde_json::Value {
        serde_json::json!({
            "searchType": "games",
            "searchTerms": name.split_whitespace().collect::<Vec<&str>>(),
            "searchPage": 1,
            "size": 20,
            "searchOptions": {
                "games": {
                    "platform": "",
                    "modifier": "",
                    "rangeTime": { "min": null, "max": null },
                    "gameplay": {
                        "perspective": "",
                        "flow": "",
                        "genre": "",
                        "difficulty": ""
                    }
                }
            },
            "useCache": true
        })
    }

    /// Fetches a fresh auth token from the HLTB init endpoint.
    async fn fetch_token(&self) -> Result<String, String> {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let url = format!("{HLTB_FINDER_URL}/init?t={ts}");
        let resp = self
            .http
            .get(&url)
            .header("User-Agent", HLTB_USER_AGENT)
            .header("Origin", HLTB_ORIGIN)
            .header("Referer", HLTB_REFERER)
            .send()
            .await
            .map_err(|e| format!("HLTB init request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(format!("HLTB init returned {status}"));
        }

        let init: HltbInitResponse = resp
            .json()
            .await
            .map_err(|e| format!("HLTB init parse error: {e}"))?;

        Ok(init.token)
    }

    /// Sends a search request to the HLTB finder API.
    /// On 403, automatically fetches a new auth token and retries once.
    async fn do_search(&self, name: &str) -> Result<HltbSearchResponse, String> {
        let payload = Self::build_payload(name);

        // First attempt — use cached token if available
        let token = self.auth_token.lock().await.clone();
        let resp = self.send_finder_request(&payload, token.as_deref()).await?;

        if resp.status() == reqwest::StatusCode::FORBIDDEN {
            // Token missing or expired — fetch a new one and retry
            let new_token = self.fetch_token().await?;
            *self.auth_token.lock().await = Some(new_token.clone());
            let retry_resp = self.send_finder_request(&payload, Some(&new_token)).await?;

            if !retry_resp.status().is_success() {
                let status = retry_resp.status();
                let body = retry_resp.text().await.unwrap_or_default();
                return Err(format!("HLTB returned {status} after token refresh: {body}"));
            }

            return retry_resp
                .json::<HltbSearchResponse>()
                .await
                .map_err(|e| format!("HLTB parse error: {e}"));
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("HLTB returned {status}: {body}"));
        }

        resp.json::<HltbSearchResponse>()
            .await
            .map_err(|e| format!("HLTB parse error: {e}"))
    }

    async fn send_finder_request(
        &self,
        payload: &serde_json::Value,
        token: Option<&str>,
    ) -> Result<reqwest::Response, String> {
        let mut req = self
            .http
            .post(HLTB_FINDER_URL)
            .header("User-Agent", HLTB_USER_AGENT)
            .header("Origin", HLTB_ORIGIN)
            .header("Referer", HLTB_REFERER)
            .header("Content-Type", "application/json");

        if let Some(t) = token {
            req = req.header("x-auth-token", t);
        }

        req.json(payload)
            .send()
            .await
            .map_err(|e| format!("HLTB request failed: {e}"))
    }

    /// Searches HLTB for a game by name and returns the best-matching result.
    /// Returns `None` if no results are found.
    /// Values of `0` from HLTB are treated as `NULL` (no data).
    pub async fn search(&self, name: &str) -> Result<Option<HltbGame>, String> {
        let search_resp = self.do_search(name).await?;

        if search_resp.data.is_empty() {
            return Ok(None);
        }

        let best = Self::best_match(&search_resp.data, name);

        Ok(best.map(|raw| HltbGame {
            game_id: raw.game_id,
            game_name: raw.game_name.clone(),
            comp_main: if raw.comp_main > 0 { Some(raw.comp_main) } else { None },
            comp_plus: if raw.comp_plus > 0 { Some(raw.comp_plus) } else { None },
            comp_100: if raw.comp_100 > 0 { Some(raw.comp_100) } else { None },
        }))
    }

    fn best_match<'a>(results: &'a [HltbRawGame], query: &str) -> Option<&'a HltbRawGame> {
        if results.is_empty() {
            return None;
        }

        let query_lower = query.to_lowercase();

        for g in results {
            if g.game_name.to_lowercase() == query_lower {
                return Some(g);
            }
        }

        let mut best: Option<(f64, &HltbRawGame)> = None;
        for g in results {
            let sim = strsim::jaro_winkler(&query_lower, &g.game_name.to_lowercase());
            match best {
                None => best = Some((sim, g)),
                Some((prev, _)) if sim > prev => best = Some((sim, g)),
                _ => {}
            }
        }

        best.map(|(_, g)| g)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_raw(id: i64, name: &str, main: i64, plus: i64, c100: i64) -> HltbRawGame {
        HltbRawGame {
            game_id: id,
            game_name: name.into(),
            comp_main: main,
            comp_plus: plus,
            comp_100: c100,
        }
    }

    #[test]
    fn best_match_exact_name() {
        let games = vec![
            make_raw(1, "DOOM Eternal", 36000, 72000, 144000),
            make_raw(2, "DOOM", 18000, 36000, 72000),
        ];
        let best = HltbClient::best_match(&games, "DOOM Eternal").unwrap();
        assert_eq!(best.game_id, 1);
    }

    #[test]
    fn best_match_case_insensitive() {
        let games = vec![
            make_raw(1, "Doom Eternal", 36000, 72000, 144000),
        ];
        let best = HltbClient::best_match(&games, "DOOM ETERNAL").unwrap();
        assert_eq!(best.game_id, 1);
    }

    #[test]
    fn best_match_empty_returns_none() {
        let games: Vec<HltbRawGame> = vec![];
        assert!(HltbClient::best_match(&games, "anything").is_none());
    }

    #[test]
    fn best_match_fuzzy_selects_closest() {
        let games = vec![
            make_raw(1, "Halo Infinite", 36000, 72000, 144000),
            make_raw(2, "Halo: Combat Evolved", 18000, 36000, 72000),
        ];
        let best = HltbClient::best_match(&games, "Halo Infinite").unwrap();
        assert_eq!(best.game_id, 1);
    }

    #[test]
    fn zero_values_treated_as_none() {
        let raw = make_raw(1, "Some Game", 0, 0, 0);
        let game = HltbGame {
            game_id: raw.game_id,
            game_name: raw.game_name.clone(),
            comp_main: if raw.comp_main > 0 { Some(raw.comp_main) } else { None },
            comp_plus: if raw.comp_plus > 0 { Some(raw.comp_plus) } else { None },
            comp_100: if raw.comp_100 > 0 { Some(raw.comp_100) } else { None },
        };
        assert!(game.comp_main.is_none());
        assert!(game.comp_plus.is_none());
        assert!(game.comp_100.is_none());
    }

    #[test]
    fn partial_times_preserved() {
        let raw = make_raw(1, "Short Game", 3600, 0, 0);
        let game = HltbGame {
            game_id: raw.game_id,
            game_name: raw.game_name.clone(),
            comp_main: if raw.comp_main > 0 { Some(raw.comp_main) } else { None },
            comp_plus: if raw.comp_plus > 0 { Some(raw.comp_plus) } else { None },
            comp_100: if raw.comp_100 > 0 { Some(raw.comp_100) } else { None },
        };
        assert_eq!(game.comp_main, Some(3600));
        assert!(game.comp_plus.is_none());
        assert!(game.comp_100.is_none());
    }

    #[test]
    fn hltb_game_struct_fields() {
        let game = HltbGame {
            game_id: 42,
            game_name: "Test Game".into(),
            comp_main: Some(36000),
            comp_plus: Some(72000),
            comp_100: Some(144000),
        };
        assert_eq!(game.game_id, 42);
        assert_eq!(game.game_name, "Test Game");
        assert_eq!(game.comp_main, Some(36000));
        assert_eq!(game.comp_plus, Some(72000));
        assert_eq!(game.comp_100, Some(144000));
    }

    #[test]
    fn search_payload_serializes_correctly() {
        let payload = HltbClient::build_payload("DOOM Eternal");
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"searchType\":\"games\""));
        assert!(json.contains("\"DOOM\""));
        assert!(json.contains("\"Eternal\""));
        assert!(json.contains("\"searchPage\":1"));
        assert!(json.contains("\"size\":20"));
        assert!(json.contains("\"useCache\":true"));
        assert!(json.contains("\"searchOptions\""));
    }
}
