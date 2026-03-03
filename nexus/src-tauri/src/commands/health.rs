use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::error::CommandError;
use super::utils::now_iso;
use crate::db::DbState;

/// Protocol-managed sources whose games cannot be verified by exe path.
const PROTOCOL_SOURCES: &[&str] = &["steam", "epic", "ubisoft", "battlenet", "xbox"];

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeadGame {
    pub id: String,
    pub name: String,
    pub source: String,
    pub exe_path: Option<String>,
    pub folder_path: Option<String>,
    pub last_played: Option<String>,
    pub total_play_time_s: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryHealthReport {
    pub dead_games: Vec<DeadGame>,
    pub total_checked: usize,
    pub checked_at: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HealthCheckProgressEvent {
    checked: usize,
    total: usize,
}

#[tauri::command]
pub async fn check_library_health(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<LibraryHealthReport, CommandError> {
    // Collect candidate games while holding the lock, then release before doing
    // filesystem work so we don't block other commands.
    let candidates: Vec<(String, String, String, Option<String>, Option<String>, Option<String>, i64)> = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, source, exe_path, folder_path, last_played, total_play_time
                 FROM games
                 WHERE is_hidden = 0
                   AND (
                     source = 'standalone'
                     OR exe_path IS NOT NULL
                   )",
            )
            .map_err(|e| CommandError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, i64>(6)?,
                ))
            })
            .map_err(|e| CommandError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| CommandError::Database(e.to_string()))?;

        rows
    };

    // Filter out protocol-only games (no exe_path) that happen to be a
    // protocol source (e.g. GOG with only a launch_url).
    let checkable: Vec<_> = candidates
        .into_iter()
        .filter(|(_, _, source, exe_path, _, _, _)| {
            // Protocol sources are excluded unless they have an explicit exe_path
            let is_protocol = PROTOCOL_SOURCES.contains(&source.as_str());
            if is_protocol {
                exe_path.is_some()
            } else {
                // standalone always included (even if exe_path is None — will be dead)
                true
            }
        })
        .collect();

    let total = checkable.len();
    let mut dead_games = Vec::new();

    for (idx, (id, name, source, exe_path, folder_path, last_played, total_play_time)) in
        checkable.into_iter().enumerate()
    {
        let _ = app.emit(
            "health-check-progress",
            HealthCheckProgressEvent {
                checked: idx + 1,
                total,
            },
        );

        let is_dead = match &exe_path {
            None => true,
            Some(path) => {
                let p = std::path::Path::new(path);
                match p.try_exists() {
                    Ok(exists) => !exists,
                    Err(e) => {
                        // Permission error — log warning and treat as dead
                        eprintln!("[health] permission error checking {path}: {e}");
                        true
                    }
                }
            }
        };

        if is_dead {
            dead_games.push(DeadGame {
                id,
                name,
                source,
                exe_path,
                folder_path,
                last_played,
                total_play_time_s: total_play_time,
            });
        }
    }

    Ok(LibraryHealthReport {
        dead_games,
        total_checked: total,
        checked_at: now_iso(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_db() -> DbState {
        db::init_in_memory().expect("in-memory db should init")
    }

    fn insert_game(
        conn: &rusqlite::Connection,
        id: &str,
        name: &str,
        source: &str,
        exe_path: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO games (id, name, source, exe_path, status, added_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name, source, exe_path],
        )
        .unwrap();
    }

    fn run_health_check_inner(state: &DbState) -> Result<LibraryHealthReport, CommandError> {
        let candidates: Vec<(String, String, String, Option<String>, Option<String>, Option<String>, i64)> = {
            let conn = state.conn.lock().map_err(|e| CommandError::Database(format!("lock poisoned: {e}")))?;
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, source, exe_path, folder_path, last_played, total_play_time
                     FROM games
                     WHERE is_hidden = 0
                       AND (source = 'standalone' OR exe_path IS NOT NULL)",
                )
                .map_err(|e| CommandError::Database(e.to_string()))?;
            let rows = stmt.query_map(params![], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, i64>(6)?,
                ))
            })
            .map_err(|e| CommandError::Database(e.to_string()))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| CommandError::Database(e.to_string()))?
        };

        let checkable: Vec<_> = candidates
            .into_iter()
            .filter(|(_, _, source, exe_path, _, _, _)| {
                let is_protocol = PROTOCOL_SOURCES.contains(&source.as_str());
                if is_protocol { exe_path.is_some() } else { true }
            })
            .collect();

        let total = checkable.len();
        let mut dead_games = Vec::new();

        for (id, name, source, exe_path, folder_path, last_played, total_play_time) in checkable {
            let is_dead = match &exe_path {
                None => true,
                Some(path) => {
                    let p = std::path::Path::new(path);
                    match p.try_exists() {
                        Ok(exists) => !exists,
                        Err(_) => true,
                    }
                }
            };
            if is_dead {
                dead_games.push(DeadGame { id, name, source, exe_path, folder_path, last_played, total_play_time_s: total_play_time });
            }
        }

        Ok(LibraryHealthReport { dead_games, total_checked: total, checked_at: now_iso() })
    }

    #[test]
    fn empty_library_returns_empty_report() {
        let state = setup_db();
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 0);
        assert!(report.dead_games.is_empty());
    }

    #[test]
    fn all_exes_exist_returns_no_dead_games() {
        let state = setup_db();
        // Use a path that definitely exists on any system
        let existing = std::env::current_exe()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        {
            let conn = state.conn.lock().unwrap();
            insert_game(&conn, "g1", "Real Game", "standalone", Some(&existing));
        }
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 1);
        assert!(report.dead_games.is_empty());
    }

    #[test]
    fn missing_exe_reported_as_dead() {
        let state = setup_db();
        {
            let conn = state.conn.lock().unwrap();
            insert_game(&conn, "g1", "Dead Game", "standalone", Some("C:\\nonexistent\\game.exe"));
        }
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 1);
        assert_eq!(report.dead_games.len(), 1);
        assert_eq!(report.dead_games[0].name, "Dead Game");
    }

    #[test]
    fn standalone_with_no_exe_path_is_dead() {
        let state = setup_db();
        {
            let conn = state.conn.lock().unwrap();
            insert_game(&conn, "g1", "No Exe Game", "standalone", None);
        }
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 1);
        assert_eq!(report.dead_games.len(), 1);
    }

    #[test]
    fn mixed_some_dead_some_alive() {
        let state = setup_db();
        let existing = std::env::current_exe()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        {
            let conn = state.conn.lock().unwrap();
            insert_game(&conn, "g1", "Alive", "standalone", Some(&existing));
            insert_game(&conn, "g2", "Dead", "standalone", Some("C:\\fake\\path.exe"));
        }
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 2);
        assert_eq!(report.dead_games.len(), 1);
        assert_eq!(report.dead_games[0].id, "g2");
    }

    #[test]
    fn protocol_sources_without_exe_path_excluded() {
        let state = setup_db();
        {
            let conn = state.conn.lock().unwrap();
            // Steam/Epic/Xbox without exe_path → excluded from check
            insert_game(&conn, "g1", "Steam Game", "steam", None);
            insert_game(&conn, "g2", "Epic Game", "epic", None);
            insert_game(&conn, "g3", "Xbox Game", "xbox", None);
        }
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 0);
        assert!(report.dead_games.is_empty());
    }

    #[test]
    fn gog_with_exe_path_included() {
        let state = setup_db();
        {
            let conn = state.conn.lock().unwrap();
            // GOG is not in PROTOCOL_SOURCES, so it's treated like standalone
            insert_game(&conn, "g1", "GOG Game", "gog", Some("C:\\fake\\gog_game.exe"));
        }
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 1);
        assert_eq!(report.dead_games.len(), 1);
    }

    #[test]
    fn steam_with_exe_path_included_and_checked() {
        let state = setup_db();
        {
            let conn = state.conn.lock().unwrap();
            // Steam WITH an explicit exe_path should be checked
            insert_game(&conn, "g1", "Steam Direct", "steam", Some("C:\\fake\\steam_game.exe"));
        }
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 1);
        assert_eq!(report.dead_games.len(), 1);
    }

    #[test]
    fn hidden_games_excluded() {
        let state = setup_db();
        {
            let conn = state.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO games (id, name, source, exe_path, status, is_hidden, added_at, updated_at)
                 VALUES ('g1', 'Hidden', 'standalone', 'C:\\fake.exe', 'backlog', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                params![],
            ).unwrap();
        }
        let report = run_health_check_inner(&state).unwrap();
        assert_eq!(report.total_checked, 0);
    }
}
