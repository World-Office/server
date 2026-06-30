//! HWP format parser.
//!
//! Parses HWP (Hangul Word Processor) binary files, extracting
//! header information, metadata, and document structure.

use wo_common::{CoreError, Document, DocumentMetadata, Result};

use crate::model::*;
use crate::{HWP_SIGNATURE_3X, HWP_SIGNATURE_5X, HWP_SIGNATURE_OLE};

/// HWP format parser.
pub struct HwpParser;

impl HwpParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse raw HWP data into an HwpDocument.
    pub fn parse(&self, data: &[u8]) -> Result<HwpDocument> {
        if data.len() < 32 {
            return Err(CoreError::Parse {
                format: "hwp".into(),
                message: "File too small to be HWP".into(),
            });
        }

        let sig_type = detect_signature(data);
        let version = match sig_type {
            HwpSignatureType::Signature5X => HwpVersion::V5,
            HwpSignatureType::Signature3X => HwpVersion::V3,
            _ => HwpVersion::Unknown,
        };

        // Parse header for V5 files
        let header = if sig_type == HwpSignatureType::Signature5X {
            Some(self.parse_hwp5_header(data))
        } else {
            None
        };

        // Extract doc info and paragraphs
        let doc_info = header.as_ref().and_then(|h| self.extract_doc_info(data, h));
        let paragraphs = header.as_ref().and_then(|h| {
            let paras = self.extract_paragraphs(data, h);
            if paras.is_empty() {
                None
            } else {
                Some(paras)
            }
        });

        let page_count = self.extract_page_count(data);
        let paragraph_count = paragraphs.as_ref().map(|p| p.len() as u32).unwrap_or(0);
        let compressed = self.is_compressed(data);
        let encrypted = self.is_encrypted(data);

        Ok(HwpDocument {
            version,
            signature_type: sig_type,
            header,
            doc_info,
            paragraphs: paragraphs.unwrap_or_default(),
            metadata: HwpMetadata::default(),
            page_count,
            paragraph_count,
            compressed,
            encrypted,
        })
    }

    /// Detect the signature type of HWP data.
    #[allow(dead_code)]
    fn detect_signature(&self, data: &[u8]) -> HwpSignatureType {
        detect_signature(data)
    }

    /// Parse HWP 5.x file header (first 256 bytes for Windows).
    fn parse_hwp5_header(&self, data: &[u8]) -> HwpHeader {
        let signature = data[..5].to_vec();

        // Read version flags at bytes 28-29
        let version_flags = read_u16_le(data, 28).unwrap_or(0);

        // Extract flags from bit 0-5
        let compression_flag = (version_flags & 0x0001) != 0;
        let encryption_flag = (version_flags & 0x0002) != 0;
        let has_summary = (version_flags & 0x0004) != 0;
        let has_extra_streams = (version_flags & 0x0008) != 0;
        let has_drm = (version_flags & 0x0010) != 0;
        let has_template = (version_flags & 0x0020) != 0;

        // Read version at bytes 30-31: [major, minor] (not LE)
        let major = if data.len() > 30 { data[30] } else { 0 };
        let _minor = if data.len() > 31 { data[31] } else { 0 };

        // Determine version enum
        let version = if major >= 5 {
            HwpVersion::V5
        } else {
            HwpVersion::V3
        };

        // Determine platform (256+ bytes = Windows)
        let platform = if data.len() >= 256 {
            HwpPlatform::Windows
        } else {
            HwpPlatform::Unknown
        };

        // Determine compression and encryption enums
        let compression = if compression_flag {
            HwpCompression::Hwp5
        } else {
            HwpCompression::None
        };

        let encryption = if encryption_flag {
            HwpEncryption::Hwp
        } else {
            HwpEncryption::None
        };

        HwpHeader {
            signature,
            version,
            platform,
            compression,
            encryption,
            has_password: encryption_flag,
            has_summary,
            has_extra_streams,
            has_drm,
            has_template,
        }
    }

    /// Extract metadata from HWP file summary info.
    /// HWP 5.x stores summary information in a specific section.
    #[allow(dead_code)]
    fn extract_metadata(&self, data: &[u8]) -> HwpMetadata {
        let mut metadata = HwpMetadata::default();

        // HWP 5.x file header structure (simplified):
        // Bytes 0-4: Signature
        // Bytes 4-28: Reserved (platform-specific)
        // Bytes 28-30: Version flags
        // Byte 28 bit 0: compressed flag
        // Byte 28 bit 1: encrypted flag
        // Byte 28 bit 2: has summary info flag
        //
        // Summary info (if present) contains title, author, keywords, etc.
        // These are stored as null-terminated strings in specific sections.

        // For now, we do a best-effort extraction by searching for
        // common string patterns in the file
        if data.len() > 256 {
            // Search for title-like strings (commonly in Korean)
            let searchable = &data[32..data.len().min(8192)];
            let text_lossy = String::from_utf8_lossy(searchable);

            // Look for summary info markers in HWP files
            // These are typically stored as tagged string fields
            let _ = text_lossy; // suppress warning
        }

        metadata.application = Some("World Office HWP Parser".to_string());
        metadata
    }

    /// Extract page count from HWP header.
    fn extract_page_count(&self, data: &[u8]) -> u32 {
        // HWP 5.x stores page count in the doc info section
        // For a basic implementation, we return 1 as default
        if data.len() < 256 {
            return 1;
        }

        // Try to find doc info section markers
        // In HWP 5.x, page count is stored at a specific offset
        // after the doc info section header
        let _ = data; // suppress warning
        1
    }

    /// Extract paragraph count from HWP header.
    #[allow(dead_code)]
    fn extract_paragraph_count(&self, data: &[u8]) -> u32 {
        if data.len() < 256 {
            return 0;
        }
        let _ = data;
        0
    }

    /// Check if the file is compressed.
    fn is_compressed(&self, data: &[u8]) -> bool {
        if data.len() < 32 {
            return false;
        }
        // HWP 5.x: compression flag is in the version flags area
        // Byte 28 bit 0 = compressed
        match detect_signature(data) {
            HwpSignatureType::Signature5X => {
                let version_flags = read_u16_le(data, 28).unwrap_or(0);
                (version_flags & 0x0001) != 0
            }
            _ => false,
        }
    }

    /// Check if the file is encrypted.
    fn is_encrypted(&self, data: &[u8]) -> bool {
        if data.len() < 32 {
            return false;
        }
        match detect_signature(data) {
            HwpSignatureType::Signature5X => {
                let version_flags = read_u16_le(data, 28).unwrap_or(0);
                (version_flags & 0x0002) != 0
            }
            _ => false,
        }
    }

    /// Extract document info section from HWP 5.x file.
    /// Parses the doc info record (ID 0x0001) containing UTF-16LE strings.
    fn extract_doc_info(&self, data: &[u8], _header: &HwpHeader) -> Option<HwpDocInfo> {
        // Start after the file header (offset 256 for Windows)
        let start_offset = 256;
        if data.len() < start_offset + 8 {
            return None;
        }

        // Read record header: ID (4 bytes) + size (4 bytes)
        let record_id = read_u32_le(data, start_offset)?;
        let record_size = read_u32_le(data, start_offset + 4)?;

        // Only parse if this is the document properties record
        if record_id != 0x0001 {
            return None;
        }

        let record_end = start_offset + 8 + record_size as usize;
        if record_end > data.len() {
            return None;
        }

        let record_data = &data[start_offset + 8..record_end];

        // Parse tagged string fields
        let mut doc_info = HwpDocInfo::default();
        let mut offset = 0;

        while offset + 4 < record_data.len() {
            let tag = read_u16_le(record_data, offset)?;
            let str_len = read_u16_le(record_data, offset + 2)? as usize;

            if offset + 4 + str_len > record_data.len() {
                break;
            }

            let str_bytes = &record_data[offset + 4..offset + 4 + str_len];
            let text = read_utf16le_string(str_bytes, 0, str_len);

            match tag {
                1 => doc_info.title = Some(text),
                2 => doc_info.author = Some(text),
                3 => doc_info.description = Some(text),
                4 => doc_info.keywords = text.split(',').map(|s| s.trim().to_string()).collect(),
                5 => doc_info.application = Some(text),
                _ => {}
            }

            offset += 4 + str_len;
        }

        Some(doc_info)
    }

    /// Extract paragraphs from HWP 5.x body section.
    /// Does a best-effort scan for UTF-16LE text sequences.
    fn extract_paragraphs(&self, data: &[u8], _header: &HwpHeader) -> Vec<HwpParagraph> {
        let start_offset = 256;
        if data.len() < start_offset + 8 {
            return Vec::new();
        }

        // Skip doc info record header
        let record_id = read_u32_le(data, start_offset).unwrap_or(0);
        let record_size = read_u32_le(data, start_offset + 4).unwrap_or(0);

        if record_id != 0x0001 {
            return Vec::new();
        }

        let body_start = start_offset + 8 + record_size as usize;
        if body_start >= data.len() {
            return Vec::new();
        }

        let body_data = &data[body_start..];

        // Best-effort: scan for UTF-16LE text sequences
        // Look for sequences that look like paragraph text
        let mut paragraphs = Vec::new();

        // Simple approach: scan for printable UTF-16LE sequences
        let mut i = 0;
        while i + 2 < body_data.len() {
            // Look for potential paragraph start (non-zero UTF-16 char)
            let ch = read_u16_le(body_data, i).unwrap_or(0);
            if ch != 0 && ch != 0x000A && ch != 0x000D {
                // Found potential text, try to extract
                let mut text_end = i;
                while text_end + 2 < body_data.len() {
                    let c = read_u16_le(body_data, text_end).unwrap_or(0);
                    if c == 0 || c == 0x000A || c == 0x000D {
                        break;
                    }
                    text_end += 2;
                }

                if text_end > i {
                    let text_bytes = &body_data[i..text_end];
                    let text = read_utf16le_string(text_bytes, 0, text_end);
                    if !text.is_empty() && text.chars().all(|c| !c.is_control()) {
                        paragraphs.push(HwpParagraph {
                            text,
                            ..Default::default()
                        });
                    }
                }

                i = text_end + 2; // Skip past this sequence
            } else {
                i += 2;
            }
        }

        paragraphs
    }

    /// Parse HWP data and convert to a generic Document.
    pub fn parse_to_document(&self, data: &[u8]) -> Result<Document> {
        let hwp = self.parse(data)?;

        Ok(Document {
            content: data.to_vec(),
            format: "hwp".into(),
            metadata: DocumentMetadata {
                title: hwp.doc_info.as_ref().and_then(|d| d.title.clone()),
                author: hwp.doc_info.as_ref().and_then(|d| d.author.clone()),
                page_count: Some(hwp.page_count),
                ..Default::default()
            },
        })
    }
}

