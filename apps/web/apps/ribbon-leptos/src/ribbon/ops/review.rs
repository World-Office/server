//! Review / Collaboration / Protection commands — owned by COMMAND NAME (never control id):
//! track changes, change accept/reject/navigate, comments, display mode, compare/combine,
//! mail merge, chat, protect-document and encrypt.
//!
//! Honesty rule (see `ops::mod`): the engine has no revision, comment, compare or mail-merge
//! op, no display modes, no chat and no encryption — each of those answers `Err`. The ONE engine
//! op here is **protect-document**: `wo_renderer_wasm::set_document_restriction` /
//! `get_document_restriction` record the document's protection (`readOnly` ↔ `none`).
//!
//! The engine RECORDS a restriction but does not enforce it on the edit path (`insert_text` /
//! `handle_key_event` never consult the restriction store — only form filling does). So the
//! status after protecting says the truth: read-only is recorded, edits are not blocked yet.
//! gate/review.cjs proves the pair: it types after protecting and fails if the text changed
//! while the status claimed a seal (or did not change while the status said it would).
use super::Ui;
use crate::ribbon::control::Cmd;
use leptos::prelude::*;

/// Every command this module owns — disjoint from the engine's ops and from the other modules.
pub const COMMANDS: &[&str] = &[
    "toggleTrackChanges",
    "chat",
    "acceptChange",
    "rejectChange",
    "acceptAllChanges",
    "rejectAllChanges",
    "previousChange",
    "nextChange",
    "addComment",
    "deleteComment",
    "resolveComment",
    "toggleComment",
    "displayMode",
    "compareDocuments",
    "combineDocuments",
    "mailMerge",
    "protect-document",
    "encrypt",
];

const NO_REVISIONS: &str = "the engine has no revision op";
const NO_TRACKED_CHANGES: &str = "there are no tracked changes — the engine has no revision op";
const NO_COMMENTS: &str = "the engine has no comments op";

/// Status after protecting: the restriction is stored, but the engine's edit path ignores it
/// (module docs) — "read-only" alone would be a lie.
pub const READ_ONLY_STATUS: &str =
    "protect-document ok (read-only — recorded; edits are not blocked yet)";
/// Status after unprotecting.
pub const UNPROTECTED_STATUS: &str = "protect-document ok (unprotected)";

/// The honest answer for every owned command except protect-document (the one engine op):
/// the message the status line shows after `<command> failed — `.
fn unavailable(command: &str) -> Option<&'static str> {
    Some(match command {
        "encrypt" => "document encryption is not available in the editor",
        "toggleTrackChanges" => NO_REVISIONS,
        "addComment" | "deleteComment" | "resolveComment" | "toggleComment" => NO_COMMENTS,
        "acceptChange" | "rejectChange" | "acceptAllChanges" | "rejectAllChanges"
        | "previousChange" | "nextChange" => NO_TRACKED_CHANGES,
        "displayMode" => "display modes are not available yet",
        "compareDocuments" | "combineDocuments" => {
            "document compare is not available in the editor"
        }
        "mailMerge" => "mail merge is not available in the editor",
        "chat" => "chat is not wired up yet",
        _ => return None,
    })
}

pub fn exec(cmd: &Cmd, ui: &Ui) -> Option<Result<String, String>> {
    if !COMMANDS.contains(&cmd.command) {
        return None; // not ours: the next module answers
    }
    Some(match cmd.command {
        "protect-document" => toggle_restriction(ui.doc),
        // `unavailable` covers every other owned command (kept in step by the unit tests);
        // a gap there hands the command on (`?` → None) rather than inventing a message.
        _ => Err(unavailable(cmd.command)?.to_string()),
    })
}

// ── protect-document: the restriction toggle ─────────────────────────────────────────────

/// What the engine's stored restriction says about editing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protection {
    /// `mode` "none", no restriction, or a blob that does not parse: the engine is not
    /// protecting anything — an engine that cannot say "readOnly" is not read-only.
    Unprotected,
    /// Any restriction mode other than "none".
    Protected,
}

/// Read the engine's restriction JSON (`{"mode":…, "allowPrint":…, "allowCopy":…}`).
pub fn protection_of(stored: &str) -> Protection {
    let mode = serde_json::from_str::<serde_json::Value>(stored)
        .ok()
        .and_then(|v| v.get("mode")?.as_str().map(str::to_string))
        .map(|m| m.trim().to_ascii_lowercase())
        .unwrap_or_default();
    if mode.is_empty() || mode == "none" {
        Protection::Unprotected
    } else {
        Protection::Protected
    }
}

