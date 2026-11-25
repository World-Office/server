//! Tab list + Home tab spec. SAMPLE data for now (2 groups / 12 controls) so the scaffold
//! renders and the component gates have something to bite on. The full port of
//! `packages/editor-common/src/ribbon/specs/word-ribbon.ts` Home (5 groups / 40 controls) replaces this.
use crate::types::*;
use ControlKind::*;
use Size::*;

pub fn tabs() -> Vec<Tab> {
    let empty = |id: &'static str, label: &'static str| Tab { id, label, groups: vec![] };
    vec![
        Tab {
            id: "home",
            label: "Home",
            groups: vec![
                Group {
                    id: "clipboard",
                    label: "Clipboard",
                    controls: vec![
                        Control::new("paste", Button, Small, "ClipboardPaste", "Paste", "paste", Some("Ctrl+V")),
                        Control::new("cut", Button, Small, "Scissors", "Cut", "cut", Some("Ctrl+X")),
                        Control::new("copy", Button, Small, "Copy", "Copy", "copy", Some("Ctrl+C")),
                        Control::new("copy-style", Button, Small, "Paintbrush", "Format Painter", "copyStyle", None),
                    ],
                },
                Group {
                    id: "font",
                    label: "Font",
                    controls: vec![
                        Control::new("font-family", Select, Large, "", "Font", "fontFamily", None),
                        Control::new("font-size", Select, Large, "", "Font Size", "fontSize", None),
                        Control::new("increase-font-size", Button, Large, "AArrowUp", "Increase Font Size", "increaseFontSize", Some("Ctrl+]")),
                        Control::new("decrease-font-size", Button, Large, "AArrowDown", "Decrease Font Size", "decreaseFontSize", Some("Ctrl+[")),
                        Control::new("bold", Button, Small, "Bold", "Bold", "bold", Some("Ctrl+B")).toggled(),
                        Control::new("italic", Button, Small, "Italic", "Italic", "italic", Some("Ctrl+I")).toggled(),
                        Control::new("underline", Button, Small, "Underline", "Underline", "underline", Some("Ctrl+U")).toggled(),
                        Control::new("text-color", ColorPicker, Small, "Baseline", "Font Color", "textColor", None),
                    ],
                },
            ],
        },
        empty("insert", "Insert"),
        empty("draw", "Draw"),
        empty("layout", "Layout"),
        empty("references", "References"),
        empty("collaboration", "Collaboration"),
        empty("protection", "Protection"),
        empty("view", "View"),
        empty("plugins", "Plugins"),
        empty("ai", "AI"),
    ]
}
