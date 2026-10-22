//! World-Office Spreadsheet Engine
//!
//! This crate provides the spreadsheet model with full serde support,
//! implementing the SS (Spreadsheet) engine contract from the execution plan.

pub mod conditional;
pub mod export;
pub mod formula_eval;
pub mod format;
pub mod model;
pub mod ops;
pub mod pivot;
pub mod validation;

pub use conditional::{ConditionalResult, apply_conditional_format};
pub use export::{export_ods, from_ods};
pub use format::{FormatContext, FormatPattern, format_number, format_value};
pub use model::{
    Cell, CellStyle, ConditionalRule, DefinedName, EditRange, MergeRange, Range2d, Sheet,
    SheetOp, SheetProtection, SortKey, Workbook, allowed_edit_ranges, is_edit_allowed,
    is_edit_allowed_for_user, range_is_fully_allowed, range_is_fully_allowed_for_user,
};
pub use ops::{
    SheetOpError, SheetOpResult, apply_to_sheet, apply_to_sheet_protected,
    apply_to_sheet_protected_for_user, apply_to_workbook, apply_to_workbook_protected,
    apply_to_workbook_protected_for_user, invert_sheetop,
};
pub use validation::{
    DataValidation, ValidationErrorStyle, ValidationOperator, ValidationResult, ValidationType,
    is_valid, rules_for_cell, validate_cell,
};
