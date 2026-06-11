//! WoPresentation model — JSON-compatible with the frontend toJSON() output.
//!
//! This is the bridge between the frontend presentation JSON format
//! and the wo-ooxml `PptxPresentation` model used for PPTX serialization.

use serde::{Deserialize, Serialize};

/// A complete presentation, matching the frontend toJSON() shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoPresentation {
    pub version: u32,
    pub slide_size: String,
    #[serde(default)]
    pub theme_type: String,
    #[serde(default)]
    pub theme: Option<WoTheme>,
    pub slides: Vec<WoSlide>,
}

/// A single slide in the presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoSlide {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub layout: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_effect: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_sound_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub advance_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub advance_timing: Option<f64>,
    #[serde(default)]
    pub animations: Vec<WoAnimationData>,
    #[serde(default)]
    pub shapes: Vec<WoShapeData>,
}

/// Animation data for a slide or shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoAnimationData {
    pub id: String,
    pub effect: String,
    pub category: String,
    pub target: String,
    pub start: String,
    pub duration: f64,
    pub delay: f64,
}

/// A single shape on a slide, matching the frontend ShapeData interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoShapeData {
    pub id: String,
    /// Shape type: textbox|rect|ellipse|triangle|diamond|line|arrow|connector|image
    #[serde(rename = "type")]
    pub shape_type: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub z_index: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_data: Option<WoImageData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connector: Option<WoConnectorData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chart: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gradient_fill: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<serde_json::Value>,
}

/// Image data for picture shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoImageData {
    /// Data URL: data:image/png;base64,...
    pub src: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
}

/// Connector metadata for line/arrow shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoConnectorData {
    pub start_shape_id: Option<String>,
    pub end_shape_id: Option<String>,
    pub start_x: f64,
    pub start_y: f64,
    pub end_x: f64,
    pub end_y: f64,
}

/// Theme information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoTheme {
    pub name: String,
    #[serde(default)]
    pub colors: Vec<WoThemeColor>,
}

/// A theme color entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoThemeColor {
    pub name: String,
    pub color: String,
}
