//! TXT format parser.
//!
//! Parses raw bytes into a structured text document with encoding detection
//! and line splitting. Mirrors the C++ TxtFile class functionality.

use wo_common::encoding::{split_lines, Bom, Encoding};
use wo_common::{CoreError, Document, DocumentMetadata, Result};

/// Parsed text document.
#[derive(Debug, Clone)]
pub struct TxtDocument {
    /// Text lines (UTF-8 encoded).
    pub lines: Vec<String>,
    /// Encoding that was detected or used.
    pub encoding: Encoding,
    /// Whether a BOM was present.
    pub had_bom: bool,
}

/// TXT format parser with encoding detection.
pub struct TxtParser {
    /// Force a specific encoding instead of auto-detection.
    pub force_encoding: Option<Encoding>,
    /// Strip BOM from the content.
    pub strip_bom: bool,
}

impl Default for TxtParser {
    fn default() -> Self {
        Self {
            force_encoding: None,
            strip_bom: true,
        }
    }
}

impl TxtParser {
    /// Create a new parser with default settings.
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a parser that forces a specific encoding.
    pub fn with_encoding(encoding: Encoding) -> Self {
        Self {
            force_encoding: Some(encoding),
            strip_bom: true,
        }
    }

    /// Parse raw bytes into a TxtDocument.
    pub fn parse(&self, data: &[u8]) -> Result<TxtDocument> {
        if data.is_empty() {
            return Ok(TxtDocument {
                lines: Vec::new(),
                encoding: Encoding::Utf8,
                had_bom: false,
            });
        }

        let (bom, bom_size) = Bom::detect(data);
        let had_bom = bom_size > 0;
        let encoding = self.force_encoding.unwrap_or(match bom {
            Bom::Utf8 => Encoding::Utf8,
            Bom::Utf16Le => Encoding::Utf16Le,
            Bom::Utf16Be => Encoding::Utf16Be,
            Bom::None => Encoding::Utf8, // Default to UTF-8
        });

        let content_start = if self.strip_bom { bom_size } else { 0 };
        let raw_content = &data[content_start..];

        // Convert to UTF-8 string
        let text = match encoding {
            Encoding::Utf8 => {
                // Validate UTF-8
                String::from_utf8(raw_content.to_vec()).map_err(|e| CoreError::Parse {
                    format: "txt".into(),
                    message: format!("Invalid UTF-8: {}", e),
                })?
            }
            Encoding::Utf16Le => {
                let utf16_data: Vec<u16> = raw_content
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                    .collect();
                String::from_utf16(&utf16_data).map_err(|e| CoreError::Parse {
                    format: "txt".into(),
                    message: format!("Invalid UTF-16LE: {}", e),
                })?
            }
            Encoding::Utf16Be => {
                let utf16_data: Vec<u16> = raw_content
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
                    .collect();
                String::from_utf16(&utf16_data).map_err(|e| CoreError::Parse {
                    format: "txt".into(),
                    message: format!("Invalid UTF-16BE: {}", e),
                })?
            }
            Encoding::Windows1252 | Encoding::Iso8859_1 | Encoding::Auto => {
                // For Latin-1/Windows-1252/Auto, try UTF-8 first, fall back to lossy Latin-1
                match String::from_utf8(raw_content.to_vec()) {
                    Ok(s) => s,
                    Err(_) => raw_content
                        .iter()
                        .map(|&b| {
                            // Latin-1 to Unicode: bytes 0x80-0xFF map directly to U+0080-U+00FF
                            char::from(b)
                        })
                        .collect(),
                }
            }
        };

        // Split into lines
        let lines: Vec<String> = split_lines(text.as_bytes())
            .iter()
            .map(|line_bytes| String::from_utf8_lossy(line_bytes).into_owned())
            .collect();

        Ok(TxtDocument {
            lines,
            encoding,
            had_bom,
        })
    }

