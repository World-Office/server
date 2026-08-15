//! Presentation model for the SL (Slide) engine.
//!
//! This module provides a presentation model that implements the SL engine contract.
//! It reuses the PPTX structs concepts from wo-ooxml by defining compatible types.
//!
//! The model supports:
//! - Presentation with slides, masters, and themes
//! - Slide shapes (text boxes, pictures, tables, charts, connectors, auto-shapes, placeholders)
//! - Slide transitions and animations
//! - Full serde serialization/deserialization

use serde::{Deserialize, Serialize};

/// A complete presentation document.
///
/// Matches the SL engine contract: Presentation { slides, masters, theme }
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Presentation {
    /// Slide dimensions (default: 4:3 standard)
    #[serde(default = "SlideSize::standard")]
    pub slide_size: SlideSize,
    /// The slides in this presentation
    pub slides: Vec<Slide>,
    /// The slide masters available for layouts
    pub masters: Vec<Master>,
    /// The theme (colors, fonts, effects)
    pub theme: Option<Theme>,
}

impl Default for Presentation {
    fn default() -> Self {
        Self {
            slide_size: SlideSize::standard(),
            slides: Vec::new(),
            masters: Vec::new(),
            theme: None,
        }
    }
}

impl Presentation {
    /// Create a new empty presentation
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a presentation with a specific slide size
    pub fn with_size(slide_size: SlideSize) -> Self {
        Self {
            slide_size,
            slides: Vec::new(),
            masters: Vec::new(),
            theme: None,
        }
    }

    /// Add a slide to the presentation
    pub fn add_slide(&mut self, slide: Slide) {
        self.slides.push(slide);
    }

    /// Add a master to the presentation
    pub fn add_master(&mut self, master: Master) {
        self.masters.push(master);
    }

    /// Set the theme for the presentation
    pub fn set_theme(&mut self, theme: Theme) {
        self.theme = Some(theme);
    }

    /// Get a slide by index
    pub fn get_slide(&self, index: usize) -> Option<&Slide> {
        self.slides.get(index)
    }

    /// Get a slide by index (mutable)
    pub fn get_slide_mut(&mut self, index: usize) -> Option<&mut Slide> {
        self.slides.get_mut(index)
    }

    /// Get a master by index
    pub fn get_master(&self, index: usize) -> Option<&Master> {
        self.masters.get(index)
    }

    /// Check if the presentation is empty
    pub fn is_empty(&self) -> bool {
        self.slides.is_empty()
    }

    /// Get the number of slides
    pub fn len(&self) -> usize {
        self.slides.len()
    }
}

/// A slide master (corresponds to SlideMaster in PPTX/wo-ooxml).
pub type Master = SlideMaster;

/// Slide master definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SlideMaster {
    /// Unique identifier for the master
    pub id: u32,
    /// Master name
    pub name: String,
    /// Slide layouts associated with this master
    pub slide_layouts: Vec<SlideLayout>,
}

/// Slide layout definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SlideLayout {
    /// Unique identifier for the layout
    pub id: u32,
    /// Layout name
    pub name: String,
    /// Layout type (e.g., "title", "title and content")
    pub layout_type: String,
    /// Shapes in the layout
    pub shapes: Vec<Shape>,
    /// Placeholder types for this layout
    pub placeholder_types: Vec<String>,
}

/// A single slide in the presentation.
///
/// Matches the SL engine contract: Slide { layout_id, shapes, transition, bg }
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Slide {
    /// Unique slide identifier
    pub id: u32,
    /// Slide name
    pub name: String,
    /// ID of the slide layout this slide uses
    #[serde(default)]
    pub layout_id: Option<String>,
    /// ID of the slide master this slide inherits from
    #[serde(default)]
    pub master_id: Option<String>,
    /// Shapes on this slide
    pub shapes: Vec<Shape>,
    /// Speaker notes
    #[serde(default)]
    pub notes: Option<String>,
    /// Slide transition
    #[serde(default)]
    pub transition: Option<SlideTransition>,
    /// Animation data for shapes on this slide
    #[serde(default)]
    pub animations: Vec<AnimationData>,
    /// Raw timing data (XML string)
    #[serde(default)]
    pub timing_raw: Option<String>,
    /// Slide background
    #[serde(default)]
    pub background: Option<SlideBackground>,
}

