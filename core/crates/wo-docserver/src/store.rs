//! Local document store — file-based mirror of the deprecated Python
//! docserver's `lib/store.py` contract.
//!
//! Layout under `{data_dir}`:
//!   docs/{id}               raw document bytes (the pre-existing convention)
//!   meta/{id}.json          {name, created_at, updated_at, lock_token}
//!   versions/{id}/{ts}.bin  content snapshots (ts = unix millis)
//!
//! A JSON sidecar replaces Python's SQLite for metadata; the version
//! directory listing replaces the `versions` table. Lock state lives in the
//! meta sidecar. `MAX_VERSIONS` pruning keeps the newest N snapshots,
//! matching `store.put_version`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::AppError;

/// Keep the newest 20 snapshots per document (Python default).
pub const MAX_VERSIONS: usize = 20;

/// Metadata for one stored document.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DocMeta {
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock_token: Option<String>,
}

/// A recorded version snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionRow {
    pub ts: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub size: u64,
}

/// File-based document store. Clone is cheap (shared state is interior).
#[derive(Clone)]
pub struct DocStore {
    data_dir: PathBuf,
    /// Monotonic timestamp counter so back-to-back writes in the same
    /// millisecond still produce strictly increasing version keys.
    last_ts: std::sync::Arc<Mutex<i64>>,
}

impl DocStore {
    /// Create the store rooted at `data_dir` (dirs are created lazily).
    pub fn new(data_dir: &str) -> Self {
        Self {
            data_dir: PathBuf::from(data_dir),
            last_ts: std::sync::Arc::new(Mutex::new(0)),
        }
    }

    fn docs_dir(&self) -> PathBuf {
        self.data_dir.join("docs")
    }
    fn meta_dir(&self) -> PathBuf {
        self.data_dir.join("meta")
    }
    fn versions_dir(&self, doc_id: &str) -> PathBuf {
        self.data_dir.join("versions").join(doc_id)
    }

    pub fn path_for(&self, doc_id: &str) -> PathBuf {
        self.docs_dir().join(doc_id)
    }

    fn meta_path(&self, doc_id: &str) -> PathBuf {
        self.meta_dir().join(format!("{doc_id}.json"))
    }

    /// Register a new/blank document with metadata; does not touch content.
    pub async fn init(&self, doc_id: &str, name: &str) -> Result<(), AppError> {
        tokio::fs::create_dir_all(self.docs_dir())
            .await
            .map_err(|e| AppError::InternalError(format!("store: {e}")))?;
        let now = now_millis();
        let meta = DocMeta {
            name: name.to_string(),
            created_at: now,
            updated_at: now,
            lock_token: None,
        };
        self.write_meta(doc_id, &meta).await
    }

    pub async fn get(&self, doc_id: &str) -> Result<Option<DocMeta>, AppError> {
        match tokio::fs::read_to_string(self.meta_path(doc_id)).await {
            Ok(s) => serde_json::from_str(&s)
                .map(Some)
                .map_err(|e| AppError::InternalError(format!("meta corrupt: {e}"))),
            Err(_) => Ok(None),
        }
    }

    async fn write_meta(&self, doc_id: &str, meta: &DocMeta) -> Result<(), AppError> {
        tokio::fs::create_dir_all(self.meta_dir())
            .await
            .map_err(|e| AppError::InternalError(format!("store: {e}")))?;
        let bytes = serde_json::to_vec(meta)
            .map_err(|e| AppError::InternalError(format!("meta serialize: {e}")))?;
        tokio::fs::write(self.meta_path(doc_id), bytes)
            .await
            .map_err(|e| AppError::InternalError(format!("store: {e}")))
    }

    /// List all locally stored documents: [{id, name, size}].
    pub async fn list(&self) -> Result<Vec<serde_json::Value>, AppError> {
        let mut out = Vec::new();
        let Ok(mut rd) = tokio::fs::read_dir(self.docs_dir()).await else {
            return Ok(out);
        };
        while let Ok(Some(entry)) = rd.next_entry().await {
            let id = entry.file_name().to_string_lossy().into_owned();
            if id.starts_with('.') {
                continue;
            }
            let meta = self.get(&id).await.ok().flatten().unwrap_or_default();
            let size = match tokio::fs::metadata(entry.path()).await {
                Ok(m) => m.len(),
                Err(_) => 0,
            };
            out.push(serde_json::json!({ "id": id, "name": meta.name, "size": size }));
        }
        out.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
        Ok(out)
    }