/// The stored print/copy permissions, `true` wherever the engine did not say otherwise.
fn permissions_of(stored: &str) -> (bool, bool) {
    let v = serde_json::from_str::<serde_json::Value>(stored).unwrap_or(serde_json::Value::Null);
    let flag = |k: &str| v.get(k).and_then(|b| b.as_bool()).unwrap_or(true);
    (flag("allowPrint"), flag("allowCopy"))
}

/// `{"mode":…}` in the engine's camelCase wire schema.
fn restriction_json(mode: &str, allow_print: bool, allow_copy: bool) -> String {
    format!(r#"{{"mode":"{mode}","allowPrint":{allow_print},"allowCopy":{allow_copy}}}"#)
}

/// One click on Protect Document, pure: from what the engine reports (`stored`) to the JSON to
/// store and the status to show. Unprotected (incl. unparsable) → `readOnly`; any restriction →
/// `none`. Print/copy permissions carry over unchanged — unprotecting must not grant what the
/// user had taken away.
pub fn protection_toggle(stored: &str) -> (String, String) {
    let (allow_print, allow_copy) = permissions_of(stored);
    match protection_of(stored) {
        Protection::Unprotected => (
            restriction_json("readOnly", allow_print, allow_copy),
            READ_ONLY_STATUS.to_string(),
        ),
        Protection::Protected => (
            restriction_json("none", allow_print, allow_copy),
            UNPROTECTED_STATUS.to_string(),
        ),
    }
}

/// The toggle against a live engine document: read, flip, store, and check what the engine
/// says it kept — a toggle the engine did not record is an `Err`, never an ok.
fn toggle_restriction(doc: u32) -> Result<String, String> {
    let stored = wo_renderer_wasm::get_document_restriction(doc)?;
    let (json, status) = protection_toggle(&stored);
    let kept = wo_renderer_wasm::set_document_restriction(doc, &json)?;
    if protection_of(&kept) != protection_of(&json) {
        return Err(format!("the engine kept the restriction at {kept}"));
    }
    Ok(status)
}

// ── DOM ──────────────────────────────────────────────────────────────────────────────────

#[component]
pub fn Panel(ui: Ui) -> impl IntoView {
    install_probe(ui);
    // No visible DOM yet: nothing here has a bar or popup (every command but protect answers
    // an honest Err). The root stays as the stable hook for gate/review.cjs.
    view! { <div class="ops-panel" id="ops-review"></div> }
}

/// Gate hook: `window.woReviewProbe()` → the engine's stored restriction for the APP's document,
/// so the gate checks the status against the engine's state instead of trusting the text.
fn install_probe(ui: Ui) {
    let Some(w) = web_sys::window() else {
        return;
    };
    let probe = wasm_bindgen::closure::Closure::<dyn Fn() -> String>::new(move || {
        wo_renderer_wasm::get_document_restriction(ui.doc).unwrap_or_else(|e| format!("error: {e}"))
    });
    let _ = js_sys::Reflect::set(&w, &"woReviewProbe".into(), &probe.into_js_value());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::editor::PageView;
    use crate::ribbon::commands::{command_to_format, structure_op_for_command};
    use crate::ribbon::engine::Doc;
    use crate::ribbon::ops::Ui;

    const UNRESTRICTED: &str = r#"{"mode":"none","allowPrint":true,"allowCopy":true}"#;
    const READ_ONLY: &str = r#"{"mode":"readOnly","allowPrint":true,"allowCopy":true}"#;

    fn cmd(command: &'static str) -> Cmd {
        Cmd {
            id: "x",
            command,
            value: None,
        }
    }

    /// A `Ui` on a real, freshly opened document (signals work on the host; the view is never
    /// refreshed here because protect changes no pixels).
    fn ui() -> (Doc, Ui) {
        let d = Doc::open(crate::BLANK_DOCX).expect("open");
        let h = d.handle();
        let ui = Ui {
            doc: h,
            view: PageView::new(),
            pressed: crate::ribbon::control::Pressed::default(),
            cmd: RwSignal::new(None),
            status: RwSignal::new(String::new()),
        };
        (d, ui)
    }

    #[test]
    fn unprotected_or_unreadable_blob_protects() {
        for stored in [
            "",
            "not json",
            "{}",
            r#"{"allowPrint":false}"#,
            r#"{"mode":"NONE"}"#,
            UNRESTRICTED,
        ] {
            let (json, status) = protection_toggle(stored);
            assert_eq!(
                protection_of(&json),
                Protection::Protected,
                "from {stored:?}"
            );
            assert_eq!(status, READ_ONLY_STATUS, "from {stored:?}");
        }
    }

    #[test]
    fn protected_blob_unprotects() {
        for stored in [
            READ_ONLY,
            r#"{"mode":"readOnly","allowPrint":false,"allowCopy":false}"#,
            r#"{"mode":"comment-only"}"#,
            r#"{"mode":"track-changes"}"#,
        ] {
            let (json, status) = protection_toggle(stored);
            assert_eq!(
                protection_of(&json),
                Protection::Unprotected,
                "from {stored:?}"
            );
            assert_eq!(status, UNPROTECTED_STATUS, "from {stored:?}");
        }
    }

    #[test]
    fn permissions_carry_over_both_ways() {
        let (json, _) =
            protection_toggle(r#"{"mode":"none","allowPrint":false,"allowCopy":false}"#);
        assert_eq!(
            json,
            r#"{"mode":"readOnly","allowPrint":false,"allowCopy":false}"#
        );
        let (json, _) =
            protection_toggle(r#"{"mode":"readOnly","allowPrint":false,"allowCopy":true}"#);
        assert_eq!(
            json,
            r#"{"mode":"none","allowPrint":false,"allowCopy":true}"#
        );
    }

    #[test]
    fn owned_commands_are_never_engine_ops_and_have_no_duplicates() {
        assert_eq!(COMMANDS.len(), 18);
        let mut sorted = COMMANDS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), COMMANDS.len(), "a command owned twice");
        for c in COMMANDS {
            assert!(
                command_to_format(c, Some("true")).is_none(),
                "{c} must not be a formatting op"
            );
            assert!(
                structure_op_for_command(c).is_none(),
                "{c} must not be a structure op"
            );
            assert!(!matches!(*c, "undo" | "redo"), "{c} is the engine's");
        }
    }

    #[test]
    fn every_owned_command_answers_honestly() {
        for c in COMMANDS {
            if *c != "protect-document" {
                assert!(unavailable(c).is_some(), "{c} has no answer");
            }
        }
        assert_eq!(unavailable("toggleTrackChanges"), Some(NO_REVISIONS));
        assert_eq!(unavailable("chat"), Some("chat is not wired up yet"));
        assert_eq!(unavailable("addComment"), Some(NO_COMMENTS));
        assert_eq!(unavailable("previousChange"), Some(NO_TRACKED_CHANGES));
        assert_eq!(
            unavailable("encrypt"),
            Some("document encryption is not available in the editor")
        );
        // Nothing else starts with its own command name — the status line already prefixes
        // "<command> failed — " ("chat is not wired up yet" is the spec's wording).
        for c in COMMANDS {
            if let Some(m) = unavailable(c) {
                assert_eq!(m.starts_with(c), *c == "chat", "{c}: {m}");
            }
        }
        // Not ours → None, so another module (or "not an engine op yet") answers.
        let (_, ui) = ui();
        for c in ["bold", "selectAll", "fontSize", "undo", "find", "zoomIn"] {
            assert_eq!(unavailable(c), None, "{c} is not owned");
            assert!(exec(&cmd(c), &ui).is_none(), "{c} is not owned");
        }
    }

    #[test]
    fn exec_answers_the_owned_commands_without_a_ui() {
        let (_, ui) = ui();
        let chat = exec(&cmd("chat"), &ui).expect("owned");
        assert_eq!(chat, Err("chat is not wired up yet".to_string()));
        let tc = exec(&cmd("toggleTrackChanges"), &ui).expect("owned");
        assert_eq!(tc, Err(NO_REVISIONS.to_string()));
        // The honest Errs never touch the status signal themselves (lib.rs writes it).
        assert_eq!(ui.status.try_get().as_deref(), Some(""));
    }

    #[test]
    fn protect_toggles_through_the_real_engine() {
        let (d, ui) = ui();
        let h = d.handle();
        let restriction = || wo_renderer_wasm::get_document_restriction(h).expect("get");
        assert_eq!(
            protection_of(&restriction()),
            Protection::Unprotected,
            "fresh doc"
        );

        let first = exec(&cmd("protect-document"), &ui).expect("owned");
        assert_eq!(first, Ok(READ_ONLY_STATUS.to_string()));
        assert_eq!(protection_of(&restriction()), Protection::Protected);

        let second = exec(&cmd("protect-document"), &ui).expect("owned");
        assert_eq!(second, Ok(UNPROTECTED_STATUS.to_string()));
        assert_eq!(protection_of(&restriction()), Protection::Unprotected);

        // A stored restriction the toggle did not write still un-protects (another path set it).
        wo_renderer_wasm::set_document_restriction(h, r#"{"mode":"comment-only"}"#).expect("set");
        assert_eq!(toggle_restriction(h), Ok(UNPROTECTED_STATUS.to_string()));
    }
}
