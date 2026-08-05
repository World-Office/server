//! WoVisioDiagram model — JSON-compatible with the frontend Visio format.
//!
//! This is the bridge between the frontend Visio JSON format
//! and the wo-visio `VisioModel` model used for VSDX serialization.
//! Format name: "wo-visio-diagram" / "vsdx"

use serde::{Deserialize, Serialize};

/// A complete Visio diagram, matching the frontend shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoVisioDiagram {
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub pages: Vec<WoVisioPage>,
}

/// A single page in the Visio diagram.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoVisioPage {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub shapes: Vec<WoVisioShape>,
    #[serde(default)]
    pub connectors: Vec<WoVisioConnector>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_page_id: Option<String>,
}

/// A shape on a Visio page, matching frontend expectations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoVisioShape {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub rotation: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geometry: Option<WoVisioGeometry>,
    #[serde(default)]
    pub sub_shapes: Vec<WoVisioShape>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
}

/// Geometry section for a Visio shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoVisioGeometry {
    #[serde(default)]
    pub segments: Vec<WoVisioGeoSegment>,
}

/// A single geometry segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WoVisioGeoSegment {
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
    },
    EllipticalArcTo {
        x: f64,
        y: f64,
    },
    BezierTo {
        x: f64,
        y: f64,
    },
    PolylineTo {
        x: f64,
        y: f64,
        points: Vec<(f64, f64)>,
    },
    /// NURBS (non-uniform rational B-spline) curve.
    NURBSTo {
        x: f64,
        y: f64,
        knots: Vec<f64>,
        weights: Vec<f64>,
    },
    /// Spline start (degree-n B-spline).
    SplineStart {
        x: f64,
        y: f64,
        degree: u32,
        knots: Vec<f64>,
    },
    Rectangle {
        w: f64,
        h: f64,
    },
    Ellipse {
        x: f64,
        y: f64,
        cx: f64,
        cy: f64,
    },
    InfiniteLine {
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
    },
}

/// A connector line between shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoVisioConnector {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_shape_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_shape_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}
