//! Property blobs for the OO→WO wasm boundary (PORT-PLAN D2, ORM-03).
//!
//! This module hosts the `Wasm*` serde structs whose camelCase JSON
//! reproduces the OO `asc_C*` / `asc_getX` / `asc_putX` wire schema the OO
//! JS UI is written against, plus the generic `set_property(kind, json)` /
//! `get_property(kind)` pair (the WO name of the OO property-blob
//! formatting path that OO serves as 400+ named getters/setters).
//!
//! Kinds and their backing:
//!
//! | kind          | blob                    | backing                                        |
//! |---------------|-------------------------|------------------------------------------------|
//! | `run`         | `WasmRunFormat`         | run at the document cursor (`DocxRun`)         |
//! | `paragraph`   | `WasmParagraphProperty` | paragraph at the cursor (`DocxParagraphProperties`) |
//! | `border`      | `WasmTextBorders`       | paragraph borders (`DocxParagraphBorders`)     |
//! | `color`       | `WasmColor`             | run text color (`DocxRun.color`)               |
//! | `paddings`    | `WasmPaddings`          | per-document property store                    |
//! | `shape`       | `WasmShapeProperty`     | per-document property store                    |
//! | `image`       | `WasmImageProperty`     | per-document property store                    |
//! | `bullet`      | `WasmBullet`            | per-document property store                    |
//! | `pageMargins` | `WasmPageMargins`       | per-document property store                    |
//! | `stroke`      | `WasmStroke`            | per-document property store                    |
//! | `fill`        | `WasmFill`              | per-document property store                    |
//! | `shadow`      | `WasmShadowProperty`    | per-document property store                    |
//! | `rect`        | `WasmRect`              | per-document property store                    |
//!
//! The first four kinds patch the document model at the cursor (typed
//! fields win over the verbatim `rPr`/`pPr` captures, exactly like
//! `apply_formatting`), so they survive a serialize round trip. The rest
//! have no typed document-model target yet: they validate against the
//! struct and round-trip through a per-document store for the life of the
//! handle, but do not serialize into the DOCX.
//!
//! Known wire fields without a model target yet (accepted, not persisted):
//! `WasmParagraphProperty`'s `widowControl` / `contextualSpacing` /
//! `frame` / `canAddTable` / `canAddDropCap` / `locked`,
//! `WasmTextBorders`' `between` / `bar`, and non-srgb `WasmColor` kinds
//! (scheme/tint). They exist on the structs because the OO wire schema
//! carries them; persistence lands when the corresponding wo-ooxml model
//! fields land.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wo_ooxml::model::{
    DocxBlock, DocxBorder, DocxBody, DocxParagraph, DocxParagraphBorders, DocxParagraphProperties,
    DocxRun, LineSpacingRule, TabStop, TabStopKind, TextAlignment, UnderlineType, VerticalAlignment,
};

/// Per-document store for property kinds without a typed document-model
/// target: `(doc_handle, kind)` → canonical JSON blob.
static PROPS_STORE: OnceLock<Mutex<HashMap<(u32, String), String>>> = OnceLock::new();

// ── Color (asc_CColor) ───────────────────────────────────────────────

/// Color kind: OO `asc_CColor.type`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WasmColorKind {
    /// Explicit sRGB color (`hex` / `rgba` set).
    #[default]
    Srgb,
    /// Theme/auto color ("no explicit color" on the OO wire).
    Auto,
    /// Theme scheme accent (see `scheme_id`).
    Scheme,
}

/// One tint/shade modifier (OO `asc_CColor.Mods` entry).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmColorMod {
    /// Modifier name, e.g. "brightness" | "shadow" | "tint".
    pub modifier: String,
    /// Modifier factor (typically 0.0–1.0).
    pub factor: f64,
}

/// OO `asc_CColor` boundary blob.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmColor {
    #[serde(default)]
    pub kind: WasmColorKind,
    /// `#RRGGBB` when `kind` = srgb (OO `value` + r/g/b collapsed).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hex: Option<String>,
    /// r/g/b/a as 0–255 when `kind` = srgb.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rgba: Option<[u8; 4]>,
    /// Scheme accent id when `kind` = scheme (no model target yet).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheme_id: Option<String>,
    /// Tint/shade modifiers (OO `Mods`; no model target yet).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mods: Vec<WasmColorMod>,
}

// ── Paragraph geometry / alignment ───────────────────────────────────

/// OO `asc_getJc` alignment values.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WasmTextAlignment {
    #[default]
    Left,
    Center,
    Right,
    /// Justified (OOXML `w:val="both"`).
    Justify,
}

impl WasmTextAlignment {
    pub fn to_model(self) -> TextAlignment {
        match self {
            WasmTextAlignment::Left => TextAlignment::Left,
            WasmTextAlignment::Center => TextAlignment::Center,
            WasmTextAlignment::Right => TextAlignment::Right,
            WasmTextAlignment::Justify => TextAlignment::Both,
        }
    }

    pub fn from_model(m: TextAlignment) -> Self {
        match m {
            TextAlignment::Left => WasmTextAlignment::Left,
            TextAlignment::Center => WasmTextAlignment::Center,
            TextAlignment::Right => WasmTextAlignment::Right,
            TextAlignment::Both => WasmTextAlignment::Justify,
        }
    }
}

/// Line-spacing rule. `single`/`onePointFive`/`double` encode the standard
/// OOXML at-least forms (240/360/480 twips) when applied.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WasmLineSpacingRule {
    #[default]
    Auto,
    Single,
    OnePointFive,
    Double,
    Exactly,
    AtLeast,
}

