//! Roundtrip implementation for ODF format.
//!
//! Provides FormatRoundtrip trait implementation for testing
//! parse-serialize-parse cycles.

use std::cell::RefCell;

use wo_common::test_harness::FormatRoundtrip;
use wo_office_utils::ArchiveWriter;
use zip::CompressionMethod;

use crate::model::{OdfContent, OdfDocument, OdfManifestEntry, OdfType};
use crate::parser::OdfParser;

/// Roundtrip handler for ODF format.
///
/// Stores parsed document internally for serialization.
/// Uses interior mutability (RefCell) because FormatRoundtrip::parse takes &self.
pub struct OdfRoundtrip {
    doc: RefCell<Option<crate::model::OdfDocument>>,
}

impl OdfRoundtrip {
    /// Create a new roundtrip handler.
    pub fn new() -> Self {
        Self {
            doc: RefCell::new(None),
        }
    }
}

impl Default for OdfRoundtrip {
    fn default() -> Self {
        Self::new()
    }
}

impl OdfRoundtrip {
    fn create_manifest(&self, manifest: &[OdfManifestEntry]) -> String {
        let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\" manifest:version=\"1.2\">\n");
        for entry in manifest {
            xml.push_str(&format!(
                " <manifest:file-entry manifest:full-path=\"{}\" manifest:media-type=\"{}\"/>\n",
                entry.full_path.as_deref().unwrap_or(&entry.path),
                entry
                    .media_type
                    .as_deref()
                    .unwrap_or("application/octet-stream")
            ));
        }
        xml.push_str("</manifest>");
        xml
    }

    fn create_content_xml(&self, doc: &OdfDocument) -> String {
        // Build a minimal valid content.xml from the parsed document
        let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");

        let doc_type_name = match doc.doc_type {
            OdfType::Text => "text",
            OdfType::Spreadsheet => "spreadsheet",
            OdfType::Presentation => "presentation",
            _ => "text",
        };

        xml.push_str(&format!(
            "<office:document-content xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" xmlns:table=\"urn:oasis:names:tc:opendocument:xmlns:table:1.0\" office:version=\"{}\">\n",
            doc.version
        ));
        xml.push_str(" <office:body>\n");
        xml.push_str(&format!("  <office:{}>\n", doc_type_name));

        // Extract text content from the document
        if let OdfContent::Text { content, .. } = &doc.content {
            for item in content {
                match item {
                    crate::model::OdfTextContent::Paragraph(p) => {
                        xml.push_str(&format!("   <text:p>{}</text:p>\n", escape_xml(&p.text)));
                    }
                    crate::model::OdfTextContent::Heading(h) => {
                        xml.push_str(&format!(
                            "   <text:h text:outline-level=\"{}\">{}</text:h>\n",
                            h.level,
                            escape_xml(&h.text)
                        ));
                    }
                    _ => {}
                }
            }
        }

        xml.push_str(&format!("  </office:{}>\n", doc_type_name));
        xml.push_str(" </office:body>\n");
        xml.push_str("</office:document-content>");

        xml
    }
}

/// Escape XML special characters.
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

impl FormatRoundtrip for OdfRoundtrip {
    fn parse(&self, data: &[u8]) -> Result<(), String> {
        let parser = OdfParser::new();
        let doc = parser.parse(data).map_err(|e| format!("{e}"))?;
        *self.doc.borrow_mut() = Some(doc);
        Ok(())
    }

