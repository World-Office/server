//! Table-cell cursor/edit interaction: hit-tested cell paragraphs map back
//! through `BlockPath` so typing lands in the cell, typing after a table
//! lands in the body paragraph, and table XML survives the serialize
//! round-trip. Registered via `mod table_interaction_tests;`.

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

fn cell(text: &str) -> DocxTableCell {
    DocxTableCell {
        paragraphs: vec![para(text)],
        column_span: 1,
        row_span: 1,
        width: None,
        shading: None,
        raw_tc_pr: None,
    }
}

/// Body: paragraph, 2×2 table (cells "alpha" "beta" / "gamma" "delta"),
/// trailing paragraph. Flat paragraph order: before, 4 cell paras, after.
fn table_doc() -> DocxBody {
    DocxBody {
        blocks: vec![
            DocxBlock::Paragraph(para("before")),
            DocxBlock::Table(DocxTable {
                rows: vec![
                    DocxTableRow {
                        cells: vec![cell("alpha"), cell("beta")],
                        height: Some(300),
                        is_header: false,
                    },
                    DocxTableRow {
                        cells: vec![cell("gamma"), cell("delta")],
                        height: Some(300),
                        is_header: false,
                    },
                ],
                properties: DocxTableProperties::default(),
                raw_tbl_pr: None,
                raw_tbl_grid: None,
            }),
            DocxBlock::Paragraph(para("after")),
        ],
        raw_sect_pr: None,
    }
}

/// Inject a model-backed document and lay it out (populates LAYOUT_STORE).
fn fixture(handle: u32, body: DocxBody) -> u32 {
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
    layout_document_and_return_json(handle, "A4", "portrait", 72.0).unwrap();
    handle
}

fn para_text_of(body: &DocxBody, b: usize) -> String {
    match &body.blocks[b] {
        DocxBlock::Paragraph(p) => p.runs.iter().map(|r| r.text.as_str()).collect(),
        _ => panic!("block {b} is not a paragraph"),
    }
}

fn cell_text(body: &DocxBody, r: usize, c: usize) -> String {
    match &body.blocks[1] {
        DocxBlock::Table(t) => t.rows[r].cells[c].paragraphs
            [0]
            .runs
            .iter()
            .map(|x| x.text.as_str())
            .collect(),
        _ => panic!("block 1 is not the table"),
    }
}

/// Canvas coordinates just inside the first character of the paragraph
/// identified by `path`.
fn char_coords(handle: u32, path: BlockPath) -> (f32, f32) {
    let store = LAYOUT_STORE.get().unwrap().lock().unwrap();
    let pages = store.get(&handle).expect("layout present");
    let page = &pages[0];
    let laid = page
        .paragraphs
        .iter()
        .find(|p| p.path == path)
        .expect("path laid out");
    let ch = laid.lines[0].chars.first().expect("cell paragraph has text");
    (ch.x + 1.0, ch.y + 5.0)
}

fn typed(handle: u32, key: &str) {
    handle_key_event(handle, key, false, false, "A4", "portrait", 72.0).unwrap();
}

// ── BlockPath plumbing ────────────────────────────────────────────

#[test]
fn flat_paragraphs_match_layout_order() {
    let body = table_doc();
    let paths = flat_paragraphs(&body);
    assert_eq!(paths.len(), 6);
    assert_eq!(paths[0], BlockPath::BodyBlock(0));
    assert_eq!(
        paths[1],
        BlockPath::TableCell {
            table: 1,
            row: 0,
            cell: 0,
            para: 0
        }
    );
    assert_eq!(
        paths[3],
        BlockPath::TableCell {
            table: 1,
            row: 1,
            cell: 0,
            para: 0
        }
    );
    assert_eq!(
        paths[4],
        BlockPath::TableCell {
            table: 1,
            row: 1,
            cell: 1,
            para: 0
        }
    );
    assert_eq!(paths[5], BlockPath::BodyBlock(2));

    let mut engine = LayoutEngine::new();
    let pages = engine.layout_document(&body, "A4", "portrait", 72.0);
    let laid: Vec<BlockPath> = pages
        .iter()
        .flat_map(|p| p.paragraphs.iter().map(|lp| lp.path))
        .collect();
    assert_eq!(laid, paths, "layout order must equal flat_paragraphs()");
}

#[test]
fn resolve_block_paths() {
    let mut body = table_doc();
    let runs = resolve_block_path(&mut body, BlockPath::BodyBlock(0)).unwrap();
    assert_eq!(runs[0].text, "before");
    let runs = resolve_block_path(
        &mut body,
        BlockPath::TableCell {
            table: 1,
            row: 1,
            cell: 1,
            para: 0,
        },
    )
    .unwrap();
    assert_eq!(runs[0].text, "delta");
    assert!(resolve_block_path(&mut body, BlockPath::BodyBlock(9)).is_none());
    assert!(
        resolve_block_path(&mut body, BlockPath::BodyBlock(1)).is_none(),
        "a table block is not a paragraph"
    );
    assert!(resolve_block_path(
        &mut body,
        BlockPath::TableCell {
            table: 1,
            row: 5,
            cell: 0,
            para: 0
        }
    )
    .is_none());
}

