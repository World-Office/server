//! World-Office Spreadsheet Engine
//!
//! This crate provides the spreadsheet model with full serde support,
//! implementing the SS (Spreadsheet) engine contract from the execution plan.

pub mod conditional;
pub mod format;
pub mod model;
pub mod ops;
pub mod pivot;
pub mod validation;

pub use conditional::{ConditionalResult, apply_conditional_format};
pub use format::{FormatContext, FormatPattern, format_number, format_value};
pub use model::{
    Cell, CellStyle, ConditionalRule, DefinedName, MergeRange, Range2d, Sheet, SheetOp, SortKey,
    Workbook,
};
pub use ops::{SheetOpError, SheetOpResult, apply_to_sheet, apply_to_workbook, invert_sheetop};
pub use validation::{
    DataValidation, ValidationErrorStyle, ValidationOperator, ValidationResult, ValidationType,
    is_valid, rules_for_cell, validate_cell,
};