impl WasmLineSpacingRule {
    pub fn to_model(self) -> LineSpacingRule {
        match self {
            WasmLineSpacingRule::Auto | WasmLineSpacingRule::Single => LineSpacingRule::Auto,
            WasmLineSpacingRule::OnePointFive | WasmLineSpacingRule::Double => {
                LineSpacingRule::AtLeast
            }
            WasmLineSpacingRule::Exactly => LineSpacingRule::Exact,
            WasmLineSpacingRule::AtLeast => LineSpacingRule::AtLeast,
        }
    }
}

/// The line-spacing value the rule implies when the blob did not carry an
/// explicit `spacing_line`.
fn rule_implies_line(r: WasmLineSpacingRule) -> Option<i32> {
    match r {
        WasmLineSpacingRule::Single => Some(240),
        WasmLineSpacingRule::OnePointFive => Some(360),
        WasmLineSpacingRule::Double => Some(480),
        _ => None,
    }
}

/// Decode the model's (rule, line) pair back to OO rule vocabulary: the
/// standard at-least 360/480 twips forms read back as 1.5x / 2x.
fn spacing_rule_from_model(
    rule: Option<LineSpacingRule>,
    line: Option<i32>,
) -> (Option<WasmLineSpacingRule>, Option<i32>) {
    match rule {
        Some(LineSpacingRule::Exact) => (Some(WasmLineSpacingRule::Exactly), line),
        Some(LineSpacingRule::AtLeast) => match line {
            Some(360) => (Some(WasmLineSpacingRule::OnePointFive), None),
            Some(480) => (Some(WasmLineSpacingRule::Double), None),
            other => (Some(WasmLineSpacingRule::AtLeast), other),
        },
        _ => (Some(WasmLineSpacingRule::Auto), line),
    }
}

/// Tab stop alignment (OOXML `w:val`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WasmTabStopAlign {
    #[default]
    Left,
    Center,
    Right,
    Decimal,
    Bar,
}

impl WasmTabStopAlign {
    pub fn to_model(self) -> TabStopKind {
        match self {
            WasmTabStopAlign::Left => TabStopKind::Left,
            WasmTabStopAlign::Center => TabStopKind::Center,
            WasmTabStopAlign::Right => TabStopKind::Right,
            WasmTabStopAlign::Decimal => TabStopKind::Decimal,
            WasmTabStopAlign::Bar => TabStopKind::Bar,
        }
    }

    pub fn from_model(m: TabStopKind) -> Self {
        match m {
            TabStopKind::Left => WasmTabStopAlign::Left,
            TabStopKind::Center => WasmTabStopAlign::Center,
            TabStopKind::Right => WasmTabStopAlign::Right,
            TabStopKind::Decimal => WasmTabStopAlign::Decimal,
            TabStopKind::Bar => WasmTabStopAlign::Bar,
        }
    }
}

/// OO-style tab stop (`pos` in twips).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmTabStop {
    pub pos: i32,
    #[serde(default)]
    pub align: WasmTabStopAlign,
    /// Leader: "none" | "dot" | "hyphen" | "underscore" | "middleDot".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leader: Option<String>,
}

// ── Shading / borders ────────────────────────────────────────────────

/// OO `asc_CParagraphShd` (OOXML `w:shd`). `fill` persists to
/// `DocxParagraphProperties::shading`; `color`/`pattern` have no model
/// target yet.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmParagraphShd {
    /// Background fill, `#RRGGBB` or "auto".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Pattern name (e.g. "clear", "pct5"); no model target yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
}

/// OOXML `w:val` border styles (OO `asc_CTextBorder` style vocabulary).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WasmBorderStyle {
    #[default]
    None,
    Single,
    Double,
    Dashed,
    Dotted,
    Thick,
    Thin,
    Triple,
    DotDash,
    DotDotDash,
    Hair,
}

impl WasmBorderStyle {
    pub fn to_wire(self) -> &'static str {
        match self {
            WasmBorderStyle::None => "none",
            WasmBorderStyle::Single => "single",
            WasmBorderStyle::Double => "double",
            WasmBorderStyle::Dashed => "dashed",
            WasmBorderStyle::Dotted => "dotted",
            WasmBorderStyle::Thick => "thick",
            WasmBorderStyle::Thin => "thin",
            WasmBorderStyle::Triple => "triple",
            WasmBorderStyle::DotDash => "dotDash",
            WasmBorderStyle::DotDotDash => "dotDotDash",
            WasmBorderStyle::Hair => "hair",
        }
    }

    /// Lenient parse of model-side strings (OOXML lowercase plus the
    /// legacy OO spellings). Unknown styles map to `Single`.
    pub fn from_model(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "none" | "nil" | "" => WasmBorderStyle::None,
            "double" => WasmBorderStyle::Double,
            "dashed" | "dash" => WasmBorderStyle::Dashed,
            "dotted" | "dot" => WasmBorderStyle::Dotted,
            "thick" => WasmBorderStyle::Thick,
            "thin" => WasmBorderStyle::Thin,
            "triple" | "tri" => WasmBorderStyle::Triple,
            "dotdash" | "dashdot" => WasmBorderStyle::DotDash,
            "dotdotdash" | "dashdotdot" => WasmBorderStyle::DotDotDash,
            "hair" => WasmBorderStyle::Hair,
            _ => WasmBorderStyle::Single,
        }
    }
}

/// OO `asc_CTextBorder` (one side; composes into `WasmTextBorders` and
/// maps onto `wo_ooxml::model::DocxBorder`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmBorder {
    pub style: WasmBorderStyle,
    /// Line width in eighths of a point (OO `Size`); 0 = unset.
    pub size: u32,
    /// Border-to-text space in points (OO `Space`); 0 = unset.
    pub space: u32,
    /// `#RRGGBB` / `RRGGBB` or "auto" (theme color).
    pub color: String,
}

