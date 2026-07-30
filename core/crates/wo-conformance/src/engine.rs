//! The engine-agnostic render contract.
//!
//! Any OOXML renderer — ours, LibreOffice, OnlyOffice, anything — becomes
//! scorable by implementing this one adapter trait and emitting a
//! [`NormalizedRender`]. See strategy doc §3.2.

use crate::model::{ConformanceError, NormalizedRender, RenderSpec};

/// An engine that can lay a document out into the normalized IR.
///
/// Implementations are intentionally *thin*: parse the bytes the engine already
/// understands, run its existing layout, and project the result into
/// [`NormalizedRender`]. The trait owns no rendering logic of its own.
pub trait RenderEngine {
    /// Short, stable identifier, e.g. `"wo-docx-renderer"`.
    fn name(&self) -> &str;

    /// Engine version string, surfaced in reports for reproducibility.
    fn version(&self) -> &str;

    /// Render `doc` (raw OOXML package bytes, or whatever the engine accepts)
    /// into the normalized IR under the given spec.
    fn render(&self, doc: &[u8], spec: &RenderSpec) -> Result<NormalizedRender, ConformanceError>;
}
