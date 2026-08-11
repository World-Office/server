//! Stub model demonstrating the uniform WASM export convention (§2.3).
//!
//! A minimal `Vec<String>`-backed model that implements
//! [`wo_common::op::EditableModel`]. It exists solely to prove the 4-function
//! WASM contract (`create_model` / `apply_op` / `model_to_bytes` /
//! `layout_and_render`) compiles and works end-to-end. Real document models
//! (DOCX, XLSX, PPTX, …) replace this stub in later engine tasks.

use std::collections::BTreeMap;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;

use wo_common::op::{EditableModel, ModelOp};
use wo_common::path::{Path, Range};

// ---------------------------------------------------------------------------
// Store & handle management
// ---------------------------------------------------------------------------

/// Global store of stub model instances (handle → `StubModel`).
pub static STUB_MODEL_STORE: OnceLock<Mutex<HashMap<u32, StubModel>>> = OnceLock::new();

/// Next available stub-model handle (separate namespace starting at 5000
/// to avoid collisions with `DOC_STORE` handles).
static mut NEXT_STUB_HANDLE: u32 = 5000;

/// Allocate the next stub-model handle.
///
/// # Safety
/// WASM is single-threaded; the mutable static is safe in that context.
pub unsafe fn next_stub_handle() -> u32 {
    let h = NEXT_STUB_HANDLE;
    NEXT_STUB_HANDLE += 1;
    h
}

// ---------------------------------------------------------------------------
// StubModel
// ---------------------------------------------------------------------------

/// Minimal editable model: an ordered list of paragraphs, each a plain `String`.
///
/// Formatting is **not** supported — this model validates the WASM export
/// convention, not the full OOXML mutation pipeline.
#[derive(Debug, Clone)]
pub struct StubModel {
    pub paragraphs: Vec<String>,
    rev: u64,
    history: Vec<ModelOp>,
}

impl StubModel {
    /// Create a new stub model from a list of paragraph strings.
    pub fn new(paragraphs: Vec<String>) -> Self {
        Self {
            paragraphs,
            rev: 0,
            history: Vec::new(),
        }
    }

    /// Current revision number.
    pub fn rev(&self) -> u64 {
        self.rev
    }

    /// Release a stub model from the global store.
    pub fn release(handle: u32) {
        let store = STUB_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut store = store.lock().unwrap();
        store.remove(&handle);
    }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors for stub-model operations.
#[derive(Debug, Clone, PartialEq)]
pub enum StubModelError {
    /// Paragraph index is beyond the model or would require too many new paragraphs.
    ParagraphOutOfRange(usize),
    /// Character index is out of bounds for the referenced paragraph.
    CharOutOfRange(usize, usize),
    /// The operation references a path kind the stub doesn't support.
    UnsupportedPath(String),
}

impl std::fmt::Display for StubModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ParagraphOutOfRange(i) => write!(f, "paragraph {i} out of range"),
            Self::CharOutOfRange(i, len) => {
                write!(f, "char {i} out of range (paragraph has {len} chars)")
            }
            Self::UnsupportedPath(s) => write!(f, "unsupported path kind: {s}"),
        }
    }
}

impl std::error::Error for StubModelError {}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extract `(para, char)` from a [`Path`]. Only supports `Path::Text`.
fn text_path_parts(path: &Path) -> Result<(usize, usize), StubModelError> {
    match path {
        Path::Text { para, char, .. } => Ok((*para, *char)),
        other => Err(StubModelError::UnsupportedPath(format!("{:?}", other))),
    }
}

// ---------------------------------------------------------------------------
// EditableModel implementation
// ---------------------------------------------------------------------------

impl EditableModel for StubModel {
    type Err = StubModelError;

