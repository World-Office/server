use serde::{Deserialize, Deserializer, Serialize, Serializer};
use wo_common::units;

/// OOXML format type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OoxmlFormat {
    /// Word Document (.docx)
    Docx,
    /// Excel Spreadsheet (.xlsx)
    Xlsx,
    /// PowerPoint Presentation (.pptx)
    Pptx,
    /// Unknown OOXML format
    Unknown,
}

impl<'de> Deserialize<'de> for OoxmlFormat {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(match s.to_lowercase().as_str() {
            "docx" => OoxmlFormat::Docx,
            "xlsx" => OoxmlFormat::Xlsx,
            "pptx" => OoxmlFormat::Pptx,
            _ => OoxmlFormat::Unknown,
        })
    }
}

impl Serialize for OoxmlFormat {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(match self {
            OoxmlFormat::Docx => "docx",
            OoxmlFormat::Xlsx => "xlsx",
            OoxmlFormat::Pptx => "pptx",
            OoxmlFormat::Unknown => "unknown",
        })
    }
}

impl std::fmt::Display for OoxmlFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OoxmlFormat::Docx => write!(f, "docx"),
            OoxmlFormat::Xlsx => write!(f, "xlsx"),
            OoxmlFormat::Pptx => write!(f, "pptx"),
            OoxmlFormat::Unknown => write!(f, "unknown"),
        }
    }
}

/// Parsed OOXML document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OoxmlDocument {
    /// Document type (DOCX, XLSX, PPTX).
    pub format: OoxmlFormat,
    /// OOXML version.
    pub version: String,
    /// Content types from [Content_Types].xml.
    pub content_types: Vec<ContentTypeEntry>,
    /// Main document part path (e.g., "word/document.xml").
    pub main_part: Option<String>,
    /// Shared strings (for XLSX).
    pub shared_strings: Vec<String>,
    /// Number of sheets/slides.
    pub part_count: u32,
    /// Core properties metadata.
    pub core_properties: CoreProperties,
    /// Relationships.
    pub relationships: Vec<Relationship>,
    /// Document body (DOCX only).
    pub docx_body: Option<DocxBody>,
    /// XLSX workbook (XLSX only).
    pub xlsx_workbook: Option<XlsxWorkbook>,
}

/// A content type entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentTypeEntry {
    pub extension: String,
    pub content_type: String,
}

/// Core properties from docProps/core.xml.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CoreProperties {
    pub title: Option<String>,
    pub creator: Option<String>,
    pub subject: Option<String>,
    pub description: Option<String>,
    pub keywords: Option<String>,
    pub language: Option<String>,
    pub last_modified_by: Option<String>,
    pub created: Option<String>,
    pub modified: Option<String>,
    pub category: Option<String>,
    pub revision: Option<String>,
}

/// A relationship entry from _rels/.rels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    pub id: String,
    pub rel_type: String,
    pub target: String,
    pub target_mode: Option<String>,
}

// --- XLSX Models ---

/// XLSX workbook structure.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxWorkbook {
    /// Workbook-level properties.
    pub properties: XlsxWorkbookProperties,
    /// Sheets in this workbook.
    pub sheets: Vec<XlsxSheet>,
    /// Shared strings table.
    pub shared_strings: Vec<String>,
    /// Styles (number formats, fonts, fills, borders).
    pub styles: XlsxStyles,
    /// Defined names (named ranges).
    pub defined_names: Vec<XlsxDefinedName>,
}

/// Workbook properties.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxWorkbookProperties {
    pub date_1904: bool,
    pub view: Option<String>,
    pub active_tab: Option<usize>,
    pub first_sheet: Option<usize>,
    /// `fileSharing` (ORM-06) — the shared-workbook guard rails.
    pub file_sharing: Option<XlsxFileSharing>,
    /// `workbookProtection` (ORM-06) — workbook lock flags + password hash.
    pub workbook_protection: Option<XlsxWorkbookProtection>,
}

/// `workbookProtection` (CT_WorkbookProtection, ORM-06): the workbook-level
/// lock flags plus the password hash — either the legacy hashed attribute
/// or the modern agile-encryption block (`algorithmName`/`hashValue`/
/// `saltValue`/`spinCount`). Dropping this silently unlocks a protected
/// workbook on round trip.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxWorkbookProtection {
    /// `lockStructure` — structure edits (add/remove/move/rename sheets,
    /// window management) are locked.
    pub lock_structure: Option<bool>,
    /// `lockWindows` — window size/position is locked.
    pub lock_windows: Option<bool>,
    /// `lockRevision` — change-tracking revisions are locked.
    pub lock_revision: Option<bool>,
    /// `workbookPassword` — legacy (reversible) password hash.
    pub workbook_password: Option<String>,
    /// `workbookPasswordCRC` — CRC-32 of the workbook password.
    pub workbook_password_crc: Option<u32>,
    /// `algorithmName` — modern password hash algorithm (e.g. `SHA-512`).
    pub algorithm_name: Option<String>,
    /// `hashValue` — modern password hash (base64).
    pub hash_value: Option<String>,
    /// `saltValue` — modern password salt (base64).
    pub salt_value: Option<String>,
    /// `spinCount` — modern hash iteration count.
    pub spin_count: Option<u32>,
}

/// `fileSharing` (CT_FileSharing, ORM-06): the shared-workbook stamp —
/// the "read-only recommended" open prompt plus the authoring identity.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxFileSharing {
    /// `readOnlyRecommended` — open as read-only unless overridden.
    pub read_only_recommended: Option<bool>,
    /// `userName` — author recorded on the share.
    pub user_name: Option<String>,
    /// `createDateTimeStamp` — when the shared copy was created.
    pub create_date_time_stamp: Option<String>,
}

/// A single worksheet.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxSheet {
    /// Sheet name.
    pub name: String,
    /// Sheet ID (r:id reference).
    pub sheet_id: u32,
    /// Sheet state (visible/hidden/veryHidden).
    pub state: SheetState,
    /// Rows in this sheet.
    pub rows: Vec<XlsxRow>,
    /// Column definitions.
    pub cols: Vec<XlsxCol>,
    /// Merged cell ranges.
    pub merges: Vec<XlsxMergeCell>,
    /// Sheet-level properties.
    pub properties: XlsxSheetProperties,
}

/// Sheet visibility state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum SheetState {
    #[default]
    Visible,
    Hidden,
    VeryHidden,
}

/// Sheet properties.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxSheetProperties {
    pub tab_color: Option<String>,
    pub outline_level: Option<u32>,
    pub zoom_scale: Option<u32>,
    pub zoom_scale_normal: Option<u32>,
    pub zoom_scale_page_layout_view: Option<u32>,
    pub workbook_view_id: Option<u32>,
    /// Print model (pageMargins / pageSetup / headerFooter / breaks).
    pub print: XlsxPrintSettings,
    /// Cell hyperlinks (`<hyperlinks><hyperlink ref="A1" .../>`).
    pub hyperlinks: Vec<XlsxHyperlink>,
    /// Conditional formatting (`<conditionalFormatting sqref=...>` blocks).
    pub conditional_formatting: Vec<XlsxConditionalFormatting>,
    /// Worksheet `<metadata>` block (ORM-06, Excel 365) — the metadata
    /// types plus the `cellMetadata` / `valueMetadata` `<bk>` blocks that
    /// the `c/@cm` and `c/@vm` cell references point into.
    pub metadata: Option<XlsxMetadata>,
    /// Dynamic-array formula records (ORM-06, Excel 365) — cells whose
    /// `f` is a dynamic array (`f[@t="array"]`) with its spill range,
    /// always-calculate flag and cell-metadata link.
    pub dynamic_arrays: Vec<XlsxDynamicArray>,
    /// Rich-value cell references (ORM-06, Excel 365) — the `c/@vm`
    /// value-metadata indexes that wire cells to rich values.
    pub rich_value_refs: Vec<XlsxRichValueRef>,
}

/// A dynamic-array formula record (ORM-06): one cell whose `<f>` carries
/// `t="array"` (Excel 365 dynamic arrays spill into neighbours). Kept at
/// sheet level so the plain `XlsxCell` model stays untouched while the
/// spill semantics survive a round trip.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxDynamicArray {
    /// The anchoring cell reference (e.g. `B3`).
    pub cell_ref: String,
    /// `f/@ref` — the range the array result covers.
    pub ref_range: Option<String>,
    /// `f/@aca` — always-calculate flag (re-spill on every calc).
    pub aca: bool,
    /// `f/@cm` / `c/@cm` — cell-metadata index into the worksheet
    /// `<metadata>` `cellMetadata` blocks.
    pub cm: Option<u32>,
    /// The formula text (e.g. `_xlfn.UNIQUE(A2:A9)`).
    pub formula: String,
}

/// One `c/@vm` value-metadata link (ORM-06): a cell whose value is a rich
/// value (image / formatted object) stored in `xl/richData/richValue.xml`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxRichValueRef {
    /// The cell reference (e.g. `C3`).
    pub cell_ref: String,
    /// The `c/@vm` index into the worksheet `valueMetadata` blocks.
    pub vm: u32,
}

/// One `<rc>` metadata record inside a `<bk>` block: a typed reference
/// into the workbook metadata tables (`t` = record type, `v` = value).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxMetadataRecord {
    /// `t` — metadata record type (1 = dynamic array, 2 = rich value ...).
    pub t: Option<u32>,
    /// `v` — the record value.
    pub v: Option<u32>,
}

/// Worksheet `<metadata>` block (ORM-06, Excel 365): the declared metadata
/// types (e.g. `XLDAPR` for dynamic arrays, `XLRICHVALUE` for rich values)
/// plus the per-index `<bk>` record blocks behind `c/@cm` / `c/@vm`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxMetadata {
    /// `<metadataTypes>` — the declared metadata type names.
    pub metadata_types: Vec<String>,
    /// `<cellMetadata>` — one `<bk>` block per `cm` index.
    pub cell_metadata: Vec<Vec<XlsxMetadataRecord>>,
    /// `<valueMetadata>` — one `<bk>` block per `vm` index.
    pub value_metadata: Vec<Vec<XlsxMetadataRecord>>,
}

/// Worksheet print model (ORM-06 print/PDF parity): page margins, page
/// setup, running header/footer and manual row/column breaks.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxPrintSettings {
    /// `<pageMargins .../>` in inches.
    pub page_margins: Option<XlsxPageMargins>,
    /// `<pageSetup .../>` (paper, orientation, scaling).
    pub page_setup: Option<XlsxPageSetup>,
    /// `<headerFooter>` with its section text parts.
    pub header_footer: Option<XlsxHeaderFooter>,
    /// `<rowBreaks><brk .../>` manual page breaks between rows.
    pub row_breaks: Vec<XlsxBrk>,
    /// `<colBreaks><brk .../>` manual page breaks between columns.
    pub col_breaks: Vec<XlsxBrk>,
}

/// Page margins (CT_PageMargins), all values in inches. Defaults follow
/// ECMA-376 (0.75" sides, 1" top/bottom, 0.5" header/footer).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct XlsxPageMargins {
    pub left: f64,
    pub right: f64,
    pub top: f64,
    pub bottom: f64,
    pub header: f64,
    pub footer: f64,
}

impl Default for XlsxPageMargins {
    fn default() -> Self {
        Self {
            left: 0.75,
            right: 0.75,
            top: 1.0,
            bottom: 1.0,
            header: 0.5,
            footer: 0.5,
        }
    }
}

/// Page setup (CT_PageSetup): paper, orientation and print scaling.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxPageSetup {
    /// Paper size code (9 = A4, 1 = Letter, ...).
    pub paper_size: Option<u32>,
    /// "portrait" | "landscape".
    pub orientation: Option<String>,
    /// Print scaling in percent (ignored when fit_to_width/height is set).
    pub scale: Option<u32>,
    /// "overThenDown" | "downThenOver".
    pub page_order: Option<String>,
    /// Fit-to-page columns (`fitToWidth`).
    pub fit_to_width: Option<u32>,
    /// Fit-to-page rows (`fitToHeight`).
    pub fit_to_height: Option<u32>,
    /// First printed page number.
    pub first_page_number: Option<u32>,
    /// Use `first_page_number` instead of automatic numbering.
    pub use_first_page_number: bool,
    /// Print in black and white.
    pub black_and_white: bool,
    /// Print in draft quality.
    pub draft: bool,
    pub horizontal_dpi: Option<u32>,
    pub vertical_dpi: Option<u32>,
    pub copies: Option<u32>,
    /// Printer-settings relationship (`r:id`), if present.
    pub r_id: Option<String>,
}

/// Running header/footer (CT_HeaderFooter). Each part keeps the raw
/// header-footer format code (e.g. `&L&BReport&RPage &P`) so section and
/// font codes survive a round trip verbatim.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxHeaderFooter {
    /// Different header/footer for even pages (`differentOddEven`).
    pub different_odd_even: bool,
    /// Different header/footer for the first page (`differentFirst`).
    pub different_first: bool,
    pub odd_header: Option<String>,
    pub odd_footer: Option<String>,
    pub even_header: Option<String>,
    pub even_footer: Option<String>,
    pub first_header: Option<String>,
    pub first_footer: Option<String>,
}

/// A manual row/column page break (CT_Brk).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxBrk {
    /// Row/column index (1-based) the break sits above/left of.
    pub id: u32,
    pub min: u32,
    pub max: u32,
    /// Manual break (set by the user, not computed).
    pub man: bool,
}

/// A cell hyperlink (CT_Hyperlink). External links carry an `r:id` into
/// the worksheet rels (kept resolved in `target`); internal links use
/// `location` (e.g. "Sheet2!A1") and have no relationship.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxHyperlink {
    /// Cell or range the link is attached to (e.g. "A1", "A1:B2").
    #[serde(rename = "ref")]
    pub ref_range: String,
    /// Relationship id for external targets.
    pub r_id: Option<String>,
    /// External target URL resolved from the worksheet rels part.
    pub target: Option<String>,
    /// Internal location ("Sheet2!A1" or a defined name).
    pub location: Option<String>,
    /// Display text override.
    pub display: Option<String>,
    /// Tooltip text.
    pub tooltip: Option<String>,
}

/// A conditional-formatting block (CT_ConditionalFormatting): one or more
/// rules sharing a `sqref` range list.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxConditionalFormatting {
    /// Sequence of range references (e.g. "A1:A10" or "A1:A10 C3 E5:E9").
    pub sqref: String,
    /// Rules in priority order.
    pub rules: Vec<XlsxConditionalFormatRule>,
}

/// A single conditional-format rule (CT_CfRule). Type-specific payloads
/// (colorScale / dataBar / iconSet) live in `kind`; everything else stays
/// as optional attributes so the remaining rule kinds round-trip too.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxConditionalFormatRule {
    /// "cellIs" | "expression" | "colorScale" | "dataBar" | "iconSet" |
    /// "top10" | "aboveAverage" | "uniqueValues" | "duplicateValues" |
    /// "containsText" | "notContainsText" | "beginsWith" | "endsWith" |
    /// "timePeriod" | "containsBlanks" | "notContainsBlanks" |
    /// "containsErrors" | "notContainsErrors".
    pub rule_type: String,
    /// Rule priority; lower numbers evaluate first.
    pub priority: Option<u32>,
    /// Stop evaluating further rules for cells this rule matches.
    pub stop_if_true: bool,
    /// Index into the styles part `dxfs` collection.
    pub dxf_id: Option<u32>,
    /// Comparison operator (cellIs): "greaterThan", "between", ...
    pub operator: Option<String>,
    /// Matched text (containsText/beginsWith/...).
    pub text: Option<String>,
    /// Date period (timePeriod): "yesterday", "last7Days", ...
    pub time_period: Option<String>,
    /// Top/bottom-N rank (top10).
    pub rank: Option<u32>,
    /// Top/bottom percentage instead of count (top10).
    pub percent: Option<bool>,
    /// Bottom-N instead of top-N (top10).
    pub bottom: Option<bool>,
    /// Above (default) or below average (aboveAverage).
    pub above_average: Option<bool>,
    /// Formula/threshold texts in document order.
    pub formulas: Vec<String>,
    /// Typed payload for the three visual rule kinds.
    pub kind: XlsxConditionalFormatKind,
}

/// Type-specific payload of a CF rule.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum XlsxConditionalFormatKind {
    /// Rule kinds that carry only attributes + formulas.
    #[default]
    Plain,
    /// Three-color (or two-color) gradient scale.
    ColorScale(XlsxColorScale),
    /// In-cell bar chart.
    DataBar(XlsxDataBar),
    /// Icon overlay per threshold bucket.
    IconSet(XlsxIconSet),
}

/// A rule threshold (CT_Cfvo): minimum/maximum/percent/number/formula.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxCfvo {
    /// "num" | "percent" | "max" | "min" | "formula" | "percentile".
    pub cfvo_type: String,
    /// Threshold value/formula (empty for min/max).
    pub val: Option<String>,
    /// Greater-than-or-equal (iconSet buckets, default true).
    pub gte: bool,
}

/// Color scale (CT_ColorScale): `cfvo` thresholds + one color per step.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxColorScale {
    /// 2..=3 thresholds (defaults: min → max).
    pub cfvos: Vec<XlsxCfvo>,
    /// One color per threshold, same length.
    pub colors: Vec<XlsxCfColor>,
}

/// Data bar (CT_DataBar).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxDataBar {
    /// min + max thresholds.
    pub cfvos: Vec<XlsxCfvo>,
    /// Bar color.
    pub color: Option<XlsxCfColor>,
    /// Shortest bar as percent of the cell width (default 10).
    pub min_length: Option<u32>,
    /// Longest bar as percent of the cell width (default 90).
    pub max_length: Option<u32>,
    /// Show the cell value next to the bar (default true).
    pub show_value: bool,
}

/// Icon set (CT_IconSet).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxIconSet {
    /// Built-in set id (default "3TrafficLights1"): 3Arrows, 4RedToBlack,
    /// 5Quarters, ...
    pub icon_set: Option<String>,
    /// Show the cell value next to the icon (default true).
    pub show_value: bool,
    /// Interpret thresholds as percent instead of percentiles.
    pub percent: bool,
    /// Reverse icon order.
    pub reverse: bool,
    /// n thresholds for an n-icon set.
    pub cfvos: Vec<XlsxCfvo>,
}

/// A color reference in CF payloads: ARGB hex (`rgb`), a theme palette
/// entry (+ optional tint) or a legacy indexed palette entry.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxCfColor {
    /// "RRGGBB" or "AARRGGBB".
    pub rgb: Option<String>,
    /// Theme color index.
    pub theme: Option<u32>,
    /// Legacy indexed palette entry.
    pub indexed: Option<u32>,
    /// Tint applied over the theme/indexed base color.
    pub tint: Option<f64>,
}

/// Differential formatting record (CT_Dxf): the style delta a CF rule
/// applies when it matches, referenced via its index in `dxfs`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxDxf {
    pub font: Option<XlsxFont>,
    pub num_fmt: Option<XlsxNumFmt>,
    pub fill: Option<XlsxFill>,
    pub alignment: Option<XlsxAlignment>,
    pub border: Option<XlsxBorder>,
    pub protection: Option<XlsxProtection>,
}

