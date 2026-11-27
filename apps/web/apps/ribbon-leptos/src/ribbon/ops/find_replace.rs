//! Find & replace ops (`find`, `replace` — the Home > Editing buttons).
//!
//! The engine has NO text search: there is no search op, no replace-by-text-offset, and the
//! cursor cannot be moved to a text offset. What this module CAN do honestly:
//!
//! * `find` opens a floating bar (`#ops-find-replace > .find-bar`) with the term input
//!   (`#find-what`), a match-case checkbox (`#find-case`) and a results line (`#find-results`).
//!   Typing counts non-overlapping matches of the term over the WHOLE document text, read
//!   through the selection trick (select all → `selected_text` → click the caret back). That is
//!   a cursor move: `sync_overlay` only, never `ui.refresh` — a refresh would steal the focus
//!   from the very input the user is typing in. The document is byte-identical afterwards.
//! * `replace` opens the same bar with the replace row (`#replace-with` + `#replace-go`).
//!   Clicking Replace reports the honest Err: the engine has no text-offset replace op. The
//!   classic fake — select-all + insert — would flatten paragraphs and run formats, so it is
//!   never done.
//!
//! Command NAMES are owned, matched on `cmd.command` — never on `cmd.id`.

use super::Ui;
use crate::ribbon::control::Cmd;
use leptos::prelude::*;
use std::cell::Cell;
use wasm_bindgen::JsCast;

/// The command names this module answers (the `Some` cases of [`exec`]); everything else is
/// `None` — the engine and the other modules own their own names, disjoint by contract.
const OWNED: &[&str] = &["find", "replace"];

/// `exec`'s Ok texts (lib.rs puts them into `#status` verbatim).
const OPEN_FIND: &str = "find: type a term";
const OPEN_REPLACE: &str = "replace: type the terms";

/// The results line / status while the term is empty (nothing to count yet — not "no matches").
const EMPTY_TERM_RESULTS: &str = "type a term";
const EMPTY_TERM_STATUS: &str = "find: type a term";

/// The honest replace report. `#replace-go` writes the results line itself and the
/// `"<command> failed — <e>"` status directly (no ribbon Cmd is dispatched), matching exactly
/// what lib.rs would render for a module Err.
const ERR_REPLACE: &str = "the engine has no text-offset replace op";

/// The results line for `n` matches — and why nothing jumps (honesty about the engine gap).
fn matches_line(n: usize) -> String {
    if n == 0 {
        "no matches".to_string()
    } else {
        format!("{n} matches — jumping needs an engine text-offset op")
    }
}

/// The `#status` text for `n` matches.
fn matches_status(n: usize) -> String {
    if n == 0 {
        "find ok (no matches)".to_string()
    } else {
        format!("find ok ({n} matches)")
    }
}

/// Non-overlapping occurrence count of `term` in `text` (empty term → 0). Case-insensitive
/// unless `case_sensitive`. Byte-based `find` on lowercased copies: the offsets it reports are
/// char boundaries of the original, so slicing `hay` stays valid UTF-8.
fn count_matches(text: &str, term: &str, case_sensitive: bool) -> usize {
    if term.is_empty() {
        return 0;
    }
    let (hay, needle): (String, String) = if case_sensitive {
        (text.to_owned(), term.to_owned())
    } else {
        (text.to_lowercase(), term.to_lowercase())
    };
    if needle.is_empty() {
        return 0;
    }
    let mut n = 0;
    let mut from = 0;
    while let Some(pos) = hay[from..].find(&needle) {
        n += 1;
        from += pos + needle.len();
    }
    n
}

pub fn exec(cmd: &Cmd, _ui: &Ui) -> Option<Result<String, String>> {
    if !owns(cmd.command) {
        return None;
    }
    match cmd.command {
        "find" => open_bar(false),
        "replace" => open_bar(true),
        // A name in OWNED without an arm above must not silently fall through.
        _ => Some(Err(format!(
            "internal: `{}` is owned but not dispatched",
            cmd.command
        ))),
    }
}