    fn apply(&mut self, op: &ModelOp) -> Result<(), Self::Err> {
        match op {
            ModelOp::Insert { at, content } => {
                let (para, char_idx) = text_path_parts(at)?;
                // Extend paragraphs if the index is beyond the current length.
                while self.paragraphs.len() <= para {
                    self.paragraphs.push(String::new());
                }
                let chars_count = self.paragraphs[para].chars().count();
                if char_idx > chars_count {
                    return Err(StubModelError::CharOutOfRange(char_idx, chars_count));
                }
                let mut chars: Vec<char> = self.paragraphs[para].chars().collect();
                let mut ci = char_idx;
                for c in content.chars() {
                    chars.insert(ci, c);
                    ci += 1;
                }
                self.paragraphs[para] = chars.into_iter().collect();
            }

            ModelOp::Delete { range } => {
                let (sp, sc) = text_path_parts(&range.start)?;
                let (ep, ec) = text_path_parts(&range.end)?;
                if sp != ep {
                    return Err(StubModelError::UnsupportedPath(
                        "cross-paragraph delete not supported".into(),
                    ));
                }
                if sp >= self.paragraphs.len() {
                    return Err(StubModelError::ParagraphOutOfRange(sp));
                }
                let chars_count = self.paragraphs[sp].chars().count();
                if sc > ec || ec > chars_count {
                    return Err(StubModelError::CharOutOfRange(sc, chars_count));
                }
                let chars: Vec<char> = self.paragraphs[sp].chars().collect();
                let mut new_chars: Vec<char> = chars[..sc].to_vec();
                new_chars.extend(&chars[ec..]);
                self.paragraphs[sp] = new_chars.into_iter().collect();
            }

            ModelOp::Replace { at, content } => {
                let (para, char_idx) = text_path_parts(at)?;
                if para >= self.paragraphs.len() {
                    return Err(StubModelError::ParagraphOutOfRange(para));
                }
                let chars_count = self.paragraphs[para].chars().count();
                if char_idx >= chars_count {
                    return Err(StubModelError::CharOutOfRange(char_idx, chars_count));
                }
                let mut chars: Vec<char> = self.paragraphs[para].chars().collect();
                chars.remove(char_idx);
                let mut ci = char_idx;
                for c in content.chars() {
                    chars.insert(ci, c);
                    ci += 1;
                }
                self.paragraphs[para] = chars.into_iter().collect();
            }

            ModelOp::Format { .. } | ModelOp::Move { .. } => {
                // Stub model: formatting and moves are no-ops.
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
                match at {
                    Path::Text { para, run, char, .. } => ModelOp::Delete {
                        range: Range::new(
                            at.clone(),
                            Path::Text {
                                para: *para,
                                run: *run,
                                char: char + len,
                            },
                        ),
                    },
                    _ => ModelOp::Insert {
                        at: at.clone(),
                        content: String::new(),
                    },
                }
            }

            ModelOp::Delete { range } => {
                let (sp, sc) = text_path_parts(&range.start).unwrap_or((0, 0));
                let (ep, ec) = text_path_parts(&range.end).unwrap_or((0, 0));
                if sp == ep && sp < self.paragraphs.len() {
                    let deleted: String = self.paragraphs[sp]
                        .chars()
                        .skip(sc)
                        .take(ec.saturating_sub(sc))
                        .collect();
                    ModelOp::Insert {
                        at: range.start.clone(),
                        content: deleted,
                    }
                } else {
                    ModelOp::Insert {
                        at: range.start.clone(),
                        content: String::new(),
                    }
                }
            }

            ModelOp::Replace { at, content: _ } => {
                let (para, char_idx) = text_path_parts(at).unwrap_or((0, 0));
                let old = if para < self.paragraphs.len() {
                    self.paragraphs[para]
                        .chars()
                        .nth(char_idx)
                        .map(|c| c.to_string())
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                ModelOp::Replace {
                    at: at.clone(),
                    content: old,
                }
            }

            ModelOp::Move { from, to } => ModelOp::Move {
                from: to.clone(),
                to: from.clone(),
            },

            ModelOp::Format { range, attrs } => ModelOp::Format {
                range: range.clone(),
                attrs: attrs.clone(),
            },
        }
    }

    fn to_ops_since(&self, rev: u64) -> Vec<ModelOp> {
        if rev >= self.rev {
            return Vec::new();
        }
        self.history[(rev as usize)..].to_vec()
    }
}

// ---------------------------------------------------------------------------
// Layout helper
// ---------------------------------------------------------------------------

/// Options for [`layout_stub_model`].
#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct StubLayoutOpts {
    /// Page width in pixels (default 794 ≈ A4 @ 96 DPI).
    #[serde(default = "default_width")]
    pub width: u32,
    /// Page height in pixels (default 1123 ≈ A4 @ 96 DPI).
    #[serde(default = "default_height")]
    pub height: u32,
    /// Font size in pixels (default 12).
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    /// Margin in points (default 72 = 1 inch).
    #[serde(default = "default_margin")]
    pub margin_pt: f32,
}

fn default_width() -> u32 {
    794
}
fn default_height() -> u32 {
    1123
}
fn default_font_size() -> f32 {
    12.0
}
fn default_margin() -> f32 {
    72.0
}

/// Points-to-pixels conversion factor.
pub(crate) const PT_TO_PX: f32 = 96.0 / 72.0;

