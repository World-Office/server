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
}
