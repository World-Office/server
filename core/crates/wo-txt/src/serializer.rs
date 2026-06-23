//! TXT format serializer.
//!
//! Converts a TxtDocument back to bytes with specified encoding and line endings.

use wo_common::encoding::Encoding;
use wo_common::Result;

use crate::parser::TxtDocument;

/// Output encoding and line ending configuration for serialization.
#[derive(Debug, Clone)]
pub struct SerializeOptions {
    /// Target encoding (default: UTF-8).
    pub encoding: Encoding,
    /// Whether to write a BOM (default: true for UTF-8/UTF-16).
    pub write_bom: bool,
    /// Line ending style (default: CRLF for compatibility).
    pub line_ending: LineEnding,
}

/// Line ending style for output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineEnding {
    /// Unix: LF (\n)
    Lf,
    /// Windows: CRLF (\r\n)
    Crlf,
    /// Classic Mac: CR (\r)
    Cr,
}

impl Default for SerializeOptions {
    fn default() -> Self {
        Self {
            encoding: Encoding::Utf8,
            write_bom: true,
            line_ending: LineEnding::Crlf,
        }
    }
}

impl SerializeOptions {
    /// Create options for UTF-8 output with BOM.
    pub fn utf8() -> Self {
        Self::default()
    }

    /// Create options for UTF-8 output without BOM.
    pub fn utf8_no_bom() -> Self {
        Self {
            write_bom: false,
            ..Self::default()
        }
    }

    /// Create options for UTF-16 LE output with BOM.
    pub fn utf16le() -> Self {
        Self {
            encoding: Encoding::Utf16Le,
            write_bom: true,
            ..Self::default()
        }
    }

    /// Create options for UTF-16 BE output with BOM.
    pub fn utf16be() -> Self {
        Self {
            encoding: Encoding::Utf16Be,
            write_bom: true,
            ..Self::default()
        }
    }

    /// Create options with LF line endings (Unix-style).
    pub fn unix() -> Self {
        Self {
            line_ending: LineEnding::Lf,
            write_bom: false,
            ..Self::default()
        }
    }

    fn line_ending_bytes(&self) -> &[u8] {
        match self.line_ending {
            LineEnding::Lf => b"\n",
            LineEnding::Crlf => b"\r\n",
            LineEnding::Cr => b"\r",
        }
    }
}

/// TXT format serializer.
pub struct TxtSerializer {
    options: SerializeOptions,
}

impl Default for TxtSerializer {
    fn default() -> Self {
        Self::new()
    }
}

impl TxtSerializer {
    /// Create a new serializer with default options.
    pub fn new() -> Self {
        Self {
            options: SerializeOptions::default(),
        }
    }

    /// Create a serializer with custom options.
    pub fn with_options(options: SerializeOptions) -> Self {
        Self { options }
    }

    /// Serialize a TxtDocument to bytes.
    pub fn serialize(&self, doc: &TxtDocument) -> Result<Vec<u8>> {
        match self.options.encoding {
            Encoding::Utf8 => self.serialize_utf8(doc),
            Encoding::Utf16Le => self.serialize_utf16le(doc),
            Encoding::Utf16Be => self.serialize_utf16be(doc),
            _ => {
                // Fall back to UTF-8 for unsupported output encodings
                self.serialize_utf8(doc)
            }
        }
    }

    fn serialize_utf8(&self, doc: &TxtDocument) -> Result<Vec<u8>> {
        let mut output = Vec::new();

        // Write BOM
        if self.options.write_bom {
            output.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
        }

        let ending = self.options.line_ending_bytes();

        for (i, line) in doc.lines.iter().enumerate() {
            output.extend_from_slice(line.as_bytes());
            // Don't add trailing newline after last line (matching C++ writeUtf8 behavior)
            if i < doc.lines.len() - 1 {
                output.extend_from_slice(ending);
            }
        }

        Ok(output)
    }

    fn serialize_utf16le(&self, doc: &TxtDocument) -> Result<Vec<u8>> {
        let mut output = Vec::new();

        // Write BOM
        if self.options.write_bom {
            output.extend_from_slice(&[0xFF, 0xFE]);
        }

        let ending: &[u16] = match self.options.line_ending {
            LineEnding::Lf => &[0x000A],
            LineEnding::Crlf => &[0x000D, 0x000A],
            LineEnding::Cr => &[0x000D],
        };

        for (i, line) in doc.lines.iter().enumerate() {
            for ch in line.chars() {
                let mut buf = [0u16; 2];
                let encoded = ch.encode_utf16(&mut buf);
                for unit in encoded.iter() {
                    output.extend_from_slice(&unit.to_le_bytes());
                }
            }
            if i < doc.lines.len() - 1 {
                for unit in ending.iter() {
                    output.extend_from_slice(&unit.to_le_bytes());
                }
            }
        }

        Ok(output)
    }

