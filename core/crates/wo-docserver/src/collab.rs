//! Real-time collaboration hub — port of the deprecated Python docserver's
//! `editor/collab.py` CollabHub (the wire contract the WYSIWYG editor uses).
//!
//! The browser never runs a CRDT: it ships its full plain-text content via
//! `POST .../collab/sync`, and the server diffs it against the current text
//! (common prefix/suffix), producing insert/delete ops that are appended to
//! a per-document op log with a global monotonic revision. Late-joining
//! clients replay the log via `GET .../collab/ops?since=<rev>` or subscribe
//! to the Server-Sent-Events stream `GET .../collab/stream`.
//!
//! Wire shapes (identical to Python):
//!   insert: {"t":"insert","s":site,"b":base,"n":len,"chars":"...",
//!            "originSite":"","originSeq":0}
//!   delete: {"t":"delete","s":site,"ids":[["site",seq],...]}
//!   state:  {"doc_id","rev","text","ops":[...],"clients":[{...}]}
//!
//! ponytail: the op log `<->> stored document are re-conciled by `resync`
//! (full-text rebase); item-granular CRDT merge semantics from Python are
//! intentionally not ported because the browser path never emits raw CRDT
//! ops — it only ever ships full-text snapshots. Add the tombstone RGA if a
//! native CRDT client ever appears.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

/// One in-flight collaboration document state.
#[derive(Debug, Default)]
struct CollabDoc {
    rev: usize,
    text: String,
    /// Applied ops (index == revision - 1).
    log: Vec<Value>,
    /// Dedup keys of applied ops (canonical string form of op identity).
    seen: std::collections::HashSet<String>,
    presence: HashMap<String, Value>,
}

fn now_f64() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

/// Hub owning the collaboration state of every document.
#[derive(Default)]
pub struct CollabHub {
    docs: Mutex<HashMap<String, CollabDoc>>,
    /// Event fan-out: per-doc broadcast channel sender (created lazily).
    tx: Mutex<HashMap<String, tokio::sync::broadcast::Sender<String>>>,
}

impl CollabHub {
    pub fn new() -> Self {
        Self::default()
    }