/// Shape types that can appear on a slide.
///
/// Matches the SL engine contract Shape enum.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Shape {
    /// A text box shape
    TextBox(TextBoxShape),
    /// A picture/image shape
    Picture(PictureShape),
    /// A placeholder shape (title, subtitle, content, etc.)
    Placeholder(PlaceholderShape),
    /// A table shape
    Table(TableShape),
    /// A connector shape (line connecting other shapes)
    Connector(ConnectorShape),
    /// A chart shape (reference to a chart)
    Chart(ChartRef),
    /// An auto-shape (predefined geometry)
    Auto(AutoShape),
    /// A SmartArt diagram shape
    SmartArt(SmartArtShape),
}

/// A text box shape on a slide.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlaceholderShape {
    pub id: String,
    pub bounds: Bounds,
    pub placeholder_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_body: Option<TextBody>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<Fill>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<EffectList>,
}

/// A table shape on a slide.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TableShape {
    pub id: String,
    pub bounds: Bounds,
    pub columns: Vec<TableColumn>,
    pub rows: Vec<TableRow>,
}

/// A column definition in a table.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TableColumn {
    pub width: i64,
}

/// A row in a table.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TableRow {
    pub height: i64,
    pub cells: Vec<TableCell>,
}

/// A single cell in a table.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TableCell {
    pub text_body: TextBody,
    pub row_span: Option<i64>,
    pub col_span: Option<i64>,
    pub fill_color: Option<String>,
}

/// A connector/cxnSp shape — line with optional arrowheads connecting shapes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// Reference to a chart (for embedding in slides).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChartRef {
    /// Unique identifier for the chart
    pub id: String,
    /// Chart type (e.g., "bar", "line", "pie")
    pub chart_type: String,
    /// Bounds of the chart on the slide
    pub bounds: Bounds,
}

/// An auto-shape with predefined geometry.
///
/// Represents one of the 187 DrawingML preset shapes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutoShape {
    /// Unique identifier
    pub id: String,
    /// Bounds of the shape
    pub bounds: Bounds,
    /// The preset shape type (e.g., "rect", "roundRect", "ellipse")
    pub preset_type: String,
    /// Text body content (optional)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_body: Option<TextBody>,
    /// Fill properties
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<Fill>,
    /// Visual effects
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<EffectList>,
}

/// A SmartArt diagram shape on a slide.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SmartArtShape {
    pub id: String,
    pub bounds: Bounds,
    pub diagram_type: String,
    pub data_layout: String,
}

/// 2D bounds in EMU units (1/914400 inch).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i64,
    pub y: i64,
    pub cx: i64,
    pub cy: i64,
}

/// Text content for a shape.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct TextBody {
    pub paragraphs: Vec<DocxParagraph>,
}

/// Background for a slide (solid, gradient, or image).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SlideBackground {
    pub background_type: SlideBackgroundType,
    pub color: Option<String>,
    pub gradient_stops: Option<Vec<GradientStop>>,
    pub gradient_angle: Option<f64>,
    pub image_data: Option<Vec<u8>>,
}

/// Background type.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
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

/// Fill type for a shape — solid color or gradient.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Fill {
    /// Solid color fill (#RRGGBB or named).
    Solid(String),
    /// Gradient fill with stops and angle.
    Gradient(GradientFill),
}

/// A gradient fill definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradientFill {
    /// Linear or radial gradient.
    pub kind: GradientKind,
    /// Color stops (position 0.0–1.0, hex color).
    pub stops: Vec<GradientStop>,
    /// Rotation angle in degrees (0 = left→right).
    pub angle: f64,
}

