//! Roundtrip implementation for Unicode text encoding conversion.
//!
//! Provides FormatRoundtrip trait implementation for testing
//! encode-decode cycles across various character encodings.
//!
//! The roundtrip flow is:
//! - parse: decode bytes from source encoding to UTF-8
//! - serialize: re-encode UTF-8 back to source encoding

use std::cell::RefCell;

use wo_common::test_harness::FormatRoundtrip;

use crate::converter::UnicodeConverter;

/// Roundtrip handler for Unicode encoding conversion.
///
/// Stores the encoding and UTF-8 result internally for re-encoding.
/// Uses interior mutability (RefCell) because FormatRoundtrip::parse takes &self.
pub struct UnicodeRoundtrip {
    /// The encoding used for the roundtrip (e.g., "windows-1252").
    encoding: RefCell<Option<String>>,
    /// The UTF-8 text from parsing.
    utf8_text: RefCell<Option<String>>,
}

impl UnicodeRoundtrip {
    /// Create a new roundtrip handler with auto-detection enabled.
    pub fn new() -> Self {
        Self {
            encoding: RefCell::new(None),
            utf8_text: RefCell::new(None),
        }
    }

    /// Create a new roundtrip handler with a specific encoding.
    pub fn with_encoding(encoding: &str) -> Self {
        Self {
            encoding: RefCell::new(Some(encoding.to_string())),
            utf8_text: RefCell::new(None),
        }
    }
}

impl Default for UnicodeRoundtrip {
    fn default() -> Self {
        Self::new()
    }
}

impl FormatRoundtrip for UnicodeRoundtrip {
    fn parse(&self, data: &[u8]) -> Result<(), String> {
        // Determine encoding: use explicitly set encoding, or auto-detect
        let encoding_label = {
            let stored = self.encoding.borrow();
            if let Some(enc) = stored.as_ref() {
                enc.clone()
            } else {
                // Auto-detect encoding from input data
                let detected = UnicodeConverter::detect_encoding(data);
                detected.name().to_string()
            }
        };

        // Create converter for the encoding
        let converter = UnicodeConverter::for_label(&encoding_label)
            .ok_or_else(|| format!("Unsupported encoding: {}", encoding_label))?;

        // Decode from source encoding to UTF-8
        let result = converter.to_utf8(data);
        let utf8_str = String::from_utf8(result.output)
            .map_err(|e| format!("Invalid UTF-8 after conversion: {}", e))?;

        // Store encoding and UTF-8 result
        *self.encoding.borrow_mut() = Some(encoding_label);
        *self.utf8_text.borrow_mut() = Some(utf8_str);

        Ok(())
    }

    fn serialize(&self) -> Result<Vec<u8>, String> {
        let encoding = self.encoding.borrow();
        let encoding_label = encoding
            .as_ref()
            .ok_or("No encoding set - parse not called")?;

        let utf8_text = self.utf8_text.borrow();
        let utf8_text = utf8_text
            .as_ref()
            .ok_or("No text parsed - parse not called")?;

        // Create converter and encode UTF-8 back to source encoding
        let converter = UnicodeConverter::for_label(encoding_label)
            .ok_or_else(|| format!("Unsupported encoding: {}", encoding_label))?;

        let result = converter.from_utf8(utf8_text);
        Ok(result.output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_to_encoding(encoding: &str, text: &str) -> Vec<u8> {
        let converter = UnicodeConverter::for_label(encoding).unwrap();
        converter.from_utf8(text).output
    }

    #[test]
    fn test_roundtrip_windows1252() {
        let rt = UnicodeRoundtrip::new();
        let text = "Hello, World! €ü";

        // Encode to Windows-1252 (input to parse)
        let input = encode_to_encoding("windows-1252", text);

        // Parse: decode Windows-1252 to UTF-8
        rt.parse(&input).expect("parse should succeed");

        // Serialize: re-encode UTF-8 to Windows-1252
        let output = rt.serialize().expect("serialize should succeed");

        // Verify roundtrip: output should match input
        assert_eq!(input, output);
    }

    #[test]
    fn test_roundtrip_iso8859_1() {
        let rt = UnicodeRoundtrip::new();
        let text = "Café résumé";

        // ISO-8859-1 is similar to Windows-1252 for most chars
        let input = encode_to_encoding("iso-8859-1", text);

        rt.parse(&input).expect("parse should succeed");
        let output = rt.serialize().expect("serialize should succeed");

        assert_eq!(input, output);
    }

    #[test]
    fn test_roundtrip_shift_jis() {
        let rt = UnicodeRoundtrip::new();
        let text = "こんにちは世界"; // Hello world in Japanese

        // Encode to Shift-JIS
        let input = encode_to_encoding("shift_jis", text);

        rt.parse(&input).expect("parse should succeed");
        let output = rt.serialize().expect("serialize should succeed");

        // Shift-JIS may not be perfectly lossless for all Unicode
        // but should roundtrip for the encoded bytes
        assert_eq!(input, output);
    }

    #[test]
    fn test_roundtrip_utf8() {
        let rt = UnicodeRoundtrip::new();
        let text = "Hello, World! 🌍";

        let input = text.as_bytes();
        rt.parse(input).expect("parse should succeed");
        let output = rt.serialize().expect("serialize should succeed");

        assert_eq!(input, output);
    }

    #[test]
    fn test_with_explicit_encoding() {
        let rt = UnicodeRoundtrip::with_encoding("windows-1252");
        let text = "Café";

        let input = encode_to_encoding("windows-1252", text);
        rt.parse(&input).expect("parse should succeed");
        let output = rt.serialize().expect("serialize should succeed");

        assert_eq!(input, output);
    }

    #[test]
    fn test_serialize_without_parse_fails() {
        let rt = UnicodeRoundtrip::new();

        let result = rt.serialize();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("parse not called"));
    }

    #[test]
    fn test_unsupported_encoding() {
        let rt = UnicodeRoundtrip::with_encoding("unsupported-encoding-xyz");
        let input = b"Hello";

        let result = rt.parse(input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported encoding"));
    }

    #[test]
    fn test_auto_detect_encoding() {
        let rt = UnicodeRoundtrip::new();

        // UTF-8 with BOM should auto-detect
        let mut input = vec![0xEF, 0xBB, 0xBF]; // UTF-8 BOM
        input.extend_from_slice(b"Hello");

        rt.parse(&input).expect("parse should succeed");
        let output = rt.serialize().expect("serialize should succeed");

        // BOM is consumed during parsing and not added during serialization
        // This is correct: UTF-8 doesn't require BOM
        assert_eq!(output, b"Hello");
        assert_eq!(String::from_utf8_lossy(&output), "Hello");
    }

    #[test]
    fn test_multiple_roundtrips() {
        let rt = UnicodeRoundtrip::new();

        // First roundtrip
        let text1 = "Hello";
        let input1 = encode_to_encoding("windows-1252", text1);
        rt.parse(&input1).expect("parse should succeed");
        let output1 = rt.serialize().expect("serialize should succeed");
        assert_eq!(input1, output1);

        // Second roundtrip with same instance
        let text2 = "World";
        let input2 = encode_to_encoding("windows-1252", text2);
        rt.parse(&input2).expect("parse should succeed");
        let output2 = rt.serialize().expect("serialize should succeed");
        assert_eq!(input2, output2);
    }
}