impl Default for WasmBorder {
    fn default() -> Self {
        WasmBorder {
            style: WasmBorderStyle::None,
            size: 0,
            space: 0,
            color: "auto".to_string(),
        }
    }
}

impl WasmBorder {
    pub fn to_docx(&self) -> DocxBorder {
        let color = self.color.trim_start_matches('#').to_ascii_uppercase();
        DocxBorder {
            style: self.style.to_wire().to_string(),
            size: if self.size == 0 { None } else { Some(self.size) },
            space: if self.space == 0 { None } else { Some(self.space) },
            color: if color == "AUTO" { None } else { Some(color) },
        }
    }

    pub fn from_docx(b: &DocxBorder) -> Self {
        WasmBorder {
            style: WasmBorderStyle::from_model(&b.style),
            size: b.size.unwrap_or(0),
            space: b.space.unwrap_or(0),
            color: b
                .color
                .clone()
                .map(|c| format!("#{}", c.to_ascii_uppercase()))
                .unwrap_or_else(|| "auto".to_string()),
        }
    }
}

/// Per-side border set (OO `asc_CBorders` / paragraph `w:pBdr`).
/// `between`/`bar` are table-grid notions with no paragraph-model target
/// yet: accepted on the wire, not persisted.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmTextBorders {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<WasmBorder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top: Option<WasmBorder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<WasmBorder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bottom: Option<WasmBorder>,
    /// Cell-grid interior vertical (no model target yet).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub between: Option<WasmBorder>,
    /// Cell-grid interior horizontal (no model target yet).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bar: Option<WasmBorder>,
}

impl WasmTextBorders {
    fn to_docx(&self) -> DocxParagraphBorders {
        DocxParagraphBorders {
            top: self.top.as_ref().map(WasmBorder::to_docx),
            bottom: self.bottom.as_ref().map(WasmBorder::to_docx),
            left: self.left.as_ref().map(WasmBorder::to_docx),
            right: self.right.as_ref().map(WasmBorder::to_docx),
        }
    }

    fn from_docx(b: Option<&DocxParagraphBorders>) -> Self {
        let b = match b {
            Some(b) => b,
            None => return WasmTextBorders::default(),
        };
        WasmTextBorders {
            left: b.left.as_ref().map(WasmBorder::from_docx),
            top: b.top.as_ref().map(WasmBorder::from_docx),
            right: b.right.as_ref().map(WasmBorder::from_docx),
            bottom: b.bottom.as_ref().map(WasmBorder::from_docx),
            between: None,
            bar: None,
        }
    }
}

// ── Paragraph property (asc_CParagraphProperty) ──────────────────────

/// OO `asc_CParagraphSpacing` (stand-alone spacing blob).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmParagraphSpacing {
    /// Before paragraph, twips (or lines when `before_lines` set).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<i32>,
    /// After paragraph, twips (or lines when `after_lines` set).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<i32>,
    /// Line height, twips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_rule: Option<WasmLineSpacingRule>,
    /// Lines-before count (OO `BeforeLines`); no model target yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before_lines: Option<i32>,
    /// Lines-after count (OO `AfterLines`); no model target yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after_lines: Option<i32>,
}

/// OO `asc_CParagraphFrame` — NEW family, no WO model target yet
/// (accepted on the wire, not persisted).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmParagraphFrame {
    /// Frame width, twips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub w: Option<i32>,
    /// Frame height, twips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub h: Option<i32>,
    /// Horizontal position, twips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    /// Vertical position, twips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub behind_text: Option<bool>,
    /// Wrap mode, e.g. "square" | "none".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
}

/// OO `asc_CParagraphProperty` boundary blob — the run/paragraph
/// formatting family of PORT-PLAN D2.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmParagraphProperty {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alignment: Option<WasmTextAlignment>,
    /// Indents in twips (OO `asc_getIndLeft` & friends).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ind_left: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ind_right: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ind_first_line: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ind_hanging: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacing_before: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacing_after: Option<i32>,
    /// Line height, twips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacing_line: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacing_line_rule: Option<WasmLineSpacingRule>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keep_lines: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keep_next: Option<bool>,
    /// No WO model field yet (accepted, not persisted).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub widow_control: Option<bool>,
    /// No WO model field yet (accepted, not persisted).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contextual_spacing: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_break_before: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bidi: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outline_level: Option<u32>,
    /// List/numbering: `w:numId` / `w:ilvl`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub num_id: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ilvl: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tabs: Option<Vec<WasmTabStop>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shd: Option<WasmParagraphShd>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub borders: Option<WasmTextBorders>,
    /// No WO model field yet (accepted, not persisted).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame: Option<WasmParagraphFrame>,
    /// Editing-state flags mirroring the OO constructor (no model target
    /// yet; accepted, not persisted).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub can_add_table: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub can_add_drop_cap: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
}

/// True when at least one model-backed field is present — the caller must
/// drop the verbatim `w:pPr` capture so typed properties win at save time.
impl WasmParagraphProperty {
    fn touches_model(&self) -> bool {
        self.alignment.is_some()
            || self.ind_left.is_some()
            || self.ind_right.is_some()
            || self.ind_first_line.is_some()
            || self.ind_hanging.is_some()
            || self.spacing_before.is_some()
            || self.spacing_after.is_some()
            || self.spacing_line.is_some()
            || self.spacing_line_rule.is_some()
            || self.keep_lines.is_some()
            || self.keep_next.is_some()
            || self.page_break_before.is_some()
            || self.bidi.is_some()
            || self.outline_level.is_some()
            || self.num_id.is_some()
            || self.ilvl.is_some()
            || self.tabs.is_some()
            || self.shd.is_some()
            || self.borders.is_some()
    }

