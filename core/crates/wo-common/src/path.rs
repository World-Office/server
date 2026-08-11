// wo-common/src/path.rs — Path + Range addressing types
//
// Universal addressing for all document models. Paths are JSON-serializable
// so they cross WASM/ WebSocket boundaries. Used by the EditableModel trait,
// collaboration OT, and the frontend command router.

use serde::{Deserialize, Serialize};

/// Address a specific position in a document tree.
///
/// Each variant maps to a different document kind:
/// - `Text`: paragraph/run/char in a word-processing document
/// - `Table`: cell content inside a table (nested body path)
/// - `Slide`: shape text in a presentation
/// - `Sheet`: cell in a spreadsheet
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Path {
    /// Address within the main text body: paragraph index, run index, character offset.
    /// Character offsets count Unicode scalars (`.chars().count()`), never bytes.
    Text {
        para: usize,
        run: usize,
        char: usize,
    },
    /// Address within a table cell: table index, row, cell, then body path.
    Table {
        table: usize,
        row: usize,
        cell: usize,
        para: usize,
        run: usize,
        char: usize,
    },
    /// Address within a slide shape: slide index, shape index, run, character.
    Slide {
        slide: usize,
        shape: usize,
        run: usize,
        char: usize,
    },
    /// Address within a spreadsheet: sheet name (for named sheets), row and column.
    Sheet {
        sheet: String,
        row: u32,
        col: u32,
    },
}

/// A half-open range [start, end) over two [`Path`] addresses.
///
/// For ordered ranges, `start` must precede `end` in document order.
/// The range is inclusive of `start` and exclusive of `end` for character-level
/// selections (matching common editor conventions).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Range {
    pub start: Path,
    pub end: Path,
}