    fn serialize_utf16be(&self, doc: &TxtDocument) -> Result<Vec<u8>> {
        let mut output = Vec::new();

        // Write BOM
        if self.options.write_bom {
            output.extend_from_slice(&[0xFE, 0xFF]);
        }

        let ending: &[u16] = match self.options.line_ending {
            LineEnding::Lf => &[0x000A],
            LineEnding::Crlf => &[0x000D, 0x000A],
            LineEnding::Cr => &[0x000D],
        };

        for (i, line) in doc.lines.iter().enumerate() {
            for ch in line.chars() {
                let mut buf = [0u16; 2];
                let encoded = ch.encode_utf16(&mut buf);
                for unit in encoded.iter() {
                    output.extend_from_slice(&unit.to_be_bytes());
                }
            }
            if i < doc.lines.len() - 1 {
                for unit in ending.iter() {
                    output.extend_from_slice(&unit.to_be_bytes());
                }
            }
        }

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::TxtParser;

    #[test]
    fn test_roundtrip_utf8() {
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions::unix());

        let input = b"hello\nworld\nfoo";
        let doc = parser.parse(input).unwrap();
        let output = serializer.serialize(&doc).unwrap();

        assert_eq!(output, input);
    }

    #[test]
    fn test_roundtrip_utf8_bom() {
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions::utf8());

        let input = b"hello\nworld";
        let doc = parser.parse(input).unwrap();
        let output = serializer.serialize(&doc).unwrap();

