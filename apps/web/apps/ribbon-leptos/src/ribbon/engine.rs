//! Engine layer: owns the document handle and routes a ribbon `Cmd` to the engine crate.
//! Every call is a plain Rust function call into `wo_renderer_wasm` — same wasm module.
//!
//! ponytail: one document, fixed A4/portrait/72pt. Page setup becomes a parameter when the
//! Layout tab's page-size controls are wired (they exist in the spec as buttons today).

use crate::ribbon::commands::{command_to_format, structure_op_for_command};
use crate::ribbon::control::Cmd;
use crate::ribbon::control::Pressed;

/// Page setup shared by every layout-returning engine call.
const PAGE: (&str, &str, f32) = ("A4", "portrait", 72.0);

/// A live document in the engine. Dropping it releases the engine-side model.
pub struct Doc(u32, bool /* release_on_drop */);

impl Doc {
    /// Create from DOCX bytes. The engine parses and stores the model; we keep the handle.
    pub fn open(bytes: &[u8]) -> Result<Self, String> {
        wo_renderer_wasm::create_document(bytes, "docx").map(|h| Self(h, true))
    }

    /// The engine's document handle.
    pub fn handle(&self) -> u32 {
        self.0
    }

    /// Re-wrap a live handle (one created by `open`, whose `Doc` was dropped via `forget`).
    /// Does NOT release on drop — the original owner does.
    pub fn from_handle(h: u32) -> Self {
        Self(h, false)
    }

    /// Initial layout of the PRISTINE file bytes (the engine's public `layout_document` reads
    /// DOC_STORE, not the edited model). Init only: calling it after an edit re-lays out the
    /// blank original and clobbers the engine's layout cache — the view goes white.
    pub fn layout(&self) -> Result<String, String> {
        let (s, o, m) = PAGE;
        wo_renderer_wasm::layout_document(self.0, s, o, m)
    }

    /// Execute a ribbon command against the document. Returns the new layout JSON on success.
    /// Commands the engine cannot execute (panels, store, UI) are `Ok(None)` — handled upstream.
    pub fn exec(&self, cmd: &Cmd, pressed: &Pressed) -> Result<Option<String>, String> {
        let (s, o, m) = PAGE;
        let h = self.0;
        let v = cmd.value.as_deref();
        let layout = if let Some(fmt) = command_to_format(cmd.command, v) {
            // Toggle semantics: applying "bold" to an already-bold run must un-bold it.
            let fmt = toggle_off_if_pressed(cmd, fmt, pressed);
            wo_renderer_wasm::apply_formatting(h, &fmt, s, o, m)?
        } else if let Some(op) = structure_op_for_command(cmd.command) {
            wo_renderer_wasm::apply_structure_op(h, op, s, o, m)?
        } else {
            match cmd.command {
                "undo" => wo_renderer_wasm::undo(h, s, o, m)?,
                "redo" => wo_renderer_wasm::redo(h, s, o, m)?,
                // Everything else (cut/copy/paste, panels, view toggles, plugins, ai) is not an
                // engine op. Ok(None) tells the caller the command is still unhandled.
                _ => return Ok(None),
            }
        };
        Ok(Some(layout))
    }

    /// Run formatting at the cursor, as the engine reports it (drives the toggled buttons).
    pub fn run_formatting(&self) -> Result<serde_json::Value, String> {
        wo_renderer_wasm::get_run_formatting(self.0)
            .and_then(|j| serde_json::from_str(&j).map_err(|e| e.to_string()))
    }

    // ── Editing: the canvas host's input path (same flow as the React CanvasEditor) ────────

    /// A navigation/edit key: arrows, Home/End, Enter, Backspace, Delete — and Ctrl+A/Z/Y/B/I/U,
    /// which the engine interprets itself. Typed TEXT goes through [`Self::insert_text`]:
    /// `handle_key_event` only inserts single-BYTE keys, which silently drops "ü"/"é".
    pub fn key(&self, key: &str, ctrl: bool, shift: bool) -> Result<String, String> {
        let (s, o, m) = PAGE;
        wo_renderer_wasm::handle_key_event(self.0, key, ctrl, shift, s, o, m)
    }

    /// Insert text at the cursor — the path for typed characters AND IME commits. '\n' breaks
    /// the paragraph. Pushes undo history.
    pub fn insert_text(&self, text: &str) -> Result<String, String> {
        let (s, o, m) = PAGE;
        wo_renderer_wasm::insert_text(self.0, text, s, o, m)
    }

