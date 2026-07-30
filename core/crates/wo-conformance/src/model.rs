//! Normalized intermediate representation (IR) for conformance scoring.
//!
//! The IR is the contract between every engine and the scorer. It is a
//! *layout* description (boxes, runs, geometry) plus *resolved font state* —
//! intentionally not pixels, so divergence can be localized and attributed.
//!
//! See `plan/2026-07-27-ooxml-conformance-strategy.md` §3.1.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Tolerance (in points) within which two box origins/sizes are considered equal.
pub const GEOMETRY_TOLERANCE_PT: f64 = 2.0;

/// Errors produced while rendering or scoring. Kept in `model` so the
/// [`crate::engine::RenderEngine`] trait can reference it without an extra module.
#[derive(Debug, Error)]
pub enum ConformanceError {
    #[error("engine failed to render document: {0}")]
    RenderFailed(String),
    #[error("could not read input bytes: {0}")]
    InputIo(#[from] std::io::Error),
    #[error("could not parse ground-truth JSON: {0}")]
    TruthParse(#[from] serde_json::Error),
    #[error("schema version mismatch: expected <= {max_supported}, found {found}")]
    SchemaVersion { found: u32, max_supported: u32 },
}

/// Complete normalized render of one document, produced by an engine or captured
/// as ground truth. This is the unit that gets diffed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NormalizedRender {
    pub pages: Vec<Page>,
    pub resolved_fonts: ResolvedFonts,
    pub metadata: RenderMetadata,
}

impl NormalizedRender {
    /// Convenience constructor for tests — produces a minimal render.
    pub fn test_default(engine: &str, version: &str) -> Self {
        Self {
            pages: Vec::new(),
            resolved_fonts: ResolvedFonts::default(),
            metadata: RenderMetadata {
                engine: engine.to_string(),
                engine_version: version.to_string(),
                captured_at: String::new(),
                environment: String::new(),
            },
        }
    }
}

/// A single laid-out page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Page {
    /// Zero-based page index.
    pub index: usize,
    /// (width, height) in points.
    pub size: PageSize,
    /// Layout boxes on this page. Defaults to empty if omitted.
    #[serde(default)]
    pub boxes: Vec<LayoutBox>,
}

/// (width, height) in points.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct PageSize {
    pub width_pt: f64,
    pub height_pt: f64,
}

impl PageSize {
    pub fn approx_eq(self, other: PageSize, tol: f64) -> bool {
        (self.width_pt - other.width_pt).abs() <= tol
            && (self.height_pt - other.height_pt).abs() <= tol
    }
}

/// A positioned layout box.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayoutBox {
    pub kind: BoxKind,
    /// (x, y) origin in points, page-relative.
    pub origin: Point,
    /// (width, height) in points.
    pub size: PageSize,
    /// Glyph runs in this box. Defaults to empty if omitted.
    #[serde(default)]
    pub runs: Vec<GlyphRun>,
}

impl LayoutBox {
    /// True if `other`'s origin and size are within `tol` points of this box.
    pub fn approx_eq(&self, other: &LayoutBox, tol: f64) -> bool {
        self.origin.approx_eq(other.origin, tol) && self.size.approx_eq(other.size, tol)
    }
}

/// Semantic kind of a layout box. Kept coarse on purpose — the IR is about
/// geometry and content, not full document semantics.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BoxKind {
    Paragraph,
    Table,
    TableCell,
    Image,
    Header,
    Footer,
    Footnote,
    TextBox,
    Other,
}

/// A glyph run: a contiguous span of text sharing one style.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GlyphRun {
    pub text: String,
    /// Font family name as *resolved* by the engine (post-substitution).
    pub font: String,
    pub size_pt: f64,
    pub weight: u16,
    pub italic: bool,
    /// Run origin in points, page-relative.
    pub origin: Point,
}

/// A point in page-relative coordinates (points).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Point {
    pub x_pt: f64,
    pub y_pt: f64,
}

impl Point {
    pub fn approx_eq(self, other: Point, tol: f64) -> bool {
        (self.x_pt - other.x_pt).abs() <= tol && (self.y_pt - other.y_pt).abs() <= tol
    }

    /// Euclidean distance to another point, in points.
    pub fn distance(self, other: Point) -> f64 {
        let dx = self.x_pt - other.x_pt;
        let dy = self.y_pt - other.y_pt;
        (dx * dx + dy * dy).sqrt()
    }
}

/// How fonts were resolved during render. This is the "smuggled dependency"
/// surface called out in the strategy doc: substitution must be visible, not
/// buried in pixels.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ResolvedFonts {
    /// Font families the document *requested*.
    #[serde(default)]
    pub requested: Vec<String>,
    /// `requested -> actually used` map. An identity entry means no substitution.
    #[serde(default)]
    pub resolved: std::collections::BTreeMap<String, String>,
    /// Requested families for which no usable font was found.
    #[serde(default)]
    pub unavailable: Vec<String>,
}

impl ResolvedFonts {
    /// Count of requested families that were substituted (resolved != requested)
    /// or unavailable. Zero means full coverage.
    pub fn substitution_count(&self) -> usize {
        let mut n = self.unavailable.len();
        for (req, got) in &self.resolved {
            if req != got && !self.unavailable.contains(req) {
                n += 1;
            }
        }
        n
    }

    /// Fraction in `[0.0, 1.0]` of requested fonts that were satisfied without
    /// substitution or loss. Empty requested set is treated as full coverage.
    pub fn coverage(&self) -> f64 {
        if self.requested.is_empty() {
            return 1.0;
        }
        let good = self
            .requested
            .iter()
            .filter(|req| {
                !self.unavailable.contains(*req)
                    && self.resolved.get(*req).is_some_and(|got| got == *req)
            })
            .count();
        good as f64 / self.requested.len() as f64
    }
}

/// Provenance for a render — whose output this is and under what conditions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RenderMetadata {
    /// `"wo-docx-renderer"`, `"libreoffice"`, `"word"` (ground truth), etc.
    pub engine: String,
    pub engine_version: String,
    /// ISO-8601 capture timestamp.
    pub captured_at: String,
    /// Free-form environment note (OS, font config, Word build for truth).
    pub environment: String,
}

/// Input specification for a render. Kept minimal; grows as needed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderSpec {
    /// Target DPI for any raster-derived geometry (layout boxes are DPI-agnostic).
    pub dpi: u32,
}

impl Default for RenderSpec {
    fn default() -> Self {
        Self { dpi: 96 }
    }
}