        // Output should have BOM
        assert!(output.starts_with(&[0xEF, 0xBB, 0xBF]));
        // Re-parse the output
        let doc2 = parser.parse(&output).unwrap();
        assert_eq!(doc2.lines, doc.lines);
    }

    #[test]
    fn test_roundtrip_utf16le() {
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions::utf16le());

        let input = b"hello\nworld";
        let doc = parser.parse(input).unwrap();
        let output = serializer.serialize(&doc).unwrap();

        // Output should have UTF-16 LE BOM
        assert!(output.starts_with(&[0xFF, 0xFE]));

        // Re-parse
        let doc2 = parser.parse(&output).unwrap();
        assert_eq!(doc2.lines, doc.lines);
        assert_eq!(doc2.encoding, Encoding::Utf16Le);
    }

    #[test]
    fn test_serialize_crlf() {
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions {
            line_ending: LineEnding::Crlf,
            write_bom: false,
            ..Default::default()
        });

        let doc = parser.parse(b"a\nb\nc").unwrap();
        let output = serializer.serialize(&doc).unwrap();

        // Should contain \r\n
        assert!(output.windows(2).any(|w| w == b"\r\n"));
    }

    #[test]
    fn test_serialize_lf() {
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions {
            line_ending: LineEnding::Lf,
            write_bom: false,
            ..Default::default()
        });

        let doc = parser.parse(b"a\r\nb\r\nc").unwrap();
        let output = serializer.serialize(&doc).unwrap();

        // Should NOT contain \r
        assert!(!output.contains(&b'\r'));
    }

    #[test]
    fn test_serialize_empty() {
        let serializer = TxtSerializer::new();
        let doc = TxtDocument {
            lines: Vec::new(),
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();

        // Empty document with BOM should just be the BOM
        assert_eq!(output, vec![0xEF, 0xBB, 0xBF]);
    }

    #[test]
    fn test_serialize_single_line_no_trailing_newline() {
        let serializer = TxtSerializer::with_options(SerializeOptions {
            write_bom: false,
            ..Default::default()
        });
        let doc = TxtDocument {
            lines: vec!["hello".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        assert_eq!(
            output, b"hello",
            "single line should not have trailing newline"
        );
    }

    #[test]
    fn test_serialize_utf16be() {
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions::utf16be());

        let input = b"hello\nworld";
        let doc = parser.parse(input).unwrap();
        let output = serializer.serialize(&doc).unwrap();

        // Output should have UTF-16 BE BOM
        assert!(output.starts_with(&[0xFE, 0xFF]));

        // Re-parse should work
        let doc2 = parser.parse(&output).unwrap();
        assert_eq!(doc2.lines, doc.lines);
        assert_eq!(doc2.encoding, Encoding::Utf16Be);
    }

    #[test]
    fn test_serialize_utf16le_no_bom() {
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions {
            encoding: Encoding::Utf16Le,
            write_bom: false,
            ..Default::default()
        });

        let doc = parser.parse(b"hello").unwrap();
        let output = serializer.serialize(&doc).unwrap();

        // No BOM
        assert!(!output.starts_with(&[0xFF, 0xFE]));
        // Leading byte should be 'h' in UTF-16LE
        assert_eq!(output[0], b'h');
    }

    #[test]
    fn test_serialize_cr_ending() {
        let serializer = TxtSerializer::with_options(SerializeOptions {
            line_ending: LineEnding::Cr,
            write_bom: false,
            ..Default::default()
        });

        let doc = TxtDocument {
            lines: vec!["a".to_string(), "b".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        assert_eq!(output, b"a\rb", "cr line ending between lines");
    }

    #[test]
    fn test_serialize_utf16le_cr_ending() {
        let serializer = TxtSerializer::with_options(SerializeOptions {
            encoding: Encoding::Utf16Le,
            line_ending: LineEnding::Cr,
            write_bom: false,
            ..Default::default()
        });

        let doc = TxtDocument {
            lines: vec!["x".to_string(), "y".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        // 0x000D = CR in UTF-16LE
        assert!(
            output.windows(2).any(|w| w == [0x0D, 0x00]),
            "CR in utf-16le output"
        );
        assert!(!output.windows(2).any(|w| w == [0x0A, 0x00]), "no LF");
    }

    #[test]
    fn test_serialize_utf16be_cr_ending() {
        let serializer = TxtSerializer::with_options(SerializeOptions {
            encoding: Encoding::Utf16Be,
            line_ending: LineEnding::Cr,
            write_bom: false,
            ..Default::default()
        });

        let doc = TxtDocument {
            lines: vec!["a".to_string(), "b".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        // 0x000D = CR in UTF-16BE
        assert!(
            output.windows(2).any(|w| w == [0x00, 0x0D]),
            "CR in utf-16be output"
        );
    }

    #[test]
    fn test_serialize_utf16be_lf_ending() {
        let serializer = TxtSerializer::with_options(SerializeOptions {
            encoding: Encoding::Utf16Be,
            line_ending: LineEnding::Lf,
            write_bom: false,
            ..Default::default()
        });

        let doc = TxtDocument {
            lines: vec!["a".to_string(), "b".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        assert!(
            output.windows(2).any(|w| w == [0x00, 0x0A]),
            "LF in utf-16be output"
        );
    }

    #[test]
    fn test_serialize_utf16be_crlf_ending() {
        let serializer = TxtSerializer::with_options(SerializeOptions {
            encoding: Encoding::Utf16Be,
            line_ending: LineEnding::Crlf,
            write_bom: false,
            ..Default::default()
        });

        let doc = TxtDocument {
            lines: vec!["a".to_string(), "b".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        assert!(
            output.windows(4).any(|w| w == [0x00, 0x0D, 0x00, 0x0A]),
            "CRLF in utf-16be"
        );
    }

    #[test]
    fn test_serialize_utf8_no_bom() {
        let serializer = TxtSerializer::with_options(SerializeOptions::utf8_no_bom());
        let doc = TxtDocument {
            lines: vec!["hello".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        assert!(!output.starts_with(&[0xEF, 0xBB, 0xBF]), "no BOM");
        assert_eq!(output, b"hello");
    }

    #[test]
    fn test_serialize_fallback_encoding() {
        // Windows1252 encoding should fall back to UTF-8
        let serializer = TxtSerializer::with_options(SerializeOptions {
            encoding: Encoding::Windows1252,
            write_bom: false,
            ..Default::default()
        });
        let doc = TxtDocument {
            lines: vec!["text".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        assert_eq!(output, b"text", "fallback encoding should produce UTF-8");
    }

    #[test]
    fn test_serializer_default() {
        let s1 = TxtSerializer::new();
        let s2: TxtSerializer = Default::default();
        let doc = TxtDocument {
            lines: vec!["test".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output1 = s1.serialize(&doc).unwrap();
        let output2 = s2.serialize(&doc).unwrap();
        assert_eq!(output1, output2, "Default should match new()");
    }

    #[test]
    fn test_utf16le_crlf_ending() {
        let serializer = TxtSerializer::with_options(SerializeOptions {
            encoding: Encoding::Utf16Le,
            line_ending: LineEnding::Crlf,
            write_bom: false,
            ..Default::default()
        });
        let doc = TxtDocument {
            lines: vec!["a".to_string(), "b".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        assert!(
            output.windows(4).any(|w| w == [0x0D, 0x00, 0x0A, 0x00]),
            "CRLF in utf-16le"
        );
    }

    #[test]
    fn test_utf16le_lf_ending() {
        let serializer = TxtSerializer::with_options(SerializeOptions {
            encoding: Encoding::Utf16Le,
            line_ending: LineEnding::Lf,
            write_bom: false,
            ..Default::default()
        });
        let doc = TxtDocument {
            lines: vec!["a".to_string(), "b".to_string()],
            encoding: Encoding::Utf8,
            had_bom: false,
        };
        let output = serializer.serialize(&doc).unwrap();
        assert!(
            output.windows(2).any(|w| w == [0x0A, 0x00]),
            "LF in utf-16le"
        );
    }
}
