//! Navigation keys (INT-3): ArrowUp/Down across wrapped lines with the goal
//! column preserved, paragraph-boundary crossing, Home/End line bounds,
//! Ctrl+Left/Right word jumps (char indices, Unicode-safe), Ctrl+Home/End
//! document bounds via BlockPath, and Shift-extends-selection.
//! Registered via `mod navigation_tests;`.

#[cfg(test)]
use super::*;

use wo_ooxml::model::{DocxTableCell, DocxTableProperties, DocxTableRow};

fn run(text: &str) -> DocxRun {
    DocxRun {
        text: text.to_string(),
        ..Default::default()
    }
}

fn para(text: &str) -> DocxParagraph {
    DocxParagraph {
        style_id: None,
        properties: DocxParagraphProperties::default(),
        runs: vec![run(text)],
        section_properties: None,
        raw_ppr: None,
    }
}

fn body_with(texts: &[&str]) -> DocxBody {
    let mut body = DocxBody::default();
    for t in texts {
        body.blocks.push(DocxBlock::Paragraph(para(t)));
    }
    body
}

/// Inject a model-backed document (no layout); returns the handle.
fn inject(handle: u32, body: DocxBody) -> u32 {
    let doc = OoxmlDocument {
        format: wo_ooxml::model::OoxmlFormat::Unknown,
        version: "1.0".to_string(),
        content_types: Vec::new(),
        main_part: None,
        shared_strings: Vec::new(),
        part_count: 0,
        core_properties: Default::default(),
        relationships: Vec::new(),
        docx_body: Some(body),
        xlsx_workbook: None,
    };
    DOC_MODEL_STORE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap()
        .insert(handle, doc);
    set_cursor(handle, CursorPos::default());
    SELECTION_STORE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap()
        .remove(&handle);
    HISTORY_STORE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap()
        .remove(&handle);
    handle
}

/// Inject and lay out (populates LAYOUT_STORE).
fn fixture(handle: u32, texts: &[&str]) -> u32 {
    let h = inject(handle, body_with(texts));
    layout_document_and_return_json(h, "A4", "portrait", 72.0).unwrap();
    h
}

fn key(h: u32, k: &str, ctrl: bool, shift: bool) {
    handle_key_event(h, k, ctrl, shift, "A4", "portrait", 72.0).unwrap();
}

/// (para, char_idx) of the cursor.
fn pos(h: u32) -> (usize, usize) {
    let c = get_cursor(h);
    (c.para, c.char_idx)
}

/// Set the cursor as a navigation start: clears any sticky goal column.
fn set_cursor_nav(h: u32, c: CursorPos) {
    clear_goal_x(h);
    set_cursor(h, c);
}

/// One laid-out line of page 0, straight from LAYOUT_STORE.
struct Line {
    start: usize,
    len: usize,
    x0: f32,
    end_x: f32,
    y: f32,
    xs: Vec<f32>,
}

/// Laid-out lines of `para` on page 0 — the geometry navigation moves over.
fn laid_lines(h: u32, para: usize) -> Vec<Line> {
    let store = LAYOUT_STORE.get().unwrap().lock().unwrap();
    let pages = store.get(&h).expect("layout present");
    let p = &pages[0].paragraphs[para];
    let mut acc = 0;
    p.lines
        .iter()
        .map(|line| {
            let l = Line {
                start: acc,
                len: line.chars.len(),
                x0: line.x,
                end_x: line.x + line.width,
                y: line.y,
                xs: line.chars.iter().map(|c| c.x).collect(),
            };
            acc += line.chars.len();
            l
        })
        .collect()
}

/// A paragraph long enough to wrap A4 portrait into several lines.
/// Single-char words: wraps happen only at spaces, so every laid-out char
/// carries a correct x (multi-char words can trigger the layout engine's
/// mid-word carry, which keeps stale x on the carried chars).
fn wrapping_text() -> String {
    vec!["a"; 200].join(" ")
}

// ── ArrowUp/ArrowDown over wrapped lines ───────────────────────────

