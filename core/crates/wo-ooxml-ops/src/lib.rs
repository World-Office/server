//! wo-ooxml-ops: Document mutation operations for OOXML (DOCX)
//!
//! This crate provides operation types and a DocModel for mutating DOCX documents
//! via path-addressed operations.

pub mod model;
pub mod ops;
pub mod text;
pub mod paragraph;
pub mod table;
pub mod image;
pub mod list;
pub mod section;

// Re-export main types for convenience
pub use model::{EditableDocxBody, EditableModelError, UnderlineTypeFromStr};
pub use ops::{DocOp, DocOpError, DocModel, RunAttrs, WrapMode};
