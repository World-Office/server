//! coauthoring-service/src/replay.rs — Late-join replay from op-log
//!
//! When a new client (3rd, 4th, … Nth) joins a collaborative session that
//! already has an op-log, it needs to catch up to the current document
//! state before it can participate in live editing. This module implements
//! that replay protocol.
//!
//! # Architecture
//!
//! - [`ReplayToken`] — opaque checkpoint token proving a client has received
//!   all ops through a certain document state. Stores per-user highest
//!   revision so the server can compute a precise delta on reconnect.
//! - [`ReplayRequest`] — client's replay request, containing either a token
//!   (resume from checkpoint) or `{ revision: 0 }` (full replay).
//! - [`ReplayResponse`] — server's replay payload: the missing ops and a
//!   new checkpoint token the client should store.
//! - [`ReplayManager`] — per-document coordinator that tracks replay sessions,
//!   computes missing ops, and issues tokens.
//!
//! # Wire format
//!
//! ```json
//! // ReplayRequest (client → server)
//! { "token": "eyJ...base64..." }
//! // or for fresh join:
//! { "revision": 0 }
//!
//! // ReplayResponse (server → client)
//! {
//!   "ops": [ ... ModelOpEnvelope array ... ],
//!   "token": "eyJ...base64...",
//!   "total_ops": 42,
//!   "replayed_ops": 15,
//!   "snapshot_revision": 42
//! }
//! ```
//!
//! # Invariants
//!
//! - **INV-1:** `ReplayManager::replay()` always returns ops in causal order
//!   (same order as `Document.ops()`).
//! - **INV-2:** Every `ReplayToken` encodes per-user highest revisions from the
//!   op-log at token creation time, enabling precise delta computation.
//! - **INV-3:** Replay is idempotent: a client receiving ops it already has
//!   can safely apply them (dedup via `(user_id, revision)` in `push_op`).
//! - **INV-4:** Tokens are bound to a session ID — cross-session replay is
//!   rejected with `ReplayError::InvalidToken`.
//! - **INV-5:** `complete_replay()` removes the replay session so replayed
//!   ops are not re-sent on the next request.

use std::collections::HashMap;

use base64::Engine;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::document::Document;
use crate::model_op::ModelOpEnvelope;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors produced during the replay protocol.
#[derive(Debug, Error, PartialEq)]
pub enum ReplayError {
    /// The provided token encodes a revision higher than the current
    /// op-log for some user.
    #[error(
        "stale token: token revision {token_rev} exceeds document revision {doc_rev} for user '{user}'"
    )]
    StaleToken {
        user: String,
        token_rev: u64,
        doc_rev: u64,
    },

    /// The token is malformed or could not be decoded.
    #[error("invalid token: {0}")]
    InvalidToken(String),

    /// The replay session does not exist.
    #[error("no active replay session for client '{client_id}'")]
    NoSession { client_id: String },

    /// Internal serialization error.
    #[error("replay serialization error: {0}")]
    SerializationError(String),
}

// ---------------------------------------------------------------------------
// ReplayToken — opaque checkpoint
// ---------------------------------------------------------------------------

/// Opaque checkpoint token proving a client has received all ops through
/// a certain document state.
///
/// Stores per-user highest revision so the server can compute a precise
/// delta when the client reconnects. Tokens are base64-encoded JSON.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReplayToken {
    /// Per-user highest revision this token covers.
    pub user_revisions: HashMap<String, u64>,

    /// The session ID this token belongs to.
    pub session_id: String,

    /// Monotonic counter to make tokens unique.
    pub sequence: u64,
}

impl ReplayToken {
    /// Create a new replay token from per-user revision state.
    pub fn new(user_revisions: HashMap<String, u64>, session_id: String, sequence: u64) -> Self {
        Self {
            user_revisions,
            session_id,
            sequence,
        }
    }

    /// Encode the token to a base64 string for transport.
    pub fn to_string_encoded(&self) -> Result<String, ReplayError> {
        let json = serde_json::to_string(self)
            .map_err(|e| ReplayError::SerializationError(e.to_string()))?;
        Ok(base64_encode(&json))
    }

    /// Decode a token from a base64 string.
    pub fn from_string_encoded(encoded: &str) -> Result<Self, ReplayError> {
        let json = base64_decode(encoded)
            .map_err(|e| ReplayError::InvalidToken(format!("base64 decode failed: {e}")))?;
        serde_json::from_str(&json)
            .map_err(|e| ReplayError::InvalidToken(format!("JSON parse failed: {e}")))
    }
}

// ---------------------------------------------------------------------------
// ReplayRequest — client's replay request
// ---------------------------------------------------------------------------

