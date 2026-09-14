//! Selection-rect tests (registered via `mod selection_rects_tests;`).
//!
//! `compute_selection_rects` maps the anchor/head character offsets through
//! the laid-out lines and yields exactly one rect per selected line, so a
//! multi-line selection produces per-line, non-overlapping rectangles.

#[cfg(test)]
use super::*;

use wo_ooxml::model::{DocxBlock, DocxBody, DocxParagraph, DocxRun};

/// One laid-out line of `word_len` chars at horizontal step 10px, left edge 72.
fn line(y: f32, word_len: usize) -> LaidOutLine {
    let chars: Vec<LaidOutChar> = (0..word_len)
        .map(|i| LaidOutChar {
            ch: 'x',
            x: 72.0 + i as f32 * 10.0,
            y,
            font_size_pt: 12.0,
            color: "#000000".into(),
            bold: false,
            italic: false,
            underline: false,
        })
        .collect();
    LaidOutLine {
        chars,
        x: 72.0,
        y,
        width: word_len as f32 * 10.0,
        height: 20.0,
    }
}

/// A single paragraph of three 10-char lines at y = 72, 92, 112.
fn three_line_page() -> LaidOutPage {
    let layout = PageLayout {
        width_px: 800,
        height_px: 1000,
        margin_px: 72.0,
        content_x: 72.0,
        content_y: 72.0,
        content_width: 656.0,
        content_height: 856.0,
    };
    let para = LaidOutParagraph {
        lines: vec![line(72.0, 10), line(92.0, 10), line(112.0, 10)],
        y: 72.0,
        height: 60.0,
        style_id: None,
        path: BlockPath::BodyBlock(0),
    };
    LaidOutPage {
        layout,
        paragraphs: vec![para],
    }
}

fn assert_non_overlapping(rects: &[SelectionRect]) {
    assert!(!rects.is_empty());
    for pair in rects.windows(2) {
        assert!(
            pair[0].y + pair[0].h <= pair[1].y + 0.001,
            "rects {:?} and {:?} overlap",
            pair[0],
            pair[1]
        );
    }
}

#[test]
fn multi_line_selection_yields_non_overlapping_rects() {
    // All 30 chars selected across 3 lines → one full-width rect per line.
    let rects = compute_selection_rects(&[three_line_page()], (0, 0, 0), (0, 0, 30));
    assert_eq!(rects.len(), 1);
    assert_eq!(rects[0].len(), 3, "one rect per selected line");
    for r in &rects[0] {
        assert!(r.w > 0.0 && r.h > 0.0);
        assert!((r.w - 100.0).abs() < 0.001, "full-width line rect");
    }
    assert_non_overlapping(&rects[0]);
    assert!((rects[0][0].y - 72.0).abs() < 0.001);
    assert!((rects[0][1].y - 92.0).abs() < 0.001);
    assert!((rects[0][2].y - 112.0).abs() < 0.001);
}

#[test]
fn partial_first_and_last_lines_but_full_middle() {
    // Para chars 2..25: line0 chars 2..10, line1 all, line2 chars 0..5.
    let rects = compute_selection_rects(&[three_line_page()], (0, 0, 2), (0, 0, 25));
    assert_eq!(rects[0].len(), 3);
    assert!((rects[0][0].w - 80.0).abs() < 0.001, "line0 partial (8 chars)");
    assert!((rects[0][1].w - 100.0).abs() < 0.001, "line1 full middle");
    assert!((rects[0][2].w - 50.0).abs() < 0.001, "line2 partial (5 chars)");
    assert_non_overlapping(&rects[0]);
}

#[test]
fn single_line_selection_yields_single_rect() {
    // Only line 1 (para chars 10..20) selected.
    let rects = compute_selection_rects(&[three_line_page()], (0, 0, 10), (0, 0, 20));
    assert_eq!(rects[0].len(), 1);
    let r = rects[0][0];
    assert!((r.y - 92.0).abs() < 0.001);
    assert!((r.w - 100.0).abs() < 0.001);
}

#[test]
fn reversed_anchor_head_matches_forward() {
    let forward = compute_selection_rects(&[three_line_page()], (0, 0, 2), (0, 0, 25));
    let backward = compute_selection_rects(&[three_line_page()], (0, 0, 25), (0, 0, 2));
    assert_eq!(forward, backward);
}

#[test]
fn collapsed_selection_yields_no_rects() {
    let rects = compute_selection_rects(&[three_line_page()], (0, 0, 0), (0, 0, 0));
    assert!(rects[0].is_empty());
}

#[test]
fn selection_outside_document_yields_no_rects() {
    let rects = compute_selection_rects(&[three_line_page()], (7, 0, 0), (7, 0, 5));
    assert!(rects[0].is_empty());
}

#[test]
fn selection_across_paragraphs_spans_both() {
    let mut page = three_line_page();
    page.paragraphs.push(LaidOutParagraph {
        // two 5-char lines at y 172, 192
        lines: vec![line(172.0, 5), line(192.0, 5)],
        y: 172.0,
        height: 40.0,
        style_id: None,
        path: BlockPath::BodyBlock(1),
    });
    // Para0 char 25 (line2 char 5) .. para1 char 5 (line0 char 5)
    let rects = compute_selection_rects(&[page], (0, 0, 25), (0, 1, 5));
    assert_eq!(rects[0].len(), 2);
    assert!((rects[0][0].w - 50.0).abs() < 0.001, "para0 line2 partial");
    assert!((rects[0][1].w - 50.0).abs() < 0.001, "para1 line0 partial");
    assert_non_overlapping(&rects[0]);
}

#[test]
fn empty_paragraph_selection_yields_no_rects() {
    let empty_para = LaidOutParagraph {
        lines: vec![line(72.0, 0)],
        y: 72.0,
        height: 20.0,
        style_id: None,
        path: BlockPath::BodyBlock(0),
    };
    let page = LaidOutPage {
        layout: three_line_page().layout,
        paragraphs: vec![empty_para],
    };
    assert!(compute_selection_rects(&[page], (0, 0, 0), (0, 0, 5))[0].is_empty());
}

#[test]
fn engine_layout_multiline_selection_rects_non_overlap() {
    // Real engine: a long run wraps to several lines; the selection covering
    // all of it must map to one non-overlapping rect per line.
    let mut body = DocxBody::default();
    body.blocks.push(DocxBlock::Paragraph(DocxParagraph {
        style_id: None,
        properties: Default::default(),
        runs: vec![DocxRun {
            text: "word ".repeat(60),
            ..Default::default()
        }],
        section_properties: None,
        raw_ppr: None,
    }));
    let mut engine = LayoutEngine::new();
    let pages = engine.layout_document(&body, "A4", "portrait", 72.0);
    let lines = &pages[0].paragraphs[0].lines;
    assert!(lines.len() >= 3, "expected a wrapped multi-line paragraph");
    let total_chars: usize = "word ".repeat(60).chars().count();

    let rects = compute_selection_rects(&pages, (0, 0, 3), (0, 0, total_chars));
    assert_eq!(rects[0].len(), lines.len(), "one rect per laid-out line");
    for r in &rects[0] {
        assert!(r.w > 0.0 && r.h > 0.0);
    }
    assert_non_overlapping(&rects[0]);
}