    /// Click on a page (canvas px) → the caret goes there.
    pub fn click(&self, page: u32, x: f32, y: f32) -> Result<Caret, String> {
        wo_renderer_wasm::handle_mouse_event(self.0, page, x, y)
            .and_then(|raw| serde_json::from_str::<Caret>(&raw).map_err(|e| e.to_string()))
    }

    /// Extend the selection to `x,y` on `page` (mouse drag).
    pub fn drag(&self, page: u32, x: f32, y: f32) -> Result<(), String> {
        wo_renderer_wasm::handle_mouse_drag(self.0, page, x, y).map(|_| ())
    }

    /// Caret position in canvas px, or None before the first edit/click. ponytail: the engine's
    /// cursor JSON has no `page` field, so the host keeps the page of the last click; a
    /// one-line engine addition (`"page": c.page`) would fix multi-page caret placement.
    pub fn caret_xy(&self) -> Option<(f32, f32)> {
        serde_json::from_str::<Caret>(&wo_renderer_wasm::get_cursor_position(self.0))
            .ok()
            .map(|c| (c.x, c.y))
    }

    /// Selection highlight rectangles, per page.
    pub fn selection_rects(&self) -> Vec<Vec<Rect>> {
        wo_renderer_wasm::get_selection_rects(self.0)
            .ok()
            .and_then(|j| serde_json::from_str(&j).ok())
            .unwrap_or_default()
    }

    /// The selected text (clipboard). Empty when nothing is selected.
    pub fn selected_text(&self) -> String {
        wo_renderer_wasm::get_selected_text(self.0).unwrap_or_default()
    }

    /// Delete the selection (cut, without the clipboard part).
    pub fn delete_selection(&self) -> Result<String, String> {
        let (s, o, m) = PAGE;
        wo_renderer_wasm::delete_selection(self.0, s, o, m)
    }

    /// Rasterize page `i` at `w×h` px as RGBA bytes. Runs on the host too (fonts only load
    /// under wasm32), so the pixel path is unit-tested without a browser.
    pub fn page_rgba(&self, i: u32, w: u32, h: u32) -> Result<Vec<u8>, String> {
        let ch = wo_renderer_wasm::create_canvas(w, h);
        if ch == 0 {
            return Err(format!("create_canvas({w}, {h}) failed"));
        }
        let px = wo_renderer_wasm::render_laid_out_page(self.0, i, ch)
            .and_then(|_| wo_renderer_wasm::get_pixel_data(ch));
        let _ = wo_renderer_wasm::release_canvas(ch);
        px
    }
}

/// Caret as the engine reports it after a click: `{para, line, charIdx, x, y, found}`. Only the
/// geometry and `found` matter to the host.
#[derive(Clone, Copy, Debug, Default, serde::Deserialize)]
pub struct Caret {
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default)]
    pub found: bool,
}

/// A selection highlight rectangle on a page (canvas px).
#[derive(Clone, Copy, Debug, Default, PartialEq, serde::Deserialize)]
pub struct Rect {
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default)]
    pub w: f32,
    #[serde(default)]
    pub h: f32,
}

