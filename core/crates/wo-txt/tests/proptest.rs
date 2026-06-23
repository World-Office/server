//! Property-based tests for wo-txt using proptest.
//!
//! Verifies that the TXT parser and serializer maintain invariants
//! across a wide range of inputs.

use proptest::prelude::*;
use wo_txt::parser::TxtParser;
use wo_txt::serializer::{SerializeOptions, TxtSerializer};

proptest! {
    /// Roundtrip: parse(lines) → serialize → parse should recover original lines.
    ///
    /// Generates random sequences of non-newline strings and joins them with \n,
    /// then verifies that parse-serialize-parse recovers the same lines.
    #[test]
    fn parse_serialize_parse_roundtrip(
        ref lines in prop::collection::vec(
            prop::string::string_regex("[^\n]{0,50}").unwrap(),
            0..10,
        ),
    ) {
        let input = lines.join("\n");
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions::unix());

        let doc = parser.parse(input.as_bytes());
        prop_assume!(doc.is_ok());
        let doc = doc.unwrap();

        let output = serializer.serialize(&doc).unwrap();
        let doc2 = parser.parse(&output).unwrap();

        prop_assert_eq!(doc2.lines, doc.lines);
    }

    /// Stable property: serialized output does not contain CR (\r) when using LF line endings.
    #[test]
    fn serialize_unix_no_cr(
        ref lines in prop::collection::vec(
            prop::string::string_regex("[^\n\r]{0,30}").unwrap(),
            0..5,
        ),
    ) {
        let input = lines.join("\n");
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions::unix());

        let doc = parser.parse(input.as_bytes());
        prop_assume!(doc.is_ok());
        let doc = doc.unwrap();

        let output = serializer.serialize(&doc).unwrap();
        prop_assert!(!output.contains(&b'\r'), "LF-mode output should never contain CR");
    }

    /// Identity: parsing UTF-8 text and serializing with same encoding preserves bytes
    /// when the input contains no line-ending normalization artifacts.
    #[test]
    fn parse_serialize_identity(
        ref text in prop::string::string_regex("[^\n\r\u{FEFF}]{1,100}").unwrap(),
    ) {
        // Single-line text with no line endings should be identical after
        // parse → serialize with matching options
        let parser = TxtParser::new();
        let serializer = TxtSerializer::with_options(SerializeOptions::unix());

        let doc = parser.parse(text.as_bytes());
        prop_assume!(doc.is_ok());
        let doc = doc.unwrap();

        let output = serializer.serialize(&doc).unwrap();
        // For single line with LF mode, output should match input exactly
        prop_assert_eq!(String::from_utf8_lossy(&output), text.as_str());
    }
}