/// A row in a worksheet.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxRow {
    /// Row number (1-based).
    pub r: u32,
    /// Row height.
    pub ht: Option<f64>,
    /// Row visibility.
    pub hidden: bool,
    /// Row style.
    pub s: Option<u32>,
    /// Cells in this row.
    pub cells: Vec<XlsxCell>,
    /// Row span (number of columns this row spans).
    pub spans: Option<String>,
}

/// A cell in a worksheet.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxCell {
    /// Cell reference (e.g., "A1", "B2").
    pub r: String,
    /// Cell type.
    pub t: CellType,
    /// Cell value (raw or shared string index).
    pub v: String,
    /// Style index.
    pub s: Option<u32>,
    /// Formula (if present).
    pub f: Option<String>,
}

/// Cell data type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum CellType {
    /// Number
    #[default]
    N,
    /// Shared string (index into shared strings table)
    S,
    /// String (inline)
    Str,
    /// Boolean
    B,
    /// Error
    E,
    /// Date
    D,
    /// Empty/unknown
    InlineStr,
}

/// Column definition.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxCol {
    /// Minimum column index (1-based).
    pub min: u32,
    /// Maximum column index (1-based).
    pub max: u32,
    /// Column width.
    pub width: Option<f64>,
    /// Column style.
    pub style: Option<u32>,
    /// Column visibility.
    pub hidden: bool,
    /// Best fit.
    pub best_fit: bool,
    /// Custom width.
    pub custom_width: bool,
}

/// Merged cell range.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxMergeCell {
    /// Reference (e.g., "A1:B2").
    pub ref_range: String,
}

/// Styles collection.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxStyles {
    /// Number formats.
    pub num_fmts: Vec<XlsxNumFmt>,
    /// Fonts.
    pub fonts: Vec<XlsxFont>,
    /// Fills.
    pub fills: Vec<XlsxFill>,
    /// Borders.
    pub borders: Vec<XlsxBorder>,
    /// Cell style formats.
    pub cell_style_xfs: Vec<XlsxCellStyleXf>,
    /// Cell formats.
    pub cell_xfs: Vec<XlsxCellXf>,
    /// Differential formats (CF rule styles), indexed by dxfId.
    pub dxfs: Vec<XlsxDxf>,
}

/// Number format.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxNumFmt {
    /// Format code.
    pub format_code: String,
    /// Format ID.
    pub num_fmt_id: u32,
}

/// Font definition.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxFont {
    /// Font name.
    pub name: Option<String>,
    /// Font size.
    pub sz: Option<f64>,
    /// Bold.
    pub b: bool,
    /// Italic.
    pub i: bool,
    /// Underline.
    pub u: Option<String>,
    /// Strikethrough.
    pub strike: bool,
    /// Color.
    pub color: Option<String>,
}

/// Fill definition.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxFill {
    /// Pattern type.
    pub pattern_type: Option<String>,
    /// Foreground color.
    pub fg_color: Option<String>,
    /// Background color.
    pub bg_color: Option<String>,
}

/// Border definition.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxBorder {
    /// Left border.
    pub left: Option<XlsxBorderSide>,
    /// Right border.
    pub right: Option<XlsxBorderSide>,
    /// Top border.
    pub top: Option<XlsxBorderSide>,
    /// Bottom border.
    pub bottom: Option<XlsxBorderSide>,
    /// Diagonal border.
    pub diagonal: Option<XlsxBorderSide>,
}

/// Border side definition.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxBorderSide {
    /// Style.
    pub style: Option<String>,
    /// Color.
    pub color: Option<String>,
}

/// Cell style format (XF).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxCellStyleXf {
    /// Number format ID.
    pub num_fmt_id: Option<u32>,
    /// Font ID.
    pub font_id: Option<u32>,
    /// Fill ID.
    pub fill_id: Option<u32>,
    /// Border ID.
    pub border_id: Option<u32>,
    /// Apply number format.
    pub apply_number_format: bool,
    /// Apply font.
    pub apply_font: bool,
    /// Apply fill.
    pub apply_fill: bool,
    /// Apply border.
    pub apply_border: bool,
    /// Apply alignment.
    pub apply_alignment: bool,
    /// Apply protection.
    pub apply_protection: bool,
}

/// Cell format (XF).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxCellXf {
    /// Number format ID.
    pub num_fmt_id: Option<u32>,
    /// Font ID.
    pub font_id: Option<u32>,
    /// Fill ID.
    pub fill_id: Option<u32>,
    /// Border ID.
    pub border_id: Option<u32>,
    /// Alignment.
    pub alignment: Option<XlsxAlignment>,
    /// Protection.
    pub protection: Option<XlsxProtection>,
}

/// Cell alignment.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxAlignment {
    /// Horizontal alignment.
    pub horizontal: Option<String>,
    /// Vertical alignment.
    pub vertical: Option<String>,
    /// Text rotation.
    pub text_rotation: Option<i32>,
    /// Wrap text.
    pub wrap_text: bool,
    /// Indent.
    pub indent: Option<u32>,
    /// Shrink to fit.
    pub shrink_to_fit: bool,
}

/// Cell protection.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxProtection {
    /// Locked.
    pub locked: bool,
    /// Hidden.
    pub hidden: bool,
}

/// Defined name (named range).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxDefinedName {
    /// Name.
    pub name: String,
    /// Reference (e.g., "Sheet1!$A$1:$B$2").
    pub ref_range: String,
    /// Comment.
    pub comment: Option<String>,
}

// --- Header/Footer Model ---

/// A header or footer content structure (mirrors DocxBody structure).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct HeaderFooter {
    /// The blocks that make up this header or footer
    pub blocks: Vec<DocxBlock>,
    /// Optional style ID
    pub style_id: Option<String>,
}

impl HeaderFooter {
    pub fn new() -> Self {
        Self {
            blocks: Vec::new(),
            style_id: None,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.blocks.is_empty()
    }
}

/// Section-level properties including header/footer references.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SectionProperties {
    /// Header for first page (if different from default)
    pub header_first: Option<HeaderFooter>,
    /// Header for even pages (if different from default)
    pub header_even: Option<HeaderFooter>,
    /// Header for odd pages / default header
    pub header: Option<HeaderFooter>,
    /// Footer for first page (if different from default)
    pub footer_first: Option<HeaderFooter>,
    /// Footer for even pages (if different from default)
    pub footer_even: Option<HeaderFooter>,
    /// Footer for odd pages / default footer
    pub footer: Option<HeaderFooter>,
    /// Number of columns in this section.
    pub cols: Option<u8>,
}

// --- DOCX Body Model ---

/// A block in the document body - either a paragraph or a table.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
// ponytail: 784B-vs-480B variant spread acceptable for a document AST;
// Box the big variants if enum size shows up in allocations profiles
#[allow(clippy::large_enum_variant)]
pub enum DocxBlock {
    /// A paragraph block
    Paragraph(DocxParagraph),
    /// A table block
    Table(DocxTable),
    /// An image block
    Image(DocxImage),
}

/// A comment thread entry from word/comments.xml and word/commentsExtended.xml.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Comment {
    /// Unique numeric identifier (w:id).
    pub id: String,
    /// Author name (w:author).
    pub author: String,
    /// ISO-8601 date string (w:date).
    pub date: String,
    /// Plain text of the comment body.
    pub text: String,
    /// Whether the thread is marked as resolved/done (from w15:done in commentsExtended.xml).
    #[serde(default)]
    pub resolved: bool,
    /// For reply comments: the parent comment's paraId (w15:paraIdParent in commentsExtended.xml).
    #[serde(default)]
    pub parent_id: Option<String>,
}

// --- DOCX numbering (P2-05, ORM-05 #5) ---------------------------------
//
// Typed `word/numbering.xml` model so a foreign document keeps its own
// numbering definitions (any numFmt, any level text, lvlOverrides) instead
// of collapsing to the fixed 8-abstractNum template the serializer used to
// emit. The template survives as the html->docx fallback.

/// One `w:lvl` inside an `w:abstractNum` definition.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxNumLevel {
    /// Level index (`w:ilvl` attribute).
    pub ilvl: u32,
    /// `w:start` — the value the level starts counting at.
    #[serde(default)]
    pub start: Option<u32>,
    /// `w:numFmt w:val` — decimal, lowerRoman, bullet, none, ...
    #[serde(default)]
    pub num_fmt: Option<String>,
    /// `w:lvlText w:val` — the display mask, e.g. `%1.`, `%1-%2)`, `•`.
    #[serde(default)]
    pub lvl_text: Option<String>,
    /// `w:lvlJc w:val` — level justification (left/center/right).
    #[serde(default)]
    pub lvl_jc: Option<String>,
    /// `w:lvlRestart w:val` — level whose change restarts this level.
    #[serde(default)]
    pub lvl_restart: Option<u32>,
    /// `w:pStyle w:val` — paragraph style linked to this level.
    #[serde(default)]
    pub p_style: Option<String>,
    /// `w:suff w:val` — what follows the number (tab/space/nothing).
    #[serde(default)]
    pub suff: Option<String>,
    /// `w:isLgl` — render with legal (arabic) style regardless of numFmt.
    #[serde(default)]
    pub is_lgl: bool,
    /// `w:ind w:left` from the level's `w:pPr` (twips).
    #[serde(default)]
    pub indent_left: Option<i32>,
    /// `w:ind w:hanging` from the level's `w:pPr` (twips).
    #[serde(default)]
    pub indent_hanging: Option<i32>,
    /// `w:ind w:firstLine` from the level's `w:pPr` (twips).
    #[serde(default)]
    pub indent_first_line: Option<i32>,
}

impl DocxNumLevel {
    /// True when the level renders as a bullet glyph rather than a counter
    /// (numFmt `bullet`, or `none` — the marker is the only visual).
    pub fn is_bullet(&self) -> bool {
        matches!(self.num_fmt.as_deref(), Some("bullet") | Some("none"))
    }
}

/// A `w:lvlOverride` inside a `w:num` — per-instance level patch.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxLvlOverride {
    /// Level being overridden (`w:ilvl` attribute).
    pub ilvl: u32,
    /// `w:startOverride w:val` — restart this level at N for this num.
    #[serde(default)]
    pub start_override: Option<u32>,
}

/// A `w:abstractNum` — the numbering *definition* (levels + formats).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxAbstractNum {
    /// `w:abstractNumId` attribute.
    pub abstract_num_id: u32,
    /// `w:multiLevelType w:val` — singleLevel / multilevel / hybridMultilevel.
    #[serde(default)]
    pub multi_level_type: Option<String>,
    /// `w:name w:val` — abstractNum display name.
    #[serde(default)]
    pub name: Option<String>,
    /// `w:styleLink w:val` — links a numbering style to this definition.
    #[serde(default)]
    pub style_link: Option<String>,
    /// `w:numStyleLink w:val` — indirect link through a numbering style.
    #[serde(default)]
    pub num_style_link: Option<String>,
    /// Level definitions in ascending `w:ilvl` order.
    #[serde(default)]
    pub levels: Vec<DocxNumLevel>,
}

/// A `w:num` — a concrete list instance (numId) bound to a definition.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxNum {
    /// `w:numId` attribute — what `w:numPr/w:numId` references.
    pub num_id: u32,
    /// `w:abstractNumId w:val` — the definition this instance uses.
    pub abstract_num_id: u32,
    /// `w:lvlOverride` patches (per level).
    #[serde(default)]
    pub level_overrides: Vec<DocxLvlOverride>,
}

/// Typed content of `word/numbering.xml` (P2-05). Captured at parse time
/// and re-emitted verbatim-by-construction so foreign numbering survives a
/// docx -> docx round trip.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxNumbering {
    /// Every `w:abstractNum` definition, in document order.
    #[serde(default)]
    pub abstract_nums: Vec<DocxAbstractNum>,
    /// Every `w:num` instance (numId -> abstractNumId), in document order.
    #[serde(default)]
    pub nums: Vec<DocxNum>,
}

impl DocxNumbering {
    /// True when nothing was captured (parser saw an empty numbering part).
    pub fn is_empty(&self) -> bool {
        self.abstract_nums.is_empty() && self.nums.is_empty()
    }

    /// The `w:num` with this numId.
    pub fn num(&self, num_id: u32) -> Option<&DocxNum> {
        self.nums.iter().find(|n| n.num_id == num_id)
    }

    /// The `w:abstractNum` with this definition id.
    pub fn abstract_num(&self, abstract_num_id: u32) -> Option<&DocxAbstractNum> {
        self.abstract_nums
            .iter()
            .find(|a| a.abstract_num_id == abstract_num_id)
    }

    /// Resolve numId -> abstractNum definition (direct `w:num` link).
    pub fn abstract_num_for(&self, num_id: u32) -> Option<&DocxAbstractNum> {
        let num = self.num(num_id)?;
        self.abstract_num(num.abstract_num_id)
    }

    /// The level definition a paragraph at (numId, ilvl) renders with.
    /// OO rule: a level above the last defined one continues the deepest
    /// definition, so an exact miss falls back to the closest lower level.
    pub fn level_for(&self, num_id: u32, ilvl: u32) -> Option<&DocxNumLevel> {
        let abstract_num = self.abstract_num_for(num_id)?;
        if let Some(exact) = abstract_num.levels.iter().find(|l| l.ilvl == ilvl) {
            return Some(exact);
        }
        abstract_num
            .levels
            .iter()
            .rfind(|l| l.ilvl < ilvl)
    }

    /// `w:startOverride` for (numId, ilvl) — the concrete restart value.
    pub fn start_override(&self, num_id: u32, ilvl: u32) -> Option<u32> {
        self.num(num_id)?
            .level_overrides
            .iter()
            .find(|o| o.ilvl == ilvl)
            .and_then(|o| o.start_override)
    }
}

// --- DOCX bookmarks, sdt, unmanaged parts (P2-06, ORM-05) --------------
//
// Three channels that keep foreign DOCX content alive across a
// parse -> serialize round trip:
//   * bookmarks — w:bookmarkStart / w:bookmarkEnd pairs (typed; the
//     positional markers ride empty runs, the catalogue lives on DocxBody)
//   * sdt — w:sdt content controls (inline: marker runs carrying a verbatim
//     w:sdtPr; block-level: DocxBody::sdt_wraps block ranges)
//   * unmanaged — a bag of zip parts the model does not parse (settings,
//     endnotes, customXml, diagrams, themes, ...) kept byte-identical

/// A document bookmark (`w:bookmarkStart` ... `w:bookmarkEnd` pair).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocxBookmark {
    /// Numeric identifier (`w:id`) shared by the start/end pair.
    pub id: String,
    /// Bookmark name (`w:name`); internal hyperlinks target it via
    /// `w:hyperlink w:anchor`. Absent for anonymous bookmarks.
    #[serde(default)]
    pub name: Option<String>,
}

/// Which bookmark marker a run carries (P2-06). Bookmarks are paragraph
/// siblings in OOXML, so — like comment anchors — the markers ride empty
/// runs to keep their exact position in the run sequence; the serializer
/// emits the bare `w:bookmarkStart` / `w:bookmarkEnd` elements in place.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum BookmarkMarker {
    /// `<w:bookmarkStart w:id=".." w:name=".."/>`.
    Start(DocxBookmark),
    /// `<w:bookmarkEnd w:id=".."/>` — the id matches the opening Start.
    End(String),
}

/// Which sdt (structured document tag / content control) marker a run
/// carries (P2-06). An inline `w:sdt` wraps runs inside a paragraph; the
/// Start marker carries the verbatim `w:sdtPr` metadata subtree (alias,
/// tag, id, placeholder) so it survives a round trip byte-for-byte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SdtMarker {
    /// `<w:sdt><w:sdtPr>…` — opens the content control (pr is verbatim).
    Start {
        /// Verbatim `<w:sdtPr>` subtree (empty string for a bare sdt).
        pr: String,
    },
    /// `</w:sdtContent></w:sdt>` — closes the content control.
    End,
}

/// A block-level `w:sdt` (P2-06) wrapping a contiguous range of body
/// blocks. The serializer re-wraps `blocks[start..=end]` in
/// `<w:sdt><w:sdtPr>…</w:sdtPr><w:sdtContent>…</w:sdtContent></w:sdt>`,
/// so nested wraps nest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocxSdtWrap {
    /// Index of the first wrapped block (inclusive).
    pub start: usize,
    /// Index of the last wrapped block (inclusive).
    pub end: usize,
    /// Verbatim `<w:sdtPr>` subtree (empty string for a bare sdt).
    pub pr: String,
}

/// A zip part the model does not parse (P2-06 unmanaged-parts bag):
/// word/settings.xml, word/endnotes.xml, customXml/*, diagrams, charts,
/// themes, docProps/app.xml, ... Captured byte-for-byte at parse time and
/// re-zipped byte-for-byte at serialize time so foreign content survives.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UnmanagedPart {
    /// Zip entry path (e.g. "word/settings.xml").
    pub name: String,
    /// Raw part bytes (identical to the source archive).
    pub bytes: Vec<u8>,
    /// Content type from the source `[Content_Types].xml` (Override, or
    /// Default by extension). The serializer re-declares it; when absent
    /// the serializer falls back by extension.
    #[serde(default)]
    pub content_type: Option<String>,
}

/// Document body content.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocxBody {
    /// Blocks preserving document order (paragraphs and tables interleaved)
    pub blocks: Vec<DocxBlock>,
    /// Embedded media parts (word/media/*) so converters can emit data-URI
    /// images instead of silently dropping inline graphics.
    #[serde(default)]
    pub media: Vec<MediaPart>,
    /// Image relationships (rId -> word/media target) from document.xml.rels.
    #[serde(default)]
    pub image_rels: Vec<Relationship>,
    /// Hyperlink relationships (rId -> external URL) from document.xml.rels
    /// (LEDGER2: docx->html resolves run hyperlink_rid through these).
    #[serde(default)]
    pub hyperlink_rels: Vec<Relationship>,
    /// Verbatim `word/footnotes.xml` content captured at parse time,
    /// re-emitted unchanged so footnote bodies survive a round trip.
    #[serde(default)]
    pub footnotes_raw: Option<String>,
    /// Verbatim body-level `<w:sectPr>` captured at parse time. When set, the
    /// serializer emits it unchanged before `</w:body>`, so section features
    /// (page size, margins, columns) survive a parse-serialize cycle.
    #[serde(default)]
    pub raw_sect_pr: Option<String>,
    /// Default page header content (from word/headerN.xml via the first
    /// headerReference). Serialized back as word/header1.xml with a fresh
    /// relationship and sectPr reference.
    #[serde(default)]
    pub header: Option<HeaderFooter>,
    /// Default page footer content (from word/footerN.xml).
    #[serde(default)]
    pub footer: Option<HeaderFooter>,
    /// Comment threads parsed from word/comments.xml and word/commentsExtended.xml.
    #[serde(default)]
    pub comments: Vec<Comment>,
    /// Comment anchors: tracks (comment_id, anchor_type) pairs found in document.xml
    /// to preserve the link between comments and their positions in the text.
    /// anchor_type: "start", "end", or "reference".
    #[serde(default)]
    pub comment_anchors: Vec<(String, String)>,
    /// Typed `word/numbering.xml` (P2-05): abstractNum definitions and
    /// numId -> abstractNumId instances, parsed and re-emitted so foreign
    /// numbering (any numFmt / lvlText / lvlOverride) survives round trips.
    #[serde(default)]
    pub numbering: Option<DocxNumbering>,
    /// Catalogue of every bookmark in the document (P2-06), in document
    /// order (body blocks, then header, then footer) — parsed from the
    /// bookmarkStart marker runs. Converters resolve `w:hyperlink w:anchor`
    /// targets against the names here.
    #[serde(default)]
    pub bookmarks: Vec<DocxBookmark>,
    /// Block-level `w:sdt` wrappers (P2-06): verbatim sdtPr metadata
    /// re-applied around contiguous body block ranges on serialize.
    #[serde(default)]
    pub sdt_wraps: Vec<DocxSdtWrap>,
    /// Unmanaged-parts bag (P2-06): zip parts the model does not parse,
    /// kept byte-identical across the round trip.
    #[serde(default)]
    pub unmanaged_parts: Vec<UnmanagedPart>,
}

