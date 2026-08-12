//! Chart embedding for presentation slides.
//!
//! Bridges `wo-chart` charts into the slide model. Provides [`ChartRef`] —
//! the type used in [`Shape::Chart`] to reference an embedded chart — along
//! with [`ChartCollection`] for managing a presentation's chart store and
//! [`render_embedded_chart`] for rendering embedded charts onto a slide canvas.
//!
//! # Architecture
//!
//! Charts can be embedded in slides in two ways:
//!
//! - **Stored** — The chart data lives in the presentation's global
//!   [`ChartCollection`] keyed by a unique string ID. Multiple shapes can
//!   reference the same chart (e.g. a thumbnail and a full-size view).
//! - **Inline** — The chart data is serialized directly into the shape, so
//!   the slide is self-contained. Useful for slide imports/exports.
//!
//! # Rendering
//!
//! [`render_embedded_chart`] resolves the [`ChartRef`] against the collection,
//! obtains a [`Chart`](wo_chart::model::Chart), and delegates to
//! [`wo_chart::render::render`] to draw into the provided [`Canvas`].
//!
//! # Serde
//!
//! All types implement `Serialize`/`Deserialize` for WASM and WebSocket
//! transport. The `ChartRef` uses internally-tagged JSON representation:
//!
//! ```json
//! { "kind": "stored", "id": "chart_1" }
//! { "kind": "inline", "chart": { ... } }
//! ```

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use wo_chart::model::{Chart, ChartError};
use wo_chart::render::{render, Rect};
use wo_renderer::canvas::Canvas;

// ---------------------------------------------------------------------------
// ChartRef — how a slide shape references a chart
// ---------------------------------------------------------------------------

/// A reference to a chart embedded in a slide shape.
///
/// This is the type used in the slide model's [`Shape::Chart`] variant.
/// Charts can be stored in a presentation-level collection (by ID) or
/// inlined directly into the shape.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChartRef {
    /// A chart stored in the presentation's global [`ChartCollection`].
    Stored {
        /// The chart ID in the global collection.
        id: String,
    },
    /// An inline chart embedded directly in the slide shape data.
    Inline {
        /// The embedded chart data.
        chart: Box<Chart>,
    },
}

impl ChartRef {
    /// Resolve this reference against a chart collection.
    ///
    /// Returns `Some(&Chart)` for both `Stored` (looked up by ID) and
    /// `Inline` (returns the inline chart). Returns `None` if the ID
    /// is not found in the collection.
    pub fn resolve<'a>(&'a self, charts: &'a ChartCollection) -> Option<&'a Chart> {
        match self {
            ChartRef::Stored { id } => charts.get(id),
            ChartRef::Inline { chart } => Some(chart.as_ref()),
        }
    }

    /// Resolve this reference mutably against a chart collection.
    pub fn resolve_mut<'a>(&'a mut self, charts: &'a mut ChartCollection) -> Option<&'a mut Chart> {
        match self {
            ChartRef::Stored { id } => charts.get_mut(id),
            ChartRef::Inline { chart } => Some(chart.as_mut()),
        }
    }

    /// Return the chart ID if this is a `Stored` reference.
    pub fn stored_id(&self) -> Option<&str> {
        match self {
            ChartRef::Stored { id } => Some(id.as_str()),
            ChartRef::Inline { .. } => None,
        }
    }

    /// Return a reference to the underlying chart if it's inline.
    pub fn inline_chart(&self) -> Option<&Chart> {
        match self {
            ChartRef::Inline { chart } => Some(chart.as_ref()),
            ChartRef::Stored { .. } => None,
        }
    }

    /// Convert this reference to a stored reference by inserting the chart
    /// (if inline) into the collection. Returns the generated ID.
    ///
    /// If the reference is already stored, the chart is re-inserted under
    /// its existing ID and the ID is returned unchanged.
    pub fn store_in(
        &mut self,
        charts: &mut ChartCollection,
        mut generate_id: impl FnMut() -> String,
    ) -> String {
        match self {
            ChartRef::Stored { id } => {
                // Already stored — nothing to do.
                id.clone()
            }
            ChartRef::Inline { chart } => {
                let id = generate_id();
                charts.insert(id.clone(), *chart.clone());
                // Replace self with a stored reference.
                *self = ChartRef::Stored { id: id.clone() };
                id
            }
        }
    }
}

