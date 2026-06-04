//! Roundtrip implementation for OOXML format.
//!
//! Provides FormatRoundtrip trait implementation for testing
//! parse-serialize cycles using JSON as the serialization target.
//!
//! Since OOXML is a complex ZIP-based format with multiple XML files,
//! we serialize the parsed model to JSON to verify that the parser
//! produces a complete, serializable model. This approach is similar
//! to the wo-fb2 roundtrip implementation.

use std::cell::RefCell;

use wo_common::test_harness::FormatRoundtrip;

use crate::model::OoxmlDocument;
use crate::parser::OoxmlParser;

/// Roundtrip handler for OOXML format.
///
/// Stores parsed document internally for serialization.
/// Uses interior mutability (RefCell) because FormatRoundtrip::parse takes &self.
pub struct OoxmlRoundtrip {
    doc: RefCell<Option<OoxmlDocument>>,
}

impl OoxmlRoundtrip {
    /// Create a new roundtrip handler.
    pub fn new() -> Self {
        Self {
            doc: RefCell::new(None),
        }
    }
}

impl Default for OoxmlRoundtrip {
    fn default() -> Self {
        Self::new()
    }
}

impl FormatRoundtrip for OoxmlRoundtrip {
    fn parse(&self, data: &[u8]) -> Result<(), String> {
        let parser = OoxmlParser::new();
        let doc = parser.parse(data).map_err(|e| format!("{e}"))?;
        *self.doc.borrow_mut() = Some(doc);
        Ok(())
    }

    fn serialize(&self) -> Result<Vec<u8>, String> {
        let doc = self.doc.borrow();
        let doc = doc.as_ref().ok_or("No document parsed")?;
        serde_json::to_vec_pretty(doc).map_err(|e| format!("JSON serialize failed: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    /// Create a minimal valid DOCX file for testing.
    fn create_minimal_docx() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            // [Content_Types].xml
            zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)
                .unwrap();

            // _rels/.rels
            zip.start_file("_rels/.rels", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#)
                .unwrap();

            // word/document.xml
            zip.start_file("word/document.xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Hello OOXML</w:t></w:r></w:p></w:body>
</w:document>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    #[test]
    fn test_roundtrip_simple() {
        let rt = OoxmlRoundtrip::new();
        let input = create_minimal_docx();

        // Parse should succeed
        rt.parse(&input).expect("parse should succeed");

        // Serialize should succeed and produce valid JSON
        let output = rt.serialize().expect("serialize should succeed");
        let json: serde_json::Value =
            serde_json::from_slice(&output).expect("output should be valid JSON");

        // Verify the JSON contains expected fields
        assert_eq!(json["format"], "docx");
        assert_eq!(json["version"], "1.0");
        assert_eq!(json["main_part"], "word/document.xml");
    }

    #[test]
    fn test_roundtrip_with_content() {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            // [Content_Types].xml
            zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)
                .unwrap();

            // word/document.xml with multiple paragraphs
            zip.start_file("word/document.xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>First paragraph</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>
    <w:p><w:r><w:t>Third paragraph</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }

        let rt = OoxmlRoundtrip::new();
        rt.parse(&buf).expect("parse should succeed");
        let output = rt.serialize().expect("serialize should succeed");

        // Verify the JSON contains parsed body content
        let json: serde_json::Value =
            serde_json::from_slice(&output).expect("output should be valid JSON");
        assert!(json["body"].is_object());
        assert!(json["body"]["paragraphs"].is_array());
        assert_eq!(json["body"]["paragraphs"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn test_roundtrip_with_formatting() {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            // [Content_Types].xml
            zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)
                .unwrap();

            // word/document.xml with formatting
            zip.start_file("word/document.xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:b/><w:i/><w:u val="single"/><w:color val="FF0000"/></w:rPr>
        <w:t>Bold italic red underlined</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }

        let rt = OoxmlRoundtrip::new();
        rt.parse(&buf).expect("parse should succeed");
        let output = rt.serialize().expect("serialize should succeed");

        // Verify the JSON contains parsed formatting
        let json: serde_json::Value =
            serde_json::from_slice(&output).expect("output should be valid JSON");
        let run = &json["body"]["paragraphs"][0]["runs"][0];
        assert_eq!(run["bold"], true);
        assert_eq!(run["italic"], true);
        assert_eq!(run["color"], "FF0000");
    }

    #[test]
    fn test_roundtrip_without_parse_fails() {
        let rt = OoxmlRoundtrip::new();
        let result = rt.serialize();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No document parsed"));
    }

    #[test]
    fn test_roundtrip_invalid_input() {
        let rt = OoxmlRoundtrip::new();
        let result = rt.parse(b"not a valid DOCX file");
        assert!(result.is_err());
    }

    // --- PPTX roundtrip tests ---

    fn create_minimal_pptx() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            // [Content_Types].xml
            zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>"#,
            )
            .unwrap();

            // _rels/.rels
            zip.start_file("_rels/.rels", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#,
            )
            .unwrap();

            // ppt/presentation.xml
            zip.start_file("ppt/presentation.xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldSz cx="9144000" cy="6858000"/>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>"#,
            )
            .unwrap();

            // ppt/_rels/presentation.xml.rels
            zip.start_file(
                "ppt/_rels/presentation.xml.rels",
                SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>"#,
            )
            .unwrap();

            // ppt/slides/slide1.xml
            zip.start_file("ppt/slides/slide1.xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:spTree>
    <p:nvGrpSpPr>
      <p:cNvPr id="1" name=""/>
      <p:cNvGrpSpPr/>
      <p:nvPr/>
    </p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="2" name="TextBox"/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="100" y="100"/>
          <a:ext cx="5000000" cy="500000"/>
        </a:xfrm>
      </p:spPr>
      <p:txBody>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p>
          <a:r>
            <a:t>PPTX Roundtrip</a:t>
          </a:r>
        </a:p>
      </p:txBody>
    </p:sp>
  </p:spTree>
</p:sld>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    #[test]
    fn test_pptx_roundtrip_parse_json() {
        let rt = OoxmlRoundtrip::new();
        let input = create_minimal_pptx();

        rt.parse(&input).expect("PPTX parse should succeed");

        let output = rt.serialize().expect("serialize should succeed");
        let json: serde_json::Value =
            serde_json::from_slice(&output).expect("output should be valid JSON");

        assert_eq!(json["format"], "pptx");
        assert_eq!(json["main_part"], "ppt/presentation.xml");
        assert!(json["body"].is_null() || json["body"].is_object());
    }

    #[test]
    fn test_pptx_roundtrip_slide_count() {
        let rt = OoxmlRoundtrip::new();
        let input = create_minimal_pptx();

        rt.parse(&input).expect("PPTX parse should succeed");

        let output = rt.serialize().expect("serialize should succeed");
        let json: serde_json::Value =
            serde_json::from_slice(&output).expect("output should be valid JSON");

        assert_eq!(json["part_count"], 1);
    }
}