/// Layout a [`StubModel`] into pages and return layout JSON.
///
/// Each paragraph becomes a single line (no word-wrap in the stub).
/// Character positions are estimated using a proportional character-width
/// heuristic (`font_size * 0.5`).
pub fn layout_stub_model(
    model: &StubModel,
    opts: &StubLayoutOpts,
) -> serde_json::Value {
    let margin_px = opts.margin_pt * PT_TO_PX;
    let line_height = opts.font_size * 1.2;
    let _content_width = (opts.width as f32) - 2.0 * margin_px;
    let max_y = (opts.height as f32) - margin_px;

    let char_w = opts.font_size * 0.5; // rough proportional estimate

    let mut pages_json: Vec<serde_json::Value> = Vec::new();
    let mut current_paras: Vec<serde_json::Value> = Vec::new();
    let mut cursor_y = margin_px;

    for para_text in &model.paragraphs {
        // Page break when cursor exceeds bottom margin.
        if cursor_y + line_height > max_y {
            pages_json.push(build_page_json(
                &current_paras,
                opts.width,
                opts.height,
                margin_px,
            ));
            current_paras.clear();
            cursor_y = margin_px;
        }

        // Character-level positions (estimated).
        let mut chars_json: Vec<serde_json::Value> = Vec::new();
        let mut x = margin_px;
        for ch in para_text.chars() {
            chars_json.push(serde_json::json!({
                "ch": ch.to_string(),
                "x": round2(x),
                "y": round2(cursor_y),
                "fontSizePx": round2(opts.font_size),
            }));
            x += char_w;
        }

        let line_width = x - margin_px;

        current_paras.push(serde_json::json!({
            "y": round2(cursor_y),
            "height": round2(line_height),
            "lines": [{
                "chars": chars_json,
                "x": round2(margin_px),
                "y": round2(cursor_y),
                "width": round2(line_width),
                "height": round2(line_height),
            }],
        }));

        cursor_y += line_height;
    }

    // Flush remaining paragraphs.
    if !current_paras.is_empty() {
        pages_json.push(build_page_json(
            &current_paras,
            opts.width,
            opts.height,
            margin_px,
        ));
    }

    // Emit at least one empty page if model has no content.
    if pages_json.is_empty() {
        pages_json.push(build_page_json(
            &[],
            opts.width,
            opts.height,
            margin_px,
        ));
    }

    serde_json::json!({ "pages": pages_json })
}

fn build_page_json(
    paragraphs: &[serde_json::Value],
    width: u32,
    height: u32,
    margin_px: f32,
) -> serde_json::Value {
    serde_json::json!({
        "width": width,
        "height": height,
        "marginPx": round2(margin_px),
        "paragraphs": paragraphs,
    })
}

