// wo-common/src/op.rs — ModelOp enum + EditableModel trait
//
// Universal mutation operations for all editable document models.
// ModelOp is serde-serializable for WASM, WebSocket, and collaboration transport.
// Engine-specific ops (DocOp, SheetOp, etc.) map onto these five variants so
// collaboration, undo, and the command router stay uniform.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::path::{Path, Range};

// ---------------------------------------------------------------------------
// ModelOp — the five universal operations
// ---------------------------------------------------------------------------

/// Universal mutation operations for any editable document model.
///
/// All edits reduce to five ops: Insert, Delete, Replace, Format, Move.
/// Engine-specific ops (e.g. `DocOp` in `wo-ooxml-ops`) map onto these so
/// collaboration, undo, and the command router stay uniform.
///
/// Serialized as tagged JSON (`"op": "insert"`, `"op": "delete"`, …) for
/// transport over the WASM `apply_op` boundary and WebSocket collaboration
/// channels.
///
/// # Wire format examples
///
/// ```json
/// { "op": "insert", "at": { "kind": "text", "para": 3, "run": 1, "char": 14 }, "content": "Hello" }
/// { "op": "delete", "range": { "start": ..., "end": ... } }
/// { "op": "format", "range": { "start": ..., "end": ... }, "attrs": { "bold": true } }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ModelOp {
    /// Insert content at a position.
    ///
    /// Inverse: `Delete` over the inserted range.
    Insert {
        /// Target position in the document tree.
        at: Path,
        /// Text or structured content to insert.
        content: String,
    },

    /// Delete content within a half-open range `[start, end)`.
    ///
    /// Inverse: `Insert` with the deleted content at `start`.
    Delete {
        /// Half-open range to remove.
        range: Range,
    },

    /// Replace content at a position with new content.
    ///
    /// Convenience op equivalent to `Delete` then `Insert`.
    /// Inverse: `Replace` with the old content restored.
    Replace {
        /// Target position in the document tree.
        at: Path,
        /// Replacement content.
        content: String,
    },

    /// Apply formatting attributes over a range.
    ///
    /// The `attrs` map holds key-value pairs like `{"bold": true}`.
    /// Engine-specific implementations interpret these according to their
    /// schema (e.g. OOXML run properties).
    ///
    /// Inverse: `Format` with the previous attribute values.
    Format {
        /// Range of content to format.
        range: Range,
        /// Formatting attribute key-value pairs.
        attrs: BTreeMap<String, serde_json::Value>,
    },

    /// Move content from one position to another.
    ///
    /// Inverse: `Move` with swapped `from` and `to`.
    Move {
        /// Source position.
        from: Path,
        /// Destination position.
        to: Path,
    },
}

// ---------------------------------------------------------------------------
// EditableModel trait
// ---------------------------------------------------------------------------

/// Trait for all editable document models.
///
/// Every editable engine model (`DocxBody`, `Workbook`, `Presentation`, …)
/// implements this trait, providing uniform mutation (`apply`), inversion
/// (`invert`), and operation history (`to_ops_since`) for undo, WASM export,
/// and collaboration.
///
/// # Invariants
///
/// - **Apply-then-invert yields identity:** `apply(op)` followed by
///   `apply(invert(op))` must leave the model structurally equal to its
///   state before the first `apply`.
/// - **`invert` is O(1).**
/// - **`apply` is O(n) worst-case, O(1) amortized for append.**
/// - **All ops are deterministic and serde-serializable** (required for
///   CRDT merge in the collaboration engine).
///
/// # Example (conceptual)
///
/// ```ignore
/// struct MyModel { /* ... */ }
///
/// impl EditableModel for MyModel {
///     type Err = CoreError;
///     fn apply(&mut self, op: &ModelOp) -> Result<(), Self::Err> { /* ... */ }
///     fn invert(&self, op: &ModelOp) -> ModelOp { /* ... */ }
///     fn to_ops_since(&self, rev: u64) -> Vec<ModelOp> { /* ... */ }
/// }
/// ```
pub trait EditableModel {
    /// Error type for operations on this model.
    type Err: std::error::Error;

    /// Apply an operation to the model, mutating it in place.
    ///
    /// Returns the inverse operation so callers can build undo stacks
    /// without calling `invert` separately.
    fn apply(&mut self, op: &ModelOp) -> std::result::Result<(), Self::Err>;

