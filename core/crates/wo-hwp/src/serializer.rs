//! HWP serializer — writes an [`HwpDocument`] to HWP 5.x binary bytes.
//!
//! Produces a valid HWP 5.x file with:
//! - 256-byte file header (Windows platform)
//! - Doc info section (record ID 0x0001) with tagged UTF-16LE string fields
//! - Body section with UTF-16LE encoded paragraphs

use crate::model::*;
use crate::HWP_SIGNATURE_5X;

/// Serializes an [`HwpDocument`] into HWP 5.x binary bytes.
pub struct HwpSerializer;

impl HwpSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize the document to HWP binary bytes.
    pub fn serialize(&self, doc: &HwpDocument) -> Result<Vec<u8>, anyhow::Error> {
        let mut out = Vec::new();

        // ── 1. File header (256 bytes for Windows platform) ──
        write_file_header(&mut out, doc);

        // ── 2. Doc info section (record ID 0x0001) ──
        write_doc_info_record(&mut out, doc);

        // ── 3. Body section with paragraphs ──
        write_body_section(&mut out, doc);

        Ok(out)
    }
}

impl Default for HwpSerializer {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// File header (256 bytes)
// ---------------------------------------------------------------------------

fn write_file_header(out: &mut Vec<u8>, doc: &HwpDocument) {
    // Bytes 0-4: Signature
    let sig = match doc.header {
        Some(ref h) => h.signature.clone(),
        None => HWP_SIGNATURE_5X.to_vec(),
    };
    // Pad or truncate signature to exactly 5 bytes
    let mut sig_bytes = sig;
    sig_bytes.resize(5, 0);
    out.extend_from_slice(&sig_bytes[..5]);

    // Bytes 5-27: Reserved padding (23 bytes)
    out.extend_from_slice(&[0u8; 23]);

    // Bytes 28-29: Version flags
    let flags = build_version_flags(doc);
    out.extend_from_slice(&flags.to_le_bytes());

    // Bytes 30-31: Version (major.minor)
    let (major, minor) = version_bytes(doc);
    out.push(major);
    out.push(minor);

    // Bytes 32-255: Padding to reach 256 bytes
    while out.len() < 256 {
        out.push(0);
    }
}

fn build_version_flags(doc: &HwpDocument) -> u16 {
    let mut flags: u16 = 0;

    if let Some(ref h) = doc.header {
        if h.compression != HwpCompression::None {
            flags |= 0x0001;
        }
        if h.encryption != HwpEncryption::None {
            flags |= 0x0002;
        }
        if h.has_summary {
            flags |= 0x0004;
        }
        if h.has_extra_streams {
            flags |= 0x0008;
        }
        if h.has_drm {
            flags |= 0x0010;
        }
        if h.has_template {
            flags |= 0x0020;
        }
    } else {
        if doc.compressed {
            flags |= 0x0001;
        }
        if doc.encrypted {
            flags |= 0x0002;
        }
    }

    flags
}

fn version_bytes(doc: &HwpDocument) -> (u8, u8) {
    match doc.version {
        HwpVersion::V5 => (5, 0),
        HwpVersion::V3 => (3, 0),
        HwpVersion::Unknown => (5, 0),
    }
}

// ---------------------------------------------------------------------------
// Doc info record (record ID 0x0001)
// ---------------------------------------------------------------------------

fn write_doc_info_record(out: &mut Vec<u8>, doc: &HwpDocument) {
    // Use doc_info if present, otherwise fall back to metadata
    let title = doc
        .doc_info
        .as_ref()
        .and_then(|d| d.title.clone())
        .or_else(|| doc.metadata.title.clone());
    let author = doc
        .doc_info
        .as_ref()
        .and_then(|d| d.author.clone())
        .or_else(|| doc.metadata.author.clone());
    let description = doc
        .doc_info
        .as_ref()
        .and_then(|d| d.description.clone())
        .or_else(|| doc.metadata.description.clone());
    let keywords = if doc
        .doc_info
        .as_ref()
        .map(|d| !d.keywords.is_empty())
        .unwrap_or(false)
    {
        doc.doc_info.as_ref().unwrap().keywords.clone()
    } else if !doc.metadata.keywords.is_empty() {
        doc.metadata.keywords.clone()
    } else {
        Vec::new()
    };
    let application = doc
        .doc_info
        .as_ref()
        .and_then(|d| d.application.clone())
        .or_else(|| doc.metadata.application.clone());
    let creation_date = doc
        .doc_info
        .as_ref()
        .and_then(|d| d.creation_date.clone())
        .or_else(|| doc.metadata.creation_date.clone());
    let modification_date = doc
        .doc_info
        .as_ref()
        .and_then(|d| d.modification_date.clone())
        .or_else(|| doc.metadata.last_modified.clone());

    // Build tagged fields: each field is tag(u16 LE) + length(u16 LE) + UTF-16LE data
    let mut record_data = Vec::new();

    // Tag 1: title
    if let Some(ref s) = title {
        write_tagged_string(&mut record_data, 1, s);
    }
    // Tag 2: author
    if let Some(ref s) = author {
        write_tagged_string(&mut record_data, 2, s);
    }
    // Tag 3: description
    if let Some(ref s) = description {
        write_tagged_string(&mut record_data, 3, s);
    }
    // Tag 4: keywords (comma-separated)
    if !keywords.is_empty() {
        let kw_string = keywords.join(",");
        write_tagged_string(&mut record_data, 4, &kw_string);
    }
    // Tag 5: application
    if let Some(ref s) = application {
        write_tagged_string(&mut record_data, 5, s);
    }
    // Tag 6: creation date
    if let Some(ref s) = creation_date {
        write_tagged_string(&mut record_data, 6, s);
    }
    // Tag 7: modification date
    if let Some(ref s) = modification_date {
        write_tagged_string(&mut record_data, 7, s);
    }

    // Record header: ID (4 bytes LE) + size (4 bytes LE)
    out.extend_from_slice(&0x0001u32.to_le_bytes());
    out.extend_from_slice(&(record_data.len() as u32).to_le_bytes());
    out.extend_from_slice(&record_data);
}

fn write_tagged_string(out: &mut Vec<u8>, tag: u16, text: &str) {
    let utf16: Vec<u8> = text.encode_utf16().flat_map(|c| c.to_le_bytes()).collect();
    out.extend_from_slice(&tag.to_le_bytes());
    out.extend_from_slice(&(utf16.len() as u16).to_le_bytes());
    out.extend_from_slice(&utf16);
}

// ---------------------------------------------------------------------------
// Body section with paragraphs
// ---------------------------------------------------------------------------

fn write_body_section(out: &mut Vec<u8>, doc: &HwpDocument) {
    for para in &doc.paragraphs {
        write_paragraph(out, para);
    }
}

fn write_paragraph(out: &mut Vec<u8>, para: &HwpParagraph) {
    // Write paragraph text as UTF-16LE followed by null terminator
    if !para.text.is_empty() {
        let utf16: Vec<u8> = para
            .text
            .encode_utf16()
            .flat_map(|c| c.to_le_bytes())
            .collect();
        out.extend_from_slice(&utf16);
    }
    // Null terminator (two zero bytes in UTF-16LE)
    out.extend_from_slice(&[0u8; 2]);
}

// ---------------------------------------------------------------------------
// Helper: make a default HwpDocument for tests
// ---------------------------------------------------------------------------

#[cfg(test)]
fn make_minimal_doc() -> HwpDocument {
    HwpDocument {
        version: HwpVersion::V5,
        signature_type: HwpSignatureType::Signature5X,
        metadata: HwpMetadata::default(),
        header: None,
        doc_info: None,
        paragraphs: vec![],
        page_count: 1,
        paragraph_count: 0,
        compressed: false,
        encrypted: false,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::HwpParser;

    // --- 1. Minimal empty document ---
    #[test]
    fn test_serialize_minimal_document() {
        let doc = make_minimal_doc();
        let bytes = HwpSerializer::new().serialize(&doc).unwrap();

        // Should be at least 256 bytes (header)
        assert!(bytes.len() >= 256);
        // Starts with HWP 5.x signature
        assert_eq!(&bytes[..5], HWP_SIGNATURE_5X);
    }

    // --- 2. Signature matches expected ---
    #[test]
    fn test_serialize_signature() {
        let doc = make_minimal_doc();
        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        assert!(crate::is_hwp_file(&bytes));
    }

    // --- 3. File header is exactly 256 bytes before data ---
    #[test]
    fn test_header_size() {
        let doc = make_minimal_doc();
        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        // Header occupies first 256 bytes; doc info starts at 256
        assert!(bytes.len() >= 260);
        // Record ID at offset 256 should be 0x0001
        assert_eq!(&bytes[256..260], &[0x01, 0x00, 0x00, 0x00]);
    }

    // --- 4. Version flags no compression/encryption ---
    #[test]
    fn test_version_flags_default() {
        let doc = make_minimal_doc();
        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        // Version flags at offset 28 should be 0x0000
        assert_eq!(bytes[28], 0x00);
        assert_eq!(bytes[29], 0x00);
    }

    // --- 5. Version bytes ---
    #[test]
    fn test_version_bytes() {
        let doc = make_minimal_doc();
        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        assert_eq!(bytes[30], 5); // major
        assert_eq!(bytes[31], 0); // minor
    }

    // --- 6. Document with metadata ---
    #[test]
    fn test_serialize_with_metadata() {
        let mut doc = make_minimal_doc();
        doc.metadata.title = Some("Test Title".to_string());
        doc.metadata.author = Some("Test Author".to_string());
        doc.metadata.keywords = vec!["kw1".to_string(), "kw2".to_string()];

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        assert!(bytes.len() >= 256);

        // Doc info record at offset 256
        let record_id = u32::from_le_bytes([bytes[256], bytes[257], bytes[258], bytes[259]]);
        assert_eq!(record_id, 0x0001);
        // Record should have non-zero size
        let record_size = u32::from_le_bytes([bytes[260], bytes[261], bytes[262], bytes[263]]);
        assert!(record_size > 0);
    }

    // --- 7. Document with doc_info ---
    #[test]
    fn test_serialize_with_doc_info() {
        let mut doc = make_minimal_doc();
        doc.doc_info = Some(HwpDocInfo {
            title: Some("DocInfo Title".to_string()),
            author: Some("DocInfo Author".to_string()),
            description: Some("A description".to_string()),
            keywords: vec!["test".to_string()],
            creation_date: Some("2025-01-01".to_string()),
            modification_date: None,
            application: Some("World Office".to_string()),
        });

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        assert!(bytes.len() >= 256);
        // Record ID should be 0x0001
        assert_eq!(&bytes[256..260], &[0x01, 0x00, 0x00, 0x00]);
    }

    // --- 8. Document with paragraphs ---
    #[test]
    fn test_serialize_with_paragraphs() {
        let mut doc = make_minimal_doc();
        doc.paragraphs.push(HwpParagraph {
            text: "Hello HWP".to_string(),
            ..Default::default()
        });
        doc.paragraphs.push(HwpParagraph {
            text: "Second paragraph".to_string(),
            ..Default::default()
        });

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        // Should have body data after header + doc info
        assert!(bytes.len() > 256);
    }

    // --- 9. Compression flag ---
    #[test]
    fn test_compression_flag() {
        let mut doc = make_minimal_doc();
        doc.compressed = true;

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        assert_eq!(bytes[28], 0x01); // bit 0 set
    }

    // --- 10. Encryption flag ---
    #[test]
    fn test_encryption_flag() {
        let mut doc = make_minimal_doc();
        doc.encrypted = true;

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        assert_eq!(bytes[28], 0x02); // bit 1 set
    }

    // --- 11. Roundtrip: serialize → parse ---
    #[test]
    fn test_roundtrip_serialize_parse() {
        let mut doc = make_minimal_doc();
        doc.metadata.title = Some("Roundtrip Test".to_string());
        doc.paragraphs.push(HwpParagraph {
            text: "Test paragraph".to_string(),
            ..Default::default()
        });

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();

        // Parse back with HwpParser
        let parser = HwpParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.version, HwpVersion::V5);
        assert_eq!(parsed.signature_type, HwpSignatureType::Signature5X);
        assert!(parsed.doc_info.is_some());
        let doc_info = parsed.doc_info.unwrap();
        assert_eq!(doc_info.title.as_deref(), Some("Roundtrip Test"));
    }

    // --- 12. Roundtrip preserves compression flag ---
    #[test]
    fn test_roundtrip_compression_flag() {
        let mut doc = make_minimal_doc();
        doc.compressed = true;

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        let parser = HwpParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert!(parsed.compressed);
        assert_eq!(
            parsed.header.as_ref().unwrap().compression,
            HwpCompression::Hwp5
        );
    }

    // --- 13. V3 version produces different header ---
    #[test]
    fn test_v3_version_bytes() {
        let mut doc = make_minimal_doc();
        doc.version = HwpVersion::V3;

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        assert_eq!(bytes[30], 3); // major version byte
    }

    // --- 14. UTF-16LE encoding of tagged strings ---
    #[test]
    fn test_tagged_string_encoding() {
        let mut buf = Vec::new();
        write_tagged_string(&mut buf, 1, "AB");

        // tag=1 (2 bytes LE) + len=4 (2 bytes LE, 2 UTF-16LE chars = 4 bytes) + data
        assert_eq!(buf.len(), 2 + 2 + 4);
        assert_eq!(&buf[0..2], &[0x01, 0x00]); // tag
        assert_eq!(&buf[2..4], &[0x04, 0x00]); // length
        assert_eq!(&buf[4..6], &[0x41, 0x00]); // 'A'
        assert_eq!(&buf[6..8], &[0x42, 0x00]); // 'B'
    }

    // --- 15. Empty tagged strings are not written ---
    #[test]
    fn test_empty_metadata_no_record_data() {
        let doc = make_minimal_doc();
        let bytes = HwpSerializer::new().serialize(&doc).unwrap();

        // Record at offset 256 should have zero size (no metadata fields)
        let record_size = u32::from_le_bytes([bytes[260], bytes[261], bytes[262], bytes[263]]);
        assert_eq!(record_size, 0);
    }

    // --- 16. Header with explicit HwpHeader ---
    #[test]
    fn test_serialize_with_explicit_header() {
        let mut doc = make_minimal_doc();
        doc.header = Some(HwpHeader {
            signature: HWP_SIGNATURE_5X.to_vec(),
            version: HwpVersion::V5,
            platform: HwpPlatform::Windows,
            compression: HwpCompression::None,
            encryption: HwpEncryption::None,
            has_password: false,
            has_summary: true,
            has_extra_streams: false,
            has_drm: false,
            has_template: false,
        });

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        // has_summary = bit 2 set
        assert_eq!(bytes[28], 0x04);
    }

    // --- 17. Unicode metadata roundtrip ---
    #[test]
    fn test_unicode_metadata() {
        let mut doc = make_minimal_doc();
        doc.metadata.title = Some("한글 제목".to_string());
        doc.metadata.author = Some("작성자".to_string());

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        assert!(bytes.len() >= 256);

        // Parse back
        let parser = HwpParser::new();
        let parsed = parser.parse(&bytes).unwrap();
        assert!(parsed.doc_info.is_some());
        let info = parsed.doc_info.unwrap();
        assert_eq!(info.title.as_deref(), Some("한글 제목"));
        assert_eq!(info.author.as_deref(), Some("작성자"));
    }

    // --- 18. Default trait ---
    #[test]
    fn test_default_trait() {
        let _ = HwpSerializer;
    }

    // --- 19. DocInfo takes priority over metadata ---
    #[test]
    fn test_doc_info_priority_over_metadata() {
        let mut doc = make_minimal_doc();
        doc.metadata.title = Some("Metadata Title".to_string());
        doc.doc_info = Some(HwpDocInfo {
            title: Some("DocInfo Title".to_string()),
            ..Default::default()
        });

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        let parser = HwpParser::new();
        let parsed = parser.parse(&bytes).unwrap();
        let info = parsed.doc_info.unwrap();
        // DocInfo title should take priority
        assert_eq!(info.title.as_deref(), Some("DocInfo Title"));
    }

    // --- 20. Multiple keywords serialized ---
    #[test]
    fn test_keywords_serialized() {
        let mut doc = make_minimal_doc();
        doc.metadata.keywords = vec!["alpha".to_string(), "beta".to_string(), "gamma".to_string()];

        let bytes = HwpSerializer::new().serialize(&doc).unwrap();
        let parser = HwpParser::new();
        let parsed = parser.parse(&bytes).unwrap();
        let info = parsed.doc_info.unwrap();
        // Keywords should be comma-separated in the parser
        assert!(!info.keywords.is_empty());
        assert_eq!(info.keywords.len(), 3);
    }
}