impl From<Chart> for ChartRef {
    fn from(chart: Chart) -> Self {
        ChartRef::Inline {
            chart: Box::new(chart),
        }
    }
}

// ---------------------------------------------------------------------------
// ChartCollection — a presentation's global chart store
// ---------------------------------------------------------------------------

/// A collection of named charts in a presentation.
///
/// Slides reference charts from this collection via [`ChartRef::Stored`].
/// The collection is serialized as part of the [`Presentation`] model so
/// that all charts survive round-trip serialization.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ChartCollection {
    charts: HashMap<String, Chart>,
}

impl ChartCollection {
    /// Create an empty chart collection.
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert a chart into the collection by ID.
    ///
    /// If a chart with this ID already exists, it is replaced.
    pub fn insert(&mut self, id: String, chart: Chart) {
        self.charts.insert(id, chart);
    }

    /// Get a reference to a chart by ID.
    pub fn get(&self, id: &str) -> Option<&Chart> {
        self.charts.get(id)
    }

    /// Get a mutable reference to a chart by ID.
    pub fn get_mut(&mut self, id: &str) -> Option<&mut Chart> {
        self.charts.get_mut(id)
    }

    /// Remove a chart from the collection by ID, returning it if found.
    pub fn remove(&mut self, id: &str) -> Option<Chart> {
        self.charts.remove(id)
    }

    /// Get the number of charts in the collection.
    pub fn len(&self) -> usize {
        self.charts.len()
    }

    /// Returns `true` if the collection is empty.
    pub fn is_empty(&self) -> bool {
        self.charts.is_empty()
    }

    /// Check if a chart with the given ID exists.
    pub fn contains(&self, id: &str) -> bool {
        self.charts.contains_key(id)
    }

    /// Iterate over all (id, chart) pairs.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &Chart)> {
        self.charts.iter().map(|(k, v)| (k.as_str(), v))
    }

    /// Get all chart IDs.
    pub fn ids(&self) -> impl Iterator<Item = &str> {
        self.charts.keys().map(|s| s.as_str())
    }

    /// Clear all charts from the collection.
    pub fn clear(&mut self) {
        self.charts.clear();
    }
}

// ---------------------------------------------------------------------------
// render_embedded_chart — render an embedded chart onto a slide canvas
// ---------------------------------------------------------------------------