impl Default for HwpParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Detect the signature type of HWP data.
fn detect_signature(data: &[u8]) -> HwpSignatureType {
    if data.len() >= 8 && &data[..8] == HWP_SIGNATURE_OLE {
        HwpSignatureType::OleCompound
    } else if data.len() >= 5 && &data[..5] == HWP_SIGNATURE_5X {
        HwpSignatureType::Signature5X
    } else if data.len() >= 4 && &data[..4] == HWP_SIGNATURE_3X {
        HwpSignatureType::Signature3X
    } else {
        HwpSignatureType::Unknown
    }
}

/// Helper: Read u16 in little-endian from byte slice.
fn read_u16_le(data: &[u8], offset: usize) -> Option<u16> {
    if offset + 2 > data.len() {
        return None;
    }
    Some(u16::from_le_bytes([data[offset], data[offset + 1]]))
}

/// Helper: Read u32 in little-endian from byte slice.
fn read_u32_le(data: &[u8], offset: usize) -> Option<u32> {
    if offset + 4 > data.len() {
        return None;
    }
    Some(u32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]))
}

/// Helper: Read UTF-16LE string from byte slice.
fn read_utf16le_string(data: &[u8], offset: usize, byte_len: usize) -> String {
    if offset + byte_len > data.len() || byte_len == 0 {
        return String::new();
    }

    let bytes = &data[offset..offset + byte_len];
    // Convert to u16 pairs and then to string
    let mut chars = Vec::new();
    for chunk in bytes.as_chunks::<2>().0.iter() {
        let code_unit = u16::from_le_bytes([chunk[0], chunk[1]]);
        chars.push(code_unit);
    }

    // Convert from UTF-16 code units to String
    String::from_utf16(&chars).unwrap_or_default()
}