/// Is this command name ours? (`Cmd.id` is irrelevant — see the module docs.)
fn owns(command: &str) -> bool {
    OWNED.contains(&command)
}

// Panel state, created ONCE in Panel (signals cannot be created outside the reactive tree)
// and stored here so exec — called from the command bus effect — can reach it.
// RwSignal is Copy, so plain Cells need no RefCell.
thread_local! {
    static OPEN: Cell<Option<RwSignal<bool>>> = const { Cell::new(None) };
    static WITH_REPLACE: Cell<Option<RwSignal<bool>>> = const { Cell::new(None) };
    static RESULTS: Cell<Option<RwSignal<String>>> = const { Cell::new(None) };
    static TERM: Cell<Option<RwSignal<String>>> = const { Cell::new(None) };
    static CASE: Cell<Option<RwSignal<bool>>> = const { Cell::new(None) };
}

/// `find` / `replace`: open the floating bar (with or without the replace row). The bar is
/// always in the DOM and shown/hidden by CSS class, so the inputs exist the moment exec runs.
fn open_bar(with_replace: bool) -> Option<Result<String, String>> {
    let Some(open) = OPEN.with(Cell::get) else {
        return Some(Err("panel not mounted".into()));
    };
    let Some(with) = WITH_REPLACE.with(Cell::get) else {
        return Some(Err("panel not mounted".into()));
    };
    let Some(results) = RESULTS.with(Cell::get) else {
        return Some(Err("panel not mounted".into()));
    };
    open.set(true);
    with.set(with_replace);
    let msg = if with_replace {
        OPEN_REPLACE
    } else {
        OPEN_FIND
    };
    results.set(msg.to_string());
    focus_find_input();
    Some(Ok(msg.into()))
}

/// Put the keyboard in the term input — a find bar opens to be typed into. (Unlike the usual
/// ribbon-button rule, we do NOT focus the editor: the bar is the target now, and `exec` for
/// `find`/`replace` changes no pixels anyway.)
fn focus_find_input() {
    if let Some(el) = web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.get_element_by_id("find-what"))
    {
        if let Ok(input) = el.dyn_into::<web_sys::HtmlInputElement>() {
            let _ = input.focus();
        }
    }
}

/// Recount for the current term + case flag. Driven by `on:input` in the bar — a cursor move
/// on the document (`sync_overlay` only, NEVER `ui.refresh`: it would steal the focus from the
/// input the user is typing in and re-raster for nothing).
fn recount(ui: &Ui) {
    let Some(term_s) = TERM.with(Cell::get) else {
        return;
    };
    let Some(case_s) = CASE.with(Cell::get) else {
        return;
    };
    let Some(results) = RESULTS.with(Cell::get) else {
        return;
    };
    let term = term_s.get();
    if term.is_empty() {
        results.set(EMPTY_TERM_RESULTS.to_string());
        ui.status.set(EMPTY_TERM_STATUS.to_string());
        return;
    }
    let case = case_s.get();
    let text = document_text(ui);
    let n = count_matches(&text, &term, case);
    results.set(matches_line(n));
    ui.status.set(matches_status(n));
}

/// The whole document text, read through the selection trick — the only way (there is no
/// whole-document text op): select all, read, click the caret back where it was. Nothing is
/// inserted or deleted; a click collapses the selection, so the document ends byte-identical
/// and the caret back at its pixel.
fn document_text(ui: &Ui) -> String {
    let d = ui.doc();
    let saved = d.caret_xy();
    let _ = d.key("a", true, false); // Ctrl+A = select everything (engine op)
    ui.view.sync_overlay(&ui.pressed, &d); // a cursor move: no pixels changed —
                                           // NO ui.refresh here (it would steal the focus from the find input)
    let text = d.selected_text();
    if let Some((x, y)) = saved {
        if let Ok(c) = d.click(0, x, y) {
            if c.found {
                ui.view.overlay.update(|o| o.caret = Some((0, c.x, c.y)));
                ui.view.sync_overlay(&ui.pressed, &d);
            }
        }
    }
    text
}

