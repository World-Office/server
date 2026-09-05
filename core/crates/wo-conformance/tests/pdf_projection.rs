//! L2 geometry projection: PDF bytes → box tree, against a deterministic
//! hand-crafted PDF (uncompressed streams, known positions).
//!
//! The fixture is embedded as source so no binary ever lands in git. Expected
//! values below were verified with `pdftotext -bbox-layout` (poppler 26.08).

use wo_conformance::{PdfGeometrySource, PopplerSource};

/// Two pages, Helvetica 12pt, known Td positions.
const FIXTURE_PDF: &[u8] = b"%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R 5 0 R]/Count 2>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 7 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 8 0 R>>endobj
7 0 obj<</Length 78>>stream
BT /F1 12 Tf 72 720 Td (Hello layout oracle) Tj 0 -24 Td (Second line here) Tj ET
endstream
endobj
8 0 obj<</Length 30>>stream
BT /F1 12 Tf 90 700 Td (Page two) Tj ET
endstream
endobj
trailer<</Root 1 0 R/Size 9>>
%%EOF";

fn have_pdftotext() -> bool {
    std::process::Command::new("pdftotext")
        .arg("-v")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
}

fn source() -> PopplerSource {
    PopplerSource::new().expect("pdftotext in PATH")
}

#[test]
fn pages_and_sizes_are_projected() {
    if !have_pdftotext() {
        eprintln!("skipping: pdftotext not in PATH");
        return;
    }
    let render = source().extract(FIXTURE_PDF).unwrap();
    assert_eq!(render.pages.len(), 2, "both pages projected");
    for page in &render.pages {
        assert_eq!(page.size.width_pt, 612.0);
        assert_eq!(page.size.height_pt, 792.0);
    }
    // Top-left origin, y down: line placed at Td y=720 is at 792-720-up = 63.384.
    let first = &render.pages[0].boxes[0];
    assert!(
        (first.origin.y_pt - 63.384).abs() < 0.5,
        "got {}",
        first.origin.y_pt
    );
    assert!((first.origin.x_pt - 72.0).abs() < 0.5);
}

#[test]
fn lines_become_paragraph_boxes_with_word_runs() {
    if !have_pdftotext() {
        eprintln!("skipping: pdftotext not in PATH");
        return;
    }
    let render = source().extract(FIXTURE_PDF).unwrap();
    let page1 = &render.pages[0];
    assert_eq!(page1.boxes.len(), 2, "two Td lines -> two Paragraph boxes");
    assert!(page1
        .boxes
        .iter()
        .all(|b| matches!(b.kind, wo_conformance::BoxKind::Paragraph)));

    let texts: Vec<String> = page1.boxes[0].runs.iter().map(|r| r.text.clone()).collect();
    assert_eq!(texts, vec!["Hello", "layout", "oracle"]);

    // Second line is *below* the first (y down) by 24pt.
    assert!((page1.boxes[1].origin.y_pt - page1.boxes[0].origin.y_pt - 24.0).abs() < 0.5);

    // Page 2 has its own box.
    assert_eq!(render.pages[1].boxes.len(), 1);
    assert_eq!(render.pages[1].boxes[0].runs[0].text, "Page");
}

#[test]
fn projection_is_deterministic() {
    if !have_pdftotext() {
        eprintln!("skipping: pdftotext not in PATH");
        return;
    }
    let a = source().extract(FIXTURE_PDF).unwrap();
    let b = source().extract(FIXTURE_PDF).unwrap();
    assert_eq!(a, b, "same PDF in, byte-identical IR out");
}
