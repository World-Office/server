//! Roundtrip implementation for EPUB format.
//!
//! Provides FormatRoundtrip trait implementation for testing
//! parse-serialize cycles using the native EPUB serializer.

use std::cell::RefCell;

use wo_common::test_harness::FormatRoundtrip;

use crate::model::EpubDocument;
use crate::parser::EpubParser;
use crate::serializer::EpubSerializer;

/// Roundtrip handler for EPUB format.
///
/// Stores parsed document internally for serialization.
/// Uses interior mutability (RefCell) because FormatRoundtrip::parse takes &self.
pub struct EpubRoundtrip {
    doc: RefCell<Option<EpubDocument>>,
}

impl EpubRoundtrip {
    /// Create a new roundtrip handler.
    pub fn new() -> Self {
        Self {
            doc: RefCell::new(None),
        }
    }
}

impl Default for EpubRoundtrip {
    fn default() -> Self {
        Self::new()
    }
}

impl FormatRoundtrip for EpubRoundtrip {
    fn parse(&self, data: &[u8]) -> Result<(), String> {
        let parser = EpubParser::new();
        let doc = parser.parse(data).map_err(|e| format!("{e}"))?;
        *self.doc.borrow_mut() = Some(doc);
        Ok(())
    }

    fn serialize(&self) -> Result<Vec<u8>, String> {
        let doc = self.doc.borrow();
        let doc = doc.as_ref().ok_or("No document parsed")?;
        let serializer = EpubSerializer::new();
        serializer
            .serialize(doc)
            .map_err(|e| format!("EPUB serialize failed: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wo_office_utils::ArchiveWriter;
    use zip::CompressionMethod;

    const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;

    const MINIMAL_OPF: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:test-123</dc:identifier>
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>"#;

    const CHAPTER1_XHTML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>
  <h1>Hello World</h1>
  <p>This is test content.</p>
</body>
</html>"#;

    fn create_test_epub() -> Vec<u8> {
        let mut writer = ArchiveWriter::new().unwrap();
        writer
            .add_file_with_compression(
                "mimetype",
                b"application/epub+zip",
                CompressionMethod::Stored,
            )
            .unwrap();
        writer
            .add_file("META-INF/container.xml", CONTAINER_XML.as_bytes())
            .unwrap();
        writer
            .add_file("OEBPS/content.opf", MINIMAL_OPF.as_bytes())
            .unwrap();
        writer
            .add_file("OEBPS/chapter1.xhtml", CHAPTER1_XHTML.as_bytes())
            .unwrap();
        writer.finish().unwrap()
    }

    #[test]
    fn test_roundtrip_minimal() {
        let rt = EpubRoundtrip::new();
        // Create a minimal valid EPUB ZIP file
        let input = create_test_epub();
        // Verify parse succeeds and serialization works
        rt.parse(&input).expect("parse should succeed");
        let output = rt.serialize().expect("serialize should succeed");
        // Output should be valid EPUB ZIP
        use zip::ZipArchive;
        let cursor = std::io::Cursor::new(&output);
        let mut archive = ZipArchive::new(cursor).expect("output should be valid ZIP");
        assert!(archive.by_name("mimetype").is_ok());
        assert!(archive
            .file_names()
            .any(|n| n == "META-INF/container.xml" || n == "OEBPS/content.opf"));
    }
}
