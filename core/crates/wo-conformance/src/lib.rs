// wo-conformance — engine-agnostic OOXML rendering conformance harness
//
// Scores *any* OOXML engine against captured Microsoft Word ground truth, with
// attribution that separates layout divergence from font substitution. This is
// the measurement layer the World-Office project was missing: the thing that
// turns "yet another renderer" into "the reference for whether any renderer is
// good enough."
//
// See plan/2026-07-27-ooxml-conformance-strategy.md.

pub mod corpus;
pub mod engine;
pub mod ground_truth;
pub mod model;
pub mod scoring;

pub use corpus::{run_case, run_corpus};
pub use engine::RenderEngine;
pub use ground_truth::{
    discover_corpus, ConformanceCase, CorpusManifest, GroundTruthFile, TRUTH_SCHEMA_VERSION,
};
pub use model::{
    BoxKind, ConformanceError, GlyphRun, LayoutBox, NormalizedRender, Page, PageSize, Point,
    RenderMetadata, RenderSpec, ResolvedFonts, GEOMETRY_TOLERANCE_PT,
};
pub use scoring::{
    compute_fidelity, compute_fidelity_cross_engine, CaseReport, ConformanceReport,
    FidelityBreakdown, ScoringMode,
};

pub const FORMAT_NAME: &str = "conformance";
