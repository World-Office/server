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

/// Build a minimal valid docx zip around a hand-written word/document.xml.
fn docx_from_document_xml(document_xml: &str) -> Vec<u8> {
    docx_from_parts(&[("word/document.xml", document_xml)])
}

/// Build a minimal valid docx zip around hand-written parts (P2-05: lets a
/// test add a foreign word/numbering.xml next to word/document.xml).
fn docx_from_parts(parts: &[(&str, &str)]) -> Vec<u8> {
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>"#)
            .unwrap();
        zip.start_file("_rels/.rels", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#)
            .unwrap();
        for (name, xml) in parts {
            zip.start_file(*name, SimpleFileOptions::default()).unwrap();
            zip.write_all(xml.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }
    buf
}

/// Read an arbitrary zip entry from a docx as utf8 (P2-05: numbering.xml).
fn zip_entry(docx: &[u8], name: &str) -> String {
    let cursor = std::io::Cursor::new(docx);
    let mut zip = zip::ZipArchive::new(cursor).unwrap();
    let mut xml = String::new();
    zip.by_name(name).unwrap().read_to_string(&mut xml).unwrap();
    xml
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
fn c2_3_ol_start_value_roundtrip() {
    // C2-3: <ol start="5"> must emit w:startValue on the first list
    // paragraph and survive the docx -> html direction back to <ol start>.
    let html = "<html><body><ol start=\"5\"><li>alpha</li><li>beta</li></ol></body></html>";
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let xml = docx_xml(&docx);
    assert!(
        xml.contains(r#"<w:startValue w:val="5""#),
        "w:startValue missing in docx: {}",
        xml
    );
    // exactly one startValue (first item only)
    let count = xml.matches("<w:startValue").count();
    assert_eq!(
        count, 1,
        "expected exactly one w:startValue, found {}",
        count
    );
    let out = roundtrip(html);
    assert!(
        out.contains(r#"<ol start="5">"#),
        "ol start lost in roundtrip: {}",
        out
    );
}

#[test]
fn c2_3_ol_default_start_omits_start_value() {
    // start=1 (default) should NOT emit w:startValue; the XML stays canonical.
    let html = "<html><body><ol><li>a</li><li>b</li></ol></body></html>";
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let xml = docx_xml(&docx);
    assert!(
        !xml.contains("startValue"),
        "default start must not emit startValue: {}",
        xml
    );
}

#[test]
fn c2_3_docx_start_value_parses_to_ol_start() {
    // Hand-authored docx: a numbered list whose first paragraph carries
    // w:startValue=3 converts to <ol start="3">.
    let docx = HtmlToDocxConverter
        .convert("<html><body><ol start=\"3\"><li>one</li></ol></body></html>".as_bytes())
        .unwrap();
    let out = DocxToHtmlConverter.convert(&docx).unwrap();
    let out = String::from_utf8(out).unwrap();
    assert!(
        out.contains(r#"<ol start="3">"#),
        "docx->html lost start: {}",
        out
    );
}

#[test]
fn c2_2_list_indent_roundtrip() {
    // C2-2: <ol style="margin-left:...;text-indent:..."> must emit w:ind
    // left/hanging and survive html -> docx -> html.
    let html = "<html><body><ol style=\"margin-left:75px;text-indent:-25px\"><li>a</li><li>b</li></ol></body></html>";
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let xml = docx_xml(&docx);
    assert!(
        xml.contains(r#"<w:ind w:left="1125""#),
        "w:ind left missing (75px -> 1125 twips): {}",
        xml[xml.find("<w:ind").unwrap_or(xml.len().saturating_sub(200))..]
            .chars()
            .take(200)
            .collect::<String>()
    );
    assert!(
        xml.contains(r#"w:hanging="375""#),
        "w:hanging missing (25px -> 375 twips)"
    );
    let out = roundtrip(html);
    assert!(
        out.contains("margin-left:75px") && out.contains("text-indent:-25px"),
        "list indent lost in roundtrip: {}",
        out
    );
}

#[test]
fn c2_2_list_indent_default_clean() {
    // Plain lists must not suddenly gain style attributes.
    let html = "<html><body><ul><li>x</li></ul></body></html>";
    let out = roundtrip(html);
    assert!(
        !out.contains("<ul style=\""),
        "plain ul gained stray style: {}",
        out
    );
}

#[test]
fn c2_2b_list_style_type_roundtrip() {
    // C2-2b: <ol style="list-style-type:lower-roman"> -> number the
    // paragraphs with numId 4 and round-trip back to the same css.
    let html = "<html><body><ol style=\"list-style-type:lower-roman\"><li>i</li><li>ii</li></ol></body></html>";
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let xml = docx_xml(&docx);
    assert!(
        xml.contains("<w:numId w:val=\"4\"/>"),
        "lower-roman must map to numId 4"
    );
    let out = roundtrip(html);
    assert!(
        out.contains("list-style-type:lower-roman"),
        "lower-roman lost in roundtrip: {}",
        out
    );
    // Bullet formats use the bullet numIds (1 disc, 7 circle, 8 square).
    let circle = "<html><body><ul style=\"list-style-type:circle\"><li>x</li></ul></body></html>";
    let docx2 = HtmlToDocxConverter.convert(circle.as_bytes()).unwrap();
    let xml2 = docx_xml(&docx2);
    assert!(xml2.contains("<w:numId w:val=\"7\"/>"), "circle -> numId 7");
    let out2 = roundtrip(circle);
    assert!(
        out2.contains("list-style-type:circle"),
        "circle lost: {}",
        out2
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

#[test]
fn page_number_span_becomes_docx_page_field_and_back() {
    // The editor's flat HTML puts an empty class-only page-number span next
    // to body paragraphs. It must convert to a real w:fldSimple PAGE field
    // in the docx and survive back to the same dialect marker.
    let html = "<span class=\"page-number\"></span><p>Sentinel paragraph here.</p>";
    let docx = HtmlToDocxConverter.convert(html.as_bytes()).unwrap();
    let xml = docx_xml(&docx);
    assert!(
        xml.contains("fldSimple") && xml.contains("PAGE"),
        "docx must carry a PAGE field, got: {}",
        xml
    );
    let out = DocxToHtmlConverter.convert(&docx).unwrap();
    let out = String::from_utf8(out).unwrap();
    assert!(
        out.contains("class=\"page-number\""),
        "page-number marker must survive the round trip: {}",
        out
    );
    // and the text next to it is untouched
    assert!(out.contains("Sentinel paragraph here."), "{}", out);
}

fn paragraph_fields(docx: &[u8]) -> Vec<wo_ooxml::model::DocxField> {
    let parsed = wo_ooxml::OoxmlParser::new().parse(docx).unwrap();
    let body = parsed.docx_body.as_ref().unwrap();
    body.blocks
        .iter()
        .flat_map(|b| match b {
            wo_ooxml::model::DocxBlock::Paragraph(p) => p.fields.clone(),
            _ => Vec::new(),
        })
        .collect()
}

#[test]
fn gap_fields_roundtrip() {
    // P2-03 fields engine: a document mixing the w:fldSimple shorthand and
    // complex w:fldChar begin/instrText/separate/end fields (NUMPAGES with a
    // cached result, TOC without one, a nested PAGEREF) must parse into
    // typed DocxField entries, render the cached results (never the
    // instructions) to HTML, and survive a docx -> docx re-serialization.
    let document_xml = br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>4</w:t></w:r></w:fldSimple><w:r><w:t> of </w:t></w:r></w:p>
    <w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>12</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
    </w:p>
    <w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve">TOC \o &quot;1-3&quot; \h</w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> PAGEREF _Toc1 \h </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>7</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
    </w:p>
    <w:p><w:r><w:t>Sentinel paragraph here.</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
    let docx = docx_from_document_xml(
        std::str::from_utf8(document_xml).expect("document.xml is utf8"),
    );

    // 1. Typed parse: fldSimple + complex + nested fields normalize to
    //    DocxField entries with the right instruction, kind and cached
    //    result; field plumbing never lands in run text. The nested PAGEREF
    //    inside the TOC is its own typed field, and its visible result
    //    bubbles up into the enclosing TOC's cached result.
    let fields = paragraph_fields(&docx);
    assert_eq!(fields.len(), 4, "expected 4 typed fields: {:?}", fields);
    assert_eq!(fields[0].instruction, " PAGE ");
    assert_eq!(fields[0].kind, wo_ooxml::model::FieldKind::Page);
    assert!(!fields[0].complex);
    assert_eq!(fields[0].cached_result.as_deref(), Some("4"));
    assert_eq!(fields[1].instruction, " NUMPAGES ");
    assert_eq!(fields[1].kind, wo_ooxml::model::FieldKind::NumPages);
    assert!(fields[1].complex);
    assert_eq!(fields[1].cached_result.as_deref(), Some("12"));
    assert_eq!(fields[2].instruction, " PAGEREF _Toc1 \\h ");
    assert_eq!(fields[2].kind, wo_ooxml::model::FieldKind::PageRef);
    assert!(fields[2].complex);
    assert_eq!(fields[2].cached_result.as_deref(), Some("7"));
    assert_eq!(fields[3].instruction, "TOC \\o \"1-3\" \\h");
    assert_eq!(fields[3].kind, wo_ooxml::model::FieldKind::Toc);
    assert_eq!(
        fields[3].cached_result.as_deref(),
        Some("7"),
        "nested PAGEREF result must bubble into the TOC result"
    );
    assert_eq!(fields[3].instruction_token(), "TOC");
    let parsed = wo_ooxml::OoxmlParser::new().parse(&docx).unwrap();
    let body = parsed.docx_body.as_ref().unwrap();
    let leaked: Vec<&str> = body
        .blocks
        .iter()
        .flat_map(|b| match b {
            wo_ooxml::model::DocxBlock::Paragraph(p) => p.runs.iter().collect::<Vec<_>>(),
            _ => Vec::new(),
        })
        .filter_map(|r| {
            let t = r.text.as_str();
            (t.contains("NUMPAGES") || t.contains("instrText")).then_some(t)
        })
        .collect();
    assert!(leaked.is_empty(), "instruction leaked into run text");

    // 2. HTML side: cached results render as text, instructions never leak,
    //    and non-PAGE fields keep their instruction in the dialect marker.
    let html = DocxToHtmlConverter.convert(&docx).unwrap();
    let html = String::from_utf8(html).unwrap();
    assert!(html.contains("Page "), "body text lost: {html}");
    // Editor dialect: a field renders as an empty page-number span with the
    // cached result as plain text right after it.
    assert!(html.contains("</span>4"), "fldSimple cached result lost: {html}");
    assert!(html.contains("</span>12"), "complex cached result lost: {html}");
    assert!(html.contains("</span>7"), "nested PAGEREF result lost: {html}");
    assert!(
        html.contains("data-field=\" NUMPAGES \"") || html.contains("data-field=\"NUMPAGES\""),
        "complex field marker lost: {html}"
    );
    assert!(
        !html.contains(">NUMPAGES<") && !html.contains("instrText"),
        "instruction leaked as text: {html}"
    );
    assert!(
        html.contains("Sentinel paragraph here."),
        "body text lost: {html}"
    );

    // 3. docx -> docx: re-serializing through the OOXML engine keeps the
    //    complex-field XML and re-parses to the same typed fields.
    let reser = wo_ooxml::OoxmlSerializer::new().serialize(&parsed).unwrap();
    let xml2 = docx_xml(&reser);
    assert!(
        xml2.contains("fldChar") && xml2.contains("instrText"),
        "complex-field XML lost in re-serialization: {}",
        xml2
    );
    assert!(xml2.contains("fldSimple"), "fldSimple lost: {}", xml2);
    let fields2 = paragraph_fields(&reser);
    assert_eq!(fields, fields2, "typed fields changed across docx round trip");
}

#[test]
fn gap_numbering_foreign_roundtrip() {
    // P2-05: a foreign word/numbering.xml (abstractNum ids + numFmts WO's
    // fixed 8-template never emits: upperRoman, lowerLetter, lvlText masks,
    // a lvlOverride startOverride) must (a) land in the typed
    // DocxNumbering, (b) survive a docx -> docx re-serialization instead of
    // collapsing to the fixed template, and (c) drive the docx -> html list
    // mapping (ordered + css list-style-type straight from w:numFmt).
    let numbering_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="100">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:name w:val="Outline Roman"/>
    <w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/><w:lvlJc w:val="left"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="200">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="(%1)"/><w:lvlJc w:val="left"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="300">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="ordinal"/><w:lvlText w:val="%1"/><w:isLgl/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="42"><w:abstractNumId w:val="100"/>
    <w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride>
  </w:num>
  <w:num w:numId="43"><w:abstractNumId w:val="300"/></w:num>
  <w:num w:numId="44"><w:abstractNumId w:val="200"/></w:num>
</w:numbering>"#;
    let document_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="42"/></w:numPr></w:pPr><w:r><w:t>First level item</w:t></w:r></w:p>
    <w:p><w:r><w:t>Mid sentinel paragraph.</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="44"/></w:numPr></w:pPr><w:r><w:t>Letter item</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second sentinel paragraph.</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="43"/></w:numPr></w:pPr><w:r><w:t>Ordinal item</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
    let docx = docx_from_parts(&[
        ("word/document.xml", document_xml),
        ("word/numbering.xml", numbering_xml),
    ]);

    // 1. Typed parse: both foreign abstractNums, their levels (numFmt /
    //    lvlText / ind / isLgl) and the num bindings + startOverride land
    //    in DocxNumbering instead of being ignored.
    let parsed = wo_ooxml::OoxmlParser::new().parse(&docx).unwrap();
    let body = parsed.docx_body.as_ref().unwrap();
    let numbering = body.numbering.as_ref().expect("numbering parsed");
    assert_eq!(numbering.abstract_nums.len(), 3, "all abstractNums");
    let a100 = numbering.abstract_num(100).expect("abstractNum 100");
    assert_eq!(a100.name.as_deref(), Some("Outline Roman"));
    assert_eq!(a100.levels[0].num_fmt.as_deref(), Some("upperRoman"));
    assert_eq!(a100.levels[0].lvl_text.as_deref(), Some("%1."));
    assert_eq!(a100.levels[0].start, Some(3));
    assert_eq!(a100.levels[0].indent_left, Some(720));
    assert_eq!(a100.levels[1].num_fmt.as_deref(), Some("lowerLetter"));
    assert_eq!(a100.levels[1].lvl_text.as_deref(), Some("%2)"));
    assert_eq!(
        numbering.abstract_num(200).unwrap().levels[0]
            .num_fmt
            .as_deref(),
        Some("lowerLetter")
    );
    assert_eq!(
        numbering.abstract_num(200).unwrap().levels[0]
            .lvl_text
            .as_deref(),
        Some("(%1)")
    );
    assert_eq!(
        numbering.abstract_num(300).unwrap().levels[0]
            .num_fmt
            .as_deref(),
        Some("ordinal")
    );
    assert!(numbering.abstract_num(300).unwrap().levels[0].is_lgl);
    assert_eq!(numbering.num(42).unwrap().abstract_num_id, 100);
    assert_eq!(numbering.start_override(42, 0), Some(5));
    assert_eq!(numbering.num(43).unwrap().abstract_num_id, 300);
    assert_eq!(numbering.num(44).unwrap().abstract_num_id, 200);

    // 2. docx -> docx: the serializer re-emits exactly what was parsed
    //    (pre P2-05 this collapsed to the fixed decimal|bullet template).
    let reser = wo_ooxml::OoxmlSerializer::new().serialize(&parsed).unwrap();
    let num_xml = zip_entry(&reser, "word/numbering.xml");
    assert!(
        num_xml.contains(r#"<w:abstractNum w:abstractNumId="100">"#),
        "foreign abstractNum lost: {}",
        num_xml
    );
    assert!(num_xml.contains(r#"<w:numFmt w:val="upperRoman"/>"#));
    assert!(num_xml.contains(r#"<w:numFmt w:val="lowerLetter"/>"#));
    assert!(num_xml.contains(r#"<w:numFmt w:val="ordinal"/>"#));
    assert!(num_xml.contains(r#"<w:lvlText w:val="%2)"/>"#));
    assert!(num_xml.contains(r#"<w:num w:numId="42">"#));
    assert!(num_xml.contains(r#"<w:startOverride w:val="5"/>"#));
    let reparsed = wo_ooxml::OoxmlParser::new().parse(&reser).unwrap();
    let renum = reparsed
        .docx_body
        .as_ref()
        .unwrap()
        .numbering
        .as_ref()
        .expect("numbering survives re-parse");
    assert_eq!(renum, numbering, "typed numbering identical across round trip");

    // 3. docx -> html: w:numFmt drives the list kind and css style for
    //    numIds outside the built-in 1..8 registry.
    let html = DocxToHtmlConverter.convert(&docx).unwrap();
    let html = String::from_utf8(html).unwrap();
    assert!(
        html.contains("list-style-type:upper-roman"),
        "upperRoman numFmt must map to upper-roman css: {}",
        html
    );
    assert!(
        html.contains("list-style-type:lower-alpha"),
        "lowerLetter numFmt must map to lower-alpha css: {}",
        html
    );
    assert!(html.contains("<ol"), "counting numFmts must order lists");
    assert!(html.contains("First level item"), "item lost: {html}");
    assert!(html.contains("Letter item"), "letter item lost: {html}");
    assert!(html.contains("Mid sentinel paragraph."), "body text lost");
    assert!(html.contains("Second sentinel paragraph."), "body text lost");
    assert!(html.contains("Ordinal item"), "ordinal item lost");
}

/// P2-06 test helper: fetch the paragraph at a body block index.
fn docx_para(
    b: &wo_ooxml::model::DocxBody,
    i: usize,
) -> &wo_ooxml::model::DocxParagraph {
    match &b.blocks[i] {
        wo_ooxml::model::DocxBlock::Paragraph(p) => p,
        _ => panic!("block {} must be a paragraph", i),
    }
}

/// P2-06 marker-sequence helper: the bookmark markers of a paragraph's
/// runs in order ("S:<name>" / "E:<id>") — position in the run sequence is
/// what has to round-trip.
fn bookmark_seq(p: &wo_ooxml::model::DocxParagraph) -> Vec<String> {
    p.runs
        .iter()
        .filter_map(|r| match &r.bookmark {
            Some(wo_ooxml::model::BookmarkMarker::Start(b)) => Some(format!(
                "S:{}",
                b.name.as_deref().unwrap_or("?")
            )),
            Some(wo_ooxml::model::BookmarkMarker::End(id)) => Some(format!("E:{}", id)),
            None => None,
        })
        .collect()
}

#[test]
fn gap_bookmark_anchor_roundtrip() {
    // P2-06: typed bookmarks (w:bookmarkStart / w:bookmarkEnd pairs —
    // named, unnamed, nested) and an internal w:hyperlink w:anchor must
    // (a) parse into the typed bookmark catalogue + anchor-tagged runs,
    // (b) render to html as a fragment link <a href="#name">, and
    // (c) survive a docx -> docx re-serialization with the markers in
    // their original run positions.
    let document_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:bookmarkStart w:id="0" w:name="_Toc1"/><w:r><w:t>Heading text</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>
    <w:p><w:bookmarkStart w:id="1" w:name="_Toc2"/><w:bookmarkStart w:id="2"/><w:r><w:t>Nested range text</w:t></w:r><w:bookmarkEnd w:id="2"/><w:bookmarkEnd w:id="1"/></w:p>
    <w:p><w:r><w:t>Jump to </w:t></w:r><w:hyperlink w:anchor="_Toc1"><w:r><w:t>the heading</w:t></w:r></w:hyperlink><w:r><w:t>.</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
    let docx = docx_from_document_xml(document_xml);

    // 1. Typed parse: the catalogue carries every bookmarkStart (named and
    //    anonymous) in document order, the w:anchor tags the link run, and
    //    the markers keep their positions in the run sequence.
    let parsed = wo_ooxml::OoxmlParser::new().parse(&docx).unwrap();
    let body = parsed.docx_body.as_ref().unwrap();
    assert_eq!(body.bookmarks.len(), 3, "bookmark catalogue");
    assert_eq!(body.bookmarks[0].id, "0");
    assert_eq!(body.bookmarks[0].name.as_deref(), Some("_Toc1"));
    assert_eq!(body.bookmarks[1].name.as_deref(), Some("_Toc2"));
    assert_eq!(body.bookmarks[2].id, "2");
    assert_eq!(body.bookmarks[2].name, None, "anonymous bookmark keeps a None name");
    assert_eq!(
        bookmark_seq(docx_para(body, 0)),
        vec!["S:_Toc1".to_string(), "E:0".to_string()],
        "markers must bracket the heading run"
    );
    assert_eq!(
        bookmark_seq(docx_para(body, 1)),
        vec![
            "S:_Toc2".to_string(),
            "S:?".to_string(),
            "E:2".to_string(),
            "E:1".to_string()
        ],
        "nested bookmark ranges keep their interleaved order"
    );
    let anchored: Vec<&str> = docx_para(body, 2)
        .runs
        .iter()
        .filter_map(|r| r.hyperlink_anchor.as_deref())
        .collect();
    assert_eq!(anchored, vec!["_Toc1"], "w:anchor must tag the link run");

    // 2. docx -> html: the anchor link renders as a fragment link, body
    //    text untouched.
    let html = DocxToHtmlConverter.convert(&docx).unwrap();
    let html = String::from_utf8(html).unwrap();
    assert!(
        html.contains(r##"href="#_Toc1""##),
        "anchor link must render as a fragment link: {html}"
    );
    assert!(html.contains("the heading"), "link text lost: {html}");
    assert!(
        html.contains("Heading text") && html.contains("Nested range text"),
        "body text lost: {html}"
    );

    // 3. docx -> docx: markers and the anchor hyperlink re-emit in
    //    position, and re-parse to the identical model.
    let reser = wo_ooxml::OoxmlSerializer::new().serialize(&parsed).unwrap();
    let xml2 = docx_xml(&reser);
    assert!(
        xml2.contains(r#"<w:bookmarkStart w:id="0" w:name="_Toc1"/>"#),
        "named bookmarkStart lost: {xml2}"
    );
    assert!(
        xml2.contains(r#"<w:bookmarkStart w:id="2"/>"#),
        "anonymous bookmark must keep its id-only form: {xml2}"
    );
    assert!(
        xml2.contains(r#"<w:bookmarkEnd w:id="0"/>"#),
        "bookmarkEnd lost: {xml2}"
    );
    assert!(
        xml2.contains(r#"<w:hyperlink w:anchor="_Toc1">"#),
        "anchor hyperlink lost: {xml2}"
    );
    let s = xml2.find(r#"<w:bookmarkStart w:id="0""#).unwrap();
    let t = xml2.find("Heading text").unwrap();
    let e = xml2.find(r#"<w:bookmarkEnd w:id="0"/>"#).unwrap();
    assert!(s < t && t < e, "bookmark range lost its position: {xml2}");
    let reparsed = wo_ooxml::OoxmlParser::new().parse(&reser).unwrap();
    let rbody = reparsed.docx_body.as_ref().unwrap();
    assert_eq!(
        rbody.bookmarks, body.bookmarks,
        "bookmark catalogue must survive the round trip"
    );
    assert_eq!(
        bookmark_seq(docx_para(rbody, 1)),
        bookmark_seq(docx_para(body, 1)),
        "marker order must survive the round trip"
    );

    // 4. html -> docx: a fragment href becomes w:hyperlink w:anchor — no
    //    External relationship is created.
    let docx2 = HtmlToDocxConverter
        .convert(b"<html><body><p><a href=\"#_Toc1\">internal link</a></p></body></html>")
        .unwrap();
    let xml3 = docx_xml(&docx2);
    assert!(
        xml3.contains(r#"<w:hyperlink w:anchor="_Toc1">"#),
        "fragment href must become w:hyperlink w:anchor, got: {xml3}"
    );
    let rels = zip_entry(&docx2, "word/_rels/document.xml.rels");
    assert!(
        !rels.contains("relationships/hyperlink"),
        "anchor link must not create a hyperlink relationship: {rels}"
    );
}

#[test]
fn gap_sdt_roundtrip() {
    // P2-06: w:sdt content controls — block-level (wrapping whole
    // paragraphs, single and multi) and inline (wrapping runs inside a
    // paragraph) — must keep their w:sdtPr metadata (alias/tag/id/
    // placeholder) verbatim across a parse -> serialize -> parse cycle,
    // and their text must still render to html.
    let document_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:sdt>
      <w:sdtPr><w:alias w:val="Author"/><w:tag w:val="author"/><w:id w:val="12345678"/><w:placeholder><w:docPart w:gallery="Normal"/></w:placeholder></w:sdtPr>
      <w:sdtContent><w:p><w:r><w:t>Jane Doe</w:t></w:r></w:p></w:sdtContent>
    </w:sdt>
    <w:p><w:r><w:t>Field: </w:t></w:r><w:sdt><w:sdtPr><w:alias w:val="City"/><w:tag w:val="city"/></w:sdtPr><w:sdtContent><w:r><w:t>Springfield</w:t></w:r></w:sdtContent></w:sdt></w:p>
    <w:sdt>
      <w:sdtPr><w:alias w:val="Section"/><w:tag w:val="section"/><w:id w:val="87654321"/></w:sdtPr>
      <w:sdtContent>
        <w:p><w:r><w:t>First wrapped line</w:t></w:r></w:p>
        <w:p><w:r><w:t>Second wrapped line</w:t></w:r></w:p>
      </w:sdtContent>
    </w:sdt>
  </w:body>
</w:document>"#;
    let docx = docx_from_document_xml(document_xml);

    // 1. Typed parse: two block wraps (single + multi paragraph) with
    //    verbatim sdtPr; the inline sdt becomes Start/End marker runs.
    let parsed = wo_ooxml::OoxmlParser::new().parse(&docx).unwrap();
    let body = parsed.docx_body.as_ref().unwrap();
    assert_eq!(body.sdt_wraps.len(), 2, "block-level sdt wraps");
    assert_eq!(body.sdt_wraps[0].start, 0);
    assert_eq!(body.sdt_wraps[0].end, 0);
    assert!(
        body.sdt_wraps[0].pr.contains(r#"<w:alias w:val="Author"/>"#)
            && body.sdt_wraps[0].pr.contains(r#"<w:docPart w:gallery="Normal"/>"#),
        "verbatim sdtPr must keep alias + placeholder: {}",
        body.sdt_wraps[0].pr
    );
    assert_eq!(body.sdt_wraps[1].start, 2);
    assert_eq!(body.sdt_wraps[1].end, 3, "multi-paragraph wrap spans both blocks");
    assert!(
        body.sdt_wraps[1].pr.contains(r#"<w:tag w:val="section"/>"#),
        "section sdtPr: {}",
        body.sdt_wraps[1].pr
    );
    let inline_para = match &body.blocks[1] {
        wo_ooxml::model::DocxBlock::Paragraph(p) => p,
        _ => panic!("block 1 must be a paragraph"),
    };
    let seq: Vec<String> = inline_para
        .runs
        .iter()
        .map(|r| match &r.sdt {
            Some(wo_ooxml::model::SdtMarker::Start { pr }) => {
                format!("S({})", pr.contains(r#"w:tag w:val="city""#))
            }
            Some(wo_ooxml::model::SdtMarker::End) => "E".to_string(),
            None => format!("T:{}", r.text),
        })
        .collect();
    assert_eq!(
        seq,
        vec![
            "T:Field: ".to_string(),
            "S(true)".to_string(),
            "T:Springfield".to_string(),
            "E".to_string()
        ],
        "inline sdt must become open-marker, text run, close-marker in order"
    );

    // 2. docx -> docx: all three wrappers re-emit with the sdtPr metadata
    //    intact and the multi-paragraph wrap enclosing both paragraphs.
    let reser = wo_ooxml::OoxmlSerializer::new().serialize(&parsed).unwrap();
    let xml2 = docx_xml(&reser);
    assert_eq!(
        xml2.matches("<w:sdt>").count(),
        3,
        "all three sdt wrappers must re-emit: {xml2}"
    );
    assert_eq!(xml2.matches("</w:sdt>").count(), 3, "unbalanced sdt: {xml2}");
    assert!(
        xml2.contains(r#"<w:alias w:val="Author"/>"#)
            && xml2.contains(r#"<w:tag w:val="city"/>"#),
        "sdtPr metadata lost: {xml2}"
    );
    let l1 = xml2.find("First wrapped line").unwrap();
    let l2 = xml2.find("Second wrapped line").unwrap();
    let close = xml2.rfind("</w:sdt>").unwrap();
    assert!(l1 < l2 && l2 < close, "multi-paragraph wrap must enclose both: {xml2}");

    // 3. Re-parse: identical wraps, and the inline markers survive.
    let reparsed = wo_ooxml::OoxmlParser::new().parse(&reser).unwrap();
    let rbody = reparsed.docx_body.as_ref().unwrap();
    assert_eq!(
        rbody.sdt_wraps, body.sdt_wraps,
        "block sdt wraps must survive the round trip"
    );
    let rinline = match &rbody.blocks[1] {
        wo_ooxml::model::DocxBlock::Paragraph(p) => p,
        _ => panic!("re-parsed block 1 must be a paragraph"),
    };
    assert_eq!(seq, {
        let mut v = Vec::new();
        v.extend(rinline.runs.iter().map(|r| match &r.sdt {
            Some(wo_ooxml::model::SdtMarker::Start { pr }) => {
                format!("S({})", pr.contains(r#"w:tag w:val="city""#))
            }
            Some(wo_ooxml::model::SdtMarker::End) => "E".to_string(),
            None => format!("T:{}", r.text),
        }));
        v
    }, "inline sdt markers must survive the round trip");

    // 4. html side: the wrappers are transparent — every text renders.
    let html = DocxToHtmlConverter.convert(&docx).unwrap();
    let html = String::from_utf8(html).unwrap();
    assert!(
        html.contains("Jane Doe") && html.contains("Springfield"),
        "sdt text lost: {html}"
    );
    assert!(
        html.contains("First wrapped line") && html.contains("Second wrapped line"),
        "wrapped paragraph text lost: {html}"
    );
}

#[test]
fn gap_pict_verbatim_roundtrip() {
    // P2-06: a legacy w:pict (VML) graphic in a run has no typed-model
    // equivalent — the parser must capture the subtree verbatim and the
    // serializer re-emit it byte-identical, with the run's neighbors
    // (text, rPr) intact.
    let pict = r##"<w:pict><v:shape id="_x0000_s1026" type="#_x0000_t75" style="width:106pt;height:79pt" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word"><w10:wrap type="none"/><v:imagedata r:id="rIdPic1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></v:shape></w:pict>"##;
    let document_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr>{pict}</w:r><w:r><w:t> after the picture</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second sentinel paragraph.</w:t></w:r></w:p>
  </w:body>
</w:document>"#
    );
    let docx = docx_from_document_xml(&document_xml);

    // 1. Parse: the pict subtree lands verbatim on the run; rPr and the
    //    following text run survive.
    let parsed = wo_ooxml::OoxmlParser::new().parse(&docx).unwrap();
    let body = parsed.docx_body.as_ref().unwrap();
    let para = match &body.blocks[0] {
        wo_ooxml::model::DocxBlock::Paragraph(p) => p,
        _ => panic!("block 0 must be a paragraph"),
    };
    let captured = para
        .runs[0]
        .pict
        .as_deref()
        .expect("w:pict must be captured verbatim");
    assert_eq!(captured, pict, "captured pict must be the exact source subtree");
    assert!(para.runs[0].bold, "rPr before the pict must still parse");
    assert_eq!(
        para.runs[1].text, " after the picture",
        "text after the pict run must survive"
    );

    // 2. docx -> docx: re-emitted byte-identical.
    let reser = wo_ooxml::OoxmlSerializer::new().serialize(&parsed).unwrap();
    let xml2 = docx_xml(&reser);
    assert!(xml2.contains(pict), "pict must re-emit byte-identical: {xml2}");
    assert!(xml2.contains("after the picture"), "neighboring text lost: {xml2}");

    // 3. Re-parse: identical capture.
    let reparsed = wo_ooxml::OoxmlParser::new().parse(&reser).unwrap();
    let rbody = reparsed.docx_body.as_ref().unwrap();
    let rpara = match &rbody.blocks[0] {
        wo_ooxml::model::DocxBlock::Paragraph(p) => p,
        _ => panic!("re-parsed block 0 must be a paragraph"),
    };
    assert_eq!(
        rpara.runs[0].pict.as_deref(),
        Some(pict),
        "pict must survive the round trip"
    );
}

#[test]
fn gap_unmanaged_parts_roundtrip() {
    // P2-06 unmanaged-parts bag: parts the model does not parse
    // (word/settings.xml, word/endnotes.xml, customXml/*) must be captured
    // byte-for-byte at parse time, re-zipped byte-identically after a
    // docx -> docx round trip, with their content types re-declared —
    // while managed parts never enter the bag.
    let settings = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="110"/><w:defaultTabStop w:val="720"/></w:settings>"#;
    let endnotes = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:id="0"><w:p><w:r><w:endnoteRef/></w:r></w:p></w:endnote></w:endnotes>"#;
    let custom = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><data><custom>keep-me</custom></data>"#;
    let document_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Body survives too.</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
    let docx = docx_from_parts(&[
        ("word/document.xml", document_xml),
        ("word/settings.xml", settings),
        ("word/endnotes.xml", endnotes),
        ("customXml/item1.xml", custom),
    ]);

    // 1. Parse: every foreign part lands in the unmanaged-parts bag with
    //    identical bytes; managed parts stay out.
    let parsed = wo_ooxml::OoxmlParser::new().parse(&docx).unwrap();
    let body = parsed.docx_body.as_ref().unwrap();
    let names: Vec<&str> = body
        .unmanaged_parts
        .iter()
        .map(|p| p.name.as_str())
        .collect();
    assert!(
        names.contains(&"word/settings.xml"),
        "settings.xml must be bagged: {names:?}"
    );
    assert!(names.contains(&"word/endnotes.xml"), "endnotes must be bagged: {names:?}");
    assert!(
        names.contains(&"customXml/item1.xml"),
        "customXml must be bagged: {names:?}"
    );
    assert!(
        !names.contains(&"word/document.xml"),
        "managed parts must not enter the bag: {names:?}"
    );
    let settings_part = body
        .unmanaged_parts
        .iter()
        .find(|p| p.name == "word/settings.xml")
        .unwrap();
    assert_eq!(
        &settings_part.bytes[..],
        settings.as_bytes(),
        "bagged bytes must be identical"
    );

    // 2. docx -> docx: parts re-zip byte-identical and their content
    //    types are re-declared.
    let reser = wo_ooxml::OoxmlSerializer::new().serialize(&parsed).unwrap();
    assert_eq!(
        zip_entry(&reser, "word/settings.xml"),
        settings,
        "settings.xml must re-zip byte-identical"
    );
    assert_eq!(zip_entry(&reser, "word/endnotes.xml"), endnotes);
    assert_eq!(zip_entry(&reser, "customXml/item1.xml"), custom);
    let ct = zip_entry(&reser, "[Content_Types].xml");
    assert!(
        ct.contains(r#"<Override PartName="/word/settings.xml""#),
        "settings content type must be re-declared: {ct}"
    );
    assert!(
        ct.contains(r#"<Override PartName="/customXml/item1.xml""#),
        "customXml content type must be re-declared: {ct}"
    );

    // 3. Re-parse: bag and body text intact.
    let reparsed = wo_ooxml::OoxmlParser::new().parse(&reser).unwrap();
    let rbody = reparsed.docx_body.as_ref().unwrap();
    assert_eq!(
        rbody.unmanaged_parts, body.unmanaged_parts,
        "unmanaged-parts bag must survive the round trip"
    );
    let html = DocxToHtmlConverter.convert(&docx).unwrap();
    let html = String::from_utf8(html).unwrap();
    assert!(html.contains("Body survives too."), "body text lost: {html}");
}

/// Build a minimal valid xlsx zip around hand-written parts (ORM-06: lets
/// a test drive worksheet print/hyperlink parts end to end).
fn xlsx_from_parts(parts: &[(&str, &str)]) -> Vec<u8> {
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"#)
            .unwrap();
        zip.start_file("_rels/.rels", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#)
            .unwrap();
        zip.start_file("xl/workbook.xml", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>
</workbook>"#)
            .unwrap();
        zip.start_file("xl/_rels/workbook.xml.rels", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"#)
            .unwrap();
        for (name, xml) in parts {
            zip.start_file(*name, SimpleFileOptions::default()).unwrap();
            zip.write_all(xml.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }
    buf
}

#[test]
fn gap_xlsx_print_hyperlink_roundtrip() {
    // ORM-06: the worksheet print parts (pageMargins, pageSetup,
    // headerFooter, rowBreaks/colBreaks) and cell hyperlinks (external via
    // the worksheet rels part, internal via location) were all dropped on
    // import. They must now (a) parse into the typed model with external
    // targets resolved, (b) survive an xlsx -> xlsx re-serialization with
    // their rels part regenerated, and (c) re-parse to the identical model.
    let sheet_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>
    <row r="1"><c r="A1" t="str"><v>Report</v></c></row>
    <row r="2"><c r="B2" t="str"><v>Details</v></c><c r="C2" t="str"><v>More</v></c></row>
  </sheetData>
  <hyperlinks>
    <hyperlink ref="A1" r:id="rId1" tooltip="Open the report"/>
    <hyperlink ref="B2:C2" location="Sheet2!A1" display="Go to details"/>
    <hyperlink ref="D4" r:id="rId2"/>
  </hyperlinks>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  <pageSetup paperSize="9" orientation="landscape" scale="85" firstPageNumber="2" useFirstPageNumber="1" horizontalDpi="300" verticalDpi="300"/>
  <headerFooter differentOddEven="1">
    <oddHeader>&amp;L&amp;"Arial,Bold"&amp;BQuarterly Report&amp;RPage &amp;P</oddHeader>
    <oddFooter>&amp;LSheet: &amp;A&amp;R&amp;D</oddFooter>
    <evenHeader>&amp;CEven page</evenHeader>
  </headerFooter>
  <rowBreaks count="2" manualBreakCount="2"><brk id="8" max="16383" man="1"/><brk id="20" max="16383" man="1"/></rowBreaks>
  <colBreaks count="1" manualBreakCount="1"><brk id="2" max="1048575" man="1"/></colBreaks>
</worksheet>"#;
    let sheet_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/report" TargetMode="External"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="mailto:team@example.com" TargetMode="External"/>
</Relationships>"#;
    let xlsx = xlsx_from_parts(&[
        ("xl/worksheets/sheet1.xml", sheet_xml),
        ("xl/worksheets/_rels/sheet1.xml.rels", sheet_rels),
    ]);

    // 1. Typed parse: print model + hyperlinks with resolved targets.
    let parsed = wo_ooxml::OoxmlParser::new().parse(&xlsx).unwrap();
    let sheet = &parsed.xlsx_workbook.as_ref().unwrap().sheets[0];
    let print = &sheet.properties.print;
    let pm = print
        .page_margins
        .as_ref()
        .expect("pageMargins must parse");
    assert_eq!(pm.left, 0.7);
    assert_eq!(pm.right, 0.7);
    assert_eq!(pm.top, 0.75);
    assert_eq!(pm.bottom, 0.75);
    assert_eq!(pm.header, 0.3);
    assert_eq!(pm.footer, 0.3);
    let ps = print.page_setup.as_ref().expect("pageSetup must parse");
    assert_eq!(ps.paper_size, Some(9));
    assert_eq!(ps.orientation.as_deref(), Some("landscape"));
    assert_eq!(ps.scale, Some(85));
    assert_eq!(ps.first_page_number, Some(2));
    assert!(ps.use_first_page_number);
    assert_eq!(ps.horizontal_dpi, Some(300));
    assert_eq!(ps.vertical_dpi, Some(300));
    let hf = print
        .header_footer
        .as_ref()
        .expect("headerFooter must parse");
    assert!(hf.different_odd_even);
    assert_eq!(
        hf.odd_header.as_deref(),
        Some(r#"&L&"Arial,Bold"&BQuarterly Report&RPage &P"#),
        "header format code must keep its section/font markers"
    );
    assert_eq!(hf.odd_footer.as_deref(), Some("&LSheet: &A&R&D"));
    assert_eq!(hf.even_header.as_deref(), Some("&CEven page"));
    assert_eq!(hf.even_footer, None);
    assert_eq!(print.row_breaks.len(), 2, "rowBreaks must parse");
    assert_eq!(print.row_breaks[0].id, 8);
    assert_eq!(print.row_breaks[0].max, 16383);
    assert!(print.row_breaks[0].man, "break must keep its manual flag");
    assert_eq!(print.col_breaks.len(), 1, "colBreaks must parse");
    assert_eq!(print.col_breaks[0].id, 2);
    assert_eq!(print.col_breaks[0].max, 1048575);

    assert_eq!(sheet.properties.hyperlinks.len(), 3, "all links must parse");
    let links = &sheet.properties.hyperlinks;
    assert_eq!(links[0].ref_range, "A1");
    assert_eq!(links[0].r_id.as_deref(), Some("rId1"));
    assert_eq!(
        links[0].target.as_deref(),
        Some("https://example.com/report"),
        "external target must resolve through the worksheet rels part"
    );
    assert_eq!(links[0].tooltip.as_deref(), Some("Open the report"));
    assert_eq!(links[1].ref_range, "B2:C2");
    assert_eq!(links[1].location.as_deref(), Some("Sheet2!A1"));
    assert_eq!(links[1].display.as_deref(), Some("Go to details"));
    assert_eq!(links[1].target, None, "internal link has no relationship");
    assert_eq!(links[2].target.as_deref(), Some("mailto:team@example.com"));

    // 2. xlsx -> xlsx: the parts re-emit in schema order, the header
    //    format code re-escapes, and the rels part is regenerated.
    let reser = wo_ooxml::OoxmlSerializer::new()
        .serialize_xlsx(parsed.xlsx_workbook.as_ref().unwrap())
        .unwrap();
    let sheet2 = zip_entry(&reser, "xl/worksheets/sheet1.xml");
    assert!(
        sheet2.contains(r#"<hyperlinks count="3">"#),
        "hyperlinks element lost: {sheet2}"
    );
    assert!(
        sheet2.contains(r#"<hyperlink ref="A1" r:id="rId1" tooltip="Open the report"/>"#),
        "external link lost its rid/tooltip: {sheet2}"
    );
    assert!(
        sheet2
            .contains(r#"<hyperlink ref="B2:C2" location="Sheet2!A1" display="Go to details"/>"#),
        "internal link must carry location without an r:id: {sheet2}"
    );
    let p_margins = sheet2.find(r#"<pageMargins left="0.7""#).unwrap();
    let p_setup = sheet2.find(r#"orientation="landscape""#).unwrap();
    let p_hf = sheet2
        .find(r#"&amp;L&amp;&quot;Arial,Bold&quot;&amp;BQuarterly"#)
        .unwrap();
    let p_row = sheet2.find("<rowBreaks count=\"2\" manualBreakCount=\"2\">").unwrap();
    let p_col = sheet2.find("<colBreaks count=\"1\" manualBreakCount=\"1\">").unwrap();
    let p_end = sheet2.find(r#"<brk id="20" min="0" max="16383" man="1" />"#).unwrap();
    assert!(
        p_margins < p_setup && p_setup < p_hf && p_hf < p_row && p_row < p_end && p_end < p_col,
        "print parts must keep schema order after hyperlinks: {sheet2}"
    );
    assert!(
        sheet2.contains(r#"<brk id="8" min="0" max="16383" man="1" />"#),
        "row break must re-emit: {sheet2}"
    );
    let rels2 = zip_entry(&reser, "xl/worksheets/_rels/sheet1.xml.rels");
    assert!(
        rels2.contains(r#"Id="rId1""#) && rels2.contains(r#"Target="https://example.com/report""#),
        "external hyperlink relationship lost: {rels2}"
    );
    assert!(
        rels2.contains(r#"Target="mailto:team@example.com""#),
        "second external relationship lost: {rels2}"
    );
    assert!(
        rels2.matches("TargetMode=\"External\"").count() == 2,
        "external rels must carry TargetMode: {rels2}"
    );

    // 3. Re-parse: the model is identical.
    let reparsed = wo_ooxml::OoxmlParser::new().parse(&reser).unwrap();
    let rsheet = &reparsed.xlsx_workbook.as_ref().unwrap().sheets[0];
    assert_eq!(
        rsheet.properties.print, sheet.properties.print,
        "print model must survive the round trip"
    );
    assert_eq!(
        rsheet.properties.hyperlinks, sheet.properties.hyperlinks,
        "hyperlink model must survive the round trip"
    );

    // 4. Serializer-side rid synthesis: a model that only carries targets
    //    (no r:id — e.g. built by wo-sheet) still yields a valid rels part
    //    with fresh rIds in model order.
    let mut wb = parsed.xlsx_workbook.clone().unwrap();
    let sheet_mut = &mut wb.sheets[0];
    sheet_mut.properties.hyperlinks[1].target = Some("mailto:details@example.com".to_string());
    let reser2 = wo_ooxml::OoxmlSerializer::new().serialize_xlsx(&wb).unwrap();
    let rels3 = zip_entry(&reser2, "xl/worksheets/_rels/sheet1.xml.rels");
    for (rid, target) in [
        ("rId1", "https://example.com/report"),
        ("rId2", "mailto:details@example.com"),
        ("rId3", "mailto:team@example.com"),
    ] {
        assert!(
            rels3.contains(&format!(r#"Id="{rid}""#))
                && rels3.contains(&format!(r#"Target="{target}""#)),
            "synthesized rel {rid} -> {target} missing: {rels3}"
        );
    }
}

#[test]
fn gap_xlsx_cf_ext_roundtrip() {
    // ORM-06: the conditional-formatting extensions — colorScale /
    // dataBar / iconSet rules plus the dxf (differential format) styles
    // they reference — were dropped on import, so dashboards lost the
    // exact visual the author chose. They must now (a) parse into the
    // typed model, (b) survive an xlsx -> xlsx re-serialization in schema
    // order, and (c) re-parse to the identical model. Also guards the
    // styles scoping: dxf fonts/fills/borders must not leak into the
    // shared styles tables (which would corrupt every style index).
    let sheet_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>
    <row r="1"><c r="A1" t="str"><v>Region</v></c><c r="B1" t="str"><v>Sales</v></c><c r="C1" t="str"><v>Share</v></c><c r="D1" t="str"><v>Rank</v></c></row>
    <row r="2"><c r="A2" t="str"><v>North</v></c><c r="B2"><v>91.4</v></c><c r="C2"><v>42.1</v></c><c r="D2"><v>3</v></c></row>
    <row r="3"><c r="A3" t="str"><v>South</v></c><c r="B3"><v>64.8</v></c><c r="C3"><v>18.4</v></c><c r="D3"><v>7</v></c></row>
  </sheetData>
  <mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells>
  <conditionalFormatting sqref="B2:B9">
    <cfRule type="colorScale" priority="1">
      <colorScale>
        <cfvo type="min"/>
        <cfvo type="percentile" val="50"/>
        <cfvo type="max"/>
        <color rgb="FFF8696B"/>
        <color theme="4" tint="0.4"/>
        <color rgb="FF63BE7B"/>
      </colorScale>
    </cfRule>
  </conditionalFormatting>
  <conditionalFormatting sqref="C2:C9">
    <cfRule type="dataBar" priority="2">
      <dataBar minLength="5" maxLength="95" showValue="0">
        <cfvo type="num" val="0"/>
        <cfvo type="num" val="100"/>
        <color rgb="FF638EC6"/>
      </dataBar>
    </cfRule>
  </conditionalFormatting>
  <conditionalFormatting sqref="D2:D9">
    <cfRule type="iconSet" priority="3">
      <iconSet iconSet="3Arrows" showValue="0" reverse="1">
        <cfvo type="percent" val="0"/>
        <cfvo type="percent" val="33" gte="0"/>
        <cfvo type="percent" val="67"/>
      </iconSet>
    </cfRule>
  </conditionalFormatting>
  <conditionalFormatting sqref="B2:B9">
    <cfRule type="cellIs" dxfId="0" priority="4" stopIfTrue="1" operator="greaterThan">
      <formula>90</formula>
    </cfRule>
    <cfRule type="top10" dxfId="1" priority="5" rank="3" percent="1" bottom="1"/>
  </conditionalFormatting>
</worksheet>"#;
    let styles_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="0.0&quot;%&quot;"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FF9C0006"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor rgb="FFFFC7CE"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyFont="1"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <dxfs count="2">
    <dxf>
      <font><b/><color rgb="FF9C0006"/></font>
      <fill><patternFill patternType="solid"><bgColor rgb="FFFFC7CE"/></patternFill></fill>
    </dxf>
    <dxf>
      <numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/>
      <alignment horizontal="center" textRotation="45" wrapText="1"/>
      <border><left style="thin"><color rgb="FF00B050"/></left><right/><top/><bottom/><diagonal/></border>
      <protection locked="0" hidden="1"/>
    </dxf>
  </dxfs>
</styleSheet>"#;
    let xlsx = xlsx_from_parts(&[
        ("xl/worksheets/sheet1.xml", sheet_xml),
        ("xl/styles.xml", styles_xml),
    ]);

    // 1. Typed parse: the four CF blocks plus the dxf table.
    let parsed = wo_ooxml::OoxmlParser::new().parse(&xlsx).unwrap();
    let sheet = &parsed.xlsx_workbook.as_ref().unwrap().sheets[0];
    let cfs = &sheet.properties.conditional_formatting;
    assert_eq!(cfs.len(), 4, "all conditionalFormatting blocks must parse");

    // colorScale: three thresholds and three colors, theme colors kept.
    assert_eq!(cfs[0].sqref, "B2:B9");
    let cs_rule = &cfs[0].rules[0];
    assert_eq!(cs_rule.rule_type, "colorScale");
    assert_eq!(cs_rule.priority, Some(1));
    let wo_ooxml::model::XlsxConditionalFormatKind::ColorScale(scale) = &cs_rule.kind else {
        panic!("colorScale rule must carry a colorScale payload");
    };
    assert_eq!(scale.cfvos.len(), 3);
    assert_eq!(scale.cfvos[0].cfvo_type, "min");
    assert_eq!(scale.cfvos[0].val, None);
    assert_eq!(scale.cfvos[1].cfvo_type, "percentile");
    assert_eq!(scale.cfvos[1].val.as_deref(), Some("50"));
    assert!(scale.cfvos[2].gte, "cfvo defaults to greater-than-or-equal");
    assert_eq!(scale.colors.len(), 3);
    assert_eq!(scale.colors[0].rgb.as_deref(), Some("FFF8696B"));
    assert_eq!(scale.colors[1].theme, Some(4));
    assert!(
        (scale.colors[1].tint.unwrap() - 0.4).abs() < 1e-9,
        "theme tint must parse"
    );
    assert_eq!(scale.colors[2].rgb.as_deref(), Some("FF63BE7B"));

    // dataBar: lengths, hidden value, thresholds and bar color.
    let wo_ooxml::model::XlsxConditionalFormatKind::DataBar(bar) = &cfs[1].rules[0].kind else {
        panic!("dataBar rule must carry a dataBar payload");
    };
    assert_eq!(bar.min_length, Some(5));
    assert_eq!(bar.max_length, Some(95));
    assert!(!bar.show_value, "showValue=\"0\" must hide the value");
    assert_eq!(bar.cfvos.len(), 2);
    assert_eq!(bar.cfvos[1].cfvo_type, "num");
    assert_eq!(bar.cfvos[1].val.as_deref(), Some("100"));
    assert_eq!(bar.color.as_ref().unwrap().rgb.as_deref(), Some("FF638EC6"));

    // iconSet: built-in id, reversed order, and an explicit gte="0".
    let wo_ooxml::model::XlsxConditionalFormatKind::IconSet(set) = &cfs[2].rules[0].kind else {
        panic!("iconSet rule must carry an iconSet payload");
    };
    assert_eq!(set.icon_set.as_deref(), Some("3Arrows"));
    assert!(!set.show_value);
    assert!(!set.percent);
    assert!(set.reverse);
    assert_eq!(set.cfvos.len(), 3);
    assert!(!set.cfvos[1].gte, "gte=\"0\" must be kept");

    // Attribute-only kinds survive on the same block.
    assert_eq!(cfs[3].sqref, "B2:B9");
    assert_eq!(cfs[3].rules.len(), 2);
    let cell_is = &cfs[3].rules[0];
    assert_eq!(cell_is.rule_type, "cellIs");
    assert_eq!(cell_is.dxf_id, Some(0));
    assert_eq!(cell_is.priority, Some(4));
    assert!(cell_is.stop_if_true);
    assert_eq!(cell_is.operator.as_deref(), Some("greaterThan"));
    assert_eq!(cell_is.formulas, vec!["90".to_string()]);
    assert_eq!(cell_is.kind, wo_ooxml::model::XlsxConditionalFormatKind::Plain);
    let top10 = &cfs[3].rules[1];
    assert_eq!(top10.rule_type, "top10");
    assert_eq!(top10.dxf_id, Some(1));
    assert_eq!(top10.rank, Some(3));
    assert_eq!(top10.percent, Some(true));
    assert_eq!(top10.bottom, Some(true));
    assert!(top10.formulas.is_empty());

    // dxf styles parse, and do NOT leak into the shared style tables.
    let styles = &parsed.xlsx_workbook.as_ref().unwrap().styles;
    assert_eq!(styles.dxfs.len(), 2, "both dxf records must parse");
    let dxf0 = &styles.dxfs[0];
    let font = dxf0.font.as_ref().expect("dxf font must parse");
    assert!(font.b);
    assert_eq!(font.color.as_deref(), Some("FF9C0006"));
    let fill = dxf0.fill.as_ref().expect("dxf fill must parse");
    assert_eq!(fill.pattern_type.as_deref(), Some("solid"));
    assert_eq!(fill.bg_color.as_deref(), Some("FFFFC7CE"));
    let dxf1 = &styles.dxfs[1];
    assert_eq!(
        dxf1.num_fmt.as_ref().unwrap().format_code,
        "0.0\"%\"",
        "escaped dxf format code must unescape to the raw code"
    );
    let align = dxf1.alignment.as_ref().unwrap();
    assert_eq!(align.horizontal.as_deref(), Some("center"));
    assert_eq!(align.text_rotation, Some(45));
    assert!(align.wrap_text);
    assert_eq!(
        dxf1.border.as_ref().unwrap().left.as_ref().unwrap().style.as_deref(),
        Some("thin")
    );
    assert_eq!(
        dxf1.border.as_ref().unwrap().left.as_ref().unwrap().color.as_deref(),
        Some("FF00B050")
    );
    let prot = dxf1.protection.as_ref().unwrap();
    assert!(!prot.locked);
    assert!(prot.hidden);
    assert_eq!(styles.fonts.len(), 2, "dxf fonts must not leak into <fonts>");
    assert_eq!(styles.fills.len(), 3, "dxf fills must not leak into <fills>");
    assert_eq!(styles.borders.len(), 1, "dxf borders must not leak into <borders>");
    assert_eq!(
        styles.num_fmts.len(),
        1,
        "dxf numFmts must not leak into <numFmts>"
    );

    // 2. xlsx -> xlsx: CF blocks re-emit in schema order, the dxf table is
    //    regenerated after cellXfs.
    let reser = wo_ooxml::OoxmlSerializer::new()
        .serialize_xlsx(parsed.xlsx_workbook.as_ref().unwrap())
        .unwrap();
    let sheet2 = zip_entry(&reser, "xl/worksheets/sheet1.xml");
    let p_merge_end = sheet2.find("</mergeCells>").unwrap();
    let p_cs = sheet2.find(r#"<conditionalFormatting sqref="B2:B9">"#).unwrap();
    let p_cs_elem = sheet2.find("<colorScale>").unwrap();
    let p_bar = sheet2.find(r#"<dataBar minLength="5" maxLength="95" showValue="0">"#).unwrap();
    let p_set = sheet2
        .find(r#"<iconSet iconSet="3Arrows" showValue="0" reverse="1">"#)
        .unwrap();
    let p_cellis = sheet2
        .find(r#"<cfRule type="cellIs" dxfId="0" priority="4" stopIfTrue="1" operator="greaterThan">"#)
        .unwrap();
    let p_formula = sheet2.find("<formula>90</formula>").unwrap();
    let p_top10 = sheet2
        .find(r#"<cfRule type="top10" dxfId="1" priority="5" rank="3" percent="1" bottom="1"/>"#)
        .unwrap();
    assert!(
        p_merge_end < p_cs
            && p_cs < p_cs_elem
            && p_cs_elem < p_bar
            && p_bar < p_set
            && p_set < p_cellis
            && p_cellis < p_formula
            && p_formula < p_top10,
        "conditional formatting must re-emit in document order: {sheet2}"
    );
    assert!(
        sheet2.contains(r#"<cfvo type="percentile" val="50"/>"#),
        "colorScale threshold lost: {sheet2}"
    );
    assert!(
        sheet2.contains(r#"<color theme="4" tint="0.4"/>"#),
        "theme color lost: {sheet2}"
    );
    assert!(
        sheet2.contains(r#"<cfvo type="percent" val="33" gte="0"/>"#),
        "iconSet gte=\"0\" lost: {sheet2}"
    );
    let styles2 = zip_entry(&reser, "xl/styles.xml");
    let p_cellxfs_end = styles2.find("</cellXfs>").unwrap();
    let p_dxfs = styles2.find(r#"<dxfs count="2">"#).unwrap();
    assert!(
        p_cellxfs_end < p_dxfs,
        "dxfs must re-emit after cellXfs in schema order: {styles2}"
    );
    // Inside the dxf table the records keep their child order
    // (font / numFmt / fill / alignment / border / protection).
    let dxf_table = &styles2[p_dxfs..];
    let p_dxf_font_b = dxf_table.find("<b/>").expect("dxf font bold flag lost");
    let p_dxf_font_color = dxf_table
        .find(r#"<color rgb="FF9C0006"/>"#)
        .expect("dxf font color lost");
    let p_dxf_fill = dxf_table
        .find(r#"<bgColor rgb="FFFFC7CE"/>"#)
        .expect("dxf fill color lost");
    let p_dxf_numfmt = dxf_table
        .find(r#"<numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/>"#)
        .expect("dxf numFmt lost");
    let p_dxf_align = dxf_table
        .find(r#"textRotation="45""#)
        .expect("dxf alignment lost");
    let p_dxf_border = dxf_table
        .find(r#"<color rgb="FF00B050"/>"#)
        .expect("dxf border color lost");
    let p_dxf_prot = dxf_table
        .find(r#"<protection locked="0" hidden="1"/>"#)
        .expect("dxf protection lost");
    assert!(
        p_dxf_font_b < p_dxf_font_color
            && p_dxf_font_color < p_dxf_fill
            && p_dxf_fill < p_dxf_numfmt
            && p_dxf_numfmt < p_dxf_align
            && p_dxf_align < p_dxf_border
            && p_dxf_border < p_dxf_prot,
        "dxf children must keep schema order: {styles2}"
    );
    assert!(
        styles2.contains(r#"<fonts count="2">"#)
            && styles2.contains(r#"<fills count="3">"#)
            && styles2.contains(r#"<borders count="1">"#),
        "shared style tables must keep their counts: {styles2}"
    );

    // 3. Re-parse: the models are identical.
    let reparsed = wo_ooxml::OoxmlParser::new().parse(&reser).unwrap();
    let rsheet = &reparsed.xlsx_workbook.as_ref().unwrap().sheets[0];
    assert_eq!(
        rsheet.properties.conditional_formatting, sheet.properties.conditional_formatting,
        "conditional-formatting model must survive the round trip"
    );
    assert_eq!(
        reparsed.xlsx_workbook.as_ref().unwrap().styles.dxfs,
        styles.dxfs,
        "dxf table must survive the round trip"
    );
}

// ---------------------------------------------------------------------------
// P2B-P01: PPTX group shapes — p:grpSp with GrpSpPr transform (off/ext +
// chOff/chExt), recursive SpTree groups, child bounding boxes (ORM-07 ranked
// gap #1: grouped shapes used to be dropped by the direct-children spTree
// scan).
// ---------------------------------------------------------------------------

/// Build a minimal valid pptx zip around a hand-written ppt/slides/slide1.xml.
fn pptx_from_slide_xml(slide_xml: &str) -> Vec<u8> {
    pptx_from_slide_xml_with_parts(slide_xml, &[])
}

/// Build a minimal valid pptx zip around a hand-written ppt/slides/slide1.xml
/// plus extra parts (e.g. ppt/tableStyles.xml).
fn pptx_from_slide_xml_with_parts(slide_xml: &str, parts: &[(&str, &str)]) -> Vec<u8> {
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let mut content_types = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>"#,
        );
        if parts
            .iter()
            .any(|(name, _)| *name == "ppt/tableStyles.xml")
        {
            content_types.push_str(
                "\n  <Override PartName=\"/ppt/tableStyles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml\"/>",
            );
        }
        content_types.push_str("\n</Types>");
        zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(content_types.as_bytes()).unwrap();
        zip.start_file("_rels/.rels", SimpleFileOptions::default()).unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#)
            .unwrap();
        zip.start_file("ppt/presentation.xml", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldSz cx="9144000" cy="6858000"/>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>"#)
            .unwrap();
        zip.start_file(
            "ppt/_rels/presentation.xml.rels",
            SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>"#)
            .unwrap();
        zip.start_file("ppt/slides/slide1.xml", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(slide_xml.as_bytes()).unwrap();
        for (name, xml) in parts {
            zip.start_file(*name, SimpleFileOptions::default()).unwrap();
            zip.write_all(xml.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }
    buf
}

/// Slide XML with a top-level `p:grpSp` holding a text shape plus a nested
/// `p:grpSp` holding a picture (recursive SpTree member), each group with an
/// explicit `GrpSpPr/a:xfrm` (off/ext + chOff/chExt child coordinate space).
const GROUP_SLIDE_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:grpSp>
        <p:nvGrpSpPr>
          <p:cNvPr id="10" name="Diagram Group"/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr>
          <a:xfrm>
            <a:off x="1000000" y="500000"/>
            <a:ext cx="4000000" cy="2000000"/>
            <a:chOff x="0" y="0"/>
            <a:chExt cx="2000000" cy="1000000"/>
          </a:xfrm>
        </p:grpSpPr>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="11" name="Label"/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="100000" y="200000"/>
              <a:ext cx="800000" cy="400000"/>
            </a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:bodyPr/>
            <a:lstStyle/>
            <a:p><a:r><a:t>Grouped label</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
        <p:grpSp>
          <p:nvGrpSpPr>
            <p:cNvPr id="20" name="Icons"/>
            <p:cNvGrpSpPr/>
            <p:nvPr/>
          </p:nvGrpSpPr>
          <p:grpSpPr>
            <a:xfrm>
              <a:off x="200000" y="300000"/>
              <a:ext cx="600000" cy="500000"/>
              <a:chOff x="0" y="0"/>
              <a:chExt cx="600000" cy="500000"/>
            </a:xfrm>
          </p:grpSpPr>
          <p:pic>
            <p:nvPicPr>
              <p:cNvPr id="21" name="Icon"/>
              <p:cNvPicPr/>
              <p:nvPr/>
            </p:nvPicPr>
            <p:blipFill>
              <a:blip r:embed="rId9"/>
              <a:stretch>
                <a:fillRect/>
              </a:stretch>
            </p:blipFill>
            <p:spPr>
              <a:xfrm>
                <a:off x="50000" y="60000"/>
                <a:ext cx="100000" cy="80000"/>
              </a:xfrm>
              <a:prstGeom prst="rect"/>
            </p:spPr>
          </p:pic>
        </p:grpSp>
      </p:grpSp>
    </p:spTree>
  </p:cSld>
</p:sld>"#;

#[test]
fn gap_pptx_group_roundtrip() {
    use wo_ooxml::model::{GroupChild, GroupShape, SlideShape};
    let data = pptx_from_slide_xml(GROUP_SLIDE_XML);
    let parser = wo_ooxml::OoxmlParser::new();

    // 1. Typed recursive group tree via parse_pptx_groups.
    let per_slide = parser.parse_pptx_groups(&data).unwrap();
    assert_eq!(per_slide.len(), 1, "one slide entry");
    let groups: &Vec<GroupShape> = &per_slide[0];
    assert_eq!(groups.len(), 1, "one top-level group on the slide");
    let g = &groups[0];
    assert_eq!(g.id, "10");
    assert_eq!(g.name, "Diagram Group");
    assert_eq!(
        (g.transform.bounds.x, g.transform.bounds.y, g.transform.bounds.cx, g.transform.bounds.cy),
        (1000000, 500000, 4000000, 2000000),
        "GrpSpPr outer xfrm"
    );
    assert_eq!(g.transform.child_offset, Some((0, 0)), "chOff");
    assert_eq!(g.transform.child_extent, Some((2000000, 1000000)), "chExt");
    assert_eq!(g.children.len(), 2, "text shape + nested group");

    let GroupChild::Shape(SlideShape::TextBox(tb)) = &g.children[0] else {
        panic!("first group child must be a text shape");
    };
    assert_eq!(
        (tb.bounds.x, tb.bounds.y, tb.bounds.cx, tb.bounds.cy),
        (100000, 200000, 800000, 400000),
        "child shapes keep their child-space bounds"
    );
    assert_eq!(
        tb.text_body.paragraphs[0].runs[0].text, "Grouped label",
        "grouped text body survives the group"
    );

    let GroupChild::Group(nested) = &g.children[1] else {
        panic!("second group child must be a nested p:grpSp");
    };
    assert_eq!(nested.id, "20");
    assert_eq!(nested.name, "Icons");
    assert_eq!(
        (nested.transform.bounds.x, nested.transform.bounds.y, nested.transform.bounds.cx, nested.transform.bounds.cy),
        (200000, 300000, 600000, 500000)
    );
    assert_eq!(nested.children.len(), 1);
    let GroupChild::Shape(SlideShape::Picture(pic)) = &nested.children[0] else {
        panic!("nested group child must be a picture");
    };
    assert_eq!(pic.name, "Icon");
    assert_eq!((pic.bounds.x, pic.bounds.y, pic.bounds.cx, pic.bounds.cy), (50000, 60000, 100000, 80000));

    // 2. Child bounding boxes (union in the group's child coordinate space).
    let cb = g.child_bounds.expect("outer group child bounds");
    assert_eq!(
        (cb.x, cb.y, cb.cx, cb.cy),
        (100000, 200000, 800000, 600000),
        "union of sp bounds + nested group bounds"
    );
    let ncb = nested.child_bounds.expect("nested group child bounds");
    assert_eq!((ncb.x, ncb.y, ncb.cx, ncb.cy), (50000, 60000, 100000, 80000));

    // 3. Flat slide model: grouped shapes are flattened with bounds mapped
    // through the nested GrpSpPr transforms instead of being dropped.
    let cursor = std::io::Cursor::new(data.as_slice());
    let mut archive = zip::ZipArchive::new(cursor).unwrap();
    let pres = parser.parse_pptx(&mut archive).unwrap().unwrap();
    let shapes = &pres.slides[0].shapes;
    assert_eq!(shapes.len(), 2, "group children flatten into slide shapes");
    assert_eq!(
        (shapes[0].bounds().x, shapes[0].bounds().y, shapes[0].bounds().cx, shapes[0].bounds().cy),
        (1200000, 900000, 1600000, 800000),
        "text shape mapped through the 2x outer group scale"
    );
    assert_eq!(
        (shapes[1].bounds().x, shapes[1].bounds().y, shapes[1].bounds().cx, shapes[1].bounds().cy),
        (1500000, 1220000, 200000, 160000),
        "picture mapped through nested group + outer group transforms"
    );

    // 4. Serialize the slide back with the group tree and re-parse: the typed
    // group model round-trips identically.
    let slide_xml =
        wo_ooxml::OoxmlSerializer::new().build_slide_xml_with_groups(&pres.slides[0], groups);
    assert!(
        slide_xml.contains("<p:grpSp>") && slide_xml.contains("<p:grpSpPr>"),
        "serializer must emit p:grpSp + p:grpSpPr: {}",
        &slide_xml[..slide_xml.len().min(2000)]
    );
    let out = pptx_from_slide_xml(&slide_xml);
    let groups2 = parser.parse_pptx_groups(&out).unwrap();
    assert_eq!(groups2.len(), 1);
    assert_eq!(groups2[0].len(), 1, "one top-level group after re-parse");
    let g2 = &groups2[0][0];
    assert_eq!(g2.id, "10");
    assert_eq!(g2.name, "Diagram Group");
    assert_eq!(
        (g2.transform.bounds.x, g2.transform.bounds.y, g2.transform.bounds.cx, g2.transform.bounds.cy),
        (1000000, 500000, 4000000, 2000000),
        "GrpSpPr xfrm survives the round trip"
    );
    assert_eq!(g2.transform.child_offset, Some((0, 0)), "chOff survives");
    assert_eq!(g2.transform.child_extent, Some((2000000, 1000000)), "chExt survives");
    assert_eq!(g2.children.len(), 2, "children survive the round trip");
    let GroupChild::Shape(SlideShape::TextBox(tb2)) = &g2.children[0] else {
        panic!("round-tripped first child must be a text shape");
    };
    assert_eq!(
        (tb2.bounds.x, tb2.bounds.y, tb2.bounds.cx, tb2.bounds.cy),
        (100000, 200000, 800000, 400000)
    );
    assert_eq!(tb2.text_body.paragraphs[0].runs[0].text.trim(), "Grouped label");
    let GroupChild::Group(nested2) = &g2.children[1] else {
        panic!("round-tripped second child must be a nested p:grpSp");
    };
    assert_eq!(nested2.id, "20");
    assert_eq!(
        (nested2.transform.bounds.x, nested2.transform.bounds.y, nested2.transform.bounds.cx, nested2.transform.bounds.cy),
        (200000, 300000, 600000, 500000)
    );
    let GroupChild::Shape(SlideShape::Picture(pic2)) = &nested2.children[0] else {
        panic!("round-tripped nested child must be a picture");
    };
    assert_eq!(pic2.name, "Icon");
    assert_eq!((pic2.bounds.x, pic2.bounds.y, pic2.bounds.cx, pic2.bounds.cy), (50000, 60000, 100000, 80000));
    let cb2 = g2.child_bounds.expect("round-tripped child bounds");
    assert_eq!(
        (cb2.x, cb2.y, cb2.cx, cb2.cy),
        (100000, 200000, 800000, 600000),
        "child bounding box recomputes identically"
    );
}

// ---------------------------------------------------------------------------
// P2B-P03: PPTX slide text bodies — `a:bodyPr` layout (anchor/insets/autofit)
// + `a:buChar`/`a:buAutoNum`/`a:buNone` bullets, and the `ppt/tableStyles.xml`
// catalog reader (ORM-07 ranked gaps #4/#5/#10: bullets used to collapse to
// plain paragraphs and tables lost every rule).
// ---------------------------------------------------------------------------

/// Slide XML with a text box carrying a full `a:bodyPr` (rtlCol, anchorCtr,
/// anchor, all four insets, numCol/spcCol, wrap, normAutofit with applied
/// scale) and a bullet mix — buChar with buClr/buSzPct/buFont helpers,
/// buAutoNum with startAt and a theme color, buNone — plus a content
/// placeholder whose bodyPr carries spAutoFit and an alphaLc numbering bullet.
const TEXTBODY_SLIDE_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="11" name="Bullets"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="100000" y="200000"/>
            <a:ext cx="3000000" cy="1500000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr rtlCol="1" anchorCtr="1" anchor="ctr" lIns="91440" tIns="45720" rIns="91440" bIns="45720" numCol="2" spcCol="12700" wrap="square">
            <a:normAutofit fontScale="87500" lnSpcReduction="5000"/>
          </a:bodyPr>
          <a:lstStyle/>
          <a:p>
            <a:pPr>
              <a:buClr><a:srgbClr val="5B9BD5"/></a:buClr>
              <a:buSzPct val="100000"/>
              <a:buFont typeface="Arial" pitchFamily="34" charset="0"/>
              <a:buChar char="&#8226;"/>
            </a:pPr>
            <a:r><a:rPr lang="en-US" sz="1800" b="1"/><a:t>Char bullet</a:t></a:r>
          </a:p>
          <a:p>
            <a:pPr>
              <a:buClr><a:schemeClr val="accent1"/></a:buClr>
              <a:buFont typeface="Calibri"/>
              <a:buAutoNum type="arabicPeriod" startAt="2"/>
            </a:pPr>
            <a:r><a:t>Auto number</a:t></a:r>
          </a:p>
          <a:p>
            <a:pPr><a:buNone/></a:pPr>
            <a:r><a:t>No bullet</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="12" name="Subtitle"/>
          <p:nvPr>
            <p:ph type="subTitle" idx="1"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="500000" y="2500000"/>
            <a:ext cx="4000000" cy="800000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr anchor="b"><a:spAutoFit/></a:bodyPr>
          <a:lstStyle/>
          <a:p>
            <a:pPr><a:buAutoNum type="alphaLcParenR"/></a:pPr>
            <a:r><a:t>Alpha list</a:t></a:r>
          </a:p>
          <a:p><a:r><a:t>Second line</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>"#;

/// `ppt/tableStyles.xml` in the shape corporate decks ship: a default style
/// id, one `a:tblStyle` with a tblBg fill, a wholeTbl scope carrying tcBdr
/// borders (scheme + literal colors) plus fillRef/fontRef, banding, and a
/// firstRow accent override.
const TABLE_STYLES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}">
  <a:tblStyle styleId="{93294377-8074-4D90-B10A-F10A93C39B14}" styleName="Medium Style 2 - Accent 1">
    <a:tblBg><a:fillClr><a:srgbClr val="1F3864"/></a:fillClr></a:tblBg>
    <a:wholeTbl>
      <a:tcBdr>
        <a:lnL w="12700" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
          <a:prstDash val="solid"/>
        </a:lnL>
        <a:lnT w="12700" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:srgbClr val="8EAADB"/></a:solidFill>
          <a:prstDash val="sysDot"/>
        </a:lnT>
      </a:tcBdr>
      <a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>
      <a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>
    </a:wholeTbl>
    <a:band1H><a:fillRef idx="3"><a:srgbClr val="D9E2F3"/></a:fillRef></a:band1H>
    <a:band2H/>
    <a:firstRow><a:fillRef idx="2"><a:schemeClr val="accent1"/></a:fillRef></a:firstRow>
    <a:lastRow/>
    <a:firstCol/>
    <a:lastCol/>
  </a:tblStyle>
</a:tblStyleLst>"#;

#[test]
fn gap_pptx_textbody_roundtrip() {
    use wo_ooxml::model::{PptxTableStyles, SlideShape, SlideTextFit, TextBullet};
    let data = pptx_from_slide_xml_with_parts(
        TEXTBODY_SLIDE_XML,
        &[("ppt/tableStyles.xml", TABLE_STYLES_XML)],
    );
    let parser = wo_ooxml::OoxmlParser::new();

    // 1. Typed rich text bodies: bodyPr layout + per-paragraph bullets.
    let per_slide = parser.parse_pptx_text_bodies(&data).unwrap();
    assert_eq!(per_slide.len(), 1, "one slide entry");
    let bodies: &Vec<wo_ooxml::model::SlideTextBody> = &per_slide[0];
    assert_eq!(bodies.len(), 2, "text box + placeholder text bodies");
    let tb = &bodies[0];
    assert_eq!(tb.shape_id, "11");
    let bp = tb.body_pr.as_ref().expect("bodyPr must parse");
    assert_eq!(bp.anchor.as_deref(), Some("ctr"));
    assert_eq!(bp.anchor_centered, Some(true));
    assert_eq!(bp.rtl_columns, Some(true));
    assert_eq!(bp.wrap.as_deref(), Some("square"));
    assert_eq!(bp.vert, None, "no vert attribute");
    assert_eq!(bp.left_inset, Some(91440));
    assert_eq!(bp.top_inset, Some(45720));
    assert_eq!(bp.right_inset, Some(91440));
    assert_eq!(bp.bottom_inset, Some(45720));
    assert_eq!(bp.num_columns, Some(2));
    assert_eq!(bp.column_spacing, Some(12700));
    assert_eq!(
        bp.autofit,
        Some(SlideTextFit::NormAutofit {
            font_scale: Some(87500),
            line_space_reduction: Some(5000),
        }),
        "normAutofit with applied font scale"
    );
    assert_eq!(tb.paragraphs.len(), 3);
    assert_eq!(
        tb.paragraphs[0].bullet,
        Some(TextBullet::Char {
            character: "\u{2022}".to_string(),
            font: Some("Arial".to_string()),
            color: Some("5B9BD5".to_string()),
            scheme_color: None,
            size_pct: Some(100000),
        }),
        "buChar with its buClr/buSzPct/buFont helpers"
    );
    assert_eq!(
        tb.paragraphs[1].bullet,
        Some(TextBullet::AutoNum {
            auto_num_type: "arabicPeriod".to_string(),
            start_at: Some(2),
            font: Some("Calibri".to_string()),
            color: None,
            scheme_color: Some("accent1".to_string()),
            size_pct: None,
        }),
        "buAutoNum with startAt and theme color"
    );
    assert_eq!(
        tb.paragraphs[2].bullet,
        Some(TextBullet::None),
        "buNone must survive as an explicit bullet suppression"
    );
    assert_eq!(tb.paragraphs[0].paragraph.runs[0].text, "Char bullet");
    assert!(tb.paragraphs[0].paragraph.runs[0].bold, "run props kept");

    let ph = &bodies[1];
    assert_eq!(ph.shape_id, "12");
    let pbp = ph.body_pr.as_ref().expect("placeholder bodyPr");
    assert_eq!(pbp.anchor.as_deref(), Some("b"));
    assert_eq!(pbp.autofit, Some(SlideTextFit::ShapeAutofit));
    assert_eq!(
        ph.paragraphs[0].bullet,
        Some(TextBullet::AutoNum {
            auto_num_type: "alphaLcParenR".to_string(),
            start_at: None,
            font: None,
            color: None,
            scheme_color: None,
            size_pct: None,
        })
    );
    assert_eq!(
        ph.paragraphs[1].bullet, None,
        "paragraph without pPr has no bullet"
    );

    // 2. The flat model still parses the same slide (text kept, bullets are
    //    an additive typed view on top).
    let cursor = std::io::Cursor::new(data.as_slice());
    let mut archive = zip::ZipArchive::new(cursor).unwrap();
    let pres = parser.parse_pptx(&mut archive).unwrap().unwrap();
    assert_eq!(pres.slides[0].shapes.len(), 2);
    let SlideShape::TextBox(flat_tb) = &pres.slides[0].shapes[0] else {
        panic!("first shape must stay a text box in the flat model");
    };
    assert_eq!(flat_tb.id, "11");
    assert_eq!(flat_tb.text_body.paragraphs.len(), 3);
    assert_eq!(flat_tb.text_body.paragraphs[0].runs[0].text, "Char bullet");

    // 3. Serialize the slide back with the rich bodies and re-parse: the
    //    typed model round-trips identically, including bodyPr attribute
    //    order-independent values and the bullet helpers.
    let slide_xml = wo_ooxml::OoxmlSerializer::new()
        .build_slide_xml_with_text_bodies(&pres.slides[0], bodies);
    assert!(
        slide_xml.contains("<a:buChar char=\"\u{2022}\"/>"),
        "buChar must re-emit: {}",
        &slide_xml[..slide_xml.len().min(4000)]
    );
    assert!(
        slide_xml.contains("<a:buAutoNum type=\"arabicPeriod\" startAt=\"2\"/>"),
        "buAutoNum with startAt must re-emit"
    );
    assert!(
        slide_xml.contains("<a:buNone/>"),
        "buNone must re-emit"
    );
    assert!(
        slide_xml.contains("anchor=\"ctr\"")
            && slide_xml.contains("lIns=\"91440\"")
            && slide_xml.contains("fontScale=\"87500\""),
        "bodyPr attributes and normAutofit scale must re-emit"
    );
    assert!(
        slide_xml.contains("<a:buClr><a:schemeClr val=\"accent1\"/></a:buClr>"),
        "theme-colored bullet must re-emit"
    );
    assert!(
        slide_xml.contains("<a:buFont typeface=\"Arial\"/>"),
        "bullet font must re-emit"
    );
    let out = pptx_from_slide_xml(&slide_xml);
    let bodies2 = parser.parse_pptx_text_bodies(&out).unwrap();
    assert_eq!(bodies2.len(), 1);
    assert_eq!(
        bodies2[0], *bodies,
        "rich slide text bodies must survive serialize -> re-parse"
    );

    // 4. tableStyles.xml: typed catalog read + re-serialize + re-parse.
    let styles = parser.parse_pptx_table_styles(&data).unwrap();
    assert_eq!(
        styles.default_style_id.as_deref(),
        Some("{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"),
        "tblStyleLst def attribute"
    );
    assert_eq!(styles.styles.len(), 1);
    let style = &styles.styles[0];
    assert_eq!(style.style_id, "{93294377-8074-4D90-B10A-F10A93C39B14}");
    assert_eq!(style.style_name.as_deref(), Some("Medium Style 2 - Accent 1"));
    assert_eq!(style.table_background.as_deref(), Some("1F3864"));

    let whole = style.whole_table.as_ref().expect("wholeTbl must parse");
    assert_eq!(whole.borders.len(), 2, "tcBdr lines parse in order");
    assert_eq!(whole.borders[0].edge, "lnL");
    assert_eq!(whole.borders[0].width, Some(12700));
    assert_eq!(whole.borders[0].dash.as_deref(), Some("solid"));
    assert_eq!(whole.borders[0].color, None);
    assert_eq!(
        whole.borders[0].scheme_color.as_deref(),
        Some("accent1"),
        "scheme-colored border line"
    );
    assert_eq!(whole.borders[1].edge, "lnT");
    assert_eq!(whole.borders[1].color.as_deref(), Some("8EAADB"));
    assert_eq!(whole.borders[1].scheme_color, None);
    assert_eq!(whole.borders[1].dash.as_deref(), Some("sysDot"));
    let fill_ref = whole.fill_ref.as_ref().expect("wholeTbl fillRef");
    assert_eq!(fill_ref.idx, "1");
    assert_eq!(fill_ref.scheme_color.as_deref(), Some("accent1"));
    let font_ref = whole.font_ref.as_ref().expect("wholeTbl fontRef");
    assert_eq!(font_ref.idx, "minor");
    assert_eq!(font_ref.scheme_color.as_deref(), Some("lt1"));

    assert!(style.first_row.is_some(), "firstRow override parses");
    assert_eq!(
        style.first_row.as_ref().unwrap().fill_ref.as_ref().unwrap().idx,
        "2"
    );
    assert_eq!(
        style.band1_h.as_ref().unwrap().fill_ref.as_ref().unwrap().color.as_deref(),
        Some("D9E2F3")
    );
    for (label, part) in [
        ("band2H", &style.band2_h),
        ("lastRow", &style.last_row),
        ("firstCol", &style.first_col),
        ("lastCol", &style.last_col),
    ] {
        assert!(part.is_some(), "empty {label} scope must still be present");
    }

    let styles_xml = wo_ooxml::OoxmlSerializer::new().serialize_pptx_table_styles(&styles);
    assert!(
        styles_xml.contains("<a:tblStyleLst xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" def=\"{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}\">"),
        "tblStyleLst root with def must re-emit"
    );
    assert!(
        styles_xml.contains("<a:lnL w=\"12700\">")
            && styles_xml.contains("<a:schemeClr val=\"accent1\"/>")
            && styles_xml.contains("<a:prstDash val=\"sysDot\"/>"),
        "tcBdr borders must re-emit with width/color/dash"
    );
    assert!(
        styles_xml.contains("<a:fontRef idx=\"minor\">"),
        "fontRef must re-emit its idx"
    );
    let out2 = pptx_from_slide_xml_with_parts(
        "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"/>",
        &[("ppt/tableStyles.xml", &styles_xml)],
    );
    let styles2 = parser.parse_pptx_table_styles(&out2).unwrap();
    assert_eq!(
        styles2, styles,
        "table style catalog must survive serialize -> re-parse"
    );

    // 5. A package without ppt/tableStyles.xml yields the empty default.
    let no_styles = pptx_from_slide_xml(
        "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"/>",
    );
    assert_eq!(
        parser.parse_pptx_table_styles(&no_styles).unwrap(),
        PptxTableStyles::default()
    );
}