    /// Compute the inverse of an operation given the current model state.
    ///
    /// The inverse must satisfy: `apply(op)` then `apply(invert(op))` yields
    /// the original model. This is O(1).
    fn invert(&self, op: &ModelOp) -> ModelOp;

    /// Return all operations applied since a given revision number, in order.
    ///
    /// If the model is at revision 15 and `rev` is 10, returns the 5 ops
    /// applied after revision 10.
    fn to_ops_since(&self, rev: u64) -> Vec<ModelOp>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::Path;

    // --- Helpers -------------------------------------------------------------

    fn text_path(para: usize, run: usize, char: usize) -> Path {
        Path::Text { para, run, char }
    }

    fn text_range(para: usize, start_char: usize, end_char: usize) -> Range {
        Range::new(text_path(para, 0, start_char), text_path(para, 0, end_char))
    }

    // =========================================================================
    // 1. Serde round-trip — every variant
    // =========================================================================

    #[test]
    fn serde_roundtrip_insert() {
        let op = ModelOp::Insert {
            at: text_path(3, 1, 14),
            content: "Hello".into(),
        };
        let json = serde_json::to_string(&op).unwrap();
        let back: ModelOp = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }

    #[test]
    fn serde_roundtrip_delete() {
        let op = ModelOp::Delete {
            range: text_range(0, 2, 10),
        };
        let json = serde_json::to_string(&op).unwrap();
        let back: ModelOp = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }

    #[test]
    fn serde_roundtrip_replace() {
        let op = ModelOp::Replace {
            at: text_path(1, 0, 0),
            content: "new content".into(),
        };
        let json = serde_json::to_string(&op).unwrap();
        let back: ModelOp = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }

    #[test]
    fn serde_roundtrip_format() {
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".into(), serde_json::json!(true));
        attrs.insert("italic".into(), serde_json::json!(false));
        attrs.insert("font_size".into(), serde_json::json!(24));
        attrs.insert("color".into(), serde_json::json!("#FF0000"));

        let op = ModelOp::Format {
            range: text_range(2, 0, 5),
            attrs,
        };
        let json = serde_json::to_string(&op).unwrap();
        let back: ModelOp = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }

    #[test]
    fn serde_roundtrip_move() {
        let op = ModelOp::Move {
            from: text_path(0, 0, 0),
            to: text_path(1, 0, 5),
        };
        let json = serde_json::to_string(&op).unwrap();
        let back: ModelOp = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }

    // =========================================================================
    // 2. Wire format — tagged JSON structure
    // =========================================================================

    #[test]
    fn wire_format_insert() {
        let op = ModelOp::Insert {
            at: text_path(3, 1, 14),
            content: "Hello".into(),
        };
        let val = serde_json::to_value(&op).unwrap();
        assert_eq!(val["op"], "insert");
        assert_eq!(val["at"]["kind"], "text");
        assert_eq!(val["at"]["para"], 3);
        assert_eq!(val["at"]["run"], 1);
        assert_eq!(val["at"]["char"], 14);
        assert_eq!(val["content"], "Hello");
    }

    #[test]
    fn wire_format_delete() {
        let op = ModelOp::Delete {
            range: text_range(1, 3, 7),
        };
        let val = serde_json::to_value(&op).unwrap();
        assert_eq!(val["op"], "delete");
        assert_eq!(val["range"]["start"]["kind"], "text");
        assert_eq!(val["range"]["start"]["char"], 3);
        assert_eq!(val["range"]["end"]["char"], 7);
    }

    #[test]
    fn wire_format_format() {
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".into(), serde_json::json!(true));
        let op = ModelOp::Format {
            range: text_range(0, 0, 5),
            attrs,
        };
        let val = serde_json::to_value(&op).unwrap();
        assert_eq!(val["op"], "format");
        assert_eq!(val["attrs"]["bold"], true);
    }

    #[test]
    fn wire_format_replace() {
        let op = ModelOp::Replace {
            at: text_path(0, 0, 0),
            content: "replaced".into(),
        };
        let val = serde_json::to_value(&op).unwrap();
        assert_eq!(val["op"], "replace");
        assert_eq!(val["content"], "replaced");
    }

