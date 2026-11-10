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
/// a test drive worksheet print/hyperlink parts end to end), with extra
/// `[Content_Types].xml` Overrides (e.g. for chart parts).
fn xlsx_from_parts_with_types(parts: &[(&str, &str)], overrides: &[(&str, &str)]) -> Vec<u8> {
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
            .unwrap();
        let mut ct = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#,
        );
        for (part, content_type) in overrides {
            ct.push_str(&format!(
                "\n  <Override PartName=\"{}\" ContentType=\"{}\"/>",
                part, content_type
            ));
        }
        ct.push_str("\n</Types>");
        zip.write_all(ct.as_bytes()).unwrap();
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

/// Same fixture without extra content-type overrides.
fn xlsx_from_parts(parts: &[(&str, &str)]) -> Vec<u8> {
    xlsx_from_parts_with_types(parts, &[])
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

/// A realistic Excel-style `c:chartSpace` (ORM-06): clustered columns with
/// two series, category/value axes, a linear trendline and y error bars.
const XLSX_CHART_XML: &str = r##"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Quarterly Revenue</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Revenue</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>Sheet1!$A$2:$A$5</c:f><c:strCache><c:ptCount val="4"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt><c:pt idx="3"><c:v>Q4</c:v></c:pt></c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>Sheet1!$B$2:$B$5</c:f><c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="4"/><c:pt idx="0"><c:v>120.5</c:v></c:pt><c:pt idx="1"><c:v>135.25</c:v></c:pt><c:pt idx="2"><c:v>98</c:v></c:pt><c:pt idx="3"><c:v>142</c:v></c:pt></c:numCache></c:numRef></c:val>
        </c:ser>
        <c:ser>
          <c:idx val="1"/>
          <c:order val="1"/>
          <c:tx><c:strRef><c:f>Sheet1!$C$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Costs</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="ED7D31"/></a:solidFill></c:spPr>
          <c:dLbls>
            <c:dLblPos val="outEnd"/>
            <c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>
          </c:dLbls>
          <c:trendline>
            <c:trendlineType val="linear"/>
            <c:dispRSqr val="1"/>
            <c:dispEq val="1"/>
          </c:trendline>
          <c:errBars>
            <c:errDir val="y"/>
            <c:errBarType val="both"/>
            <c:errValType val="percentage"/>
            <c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>5</c:v></c:pt></c:numLit></c:val>
          </c:errBars>
          <c:cat><c:strRef><c:f>Sheet1!$A$2:$A$5</c:f><c:strCache><c:ptCount val="4"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt><c:pt idx="3"><c:v>Q4</c:v></c:pt></c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>Sheet1!$C$2:$C$5</c:f><c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="4"/><c:pt idx="0"><c:v>80</c:v></c:pt><c:pt idx="1"><c:v>92.5</c:v></c:pt><c:pt idx="2"><c:v>77</c:v></c:pt><c:pt idx="3"><c:v>101</c:v></c:pt></c:numCache></c:numRef></c:val>
        </c:ser>
        <c:gapWidth val="150"/>
        <c:overlap val="-27"/>
        <c:axId val="111111111"/>
        <c:axId val="222222222"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="111111111"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Quarter</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="222222222"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
        <c:noMultiLvlLbl val="0"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="222222222"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="111111111"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>"##;

#[test]
fn gap_xlsx_chart_roundtrip() {
    // ORM-06 (PORT-PLAN Phase 2 item 5): an xlsx with a clustered column
    // chart + category/value axes previously kept its chart ONLY as an
    // opaque extra_parts byte bag — no model, so an edit silently produced
    // a book without the chart. The chart part must now parse into the
    // typed ChartSpace graph (series values, chart kind, axes), survive a
    // serializer round trip (regenerated chartN.xml + content type +
    // workbook relationship), and re-parse to the identical graph — so the
    // chart is owned, not bagged.
    let sheet_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="str"><v>Quarter</v></c><c r="B1" t="str"><v>Revenue</v></c><c r="C1" t="str"><v>Costs</v></c></row>
    <row r="2"><c r="A2" t="str"><v>Q1</v></c><c r="B2"><v>120.5</v></c><c r="C2"><v>80</v></c></row>
    <row r="3"><c r="A3" t="str"><v>Q2</v></c><c r="B3"><v>135.25</v></c><c r="C3"><v>92.5</v></c></row>
  </sheetData>
</worksheet>"#;
    let xlsx = xlsx_from_parts_with_types(
        &[
            ("xl/worksheets/sheet1.xml", sheet_xml),
            ("xl/charts/chart1.xml", XLSX_CHART_XML),
        ],
        &[(
            "/xl/charts/chart1.xml",
            "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
        )],
    );

    // 1. Parse -> typed ChartSpace graph (not a byte bag).
    let book = wo_ooxml::OoxmlParser::new().parse_xlsx_book(&xlsx).unwrap();
    assert_eq!(book.workbook.sheets.len(), 1);
    assert_eq!(book.charts.len(), 1, "the chart part must parse into a typed graph");
    let space = &book.charts[0].space;
    assert_eq!(space.chart_kind_name(), "column", "barDir=col is a column chart");
    let plot = space.primary_plot().unwrap();
    assert_eq!(plot.kind, wo_ooxml::model::ChartPlotKind::Column);
    assert_eq!(plot.grouping.as_deref(), Some("clustered"));
    assert_eq!(plot.gap_width, Some(150));
    assert_eq!(plot.overlap, Some(-27));
    assert_eq!(plot.ax_ids, vec![111111111, 222222222]);

    let series = &plot.series;
    assert_eq!(series.len(), 2, "both series must parse");
    assert_eq!(series[0].name.as_deref(), Some("Revenue"));
    let values = series[0].values.as_ref().unwrap();
    let nums: Vec<f64> = values.points.iter().filter_map(|p| p.value).collect();
    assert_eq!(nums, vec![120.5, 135.25, 98.0, 142.0], "series values must survive");
    assert_eq!(values.format_code.as_deref(), Some("#,##0.00"));
    let cats = series[0].categories.as_ref().unwrap();
    let labels: Vec<&str> = cats.points.iter().filter_map(|p| p.value.as_deref()).collect();
    assert_eq!(labels, vec!["Q1", "Q2", "Q3", "Q4"], "cached categories must survive");
    assert_eq!(series[1].name.as_deref(), Some("Costs"));
    assert!(series[1].trendlines[0].disp_eq, "trendline flags must survive");
    assert_eq!(
        series[1].error_bars[0].value,
        Some(5.0),
        "error-bar magnitude must come out of the numLit cache"
    );

    let axes = &space.chart.plot_area.axes;
    assert_eq!(axes.len(), 2, "category + value axes must parse");
    assert_eq!(axes[0].kind, wo_ooxml::model::ChartAxisKind::Category);
    assert_eq!(axes[0].ax_pos.as_deref(), Some("b"));
    assert_eq!(axes[0].title.as_deref(), Some("Quarter"));
    assert_eq!(axes[1].kind, wo_ooxml::model::ChartAxisKind::Value);
    assert_eq!(axes[1].ax_pos.as_deref(), Some("l"));
    assert!(axes[1].major_gridlines);

    // 2. wo-chart bridge: the same graph as the editable Chart JSON.
    let chart_json = space.to_chart_json();
    assert!(chart_json.contains(r#""kind":"column""#), "bridge kind: {chart_json}");
    assert!(chart_json.contains(r#""name":"Revenue""#), "bridge series name: {chart_json}");
    assert!(chart_json.contains("120.5"), "bridge series values: {chart_json}");
    assert!(chart_json.contains(r#""category":"Q1""#), "bridge categories: {chart_json}");
    assert!(chart_json.contains(r#""position":"bottom""#), "bridge catAx: {chart_json}");
    assert!(chart_json.contains(r#""position":"left""#), "bridge valAx: {chart_json}");

    // 3. Serialize: chartN.xml regenerated + content type + workbook rel.
    let reser = wo_ooxml::OoxmlSerializer::new()
        .serialize_xlsx_book(&book)
        .unwrap();
    let ct = zip_entry(&reser, "[Content_Types].xml");
    assert!(
        ct.contains(r#"<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>"#),
        "chart content type must be re-declared: {ct}"
    );
    let rels = zip_entry(&reser, "xl/_rels/workbook.xml.rels");
    assert!(
        rels.contains("officeDocument/2006/relationships/chart") && rels.contains(r#"Target="charts/chart1.xml""#),
        "chart relationship must keep the part reachable: {rels}"
    );
    let chart2 = zip_entry(&reser, "xl/charts/chart1.xml");
    assert!(chart2.contains("<c:barChart>"), "plot group must re-emit: {chart2}");
    assert!(chart2.contains(r#"<c:barDir val="col"/>"#), "bar direction must re-emit: {chart2}");
    assert!(chart2.contains(r#"<c:gapWidth val="150"/>"#), "gapWidth must re-emit: {chart2}");
    assert!(chart2.contains(r#"<c:overlap val="-27"/>"#), "overlap must re-emit: {chart2}");
    assert!(chart2.contains("<c:v>Revenue</c:v>"), "series names must re-emit: {chart2}");
    assert!(chart2.contains("<c:v>142</c:v>"), "cached values must re-emit: {chart2}");
    assert!(chart2.contains("<c:v>Q4</c:v>"), "cached categories must re-emit: {chart2}");
    assert!(chart2.contains(r#"<c:majorGridlines/>"#), "valAx gridlines must re-emit: {chart2}");
    assert!(chart2.contains(r#"<c:legendPos val="b"/>"#), "legend must re-emit: {chart2}");
    assert!(chart2.contains(r#"<c:errValType val="percentage"/>"#), "error bars must re-emit: {chart2}");
    assert!(chart2.contains(r#"<c:trendlineType val="linear"/>"#), "trendlines must re-emit: {chart2}");

    // 4. Re-parse: the typed graph is identical, so the chart survives an
    //    edit round trip without any extra_parts passthrough.
    let reparsed = wo_ooxml::OoxmlParser::new().parse_xlsx_book(&reser).unwrap();
    assert_eq!(
        reparsed.charts, book.charts,
        "chart graph must survive the round trip byte-bag-free"
    );
    assert_eq!(
        reparsed.workbook.sheets[0].name, book.workbook.sheets[0].name,
        "the workbook model still parses beside its charts"
    );
    // The regenerated package carries only serializer-owned parts — the
    // chart needs no bag companion.
    let names: Vec<String> = {
        let cursor = std::io::Cursor::new(&reser[..]);
        let mut zip = zip::ZipArchive::new(cursor).unwrap();
        (0..zip.len())
            .filter_map(|i| zip.by_index(i).ok().map(|f| f.name().to_string()))
            .collect()
    };
    assert!(
        names.iter().any(|n| n == "xl/charts/chart1.xml"),
        "the owned chart part must be in the package: {names:?}"
    );
}