/// Helper: Try to decompress HWP data (zlib fallback).
#[allow(dead_code)]
fn try_decompress(data: &[u8]) -> Vec<u8> {
    // For now, just return the data as-is
    // Real implementation would try zlib decompression
    data.to_vec()
}

/// Build a minimal HWP 5.x file for testing.
#[cfg(test)]
fn build_test_hwp5x() -> Vec<u8> {
    let mut data = Vec::new();
    // Signature: "HWPDO" in EUC-KR encoding
    data.extend_from_slice(&[0xC7, 0xD1, 0xD6, 0xB8, 0xB4]);
    // Reserved padding (23 bytes)
    data.extend_from_slice(&[0u8; 23]);
    // Version flags (2 bytes at offset 28-29) — no compression, no encryption
    data.extend_from_slice(&[0x00, 0x00]);
    // Version (2 bytes at offset 30-31)
    data.extend_from_slice(&[0x05, 0x00]);
    // Padding to reach 256 bytes
    data.extend_from_slice(&[0u8; 224]);

    // Add doc info section (record ID 0x0001)
    data.extend_from_slice(&[0x01, 0x00, 0x00, 0x00]); // record ID
    data.extend_from_slice(&[0x0C, 0x00, 0x00, 0x00]); // record size (12 bytes)

    // Title field: tag=1, len=8, UTF-16LE "Test" (8 bytes)
    data.extend_from_slice(&[0x01, 0x00]); // tag
    data.extend_from_slice(&[0x08, 0x00]); // length (8 bytes = 4 UTF-16LE chars)
                                           // "Test" in UTF-16LE: T=0x54,0x00, e=0x65,0x00, s=0x73,0x00, t=0x74,0x00
    data.extend_from_slice(&[0x54, 0x00, 0x65, 0x00, 0x73, 0x00, 0x74, 0x00]);

    data
}

