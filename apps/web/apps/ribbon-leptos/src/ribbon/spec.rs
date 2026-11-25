//! Tab list + Home tab spec. Port of the Home tab from
//! `packages/editor-common/src/ribbon/specs/word-ribbon.ts`.
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
                // <ts group id> clipboard
                Group {
                    id: "clipboard",
                    label: "Clipboard",
                    controls: vec![
                        Control::new("cut", Button, Small, "Scissors", "Cut", "cut", Some("Ctrl+X")),
                        Control::new("copy", Button, Small, "Copy", "Copy", "copy", Some("Ctrl+C")),
                        Control::new("paste", Button, Small, "ClipboardPaste", "Paste", "paste", Some("Ctrl+V")),
                        Control::new("undo", Button, Small, "Undo2", "Undo", "undo", Some("Ctrl+Z")),
                        Control::new("redo", Button, Small, "Redo2", "Redo", "redo", Some("Ctrl+Y")),
                        Control::new("copy-style", Button, Small, "CopyText", "Copy style", "copyStyle", Some("Ctrl+Alt+C")),
                    ],
                },
                // <ts group id> font
                Group {
                    id: "font",
                    label: "Font",
                    controls: vec![
                        Control::new("increase-font-size", Button, Large, "Type", "Increment font size", "increaseFontSize", Some("Ctrl+]")),
                        Control::new("decrease-font-size", Button, Large, "Type", "Decrement font size", "decreaseFontSize", Some("Ctrl+[")),
                        Control::new("change-case", Button, Large, "Edit3", "Change case", "changeCase", None),
                        Control::new("bold", Button, Small, "Bold", "Bold", "bold", Some("Ctrl+B")).toggled(),
                        Control::new("italic", Button, Small, "Italic", "Italic", "italic", Some("Ctrl+I")).toggled(),
                        Control::new("underline", Button, Small, "Underline", "Underline", "underline", Some("Ctrl+U")).toggled(),
                        Control::new("strikethrough", Button, Small, "Strikethrough", "Strikethrough", "strike", Some("Ctrl+5")).toggled(),
                        Control::new("superscript", Button, Small, "Superscript", "Superscript", "superscript", Some("Ctrl+, ")).toggled(),
                        Control::new("subscript", Button, Small, "Subscript", "Subscript", "subscript", Some("Ctrl+.")).toggled(),
                        Control::new("font-family", Select, Large, "", "Font", "fontFamily", None),
                        Control::new("font-size", Select, Large, "", "Font size", "fontSize", None),
                        Control::new("text-color", ColorPicker, Small, "", "Font color", "textColor", None),
                        Control::new("highlight-color", ColorPicker, Small, "", "Highlight color", "highlight", None),
                        Control::new("clear-formatting", Button, Small, "RemoveFormatting", "Clear style", "clearFormatting", None),
                    ],
                },
                // <ts group id> paragraph
                Group {
                    id: "paragraph",
                    label: "Paragraph",
                    controls: vec![
                        Control::new("bullet-list", Button, Large, "List", "Bullets", "bulletList", None).toggled(),
                        Control::new("ordered-list", Button, Large, "ListOrdered", "Numbering", "orderedList", None).toggled(),
                        Control::new("task-list", Button, Small, "ListChecks", "Tasks", "taskList", None).toggled(),
                        Control::new("multilevel-list", Button, Large, "ListOrdered", "Multilevel list", "multilevelList", None),
                        Control::new("outdent", Button, Large, "IndentDecrease", "Decrease indent", "outdent", Some("Ctrl+Shift+M")),
                        Control::new("indent", Button, Large, "IndentIncrease", "Increase indent", "indent", Some("Ctrl+M")),
                        Control::new("line-spacing", Select, Large, "", "Paragraph line spacing", "lineSpacing", None),
                        Control::new("text-direction", Select, Large, "", "Text direction", "setTextDirection", None),
                        Control::new("align-left", Button, Small, "AlignLeft", "Align left", "alignLeft", Some("Ctrl+L")).toggled(),
                        Control::new("align-center", Button, Small, "AlignCenter", "Align center", "alignCenter", Some("Ctrl+E")).toggled(),
                        Control::new("align-right", Button, Small, "AlignRight", "Align right", "alignRight", Some("Ctrl+R")).toggled(),
                        Control::new("align-justify", Button, Small, "AlignJustify", "Justified", "alignJustify", Some("Ctrl+J")).toggled(),
                        Control::new("nonprinting", Button, Small, "Eye", "Nonprinting characters", "toggleNonprinting", Some("Ctrl+Shift+8")),
                        Control::new("shading", Button, Small, "PaintBucket", "Shading", "shading", None),
                        Control::new("borders", Button, Small, "Square", "Borders", "borders", None),
                    ],
                },
                // <ts group id> styles
                Group {
                    id: "styles",
                    label: "Styles",
                    controls: vec![
                        Control::new("blockquote", Button, Small, "TextQuote", "Quote", "blockquote", None),
                        Control::new("code-block", Button, Small, "Code2", "Code", "codeBlock", None),
                    ],
                },
                // <ts group id> editing
                Group {
                    id: "editing",
                    label: "Editing",
                    controls: vec![
                        Control::new("find", Button, Small, "Search", "Find", "find", Some("Ctrl+F")),
                        Control::new("replace", Button, Large, "Replace", "Replace", "replace", Some("Ctrl+H")),
                        Control::new("select-all", Button, Small, "MousePointer", "Select all", "selectAll", Some("Ctrl+A")),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_tabs_structure() {
        let tabs = tabs();
        
        // 10 tabs with correct ids and labels
        assert_eq!(tabs.len(), 10);
        let expected_tabs = vec![
            ("home", "Home"),
            ("insert", "Insert"),
            ("draw", "Draw"),
            ("layout", "Layout"),
            ("references", "References"),
            ("collaboration", "Collaboration"),
            ("protection", "Protection"),
            ("view", "View"),
            ("plugins", "Plugins"),
            ("ai", "AI"),
        ];
        for (i, (expected_id, expected_label)) in expected_tabs.iter().enumerate() {
            assert_eq!(tabs[i].id, *expected_id, "Tab {} id mismatch", i);
            assert_eq!(tabs[i].label, *expected_label, "Tab {} label mismatch", i);
        }
    }

    #[test]
    fn test_home_groups_and_controls() {
        let tabs = tabs();
        let home = tabs.iter().find(|t| t.id == "home").unwrap();
        
        // 5 groups with correct ids
        assert_eq!(home.groups.len(), 5);
        let expected_groups = vec!["clipboard", "font", "paragraph", "styles", "editing"];
        for (i, expected_id) in expected_groups.iter().enumerate() {
            assert_eq!(home.groups[i].id, *expected_id, "Group {} id mismatch", i);
        }
        
        // Control counts per group
        let expected_counts = vec![6, 14, 15, 2, 3];
        for (i, &expected_count) in expected_counts.iter().enumerate() {
            assert_eq!(home.groups[i].controls.len(), expected_count, "Group {} control count mismatch", home.groups[i].id);
        }
        
        // Total controls in Home
        let total_controls: usize = home.groups.iter().map(|g| g.controls.len()).sum();
        assert_eq!(total_controls, 40, "Total Home controls should be 40");
        
        // Exact id sequences per group
        let clipboard_ids = vec!["cut", "copy", "paste", "undo", "redo", "copy-style"];
        assert_eq!(home.groups[0].controls.iter().map(|c| c.id).collect::<Vec<_>>(), clipboard_ids);
        
        let font_ids = vec![
            "increase-font-size", "decrease-font-size", "change-case", "bold", "italic", 
            "underline", "strikethrough", "superscript", "subscript", "font-family", 
            "font-size", "text-color", "highlight-color", "clear-formatting",
        ];
        assert_eq!(home.groups[1].controls.iter().map(|c| c.id).collect::<Vec<_>>(), font_ids);
        
        let paragraph_ids = vec![
            "bullet-list", "ordered-list", "task-list", "multilevel-list", "outdent", 
            "indent", "line-spacing", "text-direction", "align-left", "align-center", 
            "align-right", "align-justify", "nonprinting", "shading", "borders",
        ];
        assert_eq!(home.groups[2].controls.iter().map(|c| c.id).collect::<Vec<_>>(), paragraph_ids);
        
        let styles_ids = vec!["blockquote", "code-block"];
        assert_eq!(home.groups[3].controls.iter().map(|c| c.id).collect::<Vec<_>>(), styles_ids);
        
        let editing_ids = vec!["find", "replace", "select-all"];
        assert_eq!(home.groups[4].controls.iter().map(|c| c.id).collect::<Vec<_>>(), editing_ids);
        
        // No duplicate ids in Home
        let mut all_ids = HashSet::new();
        for group in &home.groups {
            for control in &group.controls {
                assert!(all_ids.insert(control.id), "Duplicate control id: {}", control.id);
            }
        }
        
        // Every label and command non-empty
        for group in &home.groups {
            for control in &group.controls {
                assert!(!control.label.is_empty(), "Empty label for control: {}", control.id);
                assert!(!control.command.is_empty(), "Empty command for control: {}", control.id);
            }
        }
    }

    #[test]
    fn test_large_and_toggled_sets() {
        let tabs = tabs();
        let home = tabs.iter().find(|t| t.id == "home").unwrap();
        
        // Collect large controls
        let large_ids: Vec<&str> = home.groups.iter()
            .flat_map(|g| g.controls.iter())
            .filter(|c| matches!(c.size, Size::Large))
            .map(|c| c.id)
            .collect();
        
        let expected_large = vec![
            "font-family", "font-size", "increase-font-size", "decrease-font-size", 
            "change-case", "bullet-list", "ordered-list", "multilevel-list", 
            "outdent", "indent", "line-spacing", "text-direction", "replace",
        ];
        
        let mut large_ids_sorted = large_ids.clone();
        large_ids_sorted.sort();
        let mut expected_large_sorted = expected_large.clone();
        expected_large_sorted.sort();
        
        assert_eq!(&large_ids_sorted, &expected_large_sorted, "Large set mismatch");
        assert_eq!(large_ids.len(), 13, "Should have exactly 13 large controls");
        
        // Collect toggled controls
        let toggled_ids: Vec<&str> = home.groups.iter()
            .flat_map(|g| g.controls.iter())
            .filter(|c| c.toggleable)
            .map(|c| c.id)
            .collect();
        
        let expected_toggled = vec![
            "bold", "italic", "underline", "strikethrough", "superscript", "subscript",
            "bullet-list", "ordered-list", "task-list", "align-left", "align-center", 
            "align-right", "align-justify",
        ];
        
        let mut toggled_ids_sorted = toggled_ids.clone();
        toggled_ids_sorted.sort();
        let mut expected_toggled_sorted = expected_toggled.clone();
        expected_toggled_sorted.sort();
        
        assert_eq!(&toggled_ids_sorted, &expected_toggled_sorted, "Toggled set mismatch");
        assert_eq!(toggled_ids.len(), 13, "Should have exactly 13 toggled controls");
    }

    #[test]
    fn test_shortcuts() {
        let tabs = tabs();
        let home = tabs.iter().find(|t| t.id == "home").unwrap();
        
        // Every shortcut starts with Ctrl
        for group in &home.groups {
            for control in &group.controls {
                if let Some(shortcut) = control.shortcut {
                    assert!(shortcut.starts_with("Ctrl"), "Shortcut should start with Ctrl: {}", shortcut);
                }
            }
        }
        
        // Count shortcuts (should be 24)
        let shortcut_count = home.groups.iter()
            .flat_map(|g| g.controls.iter())
            .filter(|c| c.shortcut.is_some())
            .count();
        assert_eq!(shortcut_count, 24, "Should have exactly 24 controls with shortcuts");
    }

    #[test]
    fn test_spec_summary() {
        let tabs = tabs();
        let home = tabs.iter().find(|t| t.id == "home").unwrap();
        
        let groups = home.groups.len();
        let controls: usize = home.groups.iter().map(|g| g.controls.len()).sum();
        let large = home.groups.iter()
            .flat_map(|g| g.controls.iter())
            .filter(|c| matches!(c.size, Size::Large))
            .count();
        let toggled = home.groups.iter()
            .flat_map(|g| g.controls.iter())
            .filter(|c| c.toggleable)
            .count();
        
        eprintln!("HOME_SPEC groups={} controls={} large={} toggled={}", groups, controls, large, toggled);
        
        assert_eq!(groups, 5);
        assert_eq!(controls, 40);
        assert_eq!(large, 13);
        assert_eq!(toggled, 13);
    }
}
