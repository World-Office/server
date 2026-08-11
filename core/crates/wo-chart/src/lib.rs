// wo-chart — World-Office chart model and rendering
//
// Pure Rust chart engine supporting bar, column, line, pie, scatter,
// area, radar, and doughnut chart kinds. Implements serde for WASM/JSON
// transport and the EditableModel trait for uniform mutation, undo, and
// collaboration.

pub mod model;
pub mod render;

pub use model::{
    Axis, AxisPosition, AxisScale, Chart, ChartDataLabel, ChartError, ChartKind, ChartTitle,
    DataPoint, Legend, LegendPosition, Series,
};
pub use render::{render, Point, Rect};