    /// Build the blob from a model paragraph (all model-backed fields
    /// `Some`); editing-state flags stay `None`.
    pub fn from_paragraph(p: &DocxParagraph) -> Self {
        let props: &DocxParagraphProperties = &p.properties;
        let (rule, line) = spacing_rule_from_model(props.spacing_line_rule, props.spacing_line);
        WasmParagraphProperty {
            alignment: props.alignment.map(WasmTextAlignment::from_model),
            ind_left: props.indent_left,
            ind_right: props.indent_right,
            ind_first_line: props.indent_first_line,
            ind_hanging: props.indent_hanging,
            spacing_before: props.spacing_before,
            spacing_after: props.spacing_after,
            spacing_line: line,
            spacing_line_rule: rule,
            keep_lines: Some(props.keep_lines),
            keep_next: Some(props.keep_next),
            widow_control: None,
            contextual_spacing: None,
            page_break_before: Some(props.page_break_before),
            bidi: Some(props.bidi),
            outline_level: props.outline_level,
            num_id: props.num_id,
            ilvl: props.ilvl.map(|v| v as u32),
            tabs: Some(
                props
                    .tab_stops
                    .iter()
                    .map(|t| WasmTabStop {
                        pos: t.pos,
                        align: WasmTabStopAlign::from_model(t.kind),
                        leader: t.leader.clone(),
                    })
                    .collect(),
            ),
            shd: props
                .shading
                .as_ref()
                .map(|fill| WasmParagraphShd {
                    fill: Some(fill.clone()),
                    ..Default::default()
                }),
            borders: Some(WasmTextBorders::from_docx(props.borders.as_ref())),
            frame: None,
            can_add_table: None,
            can_add_drop_cap: None,
            locked: None,
        }
    }
}

// ── Run format (OO CRunFormat) ───────────────────────────────────────

/// Underline style (OO `asc_CUnderline`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WasmUnderlineStyle {
    #[default]
    None,
    Single,
    Double,
    Thick,
    Dotted,
    Dashed,
    DashDot,
    Wave,
}

impl WasmUnderlineStyle {
    pub fn to_model(self) -> UnderlineType {
        match self {
            WasmUnderlineStyle::None => UnderlineType::None,
            WasmUnderlineStyle::Single => UnderlineType::Single,
            WasmUnderlineStyle::Double => UnderlineType::Double,
            WasmUnderlineStyle::Thick => UnderlineType::Thick,
            WasmUnderlineStyle::Dotted => UnderlineType::Dotted,
            WasmUnderlineStyle::Dashed => UnderlineType::Dashed,
            WasmUnderlineStyle::DashDot => UnderlineType::DashDot,
            WasmUnderlineStyle::Wave => UnderlineType::Wave,
        }
    }

    pub fn from_model(m: UnderlineType) -> Self {
        match m {
            UnderlineType::None => WasmUnderlineStyle::None,
            UnderlineType::Single => WasmUnderlineStyle::Single,
            UnderlineType::Double => WasmUnderlineStyle::Double,
            UnderlineType::Thick => WasmUnderlineStyle::Thick,
            UnderlineType::Dotted => WasmUnderlineStyle::Dotted,
            UnderlineType::Dashed => WasmUnderlineStyle::Dashed,
            UnderlineType::DashDot => WasmUnderlineStyle::DashDot,
            UnderlineType::Wave => WasmUnderlineStyle::Wave,
        }
    }
}

/// Vertical alignment (OO `asc_getVertAlign`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WasmVerticalAlignment {
    #[default]
    Baseline,
    Subscript,
    Superscript,
}

impl WasmVerticalAlignment {
    pub fn to_model(self) -> VerticalAlignment {
        match self {
            WasmVerticalAlignment::Baseline => VerticalAlignment::Baseline,
            WasmVerticalAlignment::Subscript => VerticalAlignment::Subscript,
            WasmVerticalAlignment::Superscript => VerticalAlignment::Superscript,
        }
    }

    pub fn from_model(m: VerticalAlignment) -> Self {
        match m {
            VerticalAlignment::Baseline => WasmVerticalAlignment::Baseline,
            VerticalAlignment::Subscript => WasmVerticalAlignment::Subscript,
            VerticalAlignment::Superscript => WasmVerticalAlignment::Superscript,
        }
    }
}

/// OO `CRunFormat` boundary blob (the word UI's run formatting path).
///
/// `font_size` is in **points** (OO `asc_getFontSize` units); the document
/// model stores half-points, so 12 ⇒ `font_size: Some(24)` in the model.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmRunFormat {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<WasmUnderlineStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strikethrough: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub double_strikethrough: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_name: Option<String>,
    /// Font size in points (e.g. 12 == 12pt).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    /// Text color, `#RRGGBB` / `RRGGBB` or "auto".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Highlight color, `#RRGGBB` / `RRGGBB`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub highlight: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub small_caps: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub all_caps: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vertical_alignment: Option<WasmVerticalAlignment>,
    /// When true, reset every run-format field to its default before the
    /// other fields in this blob are applied.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clear_formatting: Option<bool>,
}

impl WasmRunFormat {
    fn touches_model(&self) -> bool {
        self.bold.is_some()
            || self.italic.is_some()
            || self.underline.is_some()
            || self.strikethrough.is_some()
            || self.double_strikethrough.is_some()
            || self.font_name.is_some()
            || self.font_size.is_some()
            || self.color.is_some()
            || self.highlight.is_some()
            || self.small_caps.is_some()
            || self.all_caps.is_some()
            || self.vertical_alignment.is_some()
            || self.clear_formatting.is_some()
    }

