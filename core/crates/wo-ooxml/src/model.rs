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
    pub slide_masters: Vec<SlideMaster>,
    pub theme: Option<Theme>,
    pub core_properties: CoreProperties,
}

/// A single slide in the presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Slide {
    pub id: u32,
    pub name: String,
    pub shapes: Vec<SlideShape>,
    pub notes: Option<String>,
    #[serde(default)]
    pub transition: Option<SlideTransition>,
    #[serde(default)]
    pub animations: Vec<AnimationData>,
    #[serde(default)]
    pub timing_raw: Option<String>,
}

/// Transition effect types for PPTX slides.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TransitionEffect {
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

impl Default for TransitionEffect {
    fn default() -> Self { Self::None }
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AdvanceMode {
    Manual,
    Timed,
}

impl Default for AdvanceMode {
    fn default() -> Self { Self::Manual }
}

/// Animation data for a single shape on a slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationData {
    pub id: String,
    #[serde(default)]
    pub effect: String,
    #[serde(default)]
    pub category: String,
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
                ThemeColor { name: "dark1".to_string(), color: "000000".to_string() },
                ThemeColor { name: "light1".to_string(), color: "FFFFFF".to_string() },
                ThemeColor { name: "dark2".to_string(), color: "44546A".to_string() },
                ThemeColor { name: "light2".to_string(), color: "E7E6E6".to_string() },
                ThemeColor { name: "accent1".to_string(), color: "4472C4".to_string() },
                ThemeColor { name: "accent2".to_string(), color: "ED7D31".to_string() },
                ThemeColor { name: "accent3".to_string(), color: "A5A5A5".to_string() },
                ThemeColor { name: "accent4".to_string(), color: "FFC000".to_string() },
                ThemeColor { name: "accent5".to_string(), color: "5B9BD5".to_string() },
                ThemeColor { name: "accent6".to_string(), color: "70AD47".to_string() },
                ThemeColor { name: "hlink".to_string(), color: "0563C1".to_string() },
                ThemeColor { name: "folHlink".to_string(), color: "954F72".to_string() },
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
                    ThemeColor { name: "dark1".to_string(), color: "2E4053".to_string() },
                    ThemeColor { name: "light1".to_string(), color: "FFFFFF".to_string() },
                    ThemeColor { name: "dark2".to_string(), color: "1B2631".to_string() },
                    ThemeColor { name: "light2".to_string(), color: "F2F3F4".to_string() },
                    ThemeColor { name: "accent1".to_string(), color: "5DADE2".to_string() },
                    ThemeColor { name: "accent2".to_string(), color: "48C9B0".to_string() },
                    ThemeColor { name: "accent3".to_string(), color: "F5B041".to_string() },
                    ThemeColor { name: "accent4".to_string(), color: "EC7063".to_string() },
                    ThemeColor { name: "accent5".to_string(), color: "AF7AC5".to_string() },
                    ThemeColor { name: "accent6".to_string(), color: "85C1E9".to_string() },
                    ThemeColor { name: "hlink".to_string(), color: "1A5276".to_string() },
                    ThemeColor { name: "folHlink".to_string(), color: "7D3C98".to_string() },
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
                    ThemeColor { name: "dark1".to_string(), color: "3E2723".to_string() },
                    ThemeColor { name: "light1".to_string(), color: "FEF9E7".to_string() },
                    ThemeColor { name: "dark2".to_string(), color: "4E342E".to_string() },
                    ThemeColor { name: "light2".to_string(), color: "F8F0D5".to_string() },
                    ThemeColor { name: "accent1".to_string(), color: "BF360C".to_string() },
                    ThemeColor { name: "accent2".to_string(), color: "F57F17".to_string() },
                    ThemeColor { name: "accent3".to_string(), color: "558B2F".to_string() },
                    ThemeColor { name: "accent4".to_string(), color: "1565C0".to_string() },
                    ThemeColor { name: "accent5".to_string(), color: "6A1B9A".to_string() },
                    ThemeColor { name: "accent6".to_string(), color: "D84315".to_string() },
                    ThemeColor { name: "hlink".to_string(), color: "0039CB".to_string() },
                    ThemeColor { name: "folHlink".to_string(), color: "7B1FA2".to_string() },
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
                    ThemeColor { name: "dark1".to_string(), color: "0B2545".to_string() },
                    ThemeColor { name: "light1".to_string(), color: "F0F8FF".to_string() },
                    ThemeColor { name: "dark2".to_string(), color: "1A3A5C".to_string() },
                    ThemeColor { name: "light2".to_string(), color: "D6E4F0".to_string() },
                    ThemeColor { name: "accent1".to_string(), color: "0077B6".to_string() },
                    ThemeColor { name: "accent2".to_string(), color: "00B4D8".to_string() },
                    ThemeColor { name: "accent3".to_string(), color: "90E0EF".to_string() },
                    ThemeColor { name: "accent4".to_string(), color: "03045E".to_string() },
                    ThemeColor { name: "accent5".to_string(), color: "48CAE4".to_string() },
                    ThemeColor { name: "accent6".to_string(), color: "023E8A".to_string() },
                    ThemeColor { name: "hlink".to_string(), color: "0096C7".to_string() },
                    ThemeColor { name: "folHlink".to_string(), color: "5E548E".to_string() },
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
                    ThemeColor { name: "dark1".to_string(), color: "1B4332".to_string() },
                    ThemeColor { name: "light1".to_string(), color: "F0FFF0".to_string() },
                    ThemeColor { name: "dark2".to_string(), color: "2D6A4F".to_string() },
                    ThemeColor { name: "light2".to_string(), color: "D8F3DC".to_string() },
                    ThemeColor { name: "accent1".to_string(), color: "40916C".to_string() },
                    ThemeColor { name: "accent2".to_string(), color: "52B788".to_string() },
                    ThemeColor { name: "accent3".to_string(), color: "95D5B2".to_string() },
                    ThemeColor { name: "accent4".to_string(), color: "74C69D".to_string() },
                    ThemeColor { name: "accent5".to_string(), color: "1B4332".to_string() },
                    ThemeColor { name: "accent6".to_string(), color: "B7E4C7".to_string() },
                    ThemeColor { name: "hlink".to_string(), color: "2D6A4F".to_string() },
                    ThemeColor { name: "folHlink".to_string(), color: "1B4332".to_string() },
                ],
            },
            font_scheme: FontScheme::default(),
        },
    ]
}
