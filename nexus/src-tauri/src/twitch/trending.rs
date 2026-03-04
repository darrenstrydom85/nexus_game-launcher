//! Trending-in-library logic (Story 19.9): top Twitch games cross-referenced with user's library.

use crate::commands::error::CommandError;
use crate::twitch::api::{self, TopGame};
use crate::twitch::cache::CachedTrendingEntry;
use std::collections::HashMap;

const MAX_TRENDING_DISPLAY: usize = 10;

/// Match top Twitch games to library (case-insensitive name), sort by rank, take up to 10.
/// Returns entries with viewer/stream counts set to 0; caller should call enrich_trending_with_viewer_counts.
pub fn match_trending_library(
    top_games: &[TopGame],
    library: &[(String, String)], // (id, name)
) -> Vec<CachedTrendingEntry> {
    let lib_by_name: HashMap<String, (String, String)> = library
        .iter()
        .map(|(id, name)| (name.to_lowercase().trim().to_string(), (id.clone(), name.clone())))
        .collect();

    let mut matched: Vec<(String, String, String, String, u32)> = Vec::new(); // nexus_id, nexus_name, twitch_name, twitch_id, rank
    for top in top_games {
        let key = top.name.to_lowercase().trim().to_string();
        if let Some((nexus_id, nexus_name)) = lib_by_name.get(&key) {
            matched.push((
                nexus_id.clone(),
                nexus_name.clone(),
                top.name.clone(),
                top.id.clone(),
                top.rank,
            ));
        }
    }
    matched.sort_by_key(|(_, _, _, _, rank)| *rank);
    let take = matched.len().min(MAX_TRENDING_DISPLAY);
    let matched = &matched[..take];

    let mut out = Vec::with_capacity(matched.len());
    for (nexus_id, nexus_name, twitch_name, twitch_id, rank) in matched {
        out.push(CachedTrendingEntry {
            game_id: nexus_id.clone(),
            game_name: nexus_name.clone(),
            twitch_game_name: twitch_name.clone(),
            twitch_game_id: twitch_id.clone(),
            twitch_viewer_count: 0,
            twitch_stream_count: 0,
            twitch_rank: *rank as i64,
            cached_at: 0,
        });
    }
    out
}

/// Enrich trending entries with viewer and stream counts from the API. Modifies entries in place.
pub async fn enrich_trending_with_viewer_counts(
    client: &reqwest::Client,
    client_id: &str,
    access_token: &str,
    entries: &mut [CachedTrendingEntry],
) -> Result<(), CommandError> {
    for entry in entries.iter_mut() {
        if entry.twitch_game_id.is_empty() {
            continue;
        }
        match api::fetch_game_viewer_stream_counts(
            client,
            client_id,
            access_token,
            &entry.twitch_game_id,
        )
        .await
        {
            Ok((viewers, streams)) => {
                entry.twitch_viewer_count = viewers;
                entry.twitch_stream_count = streams;
            }
            Err(_) => { /* leave 0,0 */ }
        }
    }
    Ok(())
}

/// Load library game id and name from DB (non-removed games).
pub fn load_library_games(conn: &rusqlite::Connection) -> Result<Vec<(String, String)>, CommandError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name FROM games WHERE (status IS NULL OR status != 'removed') ORDER BY name",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| CommandError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| CommandError::Database(e.to_string()))
}