#[test]
fn arrow_up_down_wrapped_lines_keep_goal_column() {
    let text = wrapping_text();
    let h = fixture(9301, &[&text]);
    let lines = laid_lines(h, 0);
    assert!(
        lines.len() >= 3,
        "expected wrapping, got {} lines",
        lines.len()
    );
    let n = lines.len();
    let total: usize = lines.iter().map(|l| l.len).sum();

    // cursor at the very end of the paragraph, goal far past the right edge
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 0,
            line: n - 1,
            char_idx: total,
            x: 9999.0,
            y: lines[n - 1].y,
        },
    );
    key(h, "ArrowUp", false, false);
    let c = get_cursor(h);
    assert_eq!((c.para, c.line), (0, n - 2), "one line up");
    assert_eq!(
        c.char_idx,
        lines[n - 2].start + lines[n - 2].len,
        "far-right goal lands at the end of the line above"
    );
    assert!((c.x - lines[n - 2].end_x).abs() < 0.01);

    // the goal column survives a second Up (sticky x)
    key(h, "ArrowUp", false, false);
    let c = get_cursor(h);
    assert_eq!(c.line, n - 3);
    assert_eq!(c.char_idx, lines[n - 3].start + lines[n - 3].len);

    // and Down returns to the same end-of-line spot
    key(h, "ArrowDown", false, false);
    let c = get_cursor(h);
    assert_eq!(
        (c.line, c.char_idx),
        (n - 2, lines[n - 2].start + lines[n - 2].len)
    );
}

#[test]
fn arrow_down_from_line_start_follows_left_column() {
    let text = wrapping_text();
    let h = fixture(9302, &[&text]);
    let lines = laid_lines(h, 0);
    assert!(lines.len() >= 3);
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 0,
            line: 0,
            char_idx: 0,
            x: lines[0].x0,
            y: lines[0].y,
        },
    );
    key(h, "ArrowDown", false, false);
    assert_eq!(
        get_cursor(h).char_idx,
        lines[1].start,
        "left goal → first char of the line below"
    );
    key(h, "ArrowDown", false, false);
    assert_eq!(get_cursor(h).char_idx, lines[2].start);
    key(h, "ArrowUp", false, false);
    assert_eq!(get_cursor(h).char_idx, lines[1].start);
}

// ── Paragraph boundaries ───────────────────────────────────────────

#[test]
fn arrow_up_down_cross_paragraph_boundaries() {
    let h = fixture(9303, &["hello world", "second para"]);
    let p0 = &laid_lines(h, 0)[0];
    let p1 = &laid_lines(h, 1)[0];

    // far-right goal at start of para 1 → end of para 0
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 1,
            line: 0,
            char_idx: 0,
            x: p0.end_x,
            y: p1.y,
        },
    );
    key(h, "ArrowUp", false, false);
    assert_eq!(pos(h), (0, 11));

    // left goal at start of para 1 → start of para 0
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 1,
            line: 0,
            char_idx: 0,
            x: 0.0,
            y: p1.y,
        },
    );
    key(h, "ArrowUp", false, false);
    assert_eq!(pos(h), (0, 0));

    // left goal at end of para 0 → start of para 1
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 0,
            line: 0,
            char_idx: 11,
            x: 0.0,
            y: p0.y,
        },
    );
    key(h, "ArrowDown", false, false);
    assert_eq!(pos(h), (1, 0));
}

#[test]
fn arrow_up_at_doc_top_and_down_at_doc_end_are_stationary() {
    let h = fixture(9304, &["abc", "def"]);
    let l0 = &laid_lines(h, 0)[0];
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 0,
            line: 0,
            char_idx: 0,
            x: l0.x0,
            y: l0.y,
        },
    );
    key(h, "ArrowUp", false, false);
    assert_eq!(pos(h), (0, 0));
    // plain navigation also collapses an active selection
    set_selection_anchor(h, 0, 2);
    key(h, "ArrowUp", false, false);
    assert_eq!(get_selected_text(h).unwrap(), "");

    let l1 = &laid_lines(h, 1)[0];
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 1,
            line: 0,
            char_idx: 3,
            x: l1.end_x,
            y: l1.y,
        },
    );
    key(h, "ArrowDown", false, false);
    assert_eq!(pos(h), (1, 3));
}

#[test]
fn arrow_down_from_empty_paragraph() {
    let h = fixture(9305, &["", "abc"]);
    let l0 = &laid_lines(h, 0)[0];
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 0,
            line: 0,
            char_idx: 0,
            x: l0.x0,
            y: l0.y,
        },
    );
    key(h, "ArrowDown", false, false);
    assert_eq!(pos(h), (1, 0));
    // and back up onto the empty line
    key(h, "ArrowUp", false, false);
    assert_eq!(pos(h), (0, 0));
}