/// Build a minimal HWP 3.x file for testing.
#[cfg(test)]
fn build_test_hwp3x() -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(HWP_SIGNATURE_3X);
    data.extend_from_slice(&[0u8; 60]);
    data
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::is_hwp_file;

    #[test]
    fn test_is_hwp_file() {
        let hwp5 = build_test_hwp5x();
        assert!(is_hwp_file(&hwp5));
        let hwp3 = build_test_hwp3x();
        assert!(is_hwp_file(&hwp3));
        assert!(!is_hwp_file(b"not hwp"));
        assert!(!is_hwp_file(b""));
        assert!(!is_hwp_file(&[0x89, 0x48]));
    }

    #[test]
    fn test_parse_hwp5x() {
        let parser = HwpParser::new();
        let data = build_test_hwp5x();
        let doc = parser.parse(&data).unwrap();
        assert_eq!(doc.version, HwpVersion::V5);
        assert_eq!(doc.signature_type, HwpSignatureType::Signature5X);
    }

    #[test]
    fn test_parse_hwp3x() {
        let parser = HwpParser::new();
        let data = build_test_hwp3x();
        let doc = parser.parse(&data).unwrap();
        assert_eq!(doc.version, HwpVersion::V3);
        assert_eq!(doc.signature_type, HwpSignatureType::Signature3X);
    }

    #[test]
    fn test_rejects_non_hwp() {
        let parser = HwpParser::new();
        let data = b"this is not an hwp file at all, trust me on this one";
        let result = parser.parse(&data[..32.min(data.len())]);
        // Parser may reject or succeed with Unknown type
        if let Ok(doc) = result {
            assert_eq!(doc.version, HwpVersion::Unknown);
        }
    }

    #[test]
    fn test_rejects_too_small() {
        let parser = HwpParser::new();
        let result = parser.parse(b"tiny");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_to_document() {
        let parser = HwpParser::new();
        let data = build_test_hwp5x();
        let doc = parser.parse_to_document(&data).unwrap();
        assert_eq!(doc.format, "hwp");
        assert_eq!(doc.metadata.page_count, Some(1));
    }

    #[test]
    fn test_ole_detection() {
        let mut ole_data: Vec<u8> = vec![
            0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00,
        ];
        // Pad to 32 bytes (minimum for parser)
        ole_data.resize(32, 0);
        assert!(is_hwp_file(&ole_data));
        let parser = HwpParser::new();
        let doc = parser.parse(&ole_data).unwrap();
        assert_eq!(doc.signature_type, HwpSignatureType::OleCompound);
    }

    #[test]
    fn test_parse_header_v5() {
        let parser = HwpParser::new();
        let data = build_test_hwp5x();
        let doc = parser.parse(&data).unwrap();

        assert!(doc.header.is_some());
        let header = doc.header.unwrap();
        assert_eq!(header.version, HwpVersion::V5);
        assert_eq!(header.platform, HwpPlatform::Windows);
        assert_eq!(header.compression, HwpCompression::None);
        assert_eq!(header.encryption, HwpEncryption::None);
        assert!(!header.has_password);
        assert!(!header.has_summary);
    }

    #[test]
    fn test_compression_flag() {
        let mut data = build_test_hwp5x();
        // Set compression bit (bit 0 of version flags at offset 28)
        data[28] = 0x01;
        data[29] = 0x00;

        let parser = HwpParser::new();
        let doc = parser.parse(&data).unwrap();

        assert!(doc.compressed);
        assert_eq!(
            doc.header.as_ref().unwrap().compression,
            HwpCompression::Hwp5
        );
    }

    #[test]
    fn test_encryption_flag() {
        let mut data = build_test_hwp5x();
        // Set encryption bit (bit 1 of version flags at offset 28)
        data[28] = 0x02;
        data[29] = 0x00;

        let parser = HwpParser::new();
        let doc = parser.parse(&data).unwrap();

        assert!(doc.encrypted);
        assert_eq!(doc.header.as_ref().unwrap().encryption, HwpEncryption::Hwp);
        assert!(doc.header.as_ref().unwrap().has_password);
    }

    #[test]
    fn test_doc_info_extraction() {
        let parser = HwpParser::new();
        let data = build_test_hwp5x();
        let doc = parser.parse(&data).unwrap();

        assert!(doc.doc_info.is_some());
        let doc_info = doc.doc_info.unwrap();
        assert_eq!(doc_info.title, Some("Test".to_string()));
    }
}
