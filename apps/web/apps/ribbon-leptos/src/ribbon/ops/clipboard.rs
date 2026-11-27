//! Clipboard ops (`ribbon::ops`): cut, copy, paste, selectAll, copyStyle, drawSelect.
//!
//! Copy/cut push the selection into the browser's async clipboard (`navigator.clipboard`).
//! The browser call is a `js_sys::Promise`: `exec` returns a PENDING status text, and the
//! promise's `then` closure writes the FINAL one into `#status` a tick later. Cut deletes the
//! selection only inside `then` — a denied clipboard must never eat the document text. Paste
//! reads the clipboard and inserts it through the engine (`Doc::insert_text`, undo-tracked).
//! `selectAll` is the engine's own Ctrl+A (`Doc::key("a", ctrl=true)`). `copyStyle` and
//! `drawSelect` answer honest `Err`s: the engine has no format painter, and there is no
//! selection tool.
//!
//! Command NAMES are owned, matched on `cmd.command` — never on `cmd.id` (the id only tells
//! which of several buttons was clicked): the Draw/Plugins twins (`draw-cut`, `plugins-cut`,
//! …) carry the SAME command as their Home originals and come free.

use super::Ui;
use crate::ribbon::control::Cmd;
use leptos::prelude::*;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
use wasm_bindgen::JsValue;

/// The command names this module answers (the `Some` cases of [`exec`]); everything else is
/// `None` — the engine and the other modules own their own names, disjoint by contract.
const OWNED: &[&str] = &[
    "cut",
    "copy",
    "paste",
    "copyStyle",
    "selectAll",
    "drawSelect",
];

/// Pending status texts (`exec` returns them; the promise closures overwrite them). They must
/// NOT look final (`"… ok"`) — the gate waits for the exact final text.
const PENDING_COPY: &str = "copying...";
const PENDING_CUT: &str = "cutting...";
const PENDING_PASTE: &str = "pasting...";

/// The honest `Err` texts (lib.rs prefixes `"<command> failed — "`: they must not start with
/// the command name themselves).
const ERR_COPY_STYLE: &str = "the engine has no format-painter op";
const ERR_DRAW_SELECT: &str =
    "there is no selection tool yet — click and drag in the page selects text";