#[test]
fn arrow_left_right_cross_paragraph_boundaries() {
    let h = fixture(9306, &["hello", "world"]);
    set_cursor_nav(
        h,
        CursorPos {
            para: 0,
            char_idx: 5,
            ..CursorPos::default()
        },
    );
    key(h, "ArrowRight", false, false);
    assert_eq!(pos(h), (1, 0), "ArrowRight at para end → next para start");
    key(h, "ArrowLeft", false, false);
    assert_eq!(
        pos(h),
        (0, 5),
        "ArrowLeft at para start → previous para end"
    );
    // clamped at the document start
    for _ in 0..5 {
        key(h, "ArrowLeft", false, false);
    }
    assert_eq!(pos(h), (0, 0));
    // clamped at the document end
    set_cursor_nav(
        h,
        CursorPos {
            para: 1,
            char_idx: 5,
            ..CursorPos::default()
        },
    );
    key(h, "ArrowRight", false, false);
    key(h, "ArrowRight", false, false);
    assert_eq!(pos(h), (1, 5));
}

// ── Home / End ─────────────────────────────────────────────────────

#[test]
fn home_end_within_wrapped_paragraph() {
    let text = wrapping_text();
    let h = fixture(9307, &[&text]);
    let lines = laid_lines(h, 0);
    assert!(lines.len() >= 2);
    let total: usize = lines.iter().map(|l| l.len).sum();
    let last = lines.last().unwrap();

    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 0,
            line: lines.len() - 1,
            char_idx: total,
            x: last.end_x,
            y: last.y,
        },
    );
    key(h, "Home", false, false);
    assert_eq!(
        get_cursor(h).char_idx,
        last.start,
        "Home → start of the CURRENT (last) line, not the paragraph"
    );
    key(h, "End", false, false);
    assert_eq!(get_cursor(h).char_idx, total);

    // from the first line, Home is the paragraph start
    set_cursor_nav(
        h,
        CursorPos {
            page: 0,
            para: 0,
            line: 0,
            char_idx: lines[0].len,
            x: lines[0].end_x,
            y: lines[0].y,
        },
    );
    key(h, "Home", false, false);
    assert_eq!(get_cursor(h).char_idx, 0);
}

#[test]
fn home_end_without_layout_bound_to_paragraph_text() {
    // no layout call: Home/End fall back to the paragraph text bounds
    let h = inject(9308, body_with(&["hello world"]));
    set_cursor(
        h,
        CursorPos {
            para: 0,
            char_idx: 5,
            ..CursorPos::default()
        },
    );
    key(h, "Home", false, false);
    assert_eq!(pos(h), (0, 0));
    key(h, "End", false, false);
    assert_eq!(pos(h), (0, 11));
}

// ── Ctrl+Left/Right word jumps ─────────────────────────────────────

#[test]
fn ctrl_left_right_word_jumps() {
    let h = fixture(9309, &["one two three", "second para"]);
    set_cursor_nav(
        h,
        CursorPos {
            para: 0,
            char_idx: 0,
            ..CursorPos::default()
        },
    );
    key(h, "ArrowRight", true, false);
    assert_eq!(pos(h), (0, 4), "start of 'two'");
    key(h, "ArrowRight", true, false);
    assert_eq!(pos(h), (0, 8), "start of 'three'");
    key(h, "ArrowRight", true, false);
    assert_eq!(
        pos(h),
        (0, 13),
        "jump at the last word goes to the paragraph end"
    );
    key(h, "ArrowRight", true, false);
    assert_eq!(
        pos(h),
        (1, 0),
        "the next jump crosses into the next paragraph"
    );
    key(h, "ArrowRight", true, false);
    assert_eq!(pos(h), (1, 7), "start of 'para'");
    key(h, "ArrowLeft", true, false);
    assert_eq!(pos(h), (1, 0));
    key(h, "ArrowLeft", true, false);
    assert_eq!(
        pos(h),
        (0, 13),
        "Ctrl+Left from a paragraph start → previous paragraph end"
    );
    key(h, "ArrowLeft", true, false);
    assert_eq!(pos(h), (0, 8));
    key(h, "ArrowLeft", true, false);
    assert_eq!(pos(h), (0, 4));
    key(h, "ArrowLeft", true, false);
    assert_eq!(pos(h), (0, 0));
    key(h, "ArrowLeft", true, false);
    assert_eq!(pos(h), (0, 0), "clamped at the document start");
}

