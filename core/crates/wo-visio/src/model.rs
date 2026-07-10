use serde::{Deserialize, Serialize};

/// Top-level Visio document produced by parsing a VSDX file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisioDocument {
    pub version: String,
    pub properties: VisioProperties,
    pub pages: Vec<VisioPage>,
    pub masters: Vec<VisioMaster>,
    pub theme_colors: Vec<ThemeColor>,
}

/// Core document properties (from docProps).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VisioProperties {
    pub title: Option<String>,
    pub subject: Option<String>,
    pub creator: Option<String>,
    pub description: Option<String>,
}

/// A single Visio page (equivalent to a drawing tab).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisioPage {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub shapes: Vec<VisioShape>,
    pub connectors: Vec<VisioConnector>,
    pub background_page_id: Option<String>,
}

/// A shape on a Visio page or master.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisioShape {
    pub id: String,
    pub name: Option<String>,
    pub unique_id: Option<String>,
    pub master_id: Option<String>,
    /// PinX (pivot X) in inches.
    pub x: f64,
    /// PinY (pivot Y) in inches.
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Angle in degrees.
    pub rotation: f64,
    pub text: Option<String>,
    pub fill_color: Option<String>,
    pub fill_foreground: Option<String>,
    pub fill_background: Option<String>,
    pub stroke_color: Option<String>,
    pub stroke_width: Option<f64>,
    pub stroke_pattern: Option<u32>,
    pub shadow_color: Option<String>,
    pub shadow_offset_x: Option<f64>,
    pub shadow_offset_y: Option<f64>,
    pub layer_member: Option<String>,
    pub geometry: Option<VisioGeometry>,
    pub sub_shapes: Vec<VisioShape>,
    pub style: Option<String>,
    pub formatting: Option<VisioFormatting>,
}

/// Geometry section for a shape (MoveTo/LineTo/etc. segments).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisioGeometry {
    pub width: f64,
    pub height: f64,
    pub segments: Vec<GeoSegment>,
}

/// A single segment in a shape's geometry section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum GeoSegment {
    MoveTo {
        x: f64,
        y: f64,
    },
    LineTo {
        x: f64,
        y: f64,
    },
    ArcTo {
        x: f64,
        y: f64,
        a: f64,
        b: f64,
        c: f64,
    },
    EllipticalArcTo {
        x: f64,
        y: f64,
        a: f64,
        b: f64,
        c: f64,
        d: f64,
    },
    NURBSTo {
        x: f64,
        y: f64,
        knots: Vec<f64>,
        weights: Vec<f64>,
    },
    PolylineTo {
        x: f64,
        y: f64,
        points: Vec<(f64, f64)>,
    },
    BezierTo {
        x: f64,
        y: f64,
        a: f64,
        b: f64,
        c: f64,
        d: f64,
    },
    SplineStart {
        x: f64,
        y: f64,
        degree: u32,
        knots: Vec<f64>,
    },
    InfiniteLine {
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
    },
    Ellipse {
        x: f64,
        y: f64,
        cx: f64,
        cy: f64,
    },
    Rectangle {
        w: f64,
        h: f64,
    },
}

/// A connector (dynamic glue line) between shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisioConnector {
    pub id: String,
    pub name: Option<String>,
    pub from_shape_id: Option<String>,
    pub to_shape_id: Option<String>,
    pub from_connection: Option<String>,
    pub to_connection: Option<String>,
    pub arrow_type: Option<String>,
    pub routing_style: Option<u32>,
    pub geometry: Option<VisioGeometry>,
    pub text: Option<String>,
}

/// A master stencil (reusable shape template from the stencil).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisioMaster {
    pub id: String,
    pub name: String,
    pub unique_id: Option<String>,
    pub shapes: Vec<VisioShape>,
    pub connectors: Vec<VisioConnector>,
    /// Icon preview bytes (PNG or similar).
    pub icon: Option<Vec<u8>>,
}

/// A theme color definition from visio/colors.xml.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColor {
    pub index: u32,
    pub rgb: String,
    pub name: Option<String>,
}

/// Text and font formatting for a shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisioFormatting {
    pub font: Option<String>,
    pub font_size: Option<f64>,
    pub font_color: Option<String>,
    pub italic: Option<bool>,
    pub bold: Option<bool>,
    pub underline: Option<bool>,
    pub align_horizontal: Option<String>,
    pub align_vertical: Option<String>,
    pub tlbr: Option<String>,
}
