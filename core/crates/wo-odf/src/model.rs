use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// ODF document type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OdfType {
    Text,         // ODT
    Spreadsheet,  // ODS
    Presentation, // ODP
    Drawing,      // ODG
    Chart,        // ODC
    Formula,      // ODF
    Unknown,
}

impl std::fmt::Display for OdfType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OdfType::Text => write!(f, "odt"),
            OdfType::Spreadsheet => write!(f, "ods"),
            OdfType::Presentation => write!(f, "odp"),
            OdfType::Drawing => write!(f, "odg"),
            OdfType::Chart => write!(f, "odc"),
            OdfType::Formula => write!(f, "odf"),
            OdfType::Unknown => write!(f, "odf"),
        }
    }
}

/// Parsed ODF document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfDocument {
    /// Document type (ODT, ODS, ODP, etc.).
    pub doc_type: OdfType,
    /// ODF version (e.g., "1.2", "1.3").
    pub version: String,
    /// Document metadata.
    pub metadata: OdfMetadata,
    /// Document content — text paragraphs for ODT, cell data for ODS, slides for ODP.
    pub content: OdfContent,
    /// Manifest entries (file paths in the ZIP).
    pub manifest: Vec<OdfManifestEntry>,
    /// Font face declarations.
    pub fonts: Vec<OdfFontFace>,
    /// Named styles (go to styles.xml).
    pub styles: Vec<OdfStyle>,
    /// Automatic cell styles for spreadsheets (emitted in content.xml).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub automatic_cell_styles: Vec<OdfStyle>,
}

/// ODF document metadata.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OdfMetadata {
    pub title: Option<String>,
    pub creator: Option<String>,
    pub subject: Option<String>,
    pub description: Option<String>,
    pub keywords: Option<String>,
    pub language: Option<String>,
    pub date: Option<String>,
    pub modified: Option<String>,
    pub generator: Option<String>,
    pub category: Option<String>,
}

/// Document content varies by type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OdfContent {
    /// ODT: paragraphs of text, lists, images, sections
    Text {
        content: Vec<OdfTextContent>,
        page_layouts: Vec<OdfPageLayout>,
        sections: Vec<OdfSection>,
    },
    /// ODS: sheets with cell data
    Spreadsheet { sheets: Vec<SpreadsheetSheet> },
    /// ODP: slides
    Presentation { slides: Vec<PresentationSlide> },
    /// Generic / unknown
    Generic,
}

/// A text paragraph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextParagraph {
    pub text: String,
    pub style_name: Option<String>,
    /// Inline spans with formatting.
    pub spans: Vec<TextSpan>,
}

/// A text heading.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextHeading {
    pub text: String,
    pub level: u32,
    pub style_name: Option<String>,
}

/// An inline text span.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextSpan {
    pub text: String,
    pub style_name: Option<String>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
}

/// A table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfTable {
    pub name: Option<String>,
    pub rows: Vec<TableRow>,
    pub num_columns: usize,
}

/// A table row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableRow {
    pub cells: Vec<TableCell>,
}

/// A table cell.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableCell {
    pub text: String,
    pub row_span: u32,
    pub col_span: u32,
    pub cell_type: CellType,
    pub value: Option<f64>,
}

/// Cell data type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CellType {
    String,
    Number,
    Boolean,
    Date,
    Percentage,
    Currency,
}

/// A spreadsheet sheet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpreadsheetSheet {
    pub name: String,
    pub rows: Vec<SpreadsheetRow>,
    pub max_column: usize,
    /// Column widths (column index -> width in points)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub col_widths: Option<BTreeMap<u32, f32>>,
    /// Row heights (row index -> height in points)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row_heights: Option<BTreeMap<u32, f32>>,
}

impl Default for SpreadsheetSheet {
    fn default() -> Self {
        SpreadsheetSheet {
            name: String::new(),
            rows: Vec::new(),
            max_column: 0,
            col_widths: None,
            row_heights: None,
        }
    }
}

/// A spreadsheet row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpreadsheetRow {
    pub row_num: u32,
    pub cells: Vec<SpreadsheetCell>,
}