impl DocxBody {
    /// Create a new empty DocxBody
    pub fn new() -> Self {
        Self {
            footnotes_raw: None,
            header: None,
            footer: None,
            blocks: Vec::new(),
            raw_sect_pr: None,
            comments: Vec::new(),
            comment_anchors: Vec::new(),
            media: Vec::new(),
            image_rels: Vec::new(),
            hyperlink_rels: Vec::new(),
            numbering: None,
            bookmarks: Vec::new(),
            sdt_wraps: Vec::new(),
            unmanaged_parts: Vec::new(),
        }
    }

    /// Build a DocxBody from separate paragraph/table vectors. Conversion
    /// code paths that never interleave content use this; tables follow
    /// paragraphs.
    pub fn from_parts(paragraphs: Vec<DocxParagraph>, tables: Vec<DocxTable>) -> Self {
        let mut blocks: Vec<DocxBlock> = paragraphs.into_iter().map(DocxBlock::Paragraph).collect();
        blocks.extend(tables.into_iter().map(DocxBlock::Table));
        Self {
            footnotes_raw: None,
            blocks,
            raw_sect_pr: None,
            header: None,
            comments: Vec::new(),
            comment_anchors: Vec::new(),
            footer: None,
            media: Vec::new(),
            image_rels: Vec::new(),
            hyperlink_rels: Vec::new(),
            numbering: None,
            bookmarks: Vec::new(),
            sdt_wraps: Vec::new(),
            unmanaged_parts: Vec::new(),
        }
    }

    /// Get all paragraphs in the body (in order)
    pub fn paragraphs(&self) -> Vec<&DocxParagraph> {
        self.blocks
            .iter()
            .filter_map(|b| match b {
                DocxBlock::Paragraph(p) => Some(p),
                DocxBlock::Table(_) => None,
                DocxBlock::Image(_) => None,
            })
            .collect()
    }

    /// Get all paragraphs in the body (in order, mutable)
    pub fn paragraphs_mut(&mut self) -> Vec<&mut DocxParagraph> {
        self.blocks
            .iter_mut()
            .filter_map(|b| match b {
                DocxBlock::Paragraph(p) => Some(p),
                DocxBlock::Table(_) => None,
                DocxBlock::Image(_) => None,
            })
            .collect()
    }

    /// Get all tables in the body (in order)
    pub fn tables(&self) -> Vec<&DocxTable> {
        self.blocks
            .iter()
            .filter_map(|b| match b {
                DocxBlock::Paragraph(_) => None,
                DocxBlock::Table(t) => Some(t),
                DocxBlock::Image(_) => None,
            })
            .collect()
    }

    /// Get all tables in the body (in order, mutable)
    pub fn tables_mut(&mut self) -> Vec<&mut DocxTable> {
        self.blocks
            .iter_mut()
            .filter_map(|b| match b {
                DocxBlock::Paragraph(_) => None,
                DocxBlock::Table(t) => Some(t),
                DocxBlock::Image(_) => None,
            })
            .collect()
    }

    /// Get all images in the body (in order)
    pub fn images(&self) -> Vec<&DocxImage> {
        self.blocks
            .iter()
            .filter_map(|b| match b {
                DocxBlock::Paragraph(_) => None,
                DocxBlock::Table(_) => None,
                DocxBlock::Image(i) => Some(i),
            })
            .collect()
    }

    /// Get all images in the body (in order, mutable)
    pub fn images_mut(&mut self) -> Vec<&mut DocxImage> {
        self.blocks
            .iter_mut()
            .filter_map(|b| match b {
                DocxBlock::Paragraph(_) => None,
                DocxBlock::Table(_) => None,
                DocxBlock::Image(i) => Some(i),
            })
            .collect()
    }

    /// Check if the body is empty
    pub fn is_empty(&self) -> bool {
        self.blocks.is_empty()
    }

    /// Get the number of blocks
    pub fn len(&self) -> usize {
        self.blocks.len()
    }

    /// Get block at index
    pub fn get_block(&self, index: usize) -> Option<&DocxBlock> {
        self.blocks.get(index)
    }

    /// Get block at index (mutable)
    pub fn get_block_mut(&mut self, index: usize) -> Option<&mut DocxBlock> {
        self.blocks.get_mut(index)
    }

    /// Push a paragraph block
    pub fn push_paragraph(&mut self, para: DocxParagraph) {
        self.blocks.push(DocxBlock::Paragraph(para));
    }

    /// Push a table block
    pub fn push_table(&mut self, table: DocxTable) {
        self.blocks.push(DocxBlock::Table(table));
    }
}

/// A paragraph in the document.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxParagraph {
    /// Paragraph style name.
    pub style_id: Option<String>,
    /// Paragraph-level properties (alignment, spacing, indentation).
    pub properties: DocxParagraphProperties,
    /// Runs within this paragraph.
    pub runs: Vec<DocxRun>,
    /// Section properties for this paragraph (if it starts a new section).
    pub section_properties: Option<SectionProperties>,
    /// Verbatim `<w:pPr>` XML captured at parse time. When set, the serializer
    /// emits it verbatim instead of reconstructing the typed properties.
    #[serde(default)]
    pub raw_ppr: Option<String>,
    /// Verbatim `<w:fldSimple>` subtrees captured at parse time (PAGE,
    /// NUMPAGES and friends the typed model cannot represent), re-emitted
    /// unchanged so fields survive a parse-serialize cycle.
    #[serde(default)]
    pub raw_flds: Vec<String>,
    /// Typed fields resolved at parse time (fields engine, P2-03): both
    /// `w:fldSimple` and the complex `w:fldChar` begin/separate/end form
    /// normalize into this list (instruction, kind, cached result, dirty /
    /// locked flags) so converters read fields without re-scraping XML.
    #[serde(default)]
    pub fields: Vec<DocxField>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxParagraphProperties {
    pub alignment: Option<TextAlignment>,
    pub indent_left: Option<i32>,
    pub indent_right: Option<i32>,
    pub indent_first_line: Option<i32>,
    pub indent_hanging: Option<i32>,
    pub spacing_before: Option<i32>,
    pub spacing_after: Option<i32>,
    pub spacing_line: Option<i32>,
    pub spacing_line_rule: Option<LineSpacingRule>,
    pub keep_lines: bool,
    pub keep_next: bool,
    pub page_break_before: bool,
    pub outline_level: Option<u32>,
    /// Tab stops for this paragraph.
    pub tab_stops: Vec<TabStop>,
    /// List/numbering properties
    pub num_id: Option<u32>,
    pub ilvl: Option<u8>,
    /// C2-3: w:startValue — numbering restarts at this value for the
    /// paragraph (the first <li> of an <ol start="N"> carries it).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_value: Option<u32>,
    /// Text direction (left-to-right, right-to-left).
    /// OOXML w:bidi (right-to-left) as a bool.
    pub bidi: bool,
    /// Paragraph-level shading (F-040: w:shd w:fill="...").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shading: Option<String>,
    /// Paragraph-level borders (F-040: w:pBdr).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub borders: Option<DocxParagraphBorders>,
    /// Paragraph-mark revision (P4-D01): `w:pPr/w:rPr/w:ins|w:del|
    /// w:moveFrom|w:moveTo` metadata marking the paragraph mark itself as
    /// inserted / deleted / moved (a whole inserted paragraph carries one,
    /// a whole deleted paragraph a `w:del`). Round-trips verbatim through
    /// `DocxParagraph::raw_ppr`; the typed field is for consumers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paragraph_mark_revision: Option<DocxRevision>,
}

impl DocxParagraphProperties {
    /// Style-chain merge (P2-04): every property set in `over` wins; unset
    /// properties inherit `self`. Compose layers low → high, e.g.
    /// `defaults.overlay(&root).overlay(&style).overlay(&direct)`.
    ///
    /// Toggle flags (`keep_lines`, `keep_next`, `page_break_before`, `bidi`)
    /// have no explicit-off representation in the typed subset, so they use
    /// "set at either layer wins" semantics. Tab stops replace as a set.
    pub fn overlay(&self, over: &Self) -> Self {
        Self {
            alignment: over.alignment.or(self.alignment),
            indent_left: over.indent_left.or(self.indent_left),
            indent_right: over.indent_right.or(self.indent_right),
            indent_first_line: over.indent_first_line.or(self.indent_first_line),
            indent_hanging: over.indent_hanging.or(self.indent_hanging),
            spacing_before: over.spacing_before.or(self.spacing_before),
            spacing_after: over.spacing_after.or(self.spacing_after),
            spacing_line: over.spacing_line.or(self.spacing_line),
            spacing_line_rule: over.spacing_line_rule.or(self.spacing_line_rule),
            keep_lines: self.keep_lines || over.keep_lines,
            keep_next: self.keep_next || over.keep_next,
            page_break_before: self.page_break_before || over.page_break_before,
            outline_level: over.outline_level.or(self.outline_level),
            tab_stops: if over.tab_stops.is_empty() {
                self.tab_stops.clone()
            } else {
                over.tab_stops.clone()
            },
            num_id: over.num_id.or(self.num_id),
            ilvl: over.ilvl.or(self.ilvl),
            start_value: over.start_value.or(self.start_value),
            bidi: self.bidi || over.bidi,
            shading: over.shading.clone().or_else(|| self.shading.clone()),
            borders: over.borders.clone().or_else(|| self.borders.clone()),
            paragraph_mark_revision: over
                .paragraph_mark_revision
                .clone()
                .or_else(|| self.paragraph_mark_revision.clone()),
        }
    }
}

/// Kind of tab stop.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum TabStopKind {
    /// Left-aligned tab (default).
    #[default]
    Left,
    /// Center-aligned tab.
    Center,
    /// Right-aligned tab.
    Right,
    /// Decimal-aligned tab (aligns on decimal point).
    Decimal,
    /// Bar tab (draws a vertical bar).
    Bar,
}

/// A single tab stop definition.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TabStop {
    /// Position of the tab stop in twips.
    pub pos: i32,
    /// Kind of tab stop.
    pub kind: TabStopKind,
    /// Leader character (optional: "dot", "hyphen", "underscore", "middleDot", "none").
    pub leader: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextAlignment {
    Left,
    Center,
    Right,
    Both,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LineSpacingRule {
    Auto,
    Exact,
    AtLeast,
}

/// OMML (Office Math Markup Language) math object carried by a run
/// (P4-D02). The typed model has no math equivalent, so the parser keeps the
/// `m:oMath` subtree — or the whole `m:oMathPara` wrapper for display math —
/// verbatim for a managed round trip, and extracts the linear `m:t` text as
/// the plain-text fallback converters render.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocxMath {
    /// Verbatim subtree captured at parse time: `<m:oMath>…</m:oMath>` for
    /// inline math, the full `<m:oMathPara>…</m:oMathPara>` wrapper
    /// (including `m:oMathParaPr`) for display math. Re-emitted unchanged so
    /// math structure survives a parse-serialize cycle.
    pub verbatim: String,
    /// Linear text: every `m:t` chunk concatenated in document order. This
    /// is what converters render when they cannot lay out OMML.
    pub linear_text: String,
    /// True when the math came wrapped in `m:oMathPara` (display math on its
    /// own paragraph level); false for inline `m:oMath`.
    pub display: bool,
}

/// A run of text with formatting.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxRun {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: Option<UnderlineType>,
    pub strikethrough: bool,
    pub double_strikethrough: bool,
    pub font: Option<String>,
    pub font_size: Option<u32>, // half-points
    pub font_size_cs: Option<u32>,
    pub color: Option<String>, // hex like "FF0000"
    pub highlight: Option<String>,
    pub vertical_alignment: Option<VerticalAlignment>,
    pub small_caps: bool,
    pub all_caps: bool,
    /// Verbatim `<w:rPr>` subtree captured at parse time, re-emitted unchanged
    /// so run properties the typed model cannot represent survive a round trip.
    #[serde(default)]
    pub raw_rpr: Option<String>,
    /// Verbatim `<w:drawing>` subtree captured at parse time, re-emitted
    /// unchanged so inline graphics (images, charts) survive a round trip.
    #[serde(default)]
    pub drawing: Option<String>,
    /// Relationship id (`r:id`) of the enclosing `<w:hyperlink>`, set on every
    /// inner run at parse time; the serializer re-groups consecutive runs
    /// sharing a r:id into a single `<w:hyperlink>` wrapper.
    #[serde(default)]
    pub hyperlink_rid: Option<String>,
    /// Relationship id (`r:embed` on the drawing's blip) of an inline image,
    /// extracted at parse time so converters can resolve it through
    /// `DocxBody::image_rels` + `DocxBody::media` into a data-URI `<img>`.
    #[serde(default)]
    pub image_rid: Option<String>,
    /// Display extents of the inline image (`wp:extent cx/cy` on the
    /// drawing, EMU). Converters map these to CSS pixels (÷9525 @96dpi) so
    /// scaled images keep their size — without them every image renders at
    /// native resolution regardless of the stored scale.
    #[serde(default)]
    pub image_width_emu: Option<u32>,
    #[serde(default)]
    pub image_height_emu: Option<u32>,
    /// `w:id` of a `<w:footnoteReference>` in this run, re-emitted by the
    /// serializer so the reference (and with `footnotes_raw` the body)
    /// survives a round trip.
    #[serde(default)]
    pub footnote_rid: Option<String>,
    /// Comment anchor marker carried by this run (F-102): the range start,
    /// the range end, or the `<w:commentReference>`. Converters fence the
    /// commented runs between a Start and an End+Reference pair; the
    /// serializer re-emits the markers in run order.
    #[serde(default)]
    pub comment_anchor: Option<CommentAnchor>,
    /// Complex-field marker carried by this run (fields engine): a fldChar
    /// begin/separate/end boundary or an instrText chunk. Markers re-emit in
    /// run order so complex fields survive a round trip.
    #[serde(default)]
    pub field: Option<FieldMarker>,
    /// Bookmark marker carried by this run (P2-06): a bookmarkStart /
    /// bookmarkEnd boundary. Runs carrying a marker serialize to the bare
    /// bookmark element, never to a `<w:r>`, so bookmark position survives.
    #[serde(default)]
    pub bookmark: Option<BookmarkMarker>,
    /// sdt (content control) marker carried by this run (P2-06): the open
    /// (with verbatim w:sdtPr) or close of an inline `w:sdt`.
    #[serde(default)]
    pub sdt: Option<SdtMarker>,
    /// Track-change span marker carried by this run (P4-D01): the open
    /// (with author/date/id metadata) or close of a `w:ins` / `w:del` /
    /// `w:moveFrom` / `w:moveTo` span. Marker runs serialize to the bare
    /// wrapper elements — inner runs are emitted inside the wrapper — so
    /// revision spans and their metadata survive a round trip.
    #[serde(default)]
    pub revision: Option<RevisionMarker>,
    /// Verbatim `<w:pict>` subtree captured at parse time (legacy VML
    /// graphics the typed model cannot represent), re-emitted unchanged so
    /// pictures survive a parse-serialize cycle.
    #[serde(default)]
    pub pict: Option<String>,
    /// OMML math object carried by this run (P4-D02): the verbatim
    /// `m:oMath` / `m:oMathPara` subtree plus its linear `m:t` text.
    /// Paragraph-level math becomes a marker run that serializes to the
    /// bare verbatim element (never a `<w:r>`), so math position and
    /// content survive a round trip; `run.text` carries the linear text so
    /// converters render it.
    #[serde(default)]
    pub math: Option<DocxMath>,
    /// Internal bookmark target (`w:hyperlink w:anchor`) of the enclosing
    /// hyperlink, set on every inner run at parse time; the serializer
    /// re-groups consecutive runs sharing an anchor into a single
    /// `<w:hyperlink w:anchor="…">` wrapper and converters map it to
    /// `<a href="#…">`.
    #[serde(default)]
    pub hyperlink_anchor: Option<String>,
}

/// Which comment-range marker a run carries (F-102). The id is the numeric
/// `w:id` shared with the `Comment` entry in `word/comments.xml`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CommentAnchor {
    Start(String),
    End(String),
    Reference(String),
}

/// Complex-field marker carried by a run (fields engine): a `<w:fldChar>`
/// begin/separate/end boundary or a `<w:instrText>` chunk. Runs carrying a
/// marker re-emit their marker in the serializer so complex fields survive a
/// round trip; `run.text` stays empty for them so field plumbing never leaks
/// into rendered output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FieldMarker {
    /// `<w:fldChar w:fldCharType="begin">` — opens a complex field.
    Begin {
        /// `w:dirty="true"` — instructs the consumer to recalculate.
        dirty: bool,
        /// `w:fldLock="true"` — recalculation forbidden.
        locked: bool,
    },
    /// `<w:fldChar w:fldCharType="separate">` — instruction/result boundary.
    Separate,
    /// `<w:fldChar w:fldCharType="end">` — closes the complex field.
    End,
    /// `<w:instrText>` content (instructions may be split across runs).
    Instruction(String),
}

/// Normalized kind of a field instruction (fields engine). Derived from the
/// instruction's first token; unrecognized instructions stay [`FieldKind::Other`]
/// so they still round-trip verbatim.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FieldKind {
    Page,
    NumPages,
    NumChars,
    NumWords,
    Toc,
    Date,
    Time,
    PageRef,
    Ref,
    NoteRef,
    Seq,
    Hyperlink,
    If,
    Formula,
    Other,
}

impl FieldKind {
    /// Normalize a raw instruction (`" PAGE "`, `"TOC \\o \"1-3\""`, ...) to
    /// its kind. Switches (`\\...`) and leading punctuation are ignored.
    pub fn from_instruction(instruction: &str) -> Self {
        let token = instruction
            .split_whitespace()
            .next()
            .unwrap_or("")
            .trim_start_matches(['\\', '*', '@', '#', '\''])
            .to_ascii_uppercase();
        match token.as_str() {
            "PAGE" => FieldKind::Page,
            "NUMPAGES" => FieldKind::NumPages,
            "NUMCHARS" => FieldKind::NumChars,
            "NUMWORDS" => FieldKind::NumWords,
            "TOC" => FieldKind::Toc,
            "DATE" => FieldKind::Date,
            "TIME" => FieldKind::Time,
            "PAGEREF" => FieldKind::PageRef,
            "REF" => FieldKind::Ref,
            "NOTEREF" => FieldKind::NoteRef,
            "SEQ" => FieldKind::Seq,
            "HYPERLINK" => FieldKind::Hyperlink,
            "IF" => FieldKind::If,
            "=" => FieldKind::Formula,
            _ => FieldKind::Other,
        }
    }

