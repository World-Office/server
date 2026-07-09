// wo-x2t -- World-Office format conversion orchestrator
//!
//! Routes conversion requests between format modules and manages
//! the conversion pipeline. Replaces the C++ X2tConverter (38 files).

pub mod converter;
pub mod converters;
pub mod error;
pub mod model;
pub mod presentation_model;
pub mod roundtrip;
pub mod router;
pub mod spreadsheet_model;
pub mod visio_model;
pub mod pdf_model;

pub use converter::{
    error_result, success_result, unsupported_result, ConverterRegistry, FormatConverter,
};
pub use error::ConversionError;
pub use model::{ConversionInput, ConversionOutput, ConversionResult, ConversionStatus};
pub use roundtrip::X2tRoundtrip;
pub use router::ConversionRouter;

pub const FORMAT_NAME: &str = "x2t";
