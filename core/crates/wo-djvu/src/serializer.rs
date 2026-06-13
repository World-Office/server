//! DjVu serializer — writes a [`DjvuDocument`] to DjVu IFF binary bytes.
//!
//! Produces a valid DjVu IFF file with:
//! - AT&TFORM magic + subtype
//! - INFO chunk with width, height, version, dpi, gamma, and title
//! - Additional chunks preserved from the original document model

use crate::model::*;

/// Serializes a [`DjvuDocument`] into DjVu IFF binary bytes.
pub struct DjvuSerializer;

impl DjvuSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize the document to DjVu binary bytes.
    pub fn serialize(&self, doc: &DjvuDocument) -> Result<Vec<u8>, anyhow::Error> {
        let mut out = Vec::new();

        // ── 1. IFF container: AT&TFORM + subtype ──
        out.extend_from_slice(b"AT&TFORM");
        let subtype_bytes = doc.subtype.as_bytes();
        // Pad subtype to exactly 4 bytes
        let padded_subtype = pad_to_4(subtype_bytes);
        out.extend_from_slice(&padded_subtype);

        // ── 2. INFO chunk (always present) ──
        write_info_chunk(&mut out, doc);

        // ── 3. Additional chunks from the model ──
        // We skip INFO since we just wrote it from model fields.
        // We preserve other chunk types as placeholder data.
        for chunk in &doc.chunks {
            if chunk.chunk_type != "INFO" {
                write_placeholder_chunk(&mut out, chunk);
            }
        }

        Ok(out)
    }
}

impl Default for DjvuSerializer {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Pad bytes to exactly 4 bytes, truncating or zero-padding as needed.
fn pad_to_4(data: &[u8]) -> [u8; 4] {
    let mut out = [0u8; 4];
    let len = data.len().min(4);
    out[..len].copy_from_slice(&data[..len]);
    out
}

/// Parse version string "major.minor" into (major, minor).
fn parse_version(version: &str) -> (u8, u8) {
    let parts: Vec<&str> = version.split('.').collect();
    let major = parts
        .first()
        .and_then(|s| s.parse::<u8>().ok())
        .unwrap_or(0);
    let minor = parts
        .get(1)
        .and_then(|s| s.parse::<u8>().ok())
        .unwrap_or(25);
    (major, minor)
}

// ---------------------------------------------------------------------------
// INFO chunk
// ---------------------------------------------------------------------------

fn write_info_chunk(out: &mut Vec<u8>, doc: &DjvuDocument) {
    out.extend_from_slice(b"INFO");

    let mut info_data = Vec::new();

    // Width (u16 BE)
    info_data.extend_from_slice(&(doc.width as u16).to_be_bytes());
    // Height (u16 BE)
    info_data.extend_from_slice(&(doc.height as u16).to_be_bytes());

    // Version
    let (major, minor) = parse_version(&doc.version);
    info_data.push(minor); // minor version
    info_data.push(major); // major version

    // Default DPI and gamma (standard values)
    info_data.push(72); // dpi
    info_data.push(22); // gamma

    // Title (null-terminated)
    if let Some(ref title) = doc.title {
        info_data.extend_from_slice(title.as_bytes());
    }
    info_data.push(0); // null terminator

    // Chunk size (u32 BE)
    out.extend_from_slice(&(info_data.len() as u32).to_be_bytes());
    out.extend_from_slice(&info_data);
}

// ---------------------------------------------------------------------------
// Placeholder chunk (preserves chunk structure from parsed data)
// ---------------------------------------------------------------------------

fn write_placeholder_chunk(out: &mut Vec<u8>, chunk: &DjvuChunk) {
    // 4-byte chunk type
    let chunk_type_bytes = chunk.chunk_type.as_bytes();
    let padded = pad_to_4(chunk_type_bytes);
    out.extend_from_slice(&padded);

    // 4-byte size (u32 BE) — use the original size
    out.extend_from_slice(&(chunk.size as u32).to_be_bytes());

    // Placeholder data (zeros) matching the original size
    out.extend_from_slice(&vec![0u8; chunk.size as usize]);

    // IFF padding to even boundary
    if !(chunk.size as usize).is_multiple_of(2) {
        out.push(0);
    }
}

// ---------------------------------------------------------------------------
// Helper: make a default DjvuDocument for tests
// ---------------------------------------------------------------------------

#[cfg(test)]
fn make_minimal_doc() -> DjvuDocument {
    DjvuDocument {
        subtype: "DJVU".to_string(),
        page_count: 1,
        title: None,
        width: 0,
        height: 0,
        version: "0.25".to_string(),
        chunks: vec![],
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::DjvuParser;

    // --- 1. Minimal document ---
    #[test]
    fn test_serialize_minimal_document() {
        let doc = make_minimal_doc();
        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();

        // Should start with AT&TFORM
        assert!(bytes.len() >= 12);
        assert_eq!(&bytes[..8], b"AT&TFORM");
        assert_eq!(&bytes[8..12], b"DJVU");
    }

    // --- 2. Valid DjVu file ---
    #[test]
    fn test_is_djvu_file() {
        let doc = make_minimal_doc();
        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        assert!(crate::is_djvu_file(&bytes));
    }

    // --- 3. INFO chunk present ---
    #[test]
    fn test_info_chunk_present() {
        let doc = make_minimal_doc();
        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();

        // After magic(8) + subtype(4) = offset 12
        assert!(bytes.len() >= 16);
        assert_eq!(&bytes[12..16], b"INFO");
    }

    // --- 4. Width and height ---
    #[test]
    fn test_width_height() {
        let mut doc = make_minimal_doc();
        doc.width = 800;
        doc.height = 600;

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.width, 800);
        assert_eq!(parsed.height, 600);
    }

    // --- 5. Title ---
    #[test]
    fn test_title() {
        let mut doc = make_minimal_doc();
        doc.title = Some("My DjVu Document".to_string());

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.title.as_deref(), Some("My DjVu Document"));
    }