    /// Build the blob from a model run (all model-backed fields `Some`).
    pub fn from_run(r: &DocxRun) -> Self {
        WasmRunFormat {
            bold: Some(r.bold),
            italic: Some(r.italic),
            underline: Some(r.underline.map(WasmUnderlineStyle::from_model).unwrap_or_default()),
            strikethrough: Some(r.strikethrough),
            double_strikethrough: Some(r.double_strikethrough),
            font_name: r.font.clone(),
            font_size: r.font_size.map(|hp| hp as f64 / 2.0),
            color: r.color.clone().map(|c| format!("#{}", c.to_ascii_uppercase())),
            highlight: r.highlight.clone().map(|c| format!("#{}", c.to_ascii_uppercase())),
            small_caps: Some(r.small_caps),
            all_caps: Some(r.all_caps),
            vertical_alignment: r.vertical_alignment.map(WasmVerticalAlignment::from_model),
            clear_formatting: None,
        }
    }

    /// Normalize a color string to upper-case `RRGGBB` (no `#`); returns
    /// `None` for "auto"/empty (theme color).
    fn normalize_color(s: &str) -> Option<String> {
        let clean = s.trim().trim_start_matches('#').to_ascii_uppercase();
        if clean.is_empty() || clean == "AUTO" {
            None
        } else {
            Some(clean)
        }
    }
}

// ── Shape / image / page (stored kinds) ──────────────────────────────

/// OO `asc_CPaddings` (float paddings, e.g. for shape content margins).
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmPaddings {
    #[serde(default)]
    pub top: f64,
    #[serde(default)]
    pub right: f64,
    #[serde(default)]
    pub bottom: f64,
    #[serde(default)]
    pub left: f64,
}

/// OO `asc_CRect` (float rectangle).
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmRect {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
}

/// OO `asc_CStroke` (shape outline).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmStroke {
    /// `#RRGGBB` or "auto".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Width in points.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    /// Dash style, e.g. "solid" | "dash" | "dot" | "dashDot".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
}

/// Fill kind (OO `CShapeFill` / OOXML `a:noFill`|`a:solidFill`|…).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WasmFillType {
    None,
    #[default]
    Solid,
    Gradient,
    Picture,
    Pattern,
}

/// OO `asc_CFill`-family fill blob.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmFill {
    #[serde(default)]
    pub fill_type: WasmFillType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<WasmColor>,
    /// 0.0–1.0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
}

/// OO `asc_CShadowProperty`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmShadowProperty {
    /// Offset from the shape origin.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<WasmRect>,
    /// Blur radius, points.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blur: Option<f64>,
    /// Distance from the shape, points.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distance: Option<f64>,
    /// Direction in degrees (0 = right, 90 = down).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<f64>,
    /// `#RRGGBB` or "auto".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

/// OO `asc_CShapeProperty` (top-usage shape-graphics class; 31 UI uses).
/// Stored kind — no shape model in the DOCX body path yet.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmShapeProperty {
    /// Rotation in degrees (clockwise).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flip_horizontal: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flip_vertical: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<WasmStroke>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<WasmFill>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow: Option<WasmShadowProperty>,
    /// Content margins.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paddings: Option<WasmPaddings>,
}

/// OO `asc_CImgProperty` (image crop/size). Stored kind.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmImageProperty {
    /// Display width in points.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    /// Display height in points.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    /// Crop fractions (0.0–1.0) per side.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_left: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_top: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_right: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_bottom: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked_aspect: Option<bool>,
    /// Image source (data URI or part link) when replacing the image.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
}

/// OO `asc_CBullet` (numbering/bullet definition).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmBullet {
    /// Bullet character or literal text.
    pub text: String,
    /// Font name for the bullet character.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    /// Hanging indent, twips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indent: Option<i32>,
}

/// OO `asc_CPageMargins` (all values in twips).
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmPageMargins {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bottom: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gutter: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub footer: Option<i32>,
}

// ── set_property / get_property ──────────────────────────────────────

/// All supported kinds (canonical lowercase spellings; see the module docs
/// for the backing of each). Case-insensitive on input.
pub const PROPERTY_KINDS: [&str; 13] = [
    "run",
    "paragraph",
    "border",
    "color",
    "paddings",
    "shape",
    "image",
    "bullet",
    "pagemargins",
    "stroke",
    "fill",
    "shadow",
    "rect",
];

/// CamelCase display spellings for error messages (OO wire vocabulary).
const KIND_DISPLAY: [&str; 13] = [
    "run",
    "paragraph",
    "border",
    "color",
    "paddings",
    "shape",
    "image",
    "bullet",
    "pageMargins",
    "stroke",
    "fill",
    "shadow",
    "rect",
];

const KIND_SYNONYMS: [(&str, &str); 8] = [
    ("runformat", "run"),
    ("paragraphproperty", "paragraph"),
    ("borders", "border"),
    ("textborder", "border"),
    ("textborders", "border"),
    ("shapeproperty", "shape"),
    ("imageproperty", "image"),
    ("shadowproperty", "shadow"),
];

fn normalize_kind(kind: &str) -> Result<String, String> {
    let k = kind.trim().to_ascii_lowercase();
    if PROPERTY_KINDS.contains(&k.as_str()) {
        return Ok(k);
    }
    for (alias, canonical) in KIND_SYNONYMS {
        if k == alias {
            return Ok(canonical.to_string());
        }
    }
    Err(format!(
        "Unknown property kind: {kind:?} (expected one of: {})",
        KIND_DISPLAY.join(", ")
    ))
}

