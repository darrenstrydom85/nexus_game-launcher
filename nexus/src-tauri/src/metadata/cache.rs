use std::path::PathBuf;

fn cache_root() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|_| "APPDATA env var not set".to_string())?;
    Ok(PathBuf::from(app_data).join("nexus").join("cache").join("images"))
}

pub fn game_cache_dir(game_id: &str) -> Result<PathBuf, String> {
    Ok(cache_root()?.join(game_id))
}

pub fn screenshots_dir(game_id: &str) -> Result<PathBuf, String> {
    Ok(game_cache_dir(game_id)?.join("screenshots"))
}

pub fn ensure_cache_dir(game_id: &str) -> Result<PathBuf, String> {
    let dir = game_cache_dir(game_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("failed to create cache dir: {e}"))?;
    Ok(dir)
}

pub fn ensure_screenshots_dir(game_id: &str) -> Result<PathBuf, String> {
    let dir = screenshots_dir(game_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("failed to create screenshots dir: {e}"))?;
    Ok(dir)
}

fn extension_from_url(url: &str) -> &str {
    if url.contains(".png") || url.ends_with("png") {
        "png"
    } else {
        "jpg"
    }
}

pub fn cover_filename(url: &str) -> String {
    format!("cover.{}", extension_from_url(url))
}

pub fn hero_filename(url: &str) -> String {
    format!("hero.{}", extension_from_url(url))
}

pub fn logo_filename(_url: &str) -> String {
    "logo.png".to_string()
}

pub fn icon_filename(url: &str) -> String {
    format!("icon.{}", extension_from_url(url))
}

pub fn screenshot_filename(index: usize, url: &str) -> String {
    format!("{:02}.{}", index + 1, extension_from_url(url))
}

