//! Engine adapters projecting third-party renderers into [`NormalizedRender`].
//!
//! | adapter | oracle | geometry source |
//! |---|---|---|
//! | [`onlyoffice::OnlyOfficePdfEngine`] | OnlyOffice Document Server (pinned container) | PDF export → poppler bbox |
//!
//! See plan/2026-07-27-ooxml-conformance-strategy.md; capture layers L1/L2 use
//! the same IR with different tolerances (never pixel diffs as primary gate).

pub mod onlyoffice;
pub mod pdfgeom;

pub use onlyoffice::{DsClient, DsConfig, OnlyOfficePdfEngine, TempFileHost};
pub use pdfgeom::{PdfGeometrySource, PopplerSource};
