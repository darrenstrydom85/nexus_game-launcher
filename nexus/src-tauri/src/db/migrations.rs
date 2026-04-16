use rusqlite::Connection;

struct Migration {
    version: u32,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial_schema",
        sql: include_str!("migrations/001_initial_schema.sql"),
    },
    Migration {
        version: 2,
        name: "dedup_schema",
        sql: include_str!("migrations/002_dedup_schema.sql"),
    },
    Migration {
        version: 3,
        name: "potential_exe_names",
        sql: include_str!("migrations/003_potential_exe_names.sql"),
    },
    Migration {
        version: 4,
        name: "game_scores",
        sql: include_str!("migrations/004_game_scores.sql"),
    },
    Migration {
        version: 5,
        name: "hltb_times",
        sql: include_str!("migrations/005_hltb_times.sql"),
    },
    Migration {
        version: 6,
        name: "remove_hltb_columns",
        sql: include_str!("migrations/006_remove_hltb_columns.sql"),
    },
    Migration {
        version: 7,
        name: "twitch_cache_tables",
        sql: include_str!("migrations/007_twitch_cache_tables.sql"),
    },
    Migration {
        version: 8,
        name: "twitch_trending_cache",
        sql: include_str!("migrations/008_twitch_trending_cache.sql"),
    },
    Migration {
        version: 9,
        name: "session_source_columns",
        sql: include_str!("migrations/009_session_source_columns.sql"),
    },
    Migration {
        version: 10,
        name: "hltb_times_v2",
        sql: include_str!("migrations/010_hltb_times_v2.sql"),
    },
    Migration {
        version: 11,
        name: "game_notes",
        sql: include_str!("migrations/011_game_notes.sql"),
    },
    Migration {
        version: 12,
        name: "session_notes",
        sql: include_str!("migrations/012_session_notes.sql"),
    },
    Migration {
        version: 13,
        name: "play_queue",
        sql: include_str!("migrations/013_play_queue.sql"),
    },
    Migration {
        version: 14,
        name: "game_tags",
        sql: include_str!("migrations/014_game_tags.sql"),
    },
    Migration {
        version: 15,
        name: "smart_collections",
        sql: include_str!("migrations/015_smart_collections.sql"),
    },
    Migration {
        version: 16,
        name: "game_progress",
        sql: include_str!("migrations/016_game_progress.sql"),
    },
    Migration {
        version: 17,
        name: "completed_flag",
        sql: include_str!("migrations/017_completed_flag.sql"),
    },
    Migration {
        version: 18,
        name: "streak_snapshots",
        sql: include_str!("migrations/018_streak_snapshots.sql"),
    },
];

pub fn ensure_schema_version_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version  INTEGER PRIMARY KEY,
            name     TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )
}

pub fn current_version(conn: &Connection) -> rusqlite::Result<u32> {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )
}

