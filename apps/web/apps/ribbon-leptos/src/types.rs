//! Data-only ribbon types — a Rust mirror of `packages/editor-common/src/ribbon/types.ts`.
//! No behaviour, no leptos. Filled by the generated `spec.rs` (tools/gen-ribbon-spec.mjs).

/// Runtime predicates in the TS spec are closures over `RibbonContext`; as data they are a
/// field lookup with a default — `ctx.isEditMode`, `ctx.rulerVisible ?? true`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cond {
    Ctx { field: &'static str, default: bool },
}

impl Cond {
    /// Evaluate against the live context. An unknown field is `false` (a missing optional in TS
    /// is `undefined`, which is falsy) — never a panic: a ribbon must render.
    pub fn eval(&self, ctx: &RibbonContext) -> bool {
        match self {
            Cond::Ctx { field, default } => match *field {
                "isEditMode" => ctx.is_edit_mode,
                "spellcheckEnabled" => ctx.spellcheck_enabled.unwrap_or(*default),
                "trackChangesEnabled" => ctx.track_changes_enabled.unwrap_or(*default),
                "rulerVisible" => ctx.ruler_visible.unwrap_or(*default),
                "gridlinesVisible" => ctx.gridlines_visible.unwrap_or(*default),
                "navigationVisible" => ctx.navigation_visible.unwrap_or(*default),
                "darkDocument" => ctx.dark_document.unwrap_or(*default),
                "differentFirstPage" => ctx.different_first_page.unwrap_or(*default),
                "differentOddEven" => ctx.different_odd_even.unwrap_or(*default),
                _ => false,
            },
        }
    }
}

/// Mirror of `RibbonContext` — only the fields the word spec's predicates read.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RibbonContext {
    pub is_edit_mode: bool,
    pub spellcheck_enabled: Option<bool>,
    pub track_changes_enabled: Option<bool>,
    pub ruler_visible: Option<bool>,
    pub gridlines_visible: Option<bool>,
    pub navigation_visible: Option<bool>,
    pub dark_document: Option<bool>,
    pub different_first_page: Option<bool>,
    pub different_odd_even: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelectOption {
    pub value: &'static str,
    pub label: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DropdownItem {
    pub id: &'static str,
    pub label: &'static str,
    pub command: Option<&'static str>,
}

/// The control kinds the word spec uses (`RibbonControlType` minus split-button, which word does not use).
/// Separator/Spacer are part of the shared `RibbonControlType` contract other editors use; the
/// word spec happens not to, so they are kept (data model mirrors types.ts) but unreferenced here.
#[derive(Clone, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Kind {
    Button {
        command: &'static str,
        icon: &'static str,
        shortcut: Option<&'static str>,
        value: Option<&'static str>,
        toggleable: bool,
    },
    Checkbox {
        command: Option<&'static str>,
        checked_when: Cond,
    },
    Select {
        options: Vec<SelectOption>,
        value: &'static str,
        command: Option<&'static str>,
    },
    ColorPicker {
        color: &'static str,
        command: &'static str,
    },
    Dropdown {
        icon: Option<&'static str>,
        items: Vec<DropdownItem>,
    },
    Separator,
    Spacer,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Control {
    pub id: &'static str,
    pub label: Option<&'static str>,
    pub tooltip: Option<&'static str>,
    /// Runtime visibility; `None` = always visible.
    pub when: Option<Cond>,
    pub kind: Kind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Group {
    pub id: &'static str,
    pub label: &'static str,
    pub when: Option<Cond>,
    pub controls: Vec<Control>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Tab {
    pub id: &'static str,
    pub label: &'static str,
    pub when: Option<Cond>,
    pub groups: Vec<Group>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cond_evaluates_field_with_default() {
        let on = RibbonContext {
            is_edit_mode: true,
            ruler_visible: Some(true),
            ..Default::default()
        };
        let off = RibbonContext::default();
        assert!(Cond::Ctx {
            field: "isEditMode",
            default: false
        }
        .eval(&on));
        assert!(
            !Cond::Ctx {
                field: "isEditMode",
                default: true
            }
            .eval(&off),
            "isEditMode is a required bool, default must not apply"
        );
        assert!(
            Cond::Ctx {
                field: "rulerVisible",
                default: true
            }
            .eval(&off),
            "missing optional → default"
        );
        assert!(Cond::Ctx {
            field: "rulerVisible",
            default: true
        }
        .eval(&on));
        assert!(!Cond::Ctx {
            field: "trackChangesEnabled",
            default: false
        }
        .eval(&off));
        assert!(
            !Cond::Ctx {
                field: "noSuchField",
                default: true
            }
            .eval(&on),
            "unknown field is falsy, never panics"
        );
    }

    #[test]
    fn control_is_plain_data() {
        let b = Control {
            id: "x",
            label: None,
            tooltip: None,
            when: None,
            kind: Kind::Button {
                command: "bold",
                icon: "Bold",
                shortcut: None,
                value: None,
                toggleable: true,
            },
        };
        assert_eq!(b.id, "x");
    }
}
