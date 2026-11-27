//! Ribbon command → engine call. Ports `commandToFormat`, `stepFontSize` and
//! `structureOpForCommand` from the React app's `lib/word-commands.ts` verbatim — same JSON
//! keys, same half-point and 240th-of-a-line units, so the engine sees exactly what it saw before.
//! Pure logic, no engine calls here: `cargo test` covers it without a browser.

/// Standard ONLYOFFICE font-size ladder (points). Ribbon Inc./Dec. font size buttons step along
/// it; a non-ladder start value is snapped to the nearest rung before stepping.
pub const FONT_SIZE_LADDER: [f32; 14] = [
    8.0, 9.0, 10.0, 11.0, 12.0, 14.0, 16.0, 18.0, 20.0, 24.0, 28.0, 36.0, 48.0, 72.0,
];

/// Next / previous ladder size in points; defaults to stepping from 12pt.
pub fn step_font_size(value: Option<&str>, dir: i32) -> f32 {
    let current = value.and_then(|v| v.parse::<f32>().ok()).unwrap_or(12.0);
    match FONT_SIZE_LADDER.iter().position(|&s| s == current) {
        None => FONT_SIZE_LADDER[0],
        Some(idx) => {
            let n = FONT_SIZE_LADDER.len() as i32;
            FONT_SIZE_LADDER[(idx as i32 + dir).clamp(0, n - 1) as usize]
        }
    }
}

