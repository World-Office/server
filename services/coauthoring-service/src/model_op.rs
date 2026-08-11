// coauthoring-service/src/model_op.rs — ModelOp wire schema + version field
//
// Defines the collaboration wire envelope that wraps `wo_common::ModelOp`
// with session metadata, revision tracking, and protocol versioning.
// This is the top-level JSON structure sent/received over WebSocket
// between clients and the coauthoring service for the new path-addressed
// mutation engine.
//
// Wire format example (Insert):
// ```json
// {
//   "version": 1,
//   "session_id": "abc-123",
//   "user_id": "alice",
//   "revision": 42,
//   "timestamp": "2026-07-25T10:30:00+00:00",
//   "op": "insert",
//   "at": { "kind": "text", "para": 3, "run": 1, "char": 14 },
//   "content": "Hello"
// }
// ```

use chrono::Utc;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use wo_common::ModelOp;

// ---------------------------------------------------------------------------
// Wire schema version
// ---------------------------------------------------------------------------

/// Wire schema version. Increment on any **breaking** change to the
/// [`ModelOpEnvelope`] JSON shape (added/removed/renamed fields, changed
/// semantics). The coauthoring service rejects envelopes with a non-matching
/// version via [`EnvelopeError::VersionMismatch`].
pub const WIRE_SCHEMA_VERSION: u32 = 1;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors produced during envelope validation or deserialization.
#[derive(Debug, Error, PartialEq)]
pub enum EnvelopeError {
    /// The envelope's `version` field does not match the expected
    /// [`WIRE_SCHEMA_VERSION`].
    #[error("unsupported wire schema version: got {got}, expected {expected}")]
    VersionMismatch { got: u32, expected: u32 },

    /// The envelope could not be parsed from JSON.
    #[error("invalid envelope JSON: {0}")]
    InvalidJson(String),
}

// ---------------------------------------------------------------------------
// ModelOpEnvelope — collaboration wire message
// ---------------------------------------------------------------------------

/// Collaboration wire envelope wrapping a [`ModelOp`] with session metadata,
/// causal ordering (revision), and protocol versioning.
///
/// This is the unit of exchange on the coauthoring WebSocket for the new
/// path-addressed mutation engine. Every edit from a client is wrapped in
/// this envelope; the server strips metadata, applies the inner `ModelOp`
/// to the CRDT, and re-broadcasts the envelope to other participants.
///
/// # Versioning
///
/// The `version` field **must** equal [`WIRE_SCHEMA_VERSION`]. Deserialization
/// succeeds regardless (to allow inspection), but [`validate_version`]
/// rejects mismatched versions. This lets the server return a meaningful
/// error instead of a silent misinterpretation.
///
/// [`validate_version`]: ModelOpEnvelope::validate_version
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelOpEnvelope {
    /// Wire schema version. MUST equal [`WIRE_SCHEMA_VERSION`].
    pub version: u32,

    /// Session this operation belongs to.
    pub session_id: String,

    /// User who authored this operation.
    pub user_id: String,

    /// Monotonically increasing revision for causal ordering within a session.
    /// The server may reject out-of-order revisions.
    pub revision: u64,

    /// ISO 8601 timestamp of when the client authored the op (wall clock).
    pub timestamp: String,

    /// The underlying model operation. Flattened so its tagged-enum fields
    /// (e.g. `"op": "insert"`, `"at": {...}`, `"content": "..."`) appear at
    /// the same level as the envelope metadata.
    #[serde(flatten)]
    pub op: ModelOp,
}

impl ModelOpEnvelope {
    /// Create a new envelope with the current [`WIRE_SCHEMA_VERSION`] and
    /// an auto-generated UTC timestamp.
    pub fn new(
        session_id: String,
        user_id: String,
        revision: u64,
        op: ModelOp,
    ) -> Self {
        Self {
            version: WIRE_SCHEMA_VERSION,
            session_id,
            user_id,
            revision,
            timestamp: Utc::now().to_rfc3339(),
            op,
        }
    }

    /// Validate the `version` field against [`WIRE_SCHEMA_VERSION`].
    ///
    /// Call this **after** deserialization to reject unsupported protocol
    /// versions with a clear error.
    pub fn validate_version(&self) -> Result<(), EnvelopeError> {
        if self.version != WIRE_SCHEMA_VERSION {
            return Err(EnvelopeError::VersionMismatch {
                got: self.version,
                expected: WIRE_SCHEMA_VERSION,
            });
        }
        Ok(())
    }