    /// Canonical OOXML instruction token for this kind.
    pub fn as_str(&self) -> &'static str {
        match self {
            FieldKind::Page => "PAGE",
            FieldKind::NumPages => "NUMPAGES",
            FieldKind::NumChars => "NUMCHARS",
            FieldKind::NumWords => "NUMWORDS",
            FieldKind::Toc => "TOC",
            FieldKind::Date => "DATE",
            FieldKind::Time => "TIME",
            FieldKind::PageRef => "PAGEREF",
            FieldKind::Ref => "REF",
            FieldKind::NoteRef => "NOTEREF",
            FieldKind::Seq => "SEQ",
            FieldKind::Hyperlink => "HYPERLINK",
            FieldKind::If => "IF",
            FieldKind::Formula => "=",
            FieldKind::Other => "OTHER",
        }
    }
}

/// Which tracked-change span a run belongs to (revisions engine, P4-D01).
/// Maps to the four OOXML track-change wrapper elements: `w:ins`, `w:del`,
/// `w:moveFrom` and `w:moveTo`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RevisionKind {
    /// `<w:ins>` — inserted content.
    Insertion,
    /// `<w:del>` — deleted content (inner runs carry `w:delText`).
    Deletion,
    /// `<w:moveFrom>` — content that was moved away from this position.
    MoveFrom,
    /// `<w:moveTo>` — content that was moved to this position.
    MoveTo,
}

impl RevisionKind {
    /// The OOXML element local name for this revision kind.
    pub fn as_str(&self) -> &'static str {
        match self {
            RevisionKind::Insertion => "ins",
            RevisionKind::Deletion => "del",
            RevisionKind::MoveFrom => "moveFrom",
            RevisionKind::MoveTo => "moveTo",
        }
    }

    /// Map a track-change element local name to its kind (`None` for
    /// non-revision elements such as the moveFrom/moveTo *range* markers).
    pub fn from_local_name(name: &str) -> Option<Self> {
        match name {
            "ins" => Some(RevisionKind::Insertion),
            "del" => Some(RevisionKind::Deletion),
            "moveFrom" => Some(RevisionKind::MoveFrom),
            "moveTo" => Some(RevisionKind::MoveTo),
            _ => None,
        }
    }
}

/// Track-change metadata shared by every OOXML revision element
/// (CT_TrackChange): the revision id, the author who made the change and
/// when. Both `w:ins`/`w:del` spans and the paragraph-mark revision
/// (`w:pPr/w:rPr/w:ins`) normalize into this struct so converters can read
/// author/date without re-scraping XML.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocxRevision {
    /// Kind of change (ins / del / moveFrom / moveTo).
    pub kind: RevisionKind,
    /// `w:id` — revision identifier (unique within the document per
    /// producer, but treated as opaque text here).
    pub id: Option<String>,
    /// `w:author` — who made the change.
    pub author: Option<String>,
    /// `w:date` — when (ISO 8601, e.g. `"2024-01-01T10:00:00Z"`).
    pub date: Option<String>,
}

/// Which part of a revision span a run carries (revisions engine, P4-D01).
/// A `<w:ins>`/`<w:del>`/`<w:moveFrom>`/`<w:moveTo>` span becomes an open
/// marker run, its inner runs, then a close marker run — the same pattern
/// as the sdt markers — so run order (and thus span position) round-trips.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RevisionMarker {
    /// Opens the span; carries the author/date/id metadata.
    Start(DocxRevision),
    /// Closes the span of the given kind (matches the open marker's kind).
    End(RevisionKind),
}

/// A typed document field (fields engine): instruction + cached result. Both
/// the `<w:fldSimple>` shorthand and the complex `<w:fldChar>`
/// begin/separate/end form normalize into this struct at parse time so
/// converters and the editor can read fields without re-scraping XML.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocxField {
    /// Raw instruction text, e.g. `" PAGE "` or `"TOC \\o \"1-3\" \\h"`.
    pub instruction: String,
    /// Normalized instruction kind (first token of `instruction`).
    pub kind: FieldKind,
    /// Cached result text — the run text between `separate` and `end`, or the
    /// fldSimple's inner runs. `None` when the field carries no result at all.
    pub cached_result: Option<String>,
    /// `w:dirty="true"` — recalculate when the document is opened.
    pub dirty: bool,
    /// `w:fldLock="true"` — the cached result must not be recalculated.
    pub locked: bool,
    /// True when captured from the complex (`w:fldChar`) form, false for
    /// `w:fldSimple`.
    pub complex: bool,
}

impl DocxField {
    /// Build a field from an instruction; `kind` is derived from the first
    /// instruction token.
    pub fn new(instruction: impl Into<String>) -> Self {
        let instruction = instruction.into();
        let kind = FieldKind::from_instruction(&instruction);
        Self {
            instruction,
            kind,
            cached_result: None,
            dirty: false,
            locked: false,
            complex: false,
        }
    }

    /// The trimmed instruction token (`" PAGE "` -> `"PAGE"`).
    pub fn instruction_token(&self) -> &str {
        self.instruction.split_whitespace().next().unwrap_or("")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnderlineType {
    Single,
    Double,
    Thick,
    Dotted,
    Dashed,
    DashDot,
    Wave,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VerticalAlignment {
    Baseline,
    Superscript,
    Subscript,
}

/// A table in the document.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxTable {
    pub rows: Vec<DocxTableRow>,
    pub properties: DocxTableProperties,
    /// Verbatim `<w:tblPr>` subtree captured at parse time. When set, the
    /// serializer emits it verbatim instead of the typed properties.
    #[serde(default)]
    pub raw_tbl_pr: Option<String>,
    /// Verbatim `<w:tblGrid>` subtree captured at parse time, re-emitted
    /// unchanged so column definitions (`w:gridCol`) survive a round trip.
    #[serde(default)]
    pub raw_tbl_grid: Option<String>,
}

/// An embedded media part (image bytes straight from the zip).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaPart {
    /// Zip path, e.g. "word/media/image1.png".
    pub name: String,
    pub bytes: Vec<u8>,
}

/// An image in the document body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocxImage {
    pub bytes: Vec<u8>,
    pub width_emu: u32,
    pub height_emu: u32,
    pub wrap_mode: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxTableProperties {
    pub width: Option<i32>,
    pub indent: Option<i32>,
    pub alignment: Option<TextAlignment>,
    pub borders: Option<DocxTableBorders>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxTableBorders {
    pub top: Option<DocxBorder>,
    pub left: Option<DocxBorder>,
    pub bottom: Option<DocxBorder>,
    pub right: Option<DocxBorder>,
    pub inside_h: Option<DocxBorder>,
    pub inside_v: Option<DocxBorder>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocxBorder {
    pub style: String, // single, double, dashed, etc.
    pub size: Option<u32>,
    pub color: Option<String>,
    pub space: Option<u32>,
}

/// Paragraph-level borders (F-040: w:pBdr). Per-side border definition.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxParagraphBorders {
    pub top: Option<DocxBorder>,
    pub bottom: Option<DocxBorder>,
    pub left: Option<DocxBorder>,
    pub right: Option<DocxBorder>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocxTableRow {
    pub cells: Vec<DocxTableCell>,
    pub height: Option<i32>,
    pub is_header: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxTableCell {
    pub paragraphs: Vec<DocxParagraph>,
    pub column_span: u32,
    pub row_span: u32,
    pub width: Option<i32>,
    pub shading: Option<String>,
    /// Verbatim `<w:tcPr>` subtree captured at parse time. When set, the
    /// serializer emits it verbatim instead of the typed cell properties.
    #[serde(default)]
    pub raw_tc_pr: Option<String>,
}

/// Styles from word/styles.xml.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocxStyles {
    pub paragraph_styles: Vec<DocxParagraphStyle>,
    pub character_styles: Vec<DocxCharacterStyle>,
    pub table_styles: Vec<DocxTableStyle>,
    /// `w:docDefaults` (P2-04): the lowest layer of the style chain. Every
    /// resolved paragraph/run property starts from these values.
    #[serde(default)]
    pub defaults: DocxDocDefaults,
    /// `w:latentStyles` (P2-04): Word's built-in-but-undefined styles. They
    /// carry visibility flags only, never formatting.
    #[serde(default)]
    pub latent_styles: DocxLatentStyles,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxParagraphStyle {
    pub style_id: String,
    pub name: Option<String>,
    pub based_on: Option<String>,
    pub properties: DocxParagraphProperties,
    pub run_properties: DocxRunProperties,
    /// `w:default="1"` — the default style of its type (used when body
    /// content names no style).
    #[serde(default)]
    pub default_style: bool,
    /// `w:qFormat` — style shows up in the quick-style gallery.
    #[serde(default)]
    pub q_format: bool,
    /// `w:semiHidden`, `w:locked`, `w:unhideWhenUsed` visibility flags.
    #[serde(default)]
    pub semi_hidden: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub unhide_when_used: bool,
    #[serde(default)]
    pub ui_priority: Option<u32>,
    /// `w:link` — paired character style id.
    #[serde(default)]
    pub link: Option<String>,
    /// `w:next` — style of a following paragraph typed after this one.
    #[serde(default)]
    pub next: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxRunProperties {
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub font: Option<String>,
    pub font_size: Option<u32>,
    pub color: Option<String>,
}

impl DocxRunProperties {
    /// Style-chain merge (P2-04): every property set in `over` wins; unset
    /// properties inherit `self`. Compose layers low → high, e.g.
    /// `defaults.overlay(&root).overlay(&style).overlay(&direct)`.
    pub fn overlay(&self, over: &Self) -> Self {
        Self {
            bold: over.bold.or(self.bold),
            italic: over.italic.or(self.italic),
            font: over.font.clone().or_else(|| self.font.clone()),
            font_size: over.font_size.or(self.font_size),
            color: over.color.clone().or_else(|| self.color.clone()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxCharacterStyle {
    pub style_id: String,
    pub name: Option<String>,
    pub based_on: Option<String>,
    pub properties: DocxRunProperties,
    /// `w:default="1"` — the default character style of its type.
    #[serde(default)]
    pub default_style: bool,
    /// `w:semiHidden`, `w:locked`, `w:unhideWhenUsed` visibility flags.
    #[serde(default)]
    pub semi_hidden: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub unhide_when_used: bool,
    #[serde(default)]
    pub ui_priority: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxTableStyle {
    pub style_id: String,
    pub name: Option<String>,
    /// `w:basedOn` — parent table style (recorded for chain resolution;
    /// table-level property inheritance lands with `CTableStyleProperties`).
    #[serde(default)]
    pub based_on: Option<String>,
    /// `w:default="1"` — the default table style.
    #[serde(default)]
    pub default_style: bool,
}

/// `w:docDefaults` (P2-04): document-wide default run/paragraph properties
/// from `w:rPrDefault`/`w:pPrDefault`. Lowest layer of the style chain —
/// every style overlays these, direct formatting overlays every style.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxDocDefaults {
    pub run_properties: DocxRunProperties,
    pub paragraph_properties: DocxParagraphProperties,
}

/// `w:latentStyles` (P2-04): declarations for Word's built-in styles that
/// are not defined in styles.xml yet. Latent styles carry visibility flags
/// only — resolution never pulls formatting from them.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxLatentStyles {
    /// `w:defSemiHidden` default for every exception below.
    pub def_semi_hidden: bool,
    /// `w:defLockedState`.
    pub def_locked: bool,
    /// `w:defUnhideWhenUsed`.
    pub def_unhide_when_used: bool,
    /// `w:defUiPriority`.
    pub def_ui_priority: Option<u32>,
    /// `w:lsdException` entries, one per built-in style name.
    pub exceptions: Vec<DocxLatentStyleException>,
}

/// One `w:lsdException` inside `w:latentStyles`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxLatentStyleException {
    /// Built-in style *name* (e.g. "Balloon Text") — latentStyles are keyed
    /// by `w:name`, not by styleId.
    pub name: String,
    pub semi_hidden: bool,
    pub locked: bool,
    pub unhide_when_used: bool,
    pub ui_priority: Option<u32>,
}

// --- P2-04: style-chain resolution (docDefaults → basedOn chain → style → direct) ---

/// A fully resolved style chain (P2-04).
///
/// Resolution precedence, lowest → highest:
/// 1. `w:docDefaults` (`rPrDefault` + `pPrDefault`),
/// 2. the `w:basedOn` ancestor chain, root first (each layer overlays the
///    previous; a *nearer* ancestor wins on conflicts via first-defined),
/// 3. the style itself,
/// 4. for runs: an explicit `w:rStyle` character style overlays the
///    paragraph chain,
/// 5. direct formatting (`w:pPr`/`w:rPr` on the paragraph/run itself).
///
/// A style that is absent from styles.xml contributes nothing (only the
/// defaults layer applies) and is flagged via `missing`; a built-in name
/// declared in `w:latentStyles` is recorded in `latent`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxStyleChain {
    /// The style the chain was resolved from (as named by the body).
    pub style_id: Option<String>,
    /// `w:basedOn` ancestry, root ancestor first, the style itself last.
    /// Empty when the style is missing or defines no parent.
    pub ancestry: Vec<String>,
    /// Fully merged paragraph properties (defaults + chain + direct).
    pub paragraph_properties: DocxParagraphProperties,
    /// Fully merged run properties (defaults + chain + character style + direct).
    pub run_properties: DocxRunProperties,
    /// The named style id has no `w:style` definition in styles.xml.
    pub missing: bool,
    /// A `w:basedOn` cycle was cut during resolution (the repeated style is
    /// applied once; ancestors beyond the repeat are dropped).
    pub cycle: bool,
    /// Latent-style declaration matched for this style, if any.
    pub latent: Option<DocxLatentStyleException>,
}

impl DocxStyleChain {
    /// Convenience: the resolved paragraph properties (already includes
    /// defaults, the basedOn chain and the direct layer).
    pub fn paragraph_props(&self) -> &DocxParagraphProperties {
        &self.paragraph_properties
    }

    /// Convenience: the resolved run properties (already includes defaults,
    /// the basedOn chain, the character style and the direct layer).
    pub fn run_props(&self) -> &DocxRunProperties {
        &self.run_properties
    }
}

/// Maximum `w:basedOn` chain depth — guards against pathological (or
/// deliberately cyclic) styles.xml documents.
const DOCX_STYLE_CHAIN_MAX_DEPTH: usize = 64;

impl DocxStyles {
    /// Look up a paragraph style definition by styleId.
    pub fn paragraph_style(&self, style_id: &str) -> Option<&DocxParagraphStyle> {
        self.paragraph_styles.iter().find(|s| s.style_id == style_id)
    }

    fn character_style(&self, style_id: &str) -> Option<&DocxCharacterStyle> {
        self.character_styles.iter().find(|s| s.style_id == style_id)
    }

    /// Latent-style exception by built-in style *name* (exact match).
    pub fn latent_exception(&self, name: &str) -> Option<&DocxLatentStyleException> {
        self.latent_styles
            .exceptions
            .iter()
            .find(|e| e.name == name)
    }

    /// Walk the `w:basedOn` chain from `style_id` upward.
    ///
    /// Returns the ids root-ancestor-first with the style itself last.
    /// Cycles are cut at the first repeat and flagged; `missing` is set when
    /// the starting style has no definition in styles.xml.
    fn paragraph_ancestry(&self, style_id: &str) -> (Vec<String>, bool, bool) {
        let mut chain = Vec::new();
        let mut visited = std::collections::HashSet::new();
        let mut current = Some(style_id.to_string());
        let mut missing = true;
        let mut cycle = false;

        while let Some(id) = current {
            if !visited.insert(id.clone()) || chain.len() >= DOCX_STYLE_CHAIN_MAX_DEPTH {
                cycle = true;
                break;
            }
            let Some(style) = self.paragraph_style(&id) else {
                // A referenced parent is undefined: the chain ends here.
                if !chain.is_empty() {
                    break;
                }
                current = None;
                continue;
            };
            missing = false;
            chain.push(id);
            current = style.based_on.clone();
        }

        chain.reverse(); // root ancestor first, the style itself last
        (chain, missing, cycle)
    }

    /// Walk the `w:basedOn` chain of a character style (same cut rules as
    /// [`DocxStyles::paragraph_ancestry`]).
    fn character_ancestry(&self, style_id: &str) -> Vec<String> {
        let mut chain = Vec::new();
        let mut visited = std::collections::HashSet::new();
        let mut current = Some(style_id.to_string());

        while let Some(id) = current {
            if !visited.insert(id.clone()) || chain.len() >= DOCX_STYLE_CHAIN_MAX_DEPTH {
                break;
            }
            let Some(style) = self.character_style(&id) else {
                break;
            };
            chain.push(id);
            current = style.based_on.clone();
        }

        chain.reverse();
        chain
    }

    /// Resolve the full style chain for a paragraph (P2-04).
    ///
    /// `style_id` is the `w:pStyle` value (may be absent/undefined — the
    /// chain then reduces to docDefaults); `direct` is the paragraph's own
    /// `w:pPr` and wins over every style layer.
    pub fn resolve_paragraph_chain(
        &self,
        style_id: Option<&str>,
        direct: Option<&DocxParagraphProperties>,
    ) -> DocxStyleChain {
        let mut chain = DocxStyleChain {
            style_id: style_id.map(|s| s.to_string()),
            paragraph_properties: self.defaults.paragraph_properties.clone(),
            run_properties: self.defaults.run_properties.clone(),
            ..DocxStyleChain::default()
        };

        if let Some(id) = style_id {
            let (ancestry, missing, cycle) = self.paragraph_ancestry(id);
            chain.ancestry = ancestry;
            chain.missing = missing;
            chain.cycle = cycle;

            for layer_id in &chain.ancestry {
                if let Some(style) = self.paragraph_style(layer_id) {
                    chain.paragraph_properties =
                        chain.paragraph_properties.overlay(&style.properties);
                    chain.run_properties = chain.run_properties.overlay(&style.run_properties);
                }
            }

            // Latent styles are keyed by built-in name; match the id (common
            // shorthand) or the defining style's w:name.
            chain.latent = self
                .latent_exception(id)
                .or_else(|| {
                    self.paragraph_style(id)
                        .and_then(|s| s.name.as_deref())
                        .and_then(|name| self.latent_exception(name))
                })
                .cloned();
        }

        if let Some(direct) = direct {
            chain.paragraph_properties = chain.paragraph_properties.overlay(direct);
        }

        chain
    }

    /// Resolve the full style chain for a run (P2-04).
    ///
    /// Precedence: docDefaults → paragraph style chain → `w:rStyle`
    /// character-style chain → `direct` (the run's own `w:rPr`).
    pub fn resolve_run_chain(
        &self,
        paragraph_style_id: Option<&str>,
        character_style_id: Option<&str>,
        direct: Option<&DocxRunProperties>,
    ) -> DocxStyleChain {
        // Paragraph chain first (its rPr applies to every run inside).
        let mut chain = self.resolve_paragraph_chain(paragraph_style_id, None);

        if let Some(char_id) = character_style_id {
            for layer_id in self.character_ancestry(char_id) {
                if let Some(style) = self.character_style(&layer_id) {
                    chain.run_properties = chain.run_properties.overlay(&style.properties);
                }
            }
            if self.character_style(char_id).is_none() && chain.latent.is_none() {
                chain.latent = self.latent_exception(char_id).cloned();
            }
        }

        if let Some(direct) = direct {
            chain.run_properties = chain.run_properties.overlay(direct);
        }

        chain
    }

    /// Resolved paragraph properties for a style, with `direct` formatting
    /// applied on top (P2-04 convenience wrapper).
    pub fn get_paragraph_props(
        &self,
        style_id: &str,
        direct: &DocxParagraphProperties,
    ) -> DocxParagraphProperties {
        self.resolve_paragraph_chain(Some(style_id), Some(direct))
            .paragraph_properties
    }

    /// Resolved run properties for a paragraph style (+ optional character
    /// style), with `direct` formatting applied on top (P2-04 convenience
    /// wrapper).
    pub fn get_run_props(
        &self,
        style_id: &str,
        character_style_id: Option<&str>,
        direct: &DocxRunProperties,
    ) -> DocxRunProperties {
        self.resolve_run_chain(Some(style_id), character_style_id, Some(direct))
            .run_properties
    }
}

// --- PPTX Presentation Model ---

/// A parsed PPTX presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PptxPresentation {
    pub slide_size: SlideSize,
    pub slides: Vec<Slide>,
    pub slide_masters: Vec<SlideMaster>,
    pub theme: Option<Theme>,
    pub core_properties: CoreProperties,
}

/// A single slide in the presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Slide {
    pub id: u32,
    pub name: String,
    /// ID of the slide layout this slide uses.
    #[serde(default)]
    pub layout_id: Option<String>,
    /// ID of the slide master this slide inherits from.
    #[serde(default)]
    pub master_id: Option<String>,
    pub shapes: Vec<SlideShape>,
    pub notes: Option<String>,
    #[serde(default)]
    pub transition: Option<SlideTransition>,
    #[serde(default)]
    pub animations: Vec<AnimationData>,
    #[serde(default)]
    pub timing_raw: Option<String>,
    #[serde(default)]
    pub background: Option<SlideBackground>,
}

/// Background for a slide (solid, gradient, or image).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideBackground {
    pub background_type: SlideBackgroundType,
    pub color: Option<String>,
    pub gradient_stops: Option<Vec<GradientStop>>,
    pub gradient_angle: Option<f64>,
    pub image_data: Option<Vec<u8>>,
}

/// Background type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SlideBackgroundType {
    None,
    Solid,
    Gradient,
    Image,
}

/// Transition effect types for PPTX slides.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub enum TransitionEffect {
    #[default]
    None,
    Fade,
    Push,
    Wipe,
    Split,
    Reveal,
    Checker,
    Zoom,
    Morph,
    Circle,
    Uncover,
    Cover,
    Flash,
    Random,
    Shred,
    Wedge,
    Wheel,
    Flythrough,
    Excite,
    Dissolve,
    Newsflash,
    Bars,
    Contract,
    Rotate,
    Blast,
    Center,
    Shape,
    ZoomIn,
    ZoomOut,
    CoverIn,
    CoverUp,
    CoverLeft,
    CoverRight,
    PullIn,
    PullUp,
    PullLeft,
    PullRight,
}

/// Per-slide transition settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SlideTransition {
    #[serde(default)]
    pub effect: TransitionEffect,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub advance_mode: AdvanceMode,
    #[serde(default)]
    pub advance_timing: f64,
}