#[component]
pub fn Panel(ui: Ui) -> impl IntoView {
    // The module's root node (stable hook for its gate). The bar is always in the DOM and
    // shown/hidden by the `open` class, so exec can focus `#find-what` the moment it runs.
    let open = RwSignal::new(false);
    let with_replace = RwSignal::new(false);
    let results = RwSignal::new(String::new());
    let term = RwSignal::new(String::new());
    let case = RwSignal::new(false);
    OPEN.with(|c| c.set(Some(open)));
    WITH_REPLACE.with(|c| c.set(Some(with_replace)));
    RESULTS.with(|c| c.set(Some(results)));
    TERM.with(|c| c.set(Some(term)));
    CASE.with(|c| c.set(Some(case)));

    let on_input = move |e: web_sys::Event| {
        let v = event_target_value(&e);
        term.set(v);
        recount(&ui);
    };
    let on_case = move |e: web_sys::Event| {
        let checked = e
            .target()
            .and_then(|t| t.dyn_into::<web_sys::HtmlInputElement>().ok())
            .map(|i| i.checked())
            .unwrap_or(false);
        case.set(checked);
        recount(&ui);
    };
    let on_escape = move |e: web_sys::KeyboardEvent| {
        if e.key() == "Escape" {
            if let Some(open) = OPEN.with(Cell::get) {
                open.set(false);
            }
        }
    };
    let on_replace = move |_| {
        let Some(results) = RESULTS.with(Cell::get) else {
            return;
        };
        results.set(ERR_REPLACE.to_string());
        ui.status.set(format!("replace failed — {ERR_REPLACE}"));
    };

    view! {
        <div class="ops-panel" id="ops-find-replace">
            <div
                class="find-bar"
                class:open=move || open.get()
                class:with-replace=move || with_replace.get()
            >
                <input id="find-what" placeholder="Find" on:input=on_input on:keydown=on_escape/>
                <label class="find-case" title="Match case">
                    <input type="checkbox" id="find-case" on:change=on_case/>
                    <span>"Aa"</span>
                </label>
                <span id="find-results" role="status">{move || results.get()}</span>
                // Replace section - only shown when with_replace is true
                <input id="replace-with" placeholder="Replace with"/>
                <button id="replace-go" on:click=on_replace>"Replace"</button>
            </div>
        </div>
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ribbon::engine::Doc;
    use crate::BLANK_DOCX;

    #[test]
    fn owned_commands_are_exactly_the_module_contract() {
        for c in ["find", "replace"] {
            assert!(owns(c), "`{c}` must be owned by the find_replace module");
        }
        // Engine ops and other modules' names are NOT ours (disjoint by contract).
        for c in [
            "bold",
            "undo",
            "redo",
            "selectAll",
            "wordCount",
            "fontSize",
            "zoomIn",
            "",
        ] {
            assert!(
                !owns(c),
                "`{c}` must NOT be owned by the find_replace module"
            );
        }
    }

    #[test]
    fn counts_case_insensitively_by_default_and_sensitively_when_asked() {
        let text = "the cat and THE hat";
        assert_eq!(count_matches(text, "the", false), 2);
        assert_eq!(count_matches(text, "the", true), 1, "THE is not `the`");
        assert_eq!(count_matches(text, "THE", true), 1);
        assert_eq!(count_matches(text, "THE", false), 2);
    }

    #[test]
    fn counts_are_non_overlapping() {
        assert_eq!(count_matches("aaa", "aa", false), 1, "aa in aaa = 1");
        assert_eq!(
            count_matches("aAa", "aa", false),
            1,
            "aA matches aA case-folded"
        );
        assert_eq!(count_matches("aaaa", "aa", false), 2);
    }

    #[test]
    fn empty_terms_count_nothing() {
        assert_eq!(count_matches("anything", "", false), 0);
        assert_eq!(count_matches("", "", true), 0);
        assert_eq!(count_matches("", "x", false), 0);
    }

    #[test]
    fn counts_over_multi_paragraph_text() {
        let text = "the first line\nthe second line\nthe";
        assert_eq!(count_matches(text, "the", false), 3);
        assert_eq!(count_matches(text, "the second line", false), 1);
        assert_eq!(
            count_matches(text, "second line\nthe", false),
            1,
            "\\n is part of the text, matches span paragraphs"
        );
        assert_eq!(
            count_matches(text, "line\nthe", false),
            2,
            "both 'line<NL>the' joins count"
        );
    }

    #[test]
    fn results_and_status_lines_match_the_gate_contract() {
        assert_eq!(
            matches_line(3),
            "3 matches — jumping needs an engine text-offset op"
        );
        assert_eq!(
            matches_line(1),
            "1 matches — jumping needs an engine text-offset op"
        );
        assert_eq!(matches_line(0), "no matches");
        assert_eq!(matches_status(3), "find ok (3 matches)");
        assert_eq!(matches_status(0), "find ok (no matches)");
        assert_eq!(EMPTY_TERM_RESULTS, "type a term");
        assert_eq!(EMPTY_TERM_STATUS, "find: type a term");
    }

    #[test]
    fn open_texts_and_the_replace_err_match_the_contract() {
        assert_eq!(OPEN_FIND, "find: type a term");
        assert_eq!(OPEN_REPLACE, "replace: type the terms");
        assert_eq!(ERR_REPLACE, "the engine has no text-offset replace op");
        // lib.rs renders "<command> failed — <e>": the Err text must not start with the name.
        assert!(
            !ERR_REPLACE.starts_with("replace"),
            "Err must not start with the command name: {ERR_REPLACE:?}"
        );
        assert_eq!(
            format!("replace failed — {ERR_REPLACE}"),
            "replace failed — the engine has no text-offset replace op"
        );
    }

    /// The selection trick on the REAL engine, no browser: select-all → read → click the caret
    /// back. The document text is intact and the caret is back at its pixel — the contract the
    /// counting path depends on every keystroke.
    #[test]
    fn selection_trick_reads_the_text_and_leaves_the_document_intact() {
        let d = Doc::open(BLANK_DOCX).expect("open");
        d.layout().expect("layout");
        d.insert_text("the cat and the hat").expect("insert");
        // The browser's user has clicked the page first — do the same, so the caret has real
        // pixel coordinates (before any click the engine reports a bare (0,0)).
        let hit = d.click(0, 150.0, 100.0).expect("click on the typed line");
        assert!(hit.found, "clicking the typed line places the caret");
        let saved = d.caret_xy().expect("caret after click");

        let _ = d.key("a", true, false).expect("ctrl+a");
        let text = d.selected_text();
        assert_eq!(
            text, "the cat and the hat",
            "select-all sees the whole document"
        );
        assert_eq!(count_matches(&text, "the", false), 2);
        assert_eq!(count_matches(&text, "The", false), 2, "case-folded");
        assert_eq!(
            count_matches(&text, "The", true),
            0,
            "no capital T in the document"
        );

        let c = d.click(0, saved.0, saved.1).expect("restore click");
        assert!(c.found, "the restore click finds the caret's own position");
        let (x, y) = d.caret_xy().expect("caret after restore");
        assert!(
            (x - saved.0).abs() < 0.5 && (y - saved.1).abs() < 0.5,
            "caret back where it was: ({x}, {y}) vs ({saved:?})"
        );
        assert!(
            d.selected_text().is_empty(),
            "the click collapsed the selection"
        );

        // And the document is byte-identical afterwards.
        let _ = d.key("a", true, false).expect("ctrl+a again");
        assert_eq!(d.selected_text(), "the cat and the hat");
    }
}