/// A spreadsheet cell.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpreadsheetCell {
    pub column: u32,
    pub row: u32,
    pub text: String,
    pub value: Option<f64>,
    pub formula: Option<String>,
    pub cell_type: CellType,
    /// Number of columns this cell spans (for merged cells)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub col_span: Option<u32>,
    /// Number of rows this cell spans (for merged cells)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row_span: Option<u32>,
    /// Style name for this cell (references automatic style in content.xml)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_name: Option<String>,
}

/// A presentation slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationSlide {
    pub name: Option<String>,
    pub text_content: String,
    /// Notes text.
    pub notes: Option<String>,
    /// Shapes on this slide (ODP-specific).
    pub shapes: Vec<OdpShape>,
    /// Slide transition effect.
    pub transition: Option<OdpTransition>,
    /// Reference to a slide layout.
    pub slide_layout: Option<String>,
}

/// A manifest entry from META-INF/manifest.xml.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfManifestEntry {
    pub path: String,
    pub media_type: Option<String>,
    pub full_path: Option<String>,
    pub version: Option<String>,
}

/// A font face declaration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfFontFace {
    pub name: String,
    pub font_family: Option<String>,
    pub font_style: Option<String>,
    pub font_weight: Option<String>,
}

/// An automatic or named style.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfStyle {
    pub name: String,
    pub family: Option<String>,
    pub parent: Option<String>,
    pub display_name: Option<String>,
    pub properties: Vec<(String, String)>,
}

/// A list (ordered or unordered).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfList {
    pub list_style_name: Option<String>,
    pub items: Vec<OdfListItem>,
    pub list_type: OdfListType,
    pub continue_numbering: bool,
    pub start_value: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OdfListType {
    Unordered,
    Ordered,
}

/// A list item, which may contain paragraphs and nested lists.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfListItem {
    pub content: Vec<OdfTextContent>,
    pub nesting_level: u32,
}

/// Content that can appear in text: paragraphs, headings, lists, images, tables.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OdfTextContent {
    Paragraph(TextParagraph),
    Heading(TextHeading),
    List(OdfList),
    Image(OdfImage),
    Table(OdfTable),
}

/// An image reference in the document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfImage {
    pub href: String,
    pub name: Option<String>,
    pub alt_text: Option<String>,
    pub width: Option<String>,
    pub height: Option<String>,
    /// Raw image data extracted from ZIP (if available).
    pub data: Option<Vec<u8>>,
    pub content_type: Option<String>,
}

/// A section in the document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfSection {
    pub name: Option<String>,
    pub style_name: Option<String>,
    pub content: Vec<OdfTextContent>,
    pub protected: bool,
}

/// Page layout properties.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdfPageLayout {
    pub name: String,
    pub page_width: Option<String>,
    pub page_height: Option<String>,
    pub margin_top: Option<String>,
    pub margin_bottom: Option<String>,
    pub margin_left: Option<String>,
    pub margin_right: Option<String>,
    pub orientation: Option<String>,
}

/// ODP shape types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OdpShapeType {
    Rect,
    Ellipse,
    Line,
    Connector,
    TextBox,
    Image,
    CustomShape,
}

/// A shape on an ODP slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdpShape {
    pub id: Option<String>,
    pub shape_type: OdpShapeType,
    pub x: String,
    pub y: String,
    pub width: String,
    pub height: String,
    pub z_index: Option<i32>,
    pub rotation: Option<String>,
    pub fill_color: Option<String>,
    pub stroke_color: Option<String>,
    pub stroke_width: Option<String>,
    pub text_content: Option<String>,
    pub image_ref: Option<OdpImageRef>,
    pub style_name: Option<String>,
}

/// Reference to an image within ODP.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdpImageRef {
    pub href: String,
    pub name: Option<String>,
    pub data: Option<Vec<u8>>,
    pub content_type: Option<String>,
}

/// Slide transition effect.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdpTransition {
    pub type_name: Option<String>,
    pub duration: Option<String>,
    pub direction: Option<String>,
    pub speed: Option<String>,
}
