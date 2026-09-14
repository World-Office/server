
//! Selection + undo/redo tests (registered via `mod selection_undo_tests;`).
#[cfg(test)]
use super::*;

    /// Body with one paragraph per text, single run each.
    fn body_with(texts: &[&str]) -> DocxBody {
        let mut body = DocxBody::default();
        for t in texts {
            body.blocks.push(DocxBlock::Paragraph(DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs: vec![DocxRun {
                    text: t.to_string(),
                    ..Default::default()
                }],
                section_properties: None,
                raw_ppr: None,
            }));
        }
        body
    }

    /// Inject a document with the given paragraphs; returns a unique handle.
    fn fixture_doc(handle: u32, texts: &[&str]) -> u32 {
        let doc = OoxmlDocument {
            format: wo_ooxml::model::OoxmlFormat::Unknown,
            version: "1.0".to_string(),
            content_types: Vec::new(),
            main_part: None,
            shared_strings: Vec::new(),
            part_count: 0,
            core_properties: Default::default(),
            relationships: Vec::new(),
            docx_body: Some(body_with(texts)),
            xlsx_workbook: None,
        };
        DOC_MODEL_STORE
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap()
            .insert(handle, doc);
        set_cursor(
            handle,
            CursorPos {
                page: 0,
                para: 0,
                line: 0,
                char_idx: 0,
                x: 0.0,
                y: 0.0,
            },
        );
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

    fn para_text(body: &DocxBody, idx: usize) -> String {
        match body.blocks.get(idx) {
            Some(DocxBlock::Paragraph(p)) => {
                p.runs.iter().flat_map(|r| r.text.chars()).collect()
            }
            _ => panic!("paragraph {} missing", idx),
        }
    }

    fn body_of(handle: u32) -> DocxBody {
        extract_body(handle).unwrap()
    }

    fn cursor_at(para: usize, char_idx: usize) -> CursorPos {
        CursorPos {
            page: 0,
            para,
            line: 0,
            char_idx,
            x: 0.0,
            y: 0.0,
        }
    }

    // ── Selection: text extraction ───────────────────────────────────

    #[test]
    fn selected_text_same_paragraph() {
        let body = body_with(&["hello world"]);
        let anchor = cursor_at(0, 1);
        let head = cursor_at(0, 4);
        assert_eq!(get_selected_text_in(&body, anchor, head), "ell");
        // reversed direction yields the same text
        assert_eq!(get_selected_text_in(&body, head, anchor), "ell");
    }

    #[test]
    fn selected_text_across_paragraphs() {
        let body = body_with(&["hello", "world"]);
        let anchor = cursor_at(0, 3);
        let head = cursor_at(1, 2);
        assert_eq!(get_selected_text_in(&body, anchor, head), "lo\nwo");
    }

    #[test]
    fn selected_text_degenerate_is_empty() {
        let body = body_with(&["hello"]);
        let c = cursor_at(0, 2);
        assert_eq!(get_selected_text_in(&body, c, c), "");
    }

    // ── Selection: deletion ──────────────────────────────────────────

    #[test]
    fn delete_selection_same_paragraph() {
        let mut body = body_with(&["hello world"]);
        let cursor = delete_selected(&mut body, cursor_at(0, 1), cursor_at(0, 4));
        assert_eq!(para_text(&body, 0), "ho world");
        assert_eq!((cursor.para, cursor.char_idx), (0, 1));
    }

    #[test]
    fn delete_selection_merges_paragraphs() {
        let mut body = body_with(&["hello", "world"]);
        let cursor = delete_selected(&mut body, cursor_at(0, 3), cursor_at(1, 2));
        assert_eq!(para_text(&body, 0), "helrld");
        assert_eq!(body.paragraphs().len(), 1);
        assert_eq!((cursor.para, cursor.char_idx), (0, 3));
    }

    #[test]
    fn delete_selection_whole_middle_paragraphs() {
        let mut body = body_with(&["aa", "bb", "cc"]);
        let cursor = delete_selected(&mut body, cursor_at(0, 1), cursor_at(2, 1));
        assert_eq!(para_text(&body, 0), "ac");
        assert_eq!(body.paragraphs().len(), 1);
        assert_eq!((cursor.para, cursor.char_idx), (0, 1));
    }

    // ── Public selection API against the stores ──────────────────────

    #[test]
    fn public_get_selected_text_empty_when_no_selection() {
        let h = fixture_doc(7001, &["hello"]);
        assert_eq!(get_selected_text(h).unwrap(), "");
        release_document(h).ok();
    }

    #[test]
    fn public_get_selected_text_uses_stored_anchor() {
        let h = fixture_doc(7002, &["hello"]);
        set_selection_anchor(h, 0, 1);
        set_cursor(h, cursor_at(0, 3));
        assert_eq!(get_selected_text(h).unwrap(), "el");
        release_document(h).ok();
    }

    #[test]
    fn typing_replaces_active_selection() {
        let h = fixture_doc(7003, &["hello"]);
        set_selection_anchor(h, 0, 1);
        set_cursor(h, cursor_at(0, 4)); // "ell" selected
        handle_key_event(h, "X", false, false, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "hXo");
        // selection collapsed
        assert_eq!(get_selected_text(h).unwrap(), "");
        release_document(h).ok();
    }

    #[test]
    fn backspace_with_selection_deletes_selection_not_char_before() {
        let h = fixture_doc(7004, &["hello"]);
        set_selection_anchor(h, 0, 1);
        set_cursor(h, cursor_at(0, 4)); // "ell" selected
        handle_key_event(h, "Backspace", false, false, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "ho");
        release_document(h).ok();
    }

    // ── Undo / redo ──────────────────────────────────────────────────

    #[test]
    fn undo_on_empty_history_is_noop() {
        let h = fixture_doc(7005, &["hello"]);
        assert_eq!(undo(h, "A4", "portrait", 72.0).unwrap(), "{}");
        release_document(h).ok();
    }

    #[test]
    fn undo_reverts_typed_char_and_redo_reapplies() {
        let h = fixture_doc(7006, &["hello"]);
        set_cursor(h, cursor_at(0, 5));
        handle_key_event(h, "!", false, false, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "hello!");

        undo(h, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "hello");

        redo(h, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "hello!");
        release_document(h).ok();
    }

    #[test]
    fn undo_restores_cursor_position() {
        let h = fixture_doc(7007, &["hello"]);
        set_cursor(h, cursor_at(0, 5));
        handle_key_event(h, "!", false, false, "A4", "portrait", 72.0).unwrap();
        undo(h, "A4", "portrait", 72.0).unwrap();
        assert_eq!(get_cursor(h).char_idx, 5);
        release_document(h).ok();
    }

    #[test]
    fn backspace_delete_is_undoable() {
        let h = fixture_doc(7008, &["hello"]);
        set_cursor(h, cursor_at(0, 5));
        handle_key_event(h, "Backspace", false, false, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "hell");
        undo(h, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "hello");
        release_document(h).ok();
    }

    #[test]
    fn whole_paste_is_single_undo_step() {
        let h = fixture_doc(7009, &["hello"]);
        set_cursor(h, cursor_at(0, 5));
        insert_text(h, "AB\nCD", "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "helloAB");
        assert_eq!(body_of(h).paragraphs().len(), 2);

        undo(h, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "hello");
        assert_eq!(body_of(h).paragraphs().len(), 1);
        release_document(h).ok();
    }

    #[test]
    fn new_edit_after_undo_clears_redo() {
        let h = fixture_doc(7010, &["hello"]);
        set_cursor(h, cursor_at(0, 5));
        handle_key_event(h, "!", false, false, "A4", "portrait", 72.0).unwrap();
        undo(h, "A4", "portrait", 72.0).unwrap();
        // fresh edit discards the redo stack
        set_cursor(h, cursor_at(0, 5));
        handle_key_event(h, "?", false, false, "A4", "portrait", 72.0).unwrap();
        assert_eq!(redo(h, "A4", "portrait", 72.0).unwrap(), "{}");
        assert_eq!(para_text(&body_of(h), 0), "hello?");
        release_document(h).ok();
    }

    #[test]
    fn selection_delete_is_undoable() {
        let h = fixture_doc(7011, &["hello"]);
        set_selection_anchor(h, 0, 1);
        set_cursor(h, cursor_at(0, 4)); // "ell" selected
        delete_selection(h, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "ho");
        undo(h, "A4", "portrait", 72.0).unwrap();
        assert_eq!(para_text(&body_of(h), 0), "hello");
        release_document(h).ok();
    }

    #[test]
    fn history_is_capped() {
        let h = fixture_doc(7012, &["x"]);
        for _ in 0..150 {
            set_cursor(h, cursor_at(0, 1));
            handle_key_event(h, "y", false, false, "A4", "portrait", 72.0).unwrap();
        }
        let hist = HISTORY_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let count = hist.lock().unwrap().get(&h).map(|d| d.undo.len()).unwrap_or(0);
        assert!(count <= 100, "history should be capped, got {}", count);
        release_document(h).ok();
    }

#[test]
fn apply_op_invalidates_undo_history_and_selection() {
    // Contract: ANY remote apply_op (even a rejected one) must clear undo/redo
    // and the selection — stale snapshots would resurrect pre-collab text.
    let h = fixture_doc(7013, &["hello"]);
    set_cursor(h, cursor_at(0, 5));
    insert_text(h, "AB", "A4", "portrait", 72.0).ok();
    set_selection_anchor(h, 0, 1);

    // undo works before the remote op
    assert!(undo(h, "A4", "portrait", 72.0).unwrap() != "{}");

    // rebuild history, then a remote op arrives (malformed still invalidates:
    // the session stays live and partial ops can follow)
    insert_text(h, "CD", "A4", "portrait", 72.0).ok();
    assert!(apply_op(h, "not-json").is_err());
    assert_eq!(undo(h, "A4", "portrait", 72.0).unwrap(), "{}", "undo empty after apply_op");
    assert_eq!(redo(h, "A4", "portrait", 72.0).unwrap(), "{}", "redo empty after apply_op");
    let sel = get_selected_text(h).unwrap_or_default();
    assert!(sel.is_empty(), "selection must be gone, got {sel:?}");
    release_document(h).ok();
}

#[test]
fn first_keystroke_after_click_is_not_lost() {
    // Regression: the first typed char after a mouse click used to vanish.
    // Click → type "AB" must yield both chars in the body.
    let h = fixture_doc(7014, &["test"]);
    layout_document_and_return_json(h, "A4", "portrait", 72.0).unwrap();
    // click somewhere on the text (canvas coords from the layout)
    let r = handle_mouse_event(h, 0, 30.0, 96.0).unwrap();
    let pos: serde_json::Value = serde_json::from_str(&r).unwrap();
    assert_eq!(pos["found"], true, "click must hit text, layout was {r}");
    let out1 = handle_key_event(h, "A", false, false, "A4", "portrait", 72.0).unwrap();
    assert!(out1 != "{}", "first keystroke after click must return a layout");
    handle_key_event(h, "B", false, false, "A4", "portrait", 72.0).ok();
    let body = DOC_MODEL_STORE
        .get()
        .unwrap()
        .lock()
        .unwrap()
        .get(&h)
        .and_then(|d| d.docx_body.clone())
        .unwrap();
    let text: String = body
        .blocks
        .iter()
        .filter_map(|b| match b {
            DocxBlock::Paragraph(p) => Some(p.runs.iter().map(|r| r.text.as_str()).collect::<String>()),
            _ => None,
        })
        .collect();
    assert!(text.contains('A') && text.contains('B'), "both chars must land, got {text:?}");
    release_document(h).ok();
}