// ── Click + type interaction ──────────────────────────────────────

#[test]
fn click_in_cell_types_into_cell() {
    let h = fixture(9101, table_doc());
    let (x, y) = char_coords(
        h,
        BlockPath::TableCell {
            table: 1,
            row: 0,
            cell: 0,
            para: 0,
        },
    );
    let r = handle_mouse_event(h, 0, x, y).unwrap();
    let pos: serde_json::Value = serde_json::from_str(&r).unwrap();
    assert_eq!(pos["found"], true, "click must hit cell text, layout: {r}");
    assert_eq!(pos["para"], 1, "hit must land on the first cell paragraph");

    typed(h, "X");

    let body = extract_body(h).unwrap();
    assert_eq!(cell_text(&body, 0, 0), "Xalpha", "typed char must land in the cell");
    assert_eq!(cell_text(&body, 0, 1), "beta", "other cells untouched");
    assert_eq!(para_text_of(&body, 0), "before");
    assert_eq!(para_text_of(&body, 2), "after");
    release_document(h).ok();
}

#[test]
fn click_after_table_types_in_body_paragraph() {
    let h = fixture(9102, table_doc());
    let (x, y) = char_coords(h, BlockPath::BodyBlock(2));
    let r = handle_mouse_event(h, 0, x, y).unwrap();
    let pos: serde_json::Value = serde_json::from_str(&r).unwrap();
    assert_eq!(pos["found"], true);
    assert_eq!(pos["para"], 5, "hit must land on the trailing body paragraph");

    typed(h, "Z");

    let body = extract_body(h).unwrap();
    assert_eq!(para_text_of(&body, 2), "Zafter");
    assert_eq!(cell_text(&body, 0, 0), "alpha", "table untouched");
    assert_eq!(body.blocks.len(), 3, "no blocks added or removed");
    release_document(h).ok();
}

// ── Cell-level editing ────────────────────────────────────────────

#[test]
fn backspace_and_enter_work_inside_cells() {
    let h = fixture(9104, table_doc());
    // cursor at end of "alpha" (flat paragraph 1)
    set_cursor(
        h,
        CursorPos {
            para: 1,
            char_idx: 5,
            ..CursorPos::default()
        },
    );
    typed(h, "Backspace");
    assert_eq!(cell_text(&extract_body(h).unwrap(), 0, 0), "alph");

    // Enter adds a paragraph INSIDE the cell; typing continues there
    typed(h, "Enter");
    typed(h, "Q");
    let body = extract_body(h).unwrap();
    let cell_paras = match &body.blocks[1] {
        DocxBlock::Table(t) => &t.rows[0].cells[0].paragraphs,
        _ => panic!("table gone"),
    };
    assert_eq!(cell_paras.len(), 2, "Enter must add a cell paragraph");
    let texts: Vec<String> = cell_paras
        .iter()
        .map(|p| p.runs.iter().map(|r| r.text.as_str()).collect())
        .collect();
    assert_eq!(texts, vec!["alph", "Q"]);
    release_document(h).ok();
}

#[test]
fn selection_across_cells_deletes_text_keeps_table() {
    let h = fixture(9105, table_doc());
    // "lpha" of "alpha" through "bet" of "beta" (adjacent cells)
    set_selection_anchor(h, 1, 1);
    set_cursor(
        h,
        CursorPos {
            para: 2,
            char_idx: 3,
            ..CursorPos::default()
        },
    );
    assert_eq!(get_selected_text(h).unwrap(), "lpha\nbet");

    delete_selection(h, "A4", "portrait", 72.0).unwrap();
    let body = extract_body(h).unwrap();
    assert_eq!(cell_text(&body, 0, 0), "a");
    assert_eq!(cell_text(&body, 0, 1), "a");
    assert_eq!(body.blocks.len(), 3, "table structure must survive");
    release_document(h).ok();
}

// ── Round-trip survival ───────────────────────────────────────────

#[test]
fn typed_in_cell_text_survives_serialize_roundtrip() {
    let h = fixture(9103, table_doc());
    set_cursor(
        h,
        CursorPos {
            para: 1,
            char_idx: 5,
            ..CursorPos::default()
        },
    );
    typed(h, "!");
    assert_eq!(cell_text(&extract_body(h).unwrap(), 0, 0), "alpha!");

    let bytes = serialize_document(h).unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    assert!(xml.contains("<w:tbl>"), "table must survive round-trip");
    assert!(xml.contains("<w:tc>"), "cells must survive round-trip");
    assert!(xml.contains("alpha!"), "cell edit must survive round-trip");
    assert!(xml.contains("before") && xml.contains("after"));
    release_document(h).ok();
}