    /// Write document content, record a version snapshot and bump `updated_at`.
    pub async fn put_content(&self, doc_id: &str, data: &[u8]) -> Result<i64, AppError> {
        tokio::fs::create_dir_all(self.docs_dir())
            .await
            .map_err(|e| AppError::InternalError(format!("store: {e}")))?;
        tokio::fs::write(self.path_for(doc_id), data)
            .await
            .map_err(|e| AppError::InternalError(format!("store: {e}")))?;

        let now = now_millis();
        let mut meta = self.get(doc_id).await?.unwrap_or_else(|| DocMeta {
            name: doc_id.to_string(),
            created_at: now,
            updated_at: now,
            lock_token: None,
        });
        meta.updated_at = now;
        if meta.created_at == 0 {
            meta.created_at = now;
        }
        self.write_meta(doc_id, &meta).await?;

        let ts = self.put_version(doc_id, data, None).await?;
        Ok(ts)
    }

    pub async fn get_content(&self, doc_id: &str) -> Result<Option<Vec<u8>>, AppError> {
        match tokio::fs::read(self.path_for(doc_id)).await {
            Ok(b) => Ok(Some(b)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(AppError::InternalError(format!("store: {e}"))),
        }
    }

    pub async fn has_content(&self, doc_id: &str) -> bool {
        self.path_for(doc_id).is_file()
    }

    // ── Versions ────────────────────────────────────────────────────────

    fn next_ts(&self) -> i64 {
        let mut last = self.last_ts.lock().unwrap();
        let now = now_millis();
        *last = if now > *last { now } else { *last + 1 };
        *last
    }

    /// Snapshot `data` as a new version; pruning keeps the newest
    /// `MAX_VERSIONS`. Returns the snapshot ts.
    pub async fn put_version(
        &self,
        doc_id: &str,
        data: &[u8],
        author: Option<&str>,
    ) -> Result<i64, AppError> {
        let ts = self.next_ts();
        let vdir = self.versions_dir(doc_id);
        tokio::fs::create_dir_all(&vdir)
            .await
            .map_err(|e| AppError::InternalError(format!("store: {e}")))?;
        let file = vdir.join(format!("{ts}.bin"));
        tokio::fs::write(&file, data)
            .await
            .map_err(|e| AppError::InternalError(format!("store: {e}")))?;
        let _ = author;
        self.prune(doc_id, &vdir).await;
        Ok(ts)
    }

    async fn prune(&self, doc_id: &str, vdir: &Path) {
        let mut names: Vec<PathBuf> = match std::fs::read_dir(vdir) {
            Ok(rd) => rd.filter_map(|e| e.ok().map(|e| e.path())).collect(),
            Err(_) => return,
        };
        if names.len() <= MAX_VERSIONS {
            return;
        }
        names.sort_by_key(|p| {
            p.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        });
        let excess = names.len() - MAX_VERSIONS;
        for p in names.into_iter().take(excess) {
            std::fs::remove_file(p).ok();
        }
        let _ = doc_id;
    }

    /// Version metadata, newest first.
    pub async fn list_versions(&self, doc_id: &str) -> Vec<VersionRow> {
        let vdir = self.versions_dir(doc_id);
        let mut rows = Vec::new();
        if let Ok(rd) = std::fs::read_dir(&vdir) {
            for entry in rd.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                let Some(ts) = name
                    .strip_suffix(".bin")
                    .and_then(|s| s.parse::<i64>().ok())
                else {
                    continue;
                };
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                rows.push(VersionRow {
                    ts,
                    author: None,
                    size,
                });
            }
        }
        rows.sort_by_key(|r| std::cmp::Reverse(r.ts));
        rows
    }

    pub async fn get_version(&self, doc_id: &str, ts: i64) -> Result<Option<Vec<u8>>, AppError> {
        let file = self.versions_dir(doc_id).join(format!("{ts}.bin"));
        match tokio::fs::read(&file).await {
            Ok(b) => Ok(Some(b)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(AppError::InternalError(format!("store: {e}"))),
        }
    }

    /// Restore a snapshot as current content, preserving the pre-restore
    /// head as a new snapshot (so the restore is itself undoable).
    pub async fn restore_version(&self, doc_id: &str, ts: i64) -> Result<i64, AppError> {
        let Some(data) = self.get_version(doc_id, ts).await? else {
            return Err(AppError::NotFound(format!(
                "version {ts} not found for {doc_id}"
            )));
        };
        // preserve current head
        if let Some(head) = self.get_content(doc_id).await? {
            self.put_version(doc_id, &head, None).await?;
        }
        let head_ts = self.put_content(doc_id, &data).await?;
        Ok(head_ts)
    }

    // ── Locks ───────────────────────────────────────────────────────────

    pub async fn get_lock(&self, doc_id: &str) -> Option<String> {
        self.get(doc_id)
            .await
            .ok()
            .flatten()
            .and_then(|m| m.lock_token)
    }

    pub async fn set_lock(&self, doc_id: &str, token: &str) -> Result<(), AppError> {
        let mut meta = self.get(doc_id).await?.unwrap_or_default();
        meta.lock_token = Some(token.to_string());
        self.write_meta(doc_id, &meta).await
    }

    pub async fn release_lock(&self, doc_id: &str) -> Result<(), AppError> {
        let mut meta = self.get(doc_id).await?.unwrap_or_default();
        meta.lock_token = None;
        self.write_meta(doc_id, &meta).await
    }

    /// Doc metadata as the `/api/documents/{id}` WOPI-ish map.
    pub async fn document_meta(&self, doc_id: &str) -> Result<Option<serde_json::Value>, AppError> {
        let Some(meta) = self.get(doc_id).await? else {
            return Ok(None);
        };
        let Some(content) = self.get_content(doc_id).await? else {
            return Ok(None);
        };
        let name = meta.name;
        Ok(Some(serde_json::json!({
            "id": doc_id,
            "name": name,
            "size": content.len(),
            "updated_at": meta.updated_at,
            "locked": meta.lock_token.is_some(),
            "base_file_name": name,
            "format": format_of(&name),
            "mime_type": content_type_of(&name),
            "version": meta.updated_at.to_string(),
            "editable": true,
            "writable": true,
            "contents_url": format!("/api/documents/{doc_id}/contents"),
        })))
    }
}

fn now_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Format from a document name (docx/odt else docx, as Python).
pub fn format_of(name: &str) -> &'static str {
    if name.to_ascii_lowercase().ends_with(".odt") {
        "odt"
    } else {
        "docx"
    }
}

