use serde::{Deserialize, Serialize};

const BASE_URL: &str = "https://www.steamgriddb.com/api/v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamGridSearchResult {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamGridImage {
    pub id: i64,
    pub url: String,
    pub thumb: String,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub mime: String,
    #[serde(default)]
    pub score: i32,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub author: Option<SteamGridAuthor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamGridAuthor {
    pub name: Option<String>,
    pub steam64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiResponse<T> {
    pub success: bool,
    pub data: T,
}

#[derive(Debug, Clone)]
pub struct ArtworkSet {
    pub grid: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ArtworkType {
    Grid,
    Hero,
    Logo,
    Icon,
}

impl ArtworkType {
    fn endpoint(&self) -> &'static str {
        match self {
            Self::Grid => "grids",
            Self::Hero => "heroes",
            Self::Logo => "logos",
            Self::Icon => "icons",
        }
    }
}

pub struct SteamGridDbClient {
    api_key: String,
    http: reqwest::Client,
}

impl SteamGridDbClient {
    pub fn new(api_key: String) -> Self {
        let http = reqwest::Client::new();
        Self { api_key, http }
    }

    pub async fn verify_key(&self) -> Result<bool, String> {
        let url = format!("{BASE_URL}/search/autocomplete/test");
        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| format!("SteamGridDB request failed: {e}"))?;

        Ok(resp.status().is_success())
    }

    pub async fn search_game(&self, name: &str) -> Result<Vec<SteamGridSearchResult>, String> {
        let url = format!(
            "{BASE_URL}/search/autocomplete/{}",
            urlencoded(name)
        );

        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| format!("SteamGridDB search failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("SteamGridDB search returned {status}: {body}"));
        }

        let api_resp: ApiResponse<Vec<SteamGridSearchResult>> = resp
            .json()
            .await
            .map_err(|e| format!("SteamGridDB parse error: {e}"))?;

        Ok(api_resp.data)
    }

    pub fn best_match<'a>(
        results: &'a [SteamGridSearchResult],
        query: &str,
    ) -> Option<&'a SteamGridSearchResult> {
        if results.is_empty() {
            return None;
        }

        let query_lower = query.to_lowercase();

        for r in results {
            if r.name.to_lowercase() == query_lower {
                return Some(r);
            }
        }

        let mut best: Option<(f64, &SteamGridSearchResult)> = None;
        for r in results {
            let sim = strsim::jaro_winkler(&query_lower, &r.name.to_lowercase());
            match best {
                None => best = Some((sim, r)),
                Some((prev_sim, _)) if sim > prev_sim => best = Some((sim, r)),
                _ => {}
            }
        }

        best.map(|(_, r)| r)
    }

    pub async fn get_images(
        &self,
        steamgrid_id: i64,
        art_type: ArtworkType,
    ) -> Result<Vec<SteamGridImage>, String> {
        let endpoint = art_type.endpoint();
        let url = format!("{BASE_URL}/{endpoint}/game/{steamgrid_id}");

        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| format!("SteamGridDB {endpoint} fetch failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("SteamGridDB {endpoint} returned {status}: {body}"));
        }

        let api_resp: ApiResponse<Vec<SteamGridImage>> = resp
            .json()
            .await
            .map_err(|e| format!("SteamGridDB {endpoint} parse error: {e}"))?;

        Ok(api_resp.data)
    }

    pub async fn get_images_by_steam_appid(
        &self,
        steam_appid: &str,
        art_type: ArtworkType,
    ) -> Result<Vec<SteamGridImage>, String> {
        let endpoint = art_type.endpoint();
        let url = format!("{BASE_URL}/{endpoint}/steam/{steam_appid}");

        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| format!("SteamGridDB steam shortcut failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("SteamGridDB steam shortcut returned {status}: {body}"));
        }

        let api_resp: ApiResponse<Vec<SteamGridImage>> = resp
            .json()
            .await
            .map_err(|e| format!("SteamGridDB steam shortcut parse error: {e}"))?;

        Ok(api_resp.data)
    }

    pub fn select_best_image(images: &[SteamGridImage], art_type: ArtworkType) -> Option<&SteamGridImage> {
        if images.is_empty() {
            return None;
        }

        let (target_w, target_h) = match art_type {
            ArtworkType::Grid => (600, 900),
            ArtworkType::Hero => (1920, 620),
            ArtworkType::Logo => (0, 0),
            ArtworkType::Icon => (256, 256),
        };

        let mut scored: Vec<(i64, &SteamGridImage)> = images
            .iter()
            .map(|img| {
                let mut score: i64 = 0;

                if img.style == "official" {
                    score += 10000;
                }

                score += img.score as i64;

                if target_w > 0 && target_h > 0 && img.width == target_w && img.height == target_h {
                    score += 5000;
                }

                if art_type == ArtworkType::Logo && img.mime.contains("png") {
                    score += 3000;
                }

                (score, img)
            })
            .collect();

        scored.sort_by(|a, b| b.0.cmp(&a.0));
        scored.first().map(|(_, img)| *img)
    }

    pub async fn fetch_artwork_set(&self, steamgrid_id: i64) -> Result<ArtworkSet, String> {
        let types = [ArtworkType::Grid, ArtworkType::Hero, ArtworkType::Logo, ArtworkType::Icon];
        let mut set = ArtworkSet {
            grid: None,
            hero: None,
            logo: None,
            icon: None,
        };

        for art_type in &types {
            match self.get_images(steamgrid_id, *art_type).await {
                Ok(images) => {
                    if let Some(best) = Self::select_best_image(&images, *art_type) {
                        match art_type {
                            ArtworkType::Grid => set.grid = Some(best.url.clone()),
                            ArtworkType::Hero => set.hero = Some(best.url.clone()),
                            ArtworkType::Logo => set.logo = Some(best.url.clone()),
                            ArtworkType::Icon => set.icon = Some(best.url.clone()),
                        }
                    }
                }
                Err(e) => {
                    log::warn!("SteamGridDB: failed to fetch {:?} for {steamgrid_id}: {e}", art_type);
                }
            }
        }

        Ok(set)
    }
}

