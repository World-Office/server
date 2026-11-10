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
