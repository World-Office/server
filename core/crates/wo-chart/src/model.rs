//! Chart model types.
//!
//! Defines the core chart data model: `Chart`, `ChartKind`, `Series`,
//! `Axis`, `Legend`, and their supporting types.
//!
//! All types implement serde for WASM/JSON transport. `Chart` implements
//! the [`EditableModel`] trait for uniform mutation and collaboration.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use wo_common::op::{EditableModel, ModelOp};
use wo_common::path::Path;

// ---------------------------------------------------------------------------
// ChartKind — the type of chart
// ---------------------------------------------------------------------------

/// The kind of chart.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ChartKind {
    /// Vertical bars (columns).
    #[default]
    Bar,
    /// Horizontal bars.
    Column,
    /// Line chart with connected data points.
    Line,
    /// Pie chart (circular slices).
    Pie,
    /// Scatter (XY) chart.
    Scatter,
    /// Area chart (filled line).
    Area,
    /// Radar (spider) chart.
    Radar,
    /// Doughnut chart (ring with hole).
    Doughnut,
}

// ---------------------------------------------------------------------------
// DataPoint — a single value in a series
// ---------------------------------------------------------------------------

/// A single data point in a chart series.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DataPoint {
    /// The numeric value.
    pub value: f64,
    /// Optional category label (for bar/column/line/area/radar).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// Optional color override for this point.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

impl DataPoint {
    /// Create a new data point with a numeric value.
    pub fn new(value: f64) -> Self {
        Self {
            value,
            category: None,
            color: None,
        }
    }

    /// Create a new data point with a value and category label.
    pub fn with_category(value: f64, category: impl Into<String>) -> Self {
        Self {
            value,
            category: Some(category.into()),
            color: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Series — a sequence of data points with styling
// ---------------------------------------------------------------------------

/// A data series in a chart.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Series {
    /// Display name (appears in legend).
    pub name: String,
    /// The data points.
    pub data: Vec<DataPoint>,
    /// Optional color for the series line/bars.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Whether the series is visible.
    #[serde(default = "default_true")]
    pub visible: bool,
}

fn default_true() -> bool {
    true
}

impl Series {
    /// Create a new series with a name and data points.
    pub fn new(name: impl Into<String>, data: Vec<DataPoint>) -> Self {
        Self {
            name: name.into(),
            data,
            color: None,
            visible: true,
        }
    }
}

// ---------------------------------------------------------------------------
// AxisPosition — which side an axis is on
// ---------------------------------------------------------------------------

/// Position of an axis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AxisPosition {
    /// Bottom (X-axis for bar/line/area).
    #[default]
    Bottom,
    /// Left (Y-axis for bar/line/area).
    Left,
    /// Right (secondary Y-axis).
    Right,
    /// Top (alternative X-axis).
    Top,
}

// ---------------------------------------------------------------------------
// AxisScale — linear vs logarithmic
// ---------------------------------------------------------------------------

/// Axis scale type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AxisScale {
    /// Linear scale.
    #[default]
    Linear,
    /// Logarithmic scale.
    Log,
}

// ---------------------------------------------------------------------------
// Axis — a chart axis
// ---------------------------------------------------------------------------

/// A chart axis (X or Y).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Axis {
    /// Axis title text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Position on the chart.
    pub position: AxisPosition,
    /// Scale type.
    #[serde(default)]
    pub scale: AxisScale,
    /// Minimum value (auto-calculated if None).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    /// Maximum value (auto-calculated if None).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    /// Whether to show gridlines.
    #[serde(default = "default_true")]
    pub show_gridlines: bool,
    /// Whether to show tick labels.
    #[serde(default = "default_true")]
    pub show_labels: bool,
}

impl Axis {
    /// Create a new axis at the given position.
    pub fn new(position: AxisPosition) -> Self {
        Self {
            title: None,
            position,
            scale: AxisScale::default(),
            min: None,
            max: None,
            show_gridlines: true,
            show_labels: true,
        }
    }
}

// ---------------------------------------------------------------------------
// LegendPosition — where the legend is placed
// ---------------------------------------------------------------------------

/// Legend placement on the chart.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LegendPosition {
    /// At the bottom.
    #[default]
    Bottom,
    /// At the top.
    Top,
    /// To the left.
    Left,
    /// To the right.
    Right,
    /// In the top-right corner.
    TopRight,
}

// ---------------------------------------------------------------------------
// Legend — chart legend configuration
// ---------------------------------------------------------------------------

/// Chart legend.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Legend {
    /// Position of the legend.
    #[serde(default)]
    pub position: LegendPosition,
    /// Whether the legend is visible.
    #[serde(default = "default_true")]
    pub visible: bool,
    /// Optional title.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

impl Legend {
    /// Create a default legend.
    pub fn new() -> Self {
        Self::default()
    }
}

impl Default for Legend {
    fn default() -> Self {
        Self {
            position: LegendPosition::Bottom,
            visible: true,
            title: None,
        }
    }
}

