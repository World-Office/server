//! coauthoring-service/src/document.rs — Collaborative document backed by ModelOp op-log
//!
//! Replaces the diamond-types plain-text CRDT with a structured operation log
//! carrying [`wo_common::ModelOp`] payloads. Each session has one `Document`;
//! multiple clients (agents) append operations concurrently. Merging two
//! replicas combines their op-logs with deterministic conflict resolution
//! (agent-order + revision) so all replicas converge to the same sequence.
//!
//! This is the foundation for CO-2: structured collaborative editing over
//! path-addressed document models rather than plain text.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::model_op::ModelOpEnvelope;
use wo_common::ModelOp;

// ---------------------------------------------------------------------------
// Document — structured op-log collaborative document
// ---------------------------------------------------------------------------

/// A collaborative document backed by an ordered op-log of [`ModelOp`]
/// envelopes.
///
/// Each session has one `Document`. Clients (agents) append [`ModelOpEnvelope`]
/// entries; the server merges op-logs from independent replicas for
/// convergence. Conflicting inserts at the same [`wo_common::Path`] are
/// resolved deterministically by agent registration order then revision.
///
/// # Invariants
///
/// - **INV-1:** `ops` is strictly ordered by `(user_id, revision)` after
///   every merge. Direct appends (no merge) are always appended to the end.
/// - **INV-2:** No duplicate entries: `(user_id, revision)` is unique.
/// - **INV-3:** Agent IDs are stable across the session lifetime: re-registering
///   the same `user_id` returns the same `AgentId`.
/// - **INV-4:** `ops_since(rev)` returns ops in causal order (same as `ops`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    /// Ordered op-log of all operations applied to this document.
    /// Each entry is a [`ModelOpEnvelope`] carrying a [`ModelOp`] with
    /// session metadata and causal ordering.
    ops: Vec<ModelOpEnvelope>,

    /// Maps `user_id` → deterministic ordering index for conflict resolution.
    /// Lower index = earlier in merge ordering when two agents produce ops at
    /// the same revision level.
    agent_map: HashMap<String, u32>,

    /// Monotonically increasing counter for assigning agent ordering indices.
    agent_counter: u32,
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}

impl Document {
    /// Create a new empty collaborative document with an empty op-log.
    pub fn new() -> Self {
        Self {
            ops: Vec::new(),
            agent_map: HashMap::new(),
            agent_counter: 0,
        }
    }

    // -----------------------------------------------------------------------
    // Agent registration
    // -----------------------------------------------------------------------

    /// Register a user as an agent in this document.
    ///
    /// Returns the deterministic ordering index assigned to this user.
    /// If the user was already registered, returns the existing index.
    ///
    /// Agent indices are used for deterministic conflict resolution during
    /// merge: when two agents produce ops at the same path, the agent with
    /// the lower index appears first in the merged op-log.
    pub fn register_agent(&mut self, user_id: &str) -> u32 {
        if let Some(&id) = self.agent_map.get(user_id) {
            return id;
        }
        let id = self.agent_counter;
        self.agent_map.insert(user_id.to_string(), id);
        self.agent_counter += 1;
        id
    }

    /// Get the agent ordering index for a user, if registered.
    pub fn agent_index(&self, user_id: &str) -> Option<u32> {
        self.agent_map.get(user_id).copied()
    }

    // -----------------------------------------------------------------------
    // Op application
    // -----------------------------------------------------------------------

    /// Append a pre-built [`ModelOpEnvelope`] to the op-log.
    ///
    /// The agent for the envelope's `user_id` is registered automatically.
    /// The envelope is validated (version check) before insertion; invalid
    /// envelopes are rejected with an error.
    ///
    /// Returns `Ok(())` on success, or an error description on failure.
    pub fn push_op(&mut self, envelope: ModelOpEnvelope) -> Result<(), String> {
        // Validate wire schema version
        envelope.validate_version().map_err(|e| e.to_string())?;

        // Register the agent (idempotent)
        self.register_agent(&envelope.user_id);

        // Dedup: reject if we already have this (user_id, revision) pair
        let is_dup = self
            .ops
            .iter()
            .any(|o| o.user_id == envelope.user_id && o.revision == envelope.revision);
        if is_dup {
            return Err(format!(
                "duplicate op: user={}, revision={}",
                envelope.user_id, envelope.revision
            ));
        }

        self.ops.push(envelope);
        Ok(())
    }