fn parse_blob<T: serde::de::DeserializeOwned>(
    kind: &str,
    value: &serde_json::Value,
) -> Result<T, String> {
    serde_json::from_value(value.clone()).map_err(|e| format!("Invalid {kind} property blob: {e}"))
}

fn empty_body_err() -> String {
    "Document body is empty".to_string()
}

/// The paragraph block at the document cursor, if the body is non-empty
/// and the cursor sits on a paragraph block.
fn para_at_cursor<'a>(body: &'a DocxBody, doc_handle: u32) -> Option<&'a DocxParagraph> {
    let cursor = super::get_cursor(doc_handle);
    let pidx = cursor.para.min(body.blocks.len().saturating_sub(1));
    match body.blocks.get(pidx)? {
        DocxBlock::Paragraph(p) => Some(p),
        _ => None,
    }
}

/// Index of the run containing `cursor.char_idx` (mirrors
/// `apply_formatting`'s run selection).
fn run_target_index(para: &DocxParagraph, doc_handle: u32) -> Option<usize> {
    if para.runs.is_empty() {
        return None;
    }
    let cursor = super::get_cursor(doc_handle);
    let mut global_c = 0usize;
    for (ri, run) in para.runs.iter().enumerate() {
        let run_len = run.text.chars().count();
        if global_c + run_len > cursor.char_idx || ri == para.runs.len() - 1 {
            return Some(ri);
        }
        global_c += run_len;
    }
    None
}

/// Set a property blob for the run/paragraph at the document cursor.
///
/// `kind` selects the blob family (see `PROPERTY_KINDS`; case-insensitive,
/// a few OO aliases accepted). The JSON is validated against the
/// corresponding `Wasm*` struct; model-backed kinds (`run`, `paragraph`,
/// `border`, `color`) patch the document model at the cursor, and
/// store-backed kinds round-trip through the per-document property store.
///
/// Returns the canonical JSON of the resulting state for that kind (what
/// `get_property` now returns).
#[wasm_bindgen]
pub fn set_property(doc_handle: u32, kind: &str, json: &str) -> Result<String, String> {
    let kind = normalize_kind(kind)?;
    let value: serde_json::Value = serde_json::from_str(json)
        .map_err(|e| format!("Invalid {kind} property JSON: {e}"))?;
    match kind.as_str() {
        "run" => set_run(doc_handle, &value),
        "paragraph" => set_paragraph(doc_handle, &value),
        "border" => set_border(doc_handle, &value),
        "color" => set_color(doc_handle, &value),
        _ => set_stored(doc_handle, &kind, &value),
    }
}

/// Get the current property blob for a kind at the document cursor.
///
/// Model-backed kinds read the model at the cursor and return `{}` when
/// the body is empty or the cursor is not on a paragraph (same convention
/// as `get_run_formatting`). Store-backed kinds return the stored blob or
/// `"null"` when nothing was stored yet.
#[wasm_bindgen]
pub fn get_property(doc_handle: u32, kind: &str) -> Result<String, String> {
    let kind = normalize_kind(kind)?;
    match kind.as_str() {
        "run" => get_run(doc_handle),
        "paragraph" => get_paragraph(doc_handle),
        "border" => get_border(doc_handle),
        "color" => get_color(doc_handle),
        _ => get_stored(doc_handle, &kind),
    }
}

// ── Model-backed kinds ───────────────────────────────────────────────

fn set_run(doc_handle: u32, value: &serde_json::Value) -> Result<String, String> {
    let fmt: WasmRunFormat = parse_blob("run", value)?;
    let mut body = super::extract_body(doc_handle)?;
    if body.blocks.is_empty() {
        return Err(empty_body_err());
    }
    let pidx = super::get_cursor(doc_handle)
        .para
        .min(body.blocks.len() - 1);
    let para = match body.blocks.get_mut(pidx) {
        Some(DocxBlock::Paragraph(p)) => p,
        Some(DocxBlock::Table(_)) => {
            return Err("cursor is inside a table; run properties need a paragraph".to_string())
        }
        _ => return Err(empty_body_err()),
    };
    if para.runs.is_empty() {
        para.runs.push(DocxRun::default());
    }
    let target = run_target_index(para, doc_handle).unwrap_or(para.runs.len() - 1);
    {
        let run = para.runs.get_mut(target).expect("run index checked above");
        // Formatting edits must win at save time: the verbatim rPr
        // capture would shadow the typed properties, so drop it.
        if fmt.touches_model() {
            run.raw_rpr = None;
        }
        if fmt.clear_formatting == Some(true) {
            run.bold = false;
            run.italic = false;
            run.underline = Some(UnderlineType::None);
            run.strikethrough = false;
            run.double_strikethrough = false;
            run.font = None;
            run.font_size = None;
            run.color = None;
            run.highlight = None;
            run.vertical_alignment = None;
            run.small_caps = false;
            run.all_caps = false;
        }
        if let Some(b) = fmt.bold {
            run.bold = b;
        }
        if let Some(i) = fmt.italic {
            run.italic = i;
        }
        if let Some(u) = fmt.underline {
            run.underline = Some(u.to_model());
        }
        if let Some(s) = fmt.strikethrough {
            run.strikethrough = s;
        }
        if let Some(s) = fmt.double_strikethrough {
            run.double_strikethrough = s;
        }
        if let Some(f) = fmt.font_name.clone() {
            run.font = Some(f);
        }
        if let Some(pts) = fmt.font_size {
            run.font_size = Some((pts * 2.0).round() as u32);
        }
        if let Some(c) = fmt.color.clone() {
            run.color = WasmRunFormat::normalize_color(&c);
        }
        if let Some(h) = fmt.highlight.clone() {
            run.highlight = WasmRunFormat::normalize_color(&h);
        }
        if let Some(s) = fmt.small_caps {
            run.small_caps = s;
        }
        if let Some(c) = fmt.all_caps {
            run.all_caps = c;
        }
        if let Some(v) = fmt.vertical_alignment {
            run.vertical_alignment = Some(v.to_model());
        }
    }
    super::store_body(doc_handle, body)?;
    get_run(doc_handle)
}