pub fn exec(cmd: &Cmd, ui: &Ui) -> Option<Result<String, String>> {
    if !owns(cmd.command) {
        return None;
    }
    match cmd.command {
        "copy" => copy(ui),
        "cut" => cut(ui),
        "paste" => paste(ui),
        "selectAll" => select_all(ui),
        "copyStyle" => Some(Err(ERR_COPY_STYLE.into())),
        "drawSelect" => Some(Err(ERR_DRAW_SELECT.into())),
        // A name in OWNED without an arm above would silently fall through — never let that
        // pass as a fake success or as `None` (which would steal the command from no one).
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

// ── the commands ──────────────────────────────────────────────────────────────────────────────

/// Copy: the selection → clipboard. Nothing selected is an honest no-op Ok.
fn copy(ui: &Ui) -> Option<Result<String, String>> {
    let text = ui.doc().selected_text();
    if let Some(reason) = nothing_selected(&text) {
        return Some(Ok(format!("copy: {reason}")));
    }
    let n = count_chars(&text);
    settle(
        write_promise(&text),
        *ui,
        move |ui, _v| ui.status.set(ok_chars("copy", n)),
        |ui, e| ui.status.set(format!("copy failed — {e:?}")),
    );
    Some(Ok(PENDING_COPY.into()))
}

/// Cut: the IDENTICAL write first; only in `then` (write resolved) does the selection go. If
/// the clipboard rejects, the text stays and the status says so.
fn cut(ui: &Ui) -> Option<Result<String, String>> {
    let text = ui.doc().selected_text();
    if let Some(reason) = nothing_selected(&text) {
        return Some(Ok(format!("cut: {reason}")));
    }
    let n = count_chars(&text);
    settle(
        write_promise(&text),
        *ui,
        move |ui, _v| {
            match ui.doc().delete_selection() {
                Ok(layout) => {
                    ui.refresh(&layout);
                    ui.status.set(ok_chars("cut", n));
                }
                // The clipboard HAS the text — report the delete honestly, do not fake an ok.
                Err(e) => ui.status.set(format!(
                    "cut failed — the clipboard has the text but the delete failed — {e}"
                )),
            }
        },
        |ui, e| ui.status.set(format!("cut failed — {e:?}")),
    );
    Some(Ok(PENDING_CUT.into()))
}

/// Paste: clipboard → engine (`insert_text`, the typed-text path: undo-tracked, re-laid-out).
fn paste(ui: &Ui) -> Option<Result<String, String>> {
    settle(
        read_promise(),
        *ui,
        |ui, v| {
            let text = v.as_string().unwrap_or_default();
            match paste_action(&text) {
                Err(reason) => ui.status.set(format!("paste: {reason}")),
                Ok(t) => match ui.doc().insert_text(&t) {
                    Ok(layout) => {
                        ui.refresh(&layout);
                        ui.status.set(ok_chars("paste", count_chars(&t)));
                    }
                    Err(e) => ui.status.set(format!("paste failed — {e}")),
                },
            }
        },
        |ui, e| ui.status.set(format!("paste failed — {e:?}")),
    );
    Some(Ok(PENDING_PASTE.into()))
}

/// Select all: the engine's own Ctrl+A. A cursor move — no pixels change, `refresh` syncs the
/// overlay only (and puts the keyboard back in the editor after the ribbon click).
fn select_all(ui: &Ui) -> Option<Result<String, String>> {
    match ui.doc().key("a", true, false) {
        Ok(layout) => {
            ui.refresh(&layout);
            Some(Ok("selectAll ok".into()))
        }
        Err(e) => Some(Err(e)),
    }
}

// ── pure helpers (unit-tested on the host) ────────────────────────────────────────────────────

/// The "nothing to take" rule for copy/cut: the engine reports an empty selection. A
/// whitespace-only selection is still a selection — it is taken verbatim.
fn nothing_selected(text: &str) -> Option<String> {
    (text.is_empty()).then(|| "nothing selected".to_string())
}

/// `"<op> ok (N chars)"` — every clipboard success message, from one place (the gate asserts
/// these strings exactly).
fn ok_chars(op: &str, n: usize) -> String {
    format!("{op} ok ({n} chars)")
}

/// Characters, not bytes (`get_selected_text` may hand back multi-byte text).
fn count_chars(text: &str) -> usize {
    text.chars().count()
}

/// What to insert for the text the clipboard delivered: nothing in the clipboard is not an
/// insert (the engine would lay out an empty no-op), it is a report.
fn paste_action(text: &str) -> Result<String, String> {
    if text.is_empty() {
        Err("clipboard is empty".into())
    } else {
        Ok(text.to_string())
    }
}

// ── the browser plumbing (wasm only; small functions, the unit tests never touch them) ───────

/// The browser's async clipboard (`navigator.clipboard` — secure contexts only; the editor and
/// its gate always run on one, and a ribbon click is the user gesture that unlocks it).
fn clipboard() -> web_sys::Clipboard {
    web_sys::window()
        .expect("browser window")
        .navigator()
        .clipboard()
}

/// The write half (copy and cut).
fn write_promise(text: &str) -> js_sys::Promise {
    clipboard().write_text(text)
}

/// The read half (paste).
fn read_promise() -> js_sys::Promise {
    clipboard().read_text()
}

/// The ONE promise → `#status` plumbing. `exec` has already returned a pending text; when the
/// browser settles the promise, these one-shot closures write the FINAL status. Both branches
/// are attached to the SAME promise (`then(ok, err)`), so a rejection can never surface as an
/// unhandled rejection (a console error). `Closure::once_into_js` hands the closures to JS —
/// freed when the promise settles, no `.forget()` leak.
fn settle(
    p: js_sys::Promise,
    ui: Ui,
    ok: impl FnOnce(&Ui, &JsValue) + 'static,
    err: impl FnOnce(&Ui, &JsValue) + 'static,
) {
    let okc = Closure::once_into_js(move |v: JsValue| ok(&ui, &v));
    let errc = Closure::once_into_js(move |v: JsValue| err(&ui, &v));
    // Raw `Promise.prototype.then` via Reflect: js-sys's typed `then` demands its own
    // ScopedClosure wrapper type; the JS API takes plain functions.
    let then = js_sys::Reflect::get(&p, &"then".into())
        .ok()
        .and_then(|f| f.dyn_into::<js_sys::Function>().ok());
    match then {
        Some(then) => {
            let _ = then.call2(&p, &okc, &errc);
        }
        // Unreachable in a real browser (`then` is on every Promise) — but the pending status
        // must not be the last word if the world changes under us.
        None => ui
            .status
            .set("clipboard failed — this environment has no Promise.then".into()),
    }
}

#[component]
pub fn Panel(ui: Ui) -> impl IntoView {
    let _ = &ui; // the clipboard module has no panel of its own
                 // The module's root node (stable hook for its gate); the clipboard ops live in
                 // the ribbon's Clipboard group, there is nothing to mount below the toolbar.
    view! { <div class="ops-panel" id="ops-clipboard"></div> }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owned_commands_are_exactly_the_module_contract() {
        for c in [
            "cut",
            "copy",
            "paste",
            "copyStyle",
            "selectAll",
            "drawSelect",
        ] {
            assert!(owns(c), "`{c}` must be owned by the clipboard module");
        }
        // Engine ops and other modules' names are NOT ours (disjoint by contract).
        for c in [
            "bold",
            "undo",
            "redo",
            "fontSize",
            "wordCount",
            "zoomIn",
            "",
        ] {
            assert!(!owns(c), "`{c}` must NOT be owned by the clipboard module");
        }
    }

    #[test]
    fn nothing_selected_rule() {
        assert_eq!(
            nothing_selected("").as_deref(),
            Some("nothing selected"),
            "an empty selection is an honest no-op"
        );
        assert_eq!(nothing_selected("world"), None);
        assert_eq!(nothing_selected(" "), None, "whitespace is a selection too");
        assert_eq!(
            nothing_selected("\n"),
            None,
            "a paragraph break is a selection too"
        );
    }

    #[test]
    fn success_statuses_are_operator_chars() {
        assert_eq!(ok_chars("copy", 5), "copy ok (5 chars)");
        assert_eq!(ok_chars("cut", 16), "cut ok (16 chars)");
        assert_eq!(ok_chars("paste", 1), "paste ok (1 chars)");
    }

    #[test]
    fn char_counts_count_chars_not_bytes() {
        assert_eq!(count_chars("hello worldworld"), 16);
        assert_eq!(count_chars("héllo"), 5, "a char is a char, not a byte");
    }

    #[test]
    fn paste_action_rules() {
        assert_eq!(
            paste_action(""),
            Err("clipboard is empty".to_string()),
            "an empty clipboard is not an insert"
        );
        assert_eq!(paste_action("world").as_deref(), Ok("world"));
        assert_eq!(
            paste_action(" ").as_deref(),
            Ok(" "),
            "whitespace is real text"
        );
    }

    #[test]
    fn pending_statuses_do_not_look_final() {
        for p in [PENDING_COPY, PENDING_CUT, PENDING_PASTE] {
            assert!(!p.ends_with(" ok"), "{p:?} looks like a final success");
            assert!(!p.contains("failed"), "{p:?} looks like a failure");
        }
    }

    #[test]
    fn honest_errs_do_not_start_with_their_command() {
        // lib.rs renders "<command> failed — <e>"; an Err starting with the command name
        // would read "copyStyle failed — copyStyle …".
        for (command, msg) in [
            ("copyStyle", ERR_COPY_STYLE),
            ("drawSelect", ERR_DRAW_SELECT),
        ] {
            assert!(
                !msg.starts_with(command),
                "Err for {command} must not start with the command name: {msg:?}"
            );
            assert!(
                !msg.contains(" ok "),
                "Err for {command} must not claim success"
            );
        }
        assert_eq!(ERR_COPY_STYLE, "the engine has no format-painter op");
        assert_eq!(
            ERR_DRAW_SELECT,
            "there is no selection tool yet — click and drag in the page selects text"
        );
    }
}