    /// Convenience: apply a [`ModelOp`] by wrapping it in a new envelope.
    ///
    /// Creates a [`ModelOpEnvelope`] with auto-generated version, timestamp,
    /// and the next revision for this user, then appends it to the op-log.
    ///
    /// Returns the revision number assigned to this op.
    pub fn apply_model_op(&mut self, op: ModelOp, user_id: &str, session_id: &str) -> u64 {
        self.register_agent(user_id);
        let revision = self.next_revision_for(user_id);
        let envelope =
            ModelOpEnvelope::new(session_id.to_string(), user_id.to_string(), revision, op);
        // Unwrap is safe: we just created the envelope with correct version
        self.ops.push(envelope);
        revision
    }

    /// Compute the next revision number for a given user.
    ///
    /// Scans the op-log for the highest revision from this user and
    /// returns `max + 1`. Returns 0 if the user has no prior ops.
    fn next_revision_for(&self, user_id: &str) -> u64 {
        self.ops
            .iter()
            .filter(|o| o.user_id == user_id)
            .map(|o| o.revision)
            .max()
            .map(|r| r + 1)
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Op-log access
    // -----------------------------------------------------------------------

    /// Read-only access to the full op-log.
    pub fn ops(&self) -> &[ModelOpEnvelope] {
        &self.ops
    }

    /// Total number of operations in the log.
    pub fn op_count(&self) -> usize {
        self.ops.len()
    }

    /// Return all operations since a given revision number, in causal order.
    ///
    /// "Since" means operations with `revision > rev` from **any** user.
    /// This is used for late-join replay (CO-4).
    pub fn ops_since(&self, rev: u64) -> Vec<&ModelOpEnvelope> {
        self.ops.iter().filter(|o| o.revision > rev).collect()
    }

    /// Check whether the op-log contains an entry for the given
    /// `(user_id, revision)` pair.
    pub fn has_op(&self, user_id: &str, revision: u64) -> bool {
        self.ops
            .iter()
            .any(|o| o.user_id == user_id && o.revision == revision)
    }

    // -----------------------------------------------------------------------
    // Merge — replication between independent replicas
    // -----------------------------------------------------------------------

    /// Merge another document's op-log into this one.
    ///
    /// Collects ops from `other` that this document does not already have
    /// (identified by `(user_id, revision)`), appends them, then re-sorts
    /// the entire op-log by `(agent_order, revision)` for deterministic
    /// conflict resolution.
    ///
    /// # Conflict resolution
    ///
    /// When two agents produce ops at the same revision (e.g., concurrent
    /// inserts at the same [`wo_common::Path`]), they are ordered
    /// lexicographically by `user_id` for deterministic convergence.
    /// This ensures any two replicas that merge the same set of ops
    /// produce identical op-log ordering regardless of local registration order.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let mut doc_a = Document::new();
    /// let mut doc_b = Document::new();
    ///
    /// // Both insert at the same path
    /// doc_a.apply_model_op(ModelOp::Insert { .. }, "alice", "s1");
    /// doc_b.apply_model_op(ModelOp::Insert { .. }, "bob", "s1");
    ///
    /// // Merge: both ops present, deterministic order
    /// doc_a.merge_from(&doc_b);
    /// assert_eq!(doc_a.op_count(), 2);
    /// ```
    pub fn merge_from(&mut self, other: &Document) {
        // Register any agents from `other` that we don't know yet.
        // This ensures deterministic ordering even for agents first
        // seen during merge.
        for user_id in other.agent_map.keys() {
            self.register_agent(user_id);
        }

        // Collect ops from other that we don't already have.
        let existing: HashSet<(String, u64)> = self
            .ops
            .iter()
            .map(|o| (o.user_id.clone(), o.revision))
            .collect();

        let new_ops: Vec<ModelOpEnvelope> = other
            .ops
            .iter()
            .filter(|o| !existing.contains(&(o.user_id.clone(), o.revision)))
            .cloned()
            .collect();

        if new_ops.is_empty() {
            return;
        }

        // Extend and re-sort by (agent_order, revision) for deterministic
        // conflict resolution.
        self.ops.extend(new_ops);
        self.sort_ops();
    }

    /// Sort the op-log by `(user_id, revision)`.
    ///
    /// After sorting, ops from the same agent are in revision order,
    /// and ops from different agents are ordered lexicographically by
    /// user_id. This ensures deterministic convergence: any two replicas
    /// that merge the same set of ops will produce identical ordering
    /// regardless of which agents were registered first locally.
    fn sort_ops(&mut self) {
        self.ops.sort_by(|a, b| {
            // Primary sort: user_id (lexicographic, deterministic across replicas).
            // Secondary sort: revision (causal order within a user).
            a.user_id
                .cmp(&b.user_id)
                .then_with(|| a.revision.cmp(&b.revision))
        });
    }

    // -----------------------------------------------------------------------
    // Serialization for network transport
    // -----------------------------------------------------------------------

    /// Serialize the entire op-log to JSON.
    ///
    /// Used for late-join replay (CO-4) and persistence.
    pub fn serialize_ops(&self) -> Result<String, String> {
        serde_json::to_string(&self.ops).map_err(|e| e.to_string())
    }

    /// Deserialize an op-log from JSON, replacing the current one.
    ///
    /// Used for late-join replay when a new client receives the full
    /// op-log from the server.
    pub fn load_ops(&mut self, json: &str) -> Result<(), String> {
        let ops: Vec<ModelOpEnvelope> = serde_json::from_str(json).map_err(|e| e.to_string())?;
        for op in &ops {
            op.validate_version().map_err(|e| e.to_string())?;
            self.register_agent(&op.user_id);
        }
        self.ops = ops;
        self.sort_ops();
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use wo_common::{Path, Range};

    // --- Helpers -------------------------------------------------------------

    fn text_path(para: usize, run: usize, char: usize) -> Path {
        Path::Text { para, run, char }
    }

    fn text_range(para: usize, start_char: usize, end_char: usize) -> Range {
        Range::new(text_path(para, 0, start_char), text_path(para, 0, end_char))
    }

    fn make_insert_op(at: Path, content: &str) -> ModelOp {
        ModelOp::Insert {
            at,
            content: content.to_string(),
        }
    }

    #[allow(dead_code)]
    fn make_delete_op(start: Path, end: Path) -> ModelOp {
        ModelOp::Delete {
            range: Range::new(start, end),
        }
    }

    fn make_format_op(range: Range, bold: bool) -> ModelOp {
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".into(), serde_json::json!(bold));
        ModelOp::Format { range, attrs }
    }

    // =========================================================================
    // 1. Construction and basic state
    // =========================================================================

    #[test]
    fn new_document_is_empty() {
        let doc = Document::new();
        assert!(doc.ops().is_empty());
        assert_eq!(doc.op_count(), 0);
    }

    #[test]
    fn default_is_empty() {
        let doc = Document::default();
        assert_eq!(doc.op_count(), 0);
    }

    // =========================================================================
    // 2. Agent registration
    // =========================================================================

    #[test]
    fn register_agent_assigns_sequential_ids() {
        let mut doc = Document::new();
        let a = doc.register_agent("alice");
        let b = doc.register_agent("bob");
        assert_eq!(a, 0);
        assert_eq!(b, 1);
    }

    #[test]
    fn register_agent_idempotent() {
        let mut doc = Document::new();
        let id1 = doc.register_agent("alice");
        let id2 = doc.register_agent("alice");
        assert_eq!(id1, id2);
    }

    #[test]
    fn agent_index_returns_none_for_unknown() {
        let doc = Document::new();
        assert!(doc.agent_index("nobody").is_none());
    }

    #[test]
    fn agent_index_returns_correct_value() {
        let mut doc = Document::new();
        doc.register_agent("alice");
        assert_eq!(doc.agent_index("alice"), Some(0));
    }

    // =========================================================================
    // 3. apply_model_op — single ops
    // =========================================================================

    #[test]
    fn apply_model_op_returns_revision_zero() {
        let mut doc = Document::new();
        let rev = doc.apply_model_op(
            make_insert_op(text_path(0, 0, 0), "Hello"),
            "alice",
            "sess-1",
        );
        assert_eq!(rev, 0);
        assert_eq!(doc.op_count(), 1);
    }

    #[test]
    fn apply_model_op_increments_revision() {
        let mut doc = Document::new();
        let r1 = doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "A"), "alice", "sess-1");
        let r2 = doc.apply_model_op(make_insert_op(text_path(0, 0, 1), "B"), "alice", "sess-1");
        assert_eq!(r1, 0);
        assert_eq!(r2, 1);
        assert_eq!(doc.op_count(), 2);
    }