/// Ribbon command + value → the `apply_formatting` JSON object. `None` when the command is not
/// a formatting op (structure ops, store/panel commands — see `structure_op_for_command`).
/// Emits the same JSON the React app emitted so the engine's contract is unchanged.
pub fn command_to_format(command: &str, value: Option<&str>) -> Option<String> {
    let v = value.unwrap_or("");
    let json = match command {
        "bold" => r#"{"bold":true}"#.to_string(),
        "italic" => r#"{"italic":true}"#.to_string(),
        "underline" => format!(
            r#"{{"underline":{}}}"#,
            js_str(if v.is_empty() { "single" } else { v })
        ),
        "strike" | "strikethrough" => r#"{"strikethrough":true}"#.to_string(),
        "subscript" => r#"{"verticalAlignment":"subscript"}"#.to_string(),
        "superscript" => r#"{"verticalAlignment":"superscript"}"#.to_string(),
        // Font size is in half-points (1pt = 2 half-points), matching the font-size select.
        "fontSize" => format!(
            r#"{{"fontSize":{}}}"#,
            if v.is_empty() {
                24
            } else {
                v.parse::<i32>().unwrap_or(12) * 2
            }
        ),
        "increaseFontSize" => format!(
            r#"{{"fontSize":{}}}"#,
            (step_font_size(value, 1) * 2.0) as i32
        ),
        "decreaseFontSize" => format!(
            r#"{{"fontSize":{}}}"#,
            (step_font_size(value, -1) * 2.0) as i32
        ),
        // These require a value: no value → not a format op (same as the React `value ? … : null`).
        "fontFamily" => return (!v.is_empty()).then(|| format!(r#"{{"fontName":{}}}"#, js_str(v))),
        "textColor" => return (!v.is_empty()).then(|| format!(r#"{{"textColor":{}}}"#, js_str(v))),
        "highlight" | "highlightColor" => {
            return (!v.is_empty()).then(|| format!(r#"{{"highlight":{}}}"#, js_str(v)))
        }
        "clearFormatting" => r#"{"clearFormatting":true}"#.to_string(),
        "alignLeft" => r#"{"align":"left"}"#.to_string(),
        "alignCenter" => r#"{"align":"center"}"#.to_string(),
        "alignRight" => r#"{"align":"right"}"#.to_string(),
        "alignJustify" => r#"{"align":"justify"}"#.to_string(),
        "heading1" => r#"{"heading":1}"#.to_string(),
        "heading2" => r#"{"heading":2}"#.to_string(),
        "heading3" => r#"{"heading":3}"#.to_string(),
        "heading4" => r#"{"heading":4}"#.to_string(),
        "heading5" => r#"{"heading":5}"#.to_string(),
        "heading6" => r#"{"heading":6}"#.to_string(),
        // value is a line-spacing factor like "1", "1.15", "1.5", "2"
        // → OOXML spacing_line in 240ths (1.15 = 276, 1.5 = 360, 2 = 480).
        "lineSpacing" => {
            let factor = if v.is_empty() {
                1.15
            } else {
                v.parse::<f32>().unwrap_or(1.15)
            };
            format!(r#"{{"lineSpacing":{}}}"#, (factor * 240.0).round() as i32)
        }
        _ => return None,
    };
    Some(json)
}

/// Map a ribbon command to an engine structure op. `None` when it is not a structure op.
pub fn structure_op_for_command(command: &str) -> Option<&'static str> {
    Some(match command {
        "bulletList" | "bullet-list" => "bullet-list",
        "orderedList" | "ordered-list" => "ordered-list",
        "taskList" | "task-list" => "task-list",
        "indent" => "indent",
        "outdent" => "outdent",
        "insertSectionBreak" | "insert-section-break" => "insert-section-break",
        "insertContinuousSectionBreak" | "insert-continuous-section-break" => {
            "insert-continuous-section-break"
        }
        "horizontalRule" | "horizontal-rule" => "horizontal-rule",
        "pageBreak" | "page-break" => "page-break",
        // OO "Blank Page" inserts a page break at the cursor, pushing the following content onto
        // a fresh page (same real model op).
        "blankPage" | "blank-page" => "page-break",
        "blockquote" => "blockquote",
        "codeBlock" => "code-block",
        _ => return None,
    })
}

/// JSON string literal. Escapes what can appear in a colour, font name or option value.
fn js_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_ops_emit_the_same_json_the_react_app_emitted() {
        assert_eq!(
            command_to_format("bold", None).as_deref(),
            Some(r#"{"bold":true}"#)
        );
        assert_eq!(
            command_to_format("underline", None).as_deref(),
            Some(r#"{"underline":"single"}"#)
        );
        assert_eq!(
            command_to_format("underline", Some("double")).as_deref(),
            Some(r#"{"underline":"double"}"#)
        );
        assert_eq!(
            command_to_format("strike", None).as_deref(),
            Some(r#"{"strikethrough":true}"#)
        );
        assert_eq!(
            command_to_format("subscript", None).as_deref(),
            Some(r#"{"verticalAlignment":"subscript"}"#)
        );
        // half-points
        assert_eq!(
            command_to_format("fontSize", Some("12")).as_deref(),
            Some(r#"{"fontSize":24}"#)
        );
        assert_eq!(
            command_to_format("fontSize", None).as_deref(),
            Some(r#"{"fontSize":24}"#)
        );
        assert_eq!(
            command_to_format("increaseFontSize", Some("12")).as_deref(),
            Some(r#"{"fontSize":28}"#)
        );
        assert_eq!(
            command_to_format("decreaseFontSize", Some("12")).as_deref(),
            Some(r#"{"fontSize":22}"#)
        );
        assert_eq!(
            command_to_format("increaseFontSize", Some("72")).as_deref(),
            Some(r#"{"fontSize":144}"#),
            "clamped at ladder top"
        );
        assert_eq!(
            command_to_format("increaseFontSize", Some("13")).as_deref(),
            Some(r#"{"fontSize":16}"#),
            "off-ladder snaps to 8pt"
        );
        // value required
        assert_eq!(command_to_format("fontFamily", None), None);
        assert_eq!(
            command_to_format("fontFamily", Some("Times New Roman")).as_deref(),
            Some(r#"{"fontName":"Times New Roman"}"#)
        );
        assert_eq!(
            command_to_format("textColor", Some("#ff0000")).as_deref(),
            Some(r##"{"textColor":"#ff0000"}"##)
        );
        assert_eq!(
            command_to_format("highlight", Some("yellow")).as_deref(),
            Some(r#"{"highlight":"yellow"}"#)
        );
        assert_eq!(
            command_to_format("alignJustify", None).as_deref(),
            Some(r#"{"align":"justify"}"#)
        );
        assert_eq!(
            command_to_format("heading3", None).as_deref(),
            Some(r#"{"heading":3}"#)
        );
        // 240ths of a line
        assert_eq!(
            command_to_format("lineSpacing", Some("1.15")).as_deref(),
            Some(r#"{"lineSpacing":276}"#)
        );
        assert_eq!(
            command_to_format("lineSpacing", Some("2")).as_deref(),
            Some(r#"{"lineSpacing":480}"#)
        );
        assert_eq!(
            command_to_format("lineSpacing", None).as_deref(),
            Some(r#"{"lineSpacing":276}"#)
        );
        // not a format op
        assert_eq!(command_to_format("cut", None), None);
        assert_eq!(command_to_format("bulletList", None), None);
    }

    #[test]
    fn font_values_are_json_escaped() {
        assert_eq!(
            command_to_format("fontFamily", Some("a\"b")).as_deref(),
            Some(r#"{"fontName":"a\"b"}"#)
        );
    }

    #[test]
    fn structure_ops() {
        assert_eq!(structure_op_for_command("bullet-list"), Some("bullet-list"));
        assert_eq!(structure_op_for_command("blankPage"), Some("page-break"));
        assert_eq!(structure_op_for_command("codeBlock"), Some("code-block"));
        assert_eq!(structure_op_for_command("bold"), None);
    }

    #[test]
    fn ladder_steps() {
        assert_eq!(step_font_size(Some("11"), 1), 12.0);
        assert_eq!(step_font_size(Some("11"), -1), 10.0);
        assert_eq!(step_font_size(None, 1), 14.0, "no value steps from 12");
        assert_eq!(step_font_size(Some("8"), -1), 8.0, "clamped at bottom");
    }
}
