//! SQLite-backed persistence for webhooks and delivery logs.

use crate::models::{DeliveryLog, Webhook};
use rusqlite::{Connection, params};
use std::path::Path;

/// SQLite-backed store for [`Webhook`] registrations and [`DeliveryLog`] records.
pub struct WebhookRepository {
    conn: Connection,
}

impl WebhookRepository {
    /// Open an in-memory database (for tests).
    pub fn new_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let repo = Self { conn };
        repo.init_tables()?;
        Ok(repo)
    }

    /// Open (or create) a file-backed database at the given path.
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let repo = Self { conn };
        repo.init_tables()?;
        Ok(repo)
    }

    fn init_tables(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS webhooks (
                id           TEXT PRIMARY KEY,
                url          TEXT NOT NULL,
                events       TEXT NOT NULL DEFAULT '[]',
                secret       TEXT NOT NULL DEFAULT '',
                enabled      INTEGER NOT NULL DEFAULT 1,
                max_retries  INTEGER NOT NULL DEFAULT 3,
                timeout_ms   INTEGER NOT NULL DEFAULT 5000,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS delivery_log (
                id           TEXT PRIMARY KEY,
                webhook_id   TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
                event_type   TEXT NOT NULL,
                payload      TEXT NOT NULL DEFAULT '{}',
                status       TEXT NOT NULL DEFAULT 'pending',
                status_code  INTEGER,
                attempt      INTEGER NOT NULL DEFAULT 0,
                error        TEXT,
                next_retry_at TEXT,
                created_at   TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_delivery_webhook_id ON delivery_log(webhook_id);
            CREATE INDEX IF NOT EXISTS idx_delivery_status ON delivery_log(status);
            CREATE INDEX IF NOT EXISTS idx_delivery_next_retry ON delivery_log(next_retry_at);",
        )?;
        Ok(())
    }

    // ── Webhook CRUD ──

    /// Insert a new webhook registration.
    pub fn insert_webhook(&mut self, w: &Webhook) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO webhooks (id, url, events, secret, enabled, max_retries, timeout_ms, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                w.id,
                w.url,
                serde_json::to_string(&w.events).unwrap_or_default(),
                w.secret,
                w.enabled as i32,
                w.max_retries,
                w.timeout_ms,
                w.created_at,
                w.updated_at,
            ],
        )?;
        Ok(())
    }

    /// Retrieve a webhook by id.
    pub fn get_webhook(&self, id: &str) -> Result<Option<Webhook>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, events, secret, enabled, max_retries, timeout_ms, created_at, updated_at
             FROM webhooks WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        match rows.next()? {
            Some(row) => Ok(Some(row_to_webhook(row)?)),
            None => Ok(None),
        }
    }

    /// List all webhook registrations, newest first.
    pub fn list_webhooks(&self) -> Result<Vec<Webhook>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, events, secret, enabled, max_retries, timeout_ms, created_at, updated_at
             FROM webhooks ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_webhook)?;
        rows.collect::<Result<Vec<_>, _>>()
    }

    /// List enabled webhooks subscribed to a given event type (or wildcard `*`).
    pub fn list_webhooks_by_event(
        &self,
        event_type: &str,
    ) -> Result<Vec<Webhook>, rusqlite::Error> {
        let all = self.list_webhooks()?;
        Ok(all
            .into_iter()
            .filter(|w| w.enabled && w.events.iter().any(|e| e == event_type || e == "*"))
            .collect())
    }

    /// Update an existing webhook. Returns true if a row was updated.
    pub fn update_webhook(&mut self, w: &Webhook) -> Result<bool, rusqlite::Error> {
        let affected = self.conn.execute(
            "UPDATE webhooks SET url=?1, events=?2, secret=?3, enabled=?4, max_retries=?5, timeout_ms=?6, updated_at=?7
             WHERE id=?8",
            params![
                w.url,
                serde_json::to_string(&w.events).unwrap_or_default(),
                w.secret,
                w.enabled as i32,
                w.max_retries,
                w.timeout_ms,
                w.updated_at,
                w.id,
            ],
        )?;
        Ok(affected > 0)
    }

    /// Delete a webhook by id. Returns true if a row was removed.
    pub fn delete_webhook(&mut self, id: &str) -> Result<bool, rusqlite::Error> {
        let affected = self
            .conn
            .execute("DELETE FROM webhooks WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    // ── Delivery Log ──

    /// Insert a new delivery log entry.
    pub fn insert_delivery(&mut self, d: &DeliveryLog) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO delivery_log (id, webhook_id, event_type, payload, status, status_code, attempt, error, next_retry_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                d.id,
                d.webhook_id,
                d.event_type,
                d.payload,
                d.status,
                d.status_code,
                d.attempt,
                d.error,
                d.next_retry_at,
                d.created_at,
            ],
        )?;
        Ok(())
    }

    /// List delivery log entries for a specific webhook, newest first.
    pub fn list_deliveries_for_webhook(
        &self,
        webhook_id: &str,
        limit: usize,
    ) -> Result<Vec<DeliveryLog>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, webhook_id, event_type, payload, status, status_code, attempt, error, next_retry_at, created_at
             FROM delivery_log WHERE webhook_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![webhook_id, limit], row_to_delivery)?;
        rows.collect::<Result<Vec<_>, _>>()
    }

    /// List deliveries that are pending and ready for (re)try.
    pub fn list_pending_deliveries(&self) -> Result<Vec<DeliveryLog>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, webhook_id, event_type, payload, status, status_code, attempt, error, next_retry_at, created_at
             FROM delivery_log
             WHERE status = 'pending'
               AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
             ORDER BY created_at ASC
             LIMIT 100",
        )?;
        let rows = stmt.query_map([], row_to_delivery)?;
        rows.collect::<Result<Vec<_>, _>>()
    }

    /// Update a delivery log entry's status after an attempt.
    pub fn update_delivery_status(
        &mut self,
        id: &str,
        status: &str,
        status_code: Option<i32>,
        error: Option<&str>,
        attempt: i32,
        next_retry_at: Option<&str>,
    ) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE delivery_log SET status=?1, status_code=?2, error=?3, attempt=?4, next_retry_at=?5
             WHERE id=?6",
            params![status, status_code, error, attempt, next_retry_at, id],
        )?;
        Ok(())
    }
}

