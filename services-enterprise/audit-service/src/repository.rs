//! AuditRepository — SQLite-backed audit event persistence.
//!
//! Stores audit trail events with support for listing, retrieval,
//! and retention-based deletion.

use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A single audit trail event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id: String,
    pub timestamp: String,
    pub event_type: String,
    pub actor_id: String,
    pub resource_id: String,
    pub details_json: String,
    pub ip_address: String,
}

/// SQLite-backed store for [`AuditEvent`] records.
pub struct AuditRepository {
    conn: Connection,
}

impl AuditRepository {
    /// Open an in-memory database (for tests).
    pub fn new_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    /// Open (or create) a file-backed database at the given path.
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    fn init_table(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS events (
                id           TEXT PRIMARY KEY,
                timestamp    TEXT NOT NULL,
                event_type   TEXT NOT NULL,
                actor_id     TEXT NOT NULL DEFAULT '',
                resource_id  TEXT NOT NULL DEFAULT '',
                details_json TEXT NOT NULL DEFAULT '{}',
                ip_address   TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
            CREATE INDEX IF NOT EXISTS idx_events_actor_id ON events(actor_id);",
        )?;
        Ok(())
    }

    /// Insert a new audit event record.
    pub fn insert(&mut self, event: &AuditEvent) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO events (id, timestamp, event_type, actor_id, resource_id, details_json, ip_address)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                event.id,
                event.timestamp,
                event.event_type,
                event.actor_id,
                event.resource_id,
                event.details_json,
                event.ip_address,
            ],
        )?;
        Ok(())
    }

    /// List events with pagination (newest first).
    pub fn list(&self, limit: usize, offset: usize) -> Result<Vec<AuditEvent>, rusqlite::Error> {
        let effective_limit = if limit == 0 { 20 } else { limit };
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, event_type, actor_id, resource_id, details_json, ip_address
             FROM events ORDER BY timestamp DESC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map(
            rusqlite::params![effective_limit as i64, offset as i64],
            row_to_event,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
    }

    /// Retrieve a single event by id.
    pub fn get(&self, id: &str) -> Result<Option<AuditEvent>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, event_type, actor_id, resource_id, details_json, ip_address
             FROM events WHERE id = ?1",
        )?;
        let mut rows = stmt.query(rusqlite::params![id])?;
        match rows.next()? {
            Some(row) => Ok(Some(row_to_event(row)?)),
            None => Ok(None),
        }
    }

    /// Delete events older than the given number of days.
    /// Returns the number of deleted rows.
    pub fn delete_older_than(&mut self, days: i64) -> Result<usize, rusqlite::Error> {
        let cutoff = (Utc::now() - chrono::Duration::days(days)).to_rfc3339();
        let affected = self.conn.execute(
            "DELETE FROM events WHERE timestamp < ?1",
            rusqlite::params![cutoff],
        )?;
        Ok(affected)
    }

    /// Return the total number of events in the store.
    pub fn count(&self) -> Result<i64, rusqlite::Error> {
        self.conn
            .query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))
    }
}

fn row_to_event(row: &rusqlite::Row<'_>) -> Result<AuditEvent, rusqlite::Error> {
    Ok(AuditEvent {
        id: row.get(0)?,
        timestamp: row.get(1)?,
        event_type: row.get(2)?,
        actor_id: row.get(3)?,
        resource_id: row.get(4)?,
        details_json: row.get(5)?,
        ip_address: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_event(id: &str, event_type: &str) -> AuditEvent {
        AuditEvent {
            id: id.to_string(),
            timestamp: Utc::now().to_rfc3339(),
            event_type: event_type.to_string(),
            actor_id: "user-1".to_string(),
            resource_id: "doc-1".to_string(),
            details_json: "{}".to_string(),
            ip_address: "127.0.0.1".to_string(),
        }
    }

    #[test]
    fn insert_and_get() {
        let mut repo = AuditRepository::new_in_memory().unwrap();
        let e = make_event("evt-1", "document.view");
        repo.insert(&e).unwrap();
        let got = repo.get("evt-1").unwrap().unwrap();
        assert_eq!(got.id, e.id);
        assert_eq!(got.event_type, e.event_type);
        assert_eq!(got.actor_id, e.actor_id);
        assert_eq!(got.resource_id, e.resource_id);
    }

    #[test]
    fn get_missing_returns_none() {
        let repo = AuditRepository::new_in_memory().unwrap();
        assert!(repo.get("nope").unwrap().is_none());
    }

    #[test]
    fn list_empty() {
        let repo = AuditRepository::new_in_memory().unwrap();
        let list = repo.list(10, 0).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn list_pagination() {
        let mut repo = AuditRepository::new_in_memory().unwrap();
        for i in 0..5 {
            repo.insert(&make_event(&format!("evt-{}", i), "test.event"))
                .unwrap();
        }
        let all = repo.list(10, 0).unwrap();
        assert_eq!(all.len(), 5);
        let page = repo.list(2, 1).unwrap();
        assert_eq!(page.len(), 2);
    }

    #[test]
    fn delete_older_than() {
        let mut repo = AuditRepository::new_in_memory().unwrap();

        let old_event = AuditEvent {
            id: "old-evt".to_string(),
            timestamp: "2020-01-01T00:00:00+00:00".to_string(),
            event_type: "test.old".to_string(),
            actor_id: "user".to_string(),
            resource_id: "doc".to_string(),
            details_json: "{}".to_string(),
            ip_address: "127.0.0.1".to_string(),
        };
        repo.insert(&old_event).unwrap();

        repo.insert(&make_event("new-evt", "test.new"))
            .unwrap();

        let deleted = repo.delete_older_than(30).unwrap();
        assert_eq!(deleted, 1);
        assert!(repo.get("old-evt").unwrap().is_none());
        assert!(repo.get("new-evt").unwrap().is_some());
    }

    #[test]
    fn persistence_across_restarts() {
        let dir = std::env::temp_dir().join(format!(
            "wo-audit-repo-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("audit.db");

        {
            let mut repo = AuditRepository::new(&db_path).unwrap();
            repo.insert(&make_event("persist-1", "test.event"))
                .unwrap();
            repo.insert(&make_event("persist-2", "test.event"))
                .unwrap();
        }
        {
            let repo = AuditRepository::new(&db_path).unwrap();
            let list = repo.list(10, 0).unwrap();
            assert_eq!(list.len(), 2);
            assert!(repo.get("persist-1").unwrap().is_some());
            assert!(repo.get("persist-2").unwrap().is_some());
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}