/// Kind of gradient.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum GradientKind {
    /// Linear gradient along an angle.
    Linear,
    /// Radial gradient from center outward.
    Radial,
}

/// A single color stop in a gradient.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradientStop {
    /// Position 0.0–1.0.
    pub position: f64,
    /// Hex color (#RRGGBB).
    pub color: String,
}

/// List of visual effects applied to a shape.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct EffectList {
    /// Outer shadow effect.
    pub shadow: Option<ShadowEffect>,
    /// Glow effect.
    pub glow: Option<GlowEffect>,
    /// Reflection effect.
    pub reflection: Option<ReflectionEffect>,
}

/// Shadow effect applied to a shape.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GlowEffect {
    /// Blur radius in EMU.
    pub radius: i64,
    /// Glow color (#RRGGBB).
    pub color: String,
    /// Opacity 0.0–1.0.
    pub opacity: f64,
}

/// Reflection effect applied to a shape.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// Slide dimensions.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
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

/// A theme (from ppt/theme/theme*.xml) defining colors, fonts, effects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ThemeColor {
    pub name: String,
    pub color: String,
}

/// Font scheme from a theme (a:fontScheme).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ThemeFont {
    pub latin: Option<String>,
    pub east_asian: Option<String>,
    pub complex_script: Option<String>,
}

/// errors for presentation model operations
#[derive(Debug, Clone, thiserror::Error, PartialEq)]
pub enum ModelError {
    /// Slide index out of range
    #[error("Slide index {0} out of range (len={1})")]
    SlideOutOfRange(usize, usize),
    /// Shape index out of range
    #[error("Shape index {0} out of range (len={1})")]
    ShapeOutOfRange(usize, usize),
    /// Invalid operation
    #[error("Invalid operation: {0}")]
    InvalidOperation(String),
}

/// DOCX paragraph structure for text in shapes
/// (Reused from wo-ooxml concepts for compatibility)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocxParagraph {
    pub style_id: Option<String>,
    pub properties: DocxParagraphProperties,
    pub runs: Vec<DocxRun>,
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextAlignment {
    Left,
    Center,
    Right,
    Both,
}

