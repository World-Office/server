//! Congruence tests: parse→serialize round-trips must preserve XML the typed
//! model cannot represent.
//!
//! `DocxParagraph.raw_ppr` carries the verbatim `<w:pPr>` subtree through a
//! parse-serialize cycle, so numbering (`numPr`/`ilvl`/`numId`) and spacing
//! attributes survive even though the serializer never models them.

use std::io::{Cursor, Read, Write};

use crate::parser::OoxmlParser;
use crate::serializer::OoxmlSerializer;

/// Build a minimal DOCX whose only paragraph carries a `<w:pPr>` with
/// `numPr` (ilvl/numId) and `spacing` attributes.
fn docx_with_ppr() -> Vec<u8> {
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(Cursor::new(&mut buf));
        zip.start_file(
            "[Content_Types].xml",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
        )
        .unwrap();

        zip.start_file(
            "word/document.xml",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>
      <w:r><w:t>Numbered list item</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        )
        .unwrap();
        zip.finish().unwrap();
    }
    buf
}

/// Extract word/document.xml from a serialized DOCX archive.
fn document_xml(bytes: &[u8]) -> String {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).expect("serialize produced a valid ZIP");
    let mut doc = archive
        .by_name("word/document.xml")
        .expect("word/document.xml present");
    let mut content = String::new();
    doc.read_to_string(&mut content).unwrap();
    content
}

#[test]
fn test_ppr_round_trip() {
    let input = docx_with_ppr();

    // Parse: raw_ppr must capture the whole <w:pPr> subtree.
    let parser = OoxmlParser::new();
    let doc = parser.parse(&input).expect("parse should succeed");
    let body = doc.docx_body.as_ref().expect("docx body present");
    let paras = body.paragraphs();
    assert_eq!(paras.len(), 1);

    let raw = paras[0].raw_ppr.as_deref().expect("raw_ppr captured");
    assert!(raw.starts_with("<w:pPr>"));
    assert!(raw.ends_with("</w:pPr>"));
    assert!(raw.contains("<w:numPr>"));
    assert!(raw.contains(r#"<w:ilvl w:val="0"/>"#));
    assert!(raw.contains(r#"<w:numId w:val="1"/>"#));
    assert!(
        raw.contains(r#"<w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/>"#)
    );

    // Serialize: verbatim pPr must be re-emitted unchanged.
    let serializer = OoxmlSerializer::new();
    let out = serializer
        .serialize(&doc)
        .expect("serialize should succeed");
    let document = document_xml(&out);

    assert!(
        document.contains(
            r#"<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>"#
        ),
        "verbatim pPr must survive the round trip"
    );
    assert!(document.contains("Numbered list item"));
}

#[test]
fn test_paragraph_without_ppr_has_no_raw() {
    // A paragraph without <w:pPr> must leave raw_ppr at None and still
    // serialize through the typed-property fallback path.
    let input = {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(Cursor::new(&mut buf));
            zip.start_file(
                "[Content_Types].xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
            )
            .unwrap();
            zip.start_file(
                "word/document.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Plain</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        buf
    };

    let parser = OoxmlParser::new();
    let doc = parser.parse(&input).expect("parse should succeed");
    let paras = doc.docx_body.as_ref().unwrap().paragraphs();
    assert!(paras[0].raw_ppr.is_none());

    let serializer = OoxmlSerializer::new();
    let out = serializer
        .serialize(&doc)
        .expect("serialize should succeed");
    assert!(document_xml(&out).contains("Plain"));
}