// ── Row mapping helpers ──

fn row_to_webhook(row: &rusqlite::Row<'_>) -> Result<Webhook, rusqlite::Error> {
    let events_str: String = row.get(2)?;
    Ok(Webhook {
        id: row.get(0)?,
        url: row.get(1)?,
        events: serde_json::from_str(&events_str).unwrap_or_default(),
        secret: row.get(3)?,
        enabled: row.get::<_, i32>(4)? != 0,
        max_retries: row.get(5)?,
        timeout_ms: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn row_to_delivery(row: &rusqlite::Row<'_>) -> Result<DeliveryLog, rusqlite::Error> {
    Ok(DeliveryLog {
        id: row.get(0)?,
        webhook_id: row.get(1)?,
        event_type: row.get(2)?,
        payload: row.get(3)?,
        status: row.get(4)?,
        status_code: row.get(5)?,
        attempt: row.get(6)?,
        error: row.get(7)?,
        next_retry_at: row.get(8)?,
        created_at: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_webhook(id: &str, events: Vec<&str>) -> Webhook {
        Webhook {
            id: id.to_string(),
            url: format!("https://example.com/hook/{}", id),
            events: events.iter().map(|s| s.to_string()).collect(),
            secret: "test-secret".into(),
            enabled: true,
            max_retries: 3,
            timeout_ms: 5000,
            created_at: "2026-01-01T00:00:00+00:00".into(),
            updated_at: "2026-01-01T00:00:00+00:00".into(),
        }
    }

    #[test]
    fn insert_and_get_webhook() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        let w = make_webhook("wh-1", vec!["created", "updated"]);
        repo.insert_webhook(&w).unwrap();
        let got = repo.get_webhook("wh-1").unwrap().unwrap();
        assert_eq!(got.id, w.id);
        assert_eq!(got.url, w.url);
        assert_eq!(got.events, w.events);
        assert_eq!(got.secret, w.secret);
        assert!(got.enabled);
    }

    #[test]
    fn get_missing_webhook_returns_none() {
        let repo = WebhookRepository::new_in_memory().unwrap();
        assert!(repo.get_webhook("nope").unwrap().is_none());
    }

    #[test]
    fn list_webhooks_empty() {
        let repo = WebhookRepository::new_in_memory().unwrap();
        let list = repo.list_webhooks().unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn list_webhooks_multiple() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        repo.insert_webhook(&make_webhook("a", vec!["created"]))
            .unwrap();
        repo.insert_webhook(&make_webhook("b", vec!["deleted"]))
            .unwrap();
        repo.insert_webhook(&make_webhook("c", vec!["*"])).unwrap();
        let list = repo.list_webhooks().unwrap();
        assert_eq!(list.len(), 3);
    }

    #[test]
    fn list_webhooks_by_event_matches_subscribed() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        repo.insert_webhook(&make_webhook("w1", vec!["created"]))
            .unwrap();
        repo.insert_webhook(&make_webhook("w2", vec!["updated"]))
            .unwrap();
        repo.insert_webhook(&make_webhook("w3", vec!["*"])).unwrap();
        let created = repo.list_webhooks_by_event("created").unwrap();
        assert_eq!(created.len(), 2); // w1 + wildcard w3
        let updated = repo.list_webhooks_by_event("updated").unwrap();
        assert_eq!(updated.len(), 2); // w2 + wildcard w3
        let deleted = repo.list_webhooks_by_event("deleted").unwrap();
        assert_eq!(deleted.len(), 1); // only wildcard w3
    }

    #[test]
    fn list_webhooks_by_event_excludes_disabled() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        let mut w = make_webhook("disabled", vec!["created"]);
        w.enabled = false;
        repo.insert_webhook(&w).unwrap();
        repo.insert_webhook(&make_webhook("enabled", vec!["created"]))
            .unwrap();
        let list = repo.list_webhooks_by_event("created").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "enabled");
    }

    #[test]
    fn update_webhook() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        repo.insert_webhook(&make_webhook("wh-u", vec!["created"]))
            .unwrap();
        let mut updated = make_webhook("wh-u", vec!["updated", "deleted"]);
        updated.url = "https://new-url.com/hook".into();
        updated.secret = "new-secret".into();
        assert!(repo.update_webhook(&updated).unwrap());
        let got = repo.get_webhook("wh-u").unwrap().unwrap();
        assert_eq!(got.url, "https://new-url.com/hook");
        assert_eq!(got.events, vec!["updated", "deleted"]);
        assert_eq!(got.secret, "new-secret");
    }

    #[test]
    fn delete_webhook() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        repo.insert_webhook(&make_webhook("wh-d", vec!["*"]))
            .unwrap();
        assert!(repo.delete_webhook("wh-d").unwrap());
        assert!(repo.get_webhook("wh-d").unwrap().is_none());
    }

    #[test]
    fn delete_missing_webhook_returns_false() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        assert!(!repo.delete_webhook("ghost").unwrap());
    }

    #[test]
    fn insert_and_list_deliveries() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        repo.insert_webhook(&make_webhook("wh-del", vec!["*"]))
            .unwrap();
        let d = DeliveryLog {
            id: "del-1".into(),
            webhook_id: "wh-del".into(),
            event_type: "created".into(),
            payload: "{}".into(),
            status: "delivered".into(),
            status_code: Some(200),
            attempt: 1,
            error: None,
            next_retry_at: None,
            created_at: "2026-01-01T00:00:00+00:00".into(),
        };
        repo.insert_delivery(&d).unwrap();
        let list = repo.list_deliveries_for_webhook("wh-del", 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].status, "delivered");
    }

    #[test]
    fn update_delivery_status() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        repo.insert_webhook(&make_webhook("wh-ds", vec!["*"]))
            .unwrap();
        let d = DeliveryLog {
            id: "del-status".into(),
            webhook_id: "wh-ds".into(),
            event_type: "created".into(),
            payload: "{}".into(),
            status: "pending".into(),
            status_code: None,
            attempt: 0,
            error: None,
            next_retry_at: None,
            created_at: "2026-01-01T00:00:00+00:00".into(),
        };
        repo.insert_delivery(&d).unwrap();
        repo.update_delivery_status("del-status", "delivered", Some(200), None, 1, None)
            .unwrap();
        let list = repo.list_deliveries_for_webhook("wh-ds", 10).unwrap();
        assert_eq!(list[0].status, "delivered");
        assert_eq!(list[0].status_code, Some(200));
        assert_eq!(list[0].attempt, 1);
    }

    #[test]
    fn list_pending_deliveries() {
        let mut repo = WebhookRepository::new_in_memory().unwrap();
        repo.insert_webhook(&make_webhook("wh-pd", vec!["*"]))
            .unwrap();
        let d1 = DeliveryLog {
            id: "pd-1".into(),
            webhook_id: "wh-pd".into(),
            event_type: "created".into(),
            payload: "{}".into(),
            status: "pending".into(),
            status_code: None,
            attempt: 0,
            error: None,
            next_retry_at: None,
            created_at: "2026-01-01T00:00:00+00:00".into(),
        };
        let d2 = DeliveryLog {
            id: "pd-2".into(),
            webhook_id: "wh-pd".into(),
            event_type: "created".into(),
            payload: "{}".into(),
            status: "delivered".into(),
            status_code: Some(200),
            attempt: 1,
            error: None,
            next_retry_at: None,
            created_at: "2026-01-01T00:00:00+00:00".into(),
        };
        repo.insert_delivery(&d1).unwrap();
        repo.insert_delivery(&d2).unwrap();
        let pending = repo.list_pending_deliveries().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, "pd-1");
    }

    #[test]
    fn persistence_across_restarts() {
        let dir = std::env::temp_dir().join(format!(
            "wo-webhook-repo-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("webhooks.db");
        {
            let mut repo = WebhookRepository::new(&db_path).unwrap();
            repo.insert_webhook(&make_webhook("persist-1", vec!["created"]))
                .unwrap();
            repo.insert_webhook(&make_webhook("persist-2", vec!["*"]))
                .unwrap();
        }
        {
            let repo = WebhookRepository::new(&db_path).unwrap();
            let list = repo.list_webhooks().unwrap();
            assert_eq!(list.len(), 2);
            assert!(repo.get_webhook("persist-1").unwrap().is_some());
            assert!(repo.get_webhook("persist-2").unwrap().is_some());
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