    /// Deserialize from a JSON string and validate the version.
    ///
    /// Returns [`EnvelopeError::InvalidJson`] on parse failure or
    /// [`EnvelopeError::VersionMismatch`] on version mismatch.
    pub fn from_json(json: &str) -> Result<Self, EnvelopeError> {
        let envelope: Self =
            serde_json::from_str(json).map_err(|e| EnvelopeError::InvalidJson(e.to_string()))?;
        envelope.validate_version()?;
        Ok(envelope)
    }

    /// Serialize to a compact JSON string.
    pub fn to_json(&self) -> Result<String, EnvelopeError> {
        serde_json::to_string(self).map_err(|e| EnvelopeError::InvalidJson(e.to_string()))
    }

    /// Serialize to a pretty-printed JSON string (for diagnostics).
    pub fn to_json_pretty(&self) -> Result<String, EnvelopeError> {
        serde_json::to_string_pretty(self).map_err(|e| EnvelopeError::InvalidJson(e.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod model_op_schema {
    use super::*;
    use std::collections::BTreeMap;
    use std::str::FromStr;
    use wo_common::{ModelOp, Path, Range};

    // --- Helpers -------------------------------------------------------------

    fn text_path(para: usize, run: usize, char: usize) -> Path {
        Path::Text { para, run, char }
    }

    fn text_range(para: usize, start_char: usize, end_char: usize) -> Range {
        Range::new(
            text_path(para, 0, start_char),
            text_path(para, 0, end_char),
        )
    }

    fn make_insert_envelope(revision: u64) -> ModelOpEnvelope {
        ModelOpEnvelope::new(
            "sess-1".into(),
            "alice".into(),
            revision,
            ModelOp::Insert {
                at: text_path(3, 1, 14),
                content: "Hello".into(),
            },
        )
    }

    // =========================================================================
    // 1. Version constant
    // =========================================================================

    #[test]
    fn wire_schema_version_is_one() {
        assert_eq!(WIRE_SCHEMA_VERSION, 1);
    }

    // =========================================================================
    // 2. Constructor sets correct version
    // =========================================================================

    #[test]
    fn new_sets_current_version() {
        let env = make_insert_envelope(1);
        assert_eq!(env.version, WIRE_SCHEMA_VERSION);
    }

    #[test]
    fn new_sets_session_and_user() {
        let env = make_insert_envelope(5);
        assert_eq!(env.session_id, "sess-1");
        assert_eq!(env.user_id, "alice");
        assert_eq!(env.revision, 5);
    }

    #[test]
    fn new_generates_timestamp() {
        let env = make_insert_envelope(0);
        // Timestamp should be non-empty and parseable
        assert!(!env.timestamp.is_empty());
        // Verify it parses as ISO 8601
        let _ = chrono::DateTime::<chrono::Utc>::from_str(&env.timestamp)
            .expect("timestamp should be valid ISO 8601");
    }

    // =========================================================================
    // 3. Version validation
    // =========================================================================

    #[test]
    fn validate_version_accepts_current() {
        let env = make_insert_envelope(0);
        assert!(env.validate_version().is_ok());
    }

    #[test]
    fn validate_version_rejects_zero() {
        let mut env = make_insert_envelope(0);
        env.version = 0;
        let err = env.validate_version().unwrap_err();
        assert_eq!(
            err,
            EnvelopeError::VersionMismatch {
                got: 0,
                expected: WIRE_SCHEMA_VERSION,
            }
        );
    }

    #[test]
    fn validate_version_rejects_future() {
        let mut env = make_insert_envelope(0);
        env.version = 99;
        let err = env.validate_version().unwrap_err();
        assert_eq!(
            err,
            EnvelopeError::VersionMismatch {
                got: 99,
                expected: WIRE_SCHEMA_VERSION,
            }
        );
    }

    #[test]
    fn validate_version_error_display() {
        let err = EnvelopeError::VersionMismatch {
            got: 2,
            expected: 1,
        };
        let msg = err.to_string();
        assert!(msg.contains("got 2"));
        assert!(msg.contains("expected 1"));
    }

    // =========================================================================
    // 4. JSON round-trip — all op variants
    // =========================================================================

    #[test]
    fn json_roundtrip_insert() {
        let env = make_insert_envelope(1);
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }

    #[test]
    fn json_roundtrip_delete() {
        let env = ModelOpEnvelope::new(
            "sess-2".into(),
            "bob".into(),
            10,
            ModelOp::Delete {
                range: text_range(1, 3, 7),
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }

    #[test]
    fn json_roundtrip_replace() {
        let env = ModelOpEnvelope::new(
            "sess-3".into(),
            "carol".into(),
            20,
            ModelOp::Replace {
                at: text_path(0, 0, 0),
                content: "new text".into(),
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }

    #[test]
    fn json_roundtrip_format() {
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".into(), serde_json::json!(true));
        attrs.insert("font_size".into(), serde_json::json!(24));
        let env = ModelOpEnvelope::new(
            "sess-4".into(),
            "dave".into(),
            30,
            ModelOp::Format {
                range: text_range(2, 0, 5),
                attrs,
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }

    #[test]
    fn json_roundtrip_move() {
        let env = ModelOpEnvelope::new(
            "sess-5".into(),
            "eve".into(),
            40,
            ModelOp::Move {
                from: text_path(0, 0, 0),
                to: text_path(1, 0, 5),
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }

    // =========================================================================
    // 5. Wire format — flat JSON structure
    // =========================================================================

    #[test]
    fn wire_format_is_flat_json() {
        let env = make_insert_envelope(1);
        let val = serde_json::to_value(&env).unwrap();
        // Envelope metadata at top level
        assert_eq!(val["version"], 1);
        assert_eq!(val["session_id"], "sess-1");
        assert_eq!(val["user_id"], "alice");
        assert_eq!(val["revision"], 1);
        assert!(val["timestamp"].is_string());
        // ModelOp flattened at same level
        assert_eq!(val["op"], "insert");
        assert_eq!(val["at"]["kind"], "text");
        assert_eq!(val["at"]["para"], 3);
        assert_eq!(val["at"]["run"], 1);
        assert_eq!(val["at"]["char"], 14);
        assert_eq!(val["content"], "Hello");
    }

    #[test]
    fn wire_format_delete_flat() {
        let env = ModelOpEnvelope::new(
            "s".into(),
            "u".into(),
            0,
            ModelOp::Delete {
                range: text_range(1, 0, 10),
            },
        );
        let val = serde_json::to_value(&env).unwrap();
        assert_eq!(val["op"], "delete");
        assert_eq!(val["range"]["start"]["kind"], "text");
        assert_eq!(val["range"]["end"]["char"], 10);
    }

    #[test]
    fn wire_format_format_flat() {
        let mut attrs = BTreeMap::new();
        attrs.insert("italic".into(), serde_json::json!(true));
        let env = ModelOpEnvelope::new(
            "s".into(),
            "u".into(),
            0,
            ModelOp::Format {
                range: text_range(0, 2, 8),
                attrs,
            },
        );
        let val = serde_json::to_value(&env).unwrap();
        assert_eq!(val["op"], "format");
        assert_eq!(val["attrs"]["italic"], true);
    }

    // =========================================================================
    // 6. from_json / to_json helpers
    // =========================================================================

    #[test]
    fn from_json_valid() {
        let env = make_insert_envelope(42);
        let json = env.to_json().unwrap();
        let back = ModelOpEnvelope::from_json(&json).unwrap();
        assert_eq!(env, back);
    }

    #[test]
    fn from_json_rejects_version_mismatch() {
        let mut env = make_insert_envelope(0);
        env.version = 0;
        let json = serde_json::to_string(&env).unwrap();
        let err = ModelOpEnvelope::from_json(&json).unwrap_err();
        assert_eq!(
            err,
            EnvelopeError::VersionMismatch {
                got: 0,
                expected: WIRE_SCHEMA_VERSION,
            }
        );
    }

    #[test]
    fn from_json_rejects_malformed() {
        let err = ModelOpEnvelope::from_json("not json at all").unwrap_err();
        assert!(matches!(err, EnvelopeError::InvalidJson(_)));
    }

    #[test]
    fn from_json_rejects_empty_object() {
        let err = ModelOpEnvelope::from_json("{}").unwrap_err();
        assert!(matches!(err, EnvelopeError::InvalidJson(_)));
    }

    #[test]
    fn to_json_pretty() {
        let env = make_insert_envelope(0);
        let pretty = env.to_json_pretty().unwrap();
        assert!(pretty.contains('\n'));
        let back: ModelOpEnvelope = serde_json::from_str(&pretty).unwrap();
        assert_eq!(env, back);
    }

    // =========================================================================
    // 7. Table path in envelope
    // =========================================================================

    #[test]
    fn envelope_with_table_path_roundtrips() {
        let env = ModelOpEnvelope::new(
            "sess-t".into(),
            "user-t".into(),
            7,
            ModelOp::Insert {
                at: Path::Table {
                    table: 0,
                    row: 2,
                    cell: 1,
                    para: 0,
                    run: 0,
                    char: 5,
                },
                content: "cell text".into(),
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }

    #[test]
    fn envelope_with_sheet_path_roundtrips() {
        let env = ModelOpEnvelope::new(
            "sess-s".into(),
            "user-s".into(),
            3,
            ModelOp::Delete {
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
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }

    // =========================================================================
    // 8. Unicode safety — content with multi-byte chars
    // =========================================================================

    #[test]
    fn envelope_unicode_content_roundtrips() {
        let env = ModelOpEnvelope::new(
            "sess-u".into(),
            "user-u".into(),
            0,
            ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: "A😀B한글🧑‍💻".into(),
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(back.op, env.op);
        if let ModelOp::Insert { content, .. } = &back.op {
            // 3 emojis / graphemes spread across many codepoints
            assert_eq!(content.chars().count(), 8);
            assert_eq!(content, "A😀B한글🧑\u{200D}💻");
        } else {
            panic!("expected Insert op");
        }
    }

    #[test]
    fn envelope_unicode_format_attrs_roundtrips() {
        let mut attrs = BTreeMap::new();
        attrs.insert("font".into(), serde_json::json!("나눔고딕"));
        let env = ModelOpEnvelope::new(
            "sess-u2".into(),
            "user-u2".into(),
            0,
            ModelOp::Format {
                range: text_range(0, 0, 3),
                attrs,
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }

    // =========================================================================
    // 9. Envelope equality
    // =========================================================================

    #[test]
    fn equality_identical_envelopes() {
        let env = make_insert_envelope(5);
        // Clone to avoid timestamp drift between two separate `new()` calls
        let clone = env.clone();
        assert_eq!(env, clone);
    }

    #[test]
    fn inequality_different_revision() {
        let a = make_insert_envelope(5);
        let b = make_insert_envelope(6);
        assert_ne!(a, b);
    }

    #[test]
    fn inequality_different_user() {
        let a = ModelOpEnvelope::new(
            "s".into(),
            "alice".into(),
            1,
            ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: "x".into(),
            },
        );
        let b = ModelOpEnvelope::new(
            "s".into(),
            "bob".into(),
            1,
            ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: "x".into(),
            },
        );
        assert_ne!(a, b);
    }

    #[test]
    fn inequality_different_op_variant() {
        let a = ModelOpEnvelope::new(
            "s".into(),
            "u".into(),
            1,
            ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: "x".into(),
            },
        );
        let b = ModelOpEnvelope::new(
            "s".into(),
            "u".into(),
            1,
            ModelOp::Delete {
                range: text_range(0, 0, 1),
            },
        );
        assert_ne!(a, b);
    }

    // =========================================================================
    // 10. Clone
    // =========================================================================

    #[test]
    fn clone_is_deep_copy() {
        let env = make_insert_envelope(10);
        let cloned = env.clone();
        assert_eq!(env, cloned);
    }

    // =========================================================================
    // 11. Debug format
    // =========================================================================

    #[test]
    fn debug_contains_key_fields() {
        let env = make_insert_envelope(0);
        let debug = format!("{env:?}");
        assert!(debug.contains("ModelOpEnvelope"));
        assert!(debug.contains("sess-1"));
        assert!(debug.contains("alice"));
    }

    // =========================================================================
    // 12. EnvelopeError equality and display
    // =========================================================================

    #[test]
    fn envelope_error_invalid_json_equality() {
        let a = EnvelopeError::InvalidJson("bad".into());
        let b = EnvelopeError::InvalidJson("bad".into());
        assert_eq!(a, b);
    }

    #[test]
    fn envelope_error_invalid_json_display() {
        let err = EnvelopeError::InvalidJson("unexpected token".into());
        assert!(err.to_string().contains("invalid envelope JSON"));
        assert!(err.to_string().contains("unexpected token"));
    }

    // =========================================================================
    // 13. Empty / edge-case field values
    // =========================================================================

    #[test]
    fn envelope_with_empty_session_id() {
        let env = ModelOpEnvelope::new(
            String::new(),
            "u".into(),
            0,
            ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: String::new(),
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(back.session_id, "");
        assert_eq!(back.op, env.op);
    }

    #[test]
    fn envelope_with_large_revision() {
        let env = make_insert_envelope(u64::MAX);
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(back.revision, u64::MAX);
    }

    // =========================================================================
    // 14. Format attrs — empty map
    // =========================================================================

    #[test]
    fn envelope_format_empty_attrs_roundtrips() {
        let env = ModelOpEnvelope::new(
            "s".into(),
            "u".into(),
            0,
            ModelOp::Format {
                range: text_range(0, 0, 3),
                attrs: BTreeMap::new(),
            },
        );
        let json = serde_json::to_string(&env).unwrap();
        let back: ModelOpEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(env, back);
    }
}