impl Default for SlideTransition {
    fn default() -> Self {
        Self {
            effect: TransitionEffect::None,
            duration: 1.0,
            advance_mode: AdvanceMode::Manual,
            advance_timing: 0.0,
        }
    }
}

/// How the slide advances to the next.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub enum AdvanceMode {
    #[default]
    Manual,
    Timed,
}

/// Animation data for a single shape on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationData {
    pub id: String,
    #[serde(default)]
    pub effect: String,
    #[serde(default)]
    pub category: String,
    /// The ID of the target shape (shape `id` field).
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub start: String,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub delay: f64,
}

/// Shape types that can appear on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SlideShape {
    TextBox(TextBoxShape),
    Picture(PictureShape),
    Placeholder(PlaceholderShape),
    Table(TableShape),
    Connector(ConnectorShape),
    Chart(ChartShape),
    SmartArt(SmartArtShape),
}

/// A table shape on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableShape {
    pub id: String,
    pub bounds: Bounds,
    pub columns: Vec<TableColumn>,
    pub rows: Vec<TableRow>,
}

/// A column definition in a table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableColumn {
    pub width: i64,
}

/// A row in a table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableRow {
    pub height: i64,
    pub cells: Vec<TableCell>,
}

/// A single cell in a table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableCell {
    pub text_body: TextBody,
    pub row_span: Option<i64>,
    pub col_span: Option<i64>,
    pub fill_color: Option<String>,
}

/// A text box shape on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBoxShape {
    pub id: String,
    pub bounds: Bounds,
    pub text_body: TextBody,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<Fill>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<EffectList>,
}

/// An image shape on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PictureShape {
    pub id: String,
    pub bounds: Bounds,
    pub name: String,
    pub image_extension: String,
    pub image_data: Vec<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<EffectList>,
}

/// A placeholder shape (title, subtitle, content).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceholderShape {
    pub id: String,
    pub bounds: Bounds,
    pub placeholder_type: String,
    pub text_body: Option<TextBody>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<Fill>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<EffectList>,
}

/// A connector/cxnSp shape — line with optional arrowheads connecting shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorShape {
    pub id: String,
    pub bounds: Bounds,
    pub connector_type: ConnectorShapeType,
    pub line_width: Option<i64>,
    pub has_start_arrow: bool,
    pub has_end_arrow: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<Fill>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<EffectList>,
}

/// Predefined geometry for connector shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectorShapeType {
    Straight,
    Bent1,
    Bent2,
    Bent3,
    Bent4,
    Curved1,
    Curved2,
    Curved3,
    Curved4,
}

impl std::fmt::Display for ConnectorShapeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConnectorShapeType::Straight => write!(f, "straightConnector1"),
            ConnectorShapeType::Bent1 => write!(f, "bentConnector2"),
            ConnectorShapeType::Bent2 => write!(f, "bentConnector3"),
            ConnectorShapeType::Bent3 => write!(f, "bentConnector4"),
            ConnectorShapeType::Bent4 => write!(f, "bentConnector5"),
            ConnectorShapeType::Curved1 => write!(f, "curvedConnector2"),
            ConnectorShapeType::Curved2 => write!(f, "curvedConnector3"),
            ConnectorShapeType::Curved3 => write!(f, "curvedConnector4"),
            ConnectorShapeType::Curved4 => write!(f, "curvedConnector5"),
        }
    }
}

/// A chart shape on a slide — STUB for future implementation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartShape {
    pub id: String,
    pub bounds: Bounds,
    pub chart_type: String,
}

/// A SmartArt diagram shape on a slide — STUB for future implementation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartArtShape {
    pub id: String,
    pub bounds: Bounds,
    pub diagram_type: String,
    pub data_layout: String,
}

/// Transform of a `p:grpSp` group (`p:grpSpPr/a:xfrm`): the group's outer
/// bounds in the parent coordinate space plus the child coordinate-space
/// mapping (`a:chOff`/`a:chExt`) that places/scales the group's children.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupTransform {
    /// Group bounding box in the parent coordinate space (`a:off`/`a:ext`).
    pub bounds: Bounds,
    /// Child coordinate-space origin (`a:chOff`), when written explicitly.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_offset: Option<(i64, i64)>,
    /// Child coordinate-space extent (`a:chExt`), when written explicitly.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_extent: Option<(i64, i64)>,
}

/// A group shape (`p:grpSp`) — a recursive container of slide shapes with its
/// own `p:grpSpPr` transform. Grouped shapes were previously dropped at parse
/// by the direct-children spTree scan (ORM-07 ranked gap #1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupShape {
    pub id: String,
    pub name: String,
    /// Group transform (outer bounds + child-space `chOff`/`chExt`).
    pub transform: GroupTransform,
    /// Child shapes in document order; may contain nested groups.
    pub children: Vec<GroupChild>,
    /// Union bounding box of all direct children expressed in this group's
    /// child coordinate space (computed at parse; used as the effective
    /// child space when the group carries no explicit chOff/chExt).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_bounds: Option<Bounds>,
}

/// One entry of a group's child list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GroupChild {
    /// A leaf slide shape (`p:sp`, `p:pic`, `p:cxnSp`, ...).
    Shape(SlideShape),
    /// A nested `p:grpSp` (recursive SpTree member).
    Group(Box<GroupShape>),
}

impl SlideShape {
    /// Bounding box of any slide shape variant.
    pub fn bounds(&self) -> Bounds {
        match self {
            SlideShape::TextBox(s) => s.bounds,
            SlideShape::Picture(s) => s.bounds,
            SlideShape::Placeholder(s) => s.bounds,
            SlideShape::Table(s) => s.bounds,
            SlideShape::Connector(s) => s.bounds,
            SlideShape::Chart(s) => s.bounds,
            SlideShape::SmartArt(s) => s.bounds,
        }
    }
}

impl GroupShape {
    /// Union (`min`/`max`) bounding box of all direct children in this group's
    /// child coordinate space. Nested groups contribute their outer bounds
    /// (which live in the enclosing child space).
    pub fn child_bounds_union(&self) -> Option<Bounds> {
        let mut acc: Option<Bounds> = None;
        for child in &self.children {
            let b = match child {
                GroupChild::Shape(s) => s.bounds(),
                GroupChild::Group(g) => g.transform.bounds,
            };
            acc = Some(match acc {
                None => b,
                Some(a) => {
                    let x = a.x.min(b.x);
                    let y = a.y.min(b.y);
                    Bounds {
                        x,
                        y,
                        cx: (a.x + a.cx).max(b.x + b.cx) - x,
                        cy: (a.y + a.cy).max(b.y + b.cy) - y,
                    }
                }
            });
        }
        acc
    }

    /// Effective child coordinate space: the explicit `chOff`/`chExt` when
    /// present, otherwise the parsed child bounds union, otherwise the group's
    /// own bounds (OOXML defaults chOff/chExt to off/ext when absent).
    pub fn effective_child_space(&self) -> ((i64, i64), (i64, i64)) {
        if let (Some(off), Some(ext)) =
            (self.transform.child_offset, self.transform.child_extent)
        {
            return (off, ext);
        }
        if let Some(cb) = self.child_bounds {
            return ((cb.x, cb.y), (cb.cx, cb.cy));
        }
        (
            (self.transform.bounds.x, self.transform.bounds.y),
            (self.transform.bounds.cx, self.transform.bounds.cy),
        )
    }

    /// Affine map (sx, sy, tx, ty) from this group's child coordinate space
    /// into the parent space: `x' = sx*x + tx`, `y' = sy*y + ty`.
    pub fn child_to_parent_affine(&self) -> (f64, f64, f64, f64) {
        let (off, ext) = self.effective_child_space();
        let b = &self.transform.bounds;
        let sx = if ext.0 != 0 {
            b.cx as f64 / ext.0 as f64
        } else {
            1.0
        };
        let sy = if ext.1 != 0 {
            b.cy as f64 / ext.1 as f64
        } else {
            1.0
        };
        (
            sx,
            sy,
            b.x as f64 - off.0 as f64 * sx,
            b.y as f64 - off.1 as f64 * sy,
        )
    }
}

// --- PPTX slide text bodies (ORM-07 ranked gaps #4/#10) ---

/// DrawingML bullet definition for a slide paragraph (`CT_TextBullet*`):
/// the `a:buNone` / `a:buChar` / `a:buAutoNum` children of `a:pPr`. Parsed
/// decks previously lost every bullet — paragraphs collapsed to plain text
/// (ORM-07 ranked gap #4).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TextBullet {
    /// `a:buNone` — bullet explicitly suppressed for this paragraph.
    None,
    /// `a:buChar` — literal character bullet (e.g. "•", "–", "➔").
    Char {
        /// Bullet glyph (`char` attribute).
        character: String,
        /// Bullet typeface (`a:buFont typeface`).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        font: Option<String>,
        /// Bullet color (`a:buClr`), hex when `a:srgbClr`, else `None` with
        /// `scheme_color` set.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        color: Option<String>,
        /// Theme color token (`a:schemeClr val`) when the bullet color is
        /// theme-referenced rather than literal.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        scheme_color: Option<String>,
        /// Bullet size as thousandths of a percent (`a:buSzPct val`).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        size_pct: Option<i64>,
    },
    /// `a:buAutoNum` — automatic numbered bullet.
    AutoNum {
        /// Numbering scheme (`type` attribute: arabicPeriod, alphaLcPeriod,
        /// romanUcParenR, ...).
        auto_num_type: String,
        /// First number (`startAt` attribute); `None` = continue at 1.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        start_at: Option<i64>,
        /// Numbering typeface (`a:buFont typeface`).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        font: Option<String>,
        /// Number color (`a:buClr`), hex when `a:srgbClr`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        color: Option<String>,
        /// Theme color token (`a:schemeClr val`) when theme-referenced.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        scheme_color: Option<String>,
        /// Number size as thousandths of a percent (`a:buSzPct val`).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        size_pct: Option<i64>,
    },
}

/// Text autofit mode (`CT_TextBodyProperties` autofit choice): the
/// `a:noAutofit` / `a:normAutofit` / `a:spAutoFit` child of `a:bodyPr`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SlideTextFit {
    /// `a:noAutofit` — text stays at its authored size and may overflow.
    None,
    /// `a:normAutofit` — shrink text on overflow (and the scale applied).
    NormAutofit {
        /// Font scale in thousandths of a percent (`fontScale`).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        font_scale: Option<i64>,
        /// Line-spacing reduction in thousandths of a percent
        /// (`lnSpcReduction`).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        line_space_reduction: Option<i64>,
    },
    /// `a:spAutoFit` — resize the shape to fit its text.
    ShapeAutofit,
}

/// `a:bodyPr` (`CT_TextBodyProperties`) — slide text body layout: vertical
/// anchoring, insets, wrap mode and autofit. Dropped at parse before, so
/// dense text boxes overflow differently than in OO (ORM-07 gap #10).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SlideBodyProperties {
    /// Vertical anchor (`anchor`): "t" | "ctr" | "b".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
    /// Center the text box regardless of anchoring (`anchorCtr="1"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_centered: Option<bool>,
    /// Word-wrap mode (`wrap`): "none" | "square".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap: Option<String>,
    /// Text direction (`vert`): "horz" | "vert" | "vert270" | "eaVert" | ...
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vert: Option<String>,
    /// Left inset in EMU (`lIns`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left_inset: Option<i64>,
    /// Top inset in EMU (`tIns`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_inset: Option<i64>,
    /// Right inset in EMU (`rIns`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right_inset: Option<i64>,
    /// Bottom inset in EMU (`bIns`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bottom_inset: Option<i64>,
    /// Autofit behavior (the `a:bodyPr` autofit choice).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autofit: Option<SlideTextFit>,
    /// Number of text columns (`numCol`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub num_columns: Option<i64>,
    /// Column spacing in EMU (`spcCol`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_spacing: Option<i64>,
    /// Right-to-left columns (`rtlCol="1"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rtl_columns: Option<bool>,
}

/// One slide paragraph: the shared word-model paragraph (runs) plus the
/// DrawingML-only bullet from its `a:pPr`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SlideParagraph {
    /// Runs + shared paragraph properties (reuses the word model, exactly
    /// like `TextBody` does).
    pub paragraph: DocxParagraph,
    /// Bullet definition; `None` when the paragraph declares no bullet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bullet: Option<TextBullet>,
}

/// Rich text body of a slide shape: `a:bodyPr` layout plus bullet-aware
/// paragraphs. The flat `TextBody` shared with the word model cannot carry
/// these, so the typed view is exposed alongside via
/// `OoxmlParser::parse_pptx_text_bodies` and re-emitted by
/// `OoxmlSerializer::build_slide_xml_with_text_bodies` (ORM-07).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SlideTextBody {
    /// Owning shape's `p:cNvPr/@id` (lets writers map a body back to its
    /// shape; bodies are otherwise in slide document order).
    #[serde(default)]
    pub shape_id: String,
    /// `a:bodyPr` layout properties, when the element is present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_pr: Option<SlideBodyProperties>,
    /// Paragraphs in document order.
    #[serde(default)]
    pub paragraphs: Vec<SlideParagraph>,
}

// --- PPTX table styles (ORM-07 ranked gap #5) ---

/// `ppt/tableStyles.xml` root (`a:tblStyleLst`) — the named table-style
/// catalog that a deck's tables reference through `a:tableStyleId`
/// (ORM-07: the whole pipeline was absent, so tables lost every rule).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PptxTableStyles {
    /// Style id applied when a table names no explicit style (`def`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_style_id: Option<String>,
    /// Declared table styles in document order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub styles: Vec<PptxTableStyle>,
}

/// One `a:tblStyle` entry: per-scope formatting parts over the
/// whole-table/banding/first-last axes.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PptxTableStyle {
    /// Style GUID (`styleId`).
    #[serde(default)]
    pub style_id: String,
    /// Human-readable name (`styleName`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_name: Option<String>,
    /// Table background fill color (`a:tblBg`, resolved hex when `srgbClr`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub table_background: Option<String>,
    /// Whole-table defaults (`a:wholeTbl`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub whole_table: Option<PptxTableStylePart>,
    /// First-row special formatting (`a:firstRow`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_row: Option<PptxTableStylePart>,
    /// First-column special formatting (`a:firstCol`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_col: Option<PptxTableStylePart>,
    /// Last-row special formatting (`a:lastRow`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_row: Option<PptxTableStylePart>,
    /// Last-column special formatting (`a:lastCol`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_col: Option<PptxTableStylePart>,
    /// First horizontal band style (`a:band1H`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub band1_h: Option<PptxTableStylePart>,
    /// First vertical band style (`a:band1V`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub band1_v: Option<PptxTableStylePart>,
    /// Second horizontal band style (`a:band2H`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub band2_h: Option<PptxTableStylePart>,
    /// Second vertical band style (`a:band2V`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub band2_v: Option<PptxTableStylePart>,
}

/// One named scope of a table style: borders + fill/font style references.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PptxTableStylePart {
    /// Cell borders (`a:tcBdr` children, in document order).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub borders: Vec<PptxTableStyleBorder>,
    /// Fill reference (`a:fillRef idx` + color).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_ref: Option<PptxStyleReference>,
    /// Text style reference (`a:fontRef idx` + color).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_ref: Option<PptxStyleReference>,
}

/// One `a:tcBdr` border line (`a:lnL`/`a:lnR`/`a:lnT`/`a:lnB`/
/// `a:lnTlToBr`/`a:lnBlToTr`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PptxTableStyleBorder {
    /// Border edge element name (lnL/lnR/lnT/lnB/lnTlToBr/lnBlToTr).
    #[serde(default)]
    pub edge: String,
    /// Line width in EMU (`w`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<i64>,
    /// Dash style (`a:prstDash val`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dash: Option<String>,
    /// Literal color (`a:solidFill/a:srgbClr val`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Theme color token (`a:solidFill/a:schemeClr val`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheme_color: Option<String>,
}