/// A run of text with formatting.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DocxRun {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: Option<String>,
    pub strikethrough: bool,
    pub font: Option<String>,
    pub font_size: Option<u32>,
    pub color: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a minimal test presentation with one slide
    fn create_test_presentation() -> Presentation {
        Presentation {
            slide_size: SlideSize::standard(),
            slides: vec![Slide {
                id: 1,
                name: "Slide 1".to_string(),
                layout_id: Some("title".to_string()),
                master_id: Some("master1".to_string()),
                shapes: vec![],
                notes: None,
                transition: None,
                animations: vec![],
                timing_raw: None,
                background: None,
            }],
            masters: vec![],
            theme: None,
        }
    }

    #[test]
    fn test_presentation_default() {
        let pres = Presentation::default();
        assert!(pres.is_empty());
        assert_eq!(pres.len(), 0);
        assert_eq!(pres.slide_size.cx, SlideSize::standard().cx);
        assert_eq!(pres.slide_size.cy, SlideSize::standard().cy);
    }

    #[test]
    fn test_presentation_with_size() {
        let size = SlideSize {
            cx: 12192000, // 16:9
            cy: 6858000,
        };
        let pres = Presentation::with_size(size);
        assert_eq!(pres.slide_size.cx, 12192000);
        assert_eq!(pres.slide_size.cy, 6858000);
    }

    #[test]
    fn test_add_slide() {
        let mut pres = Presentation::new();
        assert_eq!(pres.len(), 0);

        let slide = Slide {
            id: 1,
            name: "Test Slide".to_string(),
            layout_id: None,
            master_id: None,
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: None,
        };
        pres.add_slide(slide);
        assert_eq!(pres.len(), 1);
        assert!(!pres.is_empty());
    }

    #[test]
    fn test_get_slide() {
        let mut pres = Presentation::new();
        let slide = Slide {
            id: 1,
            name: "Test Slide".to_string(),
            layout_id: None,
            master_id: None,
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: None,
        };
        pres.add_slide(slide);

        assert!(pres.get_slide(0).is_some());
        assert_eq!(pres.get_slide(0).unwrap().name, "Test Slide");
        assert!(pres.get_slide(1).is_none());
    }

    #[test]
    fn test_add_master() {
        let mut pres = Presentation::new();
        let master = SlideMaster {
            id: 1,
            name: "Title Master".to_string(),
            slide_layouts: vec![],
        };
        pres.add_master(master);
        assert_eq!(pres.masters.len(), 1);
    }

    #[test]
    fn test_set_theme() {
        let mut pres = Presentation::new();
        let theme = Theme {
            name: "Test Theme".to_string(),
            color_scheme: ColorScheme::default(),
            font_scheme: FontScheme::default(),
            format_scheme: None,
        };
        pres.set_theme(theme);
        assert!(pres.theme.is_some());
        assert_eq!(pres.theme.as_ref().unwrap().name, "Test Theme");
    }

    #[test]
    fn test_presentation_serde_roundtrip() {
        let pres = create_test_presentation();

        // Serialize to JSON
        let json = serde_json::to_string(&pres).expect("Failed to serialize");

        // Deserialize back
        let pres2: Presentation = serde_json::from_str(&json).expect("Failed to deserialize");

        // Verify roundtrip
        assert_eq!(pres.slides.len(), pres2.slides.len());
        assert_eq!(pres.slides[0].id, pres2.slides[0].id);
        assert_eq!(pres.slides[0].name, pres2.slides[0].name);
    }

    #[test]
    fn test_shape_serde_roundtrip() {
        // Test TextBox shape
        let text_box = Shape::TextBox(TextBoxShape {
            id: "txt1".to_string(),
            bounds: Bounds {
                x: 100,
                y: 100,
                cx: 1000,
                cy: 500,
            },
            text_body: TextBody { paragraphs: vec![] },
            fill: None,
            effect: None,
        });

        let json = serde_json::to_string(&text_box).expect("Failed to serialize TextBox");
        let shape2: Shape = serde_json::from_str(&json).expect("Failed to deserialize TextBox");

        match shape2 {
            Shape::TextBox(t) => {
                assert_eq!(t.id, "txt1");
                assert_eq!(t.bounds.x, 100);
            }
            _ => panic!("Expected TextBox shape"),
        }
    }

    #[test]
    fn test_chart_ref_serde() {
        let chart_ref = ChartRef {
            id: "chart1".to_string(),
            chart_type: "bar".to_string(),
            bounds: Bounds {
                x: 200,
                y: 200,
                cx: 2000,
                cy: 1500,
            },
        };

        let json = serde_json::to_string(&chart_ref).expect("Failed to serialize ChartRef");
        let chart_ref2: ChartRef =
            serde_json::from_str(&json).expect("Failed to deserialize ChartRef");

        assert_eq!(chart_ref.id, chart_ref2.id);
        assert_eq!(chart_ref.chart_type, chart_ref2.chart_type);
        assert_eq!(chart_ref.bounds.cx, chart_ref2.bounds.cx);
    }

    #[test]
    fn test_auto_shape_serde() {
        let auto_shape = AutoShape {
            id: "auto1".to_string(),
            bounds: Bounds {
                x: 0,
                y: 0,
                cx: 1000,
                cy: 1000,
            },
            preset_type: "ellipse".to_string(),
            text_body: None,
            fill: Some(Fill::Solid("FF0000".to_string())),
            effect: None,
        };

        let json = serde_json::to_string(&auto_shape).expect("Failed to serialize AutoShape");
        let auto_shape2: AutoShape =
            serde_json::from_str(&json).expect("Failed to deserialize AutoShape");

        assert_eq!(auto_shape.id, auto_shape2.id);
        assert_eq!(auto_shape.preset_type, auto_shape2.preset_type);
        match auto_shape2.fill.unwrap() {
            Fill::Solid(color) => assert_eq!(color, "FF0000"),
            _ => panic!("Expected solid fill"),
        }
    }

    #[test]
    fn test_slide_size_serde() {
        let widescreen = SlideSize::widescreen();
        let json = serde_json::to_string(&widescreen).expect("Failed to serialize SlideSize");
        let size2: SlideSize =
            serde_json::from_str(&json).expect("Failed to deserialize SlideSize");

        assert_eq!(widescreen.cx, size2.cx);
        assert_eq!(widescreen.cy, size2.cy);
    }

    #[test]
    fn test_model_error_display() {
        let err = ModelError::SlideOutOfRange(10, 5);
        let display = format!("{}", err);
        assert!(display.contains("10"));
        assert!(display.contains("5"));
        assert!(display.contains("out of range"));
    }

    #[test]
    fn test_presentation_with_masters_serde() {
        let mut pres = Presentation::new();

        let master = SlideMaster {
            id: 1,
            name: "Title Master".to_string(),
            slide_layouts: vec![SlideLayout {
                id: 1,
                name: "Title Layout".to_string(),
                layout_type: "title".to_string(),
                shapes: vec![],
                placeholder_types: vec!["title".to_string()],
            }],
        };
        pres.add_master(master);

        let json = serde_json::to_string(&pres).expect("Failed to serialize with masters");
        let pres2: Presentation =
            serde_json::from_str(&json).expect("Failed to deserialize with masters");

        assert_eq!(pres.masters.len(), pres2.masters.len());
        assert_eq!(pres.masters[0].name, pres2.masters[0].name);
    }

    #[test]
    fn test_presentation_with_background_serde() {
        let mut pres = Presentation::new();

        let slide = Slide {
            id: 1,
            name: "Slide 1".to_string(),
            layout_id: None,
            master_id: None,
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: Some(SlideBackground {
                background_type: SlideBackgroundType::Solid,
                color: Some("FF0000".to_string()),
                gradient_stops: None,
                gradient_angle: None,
                image_data: None,
            }),
        };
        pres.add_slide(slide);

        let json = serde_json::to_string(&pres).expect("Failed to serialize with background");
        let pres2: Presentation =
            serde_json::from_str(&json).expect("Failed to deserialize with background");

        assert!(pres2.slides[0].background.is_some());
        match pres2.slides[0].background.as_ref().unwrap().background_type {
            SlideBackgroundType::Solid => {}
            _ => panic!("Expected solid background"),
        }
    }

    #[test]
    fn test_presentation_with_transition_serde() {
        let mut pres = Presentation::new();

        let slide = Slide {
            id: 1,
            name: "Slide 1".to_string(),
            layout_id: None,
            master_id: None,
            shapes: vec![],
            notes: None,
            transition: Some(SlideTransition {
                effect: TransitionEffect::Fade,
                duration: 1.0,
                advance_mode: AdvanceMode::Manual,
                advance_timing: 0.0,
            }),
            animations: vec![],
            timing_raw: None,
            background: None,
        };
        pres.add_slide(slide);

        let json = serde_json::to_string(&pres).expect("Failed to serialize with transition");
        let pres2: Presentation =
            serde_json::from_str(&json).expect("Failed to deserialize with transition");

        assert!(pres2.slides[0].transition.is_some());
        assert_eq!(
            pres2.slides[0].transition.as_ref().unwrap().effect,
            TransitionEffect::Fade
        );
    }

    #[test]
    fn test_connector_shape_type_display() {
        assert_eq!(
            format!("{}", ConnectorShapeType::Straight),
            "straightConnector1"
        );
        assert_eq!(format!("{}", ConnectorShapeType::Bent1), "bentConnector2");
        assert_eq!(
            format!("{}", ConnectorShapeType::Curved1),
            "curvedConnector2"
        );
    }

    #[test]
    fn test_master_type_alias() {
        let master: Master = SlideMaster {
            id: 1,
            name: "Test Master".to_string(),
            slide_layouts: vec![],
        };
        assert_eq!(master.name, "Test Master");
    }

    #[test]
    fn test_presentation_contract_compliance() {
        // Test that the model matches the SL-1 contract:
        // Presentation { slides: Vec<Slide>, masters: Vec<Master>, theme: Theme }

        let slides = vec![Slide {
            id: 1,
            name: "Slide 1".to_string(),
            layout_id: Some("layout1".to_string()),
            master_id: Some("master1".to_string()),
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: None,
        }];

        let masters = vec![SlideMaster {
            id: 1,
            name: "Master 1".to_string(),
            slide_layouts: vec![],
        }];

        let theme = Theme {
            name: "Test Theme".to_string(),
            color_scheme: ColorScheme::default(),
            font_scheme: FontScheme::default(),
            format_scheme: None,
        };

        let pres = Presentation {
            slide_size: SlideSize::standard(),
            slides,
            masters,
            theme: Some(theme),
        };

        // Verify the structure matches the contract
        assert_eq!(pres.slides.len(), 1);
        assert_eq!(pres.masters.len(), 1);
        assert!(pres.theme.is_some());

        // Verify Slide has the required fields from contract
        assert!(pres.slides[0].layout_id.is_some());
        assert!(pres.slides[0].master_id.is_some());
        assert!(pres.slides[0].shapes.is_empty());
        assert!(pres.slides[0].transition.is_none());
        assert!(pres.slides[0].background.is_none());
    }

    #[test]
    fn test_shape_enum_completeness() {
        // Test that Shape enum has all required variants from SL-1 contract
        // TextBox, Picture, Table, Chart, Connector, Auto, Placeholder

        let shapes: Vec<Shape> = vec![
            Shape::TextBox(TextBoxShape {
                id: "txt".to_string(),
                bounds: Bounds {
                    x: 0,
                    y: 0,
                    cx: 100,
                    cy: 100,
                },
                text_body: TextBody { paragraphs: vec![] },
                fill: None,
                effect: None,
            }),
            Shape::Picture(PictureShape {
                id: "pic".to_string(),
                bounds: Bounds {
                    x: 0,
                    y: 0,
                    cx: 100,
                    cy: 100,
                },
                name: "test".to_string(),
                image_extension: "png".to_string(),
                image_data: vec![],
                effect: None,
            }),
            Shape::Table(TableShape {
                id: "tbl".to_string(),
                bounds: Bounds {
                    x: 0,
                    y: 0,
                    cx: 100,
                    cy: 100,
                },
                columns: vec![],
                rows: vec![],
            }),
            Shape::Chart(ChartRef {
                id: "chart".to_string(),
                chart_type: "bar".to_string(),
                bounds: Bounds {
                    x: 0,
                    y: 0,
                    cx: 100,
                    cy: 100,
                },
            }),
            Shape::Connector(ConnectorShape {
                id: "conn".to_string(),
                bounds: Bounds {
                    x: 0,
                    y: 0,
                    cx: 100,
                    cy: 100,
                },
                connector_type: ConnectorShapeType::Straight,
                line_width: None,
                has_start_arrow: false,
                has_end_arrow: false,
                fill: None,
                effect: None,
            }),
            Shape::Auto(AutoShape {
                id: "auto".to_string(),
                bounds: Bounds {
                    x: 0,
                    y: 0,
                    cx: 100,
                    cy: 100,
                },
                preset_type: "rect".to_string(),
                text_body: None,
                fill: None,
                effect: None,
            }),
            Shape::Placeholder(PlaceholderShape {
                id: "ph".to_string(),
                bounds: Bounds {
                    x: 0,
                    y: 0,
                    cx: 100,
                    cy: 100,
                },
                placeholder_type: "title".to_string(),
                text_body: None,
                fill: None,
                effect: None,
            }),
        ];

        assert_eq!(shapes.len(), 7); // All 7 shape types from contract
    }
}