// ---------------------------------------------------------------------------
// ChartDataLabel — data label configuration
// ---------------------------------------------------------------------------

/// Data label display options.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChartDataLabel {
    /// Whether data labels are visible.
    #[serde(default)]
    pub visible: bool,
    /// Whether to show the value.
    #[serde(default = "default_true")]
    pub show_value: bool,
    /// Whether to show the category name.
    #[serde(default)]
    pub show_category: bool,
    /// Whether to show the series name.
    #[serde(default)]
    pub show_series_name: bool,
    /// Whether to show the percentage (for pie/doughnut).
    #[serde(default)]
    pub show_percentage: bool,
    /// Optional font size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u32>,
    /// Optional color.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

impl Default for ChartDataLabel {
    fn default() -> Self {
        Self {
            visible: false,
            show_value: true,
            show_category: false,
            show_series_name: false,
            show_percentage: false,
            font_size: None,
            color: None,
        }
    }
}

// ---------------------------------------------------------------------------
// ChartTitle — chart title
// ---------------------------------------------------------------------------

/// Chart title configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChartTitle {
    /// The title text.
    pub text: String,
    /// Whether the title is visible.
    #[serde(default = "default_true")]
    pub visible: bool,
    /// Optional font size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u32>,
    /// Optional color.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

impl ChartTitle {
    /// Create a new chart title.
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            visible: true,
            font_size: None,
            color: None,
        }
    }
}

// ---------------------------------------------------------------------------
// ChartError
// ---------------------------------------------------------------------------

/// Errors that can occur during chart operations.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ChartError {
    /// The specified series index is out of range.
    #[error("series index out of range: {0}")]
    SeriesIndexOutOfRange(usize),

    /// The specified data point index is out of range.
    #[error("data point index out of range: {0}")]
    DataPointIndexOutOfRange(usize),

    /// An invalid operation was attempted.
    #[error("invalid operation: {0}")]
    InvalidOperation(String),
}

// ---------------------------------------------------------------------------
// Chart — the main chart model
// ---------------------------------------------------------------------------

/// A chart document model.
///
/// Represents a single chart with its kind, series data, axes, legend,
/// title, and data labels. All fields are serializable for transport
/// over WASM and WebSocket boundaries.
///
/// Implements [`EditableModel`] for uniform mutation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Chart {
    /// Type of chart.
    pub kind: ChartKind,
    /// Data series.
    pub series: Vec<Series>,
    /// The two axes (X and Y). axes[0] is the primary (X/category) axis,
    /// axes[1] is the value (Y) axis.
    pub axes: Vec<Axis>,
    /// Legend configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub legend: Option<Legend>,
    /// Chart title.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<ChartTitle>,
    /// Data label configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_labels: Option<ChartDataLabel>,
    /// Number of applied operations (revision counter).
    #[serde(skip)]
    pub(crate) revision: u64,
}

impl Chart {
    /// Create a new chart with the given kind.
    pub fn new(kind: ChartKind) -> Self {
        Self {
            kind,
            series: Vec::new(),
            axes: vec![
                Axis::new(AxisPosition::Bottom),
                Axis::new(AxisPosition::Left),
            ],
            legend: Some(Legend::new()),
            title: None,
            data_labels: None,
            revision: 0,
        }
    }

    /// Add a series to the chart.
    pub fn add_series(&mut self, series: Series) {
        self.series.push(series);
    }

    /// Remove a series by index.
    pub fn remove_series(&mut self, index: usize) -> Result<(), ChartError> {
        if index >= self.series.len() {
            return Err(ChartError::SeriesIndexOutOfRange(index));
        }
        self.series.remove(index);
        Ok(())
    }

    /// Get a reference to a series by index.
    pub fn series(&self, index: usize) -> Option<&Series> {
        self.series.get(index)
    }

    /// Get a mutable reference to a series by index.
    pub fn series_mut(&mut self, index: usize) -> Option<&mut Series> {
        self.series.get_mut(index)
    }
}

// ---------------------------------------------------------------------------
// EditableModel implementation for Chart
//
// Mapping from ModelOp to chart operations:
// - Insert:   Add a new series (at targets chart path with series index)
// - Delete:   Remove a series or data point
// - Replace:  Change chart kind, title, or axis properties
// - Format:   Change series styling or data label config
// - Move:     Reorder series
// ---------------------------------------------------------------------------

impl EditableModel for Chart {
    type Err = ChartError;