pub fn run_pending(conn: &Connection) -> rusqlite::Result<u32> {
    ensure_schema_version_table(conn)?;
    let current = current_version(conn)?;
    let mut applied = 0u32;

    for m in MIGRATIONS {
        if m.version <= current {
            continue;
        }
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(m.sql)?;
        tx.execute(
            "INSERT INTO schema_version (version, name, applied_at) VALUES (?1, ?2, datetime('now'))",
            rusqlite::params![m.version, m.name],
        )?;
        tx.commit()?;
        applied += 1;
    }

    Ok(applied)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_conn() -> Connection {
        Connection::open_in_memory().expect("failed to open in-memory db")
    }

    #[test]
    fn schema_version_table_created() {
        let conn = in_memory_conn();
        ensure_schema_version_table(&conn).unwrap();

        let count: u32 = conn
            .query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn current_version_starts_at_zero() {
        let conn = in_memory_conn();
        ensure_schema_version_table(&conn).unwrap();
        assert_eq!(current_version(&conn).unwrap(), 0);
    }

    #[test]
    fn run_pending_applies_all_migrations() {
        let conn = in_memory_conn();
        let applied = run_pending(&conn).unwrap();
        assert_eq!(applied, MIGRATIONS.len() as u32);
        assert_eq!(current_version(&conn).unwrap(), MIGRATIONS.len() as u32);

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        for expected in &[
            "collection_games",
            "collections",
            "game_duplicate_members",
            "game_duplicates",
            "game_tags",
            "games",
            "play_queue",
            "play_sessions",
            "schema_version",
            "settings",
            "streak_snapshots",
            "tags",
            "twitch_followed_channels",
            "twitch_game_cache",
            "twitch_stream_cache",
            "twitch_trending_library_cache",
            "watched_folders",
        ] {
            assert!(
                tables.contains(&expected.to_string()),
                "missing table: {expected}"
            );
        }
    }

    #[test]
    fn run_pending_skips_already_applied() {
        let conn = in_memory_conn();
        let first = run_pending(&conn).unwrap();
        assert_eq!(first, MIGRATIONS.len() as u32);

        let second = run_pending(&conn).unwrap();
        assert_eq!(second, 0);
        assert_eq!(current_version(&conn).unwrap(), MIGRATIONS.len() as u32);
    }

    #[test]
    fn games_table_has_expected_columns() {
        let conn = in_memory_conn();
        run_pending(&conn).unwrap();

        let cols: Vec<String> = conn
            .prepare("PRAGMA table_info(games)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        let expected = [
            "id",
            "name",
            "source",
            "status",
            "rating",
            "total_play_time",
            "last_played",
            "play_count",
            "is_hidden",
            "added_at",
            "updated_at",
            "igdb_id",
            "steamgrid_id",
            "cover_url",
            "hero_url",
            "genres",
            "source_folder_id",
            "critic_score",
            "critic_score_count",
            "community_score",
            "community_score_count",
            "hltb_main_h",
            "hltb_main_extra_h",
            "hltb_completionist_h",
            "hltb_id",
            "hltb_fetched_at",
            "notes",
            "progress",
            "milestones_json",
        ];
        for col in &expected {
            assert!(cols.contains(&col.to_string()), "games missing column: {col}");
        }
    }

    #[test]
    fn games_rating_check_constraint() {
        let conn = in_memory_conn();
        run_pending(&conn).unwrap();

        let ok = conn.execute(
            "INSERT INTO games (id, name, source, rating, added_at, updated_at) VALUES ('g1', 'Test', 'steam', 3, '2026-01-01', '2026-01-01')",
            [],
        );
        assert!(ok.is_ok());

        let bad = conn.execute(
            "INSERT INTO games (id, name, source, rating, added_at, updated_at) VALUES ('g2', 'Test2', 'steam', 6, '2026-01-01', '2026-01-01')",
            [],
        );
        assert!(bad.is_err());
    }

    #[test]
    fn play_sessions_foreign_key() {
        let conn = in_memory_conn();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_pending(&conn).unwrap();

        conn.execute(
            "INSERT INTO games (id, name, source, added_at, updated_at) VALUES ('g1', 'Game', 'steam', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        let ok = conn.execute(
            "INSERT INTO play_sessions (id, game_id, started_at) VALUES ('s1', 'g1', '2026-01-01T10:00:00')",
            [],
        );
        assert!(ok.is_ok());
    }

    #[test]
    fn settings_key_value_works() {
        let conn = in_memory_conn();
        run_pending(&conn).unwrap();

        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('theme_accent_color', '#ff0000')",
            [],
        )
        .unwrap();

        let val: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'theme_accent_color'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(val, "#ff0000");
    }

    #[test]
    fn collection_games_composite_pk() {
        let conn = in_memory_conn();
        run_pending(&conn).unwrap();

        conn.execute(
            "INSERT INTO collections (id, name, created_at, updated_at) VALUES ('c1', 'Favs', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO games (id, name, source, added_at, updated_at) VALUES ('g1', 'Game', 'steam', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO collection_games (collection_id, game_id, added_at) VALUES ('c1', 'g1', '2026-01-01')",
            [],
        ).unwrap();

        let dup = conn.execute(
            "INSERT INTO collection_games (collection_id, game_id, added_at) VALUES ('c1', 'g1', '2026-01-02')",
            [],
        );
        assert!(dup.is_err(), "duplicate composite PK should fail");
    }

    #[test]
    fn watched_folders_unique_path() {
        let conn = in_memory_conn();
        run_pending(&conn).unwrap();

        conn.execute(
            "INSERT INTO watched_folders (id, path, added_at) VALUES ('w1', 'D:\\Games', '2026-01-01')",
            [],
        ).unwrap();

        let dup = conn.execute(
            "INSERT INTO watched_folders (id, path, added_at) VALUES ('w2', 'D:\\Games', '2026-01-01')",
            [],
        );
        assert!(dup.is_err(), "duplicate path should fail");
    }

    #[test]
    fn indexes_created() {
        let conn = in_memory_conn();
        run_pending(&conn).unwrap();

        let indexes: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        let expected = [
            "idx_games_source",
            "idx_games_status",
            "idx_games_name",
            "idx_games_last_played",
            "idx_games_total_play_time",
            "idx_sessions_game_id",
            "idx_sessions_started_at",
        ];
        for idx in &expected {
            assert!(
                indexes.contains(&idx.to_string()),
                "missing index: {idx}"
            );
        }
    }
}
