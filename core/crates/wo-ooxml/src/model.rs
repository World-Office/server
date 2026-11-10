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
    /// Verbatim `<w:pict>` subtree captured at parse time (legacy VML
    /// graphics the typed model cannot represent), re-emitted unchanged so
    /// pictures survive a parse-serialize cycle.
    #[serde(default)]
    pub pict: Option<String>,
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
    pub format_scheme: Option<String>,
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

/// A slide master (from ppt/slideMasters/slideMaster*.xml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideMaster {
    pub id: u32,
    pub name: String,
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

/// Built-in Office themes matching PowerPoint defaults.
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
