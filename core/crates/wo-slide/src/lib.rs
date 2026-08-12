// wo-slide — Presentation slide model and rendering
//
// Pure Rust presentation engine supporting slide management, shape operations,
// chart embedding, auto-shape geometry, and animation timelines.
//
// This crate is part of the World-Office document editing suite and builds on
// `wo-renderer` for canvas output, `wo-chart` for chart rendering, and
// `wo-common` for shared types (path addressing, EditableModel, etc.).

pub mod chart_embed;
pub mod model;

pub use chart_embed::{render_embedded_chart, ChartCollection, ChartRef, EmbedError};
pub use model::{
    AdvanceMode, AnimationData, AutoShape, Bounds, ChartRef as PresentationChartRef,
    ColorScheme, ConnectorShape, ConnectorShapeType, EffectList, Fill, FontScheme,
    GradientFill, GradientKind, GradientStop, Master, ModelError, PlaceholderShape,
    Presentation, ReflectionDirection, ReflectionEffect, ShadowEffect, Shape,
    SlideBackground, SlideBackgroundType, SlideLayout, SlideMaster, SlideSize,
    SlideTransition, SmartArtShape, TableCell, TableColumn, TableRow, TableShape,
    TextBody, TextBoxShape, Theme, ThemeColor, ThemeFont, TransitionEffect,
};
