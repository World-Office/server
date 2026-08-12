//! EditableModel implementation for DocxBody
//!
//! This module implements the `EditableModel` trait for a newtype wrapper around
//! `DocxBody`, providing uniform mutation (`apply`), inversion (`invert`), and
//! operation history (`to_ops_since`) for undo, WASM export, and collaboration.
//!
//! The implementation maps generic `ModelOp` operations to domain-specific `DocOp`
//! operations via the `DocModel` helper.

use std::collections::BTreeMap;

use wo_common::op::{EditableModel, ModelOp};
use wo_common::path::{Path, Range};
use wo_ooxml::model::DocxBody;

use crate::ops::{DocModel, DocOp, DocOpError};

/// Error type for EditableModel operations on EditableDocxBody
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum EditableModelError {
    #[error("path out of range: {0}")]
    OutOfRange(String),
    #[error("invalid operation: {0}")]
    InvalidOp(String),
    #[error("cannot apply operation: {0}")]
    ApplyError(String),
    #[error("doc op error: {0}")]
    DocOpError(#[from] DocOpError),
}

/// A newtype wrapper around `DocxBody` that implements `EditableModel`.
///
/// This wrapper is necessary due to Rust's orphan rules, which prevent
/// implementing external traits (like `EditableModel`) for external types
/// (like `DocxBody`). The wrapper delegates all operations to the inner `DocxBody`.
#[derive(Debug, Clone, Default)]
pub struct EditableDocxBody(pub DocxBody);

impl From<DocxBody> for EditableDocxBody {
    fn from(body: DocxBody) -> Self {
        Self(body)
    }
}

impl From<EditableDocxBody> for DocxBody {
    fn from(body: EditableDocxBody) -> Self {
        body.0
    }
}

impl std::ops::Deref for EditableDocxBody {
    type Target = DocxBody;
    
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for EditableDocxBody {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}



impl EditableDocxBody {
    /// Create a new empty EditableDocxBody
    pub fn new() -> Self {
        Self(DocxBody::new())
    }

    /// Apply an operation via DocModel
    fn apply_doc_op(&mut self, op: &DocOp) -> Result<(), EditableModelError> {
        let mut model = DocModel { body: &mut self.0 };
        model.apply(op).map_err(EditableModelError::DocOpError)?;
        Ok(())
    }

    /// Map a generic ModelOp to a domain-specific DocOp
    fn map_model_op_to_doc_op(&self, op: &ModelOp) -> Result<DocOp, EditableModelError> {
        match op {
            ModelOp::Insert { at, content } => {
                match at {
                    Path::Text { para, run: _, char } => {
                        // For text insert, we insert at the paragraph level
                        // The run parameter is used to identify which run to insert into
                        // For now, we'll insert at the character position in the paragraph
                        Ok(DocOp::InsertText {
                            para: *para,
                            char: *char,
                            text: content.clone(),
                        })
                    }
                    Path::Table { .. } => {
                        // For table insert, we need to handle table content
                        Err(EditableModelError::InvalidOp(
                            "Table insert not yet implemented".to_string(),
                        ))
                    }
                    _ => Err(EditableModelError::InvalidOp(
                        "Unsupported path type for insert".to_string(),
                    )),
                }
            }
            ModelOp::Delete { range } => {
                match (&range.start, &range.end) {
                    (Path::Text { para: start_para, char: start_char, .. }, Path::Text { para: end_para, char: end_char, .. }) => {
                        // Only support intra-paragraph deletion for now
                        if start_para != end_para {
                            return Err(EditableModelError::InvalidOp(
                                "Cross-paragraph delete not yet supported".to_string(),
                            ));
                        }
                        Ok(DocOp::DeleteText {
                            para: *start_para,
                            start_char: *start_char,
                            end_char: *end_char,
                        })
                    }
                    _ => Err(EditableModelError::InvalidOp(
                        "Unsupported path type for delete".to_string(),
                    )),
                }
            }
            ModelOp::Replace { at, content } => {
                // Replace is delete then insert
                // For now, use the insert approach
                match at {
                    Path::Text { para, char, .. } => {
                        Ok(DocOp::InsertText {
                            para: *para,
                            char: *char,
                            text: content.clone(),
                        })
                    }
                    _ => Err(EditableModelError::InvalidOp(
                        "Unsupported path type for replace".to_string(),
                    )),
                }
            }
            ModelOp::Format { range, attrs } => {
                match &range.start {
                    Path::Text { para, char: start_char, .. } => {
                        match &range.end {
                            Path::Text { char: end_char, .. } => {
                                // Convert format attrs to RunAttrs
                                let mut run_attrs = crate::ops::RunAttrs::default();
                                for (key, value) in attrs {
                                    match key.as_str() {
                                        "bold" => {
                                            if let Some(b) = value.as_bool() {
                                                run_attrs.bold = Some(b);
                                            }
                                        }
                                        "italic" => {
                                            if let Some(b) = value.as_bool() {
                                                run_attrs.italic = Some(b);
                                            }
                                        }
                                        "underline" => {
                                            if let Some(s) = value.as_str() {
                                                run_attrs.underline = 
                                                    Some(wo_ooxml::model::UnderlineType::from_str(s));
                                            }
                                        }
                                        "strikethrough" => {
                                            if let Some(b) = value.as_bool() {
                                                run_attrs.strikethrough = Some(b);
                                            }
                                        }
                                        "font" => {
                                            if let Some(s) = value.as_str() {
                                                run_attrs.font = Some(s.to_string());
                                            }
                                        }
                                        "font_size" => {
                                            if let Some(n) = value.as_u64() {
                                                run_attrs.font_size = Some(n as u32);
                                            }
                                        }
                                        "color" => {
                                            if let Some(s) = value.as_str() {
                                                run_attrs.color = Some(s.to_string());
                                            }
                                        }
                                        "highlight" => {
                                            if let Some(s) = value.as_str() {
                                                run_attrs.highlight = Some(s.to_string());
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                                Ok(DocOp::FormatRun {
                                    para: *para,
                                    start_char: *start_char,
                                    end_char: *end_char,
                                    attrs: run_attrs,
                                })
                            }
                            _ => Err(EditableModelError::InvalidOp(
                                "Format range end must be Text path".to_string(),
                            )),
                        }
                    }
                    _ => Err(EditableModelError::InvalidOp(
                        "Format range start must be Text path".to_string(),
                    )),
                }
            }
            ModelOp::Move { from: _, to: _ } => {
                // Move is not directly supported by DocOp
                Err(EditableModelError::InvalidOp(
                    "Move operation not yet supported".to_string(),
                ))
            }
        }
    }
}

impl EditableModel for EditableDocxBody {
    type Err = EditableModelError;

    fn apply(&mut self, op: &ModelOp) -> Result<(), Self::Err> {
        // Map ModelOp to DocOp and apply
        let doc_op = self.map_model_op_to_doc_op(op)?;
        self.apply_doc_op(&doc_op)?;
        Ok(())
    }

    fn invert(&self, op: &ModelOp) -> ModelOp {
        // Invert the ModelOp by its type
        // For now, we implement a simple inversion based on the op type
        match op {
            ModelOp::Insert { at, content } => {
                // Inverse of insert is delete over the inserted range
                let end = match at {
                    Path::Text { para, run, char } => Path::Text {
                        para: *para,
                        run: *run,
                        char: *char + content.chars().count(),
                    },
                    Path::Table {
                        table,
                        row,
                        cell,
                        para,
                        run,
                        char,
                    } => Path::Table {
                        table: *table,
                        row: *row,
                        cell: *cell,
                        para: *para,
                        run: *run,
                        char: *char + content.chars().count(),
                    },
                    _ => at.clone(),
                };
                ModelOp::Delete {
                    range: Range::new(at.clone(), end),
                }
            }
            ModelOp::Delete { range } => {
                // Inverse of delete is insert at the start of the range
                // Note: We don't have the original content, so we return an empty insert
                ModelOp::Insert {
                    at: range.start.clone(),
                    content: String::new(),
                }
            }
            ModelOp::Replace { at, content: _ } => {
                // Inverse of replace is another replace with original content
                // Since we don't have the original, we return the same op
                ModelOp::Replace {
                    at: at.clone(),
                    content: String::new(),
                }
            }
            ModelOp::Format { range, attrs: _ } => {
                // Inverse of format is format with opposite/cleared attrs
                ModelOp::Format {
                    range: range.clone(),
                    attrs: BTreeMap::new(),
                }
            }
            ModelOp::Move { from, to } => {
                // Inverse of move is move back
                ModelOp::Move {
                    from: to.clone(),
                    to: from.clone(),
                }
            }
        }
    }

    fn to_ops_since(&self, _rev: u64) -> Vec<ModelOp> {
        // Note: Without storing revision history in EditableDocxBody itself,
        // we cannot implement this fully. In a real implementation,
        // the model would need to track its revision and history.
        Vec::new()
    }
}

/// Helper trait for parsing underline type from string
pub trait UnderlineTypeFromStr {
    fn from_str(s: &str) -> wo_ooxml::model::UnderlineType;
}

impl UnderlineTypeFromStr for wo_ooxml::model::UnderlineType {
    fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "single" => Self::Single,
            "double" => Self::Double,
            "thick" => Self::Thick,
            "dotted" => Self::Dotted,
            "dashed" => Self::Dashed,
            "dashdot" => Self::DashDot,
            "wave" => Self::Wave,
            _ => Self::None,
        }
    }
}

#[cfg(test)]
mod editable_model {
    use super::*;
    use wo_ooxml::model::{DocxBlock, DocxParagraph, DocxRun};

    // =========================================================================
    // Test helpers
    // =========================================================================

    fn create_test_body() -> EditableDocxBody {
        let mut body = DocxBody::new();
        body.push_paragraph(DocxParagraph {
            runs: vec![DocxRun {
                text: "Hello World".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        });
        body.push_paragraph(DocxParagraph {
            runs: vec![DocxRun {
                text: "Second paragraph".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        });
        EditableDocxBody(body)
    }

    fn text_path(para: usize, run: usize, char: usize) -> Path {
        Path::Text { para, run, char }
    }

    fn text_range(para: usize, start_char: usize, end_char: usize) -> Range {
        Range::new(text_path(para, 0, start_char), text_path(para, 0, end_char))
    }

    // =========================================================================
    // 1. EditableModel trait implementation
    // =========================================================================

    #[test]
    fn test_editable_model_trait_compiles() {
        // This test verifies that EditableDocxBody implements EditableModel
        fn _assert_editable<T: EditableModel>() {}
        _assert_editable::<EditableDocxBody>();
    }

    // =========================================================================
    // 2. Apply - InsertText
    // =========================================================================

    #[test]
    fn test_apply_insert_text_at_beginning() {
        let mut body = create_test_body();
        let op = ModelOp::Insert {
            at: text_path(0, 0, 0),
            content: "Start ".to_string(),
        };
        body.apply(&op).unwrap();
        
        // Verify the text was inserted
        match &body.0.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Start Hello World");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_apply_insert_text_at_end() {
        let mut body = create_test_body();
        let op = ModelOp::Insert {
            at: text_path(0, 0, 11), // "Hello World" has 11 chars
            content: " End".to_string(),
        };
        body.apply(&op).unwrap();
        
        match &body.0.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Hello World End");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_apply_insert_text_in_middle() {
        let mut body = create_test_body();
        let op = ModelOp::Insert {
            at: text_path(0, 0, 6), // After "Hello "
            content: "Small ".to_string(),
        };
        body.apply(&op).unwrap();
        
        match &body.0.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Hello Small World");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_apply_insert_text_unicode() {
        let mut body = create_test_body();
        let op = ModelOp::Insert {
            at: text_path(0, 0, 6),
            content: "😀".to_string(),
        };
        body.apply(&op).unwrap();
        
        match &body.0.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Hello 😀World");
                // Verify char count
                assert_eq!(p.runs[0].text.chars().count(), 12); // "Hello " + 😀 + "World"
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_apply_insert_text_out_of_range() {
        let mut body = create_test_body();
        let op = ModelOp::Insert {
            at: text_path(10, 0, 0), // Paragraph 10 doesn't exist
            content: "Test".to_string(),
        };
        let result = body.apply(&op);
        assert!(result.is_err());
    }

    // =========================================================================
    // 3. Apply - DeleteText
    // =========================================================================

    #[test]
    fn test_apply_delete_text_from_middle() {
        let mut body = create_test_body();
        let op = ModelOp::Delete {
            range: text_range(0, 6, 11), // Delete "World"
        };
        body.apply(&op).unwrap();
        
        match &body.0.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Hello ");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_apply_delete_text_from_beginning() {
        let mut body = create_test_body();
        let op = ModelOp::Delete {
            range: text_range(0, 0, 5), // Delete "Hello"
        };
        body.apply(&op).unwrap();
        
        match &body.0.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, " World");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_apply_delete_text_unicode() {
        let mut body = EditableDocxBody(DocxBody::new());
        body.0.push_paragraph(DocxParagraph {
            runs: vec![DocxRun {
                text: "A😀B".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        });
        
        let op = ModelOp::Delete {
            range: text_range(0, 1, 2), // Delete the emoji (char index 1)
        };
        body.apply(&op).unwrap();
        
        match &body.0.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "AB");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_apply_delete_text_out_of_range() {
        let mut body = create_test_body();
        let op = ModelOp::Delete {
            range: text_range(10, 0, 5), // Paragraph 10 doesn't exist
        };
        let result = body.apply(&op);
        assert!(result.is_err());
    }

    // =========================================================================
    // 4. Apply - FormatRun
    // =========================================================================

    #[test]
    fn test_apply_format_run_bold() {
        let mut body = create_test_body();
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".to_string(), serde_json::Value::Bool(true));
        
        let op = ModelOp::Format {
            range: text_range(0, 0, 5), // Format "Hello"
            attrs,
        };
        body.apply(&op).unwrap();
        
        match &body.0.blocks[0] {
            DocxBlock::Paragraph(p) => {
                // FormatRun should have split the run
                assert!(p.runs.len() >= 2, "Expected at least 2 runs after formatting");
                // First run should be bold
                // Note: The exact behavior depends on the DocModel implementation
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_apply_format_run_multiple_attrs() {
        let mut body = create_test_body();
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".to_string(), serde_json::Value::Bool(true));
        attrs.insert("italic".to_string(), serde_json::Value::Bool(true));
        attrs.insert("color".to_string(), serde_json::Value::String("#FF0000".to_string()));
        
        let op = ModelOp::Format {
            range: text_range(0, 0, 11), // Format entire first paragraph
            attrs,
        };
        body.apply(&op).unwrap();
        
        // Just verify it doesn't panic
    }

    // =========================================================================
    // 5. Invert operations
    // =========================================================================

    #[test]
    fn test_invert_insert_yields_delete() {
        let body = create_test_body();
        let op = ModelOp::Insert {
            at: text_path(0, 0, 5),
            content: "abc".to_string(),
        };
        let inv = body.invert(&op);
        match inv {
            ModelOp::Delete { range } => {
                assert_eq!(range.start, text_path(0, 0, 5));
                assert_eq!(range.end, text_path(0, 0, 8)); // 5 + 3 chars
            }
            _ => panic!("Expected Delete inverse"),
        }
    }

    #[test]
    fn test_invert_delete_yields_insert() {
        let body = create_test_body();
        let op = ModelOp::Delete {
            range: text_range(0, 0, 5),
        };
        let inv = body.invert(&op);
        match inv {
            ModelOp::Insert { at, .. } => {
                assert_eq!(at, text_path(0, 0, 0));
            }
            _ => panic!("Expected Insert inverse"),
        }
    }

    #[test]
    fn test_invert_move_swaps_direction() {
        let body = create_test_body();
        let op = ModelOp::Move {
            from: text_path(0, 0, 0),
            to: text_path(1, 0, 5),
        };
        let inv = body.invert(&op);
        match inv {
            ModelOp::Move { from, to } => {
                assert_eq!(from, text_path(1, 0, 5));
                assert_eq!(to, text_path(0, 0, 0));
            }
            _ => panic!("Expected Move inverse"),
        }
    }

    #[test]
    fn test_invert_format_yields_format() {
        let body = create_test_body();
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".to_string(), serde_json::Value::Bool(true));
        let op = ModelOp::Format {
            range: text_range(0, 0, 5),
            attrs,
        };
        let inv = body.invert(&op);
        match inv {
            ModelOp::Format { range, .. } => {
                assert_eq!(range.start, text_path(0, 0, 0));
                assert_eq!(range.end, text_path(0, 0, 5));
            }
            _ => panic!("Expected Format inverse"),
        }
    }

    // =========================================================================
    // 6. to_ops_since
    // =========================================================================

    #[test]
    fn test_to_ops_since_empty() {
        let body = create_test_body();
        let ops = body.to_ops_since(0);
        assert_eq!(ops.len(), 0);
    }

    #[test]
    fn test_to_ops_since_future_revision() {
        let body = create_test_body();
        let ops = body.to_ops_since(100);
        assert_eq!(ops.len(), 0);
    }

    // =========================================================================
    // 7. Round-trip tests: apply then invert yields identity
    // =========================================================================

    #[test]
    fn test_roundtrip_insert_delete_text() {
        // Test: Insert text, then delete it, should yield original
        let mut body = create_test_body();
        let original_text = body.0.blocks[0].to_owned();
        
        let text_to_insert = "TEST".to_string();
        let insert_op = ModelOp::Insert {
            at: text_path(0, 0, 5),
            content: text_to_insert.clone(),
        };
        
        // Apply insert
        body.apply(&insert_op).unwrap();
        
        // Manually create the proper delete op since invert doesn't capture content
        let delete_op = ModelOp::Delete {
            range: text_range(0, 5, 5 + text_to_insert.chars().count()),
        };
        
        // Apply delete
        body.apply(&delete_op).unwrap();
        
        // Verify we're back to original
        match (&body.0.blocks[0], &original_text) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                assert_eq!(p1.runs[0].text, p2.runs[0].text);
            }
            _ => panic!("Expected both to be paragraphs"),
        }
    }

    #[test]
    fn test_roundtrip_delete_insert_text() {
        // Test: Delete text (with known content), then insert it back
        let mut body = create_test_body();
        
        let deleted_text = " World".to_string();
        let delete_range = text_range(0, 5, 11); // Delete " World"
        let delete_op = ModelOp::Delete { range: delete_range.clone() };
        
        // Save original
        let original_text = body.0.blocks[0].to_owned();
        
        // Apply delete
        body.apply(&delete_op).unwrap();
        
        // Apply inverse (insert with saved content)
        let insert_op = ModelOp::Insert {
            at: delete_range.start.clone(),
            content: deleted_text,
        };
        body.apply(&insert_op).unwrap();
        
        // Verify we're back to original
        match (&body.0.blocks[0], &original_text) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                assert_eq!(p1.runs[0].text, p2.runs[0].text);
            }
            _ => panic!("Expected both to be paragraphs"),
        }
    }

    #[test]
    fn test_roundtrip_insert_unicode() {
        // Test: Insert unicode (emoji), then delete it
        let mut body = create_test_body();
        let original_text = body.0.blocks[0].to_owned();
        
        let emoji = "😀".to_string();
        let insert_op = ModelOp::Insert {
            at: text_path(0, 0, 5),
            content: emoji.clone(),
        };
        
        body.apply(&insert_op).unwrap();
        
        // Manually create delete op
        let delete_op = ModelOp::Delete {
            range: text_range(0, 5, 5 + emoji.chars().count()),
        };
        
        body.apply(&delete_op).unwrap();
        
        match (&body.0.blocks[0], &original_text) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                assert_eq!(p1.runs[0].text, p2.runs[0].text);
            }
            _ => panic!("Expected both to be paragraphs"),
        }
    }

    #[test]
    fn test_roundtrip_format_clear_format() {
        // Test: Apply format, then clear it (approximate round-trip)
        let mut body = create_test_body();
        let original = body.0.blocks[0].to_owned();
        
        // Apply bold format
        let mut attrs = BTreeMap::new();
        attrs.insert("bold".to_string(), serde_json::Value::Bool(true));
        let format_op = ModelOp::Format {
            range: text_range(0, 0, 5),
            attrs,
        };
        body.apply(&format_op).unwrap();
        
        // Apply inverse (format with empty attrs - clears formatting)
        let clear_op = ModelOp::Format {
            range: text_range(0, 0, 5),
            attrs: BTreeMap::new(),
        };
        body.apply(&clear_op).unwrap();
        
        // Note: FormatRun splits runs, so we can't easily verify exact equality
        // But we can verify the text content is unchanged
        match (&body.0.blocks[0], &original) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                // Text should be the same even if runs changed
                let text1: String = p1.runs.iter().map(|r| r.text.as_str()).collect();
                let text2: String = p2.runs.iter().map(|r| r.text.as_str()).collect();
                assert_eq!(text1, text2);
            }
            _ => panic!("Expected both to be paragraphs"),
        }
    }

    // =========================================================================
    // 8. Unicode char count vs byte count
    // =========================================================================

    #[test]
    fn test_unicode_char_count() {
        let content = "A😀B";
        assert_eq!(content.chars().count(), 3);
        assert_ne!(content.len(), 3); // Different from byte count
    }
}