/// MIME type from a document name.
pub fn content_type_of(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".odt") {
        "application/vnd.oasis.opendocument.text"
    } else {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
}

/// Map a store error onto the handler-facing error type (uses strings for
/// errors that already are NotFound; everything else is internal).
impl From<DocStoreError> for AppError {
    fn from(e: DocStoreError) -> Self {
        match e {
            DocStoreError::NotFound(m) => AppError::NotFound(m),
            DocStoreError::Internal(m) => AppError::InternalError(m),
        }
    }
}

/// Minimal store error type (avoids threading AppError through the store).
#[derive(Debug)]
pub enum DocStoreError {
    NotFound(String),
    Internal(String),
}

// ponytail: lock updates are last-writer-wins on a JSON sidecar; per-doc
// CAS would need an atomic compare-and-swap — add only if write races appear.

/// Helper for collab/agent surfaces that need a doc-id -> value map.
pub type DocMap<T> = HashMap<String, T>;

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_store(tag: &str) -> (DocStore, String) {
        let dir = std::env::temp_dir().join(format!("wo-docstore-{tag}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        (
            DocStore::new(dir.to_str().unwrap()),
            dir.to_string_lossy().into_owned(),
        )
    }

    #[tokio::test]
    async fn put_and_list_versions_newest_first() {
        let (store, dir) = tmp_store("vers");
        store.init("a.docx", "A.docx").await.unwrap();
        store.put_content("a.docx", b"v1").await.unwrap();
        store.put_content("a.docx", b"v2").await.unwrap();
        let vs = store.list_versions("a.docx").await;
        assert_eq!(vs.len(), 2);
        assert!(vs[0].ts > vs[1].ts, "newest first");
        assert_eq!(vs[0].size, 2);
        let v1 = store
            .get_version("a.docx", vs[1].ts)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(v1, b"v1");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn version_ts_monotonic_within_same_millisecond() {
        let (store, dir) = tmp_store("mono");
        store.init("a.docx", "A.docx").await.unwrap();
        let t1 = store.next_ts();
        let t2 = store.next_ts();
        assert!(t2 > t1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn restore_preserves_head_and_restores_bytes() {
        let (store, dir) = tmp_store("restore");
        store.init("a.docx", "A.docx").await.unwrap();
        store.put_content("a.docx", b"v1").await.unwrap();
        store.put_content("a.docx", b"v2").await.unwrap();
        let old = store.list_versions("a.docx").await;
        let ts_v1 = old[1].ts;
        let head_ts = store.restore_version("a.docx", ts_v1).await.unwrap();
        assert!(head_ts > ts_v1);
        assert_eq!(store.get_content("a.docx").await.unwrap().unwrap(), b"v1");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn pruning_keeps_newest_max_versions() {
        let (store, dir) = tmp_store("prune");
        store.init("a.docx", "A.docx").await.unwrap();
        for i in 0..(MAX_VERSIONS + 5) {
            store.put_version("a.docx", &[i as u8], None).await.unwrap();
        }
        let vs = store.list_versions("a.docx").await;
        assert_eq!(vs.len(), MAX_VERSIONS);
        assert_eq!(vs[0].size, 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn lock_roundtrip() {
        let (store, dir) = tmp_store("lock");
        store.init("a.docx", "A.docx").await.unwrap();
        assert!(store.get_lock("a.docx").await.is_none());
        store.set_lock("a.docx", "tok-1").await.unwrap();
        assert_eq!(store.get_lock("a.docx").await.as_deref(), Some("tok-1"));
        store.release_lock("a.docx").await.unwrap();
        assert!(store.get_lock("a.docx").await.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }
}