fn round2(v: f32) -> f32 {
    (v * 100.0).round() / 100.0
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use wo_common::path::Path;

    /// Convenience: build a `Path::Text`.
    fn tp(para: usize, run: usize, char: usize) -> Path {
        Path::Text { para, run, char }
    }

    // ── apply ─────────────────────────────────────────────────────────

    #[test]
    fn insert_text_at_end() {
        let mut m = StubModel::new(vec!["Hello".into()]);
        m.apply(&ModelOp::Insert {
            at: tp(0, 0, 5),
            content: " world".into(),
        })
        .unwrap();
        assert_eq!(m.paragraphs[0], "Hello world");
        assert_eq!(m.rev(), 1);
    }

    #[test]
    fn insert_text_at_start() {
        let mut m = StubModel::new(vec!["World".into()]);
        m.apply(&ModelOp::Insert {
            at: tp(0, 0, 0),
            content: "Hello ".into(),
        })
        .unwrap();
        assert_eq!(m.paragraphs[0], "Hello World");
    }

    #[test]
    fn insert_text_in_middle() {
        let mut m = StubModel::new(vec!["ABC".into()]);
        m.apply(&ModelOp::Insert {
            at: tp(0, 0, 1),
            content: "XY".into(),
        })
        .unwrap();
        assert_eq!(m.paragraphs[0], "AXYBC");
    }

    #[test]
    fn insert_creates_new_paragraphs() {
        let mut m = StubModel::new(vec![]);
        m.apply(&ModelOp::Insert {
            at: tp(2, 0, 0),
            content: "Hi".into(),
        })
        .unwrap();
        assert_eq!(m.paragraphs.len(), 3);
        assert_eq!(m.paragraphs[0], "");
        assert_eq!(m.paragraphs[1], "");
        assert_eq!(m.paragraphs[2], "Hi");
    }

    #[test]
    fn delete_text() {
        let mut m = StubModel::new(vec!["Hello world".into()]);
        m.apply(&ModelOp::Delete {
            range: Range::new(tp(0, 0, 5), tp(0, 0, 11)),
        })
        .unwrap();
        assert_eq!(m.paragraphs[0], "Hello");
    }

    #[test]
    fn replace_text() {
        let mut m = StubModel::new(vec!["Hello".into()]);
        m.apply(&ModelOp::Replace {
            at: tp(0, 0, 0),
            content: "J".into(),
        })
        .unwrap();
        assert_eq!(m.paragraphs[0], "Jello");
    }

    #[test]
    fn format_is_no_op() {
        let mut m = StubModel::new(vec!["Hello".into()]);
        let result = m.apply(&ModelOp::Format {
            range: Range::new(tp(0, 0, 0), tp(0, 0, 5)),
            attrs: {
                let mut a = BTreeMap::new();
                a.insert("bold".into(), serde_json::json!(true));
                a
            },
        });
        assert!(result.is_ok());
        assert_eq!(m.paragraphs[0], "Hello"); // unchanged
    }

    // ── unicode safety ─────────────────────────────────────────────────

    #[test]
    fn unicode_insert_and_count() {
        let mut m = StubModel::new(vec!["A😀B".into()]);
        m.apply(&ModelOp::Insert {
            at: tp(0, 0, 2),
            content: "X".into(),
        })
        .unwrap();
        assert_eq!(m.paragraphs[0], "A😀XB");
        assert_eq!(m.paragraphs[0].chars().count(), 4);
        // Byte length is NOT 4 (multi-byte chars).
        assert_ne!(m.paragraphs[0].len(), 4);
    }

    #[test]
    fn unicode_delete() {
        let mut m = StubModel::new(vec!["😀😀".into()]);
        m.apply(&ModelOp::Delete {
            range: Range::new(tp(0, 0, 0), tp(0, 0, 1)),
        })
        .unwrap();
        assert_eq!(m.paragraphs[0], "😀");
    }

    // ── error cases ──────────────────────────────────────────────────

    #[test]
    fn error_insert_out_of_range() {
        let mut m = StubModel::new(vec!["Hi".into()]);
        let r = m.apply(&ModelOp::Insert {
            at: tp(0, 0, 99),
            content: "x".into(),
        });
        assert!(r.is_err());
        assert_eq!(
            r.unwrap_err(),
            StubModelError::CharOutOfRange(99, 2)
        );
    }

    #[test]
    fn error_delete_cross_paragraph() {
        let mut m = StubModel::new(vec!["A".into(), "B".into()]);
        let r = m.apply(&ModelOp::Delete {
            range: Range::new(tp(0, 0, 0), tp(1, 0, 1)),
        });
        assert!(r.is_err());
    }

    #[test]
    fn error_unsupported_path_kind() {
        let mut m = StubModel::new(vec!["A".into()]);
        let r = m.apply(&ModelOp::Insert {
            at: Path::Sheet {
                sheet: "X".into(),
                row: 0,
                col: 0,
            },
            content: "x".into(),
        });
        assert!(r.is_err());
    }

    // ── invert ───────────────────────────────────────────────────────

    #[test]
    fn invert_insert_yields_delete() {
        let m = StubModel::new(vec![]);
        let op = ModelOp::Insert {
            at: tp(0, 0, 3),
            content: "abc".into(),
        };
        let inv = m.invert(&op);
        match inv {
            ModelOp::Delete { range } => {
                assert_eq!(range.start, tp(0, 0, 3));
                assert_eq!(range.end, tp(0, 0, 6)); // 3 + len("abc")
            }
            _ => panic!("expected Delete"),
        }
    }

    #[test]
    fn invert_insert_then_apply_restores_identity() {
        let mut m = StubModel::new(vec!["AB".into()]);
        let op = ModelOp::Insert {
            at: tp(0, 0, 1),
            content: "X".into(),
        };
        let inv = m.invert(&op);
        m.apply(&op).unwrap();
        assert_eq!(m.paragraphs[0], "AXB");
        m.apply(&inv).unwrap();
        assert_eq!(m.paragraphs[0], "AB");
    }

    #[test]
    fn invert_delete_yields_insert_with_deleted_text() {
        let m = StubModel::new(vec!["ABCDE".into()]);
        let op = ModelOp::Delete {
            range: Range::new(tp(0, 0, 1), tp(0, 0, 3)),
        };
        let inv = m.invert(&op);
        match inv {
            ModelOp::Insert { content, .. } => assert_eq!(content, "BC"),
            _ => panic!("expected Insert"),
        }
    }

    #[test]
    fn invert_delete_then_apply_restores_identity() {
        let mut m = StubModel::new(vec!["ABCDE".into()]);
        let op = ModelOp::Delete {
            range: Range::new(tp(0, 0, 1), tp(0, 0, 3)),
        };
        let inv = m.invert(&op);
        m.apply(&op).unwrap();
        assert_eq!(m.paragraphs[0], "ADE");
        m.apply(&inv).unwrap();
        assert_eq!(m.paragraphs[0], "ABCDE");
    }

    #[test]
    fn invert_replace_captures_old_char() {
        let m = StubModel::new(vec!["Hello".into()]);
        let op = ModelOp::Replace {
            at: tp(0, 0, 1),
            content: "X".into(),
        };
        let inv = m.invert(&op);
        match inv {
            ModelOp::Replace { content, .. } => assert_eq!(content, "e"),
            _ => panic!("expected Replace"),
        }
    }

    #[test]
    fn invert_move_swaps_direction() {
        let m = StubModel::new(vec![]);
        let op = ModelOp::Move {
            from: tp(0, 0, 0),
            to: tp(1, 0, 5),
        };
        let inv = m.invert(&op);
        match inv {
            ModelOp::Move { from, to } => {
                assert_eq!(from, tp(1, 0, 5));
                assert_eq!(to, tp(0, 0, 0));
            }
            _ => panic!("expected Move"),
        }
    }

    // ── to_ops_since ──────────────────────────────────────────────────

    #[test]
    fn to_ops_since_returns_history_slice() {
        let mut m = StubModel::new(vec![String::new()]);
        m.apply(&ModelOp::Insert {
            at: tp(0, 0, 0),
            content: "a".into(),
        })
        .unwrap(); // rev 1
        m.apply(&ModelOp::Insert {
            at: tp(0, 0, 1),
            content: "b".into(),
        })
        .unwrap(); // rev 2
        m.apply(&ModelOp::Insert {
            at: tp(0, 0, 2),
            content: "c".into(),
        })
        .unwrap(); // rev 3

        assert_eq!(m.to_ops_since(0).len(), 3);
        assert_eq!(m.to_ops_since(1).len(), 2);
        assert_eq!(m.to_ops_since(3).len(), 0);
        assert_eq!(m.to_ops_since(99).len(), 0);
    }

    // ── layout ───────────────────────────────────────────────────────

    #[test]
    fn layout_empty_model_emits_one_page() {
        let m = StubModel::new(vec![]);
        let opts = StubLayoutOpts::default();
        let json = layout_stub_model(&m, &opts);
        let pages = json["pages"].as_array().unwrap();
        assert_eq!(pages.len(), 1);
    }

    #[test]
    fn layout_single_paragraph() {
        let m = StubModel::new(vec!["Hello".into()]);
        let opts = StubLayoutOpts::default();
        let json = layout_stub_model(&m, &opts);
        let pages = json["pages"].as_array().unwrap();
        let paras = pages[0]["paragraphs"].as_array().unwrap();
        assert_eq!(paras.len(), 1);
        let lines = paras[0]["lines"].as_array().unwrap();
        assert_eq!(lines.len(), 1);
        let chars = lines[0]["chars"].as_array().unwrap();
        assert_eq!(chars.len(), 5);
        assert_eq!(chars[0]["ch"], "H");
    }

    #[test]
    fn layout_spans_multiple_pages() {
        // 100 paragraphs at font-size 12 → line-height 14.4px
        // Page content height = 1123 - 2*96 = 931px → ~64 lines per page
        let paras: Vec<String> = (0..100).map(|_| "Line".into()).collect();
        let m = StubModel::new(paras);
        let opts = StubLayoutOpts::default();
        let json = layout_stub_model(&m, &opts);
        let pages = json["pages"].as_array().unwrap();
        assert!(pages.len() >= 2, "expected ≥2 pages, got {}", pages.len());
    }

    #[test]
    fn layout_json_roundtrip() {
        let m = StubModel::new(vec!["Test".into()]);
        let opts = StubLayoutOpts::default();
        let json = layout_stub_model(&m, &opts);
        let serialized = serde_json::to_string(&json).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&serialized).unwrap();
        assert_eq!(json, parsed);
    }

    #[test]
    fn stub_model_error_impl_display() {
        let e = StubModelError::CharOutOfRange(5, 3);
        assert_eq!(format!("{e}"), "char 5 out of range (paragraph has 3 chars)");

        let e = StubModelError::ParagraphOutOfRange(99);
        assert_eq!(format!("{e}"), "paragraph 99 out of range");
    }

    #[test]
    fn stub_model_error_impl_debug() {
        let e = StubModelError::UnsupportedPath("Table".into());
        let debug = format!("{e:?}");
        assert!(debug.contains("UnsupportedPath"));
    }
}