    fn ensure_locked<'a>(
        docs: &'a mut HashMap<String, CollabDoc>,
        doc_id: &str,
    ) -> &'a mut CollabDoc {
        docs.entry(doc_id.to_string()).or_default()
    }

    /// Current revision of a document's op log.
    pub fn rev(&self, doc_id: &str) -> usize {
        self.docs
            .lock()
            .unwrap()
            .get(doc_id)
            .map(|d| d.rev)
            .unwrap_or(0)
    }

    /// Full collaboration snapshot (indexes the current convergence text).
    pub fn state(&self, doc_id: &str) -> Value {
        let mut docs = self.docs.lock().unwrap();
        let doc = Self::ensure_locked(&mut docs, doc_id);
        Self::snapshot(doc_id, doc)
    }

    /// Ops applied after revision `since` plus the current revision.
    pub fn ops_since(&self, doc_id: &str, since: usize) -> Value {
        let mut docs = self.docs.lock().unwrap();
        let doc = Self::ensure_locked(&mut docs, doc_id);
        let ops: Vec<Value> = doc.log.iter().skip(since).cloned().collect();
        json!({ "rev": doc.rev, "ops": ops })
    }

    fn snapshot(doc_id: &str, doc: &CollabDoc) -> Value {
        let clients: Vec<Value> = doc.presence.values().cloned().collect();
        json!({
            "doc_id": doc_id,
            "rev": doc.rev,
            "text": doc.text,
            "ops": doc.log,
            "clients": clients,
        })
    }

    fn op_key(op: &Value) -> Option<String> {
        match op["t"].as_str() {
            Some("insert") => {
                let n = op["n"].as_u64().unwrap_or(0);
                Some(format!(
                    "i:{}:{}:{}",
                    op["s"].as_str()?,
                    op["b"].as_u64()?,
                    n
                ))
            }
            Some("delete") => {
                let ids: Vec<String> = op["ids"]
                    .as_array()?
                    .iter()
                    .map(|v| {
                        format!(
                            "{}:{}",
                            v[0].as_str().unwrap_or(""),
                            v[1].as_u64().unwrap_or(0)
                        )
                    })
                    .collect();
                Some(format!("d:{}:{}", op["s"].as_str()?, ids.join(",")))
            }
            _ => None,
        }
    }

    /// Apply a batch of client ops (idempotent, deduplicated).
    /// Body: `{"client_id": str, "base_rev": int, "ops": [...]}`.
    pub fn apply_ops(
        &self,
        doc_id: &str,
        client_id: &str,
        ops: &[Value],
        base_rev: Option<usize>,
    ) -> Value {
        let mut docs = self.docs.lock().unwrap();
        let doc = Self::ensure_locked(&mut docs, doc_id);
        // Ops the client has already seen since base_rev are skipped from
        // the reply (they applied them already); ops are appended in order.
        let mut applied: Vec<Value> = Vec::new();
        let mut catchup: Vec<Value> = Vec::new();
        for op in ops {
            let Some(key) = Self::op_key(op) else {
                continue;
            };
            if doc.seen.contains(&key) {
                continue;
            }
            doc.seen.insert(key);
            // best-effort text projection: apply the op to local text
            project_op(&mut doc.text, op);
            doc.log.push(op.clone());
            doc.rev += 1;
            applied.push(op.clone());
        }
        // presence bump: reflect activity on the author's entry if present
        if !applied.is_empty() && !client_id.is_empty() {
            if let Some(p) = doc.presence.get_mut(client_id) {
                p["updated"] = json!(now_f64());
            }
        }
        // reply matches Python: all ops since base_rev (0 -> whole log)
        let base = base_rev.unwrap_or(0);
        if base < doc.rev {
            catchup = doc.log.iter().skip(base).cloned().collect();
        }
        let r = json!({
            "doc_id": doc_id,
            "rev": doc.rev,
            "applied": applied,
            "ops": catchup,
            "text": doc.text,
        });
        drop(docs);
        if !applied.is_empty() {
            self.emit(
                doc_id,
                json!({"type":"ops","doc_id":doc_id,"ops":applied,"text":self.text(doc_id)}),
            );
        }
        r
    }

    fn text(&self, doc_id: &str) -> String {
        self.docs
            .lock()
            .unwrap()
            .get(doc_id)
            .map(|d| d.text.clone())
            .unwrap_or_default()
    }

    /// Merge a client's full-text snapshot into the hub (common prefix /
    /// suffix diff → local insert/delete ops), matching Python sync_text.
    pub fn sync_text(&self, doc_id: &str, _client_id: &str, text: &str) -> Value {
        let mut docs = self.docs.lock().unwrap();
        let doc = Self::ensure_locked(&mut docs, doc_id);
        let cur = doc.text.clone();
        let text = text.to_string();
        if cur == text {
            return Self::snapshot(doc_id, doc);
        }
        let max_i = cur.len().min(text.len());
        let mut i = 0;
        let cb = cur.as_bytes();
        let tb = text.as_bytes();
        while i < max_i && cb[i] == tb[i] {
            i += 1;
        }
        let mut j = 0;
        while j < (cur.len() - i)
            && j < (text.len() - i)
            && cb[cur.len() - 1 - j] == tb[text.len() - 1 - j]
        {
            j += 1;
        }
        let del_start = i;
        let del_end = cur.len() - j;
        let insert_text = &text[i..text.len() - j];

        let mut ops: Vec<Value> = Vec::new();
        if del_end > del_start {
            let ids: Vec<Value> = (del_start..del_end)
                .map(|idx| json!([format!("{del_start}-{idx}"), idx]))
                .collect();
            ops.push(json!({"t":"delete","s":_client_id,"ids":ids}));
        }
        if !insert_text.is_empty() {
            ops.push(json!({
                "t":"insert","s":_client_id,"b":del_start,"n":insert_text.chars().count(),
                "chars": insert_text, "originSite":"","originSeq":0
            }));
        }
        let mut applied: Vec<Value> = Vec::new();
        for op in ops {
            if let Some(key) = Self::op_key(&op) {
                if doc.seen.insert(key) {
                    project_op(&mut doc.text, &op);
                    doc.log.push(op.clone());
                    doc.rev += 1;
                    applied.push(op);
                }
            }
        }
        let snap = Self::snapshot(doc_id, doc);
        drop(docs);
        if !applied.is_empty() {
            self.emit(
                doc_id,
                json!({"type":"ops","doc_id":doc_id,"ops":applied,"text":self.text(doc_id)}),
            );
        }
        snap
    }

    /// Rebase the collaboration state onto authoritative text (after a full
    /// save) while keeping live subscribers. Python clones the doc and keeps
    /// subscribers; we parallel that with a fresh state + resync event.
    pub fn resync(&self, doc_id: &str, text: &str) -> Value {
        {
            let mut docs = self.docs.lock().unwrap();
            let doc = CollabDoc {
                rev: 0,
                text: text.to_string(),
                log: Vec::new(),
                seen: std::collections::HashSet::new(),
                presence: HashMap::new(),
            };
            docs.insert(doc_id.to_string(), doc);
        }
        self.emit(
            doc_id,
            json!({"type":"resync","doc_id":doc_id,"rev":0,"text":text}),
        );
        self.state(doc_id)
    }

    /// Announce a client (cursor shared) or leave (cursor `null`).
    pub fn set_presence(
        &self,
        doc_id: &str,
        client_id: &str,
        user: &str,
        cursor: Value,
        avatar: Option<&str>,
    ) -> Value {
        let mut docs = self.docs.lock().unwrap();
        let doc = Self::ensure_locked(&mut docs, doc_id);
        if cursor.is_null() || client_id.is_empty() {
            doc.presence.remove(client_id);
        } else {
            let mut presence = json!({
                "client": client_id,
                "user": if user.is_empty() { client_id } else { user },
                "cursor": cursor,
                "updated": now_f64(),
                "agent": client_id.starts_with("agent="),
            });
            if let Some(avatar_url) = avatar {
                presence["avatar"] = json!(avatar_url);
            }
            doc.presence.insert(client_id.to_string(), presence);
        }
        let clients_json: Vec<Value> = doc.presence.values().cloned().collect();
        drop(docs);
        if !client_id.is_empty() {
            self.emit(
                doc_id,
                json!({"type":"presence","doc_id":doc_id,"clients":clients_json}),
            );
        }
        json!({ "clients": clients_json })
    }

    pub fn clients(&self, doc_id: &str) -> Value {
        let docs = self.docs.lock().unwrap();
        let clients: Vec<Value> = docs
            .get(doc_id)
            .map(|d| d.presence.values().cloned().collect())
            .unwrap_or_default();
        json!({ "clients": clients })
    }

    /// Register a subscriber for a document's live events.
    pub fn subscribe(&self, doc_id: &str) -> tokio::sync::broadcast::Receiver<String> {
        let mut tx = self.tx.lock().unwrap();
        let sender = tx
            .entry(doc_id.to_string())
            .or_insert_with(|| tokio::sync::broadcast::channel::<String>(64).0)
            .clone();
        sender.subscribe()
    }

    fn emit(&self, doc_id: &str, event: Value) {
        let tx = self.tx.lock().unwrap();
        if let Some(sender) = tx.get(doc_id) {
            let _ = sender.send(event.to_string());
        }
    }
}

