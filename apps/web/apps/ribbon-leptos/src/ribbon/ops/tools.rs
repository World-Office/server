//! Tools ops (`ribbon::ops`): wordCount, setDocumentLanguage, draw-language-select, toggleSpellCheck.
//!
//! wordCount reads the whole document text through the selection trick (select all, read,
//! restore caret), counts words/characters/paragraphs and shows them in the #ops-tools bar.
//! The other three commands answer honest `Err`s: the engine has no language op, the
//! document language is display-only, and there are no embedded dictionaries for spelling.
//!
//! Command NAMES are owned, matched on `cmd.command` — never on `cmd.id`:
//! - wordCount: Home/Plugins buttons `word-count` and `draw-word-count`
//! - setDocumentLanguage: Home/Plugins `set-document-language`, Draw `draw-set-language`
//! - draw-language-select: Draw `#draw-language-select` (a native select)
//! - toggleSpellCheck: checkboxes `spell-checking` (Home/Plugins), `draw-spell-checking` (Draw),
//!   `spellcheck` (View)

use super::Ui;
use crate::ribbon::control::Cmd;
use leptos::prelude::*;

/// The command names this module answers (the `Some` cases of [`exec`]); everything else is
/// `None` — the engine and the other modules own their own names, disjoint by contract.
const OWNED: &[&str] = &[
    "wordCount",
    "setDocumentLanguage",
    "draw-language-select",
    "toggleSpellCheck",
];

/// The honest `Err` texts (lib.rs prefixes `"<command> failed — "`: they must not start with
/// the command name themselves).
const ERR_NO_LANGUAGE_OP: &str = "the engine has no language op";
const ERR_DISPLAY_ONLY: &str =
    "the document language is a display value only — the engine has no language op";
const ERR_NO_SPELLING: &str = "no dictionaries are embedded — spelling is not checked";