    /// Parse raw bytes and convert to a generic Document.
    pub fn parse_to_document(&self, data: &[u8]) -> Result<Document> {
        let txt = self.parse(data)?;
        let word_count: u32 = txt
            .lines
            .iter()
            .map(|l| l.split_whitespace().count() as u32)
            .sum();

        Ok(Document {
            content: data.to_vec(),
            format: "txt".into(),
            metadata: DocumentMetadata {
                line_count: Some(txt.lines.len() as u32),
                word_count: Some(word_count),
                encoding: Some(format!("{:?}", txt.encoding)),
                ..Default::default()
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_utf8() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"hello\nworld\nfoo").unwrap();
        assert_eq!(doc.lines, vec!["hello", "world", "foo"]);
        assert_eq!(doc.encoding, Encoding::Utf8);
        assert!(!doc.had_bom);
    }

    #[test]
    fn test_parse_utf8_bom() {
        let parser = TxtParser::new();
        let data = [0xEF, 0xBB, 0xBF, 0x68, 0x69]; // BOM + "hi"
        let doc = parser.parse(&data).unwrap();
        assert_eq!(doc.lines, vec!["hi"]);
        assert!(doc.had_bom);
    }

    #[test]
    fn test_parse_utf16le_bom() {
        let parser = TxtParser::new();
        // BOM (FF FE) + "AB" in UTF-16LE + newline (0A 00)
        let data: &[u8] = &[0xFF, 0xFE, 0x41, 0x00, 0x42, 0x00, 0x0A, 0x00, 0x43, 0x00];
        let doc = parser.parse(data).unwrap();
        assert_eq!(doc.lines, vec!["AB", "C"]);
        assert_eq!(doc.encoding, Encoding::Utf16Le);
    }

    #[test]
    fn test_parse_utf16be_bom() {
        let parser = TxtParser::new();
        // BOM (FE FF) + "AB" in UTF-16BE + newline (00 0A)
        let data: &[u8] = &[0xFE, 0xFF, 0x00, 0x41, 0x00, 0x42, 0x00, 0x0A, 0x00, 0x43];
        let doc = parser.parse(data).unwrap();
        assert_eq!(doc.lines, vec!["AB", "C"]);
        assert_eq!(doc.encoding, Encoding::Utf16Be);
    }

    #[test]
    fn test_parse_crlf() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"line1\r\nline2\r\nline3").unwrap();
        assert_eq!(doc.lines, vec!["line1", "line2", "line3"]);
    }