pub async fn download_image(
    http: &reqwest::Client,
    url: &str,
    dest: &std::path::Path,
) -> Result<(), String> {
    let resp = http
        .get(url)
        .send()
        .await
        .map_err(|e| format!("image download failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("image download returned {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("image read failed: {e}"))?;

    std::fs::write(dest, &bytes).map_err(|e| format!("image write failed: {e}"))?;

    Ok(())
}

pub fn cache_file_exists(path: &std::path::Path) -> bool {
    path.exists() && path.is_file()
}

pub fn cached_path_or_url(local_path: &std::path::Path, remote_url: &str) -> String {
    if cache_file_exists(local_path) {
        local_path.to_string_lossy().to_string()
    } else {
        remote_url.to_string()
    }
}

pub fn calculate_cache_size(game_id: &str) -> Result<u64, String> {
    let dir = game_cache_dir(game_id)?;
    if !dir.exists() {
        return Ok(0);
    }
    dir_size(&dir)
}

pub fn calculate_total_cache_size() -> Result<u64, String> {
    let root = cache_root()?;
    if !root.exists() {
        return Ok(0);
    }
    dir_size(&root)
}

pub fn clear_all_cache_files() -> Result<(), String> {
    let root = cache_root()?;
    if !root.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&root).map_err(|e| format!("failed to remove cache dir: {e}"))?;
    std::fs::create_dir_all(&root).map_err(|e| format!("failed to recreate cache dir: {e}"))?;
    Ok(())
}

fn dir_size(path: &std::path::Path) -> Result<u64, String> {
    let mut total: u64 = 0;
    let entries =
        std::fs::read_dir(path).map_err(|e| format!("failed to read cache dir: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("dir entry error: {e}"))?;
        let meta = entry
            .metadata()
            .map_err(|e| format!("metadata error: {e}"))?;

        if meta.is_file() {
            total += meta.len();
        } else if meta.is_dir() {
            total += dir_size(&entry.path())?;
        }
    }

    Ok(total)
}

#[derive(Debug, Clone)]
pub struct CachedArtwork {
    pub cover_path: Option<String>,
    pub hero_path: Option<String>,
    pub logo_path: Option<String>,
    pub icon_path: Option<String>,
    pub screenshot_paths: Vec<String>,
}

pub async fn download_and_cache_artwork(
    http: &reqwest::Client,
    game_id: &str,
    cover_url: Option<&str>,
    hero_url: Option<&str>,
    logo_url: Option<&str>,
    icon_url: Option<&str>,
    screenshot_urls: &[String],
) -> Result<CachedArtwork, String> {
    let cache_dir = ensure_cache_dir(game_id)?;
    let mut result = CachedArtwork {
        cover_path: None,
        hero_path: None,
        logo_path: None,
        icon_path: None,
        screenshot_paths: Vec::new(),
    };

    if let Some(url) = cover_url {
        let filename = cover_filename(url);
        let dest = cache_dir.join(&filename);
        if !cache_file_exists(&dest) {
            if let Err(e) = download_image(http, url, &dest).await {
                log::warn!("Failed to cache cover for {game_id}: {e}");
            }
        }
        if cache_file_exists(&dest) {
            result.cover_path = Some(dest.to_string_lossy().to_string());
        }
    }

    if let Some(url) = hero_url {
        let filename = hero_filename(url);
        let dest = cache_dir.join(&filename);
        if !cache_file_exists(&dest) {
            if let Err(e) = download_image(http, url, &dest).await {
                log::warn!("Failed to cache hero for {game_id}: {e}");
            }
        }
        if cache_file_exists(&dest) {
            result.hero_path = Some(dest.to_string_lossy().to_string());
        }
    }

    if let Some(url) = logo_url {
        let filename = logo_filename(url);
        let dest = cache_dir.join(&filename);
        if !cache_file_exists(&dest) {
            if let Err(e) = download_image(http, url, &dest).await {
                log::warn!("Failed to cache logo for {game_id}: {e}");
            }
        }
        if cache_file_exists(&dest) {
            result.logo_path = Some(dest.to_string_lossy().to_string());
        }
    }

    if let Some(url) = icon_url {
        let filename = icon_filename(url);
        let dest = cache_dir.join(&filename);
        if !cache_file_exists(&dest) {
            if let Err(e) = download_image(http, url, &dest).await {
                log::warn!("Failed to cache icon for {game_id}: {e}");
            }
        }
        if cache_file_exists(&dest) {
            result.icon_path = Some(dest.to_string_lossy().to_string());
        }
    }

    if !screenshot_urls.is_empty() {
        let ss_dir = ensure_screenshots_dir(game_id)?;
        for (i, url) in screenshot_urls.iter().enumerate() {
            let filename = screenshot_filename(i, url);
            let dest = ss_dir.join(&filename);
            if !cache_file_exists(&dest) {
                if let Err(e) = download_image(http, url, &dest).await {
                    log::warn!("Failed to cache screenshot {i} for {game_id}: {e}");
                    continue;
                }
            }
            if cache_file_exists(&dest) {
                result.screenshot_paths.push(dest.to_string_lossy().to_string());
            }
        }
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cover_filename_jpg() {
        assert_eq!(cover_filename("https://example.com/img.jpg"), "cover.jpg");
    }

    #[test]
    fn cover_filename_png() {
        assert_eq!(cover_filename("https://example.com/img.png"), "cover.png");
    }

    #[test]
    fn hero_filename_default() {
        assert_eq!(hero_filename("https://example.com/hero"), "hero.jpg");
    }

    #[test]
    fn logo_filename_always_png() {
        assert_eq!(logo_filename("https://example.com/logo.jpg"), "logo.png");
    }

    #[test]
    fn screenshot_filename_indexed() {
        assert_eq!(screenshot_filename(0, "http://x.com/a.jpg"), "01.jpg");
        assert_eq!(screenshot_filename(9, "http://x.com/a.png"), "10.png");
    }

    #[test]
    fn cache_file_exists_false_for_missing() {
        assert!(!cache_file_exists(std::path::Path::new("/nonexistent/file.jpg")));
    }

    #[test]
    fn cached_path_or_url_returns_url_when_no_file() {
        let result = cached_path_or_url(
            std::path::Path::new("/nonexistent/cover.jpg"),
            "https://example.com/cover.jpg",
        );
        assert_eq!(result, "https://example.com/cover.jpg");
    }

    #[test]
    fn calculate_cache_size_returns_zero_for_nonexistent() {
        // Use a game_id that definitely won't exist
        if std::env::var("APPDATA").is_ok() {
            let size = calculate_cache_size("nonexistent_game_id_test_12345").unwrap();
            assert_eq!(size, 0);
        }
    }
}
