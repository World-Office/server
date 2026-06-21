//! RTF format serializer.

use crate::model::*;

/// RTF serializer — converts RtfDocument to RTF string.
pub struct RtfSerializer;

impl RtfSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize an RtfDocument to an RTF string.
    pub fn serialize(&self, doc: &RtfDocument) -> String {
        let mut out = String::new();
        out.push_str("{\\rtf");
        out.push_str(&doc.version.to_string());

        if let Some(cp) = doc.ansi_codepage {
            out.push_str("\\ansicpg");
            out.push_str(&cp.to_string());
        }
        out.push_str("\\deff0\n");

        // Font table
        if !doc.fonts.is_empty() {
            out.push_str("{\\fonttbl");
            for font in &doc.fonts {
                out.push_str("{\\f");
                out.push_str(&font.index.to_string());
                if let Some(ref charset) = font.charset {
                    out.push_str("\\fcharset");
                    out.push_str(&charset.replace("cp", ""));
                }
                out.push(' ');
                out.push_str(&escape_rtf_text(&font.name));
                out.push_str(";}");
            }
            out.push_str("}\n");
        }

        // Color table
        if doc.colors.len() > 1 {
            out.push_str("{\\colortbl;");
            for color in &doc.colors[1..] {
                out.push_str("\\red");
                out.push_str(&color.red.to_string());
                out.push_str("\\green");
                out.push_str(&color.green.to_string());
                out.push_str("\\blue");
                out.push_str(&color.blue.to_string());
                out.push(';');
            }
            out.push_str("}\n");
        }

        // Info
        if let Some(ref info) = doc.info {
            out.push_str("{\\info");
            if let Some(ref title) = info.title {
                out.push_str("{\\title ");
                out.push_str(&escape_rtf_text(title));
                out.push('}');
            }
            if let Some(ref author) = info.author {
                out.push_str("{\\author ");
                out.push_str(&escape_rtf_text(author));
                out.push('}');
            }
            out.push_str("}\n");
        }

        // Body
        for block in &doc.body {
            out.push_str(&self.serialize_block(block));
        }

        out.push('}');
        out
    }

    fn serialize_block(&self, block: &RtfBlock) -> String {
        match block {
            RtfBlock::Paragraph {
                content,
                alignment,
                indent_left,
                indent_first,
            } => {
                let mut out = String::new();
                // Always reset paragraph state at the start of each paragraph
                out.push_str("\\pard ");
                if let Some(il) = indent_left {
                    out.push_str("\\li");
                    out.push_str(&il.to_string());
                    out.push(' ');
                }
                if let Some(fi) = indent_first {
                    out.push_str("\\fi");
                    out.push_str(&fi.to_string());
                    out.push(' ');
                }
                if let Some(align) = alignment {
                    out.push_str(match align {
                        RtfAlignment::Left => "\\ql ",
                        RtfAlignment::Center => "\\qc ",
                        RtfAlignment::Right => "\\qr ",
                        RtfAlignment::Justify => "\\qj ",
                    });
                }
                for inline in content {
                    out.push_str(&self.serialize_inline(inline));
                }
                out.push_str("\\par\n");
                out
            }
            RtfBlock::Table { rows } => {
                let mut out = String::new();
                for row in rows {
                    out.push_str("\\trowd ");
                    for cell in &row.cells {
                        if let Some(width) = cell.width {
                            out.push_str("\\cellx");
                            out.push_str(&width.to_string());
                            out.push(' ');
                        }
                    }
                    out.push_str("\\intbl \\row \\itap ");
                    for cell in &row.cells {
                        out.push_str("\\cell ");
                        for inline in &cell.content {
                            out.push_str(&self.serialize_inline(inline));
                        }
                    }
                    out.push_str("\\row\n");
                }
                out
            }
        }
    }

    fn serialize_inline(&self, inline: &RtfInline) -> String {
        match inline {
            RtfInline::Text { text } => escape_rtf_text(text),
            RtfInline::Bold { content } => {
                let mut out = String::from("\\b ");
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out.push_str("\\b0 ");
                out
            }
            RtfInline::Italic { content } => {
                let mut out = String::from("\\i ");
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out.push_str("\\i0 ");
                out
            }
            RtfInline::Underline { content } => {
                let mut out = String::from("\\ul ");
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out.push_str("\\ul0 ");
                out
            }
            RtfInline::Strikethrough { content } => {
                let mut out = String::from("\\strike ");
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out.push_str("\\strike0 ");
                out
            }
            RtfInline::Superscript { content } => {
                let mut out = String::from("\\super ");
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out.push_str("\\nosupersub ");
                out
            }
            RtfInline::Subscript { content } => {
                let mut out = String::from("\\sub ");
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out.push_str("\\nosupersub ");
                out
            }
            RtfInline::Font { index, content } => {
                let mut out = format!("\\f{} ", index);
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out
            }
            RtfInline::FontSize {
                half_points,
                content,
            } => {
                let mut out = format!("\\fs{} ", half_points);
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out
            }
            RtfInline::Color { index, content } => {
                let mut out = format!("\\cf{} ", index);
                for item in content {
                    out.push_str(&self.serialize_inline(item));
                }
                out
            }
            RtfInline::LineBreak => "\\line ".to_string(),
            RtfInline::PageBreak => "\\page ".to_string(),
            RtfInline::Tab => "\\tab ".to_string(),
        }
    }
}