    fn serialize(&self) -> Result<Vec<u8>, String> {
        let doc = self.doc.borrow();
        let doc = doc.as_ref().ok_or("No document parsed")?;

        // ODF is a ZIP-based format, serialize to ZIP archive
        let mut writer =
            ArchiveWriter::new().map_err(|e| format!("Failed to create ZIP writer: {}", e))?;

        // Write mimetype file (must be first, uncompressed in ODF spec)
        let mimetype = match doc.doc_type {
            OdfType::Text => "application/vnd.oasis.opendocument.text",
            OdfType::Spreadsheet => "application/vnd.oasis.opendocument.spreadsheet",
            OdfType::Presentation => "application/vnd.oasis.opendocument.presentation",
            _ => "application/vnd.oasis.opendocument.text",
        };
        writer
            .add_file_with_compression("mimetype", mimetype.as_bytes(), CompressionMethod::Stored)
            .map_err(|e| format!("Failed to write mimetype: {}", e))?;

        // Write META-INF/manifest.xml
        let manifest_xml = self.create_manifest(&doc.manifest);
        writer
            .add_file("META-INF/manifest.xml", manifest_xml.as_bytes())
            .map_err(|e| format!("Failed to write manifest: {}", e))?;

        // Write content.xml from serialized document
        let content_xml = self.create_content_xml(doc);
        writer
            .add_file("content.xml", content_xml.as_bytes())
            .map_err(|e| format!("Failed to write content: {}", e))?;

        writer
            .finish()
            .map_err(|e| format!("Failed to finish ZIP: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_minimal_odt() -> Vec<u8> {
        let mut writer = ArchiveWriter::new().unwrap();
        writer
            .add_file_with_compression(
                "mimetype",
                b"application/vnd.oasis.opendocument.text",
                CompressionMethod::Stored,
            )
            .unwrap();
        writer
            .add_file(
                "content.xml",
                br#"<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
  <office:body>
    <office:text>
      <text:p>Hello ODF</text:p>
    </office:text>
  </office:body>
</office:document-content>"#.as_ref(),
            )
            .unwrap();
        writer
            .add_file(
                "META-INF/manifest.xml",
                br#"<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.2"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>"#.as_ref(),
            )
            .unwrap();
        writer.finish().unwrap()
    }

    #[test]
    fn test_roundtrip_simple() {
        let rt = OdfRoundtrip::new();
        let input = create_minimal_odt();

        rt.parse(&input).unwrap();
        let output = rt.serialize().unwrap();

        // Verify output is valid ZIP
        use zip::ZipArchive;
        let cursor = std::io::Cursor::new(&output);
        let mut archive = ZipArchive::new(cursor).unwrap();
        assert!(archive.by_name("mimetype").is_ok());
        assert!(archive.by_name("content.xml").is_ok());
    }

    #[test]
    fn test_roundtrip_with_content() {
        let rt = OdfRoundtrip::new();

        let mut writer = ArchiveWriter::new().unwrap();
        writer
            .add_file_with_compression(
                "mimetype",
                b"application/vnd.oasis.opendocument.text",
                CompressionMethod::Stored,
            )
            .unwrap();
        writer
            .add_file(
                "content.xml",
                br#"<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
  <office:body>
    <office:text>
      <text:p>Test paragraph</text:p>
      <text:p>Another paragraph</text:p>
    </office:text>
  </office:body>
</office:document-content>"#.as_ref(),
            )
            .unwrap();
        writer
            .add_file(
                "META-INF/manifest.xml",
                br#"<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.2"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>"#.as_ref(),
            )
            .unwrap();
        let input = writer.finish().unwrap();

        rt.parse(&input).unwrap();
        let output = rt.serialize().unwrap();

        // Verify content preserved
        use std::io::Read;
        use zip::ZipArchive;
        let cursor = std::io::Cursor::new(&output);
        let mut archive = ZipArchive::new(cursor).unwrap();
        let mut content = archive.by_name("content.xml").unwrap();
        let mut content_str = String::new();
        content.read_to_string(&mut content_str).unwrap();
        assert!(content_str.contains("Test paragraph"));
    }

    #[test]
    fn test_roundtrip_odp_with_styled_shapes() {
        let rt = OdfRoundtrip::new();

        let mut writer = ArchiveWriter::new().unwrap();
        writer
            .add_file_with_compression(
                "mimetype",
                b"application/vnd.oasis.opendocument.presentation",
                CompressionMethod::Stored,
            )
            .unwrap();
        writer
            .add_file(
                "content.xml",
                br##"<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="gr1" style:family="graphic">
      <style:graphic-properties draw:fill-color="#FF0000" draw:stroke-color="#00FF00" svg:stroke-width="2pt"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:presentation>
      <draw:page draw:name="Slide1">
        <draw:rect draw:style-name="gr1" svg:x="1cm" svg:y="1cm" svg:width="10cm" svg:height="5cm"/>
      </draw:page>
    </office:presentation>
  </office:body>
</office:document-content>"##.as_ref(),
            )
            .unwrap();
        writer
            .add_file(
                "META-INF/manifest.xml",
                br#"<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.2"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>"#.as_ref(),
            )
            .unwrap();
        let input = writer.finish().unwrap();

        rt.parse(&input).unwrap();
        let doc = rt.doc.borrow();
        let doc = doc.as_ref().unwrap();
        if let OdfContent::Presentation { slides } = &doc.content {
            assert_eq!(slides.len(), 1);
            assert_eq!(slides[0].shapes.len(), 1);
            let shape = &slides[0].shapes[0];
            assert_eq!(
                shape.fill_color.as_deref(),
                Some("#FF0000"),
                "fill_color not resolved from automatic style"
            );
            assert_eq!(
                shape.stroke_color.as_deref(),
                Some("#00FF00"),
                "stroke_color not resolved from automatic style"
            );
            assert_eq!(
                shape.stroke_width.as_deref(),
                Some("2pt"),
                "stroke_width not resolved from automatic style"
            );
        } else {
            panic!("Expected ODP presentation content");
        }
    }
}
