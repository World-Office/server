//! LEDGER2 true-gap gates: html -> docx -> html round trips for the
//! converter channels that were dropped pre-fix (entities, run styling,
//! sup/sub, alignment, lists, hyperlinks) plus UTF-8 safety.
use std::io::Read;
use wo_x2t::converter::FormatConverter;
use wo_x2t::converters::{DocxToHtmlConverter, HtmlToDocxConverter};

fn docx_xml(docx: &[u8]) -> String {
    let cursor = std::io::Cursor::new(docx);
    let mut zip = zip::ZipArchive::new(cursor).unwrap();
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    xml
}

fn zip_has(docx: &[u8], name: &str) -> bool {
    let cursor = std::io::Cursor::new(docx);
    zip::ZipArchive::new(cursor).unwrap().by_name(name).is_ok()
}

fn roundtrip(html: &str) -> String {
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let out = DocxToHtmlConverter.convert(&docx).unwrap();
    String::from_utf8(out).unwrap()
}

#[test]
fn gap_entities_nbsp_parses_and_survives() {
    let html = "<html><body><p>A&nbsp;B &mdash; C&hellip;</p></body></html>";
    let out = roundtrip(html);
    assert!(
        out.contains("A\u{a0}B") && out.contains('—') && out.contains('…'),
        "entities lost: {}",
        out
    );
}

#[test]
fn gap_utf8_roundtrip() {
    let out = roundtrip("<html><body><p>Grüße § Köln 日本</p></body></html>");
    assert!(out.contains("Grüße § Köln 日本"), "utf8 lost: {}", out);
}

#[test]
fn gap_run_styling_docx_side() {
    let html = r#"<html><body><p><span style="color: #FF0000; font-size: 24pt; font-family: Arial">red big</span></p></body></html>"#;
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let xml = docx_xml(&docx);
    assert!(
        xml.contains(r#"<w:color w:val="FF0000""#),
        "color not in docx: {}",
        xml
    );
    assert!(
        xml.contains(r#"<w:sz w:val="48""#),
        "size (half-points) not in docx: {}",
        xml
    );
    assert!(xml.contains("Arial"), "font not in docx: {}", xml);
}

#[test]
fn gap_run_styling_html_side() {
    let out = roundtrip(
        r#"<html><body><p><span style="color: #FF0000; font-size: 24pt">red big</span></p></body></html>"#,
    );
    assert!(out.contains("color: #FF0000"), "color lost: {}", out);
    assert!(out.contains("font-size: 24pt"), "size lost: {}", out);
}

#[test]
fn gap_vertalign_roundtrip() {
    let out = roundtrip("<html><body><p>x<sup>2</sup> H<sub>2</sub>O</p></body></html>");
    assert!(out.contains("<sup>"), "sup lost: {}", out);
    assert!(out.contains("<sub>"), "sub lost: {}", out);
}

#[test]
fn gap_alignment_roundtrip() {
    let out = roundtrip(r#"<html><body><p style="text-align: center">mid</p></body></html>"#);
    assert!(out.contains("text-align: center"), "align lost: {}", out);
    let docx = HtmlToDocxConverter
        .convert(r#"<html><body><p style="text-align: center">mid</p></body></html>"#.as_bytes())
        .unwrap();
    assert!(
        docx_xml(&docx).contains(r#"<w:jc w:val="center""#),
        "w:jc missing"
    );
}

#[test]
fn gap_lists_roundtrip() {
    let html = "<html><body><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol></body></html>";
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let xml = docx_xml(&docx);
    assert!(
        xml.contains("<w:numId w:val=\"1\"/>"),
        "ul numPr missing: {}",
        xml
    );
    assert!(
        xml.contains("<w:numId w:val=\"2\"/>"),
        "ol numPr missing: {}",
        xml
    );
    assert!(
        zip_has(&docx, "word/numbering.xml"),
        "numbering.xml missing"
    );
    let out = roundtrip(html);
    assert!(out.contains("<ul>"), "ul lost: {}", out);
    assert!(out.contains("<ol>"), "ol lost: {}", out);
    assert!(
        out.contains("one") && out.contains("two") && out.contains("first"),
        "items lost: {}",
        out
    );
}

#[test]
fn gap_no_numbering_part_without_lists() {
    let docx = HtmlToDocxConverter
        .convert("<html><body><p>plain</p></body></html>".as_bytes())
        .unwrap();
    assert!(!zip_has(&docx, "word/numbering.xml"), "stray numbering.xml");
}

#[test]
fn gap_hyperlink_roundtrip() {
    let html = r#"<html><body><p><a href="https://example.com/x">link text</a></p></body></html>"#;
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let xml = docx_xml(&docx);
    assert!(
        xml.contains("<w:hyperlink r:id=") && !xml.contains("link text (https"),
        "hyperlink not real: {}",
        xml
    );
    let out = roundtrip(html);
    assert!(
        out.contains(r#"href="https://example.com/x""#) && out.contains("link text"),
        "link lost: {}",
        out
    );
}

#[test]
fn gap_run_styling_survives_bold_nesting() {
    let out = roundtrip(
        r#"<html><body><p><strong><span style="color: #00FF00">green bold</span></strong></p></body></html>"#,
    );
    assert!(
        out.contains("color: #00FF00"),
        "color lost in nesting: {}",
        out
    );
}