    fn apply(&mut self, op: &ModelOp) -> Result<(), Self::Err> {
        match op {
            ModelOp::Insert { at, content } => {
                // Serialize content as Series data from JSON
                let parsed: Series = serde_json::from_str(content)
                    .map_err(|e| ChartError::InvalidOperation(format!("invalid series JSON: {e}")))?;

                match at {
                    Path::Sheet { row, col: _, .. } => {
                        // Insert series at a given index (row = series index)
                        let idx = *row as usize;
                        if idx > self.series.len() {
                            return Err(ChartError::SeriesIndexOutOfRange(idx));
                        }
                        self.series.insert(idx, parsed);
                    }
                    _ => {
                        // Default: append
                        self.series.push(parsed);
                    }
                }
                self.revision += 1;
                Ok(())
            }
            ModelOp::Delete { range } => {
                // Determine what to delete based on the range start path.
                match &range.start {
                    Path::Sheet { row, col, .. } => {
                        let series_idx = *row as usize;
                        let point_idx = *col as usize;
                        // If col > 0, delete a data point from the series
                        if point_idx > 0 {
                            let series = self.series.get_mut(series_idx).ok_or(
                                ChartError::SeriesIndexOutOfRange(series_idx),
                            )?;
                            let dp_idx = point_idx - 1; // convert 1-based col to 0-based
                            if dp_idx >= series.data.len() {
                                return Err(ChartError::DataPointIndexOutOfRange(dp_idx));
                            }
                            series.data.remove(dp_idx);
                        } else {
                            // Delete the entire series
                            self.remove_series(series_idx)?;
                        }
                    }
                    _ => {
                        return Err(ChartError::InvalidOperation(
                            "Delete requires a Sheet path for chart operations".into(),
                        ));
                    }
                }
                self.revision += 1;
                Ok(())
            }
            ModelOp::Replace { at, content } => {
                match at {
                    Path::Sheet {
                        row: series_idx,
                        col: point_idx,
                        ..
                    } => {
                        let series_idx = *series_idx as usize;
                        let point_idx = *point_idx as usize;
                        if point_idx > 0 {
                            // Replace a data point value (col=1 → index 0)
                            let series = self.series.get_mut(series_idx).ok_or(
                                ChartError::SeriesIndexOutOfRange(series_idx),
                            )?;
                            let dp_idx = point_idx - 1;
                            if dp_idx >= series.data.len() {
                                return Err(ChartError::DataPointIndexOutOfRange(dp_idx));
                            }
                            let new_val: f64 = content.parse().map_err(|_| {
                                ChartError::InvalidOperation(
                                    "Replace requires numeric content for data points".into(),
                                )
                            })?;
                            series.data[dp_idx].value = new_val;
                        } else {
                            // Replace entire series
                            if series_idx >= self.series.len() {
                                return Err(ChartError::SeriesIndexOutOfRange(series_idx));
                            }
                            let parsed: Series =
                                serde_json::from_str(content).map_err(|e| {
                                    ChartError::InvalidOperation(format!(
                                        "invalid series JSON: {e}"
                                    ))
                                })?;
                            self.series[series_idx] = parsed;
                        }
                    }
                    _ => {
                        return Err(ChartError::InvalidOperation(
                            "Replace requires a Sheet path for chart operations".into(),
                        ));
                    }
                }
                self.revision += 1;
                Ok(())
            }
            ModelOp::Format { range, attrs } => {
                match &range.start {
                    Path::Sheet { row, col: _, .. } => {
                        let series_idx = *row as usize;
                        let series = self.series.get_mut(series_idx).ok_or(
                            ChartError::SeriesIndexOutOfRange(series_idx),
                        )?;
                        for (key, val) in attrs {
                            match key.as_str() {
                                "color" => {
                                    if let Some(s) = val.as_str() {
                                        series.color = Some(s.to_string());
                                    }
                                }
                                "visible" => {
                                    if let Some(b) = val.as_bool() {
                                        series.visible = b;
                                    }
                                }
                                "name" => {
                                    if let Some(s) = val.as_str() {
                                        series.name = s.to_string();
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {
                        return Err(ChartError::InvalidOperation(
                            "Format requires a Sheet path for chart operations".into(),
                        ));
                    }
                }
                self.revision += 1;
                Ok(())
            }
            ModelOp::Move { from, to } => {
                let src_idx = match from {
                    Path::Sheet { row, .. } => *row as usize,
                    _ => {
                        return Err(ChartError::InvalidOperation(
                            "Move source requires a Sheet path".into(),
                        ));
                    }
                };
                let dst_idx = match to {
                    Path::Sheet { row, .. } => *row as usize,
                    _ => {
                        return Err(ChartError::InvalidOperation(
                            "Move destination requires a Sheet path".into(),
                        ));
                    }
                };
                if src_idx >= self.series.len() {
                    return Err(ChartError::SeriesIndexOutOfRange(src_idx));
                }
                if dst_idx > self.series.len() {
                    return Err(ChartError::SeriesIndexOutOfRange(dst_idx));
                }
                let series = self.series.remove(src_idx);
                self.series.insert(dst_idx, series);
                self.revision += 1;
                Ok(())
            }
        }
    }

    fn invert(&self, op: &ModelOp) -> ModelOp {
        match op {
            ModelOp::Insert { at, content: _ } => {
                // Inverse of insert is delete at the same position
                let end = at.clone();
                ModelOp::Delete {
                    range: wo_common::path::Range::new(at.clone(), end),
                }
            }
            ModelOp::Delete { range } => {
                // Inverse of delete is insert with the deleted content
                // Since we may not have the deleted content cached, we return
                // an empty insert as a placeholder. In a real undo scenario,
                // the undo stack holds the original content.
                ModelOp::Insert {
                    at: range.start.clone(),
                    content: String::new(),
                }
            }
            ModelOp::Replace { at, content } => {
                // Inverse of replace is replace with the previous value
                // In a real scenario, the old value would be captured.
                let old_val = match at {
                    Path::Sheet { row, col, .. } => {
                        let series_idx = *row as usize;
                        let point_idx = *col as usize;
                        self.series
                            .get(series_idx)
                            .and_then(|s| {
                                if point_idx > 0 {
                                    s.data.get(point_idx - 1).map(|dp| dp.value.to_string())
                                } else {
                                    None // entire series replace - can't reconstruct
                                }
                            })
                            .unwrap_or_else(|| content.clone())
                    }
                    _ => content.clone(),
                };
                ModelOp::Replace {
                    at: at.clone(),
                    content: old_val,
                }
            }
            ModelOp::Format { range, attrs } => {
                // Inverse of format is format with opposite values
                // In a real implementation, we'd snap the old attributes first.
                let mut inverse_attrs = BTreeMap::new();
                for (key, val) in attrs {
                    match key.as_str() {
                        "color" => {
                            // We can't reconstruct the old color without snapshots
                            // Return the same color (no-op undo for simplicity)
                            inverse_attrs.insert(key.clone(), val.clone());
                        }
                        "visible" => {
                            if let Some(b) = val.as_bool() {
                                inverse_attrs.insert(key.clone(), serde_json::json!(!b));
                            }
                        }
                        "name" => {
                            inverse_attrs.insert(key.clone(), val.clone());
                        }
                        _ => {}
                    }
                }
                ModelOp::Format {
                    range: range.clone(),
                    attrs: inverse_attrs,
                }
            }
            ModelOp::Move { from, to } => {
                // Inverse of move is move back
                ModelOp::Move {
                    from: to.clone(),
                    to: from.clone(),
                }
            }
        }
    }

    fn to_ops_since(&self, rev: u64) -> Vec<ModelOp> {
        if rev >= self.revision {
            return Vec::new();
        }
        // The chart model doesn't store the full op history.
        // Future implementations may buffer ops for collaboration.
        // For now, return empty — the undo stack is expected to be
        // managed externally by the frontend.
        Vec::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use wo_common::path::{Path, Range};

    // =========================================================================
    // 1. Serde round-trip — ChartKind
    // =========================================================================

    #[test]
    fn serde_chart_kind_bar() {
        let kind = ChartKind::Bar;
        let json = serde_json::to_string(&kind).unwrap();
        let back: ChartKind = serde_json::from_str(&json).unwrap();
        assert_eq!(kind, back);
    }

    #[test]
    fn serde_chart_kind_column() {
        let kind = ChartKind::Column;
        let json = serde_json::to_string(&kind).unwrap();
        let back: ChartKind = serde_json::from_str(&json).unwrap();
        assert_eq!(kind, back);
    }

    #[test]
    fn serde_chart_kind_pie() {
        let kind = ChartKind::Pie;
        let json = serde_json::to_string(&kind).unwrap();
        let back: ChartKind = serde_json::from_str(&json).unwrap();
        assert_eq!(kind, back);
    }

    #[test]
    fn serde_chart_kind_snake_case() {
        let json = r#""doughnut""#;
        let kind: ChartKind = serde_json::from_str(json).unwrap();
        assert_eq!(kind, ChartKind::Doughnut);
    }

    // =========================================================================
    // 2. Serde round-trip — DataPoint
    // =========================================================================

    #[test]
    fn serde_data_point() {
        let dp = DataPoint::with_category(42.5, "Q1");
        let json = serde_json::to_string(&dp).unwrap();
        let back: DataPoint = serde_json::from_str(&json).unwrap();
        assert_eq!(dp, back);
    }

    #[test]
    fn serde_data_point_minimal() {
        let dp = DataPoint::new(100.0);
        let json = serde_json::to_string(&dp).unwrap();
        let back: DataPoint = serde_json::from_str(&json).unwrap();
        assert_eq!(dp, back);
        // Ensure no optional fields leak into JSON
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(val.get("category").is_none());
    }

    // =========================================================================
    // 3. Serde round-trip — Series
    // =========================================================================

    #[test]
    fn serde_series() {
        let series = Series::new(
            "Sales",
            vec![
                DataPoint::with_category(100.0, "Q1"),
                DataPoint::with_category(150.0, "Q2"),
            ],
        );
        let json = serde_json::to_string(&series).unwrap();
        let back: Series = serde_json::from_str(&json).unwrap();
        assert_eq!(series, back);
    }

    #[test]
    fn serde_series_with_color() {
        let mut series = Series::new("Revenue", vec![DataPoint::new(200.0)]);
        series.color = Some("#FF0000".into());
        let json = serde_json::to_string(&series).unwrap();
        let back: Series = serde_json::from_str(&json).unwrap();
        assert_eq!(series, back);
        assert_eq!(back.color, Some("#FF0000".into()));
    }

    // =========================================================================
    // 4. Serde round-trip — Axis
    // =========================================================================

    #[test]
    fn serde_axis() {
        let axis = Axis::new(AxisPosition::Left);
        let json = serde_json::to_string(&axis).unwrap();
        let back: Axis = serde_json::from_str(&json).unwrap();
        assert_eq!(axis, back);
    }

    #[test]
    fn serde_axis_with_bounds() {
        let mut axis = Axis::new(AxisPosition::Bottom);
        axis.title = Some("Category".into());
        axis.min = Some(0.0);
        axis.max = Some(100.0);
        let json = serde_json::to_string(&axis).unwrap();
        let back: Axis = serde_json::from_str(&json).unwrap();
        assert_eq!(axis, back);
        assert_eq!(back.min, Some(0.0));
        assert_eq!(back.max, Some(100.0));
    }

    // =========================================================================
    // 5. Serde round-trip — Legend
    // =========================================================================

    #[test]
    fn serde_legend() {
        let legend = Legend {
            position: LegendPosition::Right,
            visible: true,
            title: Some("Metrics".into()),
        };
        let json = serde_json::to_string(&legend).unwrap();
        let back: Legend = serde_json::from_str(&json).unwrap();
        assert_eq!(legend, back);
    }

    #[test]
    fn serde_legend_default() {
        let legend = Legend::new();
        let json = serde_json::to_string(&legend).unwrap();
        let back: Legend = serde_json::from_str(&json).unwrap();
        assert_eq!(legend, back);
    }

    // =========================================================================
    // 6. Serde round-trip — Chart (full)
    // =========================================================================

    #[test]
    fn serde_chart_full() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.title = Some(ChartTitle::new("Sales by Quarter"));
        chart.add_series(Series::new(
            "Product A",
            vec![
                DataPoint::with_category(100.0, "Q1"),
                DataPoint::with_category(150.0, "Q2"),
                DataPoint::with_category(130.0, "Q3"),
            ],
        ));
        chart.add_series(Series::new(
            "Product B",
            vec![
                DataPoint::with_category(80.0, "Q1"),
                DataPoint::with_category(120.0, "Q2"),
                DataPoint::with_category(90.0, "Q3"),
            ],
        ));

        let json = serde_json::to_string_pretty(&chart).unwrap();
        let back: Chart = serde_json::from_str(&json).unwrap();
        assert_eq!(chart.kind, back.kind);
        assert_eq!(chart.series.len(), back.series.len());
        assert_eq!(chart.series[0].name, back.series[0].name);
        assert_eq!(chart.series[0].data.len(), back.series[0].data.len());
        assert_eq!(chart.title.as_ref().unwrap().text, "Sales by Quarter");
        assert!(back.legend.is_some());
    }

    #[test]
    fn serde_chart_minimal() {
        let chart = Chart::new(ChartKind::Pie);
        let json = serde_json::to_string(&chart).unwrap();
        let back: Chart = serde_json::from_str(&json).unwrap();
        assert_eq!(chart.kind, back.kind);
        assert!(back.series.is_empty());
        assert_eq!(back.axes.len(), 2);
    }

    #[test]
    fn serde_chart_doughnut() {
        let mut chart = Chart::new(ChartKind::Doughnut);
        chart.add_series(Series::new(
            "Expenses",
            vec![
                DataPoint::with_category(500.0, "Rent"),
                DataPoint::with_category(300.0, "Utilities"),
                DataPoint::with_category(200.0, "Supplies"),
            ],
        ));
        let json = serde_json::to_string(&chart).unwrap();
        let back: Chart = serde_json::from_str(&json).unwrap();
        assert_eq!(back.kind, ChartKind::Doughnut);
        assert_eq!(back.series.len(), 1);
    }

    #[test]
    fn serde_chart_all_kinds() {
        for kind in &[
            ChartKind::Bar,
            ChartKind::Column,
            ChartKind::Line,
            ChartKind::Pie,
            ChartKind::Scatter,
            ChartKind::Area,
            ChartKind::Radar,
            ChartKind::Doughnut,
        ] {
            let chart = Chart::new(*kind);
            let json = serde_json::to_string(&chart).unwrap();
            let back: Chart = serde_json::from_str(&json).unwrap();
            assert_eq!(chart.kind, back.kind);
        }
    }

    // =========================================================================
    // 7. JSON wire format — tagged enum
    // =========================================================================

    #[test]
    fn chart_kind_wire_format() {
        let val = serde_json::to_value(ChartKind::Bar).unwrap();
        assert_eq!(val, "bar");

        let val = serde_json::to_value(ChartKind::Doughnut).unwrap();
        assert_eq!(val, "doughnut");
    }

    #[test]
    fn axis_wire_format() {
        let axis = Axis::new(AxisPosition::Left);
        let val = serde_json::to_value(&axis).unwrap();
        assert_eq!(val["position"], "left");
        assert_eq!(val["scale"], "linear");
        assert!(val["show_gridlines"].as_bool().unwrap_or(false));
    }

    #[test]
    fn legend_position_wire_format() {
        let pos = LegendPosition::TopRight;
        let val = serde_json::to_value(pos).unwrap();
        assert_eq!(val, "top_right");
    }

    // =========================================================================
    // 8. Chart construction and manipulation
    // =========================================================================

    #[test]
    fn chart_new_has_default_axes() {
        let chart = Chart::new(ChartKind::Bar);
        assert_eq!(chart.axes.len(), 2);
        assert_eq!(chart.axes[0].position, AxisPosition::Bottom);
        assert_eq!(chart.axes[1].position, AxisPosition::Left);
    }

    #[test]
    fn chart_add_series() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new("S1", vec![DataPoint::new(10.0)]));
        assert_eq!(chart.series.len(), 1);
    }

    #[test]
    fn chart_remove_series() {
        let mut chart = Chart::new(ChartKind::Line);
        chart.add_series(Series::new("S1", vec![DataPoint::new(1.0)]));
        chart.add_series(Series::new("S2", vec![DataPoint::new(2.0)]));
        assert!(chart.remove_series(0).is_ok());
        assert_eq!(chart.series.len(), 1);
        assert_eq!(chart.series[0].name, "S2");
    }

    #[test]
    fn chart_remove_series_out_of_range() {
        let mut chart = Chart::new(ChartKind::Pie);
        assert!(chart.remove_series(0).is_err());
    }

    #[test]
    fn chart_series_accessor() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new("S1", vec![DataPoint::new(42.0)]));
        let s = chart.series(0);
        assert!(s.is_some());
        assert_eq!(s.unwrap().name, "S1");
        assert!(chart.series(5).is_none());
    }

    // =========================================================================
    // 9. EditableModel — Insert (add series)
    // =========================================================================

    #[test]
    fn model_insert_series() {
        let mut chart = Chart::new(ChartKind::Bar);

        let series_json = serde_json::to_string(&Series::new(
            "New Series",
            vec![DataPoint::new(100.0)],
        ))
        .unwrap();

        let op = ModelOp::Insert {
            at: Path::Sheet {
                sheet: "Chart1".into(),
                row: 0,
                col: 0,
            },
            content: series_json,
        };

        assert!(chart.apply(&op).is_ok());
        assert_eq!(chart.series.len(), 1);
        assert_eq!(chart.series[0].name, "New Series");
        assert_eq!(chart.revision, 1);
    }

    #[test]
    fn model_insert_series_at_index() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new("Existing", vec![DataPoint::new(1.0)]));

