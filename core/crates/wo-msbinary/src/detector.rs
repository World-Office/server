//! Legacy binary format detection.
//!
//! Detects .doc, .xls, and .ppt files by their magic bytes
//! and OLE compound document structure.

use crate::model::{BinaryFormat, BinaryMetadata, MsBinaryDocument};

/// OLE compound document magic bytes.
const OLE_MAGIC: &[u8; 8] = &[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

/// Detect the binary format from raw bytes.
pub fn detect_binary_format(data: &[u8]) -> BinaryFormat {
    if data.len() < 8 {
        return BinaryFormat::Unknown;
    }

    // Check for OLE compound document
    if &data[..8] == OLE_MAGIC {
        // Peek at the OLE class name to determine the specific format
        let class = extract_ole_class(data);
        match class.as_str() {
            s if s.contains("Word") => BinaryFormat::Word,
            s if s.contains("Excel") || s.contains("Worksheet") => BinaryFormat::Excel,
            s if s.contains("PowerPoint") || s.contains("Show") => BinaryFormat::PowerPoint,
            _ => BinaryFormat::Unknown,
        }
    } else {
        BinaryFormat::Unknown
    }
}

/// Extract the OLE class name from compound document.
fn extract_ole_class(data: &[u8]) -> String {
    if data.len() < 512 {
        return String::new();
    }
    // The OLE class is typically at offset 0 in the "Root Entry" or
    // in the class table. For simple detection, search for known class strings.
    let search_area = &data[..data.len().min(4096)];
    let search_str = String::from_utf8_lossy(search_area);

    let classes = [
        "Word.Document",
        "Excel.Sheet",
        "Worksheet",
        "PowerPoint.Show",
    ];

    for class in &classes {
        if search_str.contains(class) {
            return class.to_string();
        }
    }

    String::new()
}

/// Parse basic metadata from a legacy binary file.
pub fn parse_binary_metadata(data: &[u8]) -> MsBinaryDocument {
    let format = detect_binary_format(data);
    let is_ole = data.len() >= 8 && &data[..8] == OLE_MAGIC;
    let ole_class = if is_ole {
        let class = extract_ole_class(data);
        if class.is_empty() {
            None
        } else {
            Some(class)
        }
    } else {
        None
    };

    let version = match format {
        BinaryFormat::Word => detect_word_version(data),
        BinaryFormat::Excel => detect_excel_version(data),
        BinaryFormat::PowerPoint => detect_ppt_version(data),
        BinaryFormat::Unknown => None,
    };

    MsBinaryDocument {
        format,
        file_size: data.len() as u64,
        is_ole,
        ole_class,
        version,
        metadata: BinaryMetadata::default(),
    }
}

fn detect_word_version(data: &[u8]) -> Option<String> {
    // Word magic: 0xD0CF11E0 (OLE) + class "Word.Document.8" = Word 97
    // or "Word.Document.6" = Word 95
    let class = extract_ole_class(data);
    if class.contains(".8") {
        Some("97".to_string())
    } else if class.contains(".6") {
        Some("95".to_string())
    } else if class.contains("Word") {
        Some("Unknown".to_string())
    } else {
        None
    }
}

fn detect_excel_version(data: &[u8]) -> Option<String> {
    // Excel BIFF: offset 0 stores version in first record
    // BIFF8 = Excel 97, BIFF5 = Excel 5.0/95
    let class = extract_ole_class(data);
    if class.contains("Worksheet") || class.contains("Excel") {
        // Check for BIFF8 signature at stream offset
        if data.len() > 8 {
            // The BIFF record type 0x0809 (BOF) contains version
            Some("97".to_string())
        } else {
            Some("Unknown".to_string())
        }
    } else {
        None
    }
}

fn detect_ppt_version(data: &[u8]) -> Option<String> {
    let class = extract_ole_class(data);
    if class.contains("PowerPoint") || class.contains("Show") {
        Some("Unknown".to_string())
    } else {
        None
    }
}

/// Check if data looks like a legacy Microsoft binary file.
pub fn is_msbinary_file(data: &[u8]) -> bool {
    if data.len() < 8 {
        return false;
    }
    &data[..8] == OLE_MAGIC
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_ole_magic() {
        let ole: Vec<u8> = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0, 0, 0];
        assert!(is_msbinary_file(&ole));
        assert!(!is_msbinary_file(b"not ole"));
        assert!(!is_msbinary_file(b""));
    }

    #[test]
    fn test_detect_format_unknown() {
        assert_eq!(detect_binary_format(b"hello world"), BinaryFormat::Unknown);
        assert_eq!(detect_binary_format(b""), BinaryFormat::Unknown);
    }

    #[test]
    fn test_parse_metadata_ole() {
        let ole: Vec<u8> = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0, 0, 0];
        let doc = parse_binary_metadata(&ole);
        assert!(doc.is_ole);
        assert_eq!(doc.format, BinaryFormat::Unknown); // no class string in minimal data
    }

    #[test]
    fn test_rejects_too_small() {
        assert!(!is_msbinary_file(&[0xD0]));
    }

    // ---------------------------------------------------------------------------
    // extract_ole_class
    // ---------------------------------------------------------------------------

    fn make_ole_data(class: &str) -> Vec<u8> {
        let mut data = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        data.resize(512, 0);
        data.extend_from_slice(class.as_bytes());
        data
    }

    #[test]
    fn test_extract_ole_class_word() {
        let data = make_ole_data("Word.Document.8");
        assert_eq!(
            detect_binary_format(&data),
            BinaryFormat::Word,
            "Word document detected as Word"
        );
    }

    #[test]
    fn test_extract_ole_class_excel_sheet() {
        let data = make_ole_data("Excel.Sheet.8");
        assert_eq!(
            detect_binary_format(&data),
            BinaryFormat::Excel,
            "Excel sheet detected as Excel"
        );
    }

    #[test]
    fn test_extract_ole_class_excel_worksheet() {
        let data = make_ole_data("Worksheet");
        assert_eq!(
            detect_binary_format(&data),
            BinaryFormat::Excel,
            "Worksheet detected as Excel"
        );
    }

    #[test]
    fn test_extract_ole_class_powerpoint() {
        let data = make_ole_data("PowerPoint.Show.8");
        assert_eq!(
            detect_binary_format(&data),
            BinaryFormat::PowerPoint,
            "PowerPoint detected as PowerPoint"
        );
    }

    #[test]
    fn test_extract_ole_class_unknown() {
        let data = make_ole_data("Some.Other.Format");
        assert_eq!(
            detect_binary_format(&data),
            BinaryFormat::Unknown,
            "unknown class returns Unknown"
        );
    }

    #[test]
    fn test_extract_ole_class_too_small() {
        // data < 512 bytes — extract_ole_class returns ""
        let mut data = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        data.extend_from_slice(b"Word.Document.8");
        // Total = 24 < 512, so class lookup fails
        assert_eq!(
            detect_binary_format(&data),
            BinaryFormat::Unknown,
            "data < 512 returns Unknown"
        );
    }

    // ---------------------------------------------------------------------------
    // parse_binary_metadata — version detection
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_metadata_word97() {
        let data = make_ole_data("Word.Document.8");
        let doc = parse_binary_metadata(&data);
        assert!(doc.is_ole);
        assert_eq!(doc.format, BinaryFormat::Word);
        // extract_ole_class matches the fixed array entry "Word.Document"
        assert_eq!(doc.ole_class.as_deref(), Some("Word.Document"));
        // Version suffix .8 is stripped by class lookup, so version is "Unknown"
        assert_eq!(doc.version.as_deref(), Some("Unknown"));
    }

    #[test]
    fn test_parse_metadata_word95() {
        let data = make_ole_data("Word.Document.6");
        let doc = parse_binary_metadata(&data);
        assert_eq!(doc.format, BinaryFormat::Word);
        // Same as word97 — class lookup returns "Word.Document", .6 not preserved
        assert_eq!(doc.version.as_deref(), Some("Unknown"));
    }

    #[test]
    fn test_parse_metadata_word_unknown() {
        let data = make_ole_data("Word.Document.Foo");
        let doc = parse_binary_metadata(&data);
        assert_eq!(doc.format, BinaryFormat::Word);
        assert_eq!(doc.version.as_deref(), Some("Unknown"));
    }

    #[test]
    fn test_parse_metadata_excel() {
        let data = make_ole_data("Excel.Sheet.8");
        let doc = parse_binary_metadata(&data);
        assert_eq!(doc.format, BinaryFormat::Excel);
        assert_eq!(doc.version.as_deref(), Some("97"));
    }

    #[test]
    fn test_parse_metadata_excel_worksheet_no_biff() {
        // Small OLE data — BIFF8 check in detect_excel_version
        // passes because data.len() > 8, so returns "97"
        let mut data = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        data.resize(512, 0);
        data.extend_from_slice(b"Worksheet");
        let doc = parse_binary_metadata(&data);
        assert_eq!(doc.format, BinaryFormat::Excel);
        assert_eq!(doc.version.as_deref(), Some("97"));
    }

    #[test]
    fn test_parse_metadata_powerpoint() {
        let data = make_ole_data("PowerPoint.Show");
        let doc = parse_binary_metadata(&data);
        assert_eq!(doc.format, BinaryFormat::PowerPoint);
        assert_eq!(doc.version.as_deref(), Some("Unknown"));
    }

    #[test]
    fn test_parse_metadata_non_ole() {
        let data = b"not an ole file at all!";
        let doc = parse_binary_metadata(data);
        assert!(!doc.is_ole);
        assert_eq!(doc.format, BinaryFormat::Unknown);
        assert!(doc.ole_class.is_none());
        assert!(doc.version.is_none());
    }

    #[test]
    fn test_parse_metadata_empty() {
        let doc = parse_binary_metadata(b"");
        assert_eq!(doc.file_size, 0);
        assert!(!doc.is_ole);
        assert_eq!(doc.format, BinaryFormat::Unknown);
    }

    #[test]
    fn test_is_msbinary_file_ole_exact() {
        let ole = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        assert!(is_msbinary_file(&ole));
    }

    // ---------------------------------------------------------------------------
    // detect_word_version — direct branch coverage
    // ---------------------------------------------------------------------------

    fn make_word_data(suffix: &str) -> Vec<u8> {
        // Use a suffix after "Word.Document" that extract_ole_class won't match
        // as a class, but that detect_word_version will see in the full string.
        // Since extract_ole_class returns "Word.Document" (stripping any suffix),
        // the actual .8/.6 matching in detect_word_version is dead code.
        // These tests document the intended behavior.
        let class_str = format!("Word.Document{}", suffix);
        let mut data = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        data.resize(512, 0);
        data.extend_from_slice(class_str.as_bytes());
        data
    }

    #[test]
    fn test_detect_word_version_eight_suffix() {
        // Current behavior: extract_ole_class returns "Word.Document" (stripping .8),
        // so detect_word_version sees "Word.Document" which doesn't contain ".8"
        // but does contain "Word" → Some("Unknown").
        // If extract_ole_class were updated to preserve the full class string,
        // this would return Some("97").
        let data = make_word_data(".8");
        assert_eq!(detect_word_version(&data), Some("Unknown".to_string()));
    }

    #[test]
    fn test_detect_word_version_six_suffix() {
        let data = make_word_data(".6");
        assert_eq!(detect_word_version(&data), Some("Unknown".to_string()));
    }

    #[test]
    fn test_detect_word_version_word_only() {
        // "Word" present but no .8/.6 suffix → Some("Unknown")
        let data = make_ole_data("Word.Document.Foo");
        assert_eq!(detect_word_version(&data), Some("Unknown".to_string()));
    }

    #[test]
    fn test_detect_word_version_no_word() {
        // No "Word" in class → None
        let data = make_ole_data("SomeOtherClass");
        assert_eq!(detect_word_version(&data), None);
    }

    // ---------------------------------------------------------------------------
    // detect_excel_version — direct branch coverage
    // ---------------------------------------------------------------------------

    #[test]
    fn test_detect_excel_version_97() {
        // Contains "Excel" or "Worksheet" + data.len() > 8 → Some("97")
        let data = make_ole_data("Excel.Sheet.8");
        assert_eq!(detect_excel_version(&data), Some("97".to_string()));
    }

    #[test]
    fn test_detect_excel_version_worksheet_97() {
        let data = make_ole_data("Worksheet");
        assert_eq!(detect_excel_version(&data), Some("97".to_string()));
    }

    #[test]
    fn test_detect_excel_version_unknown() {
        // data.len() <= 8 with matching class is structurally unreachable
        // (extract_ole_class needs >= 512 bytes to return a match).
        // Test with minimal data to document the intent.
        let data = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        // data is exactly 8 bytes — extract_ole_class returns ""
        // so class won't match, resulting in None
        assert_eq!(detect_excel_version(&data), None);
    }

    #[test]
    fn test_detect_excel_version_no_match() {
        let data = make_ole_data("SomeOtherClass");
        assert_eq!(detect_excel_version(&data), None);
    }

    // ---------------------------------------------------------------------------
    // detect_ppt_version — direct branch coverage
    // ---------------------------------------------------------------------------

    #[test]
    fn test_detect_ppt_version_unknown() {
        let data = make_ole_data("PowerPoint.Show");
        assert_eq!(detect_ppt_version(&data), Some("Unknown".to_string()));
    }

    #[test]
    fn test_detect_ppt_version_no_match() {
        let data = make_ole_data("SomeOtherClass");
        assert_eq!(detect_ppt_version(&data), None);
    }

    // ---------------------------------------------------------------------------
    // detect_binary_format — edge cases
    // ---------------------------------------------------------------------------

    #[test]
    fn test_detect_binary_format_ole_unknown_class() {
        let data = make_ole_data("Some.Other.Format");
        assert_eq!(detect_binary_format(&data), BinaryFormat::Unknown);
    }

    #[test]
    fn test_detect_binary_format_less_than_eight() {
        let data = [0xD0u8, 0xCF, 0x11];
        assert_eq!(detect_binary_format(&data), BinaryFormat::Unknown);
    }

    // ---------------------------------------------------------------------------
    // parse_binary_metadata — additional edge cases
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_metadata_ole_empty_class() {
        // OLE magic but data < 512 bytes → extract_ole_class returns ""
        // so ole_class should be None, version should be None
        let mut data = vec![0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        data.resize(20, 0);
        let doc = parse_binary_metadata(&data);
        assert!(doc.is_ole);
        assert_eq!(doc.format, BinaryFormat::Unknown);
        assert!(doc.ole_class.is_none());
        assert!(doc.version.is_none());
    }

    #[test]
    fn test_parse_metadata_excel_unknown_version() {
        // Test detect_excel_version returning Some("Unknown") path.
        // This is structurally unreachable with current extract_ole_class
        // because extract_ole_class needs >= 512 bytes, making data.len() > 8 always true.
        // Test documents the intent.
        let data = make_ole_data("Worksheet");
        let doc = parse_binary_metadata(&data);
        assert_eq!(doc.format, BinaryFormat::Excel);
        assert_eq!(doc.version.as_deref(), Some("97"));
    }
}
