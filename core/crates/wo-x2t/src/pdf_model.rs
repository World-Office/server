//! WoPdf bridge model — JSON-compatible with the frontend PDF format.
//!
//! This is the bridge between the frontend PDF JSON format
//! and the wo-pdf `PdfDocument` model used for PDF serialization.
//! Format name: "wo-pdf-document" / "pdf"

use serde::{Deserialize, Serialize};

/// A complete PDF document, matching the frontend shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoPdfDocument {
    pub version: String,
    pub page_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub producer: Option<String>,
    pub pages: Vec<WoPdfPage>,
}

/// A single PDF page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoPdfPage {
    pub number: u32,
    pub width: f64,
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default)]
    pub rotation: u32,
    #[serde(default)]
    pub annotations: Vec<WoPdfAnnotation>,
}

/// A PDF annotation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoPdfAnnotation {
    pub subtype: String,
    pub rect: [f64; 4],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contents: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
    #[serde(default)]
    pub quad_points: Vec<f64>,
    #[serde(default)]
    pub color: Vec<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub border: Vec<f64>,
}
