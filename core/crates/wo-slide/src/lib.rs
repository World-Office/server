// wo-slide — Presentation slide model and rendering
//
// Pure Rust presentation engine supporting slide management, shape operations,
// chart embedding, auto-shape geometry, and animation timelines.
//
// This crate is part of the World-Office document editing suite and builds on
// `wo-renderer` for canvas output, `wo-chart` for chart rendering, and
// `wo-common` for shared types (path addressing, EditableModel, etc.).

pub mod chart_embed;

pub use chart_embed::{render_embedded_chart, ChartCollection, ChartRef, EmbedError};
