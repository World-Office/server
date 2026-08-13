//! World-Office Spreadsheet Engine
//!
//! This crate provides the spreadsheet model with full serde support,
//! implementing the SS (Spreadsheet) engine contract from the execution plan.

pub mod format;
pub mod model;
pub mod ops;

pub use format::{format_number, format_value, FormatContext, FormatPattern};
pub use model::{
    Cell, CellStyle, ConditionalRule, DefinedName, MergeRange, Range2d, Sheet, SheetOp,
    SortKey, Workbook,
};
pub use ops::{apply_to_sheet, apply_to_workbook, invert_sheetop, SheetOpError, SheetOpResult};
