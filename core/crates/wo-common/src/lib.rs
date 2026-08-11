// wo-common — World-Office core shared types
//
// Common types used across all format crates: document model,
// encoding detection, format registry, and error types.

pub mod test_harness;

pub mod document;
pub mod encoding;
pub mod error;
pub mod format;
pub mod path;

// Re-export commonly used types at crate root
pub use document::{Document, DocumentMetadata};
pub use encoding::{split_lines, Bom, Encoding, LineEnding};
pub use error::CoreError;
pub use format::DocumentFormat;
pub use path::{Path, Range};

/// Result type for core operations.
pub type Result<T> = std::result::Result<T, error::CoreError>;