/// A client's request to replay missed operations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum ReplayRequest {
    /// Resume replay from a previously issued checkpoint token.
    Token {
        /// Base64-encoded [`ReplayToken`].
        token: String,
    },
    /// Start replay from the given revision number.
    /// Only `from_revision: 0` (full replay) is meaningful.
    FromRevision { from_revision: u64 },
}

impl ReplayRequest {
    /// Create a token-based replay request.
    pub fn with_token(token: String) -> Self {
        Self::Token { token }
    }

    /// Create a revision-based replay request (e.g. for fresh join).
    pub fn from_revision(revision: u64) -> Self {
        Self::FromRevision {
            from_revision: revision,
        }
    }

    /// Extract the per-user revision state from this request.
    ///
    /// For `FromRevision { from_revision: 0 }`, returns an empty map.
    /// For `Token`, decodes and returns the token's `user_revisions`.
    pub fn user_revisions(&self, session_id: &str) -> Result<HashMap<String, u64>, ReplayError> {
        match self {
            Self::Token { token } => {
                let decoded = ReplayToken::from_string_encoded(token)?;
                if decoded.session_id != session_id {
                    return Err(ReplayError::InvalidToken(format!(
                        "token session '{}' does not match current session '{}'",
                        decoded.session_id, session_id
                    )));
                }
                Ok(decoded.user_revisions)
            }
            Self::FromRevision { from_revision: 0 } => Ok(HashMap::new()),
            Self::FromRevision { from_revision } => Err(ReplayError::InvalidToken(format!(
                "non-zero from_revision ({from_revision}) is not supported; use a token"
            ))),
        }
    }
}

// ---------------------------------------------------------------------------
// ReplayResponse — server's replay payload
// ---------------------------------------------------------------------------

/// The server's response to a replay request.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayResponse {
    /// The operations the client needs to apply, in causal order.
    pub ops: Vec<ModelOpEnvelope>,

    /// New checkpoint token the client should store.
    pub token: String,

    /// Total number of operations in the document's op-log.
    pub total_ops: usize,

    /// Number of operations being replayed in this response.
    pub replayed_ops: usize,

    /// The global head revision this replay brings the client up to.
    pub snapshot_revision: u64,
}

// ---------------------------------------------------------------------------
// ReplaySession — tracks a single client's replay state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReplaySession {
    #[allow(dead_code)]
    client_id: String,
    #[allow(dead_code)]
    from_revision: u64,
    ops_sent: usize,
}

// ---------------------------------------------------------------------------
// ReplayManager — per-document replay coordinator
// ---------------------------------------------------------------------------

/// Per-document replay coordinator.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayManager {
    session_id: String,
    active_sessions: HashMap<String, ReplaySession>,
    token_counter: u64,
}

