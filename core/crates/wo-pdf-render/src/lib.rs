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
//! The `static` feature of `pdfium-render` is never enabled in `Cargo.toml`;
//! the backend always loads pdfium dynamically. `PdfiumBackend::new()` binds
//! to the library vendored by `build.rs` (absolute path, so no
//! `LD_LIBRARY_PATH` setup is needed), unless `PDFIUM_BINDINGS_LIBRARY_PATH`
//! overrides it, with the platform loader path as final fallback.

// Re-export pdfium-render so consumers don't need a separate dependency.
pub use pdfium_render as pdfium;

mod renderer;
pub use renderer::{Annotation, PdfRenderer, PdfiumBackend, Rect};

pub mod acroform;
mod annotation;
mod text;

// Test utilities: pdfium keeps process-global library state, so only **one**
// backend can be initialized per process (a second `PdfiumBackend::new()`
// fails with `PdfiumLibraryBindingsAlreadyInitialized`). Every pdfium-backed
// test therefore shares the backend created by the first caller. pdfium
// itself is not thread-safe, so the guard also serializes pdfium-backed
// tests against each other while the default test harness runs in parallel.
#[cfg(test)]
use std::sync::OnceLock;
#[cfg(test)]
static TEST_BACKEND: OnceLock<Result<PdfiumBackend, String>> = OnceLock::new();
#[cfg(test)]
static PDFIUM_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Test guard around the process-global [`PdfiumBackend`].
///
/// Dereferences to [`PdfiumBackend`] and holds the pdfium test lock for as
/// long as it lives, so parallel test threads never touch the (not
/// thread-safe) pdfium library concurrently.
#[cfg(test)]
pub struct PdfiumTestGuard {
    backend: &'static PdfiumBackend,
    _pdfium_lock: std::sync::MutexGuard<'static, ()>,
}

#[cfg(test)]
impl std::ops::Deref for PdfiumTestGuard {
    type Target = PdfiumBackend;

    fn deref(&self) -> &Self::Target {
        self.backend
    }
}

/// Pdfium runtime guard for tests.
///
/// Returns the process-global [`PdfiumBackend`] behind a [`PdfiumTestGuard`],
/// initializing it (and thereby loading the pdfium runtime) on first use.
/// Returns `None` — after logging a skip note — when the pdfium runtime
/// cannot be loaded in this environment (no vendored library from `build.rs`
/// and no pdfium on the platform loader path). Tests use this helper as
/// their runtime guard:
///
/// ```text
/// let Some(backend) = crate::test_backend_or_skip() else { return; };
/// ```
#[cfg(test)]
pub fn test_backend_or_skip() -> Option<PdfiumTestGuard> {
    let backend = match TEST_BACKEND.get_or_init(|| PdfiumBackend::new().map_err(|e| e.to_string()))
    {
        Ok(backend) => backend,
        Err(reason) => {
            eprintln!(
                "skipping pdfium-backed assertions: pdfium runtime unavailable ({reason}); \
                 set PDFIUM_BINDINGS_LIBRARY_PATH or let build.rs vendor libpdfium"
            );
            return None;
        }
    };

    // A poisoned lock only means another pdfium-backed test failed; keep
    // going so the remaining tests still exercise the backend.
    let _pdfium_lock = PDFIUM_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    Some(PdfiumTestGuard {
        backend,
        _pdfium_lock,
    })
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