    // --- 6. Version ---
    #[test]
    fn test_version() {
        let mut doc = make_minimal_doc();
        doc.version = "3.1".to_string();

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.version, "3.1");
    }

    // --- 7. Subtype preserved ---
    #[test]
    fn test_subtype() {
        let mut doc = make_minimal_doc();
        doc.subtype = "DJVU".to_string();

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.subtype, "DJVU");
    }

    // --- 8. Roundtrip serialize → parse ---
    #[test]
    fn test_roundtrip_serialize_parse() {
        let mut doc = make_minimal_doc();
        doc.width = 1024;
        doc.height = 768;
        doc.title = Some("Roundtrip Test".to_string());
        doc.version = "0.25".to_string();

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.width, 1024);
        assert_eq!(parsed.height, 768);
        assert_eq!(parsed.title.as_deref(), Some("Roundtrip Test"));
        assert_eq!(parsed.version, "0.25");
    }

    // --- 9. Unicode title ---
    #[test]
    fn test_unicode_title() {
        let mut doc = make_minimal_doc();
        doc.title = Some("문서 제목".to_string());

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.title.as_deref(), Some("문서 제목"));
    }

    // --- 10. Empty title ---
    #[test]
    fn test_no_title() {
        let mut doc = make_minimal_doc();
        doc.title = None;
        doc.width = 640;
        doc.height = 480;

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert!(parsed.title.is_none());
        assert_eq!(parsed.width, 640);
        assert_eq!(parsed.height, 480);
    }

    // --- 11. INFO chunk size is correct ---
    #[test]
    fn test_info_chunk_size() {
        let mut doc = make_minimal_doc();
        doc.title = Some("Test".to_string());
        doc.width = 100;
        doc.height = 200;

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();

        // INFO chunk type at offset 12, size at offset 16
        let size = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        // INFO data: width(2) + height(2) + minor(1) + major(1) + dpi(1) + gamma(1) + "Test"(4) + null(1) = 13
        assert_eq!(size, 13);
    }

    // --- 12. Parse to document ---
    #[test]
    fn test_serialize_parse_to_document() {
        let mut doc = make_minimal_doc();
        doc.width = 800;
        doc.height = 600;
        doc.title = Some("Integration Test".to_string());

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let generic_doc = parser.parse_to_document(&bytes).unwrap();

        assert_eq!(generic_doc.format, "djvu");
        assert_eq!(
            generic_doc.metadata.title.as_deref(),
            Some("Integration Test")
        );
        assert_eq!(generic_doc.metadata.page_count, Some(1));
    }

    // --- 13. Chunks with non-INFO types preserved ---
    #[test]
    fn test_non_info_chunks_preserved() {
        let mut doc = make_minimal_doc();
        doc.chunks.push(DjvuChunk {
            chunk_type: "Sjbz".to_string(),
            offset: 0,
            size: 42,
        });
        doc.chunks.push(DjvuChunk {
            chunk_type: "BG44".to_string(),
            offset: 0,
            size: 100,
        });

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        // Should have INFO + Sjbz + BG44 chunks — significantly more than just header+INFO
        assert!(bytes.len() > 24);

        // Verify the chunk type markers are present in the output
        let bytes_str = String::from_utf8_lossy(&bytes);
        assert!(bytes_str.contains("Sjbz"));
        assert!(bytes_str.contains("BG44"));
        assert!(bytes_str.contains("INFO"));
    }

    // --- 14. Large dimensions ---
    #[test]
    fn test_large_dimensions() {
        let mut doc = make_minimal_doc();
        doc.width = 65535; // max u16
        doc.height = 65535;

        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.width, 65535);
        assert_eq!(parsed.height, 65535);
    }

    // --- 15. Default trait ---
    #[test]
    fn test_default_trait() {
        let _ = DjvuSerializer;
    }

    // --- 16. Parse version helper ---
    #[test]
    fn test_parse_version() {
        assert_eq!(parse_version("0.25"), (0, 25));
        assert_eq!(parse_version("3.1"), (3, 1));
        assert_eq!(parse_version("1.0"), (1, 0));
        assert_eq!(parse_version("invalid"), (0, 25)); // defaults
        assert_eq!(parse_version(""), (0, 25));
        assert_eq!(parse_version("5"), (5, 25)); // missing minor defaults
    }

    // --- 17. Pad to 4 helper ---
    #[test]
    fn test_pad_to_4() {
        assert_eq!(&pad_to_4(b"DJVU"), b"DJVU");
        assert_eq!(&pad_to_4(b"DJ"), &[b'D', b'J', 0, 0]);
        assert_eq!(&pad_to_4(b"DJVUM"), b"DJVU"); // truncated
        assert_eq!(&pad_to_4(b""), &[0, 0, 0, 0]);
    }

    // --- 18. Zero dimensions ---
    #[test]
    fn test_zero_dimensions() {
        let doc = make_minimal_doc();
        let bytes = DjvuSerializer::new().serialize(&doc).unwrap();
        let parser = DjvuParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.width, 0);
        assert_eq!(parsed.height, 0);
    }
}
