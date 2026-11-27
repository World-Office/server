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

    /// Initial layout. Must run before any edit so the engine has a cursor.
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
