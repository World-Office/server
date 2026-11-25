//! Data-only ribbon types — a Rust mirror of the subset of
//! `packages/editor-common/src/ribbon/types.ts` the PoC needs. No behaviour, no leptos.

/// `RibbonControlType` subset. Home uses only these three kinds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ControlKind {
    Button,
    Select,
    ColorPicker,
}

/// ONLYOFFICE ribbon row placement, measured on the OO golden (census-oo-deep.json, 1600×1000):
/// Large controls sit on the top row (y=68: combos + big buttons), Small on the bottom (y=104: 24×24 icons).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Size {
    Large,
    Small,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Control {
    pub id: &'static str,
    pub kind: ControlKind,
    pub size: Size,
    /// Lucide icon name as in the TS spec (rendered as text in the PoC).
    pub icon: &'static str,
    /// Accessible name / tooltip base.
    pub label: &'static str,
    /// Command dispatched on click (`data-command`).
    pub command: &'static str,
    /// Keyboard shortcut hint, e.g. "Ctrl+B" → tooltip "Bold (Ctrl+B)".
    pub shortcut: Option<&'static str>,
    /// Toggle buttons expose `aria-pressed`.
    pub toggleable: bool,
}

impl Control {
    pub const fn new(
        id: &'static str,
        kind: ControlKind,
        size: Size,
        icon: &'static str,
        label: &'static str,
        command: &'static str,
        shortcut: Option<&'static str>,
    ) -> Self {
        Self { id, kind, size, icon, label, command, shortcut, toggleable: false }
    }

    /// Builder-style: marks the control as a toggle (Bold, Italic, …).
    pub const fn toggled(mut self) -> Self {
        self.toggleable = true;
        self
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Group {
    pub id: &'static str,
    pub label: &'static str,
    pub controls: Vec<Control>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Tab {
    pub id: &'static str,
    pub label: &'static str,
    pub groups: Vec<Group>,
}