#[test]
fn word_jumps_count_chars_not_bytes() {
    // é and ö are 2-byte chars; char indices must not skip
    let h = fixture(9310, &["héllo wörld", "αβγ δε"]);
    set_cursor_nav(
        h,
        CursorPos {
            para: 0,
            char_idx: 0,
            ..CursorPos::default()
        },
    );
    key(h, "ArrowRight", true, false);
    assert_eq!(pos(h), (0, 6), "start of 'wörld' is char 6, not byte 7");
    key(h, "ArrowRight", true, false);
    assert_eq!(pos(h), (0, 11));
    key(h, "ArrowLeft", true, false);
    assert_eq!(pos(h), (0, 6));
}

// ── Ctrl+Home/End via BlockPath ────────────────────────────────────

#[test]
fn ctrl_home_end_document_bounds() {
    let h = fixture(9311, &["first para", "mid", "last one"]);
    set_cursor_nav(
        h,
        CursorPos {
            para: 1,
            char_idx: 2,
            ..CursorPos::default()
        },
    );
    key(h, "End", true, false);
    assert_eq!(pos(h), (2, 8), "Ctrl+End → end of the last paragraph");
    key(h, "Home", true, false);
    assert_eq!(pos(h), (0, 0), "Ctrl+Home → document start");
}

#[test]
fn ctrl_home_end_without_layout_resolves_through_block_paths() {
    // para, table-cell paragraph, trailing para: the flat order comes from
    // BlockPath, so Ctrl+End must land on the trailing body paragraph
    // even though the middle paragraph lives in a table cell.
    let body = DocxBody {
        blocks: vec![
            DocxBlock::Paragraph(para("before")),
            DocxBlock::Table(DocxTable {
                rows: vec![DocxTableRow {
                    cells: vec![DocxTableCell {
                        paragraphs: vec![para("cell text")],
                        column_span: 1,
                        row_span: 1,
                        width: None,
                        shading: None,
                        raw_tc_pr: None,
                    }],
                    height: Some(300),
                    is_header: false,
                }],
                properties: DocxTableProperties::default(),
                raw_tbl_pr: None,
                raw_tbl_grid: None,
            }),
            DocxBlock::Paragraph(para("after")),
        ],
        raw_sect_pr: None,
    };
    let h = inject(9312, body);
    set_cursor(
        h,
        CursorPos {
            para: 0,
            char_idx: 1,
            ..CursorPos::default()
        },
    );
    key(h, "End", true, false);
    assert_eq!(pos(h), (2, 5), "Ctrl+End → end of the flat-last paragraph");
    key(h, "Home", true, false);
    assert_eq!(pos(h), (0, 0));
}

// ── Shift extends the selection ────────────────────────────────────

#[test]
fn shift_navigation_extends_selection() {
    let h = fixture(9313, &["hello world"]);
    set_cursor_nav(
        h,
        CursorPos {
            para: 0,
            char_idx: 2,
            ..CursorPos::default()
        },
    );
    key(h, "ArrowRight", false, true);
    assert_eq!(get_selected_text(h).unwrap(), "l");
    key(h, "ArrowRight", false, true);
    assert_eq!(get_selected_text(h).unwrap(), "ll");

    // Shift+Down extends into the next paragraph from the anchor
    let h2 = fixture(9314, &["hello world", "second para"]);
    let p0 = &laid_lines(h2, 0)[0];
    set_cursor_nav(
        h2,
        CursorPos {
            page: 0,
            para: 0,
            line: 0,
            char_idx: 6,
            x: p0.xs[6],
            y: p0.y,
        },
    );
    key(h2, "ArrowDown", false, true);
    let sel = get_selected_text(h2).unwrap();
    assert!(
        sel.starts_with("world\n"),
        "selection extends across the paragraph boundary: {sel:?}"
    );
    // a plain move afterwards collapses the selection
    key(h2, "ArrowUp", false, false);
    assert_eq!(get_selected_text(h2).unwrap(), "");
    release_document(h).ok();
    release_document(h2).ok();
}

#[test]
fn shift_ctrl_end_selects_whole_document() {
    let h = fixture(9315, &["first para", "mid", "last one"]);
    set_cursor_nav(h, CursorPos::default());
    key(h, "End", true, true);
    assert_eq!(get_selected_text(h).unwrap(), "first para\nmid\nlast one");
}

#[test]
fn navigation_does_not_push_history() {
    let h = fixture(9316, &["hello world"]);
    key(h, "ArrowRight", false, false);
    key(h, "End", false, false);
    key(h, "Home", true, false);
    assert_eq!(undo(h, "A4", "portrait", 72.0).unwrap(), "{}");
}