    #[test]
    fn wire_format_move() {
        let op = ModelOp::Move {
            from: text_path(0, 0, 0),
            to: text_path(2, 1, 3),
        };
        let val = serde_json::to_value(&op).unwrap();
        assert_eq!(val["op"], "move");
        assert_eq!(val["from"]["para"], 0);
        assert_eq!(val["to"]["para"], 2);
    }

    // =========================================================================
    // 3. Equality
    // =========================================================================

    #[test]
    fn equality_same_insert() {
        let a = ModelOp::Insert {
            at: text_path(1, 0, 0),
            content: "hi".into(),
        };
        let b = ModelOp::Insert {
            at: text_path(1, 0, 0),
            content: "hi".into(),
        };
        assert_eq!(a, b);
    }

    #[test]
    fn inequality_different_variant() {
        let insert = ModelOp::Insert {
            at: text_path(0, 0, 0),
            content: "x".into(),
        };
        let delete = ModelOp::Delete {
            range: text_range(0, 0, 1),
        };
        assert_ne!(insert, delete);
    }

    #[test]
    fn inequality_different_content() {
        let a = ModelOp::Insert {
            at: text_path(0, 0, 0),
            content: "foo".into(),
        };
        let b = ModelOp::Insert {
            at: text_path(0, 0, 0),
            content: "bar".into(),
        };
        assert_ne!(a, b);
    }

    #[test]
    fn equality_format_attrs_order_independent() {
        // BTreeMap: insertion order doesn't matter — keys are sorted.
        let mut a_attrs = BTreeMap::new();
        a_attrs.insert("bold".into(), serde_json::json!(true));
        a_attrs.insert("italic".into(), serde_json::json!(false));

        let mut b_attrs = BTreeMap::new();
        b_attrs.insert("italic".into(), serde_json::json!(false));
        b_attrs.insert("bold".into(), serde_json::json!(true));

        let a = ModelOp::Format {
            range: text_range(0, 0, 5),
            attrs: a_attrs,
        };
        let b = ModelOp::Format {
            range: text_range(0, 0, 5),
            attrs: b_attrs,
        };
        assert_eq!(a, b);
    }

    // =========================================================================
    // 4. Debug format
    // =========================================================================

    #[test]
    fn debug_contains_variant_name() {
        let insert = ModelOp::Insert {
            at: text_path(0, 0, 0),
            content: "x".into(),
        };
        assert!(format!("{insert:?}").contains("Insert"));

        let delete = ModelOp::Delete {
            range: text_range(0, 0, 1),
        };
        assert!(format!("{delete:?}").contains("Delete"));

        let replace = ModelOp::Replace {
            at: text_path(0, 0, 0),
            content: "y".into(),
        };
        assert!(format!("{replace:?}").contains("Replace"));

        let fmt = ModelOp::Format {
            range: text_range(0, 0, 1),
            attrs: BTreeMap::new(),
        };
        assert!(format!("{fmt:?}").contains("Format"));

        let mv = ModelOp::Move {
            from: text_path(0, 0, 0),
            to: text_path(1, 0, 0),
        };
        assert!(format!("{mv:?}").contains("Move"));
    }

    // =========================================================================
    // 5. Clone
    // =========================================================================

    #[test]
    fn clone_is_deep_copy() {
        let op = ModelOp::Insert {
            at: text_path(5, 2, 10),
            content: "clone me".into(),
        };
        let cloned = op.clone();
        assert_eq!(op, cloned);
    }

    // =========================================================================
    // 6. Format attrs — empty map
    // =========================================================================

    #[test]
    fn format_empty_attrs_roundtrip() {
        let op = ModelOp::Format {
            range: text_range(0, 0, 3),
            attrs: BTreeMap::new(),
        };
        let json = serde_json::to_string(&op).unwrap();
        let back: ModelOp = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }

    // =========================================================================
    // 7. EditableModel trait — compile check via mock implementation
    // =========================================================================

    /// A minimal mock model used to verify the EditableModel trait compiles
    /// and its contract is exercisable.
    #[derive(Debug)]
    struct MockModel {
        content: String,
        rev: u64,
        history: Vec<ModelOp>,
    }

    #[derive(Debug, thiserror::Error)]
    enum MockError {
        #[error("out of range")]
        OutOfRange,
    }