/// `a:fillRef` / `a:fontRef` style reference: an index into the theme's
/// fill/font style table plus the referenced color.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PptxStyleReference {
    /// Index token (`idx`): numeric for `fillRef`, "major"/"minor" for
    /// `fontRef`.
    #[serde(default)]
    pub idx: String,
    /// Literal color (`a:srgbClr val`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Theme color token (`a:schemeClr val`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheme_color: Option<String>,
}

impl ConnectorShapeType {
    pub fn from_name(s: &str) -> Self {
        match s {
            "straightConnector1" => ConnectorShapeType::Straight,
            "bentConnector2" => ConnectorShapeType::Bent1,
            "bentConnector3" => ConnectorShapeType::Bent2,
            "bentConnector4" => ConnectorShapeType::Bent3,
            "bentConnector5" => ConnectorShapeType::Bent4,
            "curvedConnector2" => ConnectorShapeType::Curved1,
            "curvedConnector3" => ConnectorShapeType::Curved2,
            "curvedConnector4" => ConnectorShapeType::Curved3,
            "curvedConnector5" => ConnectorShapeType::Curved4,
            _ => ConnectorShapeType::Straight,
        }
    }
}

/// Fill type for a shape — solid color or gradient.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Fill {
    /// Solid color fill (#RRGGBB or named).
    Solid(String),
    /// Gradient fill with stops and angle.
    Gradient(GradientFill),
}

/// A gradient fill definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientFill {
    /// Linear or radial gradient.
    pub kind: GradientKind,
    /// Color stops (position 0.0–1.0, hex color).
    pub stops: Vec<GradientStop>,
    /// Rotation angle in degrees (0 = left→right).
    pub angle: f64,
}

/// Kind of gradient.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum GradientKind {
    /// Linear gradient along an angle.
    Linear,
    /// Radial gradient from center outward.
    Radial,
}

/// A single color stop in a gradient.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientStop {
    /// Position 0.0–1.0.
    pub position: f64,
    /// Hex color (#RRGGBB).
    pub color: String,
}

/// Shadow effect applied to a shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShadowEffect {
    /// Horizontal offset in EMU.
    pub dx: i64,
    /// Vertical offset in EMU.
    pub dy: i64,
    /// Blur radius in EMU.
    pub blur_radius: i64,
    /// Shadow color (#RRGGBB).
    pub color: String,
    /// Opacity 0.0–1.0.
    pub opacity: f64,
}

/// Glow effect applied to a shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlowEffect {
    /// Blur radius in EMU.
    pub radius: i64,
    /// Glow color (#RRGGBB).
    pub color: String,
    /// Opacity 0.0–1.0.
    pub opacity: f64,
}

/// Reflection effect applied to a shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflectionEffect {
    /// Blur radius in EMU.
    pub blur_radius: i64,
    /// Start opacity 0.0–1.0.
    pub start_opacity: f64,
    /// End position 0.0–1.0 (relative to shape height).
    pub end_pos: f64,
    /// Fade direction (mirror vs fade).
    pub direction: ReflectionDirection,
}

/// Reflection direction.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReflectionDirection {
    /// Mirror reflection.
    #[default]
    #[serde(rename = "mirror")]
    Mirror,
    /// Fade downwards.
    #[serde(rename = "fade")]
    Fade,
}

/// List of visual effects applied to a shape.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EffectList {
    /// Outer shadow effect.
    pub shadow: Option<ShadowEffect>,
    /// Glow effect.
    pub glow: Option<GlowEffect>,
    /// Reflection effect.
    pub reflection: Option<ReflectionEffect>,
}

/// 2D bounds in EMU units (1/914400 inch).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i64,
    pub y: i64,
    pub cx: i64,
    pub cy: i64,
}

/// Text content for a shape.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextBody {
    pub paragraphs: Vec<DocxParagraph>,
}

/// Slide dimensions.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SlideSize {
    pub cx: i64,
    pub cy: i64,
}

impl SlideSize {
    /// Standard 4:3 slide size (10 × 7.5 inches in EMU).
    pub fn standard() -> Self {
        Self {
            cx: 10 * units::IN_TO_EMU,
            cy: 15 * units::IN_TO_EMU / 2,
        }
    }

    /// Widescreen 16:9 slide size (13.33 × 7.5 inches in EMU).
    pub fn widescreen() -> Self {
        Self {
            cx: 40 * units::IN_TO_EMU / 3,
            cy: 15 * units::IN_TO_EMU / 2,
        }
    }
}

// --- PPTX Theme Model ---

/// A theme (from ppt/theme/theme*.xml) defining colors, fonts, effects.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theme {
    pub name: String,
    pub color_scheme: ColorScheme,
    pub font_scheme: FontScheme,
    /// Format scheme (`a:fmtScheme`): the fill/line/effect style tables
    /// referenced by every `a:styleRef`/`a:fillRef`/`a:lnRef`/`a:effectRef`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format_scheme: Option<FmtScheme>,
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            name: "Default Theme".to_string(),
            color_scheme: ColorScheme::default(),
            font_scheme: FontScheme::default(),
            format_scheme: None,
        }
    }
}

/// Color scheme from a theme (a:clrScheme).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorScheme {
    pub name: String,
    /// 12 theme colors: dark1, light1, dark2, light2, accent1-6, hlink, folHlink
    pub colors: Vec<ThemeColor>,
}

impl Default for ColorScheme {
    fn default() -> Self {
        Self {
            name: "Default".to_string(),
            colors: vec![
                ThemeColor {
                    name: "dark1".to_string(),
                    color: "000000".to_string(),
                },
                ThemeColor {
                    name: "light1".to_string(),
                    color: "FFFFFF".to_string(),
                },
                ThemeColor {
                    name: "dark2".to_string(),
                    color: "44546A".to_string(),
                },
                ThemeColor {
                    name: "light2".to_string(),
                    color: "E7E6E6".to_string(),
                },
                ThemeColor {
                    name: "accent1".to_string(),
                    color: "4472C4".to_string(),
                },
                ThemeColor {
                    name: "accent2".to_string(),
                    color: "ED7D31".to_string(),
                },
                ThemeColor {
                    name: "accent3".to_string(),
                    color: "A5A5A5".to_string(),
                },
                ThemeColor {
                    name: "accent4".to_string(),
                    color: "FFC000".to_string(),
                },
                ThemeColor {
                    name: "accent5".to_string(),
                    color: "5B9BD5".to_string(),
                },
                ThemeColor {
                    name: "accent6".to_string(),
                    color: "70AD47".to_string(),
                },
                ThemeColor {
                    name: "hlink".to_string(),
                    color: "0563C1".to_string(),
                },
                ThemeColor {
                    name: "folHlink".to_string(),
                    color: "954F72".to_string(),
                },
            ],
        }
    }
}

/// A single theme color entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColor {
    pub name: String,
    pub color: String,
}

/// Font scheme from a theme (a:fontScheme).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontScheme {
    pub name: String,
    pub major_font: ThemeFont,
    pub minor_font: ThemeFont,
}

impl Default for FontScheme {
    fn default() -> Self {
        Self {
            name: "Default".to_string(),
            major_font: ThemeFont {
                latin: Some("Calibri Light".to_string()),
                east_asian: None,
                complex_script: None,
            },
            minor_font: ThemeFont {
                latin: Some("Calibri".to_string()),
                east_asian: None,
                complex_script: None,
            },
        }
    }
}

/// Font definition for a theme font slot (major/minor).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeFont {
    pub latin: Option<String>,
    pub east_asian: Option<String>,
    pub complex_script: Option<String>,
}

/// A themed color reference (`a:schemeClr`): a scheme color token plus the
/// color transforms applied to it, in document order.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SchemeClr {
    /// Scheme color token (`val`): dk1/lt1/dk2/lt2/accent1-6/hlink/folHlink
    /// or the placeholder token `phClr` inside style-table entries.
    #[serde(default)]
    pub val: String,
    /// Color transforms (`a:lumMod`, `a:tint`, `a:shade`, ...).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modifiers: Vec<SchemeClrTransform>,
}

/// One color-transform child of `a:schemeClr`/`a:srgbClr`/`a:sysClr`.
/// Values are stored in 1000ths of a percent, exactly as serialized
/// (`val="50000"` = 50%).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SchemeClrTransform {
    /// `a:tint` — lighten toward white.
    Tint(i64),
    /// `a:shade` — darken toward black.
    Shade(i64),
    /// `a:lumMod` — scale luminance.
    LumMod(i64),
    /// `a:lumOff` — shift luminance toward white.
    LumOff(i64),
    /// `a:alpha` — opacity.
    Alpha(i64),
    /// `a:alphaMod` — opacity scale.
    AlphaMod(i64),
    /// `a:alphaOff` — opacity shift.
    AlphaOff(i64),
    /// `a:satMod` — saturation scale.
    SatMod(i64),
    /// `a:satOff` — saturation shift.
    SatOff(i64),
    /// `a:hueMod` — hue scale.
    HueMod(i64),
    /// `a:comp` — complement color (no value).
    Complement,
    /// `a:gray` — grayscale conversion (no value).
    Gray,
}

/// A concrete color inside a theme style-table entry: either a literal
/// (`a:srgbClr`), a theme reference (`a:schemeClr`), a system color
/// (`a:sysClr`), or a preset color (`a:prstClr`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ThemeColorRef {
    /// `a:srgbClr val` hex color.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rgb: Option<String>,
    /// `a:schemeClr` themed reference (may itself carry transforms).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheme: Option<SchemeClr>,
    /// `a:sysClr` system color (`val` + `lastClr`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system: Option<ThemeSystemColor>,
    /// `a:prstClr val` preset color name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
}

impl ThemeColorRef {
    /// Resolve to a concrete hex color using `theme` for scheme lookups and
    /// `clr_map` for slot remapping. Returns `None` when nothing is set or
    /// the scheme token is unknown (`phClr` stays unresolved until placed
    /// against a real color context).
    pub fn resolve(&self, theme: &Theme, clr_map: &ClrMap) -> Option<String> {
        if let Some(ref rgb) = self.rgb {
            return Some(rgb.clone());
        }
        if let Some(ref sys) = self.system {
            return sys.last_clr.clone().or_else(|| Some(sys.val.clone()));
        }
        if let Some(ref prst) = self.preset {
            return preset_color(prst);
        }
        self.scheme.as_ref().and_then(|s| {
            let token = clr_map.map(&s.val);
            theme.resolve_scheme_color_with_clr_map(clr_map, &token, &s.modifiers)
        })
    }
}

/// `a:sysClr` — an OS-defined color with the last concrete value recorded.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ThemeSystemColor {
    /// System color name (`window`, `windowText`, ...).
    #[serde(default)]
    pub val: String,
    /// Cached concrete color (`lastClr`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_clr: Option<String>,
}

/// A gradient stop inside a theme gradient fill (`a:gs pos` + color).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ThemeGradientStop {
    /// Stop position as a fraction (0.0–1.0).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<f64>,
    /// Stop color.
    pub color: ThemeColorRef,
}

/// One entry of `a:fillStyleLst` / `a:bgFillStyleLst`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ThemeFillStyle {
    /// Unrecognized / unparsed fill — kept as a marker so the style index
    /// stays aligned with the document order.
    #[default]
    Unknown,
    /// `a:noFill`.
    NoFill,
    /// `a:grpFill` — inherit from the group.
    GroupFill,
    /// `a:blipFill` — image fill (image data lives outside the theme).
    Blip,
    /// `a:solidFill`.
    Solid(ThemeColorRef),
    /// `a:gradFill` with its `a:gs` stops.
    Gradient(Vec<ThemeGradientStop>),
    /// `a:pattFill` with preset pattern + foreground/background colors.
    Pattern {
        /// Pattern preset name (`prst`).
        preset: Option<String>,
        /// `a:fgClr`.
        foreground: Option<ThemeColorRef>,
        /// `a:bgClr`.
        background: Option<ThemeColorRef>,
    },
}

/// One entry of `a:lnStyleLst` — a themed line style.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ThemeLineStyle {
    /// Line width in EMU (`w`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<i64>,
    /// Line cap (`cap`): flat/rnd/sys.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cap: Option<String>,
    /// Compound line type (`cmpd`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compound: Option<String>,
    /// Line alignment (`algn`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alignment: Option<String>,
    /// The line's fill (solid/gradient/...).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<ThemeFillStyle>,
    /// Dash preset (`a:prstDash val`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dash: Option<String>,
    /// Head end type (`a:headEnd type`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_end: Option<String>,
    /// Tail end type (`a:tailEnd type`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tail_end: Option<String>,
}

/// One entry of `a:effectStyleLst`. Effects are modeled shallowly: presence
/// of a non-empty `a:effectLst` is what `effectRef idx` consumers need. The
/// raw effect-list XML is kept so serialization stays lossless.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ThemeEffectStyle {
    /// Whether the style carries a non-empty effect list.
    #[serde(default)]
    pub has_effects: bool,
    /// Raw `a:effectLst` XML (captured verbatim at parse time).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<String>,
}

/// `a:fmtScheme` — the theme's style tables: exactly three entries each for
/// fills, lines, effects and background fills, looked up by `idx` on every
/// `a:styleRef`/`a:fillRef`/`a:lnRef`/`a:effectRef` (1-based).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct FmtScheme {
    /// Scheme name (`name`).
    #[serde(default)]
    pub name: String,
    /// `a:fillStyleLst`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fill_styles: Vec<ThemeFillStyle>,
    /// `a:lnStyleLst`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub line_styles: Vec<ThemeLineStyle>,
    /// `a:effectStyleLst`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub effect_styles: Vec<ThemeEffectStyle>,
    /// `a:bgFillStyleLst`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bg_fill_styles: Vec<ThemeFillStyle>,
}

/// `p:clrMap` — the slide master's color map: remaps scheme slots for the
/// slides that follow the master (`bg1`→`lt1` etc. by default). A slide
/// `a:clrMapOvr` can replace it per slide.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClrMap {
    pub bg1: String,
    pub tx1: String,
    pub bg2: String,
    pub tx2: String,
    pub accent1: String,
    pub accent2: String,
    pub accent3: String,
    pub accent4: String,
    pub accent5: String,
    pub accent6: String,
    pub hlink: String,
    pub fol_hlink: String,
}

impl Default for ClrMap {
    fn default() -> Self {
        Self {
            bg1: "lt1".to_string(),
            tx1: "dk1".to_string(),
            bg2: "lt2".to_string(),
            tx2: "dk2".to_string(),
            accent1: "accent1".to_string(),
            accent2: "accent2".to_string(),
            accent3: "accent3".to_string(),
            accent4: "accent4".to_string(),
            accent5: "accent5".to_string(),
            accent6: "accent6".to_string(),
            hlink: "hlink".to_string(),
            fol_hlink: "folHlink".to_string(),
        }
    }
}

impl ClrMap {
    /// Map a scheme token through the color map (identity for unknown
    /// tokens such as `phClr`).
    pub fn map(&self, token: &str) -> String {
        match token {
            "bg1" => self.bg1.clone(),
            "tx1" => self.tx1.clone(),
            "bg2" => self.bg2.clone(),
            "tx2" => self.tx2.clone(),
            "accent1" => self.accent1.clone(),
            "accent2" => self.accent2.clone(),
            "accent3" => self.accent3.clone(),
            "accent4" => self.accent4.clone(),
            "accent5" => self.accent5.clone(),
            "accent6" => self.accent6.clone(),
            "hlink" => self.hlink.clone(),
            "folHlink" => self.fol_hlink.clone(),
            other => other.to_string(),
        }
    }

    /// Set one slot from a `p:clrMap` attribute pair.
    pub fn set_slot(&mut self, slot: &str, value: &str) {
        if value.is_empty() {
            return;
        }
        match slot {
            "bg1" => self.bg1 = value.to_string(),
            "tx1" => self.tx1 = value.to_string(),
            "bg2" => self.bg2 = value.to_string(),
            "tx2" => self.tx2 = value.to_string(),
            "accent1" => self.accent1 = value.to_string(),
            "accent2" => self.accent2 = value.to_string(),
            "accent3" => self.accent3 = value.to_string(),
            "accent4" => self.accent4 = value.to_string(),
            "accent5" => self.accent5 = value.to_string(),
            "accent6" => self.accent6 = value.to_string(),
            "hlink" => self.hlink = value.to_string(),
            "folHlink" => self.fol_hlink = value.to_string(),
            _ => {}
        }
    }
}

/// Built-in preset color names for `a:prstClr` (subset covering the common
/// black/white/gray tokens; unknown names resolve to `None`).
pub fn preset_color(name: &str) -> Option<String> {
    let color = match name {
        "black" => "000000",
        "white" => "FFFFFF",
        "darkGray" => "404040",
        "gray" => "808080",
        "lightGray" => "C0C0C0",
        "red" => "FF0000",
        "green" => "008000",
        "blue" => "0000FF",
        "yellow" => "FFFF00",
        "cyan" => "00FFFF",
        "magenta" => "FF00FF",
        _ => return None,
    };
    Some(color.to_string())
}

impl Theme {
    /// Resolve a scheme color token (already clrMap-normalized) to a concrete
    /// 6-digit hex color, applying the reference's transforms.
    pub fn resolve_scheme_color(
        &self,
        token: &str,
        modifiers: &[SchemeClrTransform],
    ) -> Option<String> {
        self.resolve_scheme_color_with_clr_map(&ClrMap::default(), token, modifiers)
    }

    /// Resolve a scheme color token through a master/slide color map
    /// (`p:clrMap` remaps dk1/lt1/dk2/lt2 before the palette lookup).
    pub fn resolve_scheme_color_with_clr_map(
        &self,
        clr_map: &ClrMap,
        token: &str,
        modifiers: &[SchemeClrTransform],
    ) -> Option<String> {
        let mapped = clr_map.map(token);
        let base = self
            .color_scheme
            .colors
            .iter()
            .find(|c| c.name == mapped || c.name == token)
            .map(|c| c.color.clone())?;
        Some(apply_scheme_color_transforms(&base, modifiers))
    }

    /// Look up a theme font slot by `a:fontRef idx` token ("major"/"minor").
    pub fn resolve_font(&self, slot: &str) -> Option<&ThemeFont> {
        match slot {
            "major" => Some(&self.font_scheme.major_font),
            "minor" => Some(&self.font_scheme.minor_font),
            _ => None,
        }
    }

    /// Resolve the major (headings) latin typeface.
    pub fn major_latin_font(&self) -> Option<&str> {
        self.font_scheme.major_font.latin.as_deref()
    }

    /// Resolve the minor (body) latin typeface.
    pub fn minor_latin_font(&self) -> Option<&str> {
        self.font_scheme.minor_font.latin.as_deref()
    }
}

