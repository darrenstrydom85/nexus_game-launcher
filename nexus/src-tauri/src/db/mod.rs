pub mod migrations;

use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
}

impl DbState {
    /// Replace the live database file with a new one and reopen the connection.
    /// Used by the restore-from-backup flow: the caller downloads a backup to
    /// `source_path`, then this method atomically swaps it into `self.db_path`,
    /// reopens the connection, and runs any pending migrations.
    pub fn reopen_with_file(&self, source_path: &std::path::Path) -> Result<(), String> {
        let mut conn_guard = self
            .conn
            .lock()
            .map_err(|e| format!("lock poisoned: {e}"))?;

        conn_guard
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .ok();
        drop(std::mem::replace(
            &mut *conn_guard,
            Connection::open_in_memory().map_err(|e| format!("temp conn: {e}"))?,
        ));

        fs::copy(source_path, &self.db_path)
            .map_err(|e| format!("failed to copy backup into place: {e}"))?;
        let _ = fs::remove_file(source_path);

        let new_conn = Connection::open(&self.db_path)
            .map_err(|e| format!("failed to reopen database: {e}"))?;
        new_conn
            .execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("failed to set pragmas: {e}"))?;
        migrations::run_pending(&new_conn).map_err(|e| format!("migration failed: {e}"))?;

        *conn_guard = new_conn;
        Ok(())
    }
}

fn resolve_db_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|_| "APPDATA env var not set".to_string())?;
    Ok(PathBuf::from(app_data).join("nexus").join("games.db"))
}

pub fn init() -> Result<DbState, String> {
    let db_path = resolve_db_path()?;

    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create app data directory: {e}"))?;
    }

    let conn =
        Connection::open(&db_path).map_err(|e| format!("failed to open database: {e}"))?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("failed to set pragmas: {e}"))?;

    migrations::run_pending(&conn).map_err(|e| format!("migration failed: {e}"))?;

    Ok(DbState {
        conn: Mutex::new(conn),
        db_path,
    })
}

#[cfg(test)]
pub fn init_in_memory() -> Result<DbState, String> {
    let conn =
        Connection::open_in_memory().map_err(|e| format!("failed to open in-memory db: {e}"))?;

    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("failed to set pragmas: {e}"))?;

    migrations::run_pending(&conn).map_err(|e| format!("migration failed: {e}"))?;

    Ok(DbState {
        conn: Mutex::new(conn),
        db_path: PathBuf::from(":memory:"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_in_memory_succeeds() {
        let state = init_in_memory().expect("in-memory init should succeed");
        let conn = state.conn.lock().unwrap();
        let version: u32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert!(version >= 1, "expected at least migration 1, got {version}");
    }

    #[test]
    fn db_state_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<DbState>();
    }

    #[test]
    fn resolve_db_path_contains_nexus() {
        if std::env::var("APPDATA").is_ok() {
            let path = resolve_db_path().unwrap();
            assert!(path.to_string_lossy().contains("nexus"));
            assert!(path.to_string_lossy().ends_with("games.db"));
        }
    }
}