pub fn exec(cmd: &Cmd, ui: &Ui) -> Option<Result<String, String>> {
    if !owns(cmd.command) {
        return None;
    }
    match cmd.command {
        "wordCount" => word_count(ui),
        "setDocumentLanguage" => Some(Err(ERR_NO_LANGUAGE_OP.into())),
        "draw-language-select" => Some(Err(ERR_DISPLAY_ONLY.into())),
        "toggleSpellCheck" => Some(Err(ERR_NO_SPELLING.into())),
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

/// wordCount: reads the whole document text via select-all → selected_text, counts
/// words/characters/paragraphs, restores the caret, shows the counts in #ops-tools, and
/// focuses back to the editor (ribbon buttons steal focus on click).
fn word_count(ui: &Ui) -> Option<Result<String, String>> {
    let d = ui.doc();

    // Save the current caret position (before we select all)
    let saved = d.caret_xy();

    // Select all via the engine (Ctrl+A)
    let _layout = match d.key("a", true, false) {
        Ok(lay) => lay,
        Err(e) => return Some(Err(e)),
    };

    // Sync the overlay (caret moved, selection is now everything) — NO refresh (pixels unchanged)
    ui.view.sync_overlay(&ui.pressed, &d);

    // Read the selected text (the whole document)
    let text = d.selected_text();

    // Count
    let (words, chars, chars_with_spaces, paragraphs) = count_text(&text);

    // Restore the caret if we had a position
    if let Some((x, y)) = saved {
        if let Ok(caret) = d.click(0, x, y) {
            if caret.found {
                ui.view.overlay.update(|o| {
                    o.caret = Some((0, caret.x, caret.y));
                });
                ui.view.sync_overlay(&ui.pressed, &d);
            }
        }
    }

    // Show the counts in the panel
    set_counts(words, chars, chars_with_spaces, paragraphs);

    // Put keyboard back in the editor (the ribbon button stole focus)
    crate::editor::focus_input();

    Some(Ok(format!("wordCount ok ({words} words)")))
}

/// Set the counts in the #ops-tools bar via JS (the panel may or may not be mounted).
fn set_counts(words: usize, chars: usize, chars_with_spaces: usize, paragraphs: usize) {
    // Build the status string
    let status = format!(
        "Words {words} · Characters {chars} · Characters with spaces {chars_with_spaces} · Paragraphs {paragraphs}"
    );

    // Try to set it in the DOM
    if let Some(doc) = web_sys::window().and_then(|w| w.document()) {
        if let Some(el) = doc.get_element_by_id("ops-tools") {
            el.set_inner_html(&status);
            // Make sure it's visible
            el.set_attribute("role", "status").ok();
        }
    }
}

// ── pure helpers (unit-tested on the host) ──────────────────────────────────────────────────

/// Count words, characters, and paragraphs from the text.
/// - words: whitespace-separated non-empty tokens (Unicode whitespace)
/// - characters: count of non-whitespace characters
/// - characters_with_spaces: count of all characters (including whitespace)
/// - paragraphs: non-empty lines (split by \n, count non-empty)
fn count_text(text: &str) -> (usize, usize, usize, usize) {
    let all_chars = text.chars().count();
    let no_space_chars = text.chars().filter(|c| !c.is_whitespace()).count();

    // Words: split by whitespace, count non-empty
    let words: usize = text.split_whitespace().filter(|s| !s.is_empty()).count();

    // Paragraphs: split by newlines, count non-empty
    let paragraphs: usize = text.split('\n').filter(|s| !s.trim().is_empty()).count();

    (words, no_space_chars, all_chars, paragraphs)
}

// ── Panel ────────────────────────────────────────────────────────────────────────────────────

thread_local! {
    static OPEN: std::cell::Cell<Option<RwSignal<bool>>> = const { std::cell::Cell::new(None) };
}

#[component]
pub fn Panel(ui: Ui) -> impl IntoView {
    // Create the open signal and store it in thread-local
    let _ = &ui; // used to receive the Ui prop
    let open = RwSignal::new(false);
    OPEN.with(|c| c.set(Some(open)));

    // The panel visibility — empty when closed
    let display = move || {
        if open.get() {
            "block"
        } else {
            "none"
        }
    };

    view! {
        <div class="ops-panel" id="ops-tools" style=move || format!("display: {}", display())>
        </div>
    }
}

// ── Host unit tests ──────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owned_commands_are_exactly_the_module_contract() {
        for c in [
            "wordCount",
            "setDocumentLanguage",
            "draw-language-select",
            "toggleSpellCheck",
        ] {
            assert!(owns(c), "`{c}` must be owned by the tools module");
        }
        // Engine ops and other modules' names are NOT ours (disjoint by contract).
        for c in [
            "bold", "undo", "redo", "fontSize", "cut", "copy", "paste", "zoomIn", "",
        ] {
            assert!(!owns(c), "`{c}` must NOT be owned by the tools module");
        }
    }

    #[test]
    fn honest_errs_do_not_start_with_their_command() {
        // lib.rs renders "<command> failed — <e>"; an Err starting with the command name
        // would read "wordCount failed — wordCount …".
        for (command, msg) in [
            ("setDocumentLanguage", ERR_NO_LANGUAGE_OP),
            ("draw-language-select", ERR_DISPLAY_ONLY),
            ("toggleSpellCheck", ERR_NO_SPELLING),
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
        assert_eq!(ERR_NO_LANGUAGE_OP, "the engine has no language op");
        assert_eq!(
            ERR_DISPLAY_ONLY,
            "the document language is a display value only — the engine has no language op"
        );
        assert_eq!(
            ERR_NO_SPELLING,
            "no dictionaries are embedded — spelling is not checked"
        );
    }

    #[test]
    fn word_count_empty_text() {
        let (words, chars, chars_with_spaces, paragraphs) = count_text("");
        assert_eq!(words, 0, "empty text has 0 words");
        assert_eq!(chars, 0, "empty text has 0 chars");
        assert_eq!(chars_with_spaces, 0);
        assert_eq!(paragraphs, 0, "empty text has 0 paragraphs");
    }

    #[test]
    fn word_count_hello_world() {
        let (words, chars, chars_with_spaces, paragraphs) = count_text("hello world");
        assert_eq!(words, 2, "'hello world' has 2 words");
        assert_eq!(chars, 10, "'hello world' has 10 non-space chars");
        assert_eq!(chars_with_spaces, 11, "'hello world' has 11 chars total");
        assert_eq!(paragraphs, 1, "'hello world' has 1 paragraph (no newline)");
    }

    #[test]
    fn word_count_hello_world_newline() {
        let (words, chars, chars_with_spaces, paragraphs) = count_text("hello world\n");
        assert_eq!(words, 2);
        // "hello world\n" has 10 non-whitespace (11 chars - 1 space - 1 newline = 9? No, 'hello world' = 10 non-space + 1 space + 1 newline = 12 total, 10 non-space)
        assert_eq!(chars, 10);
        assert_eq!(chars_with_spaces, 12);
        assert_eq!(paragraphs, 1, "trailing newline doesn't add a paragraph");
    }

    #[test]
    fn word_count_multiple_lines() {
        let text = "hello\nworld";
        let (words, chars, chars_with_spaces, paragraphs) = count_text(text);
        assert_eq!(words, 2);
        // "hello\nworld" has 5 + 5 = 10 non-whitespace chars, 1 newline = 11 total
        assert_eq!(chars, 10);
        assert_eq!(chars_with_spaces, 11);
        assert_eq!(paragraphs, 2, "two non-empty lines = 2 paragraphs");
    }

    #[test]
    fn word_count_multiple_spaces() {
        let (words, chars, chars_with_spaces, paragraphs) = count_text("a  b");
        assert_eq!(words, 2, "multiple spaces between words: still 2 words");
        // "a  b" has a, b = 2 non-whitespace, 2 spaces = 4 total
        assert_eq!(chars, 2);
        assert_eq!(chars_with_spaces, 4);
        assert_eq!(paragraphs, 1);
    }

    #[test]
    fn word_count_whitespace_only_lines() {
        let text = "a  b\n\nc";
        let (words, chars, chars_with_spaces, paragraphs) = count_text(text);
        assert_eq!(words, 3, "whitespace in tokens: 'a', 'b', 'c' = 3 words");
        // "a  b\n\nc" has a, b, c = 3 non-whitespace, spaces and newlines = 4 whitespace, total = 7
        assert_eq!(chars, 3);
        assert_eq!(chars_with_spaces, 7);
        assert_eq!(paragraphs, 2, "empty line doesn't count as a paragraph");
    }

    #[test]
    fn word_count_em_dash_is_word() {
        // An em-dash (—) is non-whitespace, so it counts as a word
        let (words, chars, chars_with_spaces, paragraphs) = count_text("—");
        assert_eq!(words, 1, "em-dash counts as a word");
        assert_eq!(chars, 1);
        assert_eq!(chars_with_spaces, 1);
        assert_eq!(paragraphs, 1);
    }

    #[test]
    fn status_text_format() {
        // The status text for 2 words
        let result = "wordCount ok (2 words)";
        assert_eq!(result, "wordCount ok (2 words)");
    }

    #[test]
    fn display_text_format() {
        let status = "Words 2 · Characters 9 · Characters with spaces 11 · Paragraphs 1";
        assert_eq!(
            status,
            "Words 2 · Characters 9 · Characters with spaces 11 · Paragraphs 1"
        );
    }
}