fn urlencoded(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push(char::from(HEX[(b >> 4) as usize]));
                out.push(char::from(HEX[(b & 0xf) as usize]));
            }
        }
    }
    out
}

const HEX: [u8; 16] = *b"0123456789ABCDEF";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn best_match_exact_name() {
        let results = vec![
            SteamGridSearchResult { id: 1, name: "The Witcher 3".into(), verified: false },
            SteamGridSearchResult { id: 2, name: "Witcher 3: Wild Hunt".into(), verified: true },
        ];
        let best = SteamGridDbClient::best_match(&results, "The Witcher 3").unwrap();
        assert_eq!(best.id, 1);
    }

    #[test]
    fn best_match_fuzzy() {
        let results = vec![
            SteamGridSearchResult { id: 1, name: "Halo Infinite".into(), verified: false },
            SteamGridSearchResult { id: 2, name: "Halo: Combat Evolved".into(), verified: false },
        ];
        let best = SteamGridDbClient::best_match(&results, "Halo Infinite").unwrap();
        assert_eq!(best.id, 1);
    }

    #[test]
    fn best_match_empty() {
        let results: Vec<SteamGridSearchResult> = vec![];
        assert!(SteamGridDbClient::best_match(&results, "anything").is_none());
    }

    #[test]
    fn best_match_case_insensitive() {
        let results = vec![
            SteamGridSearchResult { id: 1, name: "DOOM Eternal".into(), verified: false },
        ];
        let best = SteamGridDbClient::best_match(&results, "doom eternal").unwrap();
        assert_eq!(best.id, 1);
    }

    #[test]
    fn select_best_image_prefers_official() {
        let images = vec![
            SteamGridImage {
                id: 1, url: "http://a.com/1.jpg".into(), thumb: "".into(),
                width: 600, height: 900, style: "community".into(), mime: "image/jpeg".into(),
                score: 100, notes: None, author: None,
            },
            SteamGridImage {
                id: 2, url: "http://a.com/2.jpg".into(), thumb: "".into(),
                width: 600, height: 900, style: "official".into(), mime: "image/jpeg".into(),
                score: 50, notes: None, author: None,
            },
        ];
        let best = SteamGridDbClient::select_best_image(&images, ArtworkType::Grid).unwrap();
        assert_eq!(best.id, 2);
    }

    #[test]
    fn select_best_image_prefers_png_for_logo() {
        let images = vec![
            SteamGridImage {
                id: 1, url: "http://a.com/1.jpg".into(), thumb: "".into(),
                width: 400, height: 200, style: "".into(), mime: "image/jpeg".into(),
                score: 50, notes: None, author: None,
            },
            SteamGridImage {
                id: 2, url: "http://a.com/2.png".into(), thumb: "".into(),
                width: 400, height: 200, style: "".into(), mime: "image/png".into(),
                score: 40, notes: None, author: None,
            },
        ];
        let best = SteamGridDbClient::select_best_image(&images, ArtworkType::Logo).unwrap();
        assert_eq!(best.id, 2);
    }

    #[test]
    fn select_best_image_empty() {
        let images: Vec<SteamGridImage> = vec![];
        assert!(SteamGridDbClient::select_best_image(&images, ArtworkType::Grid).is_none());
    }

    #[test]
    fn urlencoded_basic() {
        assert_eq!(urlencoded("hello world"), "hello%20world");
        assert_eq!(urlencoded("The Witcher 3"), "The%20Witcher%203");
        assert_eq!(urlencoded("simple"), "simple");
    }
}
