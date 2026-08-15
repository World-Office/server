use serde::{Deserialize, Deserializer, Serialize, Serializer};

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
}

/// Number format.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxNumFmt {
    /// Format code.
    pub format_code: String,
    /// Format ID.
    pub num_fmt_id: u32,
}

/// Font definition.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct XlsxFill {
    /// Pattern type.
    pub pattern_type: Option<String>,
    /// Foreground color.
    pub fg_color: Option<String>,
    /// Background color.
    pub bg_color: Option<String>,
}

/// Border definition.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
pub enum DocxBlock {
    /// A paragraph block
    Paragraph(DocxParagraph),
    /// A table block
    Table(DocxTable),
    /// An image block
    Image(DocxImage),
}

/// Document body content.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocxBody {
    /// Blocks preserving document order (paragraphs and tables interleaved)
    pub blocks: Vec<DocxBlock>,
}

impl DocxBody {
    /// Create a new empty DocxBody
    pub fn new() -> Self {
        Self { blocks: Vec::new() }
    }

    /// Build a DocxBody from separate paragraph/table vectors. Conversion
    /// code paths that never interleave content use this; tables follow
    /// paragraphs.
    pub fn from_parts(paragraphs: Vec<DocxParagraph>, tables: Vec<DocxTable>) -> Self {
        let mut blocks: Vec<DocxBlock> = paragraphs.into_iter().map(DocxBlock::Paragraph).collect();
        blocks.extend(tables.into_iter().map(DocxBlock::Table));
        Self { blocks }
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
}

/// Kind of tab stop.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TabStopKind {
    /// Left-aligned tab (default).
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

impl Default for TabStopKind {
    fn default() -> Self {
        TabStopKind::Left
    }
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocxTable {
    pub rows: Vec<DocxTableRow>,
    pub properties: DocxTableProperties,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocxTableRow {
    pub cells: Vec<DocxTableCell>,
    pub height: Option<i32>,
    pub is_header: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocxTableCell {
    pub paragraphs: Vec<DocxParagraph>,
    pub column_span: u32,
    pub row_span: u32,
    pub width: Option<i32>,
    pub shading: Option<String>,
}

/// Styles from word/styles.xml.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocxStyles {
    pub paragraph_styles: Vec<DocxParagraphStyle>,
    pub character_styles: Vec<DocxCharacterStyle>,
    pub table_styles: Vec<DocxTableStyle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxParagraphStyle {
    pub style_id: String,
    pub name: Option<String>,
    pub based_on: Option<String>,
    pub properties: DocxParagraphProperties,
    pub run_properties: DocxRunProperties,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocxRunProperties {
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub font: Option<String>,
    pub font_size: Option<u32>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxCharacterStyle {
    pub style_id: String,
    pub name: Option<String>,
    pub based_on: Option<String>,
    pub properties: DocxRunProperties,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxTableStyle {
    pub style_id: String,
    pub name: Option<String>,
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
            cx: 9144000,
            cy: 6858000,
        }
    }

    /// Widescreen 16:9 slide size (13.33 × 7.5 inches in EMU).
    pub fn widescreen() -> Self {
        Self {
            cx: 12192000,
            cy: 6858000,
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
