//! SQLite cache layer for Twitch followed channels, live streams, and game mappings (Story 19.2).

use rusqlite::{params, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::commands::error::CommandError;

/// One row from `twitch_followed_channels`. Does not include live status; merge with stream cache in command layer.
#[derive(Debug, Clone)]
pub struct CachedChannel {
    pub channel_id: String,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: String,
    pub is_favorite: bool,
    pub cached_at: i64,
}

/// One row from `twitch_stream_cache`.
#[derive(Debug, Clone)]
pub struct CachedStream {
    pub channel_id: String,
    pub title: String,
    pub game_name: String,
    pub game_id: String,
    pub viewer_count: i64,
    pub thumbnail_url: String,
    pub started_at: String,
    pub cached_at: i64,
}

/// Game name -> Twitch category mapping from `twitch_game_cache`.
#[derive(Debug, Clone)]
pub struct CachedGameMapping {
    pub game_name: String,
    pub twitch_game_id: String,
    pub twitch_game_name: String,
    pub cached_at: i64,
}

/// One row from `twitch_trending_library_cache` (Story 19.9).
#[derive(Debug, Clone)]
pub struct CachedTrendingEntry {
    pub game_id: String,
    pub game_name: String,
    pub twitch_game_name: String,
    pub twitch_game_id: String,
    pub twitch_viewer_count: i64,
    pub twitch_stream_count: i64,
    pub twitch_rank: i64,
    pub cached_at: i64,
}

const GAME_CACHE_TTL_SECS: i64 = 24 * 3600; // 24 hours
const TRENDING_CACHE_TTL_SECS: i64 = 15 * 60; // 15 minutes (Story 19.9)

fn now_epoch_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Upsert followed channels into `twitch_followed_channels`. Preserves existing is_favorite.
pub fn cache_followed_channels(
    conn: &rusqlite::Connection,
    channels: &[CachedChannel],
) -> Result<(), CommandError> {
    let cached_at = now_epoch_secs();
    let mut stmt = conn
        .prepare(
            "INSERT INTO twitch_followed_channels (channel_id, login, display_name, profile_image_url, is_favorite, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(channel_id) DO UPDATE SET
               login = excluded.login,
               display_name = excluded.display_name,
               profile_image_url = excluded.profile_image_url,
               is_favorite = twitch_followed_channels.is_favorite,
               cached_at = excluded.cached_at",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    for c in channels {
        stmt.execute(params![
            c.channel_id,
            c.login,
            c.display_name,
            c.profile_image_url,
            if c.is_favorite { 1i32 } else { 0i32 },
            cached_at,
        ])
        .map_err(|e| CommandError::Database(e.to_string()))?;
    }
    Ok(())
}

/// Read all followed channels from cache.
pub fn get_cached_followed_channels(conn: &rusqlite::Connection) -> Result<Vec<CachedChannel>, CommandError> {
    let mut stmt = conn
        .prepare(
            "SELECT channel_id, login, display_name, profile_image_url, is_favorite, cached_at
             FROM twitch_followed_channels ORDER BY display_name",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CachedChannel {
                channel_id: row.get(0)?,
                login: row.get(1)?,
                display_name: row.get(2)?,
                profile_image_url: row.get(3)?,
                is_favorite: row.get::<_, i64>(4)? != 0,
                cached_at: row.get(5)?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| CommandError::Database(e.to_string()))
}

/// Set is_favorite for a followed channel (Story 19.7). No-op if channel_id not in table.
pub fn set_channel_favorite(
    conn: &rusqlite::Connection,
    channel_id: &str,
    is_favorite: bool,
) -> Result<(), CommandError> {
    conn.execute(
        "UPDATE twitch_followed_channels SET is_favorite = ?1 WHERE channel_id = ?2",
        params![if is_favorite { 1i32 } else { 0i32 }, channel_id],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(())
}

/// Replace all rows in `twitch_stream_cache` with the given streams.
pub fn cache_live_streams(
    conn: &rusqlite::Connection,
    streams: &[CachedStream],
) -> Result<(), CommandError> {
    conn.execute("DELETE FROM twitch_stream_cache", [])
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let cached_at = now_epoch_secs();
    let mut stmt = conn
        .prepare(
            "INSERT INTO twitch_stream_cache (channel_id, title, game_name, game_id, viewer_count, thumbnail_url, started_at, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    for s in streams {
        stmt.execute(params![
            s.channel_id,
            s.title,
            s.game_name,
            s.game_id,
            s.viewer_count,
            s.thumbnail_url,
            s.started_at,
            cached_at,
        ])
        .map_err(|e| CommandError::Database(e.to_string()))?;
    }
    Ok(())
}

/// Read all cached live streams.
pub fn get_cached_live_streams(conn: &rusqlite::Connection) -> Result<Vec<CachedStream>, CommandError> {
    let mut stmt = conn
        .prepare(
            "SELECT channel_id, title, game_name, game_id, viewer_count, thumbnail_url, started_at, cached_at
             FROM twitch_stream_cache",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CachedStream {
                channel_id: row.get(0)?,
                title: row.get(1)?,
                game_name: row.get(2)?,
                game_id: row.get(3)?,
                viewer_count: row.get(4)?,
                thumbnail_url: row.get(5)?,
                started_at: row.get(6)?,
                cached_at: row.get(7)?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| CommandError::Database(e.to_string()))
}

/// Upsert one game name -> Twitch category mapping. Game name is used case-insensitively for lookup; store as provided.
pub fn cache_game_mapping(
    conn: &rusqlite::Connection,
    game_name: &str,
    twitch_game_id: &str,
    twitch_game_name: &str,
) -> Result<(), CommandError> {
    let cached_at = now_epoch_secs();
    conn.execute(
        "INSERT INTO twitch_game_cache (game_name, twitch_game_id, twitch_game_name, cached_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(game_name) DO UPDATE SET
           twitch_game_id = excluded.twitch_game_id,
           twitch_game_name = excluded.twitch_game_name,
           cached_at = excluded.cached_at",
        params![game_name, twitch_game_id, twitch_game_name, cached_at],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(())
}

/// Read game mapping if present and not past TTL (24h). Returns None if missing or expired.
/// Lookup is by exact key; caller should normalize game_name (e.g. lowercase) when storing/reading if desired.
pub fn get_cached_game_mapping(
    conn: &rusqlite::Connection,
    game_name: &str,
) -> Result<Option<CachedGameMapping>, CommandError> {
    let mut stmt = conn
        .prepare(
            "SELECT game_name, twitch_game_id, twitch_game_name, cached_at
             FROM twitch_game_cache WHERE game_name = ?1",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let row = stmt
        .query_row(params![game_name], |row| {
            Ok(CachedGameMapping {
                game_name: row.get(0)?,
                twitch_game_id: row.get(1)?,
                twitch_game_name: row.get(2)?,
                cached_at: row.get(3)?,
            })
        })
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;

    let mapping = match row {
        Some(m) => m,
        None => return Ok(None),
    };
    let now = now_epoch_secs();
    if now - mapping.cached_at > GAME_CACHE_TTL_SECS {
        return Ok(None);
    }
    Ok(Some(mapping))
}

/// Replace all rows in `twitch_trending_library_cache` (Story 19.9). 15-minute TTL.
pub fn cache_trending_library(
    conn: &rusqlite::Connection,
    entries: &[CachedTrendingEntry],
) -> Result<(), CommandError> {
    conn.execute("DELETE FROM twitch_trending_library_cache", [])
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let cached_at = now_epoch_secs();
    let mut stmt = conn
        .prepare(
            "INSERT INTO twitch_trending_library_cache (game_id, game_name, twitch_game_name, twitch_game_id, twitch_viewer_count, twitch_stream_count, twitch_rank, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;

    for e in entries {
        stmt.execute(params![
            e.game_id,
            e.game_name,
            e.twitch_game_name,
            e.twitch_game_id,
            e.twitch_viewer_count,
            e.twitch_stream_count,
            e.twitch_rank,
            cached_at,
        ])
        .map_err(|e| CommandError::Database(e.to_string()))?;
    }
    Ok(())
}

/// Read cached trending library games if present and not past TTL (15 min). Returns empty vec if missing or expired.
pub fn get_cached_trending_library(
    conn: &rusqlite::Connection,
) -> Result<Vec<CachedTrendingEntry>, CommandError> {
    let mut stmt = conn
        .prepare(
            "SELECT game_id, game_name, twitch_game_name, twitch_game_id, twitch_viewer_count, twitch_stream_count, twitch_rank, cached_at
             FROM twitch_trending_library_cache ORDER BY twitch_rank",
        )
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CachedTrendingEntry {
                game_id: row.get(0)?,
                game_name: row.get(1)?,
                twitch_game_name: row.get(2)?,
                twitch_game_id: row.get(3)?,
                twitch_viewer_count: row.get(4)?,
                twitch_stream_count: row.get(5)?,
                twitch_rank: row.get(6)?,
                cached_at: row.get(7)?,
            })
        })
        .map_err(|e| CommandError::Database(e.to_string()))?;
    let list: Vec<CachedTrendingEntry> =
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| CommandError::Database(e.to_string()))?;
    let now = now_epoch_secs();
    if let Some(first) = list.first() {
        if now - first.cached_at > TRENDING_CACHE_TTL_SECS {
            return Ok(vec![]);
        }
    }
    Ok(list)
}

/// Delete all data from the Twitch cache tables. Used on logout.
pub fn clear_twitch_cache(conn: &rusqlite::Connection) -> Result<(), CommandError> {
    conn.execute_batch(
        "DELETE FROM twitch_followed_channels;
         DELETE FROM twitch_stream_cache;
         DELETE FROM twitch_game_cache;
         DELETE FROM twitch_trending_library_cache;
         DELETE FROM twitch_clips_cache;",
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Story A2: clips cache helpers.
// ---------------------------------------------------------------------------

const CLIPS_TTL_SECS: i64 = 6 * 60 * 60; // 6 hours

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Try to read a non-stale clips payload (returns `None` when the row is missing or older
/// than `CLIPS_TTL_SECS`). The payload is the raw JSON returned by `serde_json::to_string`
/// over `Vec<TwitchClip>`; the caller decodes it.
pub fn get_cached_clips_payload(
    conn: &rusqlite::Connection,
    twitch_game_id: &str,
    period_days: u32,
) -> Result<Option<(String, i64)>, CommandError> {
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT payload, fetched_at FROM twitch_clips_cache
             WHERE twitch_game_id = ?1 AND period_days = ?2",
            params![twitch_game_id, period_days as i64],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(row)
}

/// Returns true when `(payload, fetched_at)` is fresh enough to serve.
pub fn is_clips_payload_fresh(fetched_at: i64) -> bool {
    now_secs() - fetched_at < CLIPS_TTL_SECS
}

pub fn store_clips_payload(
    conn: &rusqlite::Connection,
    twitch_game_id: &str,
    period_days: u32,
    payload: &str,
) -> Result<(), CommandError> {
    conn.execute(
        "INSERT INTO twitch_clips_cache (twitch_game_id, period_days, fetched_at, payload)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(twitch_game_id, period_days) DO UPDATE SET
           fetched_at = excluded.fetched_at,
           payload    = excluded.payload",
        params![twitch_game_id, period_days as i64, now_secs(), payload],
    )
    .map_err(|e| CommandError::Database(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../db/migrations/007_twitch_cache_tables.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../db/migrations/008_twitch_trending_cache.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../db/migrations/022_twitch_clips_cache.sql"))
            .unwrap();
        conn
    }

    #[test]
    fn cache_and_get_followed_channels() {
        let conn = in_memory_conn();
        let channels = vec![
            CachedChannel {
                channel_id: "123".to_string(),
                login: "user1".to_string(),
                display_name: "User One".to_string(),
                profile_image_url: "https://example.com/1.png".to_string(),
                is_favorite: false,
                cached_at: 0,
            },
            CachedChannel {
                channel_id: "456".to_string(),
                login: "user2".to_string(),
                display_name: "User Two".to_string(),
                profile_image_url: "https://example.com/2.png".to_string(),
                is_favorite: true,
                cached_at: 0,
            },
        ];
        cache_followed_channels(&conn, &channels).unwrap();
        let got = get_cached_followed_channels(&conn).unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].channel_id, "123");
        assert!(!got[0].is_favorite);
        assert_eq!(got[1].channel_id, "456");
        assert!(got[1].is_favorite);
    }

    #[test]
    fn cache_live_streams_replaces_all() {
        let conn = in_memory_conn();
        let streams1 = vec![CachedStream {
            channel_id: "c1".to_string(),
            title: "Stream 1".to_string(),
            game_name: "Game".to_string(),
            game_id: "g1".to_string(),
            viewer_count: 100,
            thumbnail_url: "https://thumb/1.jpg".to_string(),
            started_at: "2026-01-01T12:00:00Z".to_string(),
            cached_at: 0,
        }];
        cache_live_streams(&conn, &streams1).unwrap();
        assert_eq!(get_cached_live_streams(&conn).unwrap().len(), 1);

        let streams2 = vec![
            CachedStream {
                channel_id: "c2".to_string(),
                title: "Two".to_string(),
                game_name: "G".to_string(),
                game_id: "g2".to_string(),
                viewer_count: 50,
                thumbnail_url: "t2".to_string(),
                started_at: "2026-01-01T13:00:00Z".to_string(),
                cached_at: 0,
            },
        ];
        cache_live_streams(&conn, &streams2).unwrap();
        let got = get_cached_live_streams(&conn).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].channel_id, "c2");
    }

    #[test]
    fn game_mapping_ttl_expired_returns_none() {
        let conn = in_memory_conn();
        let cached_at = now_epoch_secs() - GAME_CACHE_TTL_SECS - 1;
        conn.execute(
            "INSERT INTO twitch_game_cache (game_name, twitch_game_id, twitch_game_name, cached_at) VALUES ('Valorant', 'v1', 'Valorant', ?1)",
            [cached_at],
        )
        .unwrap();
        let got = get_cached_game_mapping(&conn, "Valorant").unwrap();
        assert!(got.is_none());
    }

    #[test]
    fn game_mapping_fresh_returns_some() {
        let conn = in_memory_conn();
        cache_game_mapping(&conn, "Valorant", "v1", "Valorant").unwrap();
        let got = get_cached_game_mapping(&conn, "Valorant").unwrap();
        assert!(got.is_some());
        assert_eq!(got.unwrap().twitch_game_id, "v1");
    }

    #[test]
    fn clear_twitch_cache_removes_all_data() {
        let conn = in_memory_conn();
        cache_followed_channels(
            &conn,
            &[CachedChannel {
                channel_id: "1".to_string(),
                login: "a".to_string(),
                display_name: "A".to_string(),
                profile_image_url: "".to_string(),
                is_favorite: false,
                cached_at: 0,
            }],
        )
        .unwrap();
        cache_live_streams(
            &conn,
            &[CachedStream {
                channel_id: "c1".to_string(),
                title: "t".to_string(),
                game_name: "g".to_string(),
                game_id: "id".to_string(),
                viewer_count: 0,
                thumbnail_url: "".to_string(),
                started_at: "".to_string(),
                cached_at: 0,
            }],
        )
        .unwrap();
        cache_game_mapping(&conn, "Game", "id", "Game").unwrap();

        clear_twitch_cache(&conn).unwrap();

        assert!(get_cached_followed_channels(&conn).unwrap().is_empty());
        assert!(get_cached_live_streams(&conn).unwrap().is_empty());
        assert!(get_cached_game_mapping(&conn, "Game").unwrap().is_none());
    }
}