        let series_json = serde_json::to_string(&Series::new(
            "Inserted",
            vec![DataPoint::new(2.0)],
        ))
        .unwrap();

        // Insert at index 0 (before existing)
        let op = ModelOp::Insert {
            at: Path::Sheet {
                sheet: "Chart1".into(),
                row: 0,
                col: 0,
            },
            content: series_json,
        };

        assert!(chart.apply(&op).is_ok());
        assert_eq!(chart.series.len(), 2);
        assert_eq!(chart.series[0].name, "Inserted");
        assert_eq!(chart.series[1].name, "Existing");
    }

    // =========================================================================
    // 10. EditableModel — Delete (remove series)
    // =========================================================================

    #[test]
    fn model_delete_series() {
        let mut chart = Chart::new(ChartKind::Line);
        chart.add_series(Series::new("To Remove", vec![DataPoint::new(50.0)]));

        let op = ModelOp::Delete {
            range: Range::new(
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
            ),
        };

        assert!(chart.apply(&op).is_ok());
        assert!(chart.series.is_empty());
        assert_eq!(chart.revision, 1);
    }

    #[test]
    fn model_delete_series_out_of_range() {
        let mut chart = Chart::new(ChartKind::Pie);
        let op = ModelOp::Delete {
            range: Range::new(
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 5,
                    col: 0,
                },
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 5,
                    col: 0,
                },
            ),
        };
        assert!(chart.apply(&op).is_err());
    }

    // =========================================================================
    // 11. EditableModel — Replace (change data point value)
    // =========================================================================

    #[test]
    fn model_replace_data_point() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new(
            "S1",
            vec![DataPoint::new(10.0), DataPoint::new(20.0)],
        ));

        // Replace data point at series 1, point 1 (col=1 means index 0)
        let op = ModelOp::Replace {
            at: Path::Sheet {
                sheet: "Chart1".into(),
                row: 0,
                col: 1, // col=1 -> data point index 0
            },
            content: "99.9".into(),
        };

        assert!(chart.apply(&op).is_ok());
        assert!((chart.series[0].data[0].value - 99.9).abs() < f64::EPSILON);
    }

    #[test]
    fn model_replace_nonexistent_series() {
        let mut chart = Chart::new(ChartKind::Bar);
        let op = ModelOp::Replace {
            at: Path::Sheet {
                sheet: "Chart1".into(),
                row: 10,
                col: 1,
            },
            content: "50.0".into(),
        };
        assert!(chart.apply(&op).is_err());
    }

    // =========================================================================
    // 12. EditableModel — Format (change series styling)
    // =========================================================================

    #[test]
    fn model_format_series_color() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new("S1", vec![DataPoint::new(1.0)]));

        let mut attrs = BTreeMap::new();
        attrs.insert("color".into(), serde_json::json!("#00FF00"));

        let op = ModelOp::Format {
            range: Range::new(
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
            ),
            attrs,
        };

        assert!(chart.apply(&op).is_ok());
        assert_eq!(chart.series[0].color, Some("#00FF00".into()));
    }

    #[test]
    fn model_format_series_visibility() {
        let mut chart = Chart::new(ChartKind::Line);
        chart.add_series(Series::new("S1", vec![DataPoint::new(1.0)]));

        let mut attrs = BTreeMap::new();
        attrs.insert("visible".into(), serde_json::json!(false));

        let op = ModelOp::Format {
            range: Range::new(
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
            ),
            attrs,
        };

        assert!(chart.apply(&op).is_ok());
        assert!(!chart.series[0].visible);
    }

    #[test]
    fn model_format_nonexistent_series() {
        let mut chart = Chart::new(ChartKind::Bar);
        let mut attrs = BTreeMap::new();
        attrs.insert("color".into(), serde_json::json!("#000000"));

        let op = ModelOp::Format {
            range: Range::new(
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 99,
                    col: 0,
                },
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 99,
                    col: 0,
                },
            ),
            attrs,
        };

        assert!(chart.apply(&op).is_err());
    }

    // =========================================================================
    // 13. EditableModel — Move (reorder series)
    // =========================================================================

    #[test]
    fn model_move_series() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new("A", vec![DataPoint::new(1.0)]));
        chart.add_series(Series::new("B", vec![DataPoint::new(2.0)]));
        chart.add_series(Series::new("C", vec![DataPoint::new(3.0)]));

        // Move "C" (index 2) to position 0
        let op = ModelOp::Move {
            from: Path::Sheet {
                sheet: "Chart1".into(),
                row: 2,
                col: 0,
            },
            to: Path::Sheet {
                sheet: "Chart1".into(),
                row: 0,
                col: 0,
            },
        };

        assert!(chart.apply(&op).is_ok());
        assert_eq!(chart.series[0].name, "C");
        assert_eq!(chart.series[1].name, "A");
        assert_eq!(chart.series[2].name, "B");
    }

    #[test]
    fn model_move_series_invalid_source() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new("A", vec![DataPoint::new(1.0)]));

        let op = ModelOp::Move {
            from: Path::Sheet {
                sheet: "Chart1".into(),
                row: 10,
                col: 0,
            },
            to: Path::Sheet {
                sheet: "Chart1".into(),
                row: 0,
                col: 0,
            },
        };

        assert!(chart.apply(&op).is_err());
    }

    // =========================================================================
    // 14. EditableModel — invert
    // =========================================================================

    #[test]
    fn model_invert_insert_yields_delete() {
        let chart = Chart::new(ChartKind::Bar);
        let op = ModelOp::Insert {
            at: Path::Sheet {
                sheet: "Chart1".into(),
                row: 0,
                col: 0,
            },
            content: "test".into(),
        };
        let inv = chart.invert(&op);
        match inv {
            ModelOp::Delete { .. } => {}
            _ => panic!("inverse of Insert should be Delete"),
        }
    }

    #[test]
    fn model_invert_delete_yields_insert() {
        let chart = Chart::new(ChartKind::Bar);
        let op = ModelOp::Delete {
            range: Range::new(
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
            ),
        };
        let inv = chart.invert(&op);
        match inv {
            ModelOp::Insert { .. } => {}
            _ => panic!("inverse of Delete should be Insert"),
        }
    }

    #[test]
    fn model_invert_move_swaps_direction() {
        let chart = Chart::new(ChartKind::Bar);
        let op = ModelOp::Move {
            from: Path::Sheet {
                sheet: "Chart1".into(),
                row: 2,
                col: 0,
            },
            to: Path::Sheet {
                sheet: "Chart1".into(),
                row: 5,
                col: 0,
            },
        };
        let inv = chart.invert(&op);
        match inv {
            ModelOp::Move { from, to } => {
                assert_eq!(from, Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 5,
                    col: 0,
                });
                assert_eq!(to, Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 2,
                    col: 0,
                });
            }
            _ => panic!("inverse of Move should be Move"),
        }
    }

    // =========================================================================
    // 15. EditableModel — to_ops_since
    // =========================================================================

    #[test]
    fn model_to_ops_since_revision_zero() {
        let chart = Chart::new(ChartKind::Bar);
        let ops = chart.to_ops_since(0);
        assert!(ops.is_empty());
    }

    #[test]
    fn model_to_ops_since_future_revision() {
        let mut chart = Chart::new(ChartKind::Bar);
        let series_json = serde_json::to_string(&Series::new("S1", vec![DataPoint::new(1.0)]))
            .unwrap();
        chart
            .apply(&ModelOp::Insert {
                at: Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 0,
                },
                content: series_json,
            })
            .unwrap();
        let ops = chart.to_ops_since(99);
        assert!(ops.is_empty());
    }

    // =========================================================================
    // 16. Clone
    // =========================================================================

    #[test]
    fn chart_clone_is_deep_copy() {
        let mut chart = Chart::new(ChartKind::Pie);
        chart.add_series(Series::new("Original", vec![DataPoint::new(100.0)]));
        let cloned = chart.clone();
        assert_eq!(chart, cloned);

        // Modify original
        chart.series[0].name = "Modified".into();
        assert_eq!(cloned.series[0].name, "Original");
    }

    // =========================================================================
    // 17. Debug format
    // =========================================================================

    #[test]
    fn debug_format_chart() {
        let chart = Chart::new(ChartKind::Bar);
        let debug = format!("{chart:?}");
        assert!(debug.contains("Chart"));
        assert!(debug.contains("Bar") || debug.contains("bar"));
    }

    // =========================================================================
    // 18. ChartTitle
    // =========================================================================

    #[test]
    fn chart_title_new() {
        let title = ChartTitle::new("My Chart");
        assert_eq!(title.text, "My Chart");
        assert!(title.visible);
    }

    // =========================================================================
    // 19. DataPoint constructors
    // =========================================================================

    #[test]
    fn data_point_new_has_no_category() {
        let dp = DataPoint::new(42.0);
        assert!((dp.value - 42.0).abs() < f64::EPSILON);
        assert!(dp.category.is_none());
    }

    #[test]
    fn data_point_with_category() {
        let dp = DataPoint::with_category(77.0, "Q2");
        assert_eq!(dp.category, Some("Q2".into()));
    }

    // =========================================================================
    // 20. Default values
    // =========================================================================

    #[test]
    fn legend_default_is_visible() {
        let legend = Legend::default();
        assert!(legend.visible);
        assert_eq!(legend.position, LegendPosition::Bottom);
    }

    #[test]
    fn series_default_is_visible() {
        let series = Series::new("Test", vec![]);
        assert!(series.visible);
    }

    #[test]
    fn chart_kind_default_is_bar() {
        assert_eq!(ChartKind::default(), ChartKind::Bar);
    }

    // =========================================================================
    // 21. Serde round-trip — ChartDataLabel
    // =========================================================================

    #[test]
    fn serde_data_label() {
        let label = ChartDataLabel {
            visible: true,
            show_value: true,
            show_category: true,
            show_series_name: false,
            show_percentage: true,
            font_size: Some(12),
            color: Some("#333333".into()),
        };
        let json = serde_json::to_string(&label).unwrap();
        let back: ChartDataLabel = serde_json::from_str(&json).unwrap();
        assert_eq!(label, back);
    }

    #[test]
    fn serde_data_label_default() {
        let label = ChartDataLabel::default();
        let json = serde_json::to_string(&label).unwrap();
        let back: ChartDataLabel = serde_json::from_str(&json).unwrap();
        assert_eq!(label.visible, back.visible);
        assert_eq!(label.show_value, back.show_value);
    }

    // =========================================================================
    // 22. Model — Delete data point
    // =========================================================================

    #[test]
    fn model_delete_data_point() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new(
            "S1",
            vec![DataPoint::new(10.0), DataPoint::new(20.0), DataPoint::new(30.0)],
        ));

        // Delete data point at series 0, point index 0 (col=1)
        let op = ModelOp::Delete {
            range: Range::new(
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 1, // col=1 means data point index 0
                },
                Path::Sheet {
                    sheet: "Chart1".into(),
                    row: 0,
                    col: 1,
                },
            ),
        };

        assert!(chart.apply(&op).is_ok());
        assert_eq!(chart.series[0].data.len(), 2);
        assert!((chart.series[0].data[0].value - 20.0).abs() < f64::EPSILON);
    }

    // =========================================================================
    // 23. Chart with all optional fields populated
    // =========================================================================

    #[test]
    fn chart_full_configuration() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.title = Some(ChartTitle::new("Revenue"));
        chart.data_labels = Some(ChartDataLabel {
            visible: true,
            show_value: true,
            show_category: false,
            show_series_name: false,
            show_percentage: false,
            font_size: Some(10),
            color: Some("#000000".into()),
        });
        chart.add_series(Series::new(
            "2024",
            vec![
                DataPoint::with_category(100.0, "Jan"),
                DataPoint::with_category(150.0, "Feb"),
            ],
        ));

        let json = serde_json::to_string(&chart).unwrap();
        let back: Chart = serde_json::from_str(&json).unwrap();
        assert!(back.title.is_some());
        assert!(back.data_labels.is_some());
        assert!(back.data_labels.unwrap().visible);
    }
}