/** `(width, height)` in canvas px of every page, from the layout JSON every mutating engine
/// call returns: a top-level array of `{width, height, marginPx, paragraphs, selection_rects}`.
/// Empty on malformed input: an unparseable layout must not become a crash. */
pub fn pages_of(layout: &str) -> Vec<(u32, u32)> {
    let v: serde_json::Value = serde_json::from_str(layout).unwrap_or(serde_json::Value::Null);
    v.as_array()
        .map(|a| {
            a.iter()
                .map(|p| {
                    (
                        p["width"].as_f64().unwrap_or(0.0).round() as u32,
                        p["height"].as_f64().unwrap_or(0.0).round() as u32,
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

impl Drop for Doc {
    fn drop(&mut self) {
        if self.1 {
            let _ = wo_renderer_wasm::release_document(self.0);
        }
    }
}

/// Bold/italic/… are toggles in OO. The engine's `apply_formatting` only sets, so a pressed
/// button must send `false`. The pressed set comes from the engine's own run formatting, so this
/// reflects the document, not the click count.
fn toggle_off_if_pressed(cmd: &Cmd, fmt: String, pressed: &Pressed) -> String {
    let Some(key) = toggle_key(cmd.command) else {
        return fmt;
    };
    if pressed.with(|p| p.contains(&cmd.id)) {
        format!(r#"{{"{}":false}}"#, key)
    } else {
        fmt
    }
}

/// Commands whose format JSON is a single boolean we can flip.
fn toggle_key(command: &str) -> Option<&'static str> {
    match command {
        "bold" => Some("bold"),
        "italic" => Some("italic"),
        "strike" | "strikethrough" => Some("strikethrough"),
        _ => None,
    }
}

/// Which control ids are "on" for a run with this formatting — the bridge between the engine's
/// `get_run_formatting` JSON and the ribbon's `pressed` ids. Keys mirror the engine's output.
pub fn pressed_from_formatting(f: &serde_json::Value) -> Vec<&'static str> {
    let b = |k: &str| f.get(k).and_then(|v| v.as_bool()).unwrap_or(false);
    let mut v = Vec::new();
    if b("bold") {
        v.push("bold");
    }
    if b("italic") {
        v.push("italic");
    }
    if b("strikethrough") {
        v.push("strike");
    }
    if f.get("underline")
        .and_then(|u| u.as_str())
        .is_some_and(|u| u != "none")
    {
        v.push("underline");
    }
    match f.get("verticalAlignment").and_then(|a| a.as_str()) {
        Some("subscript") => v.push("subscript"),
        Some("superscript") => v.push("superscript"),
        _ => {}
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pressed_ids_follow_run_formatting() {
        assert_eq!(
            pressed_from_formatting(&json!({"bold": true, "italic": false})),
            vec!["bold"]
        );
        assert_eq!(
            pressed_from_formatting(
                &json!({"bold": true, "underline": "single", "verticalAlignment": "superscript"})
            ),
            vec!["bold", "underline", "superscript"]
        );
        assert!(pressed_from_formatting(&json!({"underline": "none"})).is_empty());
        assert!(pressed_from_formatting(&json!({})).is_empty());
    }

    #[test]
    fn toggle_flips_only_boolean_formats() {
        let pressed = Pressed::new(vec![]);
        let cmd = Cmd {
            id: "bold",
            command: "bold",
            value: None,
        };
        assert_eq!(
            toggle_off_if_pressed(&cmd, r#"{"bold":true}"#.into(), &pressed),
            r#"{"bold":true}"#
        );
        pressed.set(vec!["bold"]);
        assert_eq!(
            toggle_off_if_pressed(&cmd, r#"{"bold":true}"#.into(), &pressed),
            r#"{"bold":false}"#
        );
        // not a toggle: untouched even if pressed
        let cmd = Cmd {
            id: "heading1",
            command: "heading1",
            value: None,
        };
        assert_eq!(
            toggle_off_if_pressed(&cmd, r#"{"heading":1}"#.into(), &pressed),
            r#"{"heading":1}"#
        );
    }
}

#[cfg(test)]
mod engine_roundtrip_tests {
    use super::*;
    use crate::ribbon::control::{Cmd, Pressed};

    use crate::BLANK_DOCX;

    /// The whole chain on the real engine, no browser: ribbon Cmd → apply_formatting → the
    /// engine's own run formatting says bold → pressed set contains "bold" → clicking again
    /// sends bold:false → unpressed. This is the contract the UI depends on.
    #[test]
    fn bold_toggles_through_the_real_engine() {
        let d = Doc::open(BLANK_DOCX).expect("open");
        d.layout().expect("layout");
        let pressed = Pressed::default();
        let cmd = Cmd {
            id: "bold",
            command: "bold",
            value: None,
        };

        let out = d.exec(&cmd, &pressed).expect("bold");
        assert!(out.is_some(), "bold must be an engine op");
        let f = d.run_formatting().expect("run formatting");
        assert_eq!(
            pressed_from_formatting(&f),
            vec!["bold"],
            "engine must report bold after apply"
        );

        pressed.set(pressed_from_formatting(&f));
        d.exec(&cmd, &pressed).expect("bold again");
        let f = d.run_formatting().expect("run formatting");
        assert!(
            pressed_from_formatting(&f).is_empty(),
            "second click must un-bold"
        );
    }

    #[test]
    fn non_engine_commands_are_reported_unhandled_not_errors() {
        let d = Doc::open(BLANK_DOCX).expect("open");
        d.layout().expect("layout");
        let pressed = Pressed::default();
        let cut = Cmd {
            id: "cut",
            command: "cut",
            value: None,
        };
        assert!(
            d.exec(&cut, &pressed).expect("no error").is_none(),
            "cut is not an engine op"
        );
        let heading = Cmd {
            id: "heading1",
            command: "heading1",
            value: None,
        };
        assert!(d.exec(&heading, &pressed).expect("heading").is_some());
    }
}

/// The canvas host's input path, on the real engine. `page_rgba` renders with no fonts on the
/// host (they load under wasm32 only), so these prove geometry and state, not glyphs.
#[cfg(test)]
mod host_tests {
    use super::*;

    fn doc() -> Doc {
        let d = Doc::open(crate::BLANK_DOCX).expect("open");
        d.layout().expect("layout");
        d
    }

    #[test]
    fn layout_json_gives_page_geometry() {
        let d = doc();
        let pages = pages_of(&d.layout().expect("layout"));
        assert_eq!(
            pages,
            vec![(793, 1123)],
            "engine's A4 at 96 dpi (793, not 794), one page"
        );
        assert!(
            pages_of("not json").is_empty(),
            "garbage in → no pages, no panic"
        );
    }

    #[test]
    fn page_rasterizes_to_an_opaque_white_page() {
        let d = doc();
        let px = d.page_rgba(0, 794, 1123).expect("rasterize");
        assert_eq!(px.len(), 794 * 1123 * 4, "RGBA, one page");
        assert_eq!(
            &px[..4],
            &[255, 255, 255, 255],
            "page corner is white, opaque"
        );
        assert!(
            d.page_rgba(0, 0, 0).is_err(),
            "a 0×0 canvas is an error, not a silent blank"
        );
    }

    #[test]
    fn typing_then_clicking_moves_the_caret() {
        let d = doc();
        assert!(d.caret_xy().is_none(), "no caret before the first edit");
        d.insert_text("Hello").expect("insert");
        assert!(d.caret_xy().is_some(), "caret exists after typing");
        let c = d.click(0, 100.0, 100.0).expect("click is routed");
        assert!(c.found, "a click on the first text line finds a position");
        assert!(d.drag(0, 200.0, 100.0).is_ok());
    }

    #[test]
    fn the_caret_follows_typing_and_a_click_on_it_keeps_its_position() {
        let d = doc();
        d.insert_text("Hello").expect("insert");
        let (x0, y0) = d.caret_xy().expect("caret after the insert");
        // the caret after an insert sits after the last glyph, so clicking right on it keeps it
        let c = d.click(0, x0, y0 + 8.0).expect("click");
        assert!(c.found);
        assert!(
            (c.x - x0).abs() < 0.01,
            "click at the caret x: {} vs {x0}",
            c.x
        );
        // the key path and the paste path both advance the caret along the line
        d.key("a", false, false).expect("key a");
        let (x1, y1) = d.caret_xy().expect("caret after key a");
        assert!(x1 > x0, "key: the caret follows the typing {x0} → {x1}");
        assert!((y1 - y0).abs() < 0.01, "key: same line {y0} → {y1}");
        d.insert_text("bc").expect("insert bc");
        let (x2, y2) = d.caret_xy().expect("caret after insert bc");
        assert!(x2 > x1, "insert: the caret follows the typing {x1} → {x2}");
        assert!((y2 - y1).abs() < 0.01, "insert: same line {y1} → {y2}");
        assert!(
            d.selected_text().is_empty(),
            "no stray selection after typing"
        );
    }

    #[test]
    fn select_all_selects_the_typed_text() {
        let d = doc();
        d.insert_text("Hello").expect("insert");
        d.key("a", true, false).expect("ctrl+a");
        assert!(d.selected_text().contains("Hello"));
        assert!(
            !d.selection_rects().is_empty(),
            "the engine reports highlight rects for the selection"
        );
        d.delete_selection().expect("delete selection");
        assert!(!d.selected_text().contains("Hello"));
    }

    #[test]
    fn undo_restores_deleted_text() {
        let d = doc();
        d.insert_text("Hello").expect("insert");
        d.key("Backspace", false, false).expect("backspace");
        d.key("z", true, false).expect("ctrl+z");
        d.key("a", true, false).expect("select all");
        assert!(
            d.selected_text().contains("Hell"),
            "undo brought the 'o' back"
        );
    }
}