impl Default for RtfSerializer {
    fn default() -> Self {
        Self::new()
    }
}

/// Escape special characters in RTF text content.
fn escape_rtf_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '{' => out.push_str("\\{"),
            '}' => out.push_str("\\}"),
            '\\' => out.push_str("\\\\"),
            _ => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_simple() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![RtfInline::Text {
                    text: "Hello".to_string(),
                }],
                alignment: None,
                indent_left: None,
                indent_first: None,
            }],
            info: None,
        };
        let ser = RtfSerializer::new();
        let out = ser.serialize(&doc);
        assert!(out.contains("\\rtf1"));
        assert!(out.contains("Hello"));
        assert!(out.contains("\\par"));
        assert!(out.starts_with('{'));
        assert!(out.ends_with('}'));
    }

    #[test]
    fn test_serialize_roundtrip() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![RtfFont {
                index: 0,
                name: "Arial".into(),
                alt_name: None,
                charset: None,
            }],
            colors: vec![],
            info: Some(RtfInfo {
                title: Some("Test".into()),
                ..Default::default()
            }),
            body: vec![RtfBlock::Paragraph {
                content: vec![RtfInline::Text {
                    text: "Hello World".into(),
                }],
                alignment: None,
                indent_left: None,
                indent_first: None,
            }],
        };
        let ser = RtfSerializer::new();
        let out = ser.serialize(&doc);
        assert!(out.contains("\\rtf1"));
        assert!(out.contains("Arial"));
        assert!(out.contains("Test"));
        assert!(out.contains("Hello World"));
        assert!(out.starts_with('{'));
        assert!(out.ends_with('}'));
    }

    #[test]
    fn test_escape_rtf_text() {
        assert_eq!(escape_rtf_text("a{b}c"), "a\\{b\\}c");
        assert_eq!(escape_rtf_text("back\\slash"), "back\\\\slash");
    }

    #[test]
    fn test_escape_rtf_text_plain() {
        assert_eq!(escape_rtf_text("hello world"), "hello world");
    }

    #[test]
    fn test_escape_rtf_text_empty() {
        assert_eq!(escape_rtf_text(""), "");
    }

    // ---------------------------------------------------------------------------
    // serialize() branch coverage
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_with_ansi_codepage() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: Some(1252),
            fonts: vec![],
            colors: vec![],
            body: vec![],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\ansicpg1252"), "ansi codepage in output");
    }

    #[test]
    fn test_serialize_font_with_charset() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![RtfFont {
                index: 0,
                name: "Times New Roman".into(),
                alt_name: None,
                charset: Some("cp1252".into()),
            }],
            colors: vec![],
            body: vec![],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\fcharset1252"), "charset after stripping cp prefix");
    }

    #[test]
    fn test_serialize_color_table() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![
                RtfColor { red: 0, green: 0, blue: 0 },   // auto — skipped
                RtfColor { red: 255, green: 0, blue: 0 }, // red
            ],
            body: vec![],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\colortbl"), "color table header");
        assert!(out.contains("\\red255\\green0\\blue0"), "red color");
    }

    #[test]
    fn test_serialize_info_with_author() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![],
            info: Some(RtfInfo {
                title: Some("Doc".into()),
                author: Some("Alice".into()),
                ..Default::default()
            }),
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\title Doc"), "info title");
        assert!(out.contains("\\author Alice"), "info author");
    }

    // ---------------------------------------------------------------------------
    // Inline element tests
    // ---------------------------------------------------------------------------

    fn make_para(inline: RtfInline) -> RtfDocument {
        RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![inline],
                alignment: None,
                indent_left: None,
                indent_first: None,
            }],
            info: None,
        }
    }

    #[test]
    fn test_serialize_bold() {
        let doc = make_para(RtfInline::Bold {
            content: vec![RtfInline::Text { text: "bold".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\b "), "bold on");
        assert!(out.contains("\\b0 "), "bold off");
        assert!(out.contains("bold"), "bold text");
    }

    #[test]
    fn test_serialize_italic() {
        let doc = make_para(RtfInline::Italic {
            content: vec![RtfInline::Text { text: "em".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\i "));
        assert!(out.contains("\\i0 "));
        assert!(out.contains("em"));
    }

    #[test]
    fn test_serialize_underline() {
        let doc = make_para(RtfInline::Underline {
            content: vec![RtfInline::Text { text: "und".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\ul "));
        assert!(out.contains("\\ul0 "));
        assert!(out.contains("und"));
    }

    #[test]
    fn test_serialize_strikethrough() {
        let doc = make_para(RtfInline::Strikethrough {
            content: vec![RtfInline::Text { text: "strike".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\strike "));
        assert!(out.contains("\\strike0 "));
        assert!(out.contains("strike"));
    }

    #[test]
    fn test_serialize_superscript() {
        let doc = make_para(RtfInline::Superscript {
            content: vec![RtfInline::Text { text: "sup".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\super "));
        assert!(out.contains("\\nosupersub "));
        assert!(out.contains("sup"));
    }

    #[test]
    fn test_serialize_subscript() {
        let doc = make_para(RtfInline::Subscript {
            content: vec![RtfInline::Text { text: "sub".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\sub "));
        assert!(out.contains("\\nosupersub "));
        assert!(out.contains("sub"));
    }

    #[test]
    fn test_serialize_font() {
        let doc = make_para(RtfInline::Font {
            index: 2,
            content: vec![RtfInline::Text { text: "ftext".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\f2 "));
        assert!(out.contains("ftext"));
    }

    #[test]
    fn test_serialize_font_size() {
        let doc = make_para(RtfInline::FontSize {
            half_points: 24,
            content: vec![RtfInline::Text { text: "big".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\fs24 "));
        assert!(out.contains("big"));
    }

    #[test]
    fn test_serialize_color() {
        let doc = make_para(RtfInline::Color {
            index: 1,
            content: vec![RtfInline::Text { text: "colored".into() }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\cf1 "));
        assert!(out.contains("colored"));
    }

    #[test]
    fn test_serialize_linebreak() {
        let doc = make_para(RtfInline::LineBreak);
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\line "));
    }

    #[test]
    fn test_serialize_pagebreak() {
        let doc = make_para(RtfInline::PageBreak);
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\page "));
    }

    #[test]
    fn test_serialize_tab() {
        let doc = make_para(RtfInline::Tab);
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\tab "));
    }

    // ---------------------------------------------------------------------------
    // Paragraph formatting
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_paragraph_indent_left() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![RtfInline::Text { text: "indent".into() }],
                alignment: None,
                indent_left: Some(720),
                indent_first: None,
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\li720"), "left indent");
        assert!(out.contains("indent"));
    }

    #[test]
    fn test_serialize_paragraph_indent_first() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![RtfInline::Text { text: "fi".into() }],
                alignment: None,
                indent_left: None,
                indent_first: Some(360),
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\fi360"), "first-line indent");
    }

    #[test]
    fn test_serialize_paragraph_alignment_left() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![RtfInline::Text { text: "L".into() }],
                alignment: Some(RtfAlignment::Left),
                indent_left: None,
                indent_first: None,
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\ql "), "left align");
    }

    #[test]
    fn test_serialize_paragraph_alignment_center() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![RtfInline::Text { text: "C".into() }],
                alignment: Some(RtfAlignment::Center),
                indent_left: None,
                indent_first: None,
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\qc "), "center align");
    }

    #[test]
    fn test_serialize_paragraph_alignment_right() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![RtfInline::Text { text: "R".into() }],
                alignment: Some(RtfAlignment::Right),
                indent_left: None,
                indent_first: None,
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\qr "), "right align");
    }

    #[test]
    fn test_serialize_paragraph_alignment_justify() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![RtfInline::Text { text: "J".into() }],
                alignment: Some(RtfAlignment::Justify),
                indent_left: None,
                indent_first: None,
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\qj "), "justify align");
    }

    // ---------------------------------------------------------------------------
    // Table
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_table() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Table {
                rows: vec![RtfTableRow {
                    cells: vec![RtfTableCell {
                        content: vec![RtfInline::Text { text: "cell1".into() }],
                        width: Some(1000),
                    }],
                }],
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\trowd "), "table row start");
        assert!(out.contains("\\cellx1000"), "cell width");
        assert!(out.contains("\\intbl"), "in table");
        assert!(out.contains("\\cell "), "cell marker");
        assert!(out.contains("cell1"), "cell content");
    }

    #[test]
    fn test_serialize_table_cell_no_width() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Table {
                rows: vec![RtfTableRow {
                    cells: vec![RtfTableCell {
                        content: vec![RtfInline::Text { text: "nowidth".into() }],
                        width: None,
                    }],
                }],
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\trowd "), "table row start");
        assert!(!out.contains("\\cellx"), "no cellx without width");
        assert!(out.contains("nowidth"), "cell content");
    }

    // ---------------------------------------------------------------------------
    // Default impl
    // ---------------------------------------------------------------------------

    // ---------------------------------------------------------------------------
    // Nested inline formatting
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_nested_bold_italic() {
        let doc = make_para(RtfInline::Bold {
            content: vec![RtfInline::Italic {
                content: vec![RtfInline::Text { text: "bold+italic".into() }],
            }],
        });
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\b "), "bold on");
        assert!(out.contains("\\i "), "italic on");
        assert!(out.contains("\\i0 "), "italic off");
        assert!(out.contains("\\b0 "), "bold off");
        assert!(out.contains("bold+italic"), "nested text");
    }

    // ---------------------------------------------------------------------------
    // Multiple paragraphs
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_multiple_paragraphs() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![
                RtfBlock::Paragraph {
                    content: vec![RtfInline::Text { text: "First para".into() }],
                    alignment: None,
                    indent_left: None,
                    indent_first: None,
                },
                RtfBlock::Paragraph {
                    content: vec![RtfInline::Text { text: "Second para".into() }],
                    alignment: Some(RtfAlignment::Center),
                    indent_left: None,
                    indent_first: None,
                },
            ],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("First para"), "first paragraph text");
        assert!(out.contains("Second para"), "second paragraph text");
        assert!(out.contains("\\qc "), "second paragraph centered");
        assert_eq!(out.matches("\\par\n").count(), 2, "two paragraph marks");
    }

    // ---------------------------------------------------------------------------
    // Multiple table rows
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_multiple_table_rows() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Table {
                rows: vec![
                    RtfTableRow {
                        cells: vec![RtfTableCell {
                            content: vec![RtfInline::Text { text: "row1cell1".into() }],
                            width: Some(1000),
                        }],
                    },
                    RtfTableRow {
                        cells: vec![RtfTableCell {
                            content: vec![RtfInline::Text { text: "row2cell1".into() }],
                            width: Some(2000),
                        }],
                    },
                ],
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("row1cell1"), "first row cell");
        assert!(out.contains("row2cell1"), "second row cell");
        assert!(out.contains("\\cellx1000"), "first cell width");
        assert!(out.contains("\\cellx2000"), "second cell width");
        assert_eq!(out.matches("\\trowd ").count(), 2, "two table rows");
        assert_eq!(out.matches("\\row\n").count(), 2, "two row marks");
    }

    // ---------------------------------------------------------------------------
    // Empty body
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_empty_body() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.starts_with('{'), "starts with brace");
        assert!(out.ends_with('}'), "ends with brace");
        assert!(out.contains("\\rtf1"), "has rtf header");
        assert!(!out.contains("\\par"), "no paragraph in empty body");
        assert!(!out.contains("\\pard"), "no pard in empty body");
    }

    // ---------------------------------------------------------------------------
    // Combined all-features integration test
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_all_features() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: Some(65001),
            fonts: vec![
                RtfFont {
                    index: 0,
                    name: "Arial".into(),
                    alt_name: None,
                    charset: Some("cp1252".into()),
                },
                RtfFont {
                    index: 1,
                    name: "Times New Roman".into(),
                    alt_name: None,
                    charset: None,
                },
            ],
            colors: vec![
                RtfColor { red: 0, green: 0, blue: 0 },
                RtfColor { red: 255, green: 0, blue: 0 },
            ],
            info: Some(RtfInfo {
                title: Some("Integration Test".into()),
                author: Some("Tester".into()),
                ..Default::default()
            }),
            body: vec![
                RtfBlock::Paragraph {
                    content: vec![
                        RtfInline::Text { text: "Normal text ".into() },
                        RtfInline::Bold {
                            content: vec![RtfInline::Text { text: "bold".into() }],
                        },
                    ],
                    alignment: Some(RtfAlignment::Center),
                    indent_left: Some(100),
                    indent_first: Some(50),
                },
                RtfBlock::Table {
                    rows: vec![RtfTableRow {
                        cells: vec![RtfTableCell {
                            content: vec![RtfInline::Italic {
                                content: vec![RtfInline::Text { text: "italic cell".into() }],
                            }],
                            width: Some(2000),
                        }],
                    }],
                },
            ],
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\ansicpg65001"), "unicode codepage");
        assert!(out.contains("\\fcharset1252"), "font charset");
        assert!(out.contains("Times New Roman"), "second font");
        assert!(out.contains("\\colortbl"), "color table");
        assert!(out.contains("\\red255\\green0\\blue0"), "red color");
        assert!(out.contains("\\title Integration Test"), "info title");
        assert!(out.contains("\\author Tester"), "info author");
        assert!(out.contains("Normal text"), "normal text");
        assert!(out.contains("\\b "), "bold on");
        assert!(out.contains("bold"), "bold text");
        assert!(out.contains("\\b0 "), "bold off");
        assert!(out.contains("\\qc "), "center align");
        assert!(out.contains("\\li100"), "left indent");
        assert!(out.contains("\\fi50"), "first indent");
        assert!(out.contains("\\trowd "), "table row");
        assert!(out.contains("\\cellx2000"), "cell width");
        assert!(out.contains("italic cell"), "italic cell content");
    }

    // ---------------------------------------------------------------------------
    // Combined inline formatting in a single paragraph
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_combined_inline() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![RtfBlock::Paragraph {
                content: vec![
                    RtfInline::Bold {
                        content: vec![RtfInline::Text { text: "B".into() }],
                    },
                    RtfInline::Italic {
                        content: vec![RtfInline::Text { text: "I".into() }],
                    },
                    RtfInline::Underline {
                        content: vec![RtfInline::Text { text: "U".into() }],
                    },
                ],
                alignment: None,
                indent_left: None,
                indent_first: None,
            }],
            info: None,
        };
        let out = RtfSerializer::new().serialize(&doc);
        assert!(out.contains("\\b "), "bold on");
        assert!(out.contains("\\b0 "), "bold off");
        assert!(out.contains("\\i "), "italic on");
        assert!(out.contains("\\i0 "), "italic off");
        assert!(out.contains("\\ul "), "underline on");
        assert!(out.contains("\\ul0 "), "underline off");
        assert!(out.contains("B"), "bold text");
        assert!(out.contains("I"), "italic text");
        assert!(out.contains("U"), "underline text");
    }

    #[test]
    fn test_serializer_default() {
        let s1 = RtfSerializer::new();
        let s2: RtfSerializer = Default::default();
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            body: vec![],
            info: None,
        };
        assert_eq!(s1.serialize(&doc), s2.serialize(&doc), "Default should match new()");
    }
}