impl ReplayManager {
    /// Create a new replay manager for the given session.
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            active_sessions: HashMap::new(),
            token_counter: 0,
        }
    }

    /// Compute and return the ops a client needs to catch up.
    ///
    /// For fresh joins (`from_revision: 0`), returns all ops in the log.
    /// For token-based resume, returns only ops the client doesn't have
    /// (computed via per-user revision comparison).
    pub fn replay(
        &mut self,
        request: &ReplayRequest,
        document: &Document,
        client_id: &str,
    ) -> Result<ReplayResponse, ReplayError> {
        // 1. Get client's known per-user revisions.
        let known_revisions = request.user_revisions(&self.session_id)?;

        // 2. Validate: no user's known revision exceeds their current max.
        let current_revisions = compute_user_revisions(document);
        for (user_id, &known_rev) in &known_revisions {
            if let Some(&current_max) = current_revisions.get(user_id)
                && known_rev > current_max
            {
                return Err(ReplayError::StaleToken {
                    user: user_id.clone(),
                    token_rev: known_rev,
                    doc_rev: current_max,
                });
            }
        }

        // 3. Compute missing ops: ops the client doesn't have.
        let missing_ops: Vec<ModelOpEnvelope> = document
            .ops()
            .iter()
            .filter(|op| match known_revisions.get(&op.user_id) {
                None => true, // Unknown user → all their ops are new
                Some(&max_rev) => op.revision > max_rev,
            })
            .cloned()
            .collect();

        let replayed_count = missing_ops.len();
        let global_head = compute_global_head(document);

        // 4. Issue new checkpoint token covering all current ops.
        let token = self.issue_token(&current_revisions);

        // 5. Register replay session.
        self.active_sessions.insert(
            client_id.to_string(),
            ReplaySession {
                client_id: client_id.to_string(),
                from_revision: 0,
                ops_sent: replayed_count,
            },
        );

        // 6. Build response.
        let token_encoded = token.to_string_encoded()?;
        Ok(ReplayResponse {
            ops: missing_ops,
            token: token_encoded,
            total_ops: document.op_count(),
            replayed_ops: replayed_count,
            snapshot_revision: global_head,
        })
    }

    /// Mark a client's replay as complete and remove the session.
    pub fn complete_replay(&mut self, client_id: &str) -> Result<(), ReplayError> {
        if self.active_sessions.remove(client_id).is_none() {
            return Err(ReplayError::NoSession {
                client_id: client_id.to_string(),
            });
        }
        Ok(())
    }

    /// Check whether a client has an active replay session.
    pub fn has_active_session(&self, client_id: &str) -> bool {
        self.active_sessions.contains_key(client_id)
    }

    /// Get the number of ops sent in a client's replay session.
    pub fn ops_sent_for(&self, client_id: &str) -> Option<usize> {
        self.active_sessions.get(client_id).map(|s| s.ops_sent)
    }

    /// Number of active replay sessions.
    pub fn active_session_count(&self) -> usize {
        self.active_sessions.len()
    }

    /// Get all client IDs with active replay sessions.
    pub fn active_client_ids(&self) -> Vec<&str> {
        self.active_sessions.keys().map(|s| s.as_str()).collect()
    }

    fn issue_token(&mut self, user_revisions: &HashMap<String, u64>) -> ReplayToken {
        let token = ReplayToken::new(
            user_revisions.clone(),
            self.session_id.clone(),
            self.token_counter,
        );
        self.token_counter += 1;
        token
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

fn compute_user_revisions(document: &Document) -> HashMap<String, u64> {
    let mut revisions = HashMap::new();
    for op in document.ops() {
        let entry = revisions.entry(op.user_id.clone()).or_insert(0u64);
        if op.revision > *entry {
            *entry = op.revision;
        }
    }
    revisions
}

fn compute_global_head(document: &Document) -> u64 {
    document.ops().iter().map(|e| e.revision).max().unwrap_or(0)
}

fn base64_encode(input: &str) -> String {
    use std::io::Write;
    let mut buf = Vec::new();
    {
        let mut encoder =
            base64::write::EncoderWriter::new(&mut buf, &base64::engine::general_purpose::STANDARD);
        let _ = encoder.write_all(input.as_bytes());
        let _ = encoder.finish();
    }
    String::from_utf8(buf).unwrap_or_else(|_| input.to_string())
}

fn base64_decode(input: &str) -> Result<String, Box<dyn std::error::Error>> {
    let decoded = base64::engine::general_purpose::STANDARD.decode(input)?;
    Ok(String::from_utf8(decoded)?)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use wo_common::{ModelOp, Path, Range};

    fn text_path(para: usize, run: usize, char: usize) -> Path {
        Path::Text { para, run, char }
    }

    fn table_path(
        table: usize,
        row: usize,
        cell: usize,
        para: usize,
        run: usize,
        char: usize,
    ) -> Path {
        Path::Table {
            table,
            row,
            cell,
            para,
            run,
            char,
        }
    }

    fn make_insert_op(at: Path, content: &str) -> ModelOp {
        ModelOp::Insert {
            at,
            content: content.to_string(),
        }
    }

    fn make_delete_op(start: Path, end: Path) -> ModelOp {
        ModelOp::Delete {
            range: Range::new(start, end),
        }
    }

    fn make_format_op(range: Range) -> ModelOp {
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".into(), serde_json::json!(true));
        ModelOp::Format { range, attrs }
    }

    fn build_document(n_ops: usize) -> Document {
        let mut doc = Document::new();
        for i in 0..n_ops {
            doc.apply_model_op(
                make_insert_op(text_path(0, 0, i), &format!("op_{i}")),
                "alice",
                "sess-1",
            );
        }
        doc
    }

    fn build_multi_user_document() -> Document {
        let mut doc = Document::new();
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "a0"), "alice", "s1");
        doc.apply_model_op(make_insert_op(text_path(0, 0, 1), "a1"), "alice", "s1");
        doc.apply_model_op(make_insert_op(text_path(0, 0, 2), "a2"), "alice", "s1");
        doc.apply_model_op(make_insert_op(text_path(1, 0, 0), "b0"), "bob", "s1");
        doc.apply_model_op(make_insert_op(text_path(1, 0, 1), "b1"), "bob", "s1");
        doc.apply_model_op(make_insert_op(text_path(2, 0, 0), "c0"), "carol", "s1");
        doc
    }

    // =========================================================================
    // 1. ReplayToken — construction and encoding
    // =========================================================================

    mod replay_token {
        use super::*;

        #[test]
        fn new_token_has_correct_fields() {
            let mut revs = HashMap::new();
            revs.insert("alice".into(), 5);
            let token = ReplayToken::new(revs, "sess-1".into(), 0);
            assert_eq!(token.session_id, "sess-1");
            assert_eq!(token.sequence, 0);
            assert_eq!(token.user_revisions.get("alice"), Some(&5));
        }

        #[test]
        fn encode_decode_roundtrip() {
            let mut revs = HashMap::new();
            revs.insert("alice".into(), 5);
            revs.insert("bob".into(), 3);
            let token = ReplayToken::new(revs, "sess-1".into(), 7);
            let encoded = token.to_string_encoded().unwrap();
            let decoded = ReplayToken::from_string_encoded(&encoded).unwrap();
            assert_eq!(token, decoded);
        }

        #[test]
        fn encode_decode_empty_revisions() {
            let token = ReplayToken::new(HashMap::new(), "s".into(), 0);
            let encoded = token.to_string_encoded().unwrap();
            let decoded = ReplayToken::from_string_encoded(&encoded).unwrap();
            assert_eq!(token, decoded);
        }

        #[test]
        fn decode_rejects_garbage() {
            let result = ReplayToken::from_string_encoded("!!!not-base64!!!");
            assert!(matches!(result.unwrap_err(), ReplayError::InvalidToken(_)));
        }

        #[test]
        fn decode_rejects_non_json() {
            let encoded = base64_encode("not json");
            let result = ReplayToken::from_string_encoded(&encoded);
            assert!(matches!(result.unwrap_err(), ReplayError::InvalidToken(_)));
        }

        #[test]
        fn same_tokens_equal() {
            let mut revs = HashMap::new();
            revs.insert("a".into(), 5);
            let a = ReplayToken::new(revs.clone(), "s".into(), 0);
            let b = ReplayToken::new(revs, "s".into(), 0);
            assert_eq!(a, b);
        }

        #[test]
        fn different_sequence_not_equal() {
            let revs = HashMap::new();
            let a = ReplayToken::new(revs.clone(), "s".into(), 0);
            let b = ReplayToken::new(revs, "s".into(), 1);
            assert_ne!(a, b);
        }
    }

    // =========================================================================
    // 2. ReplayRequest — construction and serde
    // =========================================================================

    mod replay_request {
        use super::*;

        #[test]
        fn with_token_request() {
            let req = ReplayRequest::with_token("abc".into());
            match req {
                ReplayRequest::Token { token } => assert_eq!(token, "abc"),
                _ => panic!("expected Token"),
            }
        }

        #[test]
        fn from_revision_zero() {
            let req = ReplayRequest::from_revision(0);
            match req {
                ReplayRequest::FromRevision { from_revision } => assert_eq!(from_revision, 0),
                _ => panic!("expected FromRevision"),
            }
        }

        #[test]
        fn user_revisions_fresh_join_is_empty() {
            let revs = ReplayRequest::from_revision(0).user_revisions("s").unwrap();
            assert!(revs.is_empty());
        }

        #[test]
        fn user_revisions_from_token() {
            let mut revs = HashMap::new();
            revs.insert("alice".into(), 5);
            let token = ReplayToken::new(revs, "s1".into(), 0);
            let req = ReplayRequest::with_token(token.to_string_encoded().unwrap());
            let decoded = req.user_revisions("s1").unwrap();
            assert_eq!(decoded.get("alice"), Some(&5));
        }

        #[test]
        fn user_revisions_rejects_cross_session() {
            let token = ReplayToken::new(HashMap::new(), "s1".into(), 0);
            let req = ReplayRequest::with_token(token.to_string_encoded().unwrap());
            assert!(req.user_revisions("s2").is_err());
        }

        #[test]
        fn user_revisions_rejects_non_zero() {
            let err = ReplayRequest::from_revision(5).user_revisions("s");
            assert!(matches!(err.unwrap_err(), ReplayError::InvalidToken(_)));
        }

        #[test]
        fn token_serde_roundtrip() {
            let req = ReplayRequest::with_token("t".into());
            let json = serde_json::to_string(&req).unwrap();
            let back: ReplayRequest = serde_json::from_str(&json).unwrap();
            assert_eq!(req, back);
        }

        #[test]
        fn revision_serde_roundtrip() {
            let req = ReplayRequest::from_revision(0);
            let json = serde_json::to_string(&req).unwrap();
            let back: ReplayRequest = serde_json::from_str(&json).unwrap();
            assert_eq!(req, back);
        }
    }

    // =========================================================================
    // 3. ReplayResponse — serde
    // =========================================================================

    mod replay_response {
        use super::*;

        #[test]
        fn empty_response_serde_roundtrip() {
            let resp = ReplayResponse {
                ops: Vec::new(),
                token: "t".into(),
                total_ops: 10,
                replayed_ops: 0,
                snapshot_revision: 10,
            };
            let json = serde_json::to_string(&resp).unwrap();
            let back: ReplayResponse = serde_json::from_str(&json).unwrap();
            assert_eq!(resp, back);
        }

        #[test]
        fn response_with_ops_serde_roundtrip() {
            let mut doc = Document::new();
            doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "H"), "alice", "s");
            let resp = ReplayResponse {
                ops: doc.ops().to_vec(),
                token: "t".into(),
                total_ops: 1,
                replayed_ops: 1,
                snapshot_revision: 0,
            };
            let json = serde_json::to_string(&resp).unwrap();
            let back: ReplayResponse = serde_json::from_str(&json).unwrap();
            assert_eq!(back.ops.len(), 1);
        }
    }

    // =========================================================================
    // 4. ReplayManager — construction
    // =========================================================================

    mod replay_manager {
        use super::*;

        #[test]
        fn new_manager_is_empty() {
            let mgr = ReplayManager::new("s".into());
            assert_eq!(mgr.active_session_count(), 0);
            assert!(mgr.active_client_ids().is_empty());
        }

        #[test]
        fn token_bound_to_session() {
            let doc = Document::new();
            let mut mgr = ReplayManager::new("my-sess".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            let token = ReplayToken::from_string_encoded(&resp.token).unwrap();
            assert_eq!(token.session_id, "my-sess");
        }
    }

    // =========================================================================
    // 5. Fresh join — full replay
    // =========================================================================

    mod replay_full {
        use super::*;

        #[test]
        fn fresh_join_receives_all_ops() {
            let doc = build_document(5);
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.replayed_ops, 5);
            assert_eq!(resp.ops.len(), 5);
            assert_eq!(resp.total_ops, 5);
        }

        #[test]
        fn fresh_join_empty_document() {
            let doc = Document::new();
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.replayed_ops, 0);
            assert!(resp.ops.is_empty());
        }

        #[test]
        fn fresh_join_multi_user_all_ops() {
            let doc = build_multi_user_document();
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.total_ops, 6);
            assert_eq!(resp.replayed_ops, 6);
        }

        #[test]
        fn fresh_join_causal_order() {
            let doc = build_multi_user_document();
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            let users: Vec<&str> = resp.ops.iter().map(|e| e.user_id.as_str()).collect();
            assert_eq!(
                users,
                vec!["alice", "alice", "alice", "bob", "bob", "carol"]
            );
            let revs: Vec<u64> = resp.ops.iter().map(|e| e.revision).collect();
            assert_eq!(revs, vec![0, 1, 2, 0, 1, 0]);
        }

        #[test]
        fn fresh_join_registers_session() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c1")
                .unwrap();
            assert!(mgr.has_active_session("c1"));
            assert_eq!(mgr.ops_sent_for("c1"), Some(3));
        }
    }

    // =========================================================================
    // 6. Token-based resume
    // =========================================================================

    mod replay_token_resume {
        use super::*;

        #[test]
        fn token_resume_only_new_ops() {
            let doc = build_document(5);
            let mut mgr = ReplayManager::new("s".into());
            let resp1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp1.replayed_ops, 5);

            let mut doc2 = Document::new();
            for i in 0..8 {
                doc2.apply_model_op(
                    make_insert_op(text_path(0, 0, i), &format!("op_{i}")),
                    "alice",
                    "s",
                );
            }

            let resp2 = mgr
                .replay(&ReplayRequest::with_token(resp1.token), &doc2, "c")
                .unwrap();
            assert_eq!(resp2.replayed_ops, 3); // alice/5,6,7
            assert_eq!(resp2.total_ops, 8);
        }

        #[test]
        fn token_resume_up_to_date() {
            let doc = build_document(5);
            let mut mgr = ReplayManager::new("s".into());
            let resp1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            let resp2 = mgr
                .replay(&ReplayRequest::with_token(resp1.token), &doc, "c")
                .unwrap();
            assert_eq!(resp2.replayed_ops, 0);
            assert!(resp2.ops.is_empty());
        }

        #[test]
        fn token_resume_new_user_detected() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            let resp1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();

            let mut doc2 = build_document(3);
            doc2.apply_model_op(make_insert_op(text_path(1, 0, 0), "b0"), "bob", "s");
            doc2.apply_model_op(make_insert_op(text_path(1, 0, 1), "b1"), "bob", "s");

            let resp2 = mgr
                .replay(&ReplayRequest::with_token(resp1.token), &doc2, "c")
                .unwrap();
            assert_eq!(resp2.replayed_ops, 2); // bob/0, bob/1
            let users: Vec<&str> = resp2.ops.iter().map(|e| e.user_id.as_str()).collect();
            assert_eq!(users, vec!["bob", "bob"]);
        }

        #[test]
        fn token_resume_multi_user_delta() {
            let doc = build_multi_user_document();
            let mut mgr = ReplayManager::new("s".into());
            let resp1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp1.replayed_ops, 6);

            let mut doc2 = build_multi_user_document();
            doc2.apply_model_op(make_insert_op(text_path(0, 0, 3), "a3"), "alice", "s");
            doc2.apply_model_op(make_insert_op(text_path(1, 0, 2), "b2"), "bob", "s");
            doc2.apply_model_op(make_insert_op(text_path(3, 0, 0), "d0"), "dave", "s");

            let resp2 = mgr
                .replay(&ReplayRequest::with_token(resp1.token), &doc2, "c")
                .unwrap();
            assert_eq!(resp2.replayed_ops, 3);
            let users: Vec<&str> = resp2.ops.iter().map(|e| e.user_id.as_str()).collect();
            assert_eq!(users, vec!["alice", "bob", "dave"]);
        }

        #[test]
        fn token_rejects_cross_session() {
            let doc = build_document(3);
            let mut mgr1 = ReplayManager::new("A".into());
            let resp = mgr1
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            let mut mgr2 = ReplayManager::new("B".into());
            let err = mgr2.replay(&ReplayRequest::with_token(resp.token), &doc, "c");
            assert!(matches!(err.unwrap_err(), ReplayError::InvalidToken(_)));
        }

        #[test]
        fn token_rejects_future_revision() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            let mut revs = HashMap::new();
            revs.insert("alice".into(), 99u64);
            let token = ReplayToken::new(revs, "s".into(), 0);
            let err = mgr.replay(
                &ReplayRequest::with_token(token.to_string_encoded().unwrap()),
                &doc,
                "c",
            );
            let err = err.unwrap_err();
            match err {
                ReplayError::StaleToken {
                    user,
                    token_rev: 99,
                    doc_rev: 2,
                } => {
                    assert_eq!(user, "alice");
                }
                other => panic!("expected StaleToken, got {other:?}"),
            }
        }
    }

    // =========================================================================
    // 7. Session management
    // =========================================================================

    mod sessions {
        use super::*;

        #[test]
        fn complete_removes_session() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert!(mgr.has_active_session("c"));
            mgr.complete_replay("c").unwrap();
            assert!(!mgr.has_active_session("c"));
        }

        #[test]
        fn complete_nonexistent_errors() {
            let mut mgr = ReplayManager::new("s".into());
            assert!(matches!(
                mgr.complete_replay("x").unwrap_err(),
                ReplayError::NoSession { .. }
            ));
        }

        #[test]
        fn complete_twice_errors() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            mgr.complete_replay("c").unwrap();
            assert!(mgr.complete_replay("c").is_err());
        }

        #[test]
        fn multiple_concurrent_sessions() {
            let doc = build_document(5);
            let mut mgr = ReplayManager::new("s".into());
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c1")
                .unwrap();
            // c2 gets a token that covers same state, replays with 0 new ops
            let resp1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c2")
                .unwrap();
            let resp2 = mgr
                .replay(&ReplayRequest::with_token(resp1.token), &doc, "c2")
                .unwrap();
            assert_eq!(resp2.replayed_ops, 0);
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c3")
                .unwrap();
            assert_eq!(mgr.active_session_count(), 3);
            mgr.complete_replay("c2").unwrap();
            assert_eq!(mgr.active_session_count(), 2);
        }

        #[test]
        fn overwrite_same_client_session() {
            let doc = build_document(5);
            let mut mgr = ReplayManager::new("s".into());
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(mgr.ops_sent_for("c"), Some(5));
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(mgr.ops_sent_for("c"), Some(5));
            assert_eq!(mgr.active_session_count(), 1);
        }
    }

    // =========================================================================
    // 8. Serde and Clone
    // =========================================================================

    mod serde_clone {
        use super::*;

        #[test]
        fn manager_serde_roundtrip() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            let json = serde_json::to_string(&mgr).unwrap();
            let back: ReplayManager = serde_json::from_str(&json).unwrap();
            assert_eq!(back.active_session_count(), 1);
        }

        #[test]
        fn manager_clone_preserves() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            mgr.replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            let cloned = mgr.clone();
            assert_eq!(cloned.active_session_count(), 1);
        }
    }

    // =========================================================================
    // 9. 3rd-client catches up — acceptance scenario
    // =========================================================================

    mod third_client {
        use super::*;

        #[test]
        fn third_client_catches_up() {
            let mut doc = Document::new();
            doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "Hello"), "alice", "s");
            doc.apply_model_op(make_insert_op(text_path(1, 0, 0), "World"), "bob", "s");
            doc.apply_model_op(make_insert_op(text_path(0, 0, 5), "!"), "alice", "s");
            doc.apply_model_op(
                make_format_op(Range::new(text_path(0, 0, 0), text_path(0, 0, 6))),
                "bob",
                "s",
            );
            assert_eq!(doc.op_count(), 4);

            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "carol")
                .unwrap();
            assert_eq!(resp.replayed_ops, 4);
            // Ops in insertion order (apply_model_op doesn't sort)
            let users: Vec<&str> = resp.ops.iter().map(|e| e.user_id.as_str()).collect();
            assert_eq!(users, vec!["alice", "bob", "alice", "bob"]);

            let token = ReplayToken::from_string_encoded(&resp.token).unwrap();
            assert_eq!(token.session_id, "s");

            doc.apply_model_op(
                make_insert_op(text_path(2, 0, 0), "Carol was here"),
                "carol",
                "s",
            );
            assert_eq!(doc.op_count(), 5);
            assert!(doc.has_op("carol", 0));
        }

        #[test]
        fn disconnect_reconnect() {
            let mut mgr = ReplayManager::new("s".into());
            let mut doc = Document::new();
            doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "a0"), "alice", "s");
            doc.apply_model_op(make_insert_op(text_path(0, 0, 1), "a1"), "alice", "s");
            doc.apply_model_op(make_insert_op(text_path(0, 0, 2), "a2"), "alice", "s");
            doc.apply_model_op(make_insert_op(text_path(1, 0, 0), "b0"), "bob", "s");
            doc.apply_model_op(make_insert_op(text_path(1, 0, 1), "b1"), "bob", "s");

            let resp1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "carol")
                .unwrap();
            assert_eq!(resp1.replayed_ops, 5);
            let carol_token = resp1.token;
            mgr.complete_replay("carol").unwrap();

            // More edits
            doc.apply_model_op(make_insert_op(text_path(0, 0, 3), "a3"), "alice", "s");
            doc.apply_model_op(make_insert_op(text_path(1, 0, 2), "b2"), "bob", "s");
            doc.apply_model_op(make_insert_op(text_path(2, 0, 0), "c0"), "carol_other", "s");

            let resp2 = mgr
                .replay(&ReplayRequest::with_token(carol_token), &doc, "carol")
                .unwrap();
            // Token knew alice:2, bob:1. New: alice/3, bob/2, carol_other/0 (unknown user)
            assert_eq!(resp2.replayed_ops, 3);
            assert_eq!(resp2.total_ops, 8);
        }

        #[test]
        fn replayed_ops_converge() {
            let mut doc = Document::new();
            doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "Hello"), "alice", "s");
            doc.apply_model_op(make_insert_op(text_path(0, 0, 5), " World"), "bob", "s");

            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "carol")
                .unwrap();

            let mut carol_doc = Document::new();
            for env in &resp.ops {
                carol_doc.push_op(env.clone()).unwrap();
            }

            assert_eq!(carol_doc.op_count(), doc.op_count());
            for i in 0..doc.op_count() {
                assert_eq!(carol_doc.ops()[i].user_id, doc.ops()[i].user_id);
            }

            let before = carol_doc.op_count();
            carol_doc.merge_from(&doc);
            assert_eq!(carol_doc.op_count(), before); // already converged
        }
    }

    // =========================================================================
    // 10. Different op types
    // =========================================================================

    mod op_types {
        use super::*;

        #[test]
        fn replay_all_op_types() {
            let mut doc = Document::new();
            doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "Hello"), "alice", "s");
            doc.apply_model_op(
                make_delete_op(text_path(0, 0, 2), text_path(0, 0, 4)),
                "alice",
                "s",
            );
            doc.apply_model_op(
                make_format_op(Range::new(text_path(0, 0, 0), text_path(0, 0, 3))),
                "bob",
                "s",
            );
            doc.apply_model_op(
                ModelOp::Move {
                    from: text_path(0, 0, 0),
                    to: text_path(1, 0, 0),
                },
                "carol",
                "s",
            );

            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.ops.len(), 4);
        }

        #[test]
        fn replay_table_path_ops() {
            let mut doc = Document::new();
            doc.apply_model_op(
                ModelOp::Insert {
                    at: table_path(0, 2, 1, 0, 0, 5),
                    content: "cell".into(),
                },
                "alice",
                "s",
            );
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.ops.len(), 1);
        }

        #[test]
        fn replay_sheet_path_ops() {
            let mut doc = Document::new();
            doc.apply_model_op(
                ModelOp::Replace {
                    at: Path::Sheet {
                        sheet: "Revenue".into(),
                        row: 10,
                        col: 3,
                    },
                    content: "42000".into(),
                },
                "alice",
                "s",
            );
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.ops.len(), 1);
        }
    }

    // =========================================================================
    // 11. Errors
    // =========================================================================

    mod errors {
        use super::*;

        #[test]
        fn stale_token_display() {
            let err = ReplayError::StaleToken {
                user: "alice".into(),
                token_rev: 100,
                doc_rev: 50,
            };
            let msg = err.to_string();
            assert!(msg.contains("alice") && msg.contains("100") && msg.contains("50"));
        }

        #[test]
        fn error_equality() {
            let a = ReplayError::StaleToken {
                user: "u".into(),
                token_rev: 10,
                doc_rev: 5,
            };
            let b = ReplayError::StaleToken {
                user: "u".into(),
                token_rev: 10,
                doc_rev: 5,
            };
            assert_eq!(a, b);
        }
    }

    // =========================================================================
    // 12. Helper functions
    // =========================================================================

    mod helpers {
        use super::*;

        #[test]
        fn empty_document_head_zero() {
            assert_eq!(compute_global_head(&Document::new()), 0);
        }

        #[test]
        fn head_is_global_max() {
            let doc = build_document(5);
            assert_eq!(compute_global_head(&doc), 4);
        }

        #[test]
        fn compute_user_revisions_multi() {
            let doc = build_multi_user_document();
            let revs = compute_user_revisions(&doc);
            assert_eq!(revs.get("alice"), Some(&2));
            assert_eq!(revs.get("bob"), Some(&1));
            assert_eq!(revs.get("carol"), Some(&0));
        }
    }

    // =========================================================================
    // 13. Unicode safety
    // =========================================================================

    mod unicode {
        use super::*;

        #[test]
        fn replay_preserves_emoji() {
            let mut doc = Document::new();
            doc.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 0),
                    content: "A😀B한글".into(),
                },
                "alice",
                "s",
            );
            doc.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 6),
                    content: "🎉".into(),
                },
                "bob",
                "s",
            );

            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.ops.len(), 2);
            if let ModelOp::Insert { content, .. } = &resp.ops[0].op {
                assert_eq!(content, "A😀B한글");
            }
        }

        #[test]
        fn unicode_session_id() {
            let doc = build_document(1);
            let mut mgr = ReplayManager::new("sesión".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            let token = ReplayToken::from_string_encoded(&resp.token).unwrap();
            assert_eq!(token.session_id, "sesión");
        }
    }

    // =========================================================================
    // 14. Edge cases
    // =========================================================================

    mod edge_cases {
        use super::*;

        #[test]
        fn single_op() {
            let mut doc = Document::new();
            doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "x"), "alice", "s");
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.replayed_ops, 1);
        }

        #[test]
        fn large_ops() {
            let mut doc = Document::new();
            for i in 0..100u64 {
                doc.apply_model_op(
                    make_insert_op(text_path(0, 0, i as usize), "x"),
                    "alice",
                    "s",
                );
            }
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.replayed_ops, 100);
        }

        #[test]
        fn empty_content_insert() {
            let mut doc = Document::new();
            doc.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 0),
                    content: String::new(),
                },
                "a",
                "s",
            );
            let mut mgr = ReplayManager::new("s".into());
            let resp = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            assert_eq!(resp.ops.len(), 1);
        }

        #[test]
        fn at_exact_head_no_new_ops() {
            let doc = build_document(5);
            let mut mgr = ReplayManager::new("s".into());
            let resp1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "c")
                .unwrap();
            // Same document, same token → 0 new ops
            let resp2 = mgr
                .replay(&ReplayRequest::with_token(resp1.token), &doc, "c")
                .unwrap();
            assert_eq!(resp2.replayed_ops, 0);
        }
    }

    // =========================================================================
    // 15. Token uniqueness
    // =========================================================================

    mod token_uniqueness {
        use super::*;

        #[test]
        fn tokens_unique_per_issuance() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            let r1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "a")
                .unwrap();
            let r2 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "b")
                .unwrap();
            let t1 = ReplayToken::from_string_encoded(&r1.token).unwrap();
            let t2 = ReplayToken::from_string_encoded(&r2.token).unwrap();
            assert_ne!(t1.sequence, t2.sequence);
            assert_ne!(t1, t2);
        }

        #[test]
        fn sequence_increments() {
            let doc = build_document(3);
            let mut mgr = ReplayManager::new("s".into());
            let r1 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "a")
                .unwrap();
            let r2 = mgr
                .replay(&ReplayRequest::from_revision(0), &doc, "b")
                .unwrap();
            let t1 = ReplayToken::from_string_encoded(&r1.token).unwrap();
            let t2 = ReplayToken::from_string_encoded(&r2.token).unwrap();
            assert!(t2.sequence > t1.sequence);
        }
    }
}