fn get_run(doc_handle: u32) -> Result<String, String> {
    let body = super::extract_body(doc_handle)?;
    let Some(para) = para_at_cursor(&body, doc_handle) else {
        return Ok("{}".to_string());
    };
    let Some(idx) = run_target_index(para, doc_handle) else {
        return Ok("{}".to_string());
    };
    let blob = WasmRunFormat::from_run(&para.runs[idx]);
    serde_json::to_string(&blob).map_err(|e| format!("JSON error: {e}"))
}

fn set_paragraph(doc_handle: u32, value: &serde_json::Value) -> Result<String, String> {
    let p: WasmParagraphProperty = parse_blob("paragraph", value)?;
    let mut body = super::extract_body(doc_handle)?;
    if body.blocks.is_empty() {
        return Err(empty_body_err());
    }
    let pidx = super::get_cursor(doc_handle).para.min(body.blocks.len() - 1);
    let para = match body.blocks.get_mut(pidx) {
        Some(DocxBlock::Paragraph(p)) => p,
        Some(DocxBlock::Table(_)) => {
            return Err(
                "cursor is inside a table; paragraph properties need a paragraph".to_string(),
            )
        }
        _ => return Err(empty_body_err()),
    };
    {
        // Same rule as `apply_formatting`: an edited paragraph must
        // serialize its typed properties, so the verbatim pPr capture goes.
        if p.touches_model() {
            para.raw_ppr = None;
        }
        let props: &mut DocxParagraphProperties = &mut para.properties;
        if let Some(a) = p.alignment {
            props.alignment = Some(a.to_model());
        }
        if let Some(v) = p.ind_left {
            props.indent_left = Some(v);
        }
        if let Some(v) = p.ind_right {
            props.indent_right = Some(v);
        }
        if let Some(v) = p.ind_first_line {
            props.indent_first_line = Some(v);
        }
        if let Some(v) = p.ind_hanging {
            props.indent_hanging = Some(v);
        }
        if let Some(v) = p.spacing_before {
            props.spacing_before = Some(v);
        }
        if let Some(v) = p.spacing_after {
            props.spacing_after = Some(v);
        }
        if let Some(v) = p.spacing_line {
            props.spacing_line = Some(v);
        }
        if let Some(r) = p.spacing_line_rule {
            props.spacing_line_rule = Some(r.to_model());
            // Rules that imply a fixed line height set it when the blob
            // did not carry an explicit spacing_line.
            if p.spacing_line.is_none() {
                if let Some(implied) = rule_implies_line(r) {
                    props.spacing_line = Some(implied);
                }
            }
        }
        if let Some(v) = p.keep_lines {
            props.keep_lines = v;
        }
        if let Some(v) = p.keep_next {
            props.keep_next = v;
        }
        if let Some(v) = p.page_break_before {
            props.page_break_before = v;
        }
        if let Some(v) = p.bidi {
            props.bidi = v;
        }
        if let Some(v) = p.outline_level {
            props.outline_level = Some(v);
        }
        if let Some(v) = p.num_id {
            props.num_id = Some(v);
        }
        if let Some(v) = p.ilvl {
            props.ilvl = Some(v as u8);
        }
        if let Some(tabs) = &p.tabs {
            props.tab_stops = tabs
                .iter()
                .map(|t| TabStop {
                    pos: t.pos,
                    kind: t.align.to_model(),
                    leader: t.leader.clone(),
                })
                .collect();
        }
        if let Some(shd) = &p.shd {
            props.shading = shd.fill.clone();
        }
        if let Some(borders) = &p.borders {
            let docx = borders.to_docx();
            if docx.top.is_some() || docx.bottom.is_some() || docx.left.is_some() || docx.right.is_some()
            {
                props.borders = Some(docx);
            } else {
                props.borders = None;
            }
        }
    }
    super::store_body(doc_handle, body)?;
    get_paragraph(doc_handle)
}

fn get_paragraph(doc_handle: u32) -> Result<String, String> {
    let body = super::extract_body(doc_handle)?;
    let Some(para) = para_at_cursor(&body, doc_handle) else {
        return Ok("{}".to_string());
    };
    let blob = WasmParagraphProperty::from_paragraph(para);
    serde_json::to_string(&blob).map_err(|e| format!("JSON error: {e}"))
}

fn set_border(doc_handle: u32, value: &serde_json::Value) -> Result<String, String> {
    let borders: WasmTextBorders = parse_blob("border", value)?;
    let mut body = super::extract_body(doc_handle)?;
    if body.blocks.is_empty() {
        return Err(empty_body_err());
    }
    let pidx = super::get_cursor(doc_handle).para.min(body.blocks.len() - 1);
    let para = match body.blocks.get_mut(pidx) {
        Some(DocxBlock::Paragraph(p)) => p,
        Some(DocxBlock::Table(_)) => {
            return Err(
                "cursor is inside a table; borders need a paragraph".to_string(),
            )
        }
        _ => return Err(empty_body_err()),
    };
    {
        // Typed border wins over the verbatim pPr capture.
        if borders.left.is_some()
            || borders.top.is_some()
            || borders.right.is_some()
            || borders.bottom.is_some()
        {
            para.raw_ppr = None;
        }
        let docx = borders.to_docx();
        para.properties.borders = if docx.top.is_some()
            || docx.bottom.is_some()
            || docx.left.is_some()
            || docx.right.is_some()
        {
            Some(docx)
        } else {
            None
        };
    }
    super::store_body(doc_handle, body)?;
    get_border(doc_handle)
}