/// Project an op onto the hub's plain text (best-effort; converges because
/// all ops funnel through sync_text which always produces state text).
fn project_op(text: &mut String, op: &Value) {
    match op["t"].as_str() {
        Some("insert") => {
            let at = op["b"].as_u64().unwrap_or(0) as usize;
            let chars: &str = op["chars"].as_str().unwrap_or("");
            if at <= text.len() {
                text.insert_str(at, chars);
            }
        }
        Some("delete") => {
            if let Some(ids) = op["ids"].as_array() {
                // ids are positional hints ["i-j", idx] in the sync_text path.
                // Removing highest-first means lower indices never shift.
                let mut idxs: Vec<usize> = ids
                    .iter()
                    .filter_map(|v| v.get(1)?.as_u64().map(|u| u as usize))
                    .collect();
                idxs.sort_unstable_by(|a, b| b.cmp(a)); // descending
                let mut chars: Vec<char> = text.chars().collect();
                for idx in idxs {
                    if idx < chars.len() {
                        chars.remove(idx);
                    }
                }
                *text = chars.into_iter().collect();
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_text_basic_insert() {
        let hub = CollabHub::new();
        let snap = hub.sync_text("doc-1", "c1", "hello world");
        assert_eq!(snap["text"], "hello world");
        assert_eq!(snap["rev"], 1);
        assert_eq!(snap["ops"].as_array().unwrap().len(), 1);
        assert_eq!(hub.rev("doc-1"), 1);
    }

    #[test]
    fn sync_text_common_prefix_suffix_diff() {
        let hub = CollabHub::new();
        hub.sync_text("doc-1", "c1", "hello brave world");
        let snap = hub.sync_text("doc-1", "c2", "hello new world");
        assert_eq!(snap["text"], "hello new world");
        // seed insert (rev 1) + delete + insert = 3
        assert_eq!(snap["rev"], 3);
    }

    #[test]
    fn state_returns_clients_and_ops() {
        let hub = CollabHub::new();
        hub.sync_text("doc-1", "c1", "abc");
        hub.set_presence("doc-1", "c1", "Alice", json!({"pos": 0}), None);
        hub.set_presence("doc-1", "agent=writer", "Writer", json!({"pos": 1}), None);
        let state = hub.state("doc-1");
        let clients = state["clients"].as_array().unwrap();
        assert_eq!(clients.len(), 2);
        let agent = clients
            .iter()
            .find(|c| c["client"] == "agent=writer")
            .unwrap();
        assert!(agent["agent"].as_bool().unwrap());
    }

    #[test]
    fn apply_ops_dedupes() {
        let hub = CollabHub::new();
        let op =
            json!({"t":"insert","s":"x","b":0,"n":3,"chars":"abc","originSite":"","originSeq":0});
        let a = hub.apply_ops("doc-1", "c1", std::slice::from_ref(&op), None);
        assert_eq!(a["applied"].as_array().unwrap().len(), 1);
        assert_eq!(hub.rev("doc-1"), 1);
        let b = hub.apply_ops("doc-1", "c1", &[op], None);
        assert_eq!(
            b["applied"].as_array().unwrap().len(),
            0,
            "duplicate must be skipped"
        );
        assert_eq!(hub.rev("doc-1"), 1);
    }

    #[test]
    fn resync_rebases() {
        let hub = CollabHub::new();
        hub.sync_text("doc-1", "c1", "old content");
        let snap = hub.resync("doc-1", "authoritative");
        assert_eq!(snap["text"], "authoritative");
        assert_eq!(hub.rev("doc-1"), 0, "resync resets the op log");
    }

    #[test]
    fn f122_set_presence_with_avatar() {
        let hub = CollabHub::new();
        hub.set_presence(
            "doc-1",
            "c1",
            "Alice",
            json!({"pos": 0}),
            Some("https://example.com/avatar.png"),
        );
        let state = hub.state("doc-1");
        let clients = state["clients"].as_array().unwrap();
        assert_eq!(clients.len(), 1);
        assert_eq!(clients[0]["user"], "Alice");
        assert_eq!(clients[0]["avatar"], "https://example.com/avatar.png");
        hub.set_presence("doc-1", "c2", "Bob", json!({"pos": 1}), None);
        let state = hub.state("doc-1");
        let clients = state["clients"].as_array().unwrap();
        assert_eq!(clients.len(), 2);
        let bob = clients.iter().find(|c| c["client"] == "c2").unwrap();
        assert!(bob.get("avatar").is_none());
    }
}
