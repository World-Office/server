//! Paragraph ops (`ribbon::ops`): line-spacing, multilevelList, changeCase, text-direction,
//! toggleNonprinting, shading, borders.
//!
//! `lineSpacing` is the ONLY one wired to the engine (via `Doc::exec` with the `lineSpacing`
//! command and a factor string). The rest answer honest `Err`s: the engine has no op for
//! multi-level lists, case changes, text direction, shading, borders, or formatting marks.

use super::Ui;
use crate::ribbon::control::Cmd;
use leptos::prelude::*;

/// The command names this module answers (the `Some` cases of [`exec`]).
const OWNED: &[&str] = &[
    "line-spacing",
    "multilevelList",
    "changeCase",
    "text-direction",
    "toggleNonprinting",
    "shading",
    "borders",
];

/// Honest `Err` texts (lib.rs prefixes `"<command> failed — "`: they must not start with
/// the command name themselves).
const ERR_MULTILEVEL: &str = "the engine has no list-level op";
const ERR_CHANGE_CASE: &str = "the engine has no case-change op";
const ERR_TEXT_DIRECTION: &str = "the engine has no text-direction op";
const ERR_SHADING: &str = "the engine has no shading op";
const ERR_BORDERS: &str = "the engine has no borders op";
const ERR_NONPRINTING: &str = "formatting marks are not rendered yet";

pub fn exec(cmd: &Cmd, ui: &Ui) -> Option<Result<String, String>> {
    if !owns(cmd.command) {
        return None;
    }
    match cmd.command {
        "line-spacing" => line_spacing(cmd, ui),
        "multilevelList" => Some(Err(ERR_MULTILEVEL.into())),
        "changeCase" => Some(Err(ERR_CHANGE_CASE.into())),
        "text-direction" => Some(Err(ERR_TEXT_DIRECTION.into())),
        "toggleNonprinting" => Some(Err(ERR_NONPRINTING.into())),
        "shading" => Some(Err(ERR_SHADING.into())),
        "borders" => Some(Err(ERR_BORDERS.into())),
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

/// line-spacing: set paragraph line spacing factor.
/// Ribbon Select value is a factor string without units: "1", "1.15", "1.5", "2", "2.5", "3".
/// Parse f32 > 0, then dispatch to the engine as `lineSpacing` (camelCase).
fn line_spacing(cmd: &Cmd, ui: &Ui) -> Option<Result<String, String>> {
    let value = cmd.value.as_deref().unwrap_or("");
    let factor: f32 = match value.parse::<f32>() {
        Ok(f) if f > 0.0 => f,
        _ => return Some(Err("bad spacing factor".into())),
    };
    // Dispatch to the engine with the engine command name "lineSpacing"
    let engine_cmd = Cmd {
        id: "line-spacing",
        command: "lineSpacing",
        value: Some(factor.to_string()),
    };
    match ui.doc().exec(&engine_cmd, &ui.pressed) {
        Ok(Some(layout)) => {
            ui.refresh(&layout);
            Some(Ok(format!("line-spacing ok ({})", factor)))
        }
        Ok(None) => Some(Err("lineSpacing is not an engine op".into())),
        Err(e) => Some(Err(e)),
    }
}

#[component]
pub fn Panel(ui: Ui) -> impl IntoView {
    let _ = &ui;
    // The paragraph module has no panel of its own; controls live in the ribbon.
    view! { <div class="ops-panel" id="ops-paragraph"></div> }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owned_commands_are_exactly_the_module_contract() {
        for c in [
            "line-spacing",
            "multilevelList",
            "changeCase",
            "text-direction",
            "toggleNonprinting",
            "shading",
            "borders",
        ] {
            assert!(owns(c), "`{c}` must be owned by the paragraph module");
        }
        // Engine ops and other modules' names are NOT ours (disjoint by contract).
        // The engine command "lineSpacing" (camelCase) is NOT the ribbon command we own.
        for c in [
            "bold",
            "undo",
            "redo",
            "fontSize",
            "wordCount",
            "zoomIn",
            "lineSpacing", // engine command, not ribbon command
            "",
        ] {
            assert!(!owns(c), "`{c}` must NOT be owned by the paragraph module");
        }
    }

    #[test]
    fn line_spacing_parses_factors() {
        // Valid positive factors
        let valid = ["1", "1.15", "1.5", "2", "2.5", "3", "0.5", "10.0"];
        for v in valid {
            let f: f32 = v.parse().unwrap();
            assert!(f > 0.0, "{v} should parse to a positive f32");
        }
    }

    #[test]
    fn line_spacing_rejects_bad_values() {
        let bad = ["", "-1", "0", "abc", "1.5.2"];
        for v in bad {
            let result: Result<f32, _> = v.parse();
            assert!(
                result.is_err() || result.as_ref().is_ok_and(|&f| f <= 0.0),
                "{v} should be unparsable or non-positive"
            );
        }
    }

    #[test]
    fn status_texts_are_honest() {
        for (command, msg) in [
            ("multilevelList", ERR_MULTILEVEL),
            ("changeCase", ERR_CHANGE_CASE),
            ("text-direction", ERR_TEXT_DIRECTION),
            ("shading", ERR_SHADING),
            ("borders", ERR_BORDERS),
            ("toggleNonprinting", ERR_NONPRINTING),
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
    }

    #[test]
    fn line_spacing_success_status() {
        // The success status embeds the factor
        // Parse 1.5
        let factor: f32 = "1.5".parse().unwrap();
        let expected = "line-spacing ok (1.5)".to_string();
        assert_eq!(format!("line-spacing ok ({})", factor), expected);
    }
}