fn get_border(doc_handle: u32) -> Result<String, String> {
    let body = super::extract_body(doc_handle)?;
    let Some(para) = para_at_cursor(&body, doc_handle) else {
        return Ok("{}".to_string());
    };
    let blob = WasmTextBorders::from_docx(para.properties.borders.as_ref());
    serde_json::to_string(&blob).map_err(|e| format!("JSON error: {e}"))
}

fn set_color(doc_handle: u32, value: &serde_json::Value) -> Result<String, String> {
    let color: WasmColor = parse_blob("color", value)?;
    let mut body = super::extract_body(doc_handle)?;
    if body.blocks.is_empty() {
        return Err(empty_body_err());
    }
    let pidx = super::get_cursor(doc_handle).para.min(body.blocks.len() - 1);
    let para = match body.blocks.get_mut(pidx) {
        Some(DocxBlock::Paragraph(p)) => p,
        Some(DocxBlock::Table(_)) => {
            return Err("cursor is inside a table; color needs a paragraph".to_string())
        }
        _ => return Err(empty_body_err()),
    };
    {
        if para.runs.is_empty() {
            para.runs.push(DocxRun::default());
        }
        let target = run_target_index(para, doc_handle).unwrap_or(para.runs.len() - 1);
        let run = para.runs.get_mut(target).expect("run index checked above");
        // Only srgb hex has a model target; "auto" clears the color.
        match (color.kind, color.hex.clone()) {
            (WasmColorKind::Srgb, Some(hex)) => {
                run.raw_rpr = None;
                run.color = WasmRunFormat::normalize_color(&hex);
            }
            (WasmColorKind::Auto, _) => {
                run.raw_rpr = None;
                run.color = None;
            }
            // scheme / srgb-without-hex: no model target (documented).
            _ => {}
        }
    }
    super::store_body(doc_handle, body)?;
    get_color(doc_handle)
}

fn get_color(doc_handle: u32) -> Result<String, String> {
    let body = super::extract_body(doc_handle)?;
    let Some(para) = para_at_cursor(&body, doc_handle) else {
        return Ok("{}".to_string());
    };
    let Some(idx) = run_target_index(para, doc_handle) else {
        return Ok("{}".to_string());
    };
    let blob = match &para.runs[idx].color {
        Some(hex) => match WasmRunFormat::normalize_color(hex) {
            Some(c) if c.len() == 6 => {
                let rgba: [u8; 4] = [
                    u8::from_str_radix(&c[0..2], 16).unwrap_or(0),
                    u8::from_str_radix(&c[2..4], 16).unwrap_or(0),
                    u8::from_str_radix(&c[4..6], 16).unwrap_or(0),
                    255,
                ];
                WasmColor {
                    kind: WasmColorKind::Srgb,
                    hex: Some(format!("#{c}")),
                    rgba: Some(rgba),
                    scheme_id: None,
                    mods: Vec::new(),
                }
            }
            other => WasmColor {
                kind: WasmColorKind::Srgb,
                hex: other.map(|c| format!("#{c}")),
                rgba: None,
                scheme_id: None,
                mods: Vec::new(),
            },
        },
        None => WasmColor {
            kind: WasmColorKind::Auto,
            ..Default::default()
        },
    };
    serde_json::to_string(&blob).map_err(|e| format!("JSON error: {e}"))
}

// ── Stored kinds ─────────────────────────────────────────────────────

fn props_store() -> &'static Mutex<HashMap<(u32, String), String>> {
    PROPS_STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn validate_stored(kind: &str, value: &serde_json::Value) -> Result<String, String> {
    // Validate against the blob struct, then re-serialize canonically
    // (unknown keys are dropped, defaults filled in).
    let canonical = match kind {
        "paddings" => serde_json::to_value(parse_blob::<WasmPaddings>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        "shape" => serde_json::to_value(parse_blob::<WasmShapeProperty>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        "image" => serde_json::to_value(parse_blob::<WasmImageProperty>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        "bullet" => serde_json::to_value(parse_blob::<WasmBullet>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        "pagemargins" => serde_json::to_value(parse_blob::<WasmPageMargins>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        "stroke" => serde_json::to_value(parse_blob::<WasmStroke>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        "fill" => serde_json::to_value(parse_blob::<WasmFill>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        "shadow" => serde_json::to_value(parse_blob::<WasmShadowProperty>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        "rect" => serde_json::to_value(parse_blob::<WasmRect>(kind, value)?)
            .map_err(|e| format!("JSON error: {e}"))?,
        _ => unreachable!("kind pre-validated by normalize_kind"),
    };
    Ok(serde_json::to_string(&canonical).map_err(|e| format!("JSON error: {e}"))?)
}

fn set_stored(doc_handle: u32, kind: &str, value: &serde_json::Value) -> Result<String, String> {
    let canonical = validate_stored(kind, value)?;
    props_store()
        .lock()
        .unwrap()
        .insert((doc_handle, kind.to_string()), canonical.clone());
    Ok(canonical)
}

fn get_stored(doc_handle: u32, kind: &str) -> Result<String, String> {
    Ok(props_store()
        .lock()
        .unwrap()
        .get(&(doc_handle, kind.to_string()))
        .cloned()
        .unwrap_or_else(|| "null".to_string()))
}

/// Drop every stored property blob for a released document handle.
/// Called from `release_document`.
pub(crate) fn cleanup(doc_handle: u32) {
    props_store()
        .lock()
        .unwrap()
        .retain(|(h, _), _| *h != doc_handle);
}
