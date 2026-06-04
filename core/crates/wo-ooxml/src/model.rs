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
    pub body: Option<DocxBody>,
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

// --- DOCX Body Model ---

/// Document body content.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocxBody {
    pub paragraphs: Vec<DocxParagraph>,
    pub tables: Vec<DocxTable>,
}

/// A paragraph in the document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxParagraph {
    /// Paragraph style name.
    pub style_id: Option<String>,
    /// Paragraph-level properties (alignment, spacing, indentation).
    pub properties: DocxParagraphProperties,
    /// Runs within this paragraph.
    pub runs: Vec<DocxRun>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxTable {
    pub rows: Vec<DocxTableRow>,
    pub properties: DocxTableProperties,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocxTableProperties {
    pub width: Option<i32>,
    pub indent: Option<i32>,
    pub alignment: Option<TextAlignment>,
    pub borders: Option<DocxTableBorders>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocxTableBorders {
    pub top: Option<DocxBorder>,
    pub left: Option<DocxBorder>,
    pub bottom: Option<DocxBorder>,
    pub right: Option<DocxBorder>,
    pub inside_h: Option<DocxBorder>,
    pub inside_v: Option<DocxBorder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxBorder {
    pub style: String, // single, double, dashed, etc.
    pub size: Option<u32>,
    pub color: Option<String>,
    pub space: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxTableRow {
    pub cells: Vec<DocxTableCell>,
    pub height: Option<i32>,
    pub is_header: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub core_properties: CoreProperties,
}

/// A single slide in the presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Slide {
    pub id: u32,
    pub name: String,
    pub shapes: Vec<SlideShape>,
    pub notes: Option<String>,
}

/// Shape types that can appear on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SlideShape {
    TextBox(TextBoxShape),
    Picture(PictureShape),
    Placeholder(PlaceholderShape),
}

/// A text box shape on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBoxShape {
    pub id: String,
    pub bounds: Bounds,
    pub text_body: TextBody,
}

/// An image shape on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PictureShape {
    pub id: String,
    pub bounds: Bounds,
    pub name: String,
    pub image_extension: String,
    pub image_data: Vec<u8>,
}

/// A placeholder shape (title, subtitle, content).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceholderShape {
    pub id: String,
    pub bounds: Bounds,
    pub placeholder_type: String,
    pub text_body: Option<TextBody>,
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
        Self { cx: 9144000, cy: 6858000 }
    }

    /// Widescreen 16:9 slide size (13.33 × 7.5 inches in EMU).
    pub fn widescreen() -> Self {
        Self { cx: 12192000, cy: 6858000 }
    }
}