    #[test]
    fn apply_model_op_registers_agent() {
        let mut doc = Document::new();
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "x"), "carol", "sess-1");
        assert_eq!(doc.agent_index("carol"), Some(0));
    }

    #[test]
    fn apply_model_op_stores_envelope_with_correct_metadata() {
        let mut doc = Document::new();
        doc.apply_model_op(
            make_insert_op(text_path(3, 1, 14), "Hello"),
            "alice",
            "sess-1",
        );
        let op = &doc.ops()[0];
        assert_eq!(op.user_id, "alice");
        assert_eq!(op.session_id, "sess-1");
        assert_eq!(op.revision, 0);
        assert_eq!(op.version, crate::model_op::WIRE_SCHEMA_VERSION);
    }

    #[test]
    fn apply_model_op_stores_correct_model_op() {
        let mut doc = Document::new();
        doc.apply_model_op(make_insert_op(text_path(2, 0, 5), "world"), "bob", "sess-1");
        if let ModelOp::Insert { at, content } = &doc.ops()[0].op {
            assert_eq!(*at, text_path(2, 0, 5));
            assert_eq!(content, "world");
        } else {
            panic!("expected Insert op");
        }
    }

    // =========================================================================
    // 4. Multiple users interleaved
    // =========================================================================

    #[test]
    fn two_users_separate_revisions() {
        let mut doc = Document::new();
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "a"), "alice", "s");
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "b"), "bob", "s");
        doc.apply_model_op(make_insert_op(text_path(0, 0, 1), "c"), "alice", "s");
        assert_eq!(doc.op_count(), 3);

        // Alice's revisions: 0, 1
        assert!(doc.has_op("alice", 0));
        assert!(doc.has_op("alice", 1));
        assert!(!doc.has_op("alice", 2));

        // Bob's revision: 0
        assert!(doc.has_op("bob", 0));
        assert!(!doc.has_op("bob", 1));
    }

    // =========================================================================
    // 5. push_op — dedup
    // =========================================================================

    #[test]
    fn push_op_rejects_duplicate() {
        let mut doc = Document::new();
        let env = ModelOpEnvelope::new(
            "s".into(),
            "alice".into(),
            0,
            make_insert_op(text_path(0, 0, 0), "x"),
        );
        assert!(doc.push_op(env.clone()).is_ok());
        // Same user + revision: rejected
        let err = doc.push_op(env).unwrap_err();
        assert!(err.contains("duplicate op"));
        assert_eq!(doc.op_count(), 1);
    }

    #[test]
    fn push_op_rejects_bad_version() {
        let mut doc = Document::new();
        let mut env = ModelOpEnvelope::new(
            "s".into(),
            "alice".into(),
            0,
            make_insert_op(text_path(0, 0, 0), "x"),
        );
        env.version = 99; // bad version
        let err = doc.push_op(env).unwrap_err();
        assert!(err.contains("unsupported wire schema version"));
        assert_eq!(doc.op_count(), 0);
    }

    #[test]
    fn push_op_allows_different_users_same_revision() {
        let mut doc = Document::new();
        let a = ModelOpEnvelope::new(
            "s".into(),
            "alice".into(),
            0,
            make_insert_op(text_path(0, 0, 0), "a"),
        );
        let b = ModelOpEnvelope::new(
            "s".into(),
            "bob".into(),
            0,
            make_insert_op(text_path(0, 0, 0), "b"),
        );
        assert!(doc.push_op(a).is_ok());
        assert!(doc.push_op(b).is_ok());
        assert_eq!(doc.op_count(), 2);
    }

    // =========================================================================
    // 6. ops_since
    // =========================================================================

    #[test]
    fn ops_since_returns_empty_when_no_ops() {
        let doc = Document::new();
        assert!(doc.ops_since(0).is_empty());
    }

    #[test]
    fn ops_since_returns_all_ops_for_rev_zero() {
        let mut doc = Document::new();
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "a"), "alice", "s");
        doc.apply_model_op(make_insert_op(text_path(0, 0, 1), "b"), "alice", "s");
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "c"), "bob", "s");
        // All ops have revision >= 1 (alice has 0,1 and bob has 0)
        // ops_since(0) returns ops with revision > 0
        let since = doc.ops_since(0);
        // alice rev 1 is > 0
        assert_eq!(since.len(), 1);
        assert_eq!(since[0].revision, 1);
    }

    #[test]
    fn ops_since_returns_nothing_for_future_rev() {
        let mut doc = Document::new();
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "x"), "alice", "s");
        assert!(doc.ops_since(100).is_empty());
    }

    // =========================================================================
    // 7. Serialization
    // =========================================================================

    #[test]
    fn serialize_and_load_roundtrip() {
        let mut doc = Document::new();
        doc.apply_model_op(
            make_insert_op(text_path(0, 0, 0), "Hello"),
            "alice",
            "sess-1",
        );
        doc.apply_model_op(make_format_op(text_range(0, 0, 5), true), "bob", "sess-1");

        let json = doc.serialize_ops().unwrap();

        let mut doc2 = Document::new();
        doc2.load_ops(&json).unwrap();

        assert_eq!(doc2.op_count(), 2);
        assert!(doc2.has_op("alice", 0));
        assert!(doc2.has_op("bob", 0));
    }

    #[test]
    fn load_ops_rejects_bad_version() {
        let mut doc = Document::new();
        let bad_json = r#"[{"version":99,"session_id":"s","user_id":"u","revision":0,"timestamp":"2026-01-01T00:00:00+00:00","op":"insert","at":{"kind":"text","para":0,"run":0,"char":0},"content":"x"}]"#;
        let err = doc.load_ops(bad_json).unwrap_err();
        assert!(err.contains("unsupported wire schema version"));
    }

    #[test]
    fn load_ops_sorts_by_user_id() {
        let mut doc = Document::new();
        // JSON has bob before alice, but after sort alice should come first
        // (lexicographic: "alice" < "bob")
        let json = r#"[
            {"version":1,"session_id":"s","user_id":"bob","revision":0,"timestamp":"2026-01-01T00:00:00+00:00","op":"insert","at":{"kind":"text","para":0,"run":0,"char":0},"content":"B"},
            {"version":1,"session_id":"s","user_id":"alice","revision":0,"timestamp":"2026-01-01T00:00:01+00:00","op":"insert","at":{"kind":"text","para":0,"run":0,"char":0},"content":"A"}
        ]"#;
        doc.load_ops(json).unwrap();
        // Lexicographic: alice < bob
        assert_eq!(doc.ops()[0].user_id, "alice");
        assert_eq!(doc.ops()[1].user_id, "bob");
    }

    // =========================================================================
    // MERGE TESTS — acceptance gate: cargo test -p coauthoring-service merge::
    // =========================================================================

    mod merge {
        use super::*;
        use std::collections::BTreeMap;
        use wo_common::{ModelOp, Path, Range};

        fn text_path(para: usize, run: usize, char: usize) -> Path {
            Path::Text { para, run, char }
        }

        // --- Merge: two replicas with conflicting inserts at the same path ---

        #[test]
        fn two_replicas_conflicting_inserts_both_preserved() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            // Both insert at the same path concurrently
            doc_a.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 5),
                    content: "aaa".into(),
                },
                "alice",
                "sess-1",
            );
            doc_b.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 5),
                    content: "bbb".into(),
                },
                "bob",
                "sess-1",
            );

            // Before merge: each has 1 op
            assert_eq!(doc_a.op_count(), 1);
            assert_eq!(doc_b.op_count(), 1);

            // Merge b into a
            doc_a.merge_from(&doc_b);

            // Both ops must be present
            assert_eq!(doc_a.op_count(), 2, "merged doc must have both ops");
            assert!(
                doc_a.has_op("alice", 0),
                "alice's insert must be present after merge"
            );
            assert!(
                doc_a.has_op("bob", 0),
                "bob's insert must be present after merge"
            );
        }

        #[test]
        fn two_replicas_conflicting_inserts_deterministic_order() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 0),
                    content: "from_alice".into(),
                },
                "alice",
                "s",
            );
            doc_b.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 0),
                    content: "from_bob".into(),
                },
                "bob",
                "s",
            );

            doc_a.merge_from(&doc_b);

            // After merge, both docs should have the same op sequence
            assert_eq!(doc_a.op_count(), 2);

            // Deterministic ordering: lexicographic by user_id.
            // "alice" < "bob" lexicographically, so alice comes first.
            let first_user = &doc_a.ops()[0].user_id;
            let second_user = &doc_a.ops()[1].user_id;
            assert_eq!(
                first_user, "alice",
                "alice should come first (lexicographic order)"
            );
            assert_eq!(
                second_user, "bob",
                "bob should come second (lexicographic order)"
            );

            // Verify convergence: merge the other direction too
            doc_b.merge_from(&doc_a);
            assert_eq!(doc_b.op_count(), 2);
            assert_eq!(&doc_b.ops()[0].user_id, "alice");
            assert_eq!(&doc_b.ops()[1].user_id, "bob");
        }

        // --- Merge: three replicas ---

        #[test]
        fn three_way_merge_preserves_all_ops() {
            let mut doc1 = Document::new();
            let mut doc2 = Document::new();
            let mut doc3 = Document::new();

            // Shared initial op
            doc1.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 0),
                    content: "X".into(),
                },
                "alice",
                "s",
            );
            // Share initial state
            doc2.merge_from(&doc1);
            doc3.merge_from(&doc1);

            assert_eq!(doc1.op_count(), 1);
            assert_eq!(doc2.op_count(), 1);
            assert_eq!(doc3.op_count(), 1);

            // All three insert at the same path concurrently
            doc1.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 1),
                    content: "A".into(),
                },
                "alice",
                "s",
            );
            doc2.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 1),
                    content: "B".into(),
                },
                "bob",
                "s",
            );
            doc3.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 1),
                    content: "C".into(),
                },
                "carol",
                "s",
            );

            // Merge all into doc1
            doc1.merge_from(&doc2);
            doc1.merge_from(&doc3);

            // All ops must be present: initial + 3 concurrent = 4
            assert_eq!(
                doc1.op_count(),
                4,
                "merged doc must have initial + 3 concurrent ops"
            );

            // Verify all three users' concurrent ops are present
            assert!(doc1.has_op("alice", 1));
            assert!(doc1.has_op("bob", 0));
            assert!(doc1.has_op("carol", 0));

            // Verify order: lexicographic by user_id, then revision.
            let users: Vec<&str> = doc1.ops().iter().map(|o| o.user_id.as_str()).collect();
            // alice has 2 ops (rev 0 and 1), bob has 1, carol has 1
            // After sort by (user_id, revision):
            //   alice/0, alice/1, bob/0, carol/0
            assert_eq!(users, vec!["alice", "alice", "bob", "carol"]);
        }

        // --- Merge: empty doc ---

        #[test]
        fn merge_empty_doc_is_noop() {
            let mut doc = Document::new();
            doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "Hello"), "alice", "s");
            let empty = Document::new();

            let count_before = doc.op_count();
            doc.merge_from(&empty);
            assert_eq!(
                doc.op_count(),
                count_before,
                "merging empty should be a no-op"
            );
        }

        #[test]
        fn merge_into_empty_doc_copies_all_ops() {
            let mut empty = Document::new();
            let mut source = Document::new();
            source.apply_model_op(make_insert_op(text_path(0, 0, 0), "A"), "alice", "s");
            source.apply_model_op(make_insert_op(text_path(0, 0, 1), "B"), "bob", "s");

            empty.merge_from(&source);
            assert_eq!(empty.op_count(), 2);
            assert!(empty.has_op("alice", 0));
            assert!(empty.has_op("bob", 0));
        }

        // --- Merge: idempotent (no duplicates) ---

        #[test]
        fn merge_same_doc_twice_no_duplicates() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(make_insert_op(text_path(0, 0, 0), "x"), "alice", "s");
            doc_b.merge_from(&doc_a);

            // doc_b now has alice's op. Merge again.
            doc_b.merge_from(&doc_a);
            assert_eq!(
                doc_b.op_count(),
                1,
                "merging same doc twice must not duplicate ops"
            );
        }

        // --- Merge: bidirectional convergence ---

        #[test]
        fn bidirectional_merge_converges() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 0),
                    content: "A".into(),
                },
                "alice",
                "s",
            );
            doc_b.apply_model_op(
                ModelOp::Insert {
                    at: text_path(1, 0, 0),
                    content: "B".into(),
                },
                "bob",
                "s",
            );

            doc_a.merge_from(&doc_b);
            doc_b.merge_from(&doc_a);

            // Both must have the same ops
            assert_eq!(
                doc_a.op_count(),
                doc_b.op_count(),
                "both docs must converge"
            );
            assert_eq!(doc_a.op_count(), 2);

            // Same order
            for i in 0..doc_a.op_count() {
                assert_eq!(
                    doc_a.ops()[i].user_id,
                    doc_b.ops()[i].user_id,
                    "op order must match at index {i}"
                );
                assert_eq!(
                    doc_a.ops()[i].revision,
                    doc_b.ops()[i].revision,
                    "revision must match at index {i}"
                );
            }
        }

        // --- Merge: mixed op types ---

        #[test]
        fn merge_preserves_all_op_types() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 0),
                    content: "Hello".into(),
                },
                "alice",
                "s",
            );
            doc_b.apply_model_op(
                ModelOp::Delete {
                    range: Range::new(text_path(0, 0, 0), text_path(0, 0, 5)),
                },
                "bob",
                "s",
            );
            doc_a.apply_model_op(
                {
                    let mut attrs = BTreeMap::new();
                    attrs.insert("bold".into(), serde_json::json!(true));
                    ModelOp::Format {
                        range: Range::new(text_path(0, 0, 0), text_path(0, 0, 5)),
                        attrs,
                    }
                },
                "alice",
                "s",
            );
            doc_b.apply_model_op(
                ModelOp::Move {
                    from: text_path(0, 0, 0),
                    to: text_path(1, 0, 0),
                },
                "bob",
                "s",
            );

            doc_a.merge_from(&doc_b);

            assert_eq!(doc_a.op_count(), 4, "all 4 ops must be present");
            let op_types: Vec<&str> = doc_a
                .ops()
                .iter()
                .map(|env| match &env.op {
                    ModelOp::Insert { .. } => "insert",
                    ModelOp::Delete { .. } => "delete",
                    ModelOp::Format { .. } => "format",
                    ModelOp::Move { .. } => "move",
                    ModelOp::Replace { .. } => "replace",
                })
                .collect();
            assert!(op_types.contains(&"insert"));
            assert!(op_types.contains(&"delete"));
            assert!(op_types.contains(&"format"));
            assert!(op_types.contains(&"move"));
        }

        // --- Merge: concurrent insert and delete ---

        #[test]
        fn concurrent_insert_and_delete_both_preserved() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(
                ModelOp::Insert {
                    at: text_path(0, 0, 2),
                    content: "X".into(),
                },
                "alice",
                "s",
            );
            doc_b.apply_model_op(
                ModelOp::Delete {
                    range: Range::new(text_path(0, 0, 1), text_path(0, 0, 4)),
                },
                "bob",
                "s",
            );

            doc_a.merge_from(&doc_b);

            assert_eq!(doc_a.op_count(), 2);
            assert!(doc_a.has_op("alice", 0));
            assert!(doc_a.has_op("bob", 0));
        }

        // --- Merge: agent registration during merge ---

        #[test]
        fn merge_registers_unknown_agents() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(make_insert_op(text_path(0, 0, 0), "a"), "alice", "s");
            doc_b.apply_model_op(make_insert_op(text_path(0, 0, 0), "b"), "bob", "s");

            // doc_a doesn't know about bob yet
            assert!(doc_a.agent_index("bob").is_none());

            doc_a.merge_from(&doc_b);

            // After merge, bob should be registered
            assert_eq!(doc_a.agent_index("bob"), Some(1));
            assert_eq!(doc_a.agent_index("alice"), Some(0));
        }

        // --- Merge: cross-table and sheet paths ---

        #[test]
        fn merge_with_table_path_ops() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(
                ModelOp::Insert {
                    at: Path::Table {
                        table: 0,
                        row: 2,
                        cell: 1,
                        para: 0,
                        run: 0,
                        char: 5,
                    },
                    content: "cell_a".into(),
                },
                "alice",
                "s",
            );
            doc_b.apply_model_op(
                ModelOp::Insert {
                    at: Path::Table {
                        table: 0,
                        row: 2,
                        cell: 1,
                        para: 0,
                        run: 0,
                        char: 5,
                    },
                    content: "cell_b".into(),
                },
                "bob",
                "s",
            );

            doc_a.merge_from(&doc_b);
            assert_eq!(doc_a.op_count(), 2);
        }

        #[test]
        fn merge_with_sheet_path_ops() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(
                ModelOp::Replace {
                    at: Path::Sheet {
                        sheet: "Revenue".into(),
                        row: 10,
                        col: 3,
                    },
                    content: "42".into(),
                },
                "alice",
                "s",
            );
            doc_b.apply_model_op(
                ModelOp::Format {
                    range: Range::new(
                        Path::Sheet {
                            sheet: "Revenue".into(),
                            row: 10,
                            col: 3,
                        },
                        Path::Sheet {
                            sheet: "Revenue".into(),
                            row: 10,
                            col: 5,
                        },
                    ),
                    attrs: BTreeMap::new(),
                },
                "bob",
                "s",
            );

            doc_a.merge_from(&doc_b);
            assert_eq!(doc_a.op_count(), 2);
        }

        // --- Merge: serialization roundtrip after merge ---

        #[test]
        fn merge_then_serialize_and_load_converges() {
            let mut doc_a = Document::new();
            let mut doc_b = Document::new();

            doc_a.apply_model_op(make_insert_op(text_path(0, 0, 0), "Hello"), "alice", "s");
            doc_b.apply_model_op(make_insert_op(text_path(0, 0, 5), " world"), "bob", "s");
            doc_a.merge_from(&doc_b);

            let json = doc_a.serialize_ops().unwrap();

            let mut doc_c = Document::new();
            doc_c.load_ops(&json).unwrap();

            assert_eq!(doc_c.op_count(), 2);
            assert!(doc_c.has_op("alice", 0));
            assert!(doc_c.has_op("bob", 0));

            // Same order
            for i in 0..doc_a.op_count() {
                assert_eq!(
                    doc_a.ops()[i].user_id,
                    doc_c.ops()[i].user_id,
                    "order must match after serialize/load at index {i}"
                );
            }
        }

        // --- Merge: large number of concurrent ops ---

        #[test]
        fn merge_ten_concurrent_agents() {
            let mut doc_a = Document::new();
            let mut others: Vec<Document> = Vec::new();

            // Doc a: alice inserts
            doc_a.apply_model_op(make_insert_op(text_path(0, 0, 0), "base"), "alice", "s");

            // 10 other agents each insert at the same path
            for i in 1..=10u32 {
                let mut other = Document::new();
                other.merge_from(&doc_a); // start from same base
                other.apply_model_op(
                    make_insert_op(text_path(0, 0, 4), &format!("op_{i}")),
                    &format!("agent_{i}"),
                    "s",
                );
                others.push(other);
            }

            // Merge all into doc_a
            for other in &others {
                doc_a.merge_from(other);
            }

            // base + 10 agents = 11 ops
            assert_eq!(
                doc_a.op_count(),
                11,
                "base + 10 concurrent agents should produce 11 ops"
            );

            // Every agent's op must be present
            for i in 1..=10u32 {
                assert!(
                    doc_a.has_op(&format!("agent_{i}"), 0),
                    "agent_{i}'s op must be present"
                );
            }
        }
    }

    // =========================================================================
    // 8. Unicode safety
    // =========================================================================

    #[test]
    fn unicode_content_preserved_in_op_log() {
        let mut doc = Document::new();
        doc.apply_model_op(
            ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: "A😀B한글🧑\u{200D}💻".into(),
            },
            "alice",
            "s",
        );
        if let ModelOp::Insert { content, .. } = &doc.ops()[0].op {
            assert_eq!(content.chars().count(), 8);
            assert_eq!(content, "A😀B한글🧑\u{200D}💻");
        } else {
            panic!("expected Insert");
        }
    }

    #[test]
    fn unicode_merge_preserves_content() {
        let mut doc_a = Document::new();
        let mut doc_b = Document::new();

        doc_a.apply_model_op(
            ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: "안녕하세요".into(),
            },
            "alice",
            "s",
        );
        doc_b.apply_model_op(
            ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: "😊🎉".into(),
            },
            "bob",
            "s",
        );

        doc_a.merge_from(&doc_b);
        assert_eq!(doc_a.op_count(), 2);

        // Verify emoji content survived
        let bob_op = doc_a.ops().iter().find(|o| o.user_id == "bob").unwrap();
        if let ModelOp::Insert { content, .. } = &bob_op.op {
            assert_eq!(content.chars().count(), 2);
        } else {
            panic!("expected Insert");
        }
    }

    // =========================================================================
    // 9. Debug format
    // =========================================================================

    #[test]
    fn debug_format_shows_op_count() {
        let mut doc = Document::new();
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "x"), "alice", "s");
        let debug = format!("{doc:?}");
        assert!(debug.contains("Document"));
    }

    // =========================================================================
    // 10. Clone
    // =========================================================================

    #[test]
    fn clone_preserves_state() {
        let mut doc = Document::new();
        doc.apply_model_op(make_insert_op(text_path(0, 0, 0), "test"), "alice", "s");
        let cloned = doc.clone();
        assert_eq!(cloned.op_count(), doc.op_count());
        assert_eq!(cloned.ops()[0].user_id, doc.ops()[0].user_id);
    }
}
