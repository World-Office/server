// Real-world docx (python-docx/Word structure) → furniture roundtrip.
// Reads /tmp/hf-real.docx when present; skipped otherwise (CI has no fixture).
use wo_x2t::converter::FormatConverter;
use wo_ooxml::OoxmlParser;

#[test]
fn real_docx_header_footer_to_html() {
    let data = match std::fs::read("/tmp/hf-real.docx") {
        Ok(d) => d,
        Err(_) => return,
    };
    let html = String::from_utf8(
        wo_x2t::converters::DocxToHtmlConverter
            .convert(&data)
            .expect("convert"),
    )
    .unwrap();
    assert!(html.contains("<header class=\"page-header\">"), "no header wrapper: {html}");
    assert!(html.contains("Real Header Text"), "header text missing: {html}");
    assert!(html.contains("<footer class=\"page-footer\">"), "no footer wrapper");
    assert!(html.contains("Real Footer Text"), "footer text missing");
    // and back: html -> docx keeps the furniture as real parts
    let docx = wo_x2t::converters::HtmlToDocxConverter.convert(html.as_bytes()).expect("back");
    let doc = OoxmlParser::new().parse(&docx).expect("re-parse");
    let body = doc.docx_body.expect("body");
    assert!(body.header.is_some(), "header part lost on save");
    assert!(body.footer.is_some(), "footer part lost on save");
}