/// Apply `a:schemeClr` color transforms to a 6-digit hex color, returning the
/// transformed hex. `tint`/`shade` work per channel
/// (`c·t + 255·(1−t)` / `c·s`); `lumMod`/`lumOff` scale and shift the HSL
/// luminance; `alpha*`/`sat*`/`hue*` and the value-less `comp`/`gray` are
/// recorded on the reference but do not change the returned RGB.
pub fn apply_scheme_color_transforms(hex: &str, modifiers: &[SchemeClrTransform]) -> String {
    let mut rgb = parse_hex_rgb(hex);
    for m in modifiers {
        match *m {
            SchemeClrTransform::Tint(v) => {
                let t = pct(v);
                for c in rgb.iter_mut() {
                    *c = (*c as f64 * t + 255.0 * (1.0 - t)).round();
                }
            }
            SchemeClrTransform::Shade(v) => {
                let s = pct(v);
                for c in rgb.iter_mut() {
                    let v = (*c as f64 * s).round();
                    *c = v.clamp(0.0, 255.0);
                }
            }
            SchemeClrTransform::LumMod(v) => {
                let (h, s, l) = rgb_to_hsl(rgb);
                rgb = hsl_to_rgb(h, s, (l * pct(v)).clamp(0.0, 1.0));
            }
            SchemeClrTransform::LumOff(v) => {
                let (h, s, l) = rgb_to_hsl(rgb);
                rgb = hsl_to_rgb(h, s, (l + pct(v)).clamp(0.0, 1.0));
            }
            _ => {}
        }
    }
    format!(
        "{:02X}{:02X}{:02X}",
        rgb[0].round() as i32, rgb[1].round() as i32, rgb[2].round() as i32
    )
}

/// Parse a hex color (6 or 8 digits, optional `#`) to RGB; unknown input
/// yields black so transforms keep a defined base.
fn parse_hex_rgb(hex: &str) -> [f64; 3] {
    let cleaned = hex.trim_start_matches('#');
    let take = |i: usize| -> f64 {
        cleaned
            .get(i..i + 2)
            .and_then(|s| u8::from_str_radix(s, 16).ok())
            .map(|v| v as f64)
            .unwrap_or(0.0)
    };
    if cleaned.len() >= 6 {
        [take(0), take(2), take(4)]
    } else {
        [0.0; 3]
    }
}

/// 1000ths-of-a-percent value to a 0.0–1.0 fraction.
fn pct(v: i64) -> f64 {
    v as f64 / 100_000.0
}

fn rgb_to_hsl(rgb: [f64; 3]) -> (f64, f64, f64) {
    let r = rgb[0] / 255.0;
    let g = rgb[1] / 255.0;
    let b = rgb[2] / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < f64::EPSILON {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = d / (1.0 - (2.0 * l - 1.0).abs());
    let h = if (max - r).abs() < f64::EPSILON {
        ((g - b) / d) % 6.0
    } else if (max - g).abs() < f64::EPSILON {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    ((h * 60.0 + 360.0) % 360.0, s, l)
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> [f64; 3] {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hp = h / 60.0;
    let x = c * (1.0 - (hp % 2.0 - 1.0).abs());
    let (r1, g1, b1) = if hp < 1.0 {
        (c, x, 0.0)
    } else if hp < 2.0 {
        (x, c, 0.0)
    } else if hp < 3.0 {
        (0.0, c, x)
    } else if hp < 4.0 {
        (0.0, x, c)
    } else if hp < 5.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    let m = l - c / 2.0;
    [(r1 + m) * 255.0, (g1 + m) * 255.0, (b1 + m) * 255.0]
}

/// A slide master (from ppt/slideMasters/slideMaster*.xml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideMaster {
    pub id: u32,
    pub name: String,
    /// Master color map (`p:clrMap`): remaps scheme slots for its slides.
    #[serde(default)]
    pub clr_map: ClrMap,
    pub slide_layouts: Vec<SlideLayout>,
}

/// A slide layout (from ppt/slideLayouts/slideLayout*.xml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideLayout {
    pub id: u32,
    pub name: String,
    pub layout_type: String,
    pub shapes: Vec<SlideShape>,
    pub placeholder_types: Vec<String>,
}

// --- Built-in Theme Presets (for frontend) ---

/// A built-in theme preset that can be applied to a presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemePreset {
    pub name: String,
    pub description: String,
    pub color_scheme: ColorScheme,
    pub font_scheme: FontScheme,
}

// ---------------------------------------------------------------------------
// XLSX chart parts (ORM-06) — the `xl/charts/chartN.xml` typed graph
// ---------------------------------------------------------------------------

/// A parsed XLSX package: the editable workbook model plus the chart parts
/// that ride beside it (ORM-06). Chart parts are workbook-level ZIP parts
/// (`xl/charts/chartN.xml`) related from a drawing; the sheet model cannot
/// host them, so they travel in their own typed list.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxBook {
    /// The editable workbook model (sheets, styles, shared strings).
    pub workbook: XlsxWorkbook,
    /// The typed chart parts (`xl/charts/chartN.xml`), in package order.
    pub charts: Vec<XlsxChartPart>,
    /// The typed rich-value part (`xl/richData/richValue.xml`, ORM-06) —
    /// images / formatted objects embedded in cells, addressed through
    /// the worksheets' `c/@vm` value-metadata links.
    pub rich_values: Vec<XlsxRichValue>,
}

/// Rich-value part content type (`xl/richData/richValue.xml`, ORM-06).
pub const XLSX_RICH_VALUE_CONTENT_TYPE: &str = "application/vnd.ms-excel.richvalue+xml";

/// One `<rv>` rich value from `xl/richData/richValue.xml` (ORM-06): the
/// payload behind a rich-value cell — an image, formatted number with
/// custom styling, or other structured object.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxRichValue {
    /// `rvb` — binary blob index (image data via the rich-value rels).
    pub blob: Option<u32>,
    /// `rvc`/`rvd` — structured key/value records (key id -> value).
    pub records: Vec<XlsxRichValueRecord>,
}

/// One rich-value key/value pair (`rvc` or `rvd` child of `<rv>`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct XlsxRichValueRecord {
    /// `t` — the structured key id.
    pub t: Option<u32>,
    /// `v` — the value (a literal string or an index).
    pub v: Option<String>,
}

/// One `xl/charts/chartN.xml` part: its package path plus the typed
/// DrawingML chart graph (`c:chartSpace`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct XlsxChartPart {
    /// Package path, e.g. `xl/charts/chart1.xml`.
    pub path: String,
    /// The parsed `c:chartSpace` graph.
    pub space: ChartSpace,
}

/// DrawingML chart content type (used for the `[Content_Types].xml`
/// Override and the workbook relationship).
pub const XLSX_CHART_CONTENT_TYPE: &str =
    "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";

/// DrawingML chart relationship type.
pub const XLSX_CHART_REL_TYPE: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";

/// The `c:chartSpace` root (CT_ChartSpace): workbook-level flags, the chart
/// itself, its external-data link and its print settings.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartSpace {
    /// `c:lang` — the language of the chart text.
    pub lang: Option<String>,
    /// `c:date1904` — the date system of the cached values.
    pub date_1904: Option<bool>,
    /// `c:roundedCorners` — rounded chart-space border.
    pub rounded_corners: Option<bool>,
    /// `c:chart` — the chart definition.
    pub chart: ChartNode,
    /// `c:externalData` — the linked workbook (`r:id` + auto-update flag).
    pub external_data: Option<ChartExternalData>,
    /// `c:printSettings` — print margins/header-footer for the chart sheet.
    pub print_settings: Option<ChartPrintSettings>,
}

/// `c:chart` (CT_Chart): title, plot area, legend and behavior flags.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartNode {
    /// `c:title` — explicit chart title (empty when auto-generated).
    pub title: Option<ChartTitleNode>,
    /// `c:autoTitleDeleted` — the user deleted the automatic title.
    pub auto_title_deleted: Option<bool>,
    /// `c:plotArea` — the plot groups and axes.
    pub plot_area: PlotAreaNode,
    /// `c:legend` — legend configuration.
    pub legend: Option<ChartLegendNode>,
    /// `c:plotVisOnly` — plot only visible cells.
    pub plot_vis_only: Option<bool>,
    /// `c:dispBlanksAs` — how blank cells render (`gap`/`zero`/`span`).
    pub disp_blanks_as: Option<String>,
    /// `c:showDLblsOverMax` — draw labels beyond the axis maximum.
    pub show_dlbls_over_max: Option<bool>,
}

/// `c:title` (CT_Title): the resolved text plus overlay flag. The text may
/// come from `c:rich` runs or from a `c:strRef` formula cache.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartTitleNode {
    /// Concatenated `a:t` runs of `c:tx/c:rich` (or the cached formula text).
    pub text: Option<String>,
    /// `c:strRef/c:f` — the cell formula backing an auto title.
    pub ref_formula: Option<String>,
    /// `c:overlay` — draw the title over the plot area.
    pub overlay: Option<bool>,
}

/// `c:plotArea` (CT_PlotArea): one or more plot groups plus the axes they
/// reference through `c:axId`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PlotAreaNode {
    /// `c:layout` — manual layout of the plot area (fractions of the chart).
    pub layout: Option<ChartLayout>,
    /// The plot groups (`c:barChart`, `c:lineChart`, …) in document order.
    pub plots: Vec<ChartPlot>,
    /// The axes (`c:catAx`/`c:valAx`/`c:dateAx`/`c:serAx`).
    pub axes: Vec<ChartAxis>,
    /// `c:dTable` — a data table under the plot area.
    pub show_data_table: Option<bool>,
}

/// `c:layout` (CT_ManualLayout) — fractional x/y/w/h positions.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartLayout {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub w: Option<f64>,
    pub h: Option<f64>,
}

/// The kind of a plot group (`c:barChart`, `c:lineChart`, …).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ChartPlotKind {
    /// `c:barChart` — horizontal bars when `barDir="bar"`.
    #[default]
    Bar,
    /// `c:barChart` with `barDir="col"` — vertical columns.
    Column,
    /// `c:lineChart`.
    Line,
    /// `c:pieChart`.
    Pie,
    /// `c:doughnutChart`.
    Doughnut,
    /// `c:scatterChart`.
    Scatter,
    /// `c:areaChart`.
    Area,
    /// `c:radarChart`.
    Radar,
    /// `c:bubbleChart`.
    Bubble,
    /// `c:surfaceChart` / `c:surface3DChart`.
    Surface,
    /// `c:stockChart` (HLC/OHLC/volume-open-high-low-close).
    Stock,
    /// `c:ofPieChart` (pie-of-pie / bar-of-pie).
    OfPie,
    /// Any other plot group (`c:funnel`, `c:treemap`, …) — kept verbatim so
    /// an unknown chart type still round trips instead of being dropped.
    Other(String),
}

/// One plot group (CT_*Chart). Kind-specific children are optional fields;
/// everything present is re-emitted in schema order.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartPlot {
    /// The plot group kind.
    pub kind: ChartPlotKind,
    /// `c:barDir` — `bar` or `col` (bar charts only).
    pub bar_dir: Option<String>,
    /// `c:grouping` — `clustered`/`stacked`/`percentStacked`/`standard`.
    pub grouping: Option<String>,
    /// `c:varyColors` — color each point differently.
    pub vary_colors: Option<bool>,
    /// `c:ser` — the series of this plot group.
    pub series: Vec<ChartSeries>,
    /// `c:dLbls` — plot-level data labels.
    pub d_lbls: Option<ChartDLbls>,
    /// `c:gapWidth` — bar/line gap width in percent.
    pub gap_width: Option<u32>,
    /// `c:overlap` — bar overlap in percent (may be negative).
    pub overlap: Option<i64>,
    /// `c:holeSize` — doughnut hole size in percent.
    pub hole_size: Option<u32>,
    /// `c:firstSliceAng` — pie/doughnut first slice angle.
    pub first_slice_ang: Option<u32>,
    /// `c:radarStyle` — `standard`/`marker`/`filled`.
    pub radar_style: Option<String>,
    /// `c:scatterStyle` — `lineMarker`, `smoothMarker`, …
    pub scatter_style: Option<String>,
    /// `c:ofPieType` — `pie` or `bar` (of-pie charts).
    pub of_pie_type: Option<String>,
    /// `c:marker` (chart-level) — scatter/line show markers.
    pub marker: Option<bool>,
    /// `c:smooth` (chart-level default for line series).
    pub smooth: Option<bool>,
    /// `c:bubble3D`.
    pub bubble3_d: Option<bool>,
    /// `c:serLines` — connector lines between stacked bars.
    pub ser_lines: Option<bool>,
    /// `c:axId` — the axes this plot group is drawn against.
    pub ax_ids: Vec<u32>,
}

/// `c:ser` (CT_BarSer/CT_LineSer/…) — one data series of a plot group.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartSeries {
    /// `c:idx` — series index.
    pub idx: u32,
    /// `c:order` — series plotting order.
    pub order: u32,
    /// `c:tx` — series name text (rich or cached formula result).
    pub name: Option<String>,
    /// `c:tx/c:strRef/c:f` — the formula backing the series name.
    pub name_formula: Option<String>,
    /// `c:spPr` solid fill color (`#RRGGBB`) of the series shape.
    pub fill_color: Option<String>,
    /// `c:spPr/a:ln` solid line color (`#RRGGBB`).
    pub line_color: Option<String>,
    /// `c:marker` — the series data-point marker.
    pub marker: Option<ChartMarker>,
    /// `c:cat` — the category (x) labels.
    pub categories: Option<ChartCategories>,
    /// `c:val` — the values.
    pub values: Option<ChartNumData>,
    /// `c:xVal` — scatter/bubble x values.
    pub x_values: Option<ChartNumData>,
    /// `c:yVal` — scatter/bubble y values.
    pub y_values: Option<ChartNumData>,
    /// `c:bubbleSize` — bubble sizes.
    pub bubble_sizes: Option<ChartNumData>,
    /// `c:bubble3D` — per-series bubble 3D flag.
    pub bubble3_d: Option<bool>,
    /// `c:smooth` — smooth the connecting line.
    pub smooth: Option<bool>,
    /// `c:dLbls` — series-level data labels.
    pub d_lbls: Option<ChartDLbls>,
    /// `c:trendline` — trendlines attached to the series.
    pub trendlines: Vec<ChartTrendline>,
    /// `c:errBars` — error bars attached to the series (x and y).
    pub error_bars: Vec<ChartErrBar>,
}

/// `c:cat` (CT_AxDataSource): category labels from a string or number cache.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartCategories {
    /// `c:strRef/c:f` or `c:numRef/c:f` — the source range.
    pub formula: Option<String>,
    /// `c:multiLvlStrRef` — the labels are multi-level categories.
    pub multi_level: bool,
    /// `formatCode` of a numeric category cache.
    pub format_code: Option<String>,
    /// `c:ptCount/@val`.
    pub pt_count: Option<u32>,
    /// Cached points (`c:pt/@idx` → value) in document order.
    pub points: Vec<ChartStrPt>,
}

/// One cached string point (`c:pt`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ChartStrPt {
    pub idx: u32,
    pub value: Option<String>,
}

/// Numeric data source (CT_NumDataSource): `c:numRef` or `c:numLit`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartNumData {
    /// `c:numRef/c:f` — the source range (None for a literal).
    pub formula: Option<String>,
    /// `c:numCache/formatCode` (or `numLit/formatCode`).
    pub format_code: Option<String>,
    /// `c:ptCount/@val`.
    pub pt_count: Option<u32>,
    /// Cached points (`c:pt/@idx` → value); missing cells keep `None`.
    pub points: Vec<ChartNumPt>,
}

/// One cached numeric point (`c:pt`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ChartNumPt {
    pub idx: u32,
    pub value: Option<f64>,
}

/// `c:marker` (CT_Marker): symbol, size and color of a data point marker.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartMarker {
    /// `c:symbol` — `circle`, `square`, `none`, …
    pub symbol: Option<String>,
    /// `c:size` — marker size in points.
    pub size: Option<u32>,
    /// `c:spPr` solid fill color (`#RRGGBB`).
    pub fill_color: Option<String>,
}

/// `c:dLbls` (CT_DLbls): which label parts to show and where.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartDLbls {
    /// `c:delete` — labels are switched off.
    pub deleted: bool,
    /// `c:numFmt/@formatCode`.
    pub number_format: Option<String>,
    /// `c:numFmt/@sourceLinked`.
    pub source_linked: Option<bool>,
    /// `c:dLblPos` — `outEnd`, `ctr`, `inEnd`, …
    pub position: Option<String>,
    pub show_legend_key: bool,
    pub show_val: bool,
    pub show_cat_name: bool,
    pub show_ser_name: bool,
    pub show_percent: bool,
    pub show_bubble_size: bool,
}

/// `c:trendline` (CT_Trendline): a regression line on a series.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartTrendline {
    /// `c:trendlineType/@val` — `linear`, `exp`, `log`, `movingAvg`,
    /// `poly`, `power`.
    pub trendline_type: String,
    /// `c:order` — polynomial order.
    pub order: Option<u32>,
    /// `c:period` — moving-average period.
    pub period: Option<u32>,
    /// `c:forward` — extrapolated periods forward.
    pub forward: Option<f64>,
    /// `c:backward` — extrapolated periods backward.
    pub backward: Option<f64>,
    /// `c:intercept` — fixed intercept.
    pub intercept: Option<f64>,
    /// `c:dispRSqr` — show R².
    pub disp_r_sq: bool,
    /// `c:dispEq` — show the equation.
    pub disp_eq: bool,
    /// `c:name` — custom trendline name.
    pub name: Option<String>,
}

/// `c:errBars` (CT_ErrBars): error bars on a series.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartErrBar {
    /// `c:errBarType/@val` — `both`, `minus`, `plus`.
    pub err_bar_type: String,
    /// `c:errValType/@val` — `cust`, `fixedVal`, `percentage`, `stdDev`,
    /// `stdErr`.
    pub err_val_type: String,
    /// `c:noEndCap`.
    pub no_end_cap: bool,
    /// Direction: `x` when attached to `c:xVal`, `y` for `c:yVal`.
    pub direction: String,
    /// `c:val` — the fixed/percentage/standard-deviation magnitude.
    pub value: Option<f64>,
}

/// Axis kinds (the four `*Ax` elements of CT_PlotArea).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ChartAxisKind {
    /// `c:catAx`.
    #[default]
    Category,
    /// `c:valAx`.
    Value,
    /// `c:dateAx`.
    Date,
    /// `c:serAx` (3-D series axis).
    Series,
}

/// One axis (`c:catAx`/`c:valAx`/`c:dateAx`/`c:serAx`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartAxis {
    /// Which `*Ax` element this came from.
    pub kind: ChartAxisKind,
    /// `c:axId` — referenced by the plot groups' `c:axId` children.
    pub ax_id: u32,
    /// `c:crossAx` — the id of the crossing axis.
    pub cross_ax: u32,
    /// `c:delete` — the axis is hidden.
    pub delete: Option<bool>,
    /// `c:axPos` — `b`, `l`, `t`, `r`.
    pub ax_pos: Option<String>,
    /// `c:scaling` — log base, orientation and fixed min/max.
    pub scaling: ChartScaling,
    /// `c:title` — axis title text.
    pub title: Option<String>,
    /// `c:numFmt/@formatCode`.
    pub number_format: Option<String>,
    /// `c:numFmt/@sourceLinked`.
    pub number_format_source_linked: Option<bool>,
    /// `c:majorGridlines` present.
    pub major_gridlines: bool,
    /// `c:minorGridlines` present.
    pub minor_gridlines: bool,
    /// `c:majorTickMark` — `out`, `in`, `cross`, `none`.
    pub major_tick_mark: Option<String>,
    /// `c:minorTickMark`.
    pub minor_tick_mark: Option<String>,
    /// `c:tickLblPos` — `nextTo`, `high`, `low`, `none`.
    pub tick_label_position: Option<String>,
    /// `c:crosses` — `autoZero`, `max`, `min`.
    pub crosses: Option<String>,
    /// `c:crossesAt` — fixed crossing value.
    pub crosses_at: Option<f64>,
    /// `c:crossBetween` — `between`, `midCat`.
    pub cross_between: Option<String>,
    /// `c:majorUnit`.
    pub major_unit: Option<f64>,
    /// `c:minorUnit`.
    pub minor_unit: Option<f64>,
    /// `c:auto` — automatic category axis.
    pub auto: Option<bool>,
    /// `c:lblAlgn` — `ctr`, `l`, `r`.
    pub label_alignment: Option<String>,
    /// `c:lblOffset`.
    pub label_offset: Option<u32>,
    /// `c:noMultiLvlLbl`.
    pub no_multi_level_labels: Option<bool>,
}

