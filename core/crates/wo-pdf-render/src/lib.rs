//! wo-pdf-render — PDF rendering engine for World-Office.
//!
//! Backed by [pdfium](https://pdfium.org/) via the [`pdfium-render`] Rust crate.
//! The public contract is a pure-Rust [`PdfRenderer`] trait (added in PDF-2);
//! pdfium is a swappable backend behind that trait.
//!
//! ## Feature flags
//!
//! | Flag       | Default | Effect                                   |
//! |------------|---------|------------------------------------------|
//! | _none_     | ✓       | Dynamic loading of pdfium via `libloading` |
//!
//! The `static` feature of `pdfium-render` is always enabled in `Cargo.toml`.
//! When the `PDFIUM_STATIC_LIB_PATH` environment variable is set at build time,
//! pdfium-render links statically. Otherwise it falls back to dynamic loading.

// Re-export pdfium-render so consumers don't need a separate dependency.
pub use pdfium_render as pdfium;

mod renderer;
pub use renderer::{Annotation, PdfRenderer, PdfiumBackend, Rect};

mod acroform;
mod annotation;
mod text;

// Test utilities: Pdfium can only be initialized once per process,
// so we provide a global backend for tests to share.
#[cfg(test)]
use std::sync::OnceLock;
#[cfg(test)]
static TEST_BACKEND: OnceLock<Result<PdfiumBackend, String>> = OnceLock::new();

/// Get or initialize the global PdfiumBackend for testing.
/// Returns an error if Pdfium is already initialized elsewhere.
#[cfg(test)]
pub fn test_backend() -> Result<&'static PdfiumBackend, String> {
    let result = TEST_BACKEND.get_or_init(|| {
        // Try to create a backend. If Pdfium is already initialized,
        // this will fail with "PdfiumLibraryBindingsAlreadyInitialized"
        PdfiumBackend::new().map_err(|e| e.to_string())
    });
    result.as_ref().map_err(|e| e.clone())?;
    Ok(result.as_ref().unwrap())
}

/// Error types for PDF rendering operations.
///
/// Concrete render methods (added in PDF-2) will return this type.
#[derive(Debug, thiserror::Error)]
pub enum PdfError {
    /// Pdfium failed to initialize.
    #[error("pdfium initialization failed: {0}")]
    InitFailed(String),
    /// Pdfium returned an error during the requested operation.
    #[error("pdfium error: {0}")]
    PdfiumError(String),
    /// The requested page index is out of range.
    #[error("page {page} is out of range (document has {total} pages)")]
    PageOutOfRange { page: u32, total: u32 },
    /// An I/O error occurred.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}