impl Range {
    /// Create a new range from start and end paths.
    pub fn new(start: Path, end: Path) -> Self {
        Self { start, end }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Test 1: serde round-trip -----------------------------------------------

    #[test]
    fn serde_roundtrip_text() {
        let path = Path::Text {
            para: 3,
            run: 1,
            char: 14,
        };
        let json = serde_json::to_string(&path).unwrap();
        let back: Path = serde_json::from_str(&json).unwrap();
        assert_eq!(path, back);
    }

    #[test]
    fn serde_roundtrip_table() {
        let path = Path::Table {
            table: 0,
            row: 2,
            cell: 1,
            para: 0,
            run: 0,
            char: 5,
        };
        let json = serde_json::to_string(&path).unwrap();
        let back: Path = serde_json::from_str(&json).unwrap();
        assert_eq!(path, back);
    }

    #[test]
    fn serde_roundtrip_slide() {
        let path = Path::Slide {
            slide: 1,
            shape: 4,
            run: 0,
            char: 0,
        };
        let json = serde_json::to_string(&path).unwrap();
        let back: Path = serde_json::from_str(&json).unwrap();
        assert_eq!(path, back);
    }

    #[test]
    fn serde_roundtrip_sheet() {
        let path = Path::Sheet {
            sheet: "Sheet1".to_string(),
            row: 10,
            col: 3,
        };
        let json = serde_json::to_string(&path).unwrap();
        let back: Path = serde_json::from_str(&json).unwrap();
        assert_eq!(path, back);
    }

    #[test]
    fn serde_roundtrip_range() {
        let range = Range::new(
            Path::Text {
                para: 0,
                run: 0,
                char: 0,
            },
            Path::Text {
                para: 0,
                run: 0,
                char: 5,
            },
        );
        let json = serde_json::to_string(&range).unwrap();
        let back: Range = serde_json::from_str(&json).unwrap();
        assert_eq!(range, back);
    }

    // --- Test 2: equality --------------------------------------------------------

    #[test]
    fn equality_text_variants() {
        let a = Path::Text {
            para: 1,
            run: 2,
            char: 3,
        };
        let b = Path::Text {
            para: 1,
            run: 2,
            char: 3,
        };
        let c = Path::Text {
            para: 1,
            run: 2,
            char: 4, // different char
        };
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn equality_cross_variant() {
        let text = Path::Text {
            para: 0,
            run: 0,
            char: 0,
        };
        let table = Path::Table {
            table: 0,
            row: 0,
            cell: 0,
            para: 0,
            run: 0,
            char: 0,
        };
        assert_ne!(text, table);
    }

    #[test]
    fn equality_range() {
        let r1 = Range::new(
            Path::Text {
                para: 1,
                run: 0,
                char: 0,
            },
            Path::Text {
                para: 1,
                run: 0,
                char: 10,
            },
        );
        let r2 = Range::new(
            Path::Text {
                para: 1,
                run: 0,
                char: 0,
            },
            Path::Text {
                para: 1,
                run: 0,
                char: 10,
            },
        );
        assert_eq!(r1, r2);
    }

    // --- Test 3: Range construction ---------------------------------------------

    #[test]
    fn range_new() {
        let start = Path::Text {
            para: 0,
            run: 0,
            char: 0,
        };
        let end = Path::Text {
            para: 0,
            run: 0,
            char: 5,
        };
        let range = Range::new(start.clone(), end.clone());
        assert_eq!(range.start, start);
        assert_eq!(range.end, end);
    }

    #[test]
    fn range_cross_kind() {
        let range = Range::new(
            Path::Text {
                para: 2,
                run: 0,
                char: 0,
            },
            Path::Table {
                table: 0,
                row: 3,
                cell: 1,
                para: 0,
                run: 0,
                char: 0,
            },
        );
        assert_eq!(
            range.start,
            Path::Text {
                para: 2,
                run: 0,
                char: 0
            }
        );
        assert_eq!(
            range.end,
            Path::Table {
                table: 0,
                row: 3,
                cell: 1,
                para: 0,
                run: 0,
                char: 0
            }
        );
    }

    // --- Test 4: debug format ---------------------------------------------------

    #[test]
    fn debug_format_text() {
        let path = Path::Text {
            para: 3,
            run: 1,
            char: 14,
        };
        let debug = format!("{path:?}");
        assert!(debug.contains("Text"));
        assert!(debug.contains("para: 3"));
        assert!(debug.contains("run: 1"));
        assert!(debug.contains("char: 14"));
    }

    #[test]
    fn debug_format_table() {
        let path = Path::Table {
            table: 0,
            row: 2,
            cell: 1,
            para: 0,
            run: 0,
            char: 5,
        };
        let debug = format!("{path:?}");
        assert!(debug.contains("Table"));
        assert!(debug.contains("table: 0"));
        assert!(debug.contains("row: 2"));
        assert!(debug.contains("cell: 1"));
    }

    #[test]
    fn debug_format_range() {
        let range = Range::new(
            Path::Slide {
                slide: 0,
                shape: 3,
                run: 1,
                char: 7,
            },
            Path::Slide {
                slide: 0,
                shape: 3,
                run: 1,
                char: 12,
            },
        );
        let debug = format!("{range:?}");
        assert!(debug.contains("Range"));
        assert!(debug.contains("start:"));
        assert!(debug.contains("end:"));
    }

    // --- Bonus: serde tagged JSON format validation ----------------------------

    #[test]
    fn serde_json_tag_format() {
        let path = Path::Text {
            para: 1,
            run: 0,
            char: 0,
        };
        let json = serde_json::to_value(&path).unwrap();
        assert_eq!(json["kind"], "text");
        assert_eq!(json["para"], 1);
        assert_eq!(json["run"], 0);
        assert_eq!(json["char"], 0);
    }

    #[test]
    fn serde_json_tag_format_sheet() {
        let path = Path::Sheet {
            sheet: "Revenue".to_string(),
            row: 42,
            col: 7,
        };
        let json = serde_json::to_value(&path).unwrap();
        assert_eq!(json["kind"], "sheet");
        assert_eq!(json["sheet"], "Revenue");
        assert_eq!(json["row"], 42);
        assert_eq!(json["col"], 7);
    }
}
