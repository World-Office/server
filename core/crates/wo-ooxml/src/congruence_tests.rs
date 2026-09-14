//! Congruence tests: parse→serialize round-trips must preserve XML the typed
//! model cannot represent.
//!
//! `DocxParagraph.raw_ppr` and the table/raw captures (`raw_tbl_pr`,
//! `raw_tbl_grid`, `raw_tc_pr`) carry verbatim XML subtrees through a
//! parse-serialize cycle, so features the typed model cannot represent
//! (numbering, borders, merges, `gridCol`) survive anyway.

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

/// Build a minimal DOCX with two runs: one carrying a `<w:rPr>` with
/// properties the typed model cannot represent (`rStyle`, `shd`), one plain.
fn docx_with_rpr() -> Vec<u8> {
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
      <w:r><w:rPr><w:rStyle w:val="Foo"/><w:shd w:val="clear" w:fill="FFFF00"/></w:rPr><w:t>Styled run</w:t></w:r>
      <w:r><w:t>Plain</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        )
        .unwrap();
        zip.finish().unwrap();
    }
    buf
}

#[test]
fn test_run_rpr_round_trip() {
    let input = docx_with_rpr();

    // Parse: raw_rpr must capture the whole <w:rPr> subtree verbatim.
    let parser = OoxmlParser::new();
    let doc = parser.parse(&input).expect("parse should succeed");
    let paras = doc
        .docx_body
        .as_ref()
        .expect("docx body present")
        .paragraphs();
    assert_eq!(paras[0].runs.len(), 2);

    let styled = &paras[0].runs[0];
    assert_eq!(styled.text, "Styled run");
    let raw = styled.raw_rpr.as_deref().expect("raw_rpr captured");
    assert!(raw.starts_with("<w:rPr>"));
    assert!(raw.ends_with("</w:rPr>"));
    assert!(raw.contains(r#"<w:rStyle w:val="Foo"/"#));
    assert!(raw.contains(r#"<w:shd w:val="clear" w:fill="FFFF00"/"#));

    // A run with no <w:rPr> leaves raw_rpr at None.
    assert!(paras[0].runs[1].raw_rpr.is_none());
    assert_eq!(paras[0].runs[1].text, "Plain");

    // Serialize: verbatim rPr must be re-emitted unchanged, before <w:t>.
    let serializer = OoxmlSerializer::new();
    let out = serializer
        .serialize(&doc)
        .expect("serialize should succeed");
    let document = document_xml(&out);

    assert!(
        document.contains(
            r#"<w:rPr><w:rStyle w:val="Foo"/><w:shd w:val="clear" w:fill="FFFF00"/></w:rPr><w:t xml:space="preserve">Styled run</w:t>"#
        ),
        "verbatim rPr must survive the round trip before <w:t>"
    );
    assert!(document.contains("Plain"));
}

/// Build a minimal DOCX whose paragraph carries a run with an inline
/// `<w:drawing>` (an anchored picture referencing an image via `r:embed`).
fn docx_with_drawing() -> Vec<u8> {
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
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0">
            <wp:extent cx="914400" cy="914400"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr><pic:cNvPr id="1" name="Picture 1"/></pic:nvPicPr>
                  <pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill>
                  <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
      <w:r><w:t>Caption</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        )
        .unwrap();
        zip.finish().unwrap();
    }
    buf
}

#[test]
fn test_drawing_round_trip() {
    let input = docx_with_drawing();

    // Parse: drawing must be captured verbatim on the drawing run; the plain
    // caption run leaves drawing at None.
    let parser = OoxmlParser::new();
    let doc = parser.parse(&input).expect("parse should succeed");
    let paras = doc
        .docx_body
        .as_ref()
        .expect("docx body present")
        .paragraphs();
    assert_eq!(paras[0].runs.len(), 2);

    let drawing_run = &paras[0].runs[0];
    assert!(drawing_run.text.is_empty());
    let raw = drawing_run.drawing.as_deref().expect("drawing captured");
    assert!(raw.starts_with("<w:drawing>"));
    assert!(raw.ends_with("</w:drawing>"));
    assert!(raw.contains(r#"<wp:inline distT="0" distB="0">"#));
    assert!(raw.contains(r#"<wp:extent cx="914400" cy="914400"/"#));
    assert!(raw.contains(r#"<pic:cNvPr id="1" name="Picture 1"/"#));
    assert!(raw.contains(r#"<a:blip r:embed="rId7"/"#));

    assert!(paras[0].runs[1].drawing.is_none());
    assert_eq!(paras[0].runs[1].text, "Caption");

    // Serialize: verbatim drawing must be re-emitted unchanged.
    let serializer = OoxmlSerializer::new();
    let out = serializer
        .serialize(&doc)
        .expect("serialize should succeed");
    let document = document_xml(&out);

    assert!(
        document.contains("<w:drawing>"),
        "drawing must be re-emitted"
    );
    assert!(
        document.contains(r#"<wp:extent cx="914400" cy="914400"/"#),
        "inline geometry must survive the round trip"
    );
    assert!(
        document.contains(r#"<a:blip r:embed="rId7"/"#),
        "image relationship reference must survive the round trip"
    );
    assert!(
        document.contains(r#"<pic:cNvPr id="1" name="Picture 1"/"#),
        "picture name must survive the round trip"
    );
    assert!(document.contains("Caption"));
}

/// Build a minimal DOCX whose paragraph mixes plain runs with a
/// `<w:hyperlink r:id="rId7">` containing two runs.
fn docx_with_hyperlink() -> Vec<u8> {
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
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>Before </w:t></w:r>
      <w:hyperlink r:id="rId7">
        <w:r><w:rPr><w:b/></w:rPr><w:t>World</w:t></w:r>
        <w:r><w:t> Office</w:t></w:r>
      </w:hyperlink>
      <w:r><w:t> after</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        )
        .unwrap();
        zip.finish().unwrap();
    }
    buf
}

#[test]
fn test_hyperlink_round_trip() {
    let input = docx_with_hyperlink();

    // Parse: every run inside <w:hyperlink r:id="rId7"> carries the r:id;
    // runs outside the hyperlink leave it at None.
    let parser = OoxmlParser::new();
    let doc = parser.parse(&input).expect("parse should succeed");
    let paras = doc
        .docx_body
        .as_ref()
        .expect("docx body present")
        .paragraphs();
    assert_eq!(paras[0].runs.len(), 4);

    assert_eq!(paras[0].runs[0].text, "Before ");
    assert!(paras[0].runs[0].hyperlink_rid.is_none());

    assert_eq!(paras[0].runs[1].text, "World");
    assert!(paras[0].runs[1].bold);
    assert_eq!(paras[0].runs[1].hyperlink_rid.as_deref(), Some("rId7"));
    assert_eq!(paras[0].runs[2].text, " Office");
    assert_eq!(paras[0].runs[2].hyperlink_rid.as_deref(), Some("rId7"));

    assert_eq!(paras[0].runs[3].text, " after");
    assert!(paras[0].runs[3].hyperlink_rid.is_none());

    // Serialize: the two same-r:id runs must be re-grouped into exactly one
    // <w:hyperlink r:id="rId7"> wrapper.
    let serializer = OoxmlSerializer::new();
    let out = serializer
        .serialize(&doc)
        .expect("serialize should succeed");
    let document = document_xml(&out);

    assert_eq!(
        document.matches(r#"<w:hyperlink r:id="rId7">"#).count(),
        1,
        "hyperlink runs must be grouped into a single wrapper"
    );
    assert_eq!(document.matches("</w:hyperlink>").count(), 1);
    assert!(
        document.contains(r#"<w:hyperlink r:id="rId7"><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">World</w:t></w:r><w:r><w:t xml:space="preserve"> Office</w:t></w:r></w:hyperlink>"#),
        "both inner runs must sit inside the wrapper, formatting preserved"
    );
    assert!(document.contains("Before "));
    assert!(document.contains(" after"));
}

/// Build a minimal DOCX containing a table with borders, column widths,
/// a vertical merge, and a `tblGrid` with `gridCol` definitions.
fn docx_with_table() -> Vec<u8> {
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
    <w:tbl>
      <w:tblPr><w:tblW w:w="5000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="12" w:color="FF0000"/><w:insideH w:val="single" w:sz="4" w:color="0000FF"/></w:tblBorders></w:tblPr>
      <w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="2000"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:tcBorders><w:bottom w:val="double" w:sz="6"/></w:tcBorders></w:tcPr><w:p><w:r><w:t>Head</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Merged</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>"#,
        )
        .unwrap();
        zip.finish().unwrap();
    }
    buf
}

#[test]
fn test_table_round_trip() {
    let input = docx_with_table();

    // Parse: raw_tbl_pr / raw_tbl_grid / raw_tc_pr must capture their
    // subtrees verbatim.
    let parser = OoxmlParser::new();
    let doc = parser.parse(&input).expect("parse should succeed");
    let body = doc.docx_body.as_ref().expect("docx body present");
    let tables = body.tables();
    assert_eq!(tables.len(), 1);
    let table = tables[0];
    assert_eq!(table.rows.len(), 2);

    let tbl_pr = table.raw_tbl_pr.as_deref().expect("raw_tbl_pr captured");
    assert!(tbl_pr.starts_with("<w:tblPr>"));
    assert!(tbl_pr.ends_with("</w:tblPr>"));
    assert!(tbl_pr.contains(r#"<w:tblW w:w="5000" w:type="dxa"/>"#));
    assert!(tbl_pr.contains(r#"<w:top w:val="single" w:sz="12" w:color="FF0000"/>"#));
    assert!(tbl_pr.contains(r#"<w:insideH w:val="single" w:sz="4" w:color="0000FF"/>"#));

    let grid = table
        .raw_tbl_grid
        .as_deref()
        .expect("raw_tbl_grid captured");
    assert!(grid.starts_with("<w:tblGrid>"));
    assert!(grid.ends_with("</w:tblGrid>"));
    assert_eq!(grid.matches("<w:gridCol").count(), 2);
    assert!(grid.contains(r#"<w:gridCol w:w="3000"/>"#));
    assert!(grid.contains(r#"<w:gridCol w:w="2000"/>"#));

    let head = &table.rows[0].cells[0];
    let tc_pr = head.raw_tc_pr.as_deref().expect("raw_tc_pr captured");
    assert!(tc_pr.starts_with("<w:tcPr>"));
    assert!(tc_pr.ends_with("</w:tcPr>"));
    assert!(tc_pr.contains(r#"<w:tcW w:w="3000" w:type="dxa"/>"#));
    assert!(tc_pr.contains(r#"<w:bottom w:val="double" w:sz="6"/>"#));

    // vMerge in element form: invisible to the typed model, preserved raw.
    assert!(table.rows[0].cells[1]
        .raw_tc_pr
        .as_deref()
        .unwrap()
        .contains(r#"<w:vMerge w:val="restart"/>"#));
    assert!(table.rows[1].cells[1]
        .raw_tc_pr
        .as_deref()
        .unwrap()
        .contains("<w:vMerge/>"));

    // Serialize: verbatim subtrees must be re-emitted unchanged, in order
    // tblPr -> tblGrid -> rows.
    let serializer = OoxmlSerializer::new();
    let out = serializer
        .serialize(&doc)
        .expect("serialize should succeed");
    let document = document_xml(&out);

    assert!(
        document.contains(
            r#"<w:tblPr><w:tblW w:w="5000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="12" w:color="FF0000"/><w:insideH w:val="single" w:sz="4" w:color="0000FF"/></w:tblBorders></w:tblPr>"#
        ),
        "verbatim tblPr (borders, widths) must survive the round trip"
    );
    assert!(
        document
            .contains(r#"<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="2000"/></w:tblGrid>"#),
        "verbatim tblGrid with gridCol definitions must survive the round trip"
    );
    assert!(
        document.contains(
            r#"<w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:tcBorders><w:bottom w:val="double" w:sz="6"/></w:tcBorders></w:tcPr>"#
        ),
        "verbatim tcPr (cell width, borders) must survive the round trip"
    );
    assert!(
        document.contains(r#"<w:vMerge w:val="restart"/>"#),
        "vertical-merge restart must survive the round trip"
    );
    assert!(
        document.contains("<w:vMerge/>"),
        "vertical-merge continuation must survive the round trip"
    );
    assert!(document.contains("Head"));
    assert!(document.contains("Body"));

    let tbl_start = document.find("<w:tbl>").expect("table emitted");
    let (i_pr, i_grid) = (
        document.find("<w:tblPr>").expect("tblPr emitted"),
        document.find("<w:tblGrid>").expect("tblGrid emitted"),
    );
    let i_tr = document[tbl_start..].find("<w:tr>").expect("row emitted") + tbl_start;
    assert!(
        tbl_start < i_pr && i_pr < i_grid && i_grid < i_tr,
        "tblPr must precede tblGrid, tblGrid must precede the first row"
    );
}

#[test]
fn test_table_without_raw_props_uses_typed_fallback() {
    // A table without tblPr/tblGrid and cells without tcPr must leave the
    // raw fields at None and serialize through the typed fallback path.
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
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Bare</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
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
    let tables = doc.docx_body.as_ref().unwrap().tables();
    assert!(tables[0].raw_tbl_pr.is_none());
    assert!(tables[0].raw_tbl_grid.is_none());
    assert!(tables[0].rows[0].cells[0].raw_tc_pr.is_none());

    let serializer = OoxmlSerializer::new();
    let out = serializer
        .serialize(&doc)
        .expect("serialize should succeed");
    let document = document_xml(&out);
    assert!(document.contains("Bare"));
    assert!(!document.contains("<w:tblPr>"));
    assert!(!document.contains("<w:tblGrid>"));
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

/// Corpus congruence test: a rich document combining every raw-capture
/// feature (numPr, styled runs, table, inline drawing, hyperlink, body
/// sectPr) must survive a parse→serialize round trip.
#[test]
fn test_rich_corpus_round_trip() {
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
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>First item</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="2"/></w:numPr></w:pPr>
      <w:r><w:t>Second item</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/><w:color w:val="FF0000"/></w:rPr><w:t>Bold colored</w:t></w:r>
      <w:hyperlink r:id="rId7"><w:r><w:t>linked</w:t></w:r></w:hyperlink>
      <w:r><w:t>after link</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="5000" w:type="dxa"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid>
      <w:tr><w:tc><w:p><w:r><w:t>Head cell</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Body cell</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0">
            <wp:extent cx="914400" cy="914400"/>
            <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic/></a:graphicData></a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
      <w:r><w:t>Caption</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418"/></w:sectPr>
  </w:body>
</w:document>"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        buf
    };

    // Parse: raw_sect_pr must hold the verbatim body-level sectPr.
    let parser = OoxmlParser::new();
    let doc = parser.parse(&input).expect("parse should succeed");
    let body = doc.docx_body.as_ref().expect("docx body present");
    let raw_sect = body.raw_sect_pr.as_deref().expect("raw_sect_pr captured");
    assert!(raw_sect.starts_with("<w:sectPr>"));
    assert!(raw_sect.ends_with("</w:sectPr>"));
    assert!(raw_sect.contains(r#"<w:pgSz w:w="11906" w:h="16838"/>"#));
    assert!(raw_sect.contains(r#"<w:pgMar w:top="1418" w:right="1418"/>"#));

    // Serialize: every corpus feature must survive.
    let serializer = OoxmlSerializer::new();
    let out = serializer
        .serialize(&doc)
        .expect("serialize should succeed");
    let document = document_xml(&out);

    assert!(
        document.matches("<w:numPr>").count() >= 2,
        "both numbering definitions must survive"
    );
    assert!(
        document.contains(r#"<w:numId w:val="2"/>"#),
        "second numbering id must survive"
    );
    assert_eq!(
        document.matches("<w:drawing").count(),
        1,
        "exactly one inline drawing must survive"
    );
    assert!(
        document.contains(r#"<w:hyperlink r:id="rId7">"#),
        "hyperlink wrapper must survive"
    );
    assert!(document.contains("<w:tblPr>"), "table properties must survive");
    assert!(document.contains("<w:sectPr>"), "section properties must survive");
    assert!(
        document.contains(r#"<w:pgSz w:w="11906" w:h="16838"/>"#),
        "page geometry must survive verbatim"
    );
    assert!(
        document.contains(r#"<w:b/><w:color w:val="FF0000"/>"#),
        "bold + color run properties must survive"
    );

    // All texts preserved.
    for text in [
        "First item",
        "Second item",
        "Bold colored",
        "linked",
        "after link",
        "Head cell",
        "Body cell",
        "Caption",
    ] {
        assert!(document.contains(text), "text {:?} must survive", text);
    }
}