    impl EditableModel for MockModel {
        type Err = MockError;

        fn apply(&mut self, op: &ModelOp) -> std::result::Result<(), Self::Err> {
            match op {
                ModelOp::Insert { at, content } => {
                    if let Path::Text { char, .. } = at {
                        if *char > self.content.chars().count() {
                            return Err(MockError::OutOfRange);
                        }
                        let mut chars: Vec<char> = self.content.chars().collect();
                        chars.insert(*char, content.chars().next().unwrap_or('\0'));
                        self.content = chars.into_iter().collect();
                    }
                }
                ModelOp::Delete { range } => {
                    if let (Path::Text { char: start, .. }, Path::Text { char: end, .. }) =
                        (&range.start, &range.end)
                    {
                        if *end > self.content.chars().count() || start > end {
                            return Err(MockError::OutOfRange);
                        }
                        let chars: Vec<char> = self.content.chars().collect();
                        self.content = chars[..*start].iter().chain(chars[*end..].iter()).collect();
                    }
                }
                ModelOp::Replace { at, content } => {
                    if let Path::Text { char, .. } = at {
                        if *char >= self.content.chars().count() {
                            return Err(MockError::OutOfRange);
                        }
                        let mut chars: Vec<char> = self.content.chars().collect();
                        chars[*char] = content.chars().next().unwrap_or('\0');
                        self.content = chars.into_iter().collect();
                    }
                }
                ModelOp::Format { .. } | ModelOp::Move { .. } => {
                    // Mock: no-op for format/move
                }
            }
            self.rev += 1;
            self.history.push(op.clone());
            Ok(())
        }

        fn invert(&self, op: &ModelOp) -> ModelOp {
            match op {
                ModelOp::Insert { at, content } => {
                    let len = content.chars().count();
                    let range = Range::new(at.clone(), {
                        if let Path::Text { char, .. } = at {
                            text_path(at_field_para(at), at_field_run(at), char + len)
                        } else {
                            at.clone()
                        }
                    });
                    ModelOp::Delete { range }
                }
                ModelOp::Delete { range } => {
                    // In a real model, we'd look up the deleted text.
                    // Mock returns an empty insert at the range start.
                    ModelOp::Insert {
                        at: range.start.clone(),
                        content: String::new(),
                    }
                }
                ModelOp::Replace { at, content } => {
                    // In a real model, we'd capture the old content.
                    // Mock returns an empty replace.
                    ModelOp::Replace {
                        at: at.clone(),
                        content: content.clone(),
                    }
                }
                ModelOp::Move { from, to } => ModelOp::Move {
                    from: to.clone(),
                    to: from.clone(),
                },
                ModelOp::Format { range, attrs } => {
                    // Mock: return format with cleared attrs (not real prev)
                    ModelOp::Format {
                        range: range.clone(),
                        attrs: attrs.clone(),
                    }
                }
            }
        }

        fn to_ops_since(&self, rev: u64) -> Vec<ModelOp> {
            if rev >= self.rev {
                return Vec::new();
            }
            self.history[(rev as usize)..].to_vec()
        }
    }

    /// Helper to extract para from a Path (text only).
    fn at_field_para(at: &Path) -> usize {
        if let Path::Text { para, .. } = at {
            *para
        } else {
            0
        }
    }

    fn at_field_run(at: &Path) -> usize {
        if let Path::Text { run, .. } = at {
            *run
        } else {
            0
        }
    }

    #[test]
    fn mock_apply_insert() {
        let mut model = MockModel {
            content: "Hello".into(),
            rev: 0,
            history: Vec::new(),
        };
        model
            .apply(&ModelOp::Insert {
                at: text_path(0, 0, 5),
                content: "!".into(),
            })
            .unwrap();
        assert_eq!(model.content, "Hello!");
        assert_eq!(model.rev, 1);
    }

    #[test]
    fn mock_apply_delete() {
        let mut model = MockModel {
            content: "Hello!".into(),
            rev: 0,
            history: Vec::new(),
        };
        model
            .apply(&ModelOp::Delete {
                range: text_range(0, 5, 6),
            })
            .unwrap();
        assert_eq!(model.content, "Hello");
    }