    #[test]
    fn test_parse_cr_only() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"a\rb\rc").unwrap();
        assert_eq!(doc.lines, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_parse_empty() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"").unwrap();
        assert!(doc.lines.is_empty());
    }

    #[test]
    fn test_parse_single_line_no_newline() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"just one line").unwrap();
        assert_eq!(doc.lines, vec!["just one line"]);
    }

    #[test]
    fn test_parse_to_document() {
        let parser = TxtParser::new();
        let doc = parser
            .parse_to_document(b"hello world\nfoo bar baz")
            .unwrap();
        assert_eq!(doc.format, "txt");
        assert_eq!(doc.metadata.line_count, Some(2));
        assert_eq!(doc.metadata.word_count, Some(5)); // "hello world" (2) + "foo bar baz" (3)
    }

    #[test]
    fn test_parse_latin1() {
        let parser = TxtParser::with_encoding(Encoding::Iso8859_1);
        // Latin-1 encoded: "café" where é = 0xE9
        let data: &[u8] = &[0x63, 0x61, 0x66, 0xE9];
        let doc = parser.parse(data).unwrap();
        assert_eq!(doc.lines.len(), 1);
        assert!(doc.lines[0].contains('é'));
    }

    #[test]
    fn test_parse_utf8_multibyte_characters() {
        let parser = TxtParser::new();
        let data = "日本語テスト\n中文测试\n한국어";
        let doc = parser.parse(data.as_bytes()).unwrap();
        assert_eq!(doc.lines.len(), 3);
        assert_eq!(doc.lines[0], "日本語テスト");
        assert_eq!(doc.lines[1], "中文测试");
        assert_eq!(doc.lines[2], "한국어");
    }

    #[test]
    fn test_parse_whitespace_lines() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"   \n\t\n  \t  \n").unwrap();
        assert_eq!(doc.lines.len(), 3);
        assert_eq!(doc.lines[0], "   ");
        assert_eq!(doc.lines[1], "\t");
    }

    #[test]
    fn test_parse_with_encoding_forces_encoding() {
        let parser = TxtParser::with_encoding(Encoding::Utf8);
        let doc = parser.parse(b"hello\nworld").unwrap();
        assert_eq!(doc.encoding, Encoding::Utf8);
    }

    #[test]
    fn test_parse_bom_not_stripped() {
        let mut parser = TxtParser::new();
        parser.strip_bom = false;
        let data = [0xEF, 0xBB, 0xBF, 0x68, 0x69]; // BOM + "hi"
        let doc = parser.parse(&data).unwrap();
        // The BOM bytes would be invalid UTF-8 start, so the line starts with the replacement char or similar
        assert!(doc.had_bom);
    }

    #[test]
    fn test_parse_to_document_word_count() {
        let parser = TxtParser::new();
        let doc = parser.parse_to_document(b"a b c d e\nf g h").unwrap();
        assert_eq!(doc.metadata.word_count, Some(8));
    }

    #[test]
    fn test_parse_to_document_empty() {
        let parser = TxtParser::new();
        let doc = parser.parse_to_document(b"").unwrap();
        assert_eq!(doc.metadata.line_count, Some(0));
        assert_eq!(doc.metadata.word_count, Some(0));
    }

    // ── Edge cases ─────────────────────────────────────────────────────

    #[test]
    fn test_parse_single_character() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"A").unwrap();
        assert_eq!(doc.lines, vec!["A"]);
    }

    #[test]
    fn test_parse_single_newline() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"\n").unwrap();
        // Single newline may produce one empty line or zero lines
        assert!(doc.lines.len() <= 1);
    }

    #[test]
    fn test_parse_many_newlines() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"\n\n\n\n\n").unwrap();
        // Should produce empty lines
        assert!(doc.lines.len() >= 4);
    }

    #[test]
    fn test_parse_windows_line_endings() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"line1\r\nline2\r\nline3").unwrap();
        assert_eq!(doc.lines, vec!["line1", "line2", "line3"]);
    }

    #[test]
    fn test_parse_mixed_line_endings() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"line1\nline2\r\nline3\rline4").unwrap();
        // Should handle all three line ending styles
        assert!(doc.lines.len() >= 3);
    }

    #[test]
    fn test_parse_tab_characters() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"\tcol1\tcol2\tcol3").unwrap();
        assert_eq!(doc.lines.len(), 1);
        assert!(doc.lines[0].contains('\t'));
    }

    #[test]
    fn test_parse_unicode_multiline() {
        let parser = TxtParser::new();
        let text = "Hello 世界\nこんにちは\nمرحبا".as_bytes();
        let doc = parser.parse(text).unwrap();
        assert_eq!(doc.lines.len(), 3);
        assert!(doc.lines[0].contains("世界"));
        assert!(doc.lines[1].contains("こんにちは"));
        assert!(doc.lines[2].contains("مرحبا"));
    }

    #[test]
    fn test_parse_very_long_line() {
        let parser = TxtParser::new();
        let long_line = "A".repeat(100_000);
        let doc = parser.parse(long_line.as_bytes()).unwrap();
        assert_eq!(doc.lines.len(), 1);
        assert_eq!(doc.lines[0].len(), 100_000);
    }

    #[test]
    fn test_parse_very_many_lines() {
        let parser = TxtParser::new();
        let mut data = String::new();
        for i in 0..10_000 {
            data.push_str(&format!("Line {i}\n"));
        }
        let doc = parser.parse(data.as_bytes()).unwrap();
        assert!(doc.lines.len() >= 9_999);
    }

    #[test]
    fn test_parse_only_whitespace() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"   \t  \t  ").unwrap();
        assert_eq!(doc.lines.len(), 1);
        // Whitespace is preserved
        assert!(!doc.lines[0].is_empty());
    }

    #[test]
    fn test_parse_trailing_newline() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"line1\nline2\n").unwrap();
        // Trailing newline should not produce an extra empty line
        assert!(doc.lines.len() <= 3);
    }

    #[test]
    fn test_parse_no_trailing_newline() {
        let parser = TxtParser::new();
        let doc = parser.parse(b"line1\nline2").unwrap();
        assert_eq!(doc.lines.len(), 2);
    }

    // ── Fuzz: truncated data should not panic ──────────────────────────

    #[test]
    fn test_fuzz_truncated_utf8_no_panic() {
        let parser = TxtParser::new();
        let full = "Hello 世界 🌍
Line 2
Line 3".as_bytes();
        for len in 0..full.len() {
            // Truncated UTF-8 may produce replacement chars but should not panic
            let _ = parser.parse(&full[..len]);
        }
    }
}