/// Render an embedded chart onto a canvas within the given rectangle.
///
/// Resolves the [`ChartRef`] against the [`ChartCollection`], obtains the
/// [`Chart`], and delegates to [`wo_chart::render::render`] to draw the
/// chart into the canvas bounded by `rect`.
///
/// # Errors
///
/// Returns [`EmbedError::ChartNotFound`] if the reference is `Stored` and
/// the ID is not present in the collection. Returns
/// [`EmbedError::ChartRenderFailed`] if the underlying chart render fails.
///
/// # Example
///
/// ```
/// use wo_chart::model::{Chart, ChartKind, Series, DataPoint};
/// use wo_slide::chart_embed::{ChartRef, ChartCollection, render_embedded_chart};
/// use wo_chart::render::Rect;
///
/// // Create a simple bar chart
/// let mut chart = Chart::new(ChartKind::Bar);
/// chart.add_series(Series::new("Sales", vec![
///     DataPoint::with_category(100.0, "Q1"),
///     DataPoint::with_category(150.0, "Q2"),
/// ]));
///
/// // Store it in a collection
/// let mut collection = ChartCollection::new();
/// let chart_ref = ChartRef::Inline { chart: Box::new(chart) };
///
/// // Rendering requires a canvas (not available in unit test).
/// // This example demonstrates the API shape.
/// assert!(collection.is_empty());
/// ```
pub fn render_embedded_chart(
    chart_ref: &ChartRef,
    charts: &ChartCollection,
    canvas: &mut Canvas,
    rect: Rect,
) -> Result<(), EmbedError> {
    let chart = chart_ref.resolve(charts).ok_or(EmbedError::ChartNotFound)?;
    render(chart, canvas, rect).map_err(EmbedError::ChartRenderFailed)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// EmbedError — error type for chart embedding
// ---------------------------------------------------------------------------

/// Errors that can occur during chart embedding operations.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum EmbedError {
    /// The referenced chart was not found in the collection.
    #[error("chart not found")]
    ChartNotFound,

    /// The chart rendering failed.
    #[error("chart render failed: {0}")]
    ChartRenderFailed(#[from] ChartError),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use wo_chart::model::{ChartKind, DataPoint, Series};

    /// Helper to create a simple bar chart with two data points.
    fn sample_chart() -> Chart {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new(
            "Sales",
            vec![
                DataPoint::with_category(100.0, "Q1"),
                DataPoint::with_category(150.0, "Q2"),
            ],
        ));
        chart
    }

    // -----------------------------------------------------------------------
    // ChartRef construction and inspection
    // -----------------------------------------------------------------------

    #[test]
    fn chart_ref_inline_contains_chart() {
        let chart = sample_chart();
        let ref_ = ChartRef::Inline {
            chart: Box::new(chart.clone()),
        };
        assert_eq!(ref_.inline_chart(), Some(&chart));
        assert!(ref_.stored_id().is_none());
    }

    #[test]
    fn chart_ref_stored_contains_id() {
        let ref_ = ChartRef::Stored {
            id: "chart_1".into(),
        };
        assert_eq!(ref_.stored_id(), Some("chart_1"));
        assert!(ref_.inline_chart().is_none());
    }

    #[test]
    fn chart_ref_from_chart() {
        let chart = sample_chart();
        let ref_: ChartRef = chart.clone().into();
        assert_eq!(ref_.inline_chart(), Some(&chart));
    }

    // -----------------------------------------------------------------------
    // ChartRef resolution
    // -----------------------------------------------------------------------

    #[test]
    fn resolve_stored_chart_found() {
        let chart = sample_chart();
        let mut collection = ChartCollection::new();
        collection.insert("my_chart".into(), chart.clone());

        let ref_ = ChartRef::Stored {
            id: "my_chart".into(),
        };
        let resolved = ref_.resolve(&collection);
        assert_eq!(resolved, Some(&chart));
    }

    #[test]
    fn resolve_stored_chart_not_found() {
        let collection = ChartCollection::new();
        let ref_ = ChartRef::Stored {
            id: "nonexistent".into(),
        };
        assert!(ref_.resolve(&collection).is_none());
    }

    #[test]
    fn resolve_inline_chart() {
        let chart = sample_chart();
        let ref_ = ChartRef::Inline {
            chart: Box::new(chart.clone()),
        };
        let collection = ChartCollection::new();
        assert_eq!(ref_.resolve(&collection), Some(&chart));
    }

    #[test]
    fn resolve_stored_chart_mut() {
        let chart = sample_chart();
        let mut collection = ChartCollection::new();
        collection.insert("my_chart".into(), chart);

        let mut ref_ = ChartRef::Stored {
            id: "my_chart".into(),
        };
        let resolved = ref_.resolve_mut(&mut collection);
        assert!(resolved.is_some());
        // Modify the resolved chart
        if let Some(c) = resolved {
            c.add_series(Series::new("New Series", vec![DataPoint::new(200.0)]));
        }
        // Verify the modification persisted
        let chart = collection.get("my_chart").unwrap();
        assert_eq!(chart.series.len(), 2);
    }

    // -----------------------------------------------------------------------
    // ChartRef::store_in (inline → stored conversion)
    // -----------------------------------------------------------------------

    #[test]
    fn store_inline_chart_generates_id() {
        let chart = sample_chart();
        let mut ref_ = ChartRef::Inline {
            chart: Box::new(chart),
        };
        let mut collection = ChartCollection::new();

        let mut counter = 0;
        let id = ref_.store_in(&mut collection, || {
            counter += 1;
            format!("chart_{}", counter)
        });

        assert_eq!(id, "chart_1");
        assert_eq!(collection.len(), 1);
        assert!(collection.contains("chart_1"));
        // The ref should now be Stored
        assert_eq!(ref_.stored_id(), Some("chart_1"));
    }

    #[test]
    fn store_already_stored_chart() {
        let mut collection = ChartCollection::new();
        collection.insert("existing".into(), sample_chart());

        let mut ref_ = ChartRef::Stored {
            id: "existing".into(),
        };
        let id = ref_.store_in(&mut collection, || panic!("should not call generator"));
        assert_eq!(id, "existing");
        assert_eq!(collection.len(), 1); // unchanged
    }

    // -----------------------------------------------------------------------
    // ChartCollection operations
    // -----------------------------------------------------------------------

    #[test]
    fn chart_collection_insert_and_get() {
        let mut collection = ChartCollection::new();
        assert!(collection.is_empty());

        let chart = sample_chart();
        collection.insert("chart_1".into(), chart.clone());

        assert!(!collection.is_empty());
        assert_eq!(collection.len(), 1);
        assert!(collection.contains("chart_1"));
        assert_eq!(collection.get("chart_1"), Some(&chart));
    }

    #[test]
    fn chart_collection_replace_by_id() {
        let mut collection = ChartCollection::new();
        collection.insert("c1".into(), Chart::new(ChartKind::Bar));
        collection.insert("c1".into(), Chart::new(ChartKind::Pie));

        assert_eq!(collection.len(), 1);
        assert_eq!(collection.get("c1").unwrap().kind, ChartKind::Pie);
    }

    #[test]
    fn chart_collection_remove() {
        let mut collection = ChartCollection::new();
        collection.insert("c1".into(), sample_chart());
        collection.insert("c2".into(), Chart::new(ChartKind::Line));

        let removed = collection.remove("c1");
        assert!(removed.is_some());
        assert!(!collection.contains("c1"));
        assert!(collection.contains("c2"));
        assert_eq!(collection.len(), 1);
    }

    #[test]
    fn chart_collection_clear() {
        let mut collection = ChartCollection::new();
        collection.insert("a".into(), sample_chart());
        collection.insert("b".into(), Chart::new(ChartKind::Pie));
        assert_eq!(collection.len(), 2);

        collection.clear();
        assert!(collection.is_empty());
    }

    #[test]
    fn chart_collection_iter_and_ids() {
        let mut collection = ChartCollection::new();
        collection.insert("bar".into(), Chart::new(ChartKind::Bar));
        collection.insert("line".into(), Chart::new(ChartKind::Line));
        collection.insert("pie".into(), Chart::new(ChartKind::Pie));

        let ids: Vec<&str> = collection.ids().collect();
        assert_eq!(ids.len(), 3);
        assert!(ids.contains(&"bar"));
        assert!(ids.contains(&"line"));
        assert!(ids.contains(&"pie"));

        let pairs: Vec<(&str, &Chart)> = collection.iter().collect();
        assert_eq!(pairs.len(), 3);
    }

    // -----------------------------------------------------------------------
    // ChartRef serde round-trip
    // -----------------------------------------------------------------------

    #[test]
    fn chart_ref_stored_serde_roundtrip() {
        let ref_ = ChartRef::Stored {
            id: "my_chart".into(),
        };
        let json = serde_json::to_string(&ref_).unwrap();
        let deserialized: ChartRef = serde_json::from_str(&json).unwrap();
        assert_eq!(ref_, deserialized);
    }

    #[test]
    fn chart_ref_inline_serde_roundtrip() {
        let chart = sample_chart();
        let ref_ = ChartRef::Inline {
            chart: Box::new(chart),
        };
        let json = serde_json::to_string(&ref_).unwrap();
        let deserialized: ChartRef = serde_json::from_str(&json).unwrap();
        // Charts should match
        match (&ref_, &deserialized) {
            (ChartRef::Inline { chart: c1 }, ChartRef::Inline { chart: c2 }) => {
                assert_eq!(c1.kind, c2.kind);
                assert_eq!(c1.series, c2.series);
            }
            _ => panic!("expected Inline variant"),
        }
    }

    #[test]
    fn chart_collection_serde_roundtrip() {
        let mut collection = ChartCollection::new();
        collection.insert("bar".into(), Chart::new(ChartKind::Bar));
        collection.insert("pie".into(), Chart::new(ChartKind::Pie));

        let json = serde_json::to_string(&collection).unwrap();
        let deserialized: ChartCollection = serde_json::from_str(&json).unwrap();
        assert_eq!(collection, deserialized);
    }

    // -----------------------------------------------------------------------
    // EmbedError
    // -----------------------------------------------------------------------

    #[test]
    fn embed_error_chart_not_found_message() {
        let err = EmbedError::ChartNotFound;
        assert_eq!(format!("{}", err), "chart not found");
    }

    #[test]
    fn embed_error_render_failed_message() {
        let err = EmbedError::ChartRenderFailed(ChartError::InvalidOperation("test".into()));
        let msg = format!("{}", err);
        assert!(msg.contains("chart render failed"));
        assert!(msg.contains("test"));
    }

    // -----------------------------------------------------------------------
    // Integration: inline bar/line/pie charts — resolving and querying
    // -----------------------------------------------------------------------

    #[test]
    fn bar_chart_embedded_in_slide() {
        let chart = Chart::new(ChartKind::Bar);
        let ref_ = ChartRef::Inline {
            chart: Box::new(chart),
        };
        let collection = ChartCollection::new();
        let resolved = ref_.resolve(&collection);
        assert!(resolved.is_some());
        assert_eq!(resolved.unwrap().kind, ChartKind::Bar);
    }

    #[test]
    fn line_chart_embedded_in_slide() {
        let chart = Chart::new(ChartKind::Line);
        let ref_ = ChartRef::Inline {
            chart: Box::new(chart),
        };
        let collection = ChartCollection::new();
        let resolved = ref_.resolve(&collection);
        assert!(resolved.is_some());
        assert_eq!(resolved.unwrap().kind, ChartKind::Line);
    }

    #[test]
    fn pie_chart_embedded_in_slide() {
        let chart = Chart::new(ChartKind::Pie);
        let ref_ = ChartRef::Inline {
            chart: Box::new(chart),
        };
        let collection = ChartCollection::new();
        let resolved = ref_.resolve(&collection);
        assert!(resolved.is_some());
        assert_eq!(resolved.unwrap().kind, ChartKind::Pie);
    }

    #[test]
    fn stored_bar_and_line_charts_on_slide() {
        let bar_chart = Chart::new(ChartKind::Bar);
        let line_chart = Chart::new(ChartKind::Line);

        let mut collection = ChartCollection::new();
        collection.insert("bar".into(), bar_chart);
        collection.insert("line".into(), line_chart);

        let bar_ref = ChartRef::Stored { id: "bar".into() };
        let line_ref = ChartRef::Stored { id: "line".into() };

        assert_eq!(bar_ref.resolve(&collection).unwrap().kind, ChartKind::Bar);
        assert_eq!(line_ref.resolve(&collection).unwrap().kind, ChartKind::Line);
    }

    // -----------------------------------------------------------------------
    // ChartRef resolve_mut with stored and inline
    // -----------------------------------------------------------------------

    #[test]
    fn resolve_mut_inline_chart() {
        let mut collection = ChartCollection::new();
        let mut ref_ = ChartRef::Inline {
            chart: Box::new(Chart::new(ChartKind::Bar)),
        };
        let resolved = ref_.resolve_mut(&mut collection);
        assert!(resolved.is_some());
        // Change kind to Pie
        if let Some(c) = resolved {
            c.kind = ChartKind::Pie;
        }
        // Re-resolve and verify
        assert_eq!(ref_.resolve(&collection).unwrap().kind, ChartKind::Pie);
    }

    // -----------------------------------------------------------------------
    // store_in with counter-based ID generator
    // -----------------------------------------------------------------------

    #[test]
    fn store_in_generates_unique_ids() {
        let mut collection = ChartCollection::new();
        let mut counter = 0;
        let mut gen = || {
            counter += 1;
            format!("chart_{}", counter)
        };

        let chart1 = Chart::new(ChartKind::Bar);
        let chart2 = Chart::new(ChartKind::Line);

        let mut ref1 = ChartRef::Inline {
            chart: Box::new(chart1),
        };
        let mut ref2 = ChartRef::Inline {
            chart: Box::new(chart2),
        };

        let id1 = ref1.store_in(&mut collection, &mut gen);
        let id2 = ref2.store_in(&mut collection, &mut gen);

        assert_ne!(id1, id2);
        assert_eq!(collection.len(), 2);
        assert_eq!(ref1.stored_id(), Some("chart_1"));
        assert_eq!(ref2.stored_id(), Some("chart_2"));
    }

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn empty_chart_collection_is_empty() {
        let collection = ChartCollection::new();
        assert!(collection.is_empty());
        assert_eq!(collection.len(), 0);
        assert!(!collection.contains("anything"));
    }

    #[test]
    fn remove_nonexistent_chart_returns_none() {
        let mut collection = ChartCollection::new();
        assert!(collection.remove("ghost").is_none());
    }

    #[test]
    fn get_mut_nonexistent_returns_none() {
        let mut collection = ChartCollection::new();
        assert!(collection.get_mut("ghost").is_none());
    }

    // -----------------------------------------------------------------------
    // render_embedded_chart tests
    // -----------------------------------------------------------------------

    #[test]
    fn render_embedded_bar_chart() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new(
            "Sales",
            vec![
                DataPoint::with_category(100.0, "Q1"),
                DataPoint::with_category(150.0, "Q2"),
            ],
        ));
        let chart_ref = ChartRef::Inline {
            chart: Box::new(chart),
        };
        let collection = ChartCollection::new();
        let mut canvas = Canvas::new(800, 600);
        let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
        assert!(render_embedded_chart(&chart_ref, &collection, &mut canvas, rect).is_ok());
    }

    #[test]
    fn render_embedded_line_chart() {
        let mut chart = Chart::new(ChartKind::Line);
        chart.add_series(Series::new(
            "Revenue",
            vec![
                DataPoint::with_category(100.0, "Jan"),
                DataPoint::with_category(150.0, "Feb"),
                DataPoint::with_category(200.0, "Mar"),
            ],
        ));
        let chart_ref = ChartRef::Inline {
            chart: Box::new(chart),
        };
        let collection = ChartCollection::new();
        let mut canvas = Canvas::new(800, 600);
        let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
        assert!(render_embedded_chart(&chart_ref, &collection, &mut canvas, rect).is_ok());
    }

    #[test]
    fn render_embedded_pie_chart() {
        let mut chart = Chart::new(ChartKind::Pie);
        chart.add_series(Series::new(
            "Market Share",
            vec![
                DataPoint::with_category(45.0, "Company A"),
                DataPoint::with_category(30.0, "Company B"),
                DataPoint::with_category(25.0, "Company C"),
            ],
        ));
        let chart_ref = ChartRef::Inline {
            chart: Box::new(chart),
        };
        let collection = ChartCollection::new();
        let mut canvas = Canvas::new(800, 600);
        let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
        assert!(render_embedded_chart(&chart_ref, &collection, &mut canvas, rect).is_ok());
    }

    #[test]
    fn render_embedded_stored_chart() {
        let mut chart = Chart::new(ChartKind::Bar);
        chart.add_series(Series::new("Data", vec![DataPoint::new(50.0), DataPoint::new(75.0)]));
        
        let mut collection = ChartCollection::new();
        collection.insert("stored_chart".into(), chart);
        
        let chart_ref = ChartRef::Stored {
            id: "stored_chart".into(),
        };
        let mut canvas = Canvas::new(800, 600);
        let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
        assert!(render_embedded_chart(&chart_ref, &collection, &mut canvas, rect).is_ok());
    }

    #[test]
    fn render_embedded_chart_not_found_error() {
        let chart_ref = ChartRef::Stored {
            id: "nonexistent".into(),
        };
        let collection = ChartCollection::new();
        let mut canvas = Canvas::new(800, 600);
        let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
        let result = render_embedded_chart(&chart_ref, &collection, &mut canvas, rect);
        assert!(result.is_err());
        assert!(matches!(result, Err(EmbedError::ChartNotFound)));
    }
}