/// `c:scaling` (CT_Scaling).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartScaling {
    /// `c:logBase`.
    pub log_base: Option<f64>,
    /// `c:orientation/@val` — `minMax` or `maxMin`.
    pub orientation: Option<String>,
    /// `c:max`.
    pub max: Option<f64>,
    /// `c:min`.
    pub min: Option<f64>,
}

/// `c:legend` (CT_Legend).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartLegendNode {
    /// `c:legendPos/@val` — `b`, `tr`, `l`, `r`, `t`.
    pub position: Option<String>,
    /// `c:overlay`.
    pub overlay: Option<bool>,
    /// `c:legendEntry` entries with `c:delete` — hidden series indices.
    pub deleted_entries: Vec<u32>,
}

/// `c:externalData` (CT_ExternalData): the workbook the chart is linked to.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartExternalData {
    /// `r:id` of the external-data relationship.
    pub r_id: String,
    /// `c:autoUpdate`.
    pub auto_update: Option<bool>,
}

/// `c:printSettings`: chart print margins and header/footer (uses the
/// spreadsheetml CT_PageMargins/CT_HeaderFooter types).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChartPrintSettings {
    pub page_margins: Option<XlsxPageMargins>,
    pub header_footer: Option<XlsxHeaderFooter>,
}

impl ChartPlot {
    /// The `c:*Chart` element name for this plot kind (used by the writer).
    pub fn element_name(&self) -> String {
        match self.kind {
            ChartPlotKind::Bar | ChartPlotKind::Column => "barChart".to_string(),
            ChartPlotKind::Line => "lineChart".to_string(),
            ChartPlotKind::Pie => "pieChart".to_string(),
            ChartPlotKind::Doughnut => "doughnutChart".to_string(),
            ChartPlotKind::Scatter => "scatterChart".to_string(),
            ChartPlotKind::Area => "areaChart".to_string(),
            ChartPlotKind::Radar => "radarChart".to_string(),
            ChartPlotKind::Bubble => "bubbleChart".to_string(),
            ChartPlotKind::Surface => "surfaceChart".to_string(),
            ChartPlotKind::Stock => "stockChart".to_string(),
            ChartPlotKind::OfPie => "ofPieChart".to_string(),
            ChartPlotKind::Other(ref name) => name.clone(),
        }
    }

    /// The bar direction for bar plots (`bar` or `col`).
    pub fn bar_dir_attr(&self) -> Option<&str> {
        if !matches!(self.kind, ChartPlotKind::Bar | ChartPlotKind::Column) {
            return None;
        }
        Some(if self.kind == ChartPlotKind::Column {
            "col"
        } else {
            "bar"
        })
    }
}

impl ChartSpace {
    /// The primary plot group (the first plot of the plot area).
    pub fn primary_plot(&self) -> Option<&ChartPlot> {
        self.chart.plot_area.plots.first()
    }

    /// The `wo-chart` `ChartKind` name for the primary plot group
    /// (snake_case, as `ChartKind` serializes). Plot kinds the editable
    /// chart model cannot render yet degrade to their nearest supported
    /// kind: bubble → `scatter`, surface → `area`, stock → `line`,
    /// of-pie → `pie`, unknown → `bar`. The typed graph keeps the real
    /// kind regardless — only this bridge view is lossy.
    pub fn chart_kind_name(&self) -> &'static str {
        match self.primary_plot().map(|p| &p.kind) {
            Some(ChartPlotKind::Bar) => "bar",
            Some(ChartPlotKind::Column) => "column",
            Some(ChartPlotKind::Line) => "line",
            Some(ChartPlotKind::Pie) | Some(ChartPlotKind::OfPie) => "pie",
            Some(ChartPlotKind::Doughnut) => "doughnut",
            Some(ChartPlotKind::Scatter) | Some(ChartPlotKind::Bubble) => "scatter",
            Some(ChartPlotKind::Area) | Some(ChartPlotKind::Surface) => "area",
            Some(ChartPlotKind::Radar) => "radar",
            Some(ChartPlotKind::Stock) => "line",
            Some(ChartPlotKind::Other(_)) | None => "bar",
        }
    }

    /// ORM-06 bridge: this chart in the **`wo-chart` editable model's serde
    /// JSON contract** (`wo_chart::model::Chart`: snake_case `kind`,
    /// `series` with `data` points, `axes`, `legend`, `title`,
    /// `data_labels`, per-series `trendlines`/`error_bars`).
    ///
    /// The decode side is `wo_chart::model::Chart::from_bridge_json` — the
    /// two crates intentionally stay dependency-free and exchange charts
    /// through this JSON contract (no crate graph edge exists between
    /// wo-ooxml and wo-chart, and neither Cargo.toml is allowed to change
    /// in this task). All series across plot groups are merged in document
    /// order; the primary plot group decides the chart kind.
    pub fn to_chart_json(&self) -> String {
        self.to_chart_model_value().to_string()
    }

    /// `serde_json::Value` form of [`ChartSpace::to_chart_json`].
    pub fn to_chart_model_value(&self) -> serde_json::Value {
        let mut series_values = Vec::new();
        let mut data_labels = None;
        for plot in &self.chart.plot_area.plots {
            for ser in &plot.series {
                let mut points = Vec::new();
                if plot.kind == ChartPlotKind::Scatter || plot.kind == ChartPlotKind::Bubble {
                    // x/y pairs: the x value becomes the point category.
                    let xs = ser.x_values.as_ref().map(|d| &d.points);
                    let ys = ser.y_values.as_ref().map(|d| &d.points).or_else(|| {
                        ser.values.as_ref().map(|d| &d.points)
                    });
                    if let (Some(xs), Some(ys)) = (xs, ys) {
                        for i in 0..xs.len().max(ys.len()) {
                            let x = xs.get(i).and_then(|p| p.value);
                            let y = ys.get(i).and_then(|p| p.value).unwrap_or(0.0);
                            let mut point = serde_json::json!({ "value": y });
                            if let Some(x) = x {
                                point["category"] = serde_json::json!(chart_num_repr(x));
                            }
                            points.push(point);
                        }
                    }
                } else {
                    let cats = ser.categories.as_ref().map(|c| &c.points);
                    let vals = ser.values.as_ref().map(|d| &d.points);
                    if let Some(vals) = vals {
                        for i in 0..vals.len().max(cats.map(|c| c.len()).unwrap_or(0)) {
                            let value = vals.get(i).and_then(|p| p.value).unwrap_or(0.0);
                            let mut point = serde_json::json!({ "value": value });
                            if let Some(cat) =
                                cats.and_then(|c| c.get(i)).and_then(|p| p.value.as_deref())
                            {
                                point["category"] = serde_json::json!(cat);
                            }
                            points.push(point);
                        }
                    }
                }
                let mut series = serde_json::json!({
                    "name": ser.name.clone().unwrap_or_else(|| format!("Series {}", ser.idx + 1)),
                    "data": points,
                    "visible": true,
                });
                if let Some(ref color) = ser.fill_color {
                    series["color"] = serde_json::json!(format!("#{}", color.trim_start_matches('#')));
                }
                if !ser.trendlines.is_empty() {
                    series["trendlines"] = serde_json::json!(ser.trendlines.iter().map(trendline_value).collect::<Vec<_>>());
                }
                if !ser.error_bars.is_empty() {
                    series["error_bars"] = serde_json::json!(ser.error_bars.iter().map(err_bar_value).collect::<Vec<_>>());
                }
                series_values.push(series);
            }
            if data_labels.is_none() {
                data_labels = plot
                    .d_lbls
                    .as_ref()
                    .or_else(|| plot.series.first().and_then(|s| s.d_lbls.as_ref()))
                    .map(dlbls_value);
            }
        }

        let mut axes_values = Vec::new();
        for axis in &self.chart.plot_area.axes {
            let position = match (axis.kind, axis.ax_pos.as_deref()) {
                (ChartAxisKind::Value, Some("r")) => "right",
                (ChartAxisKind::Value, _) => "left",
                (_, Some("t")) => "top",
                (_, Some("b")) => "bottom",
                _ => "bottom",
            };
            let mut axis_value = serde_json::json!({
                "position": position,
                "scale": if axis.scaling.log_base.is_some() { "log" } else { "linear" },
                "show_gridlines": axis.major_gridlines,
                "show_labels": axis.tick_label_position.as_deref() != Some("none"),
            });
            if let Some(ref title) = axis.title {
                axis_value["title"] = serde_json::json!(title);
            }
            if let Some(v) = axis.scaling.min {
                axis_value["min"] = serde_json::json!(v);
            }
            if let Some(v) = axis.scaling.max {
                axis_value["max"] = serde_json::json!(v);
            }
            axes_values.push(axis_value);
        }

        let mut value = serde_json::json!({
            "kind": self.chart_kind_name(),
            "series": series_values,
            "axes": axes_values,
        });
        if let Some(ref legend) = self.chart.legend {
            value["legend"] = serde_json::json!({
                "position": match legend.position.as_deref() {
                    Some("t") => "top",
                    Some("tr") => "top_right",
                    Some("l") => "left",
                    Some("r") => "right",
                    _ => "bottom",
                },
                "visible": true,
            });
        }
        if let Some(title) = self.chart.title.as_ref().and_then(|t| t.text.clone()) {
            value["title"] = serde_json::json!({ "text": title, "visible": true });
        }
        if let Some(dl) = data_labels {
            value["data_labels"] = dl;
        }
        value
    }
}

/// f64 without a trailing `.0`, matching what the chart caches carry.
fn chart_num_repr(v: f64) -> String {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        format!("{}", v as i64)
    } else {
        format!("{}", v)
    }
}

/// OOXML trendline type name → the wo-chart `TrendlineKind` name.
fn trendline_kind_name(ooxml_type: &str) -> &'static str {
    match ooxml_type {
        "exp" => "exponential",
        "log" => "logarithmic",
        "movingAvg" => "moving_average",
        "poly" => "polynomial",
        "power" => "power",
        _ => "linear",
    }
}

fn trendline_value(tl: &ChartTrendline) -> serde_json::Value {
    let mut value = serde_json::json!({
        "kind": trendline_kind_name(&tl.trendline_type),
        "show_r_squared": tl.disp_r_sq,
        "show_equation": tl.disp_eq,
    });
    for (key, v) in [
        ("order", tl.order.map(|v| v as f64)),
        ("period", tl.period.map(|v| v as f64)),
        ("forward", tl.forward),
        ("backward", tl.backward),
        ("intercept", tl.intercept),
    ] {
        if let Some(v) = v {
            value[key] = serde_json::json!(v);
        }
    }
    if let Some(ref name) = tl.name {
        value["name"] = serde_json::json!(name);
    }
    value
}

fn err_bar_value(eb: &ChartErrBar) -> serde_json::Value {
    let mut value = serde_json::json!({
        "direction": if eb.direction == "x" { "x" } else { "y" },
        "bar_type": match eb.err_bar_type.as_str() {
            "minus" => "minus",
            "plus" => "plus",
            _ => "both",
        },
        "value_type": match eb.err_val_type.as_str() {
            "cust" => "custom",
            "percentage" => "percentage",
            "stdDev" => "std_dev",
            "stdErr" => "std_err",
            _ => "fixed",
        },
        "no_end_cap": eb.no_end_cap,
    });
    if let Some(v) = eb.value {
        value["value"] = serde_json::json!(v);
    }
    value
}

fn dlbls_value(dlbls: &ChartDLbls) -> serde_json::Value {
    let any = dlbls.show_val
        || dlbls.show_cat_name
        || dlbls.show_ser_name
        || dlbls.show_percent
        || dlbls.show_bubble_size
        || dlbls.show_legend_key;
    serde_json::json!({
        "visible": !dlbls.deleted && any,
        "show_value": dlbls.show_val,
        "show_category": dlbls.show_cat_name,
        "show_series_name": dlbls.show_ser_name,
        "show_percentage": dlbls.show_percent,
    })
}

/// The built-in theme presets (name/description/palette) shipped with the
/// engine — used as the default `xl/theme/theme1.xml` body.
pub fn builtin_theme_presets() -> Vec<ThemePreset> {
    vec![
        ThemePreset {
            name: "Office".to_string(),
            description: "Default Office theme".to_string(),
            color_scheme: ColorScheme::default(),
            font_scheme: FontScheme::default(),
        },
        ThemePreset {
            name: "Ion".to_string(),
            description: "Clean and modern".to_string(),
            color_scheme: ColorScheme {
                name: "Ion".to_string(),
                colors: vec![
                    ThemeColor {
                        name: "dark1".to_string(),
                        color: "2E4053".to_string(),
                    },
                    ThemeColor {
                        name: "light1".to_string(),
                        color: "FFFFFF".to_string(),
                    },
                    ThemeColor {
                        name: "dark2".to_string(),
                        color: "1B2631".to_string(),
                    },
                    ThemeColor {
                        name: "light2".to_string(),
                        color: "F2F3F4".to_string(),
                    },
                    ThemeColor {
                        name: "accent1".to_string(),
                        color: "5DADE2".to_string(),
                    },
                    ThemeColor {
                        name: "accent2".to_string(),
                        color: "48C9B0".to_string(),
                    },
                    ThemeColor {
                        name: "accent3".to_string(),
                        color: "F5B041".to_string(),
                    },
                    ThemeColor {
                        name: "accent4".to_string(),
                        color: "EC7063".to_string(),
                    },
                    ThemeColor {
                        name: "accent5".to_string(),
                        color: "AF7AC5".to_string(),
                    },
                    ThemeColor {
                        name: "accent6".to_string(),
                        color: "85C1E9".to_string(),
                    },
                    ThemeColor {
                        name: "hlink".to_string(),
                        color: "1A5276".to_string(),
                    },
                    ThemeColor {
                        name: "folHlink".to_string(),
                        color: "7D3C98".to_string(),
                    },
                ],
            },
            font_scheme: FontScheme::default(),
        },
        ThemePreset {
            name: "Retro".to_string(),
            description: "Vintage paper tones".to_string(),
            color_scheme: ColorScheme {
                name: "Retro".to_string(),
                colors: vec![
                    ThemeColor {
                        name: "dark1".to_string(),
                        color: "3E2723".to_string(),
                    },
                    ThemeColor {
                        name: "light1".to_string(),
                        color: "FEF9E7".to_string(),
                    },
                    ThemeColor {
                        name: "dark2".to_string(),
                        color: "4E342E".to_string(),
                    },
                    ThemeColor {
                        name: "light2".to_string(),
                        color: "F8F0D5".to_string(),
                    },
                    ThemeColor {
                        name: "accent1".to_string(),
                        color: "BF360C".to_string(),
                    },
                    ThemeColor {
                        name: "accent2".to_string(),
                        color: "F57F17".to_string(),
                    },
                    ThemeColor {
                        name: "accent3".to_string(),
                        color: "558B2F".to_string(),
                    },
                    ThemeColor {
                        name: "accent4".to_string(),
                        color: "1565C0".to_string(),
                    },
                    ThemeColor {
                        name: "accent5".to_string(),
                        color: "6A1B9A".to_string(),
                    },
                    ThemeColor {
                        name: "accent6".to_string(),
                        color: "D84315".to_string(),
                    },
                    ThemeColor {
                        name: "hlink".to_string(),
                        color: "0039CB".to_string(),
                    },
                    ThemeColor {
                        name: "folHlink".to_string(),
                        color: "7B1FA2".to_string(),
                    },
                ],
            },
            font_scheme: FontScheme::default(),
        },
        ThemePreset {
            name: "Ocean".to_string(),
            description: "Deep blue tones".to_string(),
            color_scheme: ColorScheme {
                name: "Ocean".to_string(),
                colors: vec![
                    ThemeColor {
                        name: "dark1".to_string(),
                        color: "0B2545".to_string(),
                    },
                    ThemeColor {
                        name: "light1".to_string(),
                        color: "F0F8FF".to_string(),
                    },
                    ThemeColor {
                        name: "dark2".to_string(),
                        color: "1A3A5C".to_string(),
                    },
                    ThemeColor {
                        name: "light2".to_string(),
                        color: "D6E4F0".to_string(),
                    },
                    ThemeColor {
                        name: "accent1".to_string(),
                        color: "0077B6".to_string(),
                    },
                    ThemeColor {
                        name: "accent2".to_string(),
                        color: "00B4D8".to_string(),
                    },
                    ThemeColor {
                        name: "accent3".to_string(),
                        color: "90E0EF".to_string(),
                    },
                    ThemeColor {
                        name: "accent4".to_string(),
                        color: "03045E".to_string(),
                    },
                    ThemeColor {
                        name: "accent5".to_string(),
                        color: "48CAE4".to_string(),
                    },
                    ThemeColor {
                        name: "accent6".to_string(),
                        color: "023E8A".to_string(),
                    },
                    ThemeColor {
                        name: "hlink".to_string(),
                        color: "0096C7".to_string(),
                    },
                    ThemeColor {
                        name: "folHlink".to_string(),
                        color: "5E548E".to_string(),
                    },
                ],
            },
            font_scheme: FontScheme::default(),
        },
        ThemePreset {
            name: "Forest".to_string(),
            description: "Natural green palette".to_string(),
            color_scheme: ColorScheme {
                name: "Forest".to_string(),
                colors: vec![
                    ThemeColor {
                        name: "dark1".to_string(),
                        color: "1B4332".to_string(),
                    },
                    ThemeColor {
                        name: "light1".to_string(),
                        color: "F0FFF0".to_string(),
                    },
                    ThemeColor {
                        name: "dark2".to_string(),
                        color: "2D6A4F".to_string(),
                    },
                    ThemeColor {
                        name: "light2".to_string(),
                        color: "D8F3DC".to_string(),
                    },
                    ThemeColor {
                        name: "accent1".to_string(),
                        color: "40916C".to_string(),
                    },
                    ThemeColor {
                        name: "accent2".to_string(),
                        color: "52B788".to_string(),
                    },
                    ThemeColor {
                        name: "accent3".to_string(),
                        color: "95D5B2".to_string(),
                    },
                    ThemeColor {
                        name: "accent4".to_string(),
                        color: "74C69D".to_string(),
                    },
                    ThemeColor {
                        name: "accent5".to_string(),
                        color: "1B4332".to_string(),
                    },
                    ThemeColor {
                        name: "accent6".to_string(),
                        color: "B7E4C7".to_string(),
                    },
                    ThemeColor {
                        name: "hlink".to_string(),
                        color: "2D6A4F".to_string(),
                    },
                    ThemeColor {
                        name: "folHlink".to_string(),
                        color: "1B4332".to_string(),
                    },
                ],
            },
            font_scheme: FontScheme::default(),
        },
    ]
}
