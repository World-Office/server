// wo-common — World-Office core shared types
//
// Common types used across all format crates: document model,
// encoding detection, format registry, and error types.

pub mod test_harness;

pub mod document;
pub mod encoding;
pub mod error;
pub mod format;
pub mod op;
pub mod path;
pub mod units;

// Re-export commonly used types at crate root
pub use document::{Document, DocumentMetadata};
pub use encoding::{split_lines, Bom, Encoding, LineEnding};
pub use error::CoreError;
pub use format::DocumentFormat;
pub use op::{EditableModel, ModelOp};
pub use path::{Path, Range};
pub use units::{
    emu_to_cm, emu_to_pt, pt_to_emu, twips_to_emu, CM_TO_EMU, DX_TO_SX, EMU_PER_PT, IN_TO_EMU,
    PT_PER_IN, PX_PER_IN, TWIPS_PER_IN,
};

/// Result type for core operations.
pub type Result<T> = std::result::Result<T, error::CoreError>;