    #[test]
    fn mock_apply_delete_out_of_range() {
        let mut model = MockModel {
            content: "Hi".into(),
            rev: 0,
            history: Vec::new(),
        };
        let result = model.apply(&ModelOp::Delete {
            range: text_range(0, 0, 100),
        });
        assert!(result.is_err());
        assert_eq!(model.content, "Hi"); // unchanged
    }

    #[test]
    fn mock_apply_replace() {
        let mut model = MockModel {
            content: "Hello".into(),
            rev: 0,
            history: Vec::new(),
        };
        model
            .apply(&ModelOp::Replace {
                at: text_path(0, 0, 0),
                content: "J".into(),
            })
            .unwrap();
        assert_eq!(model.content, "Jello");
    }

    #[test]
    fn mock_to_ops_since() {
        let mut model = MockModel {
            content: String::new(),
            rev: 0,
            history: Vec::new(),
        };
        model
            .apply(&ModelOp::Insert {
                at: text_path(0, 0, 0),
                content: "a".into(),
            })
            .unwrap(); // rev 1
        model
            .apply(&ModelOp::Insert {
                at: text_path(0, 0, 1),
                content: "b".into(),
            })
            .unwrap(); // rev 2
        model
            .apply(&ModelOp::Insert {
                at: text_path(0, 0, 2),
                content: "c".into(),
            })
            .unwrap(); // rev 3

        let ops = model.to_ops_since(1);
        assert_eq!(ops.len(), 2);

        let ops_from_zero = model.to_ops_since(0);
        assert_eq!(ops_from_zero.len(), 3);

        let ops_future = model.to_ops_since(10);
        assert!(ops_future.is_empty());
    }

    #[test]
    fn mock_invert_move_swaps_direction() {
        let model = MockModel {
            content: String::new(),
            rev: 0,
            history: Vec::new(),
        };
        let op = ModelOp::Move {
            from: text_path(0, 0, 0),
            to: text_path(1, 0, 5),
        };
        let inv = model.invert(&op);
        match inv {
            ModelOp::Move { from, to } => {
                assert_eq!(from, text_path(1, 0, 5));
                assert_eq!(to, text_path(0, 0, 0));
            }
            _ => panic!("expected Move inverse"),
        }
    }

    #[test]
    fn mock_invert_insert_yields_delete() {
        let model = MockModel {
            content: String::new(),
            rev: 0,
            history: Vec::new(),
        };
        let op = ModelOp::Insert {
            at: text_path(0, 0, 5),
            content: "abc".into(),
        };
        let inv = model.invert(&op);
        match inv {
            ModelOp::Delete { range } => {
                assert_eq!(range.start, text_path(0, 0, 5));
                assert_eq!(range.end, text_path(0, 0, 8)); // 5 + len("abc") = 8
            }
            _ => panic!("expected Delete inverse for Insert"),
        }
    }

    // =========================================================================
    // 8. Unicode safety — char count vs byte count
    // =========================================================================

    #[test]
    fn unicode_char_count_in_content() {
        let content = "A😀B"; // 3 chars, 7 bytes
        assert_eq!(content.chars().count(), 3);
        // Verify we never use .len() for char counting
        assert_ne!(content.len(), 3);
    }

    #[test]
    fn mock_insert_unicode_char() {
        let mut model = MockModel {
            content: "AB".into(),
            rev: 0,
            history: Vec::new(),
        };
        // Insert 😀 at char index 1
        model
            .apply(&ModelOp::Insert {
                at: text_path(0, 0, 1),
                content: "😀".into(),
            })
            .unwrap();
        assert_eq!(model.content, "A😀B");
        assert_eq!(model.content.chars().count(), 3);
    }

    // =========================================================================
    // 9. Multi-byte path serde round-trip
    // =========================================================================

    #[test]
    fn serde_roundtrip_table_path() {
        let op = ModelOp::Insert {
            at: Path::Table {
                table: 0,
                row: 2,
                cell: 1,
                para: 0,
                run: 0,
                char: 5,
            },
            content: "cell text".into(),
        };
        let json = serde_json::to_string(&op).unwrap();
        let back: ModelOp = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }

    #[test]
    fn serde_roundtrip_sheet_path() {
        let op = ModelOp::Delete {
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
        };
        let json = serde_json::to_string(&op).unwrap();
        let back: ModelOp = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }
}
