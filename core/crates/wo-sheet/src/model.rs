//! Spreadsheet model for the SS (Spreadsheet) engine.
//!
//! This module provides the core data structures for representing spreadsheets,
//! including workbooks, sheets, cells, and operations. All structs implement serde
//! for serialization and deserialization.

use std::collections::BTreeMap;

use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use wo_common::op::{EditableModel, ModelOp};
use wo_common::path::{Path, Range};
use wo_formula::ast::{CellValue, Expr};

/// A 2D range for spreadsheet operations.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Range2d {
    /// Starting row (inclusive)
    pub start_row: u32,
    /// Starting column (inclusive)
    pub start_col: u32,
    /// Ending row (inclusive)
    pub end_row: u32,
    /// Ending column (inclusive)
    pub end_col: u32,
}

impl Range2d {
    /// Create a new range from start and end coordinates.
    pub fn new(start_row: u32, start_col: u32, end_row: u32, end_col: u32) -> Self {
        Self {
            start_row,
            start_col,
            end_row,
            end_col,
        }
    }

    /// Check if a cell is within this range.
    pub fn contains(&self, row: u32, col: u32) -> bool {
        row >= self.start_row
            && row <= self.end_row
            && col >= self.start_col
            && col <= self.end_col
    }
}

/// A merged cell range in a spreadsheet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MergeRange {
    /// Top-left cell (row, column)
    pub start_row: u32,
    pub start_col: u32,
    /// Bottom-right cell (row, column)
    pub end_row: u32,
    pub end_col: u32,
}

impl MergeRange {
    /// Create a new merge range.
    pub fn new(start_row: u32, start_col: u32, end_row: u32, end_col: u32) -> Self {
        Self {
            start_row,
            start_col,
            end_row,
            end_col,
        }
    }
}

/// Cell styling properties.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct CellStyle {
    /// Font family
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    /// Font size in points
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    /// Bold
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    /// Italic
    #[serde(skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    /// Underline
    #[serde(skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    /// Strikethrough
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strikethrough: Option<bool>,
    /// Text color (hex, e.g., "#FF0000")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Background color (hex)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    /// Horizontal alignment (left, center, right)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub horizontal_align: Option<String>,
    /// Vertical alignment (top, middle, bottom)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical_align: Option<String>,
    /// Border style
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border: Option<String>,
    /// Number format (Excel-style format code)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number_format: Option<String>,
}

/// A single cell in a spreadsheet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Cell {
    /// Raw input string (what the user typed)
    pub raw: String,
    /// Computed/parsed value
    pub value: CellValue,
    /// Optional formula (parsed AST)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<Expr>,
    /// Cell styling
    #[serde(default)]
    pub style: CellStyle,
}

impl Default for Cell {
    fn default() -> Self {
        Self {
            raw: String::new(),
            value: CellValue::Empty,
            formula: None,
            style: CellStyle::default(),
        }
    }
}

impl Cell {
    /// Create a new empty cell.
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a cell with text content.
    pub fn with_text(text: impl Into<String>) -> Self {
        let text = text.into();
        Self {
            raw: text.clone(),
            value: CellValue::Text(text),
            formula: None,
            style: CellStyle::default(),
        }
    }

    /// Create a cell with a numeric value.
    pub fn with_num(value: f64) -> Self {
        Self {
            raw: value.to_string(),
            value: CellValue::Num(value),
            formula: None,
            style: CellStyle::default(),
        }
    }

    /// Create a cell with a formula.
    pub fn with_formula(raw: impl Into<String>, formula: Expr, value: CellValue) -> Self {
        Self {
            raw: raw.into(),
            value,
            formula: Some(formula),
            style: CellStyle::default(),
        }
    }
}

/// A worksheet within a workbook.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sheet {
    /// Unique identifier for the sheet
    pub id: String,
    /// Display name of the sheet
    pub name: String,
    /// Cell data stored by (row, column) coordinates
    pub cells: FxHashMap<(u32, u32), Cell>,
    /// Column widths (column index -> width in points)
    pub col_widths: BTreeMap<u32, f32>,
    /// Row heights (row index -> height in points)
    pub row_heights: BTreeMap<u32, f32>,
    /// Merged cell ranges
    pub merges: Vec<MergeRange>,
    /// Frozen pane position (row, column) if any
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frozen: Option<(u32, u32)>,
    /// Visibility flag
    #[serde(default)]
    pub visible: bool,
}

impl Default for Sheet {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            cells: FxHashMap::default(),
            col_widths: BTreeMap::new(),
            row_heights: BTreeMap::new(),
            merges: Vec::new(),
            frozen: None,
            visible: true,
        }
    }
}

impl Sheet {
    /// Create a new empty sheet with the given name.
    pub fn new(name: impl Into<String>) -> Self {
        let name = name.into();
        Self {
            id: name.clone(),
            name,
            cells: FxHashMap::default(),
            col_widths: BTreeMap::new(),
            row_heights: BTreeMap::new(),
            merges: Vec::new(),
            frozen: None,
            visible: true,
        }
    }

    /// Get a cell at the specified coordinates.
    pub fn get_cell(&self, row: u32, col: u32) -> Option<&Cell> {
        self.cells.get(&(row, col))
    }

    /// Get a mutable reference to a cell at the specified coordinates.
    pub fn get_cell_mut(&mut self, row: u32, col: u32) -> Option<&mut Cell> {
        self.cells.get_mut(&(row, col))
    }

    /// Set a cell at the specified coordinates.
    pub fn set_cell(&mut self, row: u32, col: u32, cell: Cell) {
        self.cells.insert((row, col), cell);
    }

    /// Remove a cell at the specified coordinates.
    pub fn remove_cell(&mut self, row: u32, col: u32) -> Option<Cell> {
        self.cells.remove(&(row, col))
    }

    /// Get the display value of a cell as a string.
    pub fn cell_value_string(&self, row: u32, col: u32) -> String {
        self.get_cell(row, col)
            .map(|c| c.raw.clone())
            .unwrap_or_default()
    }

    /// Set column width.
    pub fn set_col_width(&mut self, col: u32, width: f32) {
        self.col_widths.insert(col, width);
    }

    /// Get column width.
    pub fn get_col_width(&self, col: u32) -> Option<f32> {
        self.col_widths.get(&col).copied()
    }

    /// Set row height.
    pub fn set_row_height(&mut self, row: u32, height: f32) {
        self.row_heights.insert(row, height);
    }

    /// Get row height.
    pub fn get_row_height(&self, row: u32) -> Option<f32> {
        self.row_heights.get(&row).copied()
    }

    /// Add a merged range.
    pub fn add_merge(&mut self, merge: MergeRange) {
        self.merges.push(merge);
    }

    /// Check if a cell is in a merged range.
    pub fn is_merged(&self, row: u32, col: u32) -> bool {
        self.merges.iter().any(|m| {
            row >= m.start_row
                && row <= m.end_row
                && col >= m.start_col
                && col <= m.end_col
        })
    }

    /// Get the top-left cell of the merged range containing the given cell.
    pub fn merge_top_left(&self, row: u32, col: u32) -> Option<(u32, u32)> {
        self.merges.iter().find_map(|m| {
            if row >= m.start_row && row <= m.end_row && col >= m.start_col && col <= m.end_col {
                Some((m.start_row, m.start_col))
            } else {
                None
            }
        })
    }

    /// Set frozen pane position.
    pub fn set_frozen(&mut self, row: u32, col: u32) {
        self.frozen = Some((row, col));
    }

    /// Clear frozen pane.
    pub fn clear_frozen(&mut self) {
        self.frozen = None;
    }
}

/// A named range in the workbook.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DefinedName {
    /// Name of the defined range
    pub name: String,
    /// Reference (e.g., "Sheet1!A1:B10")
    pub refs: String,
    /// Optional scope (sheet name or workbook)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    /// Optional comment
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

impl DefinedName {
    /// Create a new defined name.
    pub fn new(name: impl Into<String>, refs: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            refs: refs.into(),
            scope: None,
            comment: None,
        }
    }
}

/// Sort key for sorting operations.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SortKey {
    /// Column index (0-based or 1-based depending on context)
    pub col: u32,
    /// Sort order (ascending or descending)
    pub order: SortOrder,
}

/// Sort order direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    #[default]
    Ascending,
    Descending,
}

/// Conditional formatting rule.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ConditionalRule {
    /// Cell value is greater than a constant
    GreaterThan { value: f64, style: CellStyle },
    /// Cell value is less than a constant
    LessThan { value: f64, style: CellStyle },
    /// Cell value is between two values
    Between { min: f64, max: f64, style: CellStyle },
    /// Cell value equals a constant
    EqualTo { value: String, style: CellStyle },
    /// Cell contains text
    ContainsText { text: String, style: CellStyle },
    /// Cell is empty
    Empty { style: CellStyle },
    /// Top N values
    TopN { n: usize, style: CellStyle },
    /// Bottom N values
    BottomN { n: usize, style: CellStyle },
    /// Above average
    AboveAverage { style: CellStyle },
    /// Below average
    BelowAverage { style: CellStyle },
    /// Custom formula
    Formula { formula: String, style: CellStyle },
    /// Date is within a period
    DatePeriod { period: DatePeriod, style: CellStyle },
    /// Duplicate values
    Duplicate { style: CellStyle },
}

/// Date period for conditional formatting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatePeriod {
    Today,
    Yesterday,
    Tomorrow,
    Last7Days,
    Last30Days,
    Next7Days,
    Next30Days,
    ThisMonth,
    LastMonth,
    NextMonth,
    ThisYear,
    LastYear,
    NextYear,
}

/// Operations that can be performed on a spreadsheet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum SheetOp {
    /// Set the value of a cell
    SetCell {
        row: u32,
        col: u32,
        raw: String,
    },
    /// Insert rows
    InsertRow {
        after: u32,
        count: u32,
    },
    /// Delete rows
    DeleteRow {
        row: u32,
        count: u32,
    },
    /// Insert columns
    InsertCol {
        after: u32,
        count: u32,
    },
    /// Delete columns
    DeleteCol {
        col: u32,
        count: u32,
    },
    /// Merge cells
    Merge(MergeRange),
    /// Unmerge cells
    Unmerge(MergeRange),
    /// Apply styling to a range
    SetStyle {
        range: Range2d,
        style: CellStyle,
    },
    /// Sort a range
    Sort {
        range: Range2d,
        keys: Vec<SortKey>,
    },
    /// Apply conditional formatting to a range
    ApplyConditionalFormat {
        range: Range2d,
        rule: ConditionalRule,
    },
    /// Clear cells
    Clear {
        range: Range2d,
    },
    /// Copy cells
    Copy {
        from: Range2d,
        to: (u32, u32),
    },
    /// Paste cells
    Paste {
        at: (u32, u32),
        data: Vec<Vec<Cell>>,
    },
    /// Set column width
    SetColWidth {
        col: u32,
        width: f32,
    },
    /// Set row height
    SetRowHeight {
        row: u32,
        height: f32,
    },
    /// Freeze panes
    FreezePanes {
        row: u32,
        col: u32,
    },
    /// Unfreeze panes
    UnfreezePanes,
    /// Rename sheet
    RenameSheet {
        old_name: String,
        new_name: String,
    },
    /// Add a new sheet
    AddSheet {
        name: String,
    },
    /// Remove a sheet
    RemoveSheet {
        name: String,
    },
    /// Set sheet visibility
    SetSheetVisibility {
        name: String,
        visible: bool,
    },
}

/// The main workbook structure.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Workbook {
    /// All sheets in the workbook
    pub sheets: Vec<Sheet>,
    /// Named ranges defined in the workbook
    pub defined_names: Vec<DefinedName>,
    /// Active sheet index
    #[serde(default)]
    pub active_sheet: usize,
    /// Calculation mode
    #[serde(default)]
    pub calc_mode: CalcMode,
    /// Revision number for tracking changes
    #[serde(default)]
    pub revision: u64,
}

/// Calculation mode for the workbook.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CalcMode {
    /// Automatic calculation
    #[default]
    Automatic,
    /// Manual calculation
    Manual,
    /// Automatic except for data tables
    SemiAutomatic,
}

impl Workbook {
    /// Create a new empty workbook.
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a sheet to the workbook.
    pub fn add_sheet(&mut self, sheet: Sheet) {
        self.sheets.push(sheet);
        if self.active_sheet >= self.sheets.len() {
            self.active_sheet = self.sheets.len() - 1;
        }
    }

    /// Get a sheet by index.
    pub fn get_sheet(&self, index: usize) -> Option<&Sheet> {
        self.sheets.get(index)
    }

    /// Get a mutable reference to a sheet by index.
    pub fn get_sheet_mut(&mut self, index: usize) -> Option<&mut Sheet> {
        self.sheets.get_mut(index)
    }

    /// Get a sheet by name.
    pub fn get_sheet_by_name(&self, name: &str) -> Option<&Sheet> {
        self.sheets.iter().find(|s| s.name == name)
    }

    /// Get a mutable reference to a sheet by name.
    pub fn get_sheet_by_name_mut(&mut self, name: &str) -> Option<&mut Sheet> {
        self.sheets.iter_mut().find(|s| s.name == name)
    }

    /// Remove a sheet by index.
    pub fn remove_sheet(&mut self, index: usize) -> Option<Sheet> {
        let removed = self.sheets.remove(index);
        if self.active_sheet >= self.sheets.len() && !self.sheets.is_empty() {
            self.active_sheet = self.sheets.len() - 1;
        }
        Some(removed)
    }

    /// Set the active sheet.
    pub fn set_active_sheet(&mut self, index: usize) -> Result<(), String> {
        if index < self.sheets.len() {
            self.active_sheet = index;
            Ok(())
        } else {
            Err(format!("Sheet index {} out of range", index))
        }
    }

    /// Get the active sheet.
    pub fn active_sheet(&self) -> Option<&Sheet> {
        self.sheets.get(self.active_sheet)
    }

    /// Get a cell from the active sheet.
    pub fn get_cell(&self, row: u32, col: u32) -> Option<&Cell> {
        self.active_sheet().and_then(|s| s.get_cell(row, col))
    }

    /// Set a cell in the active sheet.
    pub fn set_cell(&mut self, row: u32, col: u32, cell: Cell) -> Result<(), String> {
        if let Some(sheet) = self.sheets.get_mut(self.active_sheet) {
            sheet.set_cell(row, col, cell);
            self.revision += 1;
            Ok(())
        } else {
            Err("No active sheet".to_string())
        }
    }

    /// Get cell value as string from active sheet.
    pub fn cell_value(&self, row: u32, col: u32) -> Option<&Cell> {
        self.get_cell(row, col)
    }

    /// Add a defined name.
    pub fn add_defined_name(&mut self, name: DefinedName) {
        self.defined_names.push(name);
    }

    /// Increment the revision counter.
    pub fn increment_revision(&mut self) {
        self.revision += 1;
    }

    /// Get the current revision.
    pub fn current_revision(&self) -> u64 {
        self.revision
    }
}

/// Error type for Workbook operations.
#[derive(Debug, Clone, PartialEq, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "error", rename_all = "snake_case")]
pub enum SheetError {
    #[error("sheet not found: {name}")]
    SheetNotFound { name: String },
    #[error("cell not found at ({row}, {col})")]
    CellNotFound { row: u32, col: u32 },
    #[error("invalid range: start ({start_row}, {start_col}) must be <= end ({end_row}, {end_col})")]
    InvalidRange {
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    },
    #[error("merge range out of bounds")]
    MergeOutOfBounds,
    #[error("cannot merge overlapping ranges")]
    OverlappingMerge,
    #[error("invalid formula: {message}")]
    InvalidFormula { message: String },
    #[error("circular reference detected")]
    CircularReference,
    #[error("operation not supported")]
    NotSupported,
}

/// Implementation of EditableModel for Workbook.
///
/// This allows the spreadsheet to work with the universal mutation API
/// defined in wo-common for collaboration, undo, and WASM export.
impl EditableModel for Workbook {
    type Err = SheetError;

    /// Apply a ModelOp to the workbook.
    ///
    /// This maps the universal ModelOp to spreadsheet-specific operations.
    fn apply(&mut self, op: &ModelOp) -> Result<(), Self::Err> {
        match op {
            ModelOp::Insert { at, content } => {
                // Insert at a sheet path
                if let Path::Sheet { sheet, row, col } = at {
                    if let Some(sheet) = self.get_sheet_by_name_mut(sheet) {
                        sheet.set_cell(*row, *col, Cell::with_text(content.clone()));
                        self.revision += 1;
                        Ok(())
                    } else {
                        Err(SheetError::SheetNotFound { name: sheet.clone() })
                    }
                } else {
                    Err(SheetError::NotSupported)
                }
            }
            ModelOp::Delete { range } => {
                // Delete over a range
                if let (Path::Sheet { sheet: s1, row: r1, col: c1 }, Path::Sheet { sheet: s2, row: r2, col: c2 }) = (&range.start, &range.end) {
                    if s1 != s2 {
                        return Err(SheetError::NotSupported);
                    }
                    if let Some(sheet) = self.get_sheet_by_name_mut(s1) {
                        // For now, just clear the cells in range
                        // A more complete implementation would shift cells
                        for row in *r1..=*r2 {
                            for col in *c1..=*c2 {
                                sheet.remove_cell(row, col);
                            }
                        }
                        self.revision += 1;
                        Ok(())
                    } else {
                        Err(SheetError::SheetNotFound { name: s1.clone() })
                    }
                } else {
                    Err(SheetError::NotSupported)
                }
            }
            ModelOp::Replace { at, content } => {
                // Replace content at a position
                if let Path::Sheet { sheet, row, col } = at {
                    if let Some(sheet) = self.get_sheet_by_name_mut(sheet) {
                        sheet.set_cell(*row, *col, Cell::with_text(content.clone()));
                        self.revision += 1;
                        Ok(())
                    } else {
                        Err(SheetError::SheetNotFound { name: sheet.clone() })
                    }
                } else {
                    Err(SheetError::NotSupported)
                }
            }
            ModelOp::Format { range, attrs } => {
                // Apply formatting over a range
                // Extract style properties from attrs
                let mut style = CellStyle::default();
                if let Some(font_family) = attrs.get("font_family").and_then(|v| v.as_str()) {
                    style.font_family = Some(font_family.to_string());
                }
                if let Some(font_size) = attrs.get("font_size").and_then(|v| v.as_f64()) {
                    style.font_size = Some(font_size as f32);
                }
                if let Some(bold) = attrs.get("bold").and_then(|v| v.as_bool()) {
                    style.bold = Some(bold);
                }
                // Apply more formatting as needed...

                if let (Path::Sheet { sheet: s1, row: r1, col: c1 }, Path::Sheet { sheet: s2, row: r2, col: c2 }) = (&range.start, &range.end) {
                    if s1 != s2 {
                        return Err(SheetError::NotSupported);
                    }
                    if let Some(sheet) = self.get_sheet_by_name_mut(s1) {
                        for row in *r1..=*r2 {
                            for col in *c1..=*c2 {
                                if let Some(cell) = sheet.get_cell_mut(row, col) {
                                    // Merge the new style with existing
                                    if style.font_family.is_some() {
                                        cell.style.font_family = style.font_family.clone();
                                    }
                                    if style.font_size.is_some() {
                                        cell.style.font_size = style.font_size;
                                    }
                                    if style.bold.is_some() {
                                        cell.style.bold = style.bold;
                                    }
                                    // Apply more formatting...
                                }
                            }
                        }
                        self.revision += 1;
                        Ok(())
                    } else {
                        Err(SheetError::SheetNotFound { name: s1.clone() })
                    }
                } else {
                    Err(SheetError::NotSupported)
                }
            }
            ModelOp::Move { from: _, to: _ } => {
                // Move not yet implemented for sheets
                Err(SheetError::NotSupported)
            }
        }
    }

    /// Invert a ModelOp.
    ///
    /// Returns the operation that would undo the given operation.
    fn invert(&self, op: &ModelOp) -> ModelOp {
        match op {
            ModelOp::Insert { at, content } => {
                // Inverse of insert is delete over the inserted range
                if let Path::Sheet { sheet, row, col } = at {
                    // For simplicity, assume single cell insert
                    ModelOp::Delete {
                        range: Range {
                            start: Path::Sheet {
                                sheet: sheet.clone(),
                                row: *row,
                                col: *col,
                            },
                            end: Path::Sheet {
                                sheet: sheet.clone(),
                                row: *row,
                                col: *col,
                            },
                        },
                    }
                } else {
                    // Can't invert if not a sheet path
                    ModelOp::Insert {
                        at: at.clone(),
                        content: content.clone(),
                    }
                }
            }
            ModelOp::Delete { range } => {
                // Inverse of delete is insert with the deleted content
                // We can't know what was deleted, so we return a placeholder
                ModelOp::Insert {
                    at: range.start.clone(),
                    content: String::new(),
                }
            }
            ModelOp::Replace { at, content } => {
                // Inverse of replace is replace with old content
                // We can't know old content, so return same op
                ModelOp::Replace {
                    at: at.clone(),
                    content: content.clone(),
                }
            }
            ModelOp::Format { range, attrs: _ } => {
                // Inverse of format is format with default/empty attrs
                ModelOp::Format {
                    range: range.clone(),
                    attrs: std::collections::BTreeMap::new(),
                }
            }
            ModelOp::Move { from, to } => {
                // Inverse of move is move back
                ModelOp::Move {
                    from: to.clone(),
                    to: from.clone(),
                }
            }
        }
    }

    /// Get all operations since a given revision.
    ///
    /// This would normally query an operation log, but for now we return
    /// an empty vector as we don't have persistent op logging yet.
    fn to_ops_since(&self, _rev: u64) -> Vec<ModelOp> {
        // Placeholder: in a real implementation, this would return ops from
        // self.revision - rev onwards. For now, return empty.
        Vec::new()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Test 1: Workbook creation and basic operations
    #[test]
    fn test_workbook_creation() {
        let mut wb = Workbook::new();
        assert!(wb.sheets.is_empty());
        assert_eq!(wb.revision, 0);

        wb.add_sheet(Sheet::new("Sheet1"));
        assert_eq!(wb.sheets.len(), 1);
        assert_eq!(wb.sheets[0].name, "Sheet1");
    }

    // Test 2: Sheet cell operations
    #[test]
    fn test_sheet_cell_operations() {
        let mut sheet = Sheet::new("Test");
        assert!(sheet.get_cell(0, 0).is_none());

        sheet.set_cell(0, 0, Cell::with_text("Hello"));
        assert!(sheet.get_cell(0, 0).is_some());
        assert_eq!(sheet.get_cell(0, 0).unwrap().raw, "Hello");

        sheet.remove_cell(0, 0);
        assert!(sheet.get_cell(0, 0).is_none());
    }

    // Test 3: Cell with formula
    #[test]
    fn test_cell_with_formula() {
        use wo_formula::parse;
        let expr = parse("1+2").unwrap();
        let cell = Cell::with_formula("1+2", expr, CellValue::Num(3.0));
        assert_eq!(cell.raw, "1+2");
        assert!(cell.formula.is_some());
        assert_eq!(cell.value, CellValue::Num(3.0));
    }

    // Test 4: Merge range
    #[test]
    fn test_merge_range() {
        let merge = MergeRange::new(0, 0, 2, 2);
        assert_eq!(merge.start_row, 0);
        assert_eq!(merge.start_col, 0);
        assert_eq!(merge.end_row, 2);
        assert_eq!(merge.end_col, 2);
    }

    // Test 5: Range2d contains
    #[test]
    fn test_range2d_contains() {
        let range = Range2d::new(0, 0, 5, 5);
        assert!(range.contains(0, 0));
        assert!(range.contains(2, 3));
        assert!(range.contains(5, 5));
        assert!(!range.contains(6, 6));
        assert!(!range.contains(0, 6));
    }

    // Test 6: CellStyle serialization
    #[test]
    fn test_cell_style_serde() {
        let style = CellStyle {
            font_family: Some("Arial".to_string()),
            font_size: Some(12.0),
            bold: Some(true),
            ..Default::default()
        };
        let json = serde_json::to_string(&style).unwrap();
        let back: CellStyle = serde_json::from_str(&json).unwrap();
        assert_eq!(style.font_family, back.font_family);
        assert_eq!(style.font_size, back.font_size);
        assert_eq!(style.bold, back.bold);
    }

    // Test 7: Cell serialization
    #[test]
    fn test_cell_serde() {
        let cell = Cell::with_text("Test");
        let json = serde_json::to_string(&cell).unwrap();
        let back: Cell = serde_json::from_str(&json).unwrap();
        assert_eq!(cell.raw, back.raw);
        assert_eq!(cell.value, back.value);
    }

    // Test 8: Sheet fields are accessible (serde traits are compile-time verified)
    #[test]
    fn test_sheet_fields() {
        let mut sheet = Sheet::new("Test");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(0, 1, Cell::with_num(42.0));
        sheet.set_col_width(0, 100.0);
        sheet.set_row_height(0, 25.0);

        assert_eq!(sheet.name, "Test");
        assert_eq!(sheet.get_cell(0, 0).unwrap().raw, "A1");
        assert_eq!(sheet.get_cell(0, 1).unwrap().raw, "42");
        assert_eq!(sheet.get_col_width(0), Some(100.0));
        assert_eq!(sheet.get_row_height(0), Some(25.0));
    }

    // Test 9: Workbook fields are accessible
    #[test]
    fn test_workbook_fields() {
        let mut wb = Workbook::new();
        let mut sheet1 = Sheet::new("Sheet1");
        sheet1.set_cell(0, 0, Cell::with_text("Hello"));
        wb.add_sheet(sheet1);

        let mut sheet2 = Sheet::new("Sheet2");
        sheet2.set_cell(0, 0, Cell::with_num(123.0));
        wb.add_sheet(sheet2);

        wb.add_defined_name(DefinedName::new("MyRange", "Sheet1!A1:B10"));

        assert_eq!(wb.sheets.len(), 2);
        assert_eq!(wb.sheets[0].name, "Sheet1");
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "Hello");
        assert_eq!(wb.defined_names.len(), 1);
        assert_eq!(wb.defined_names[0].name, "MyRange");
    }

    // Test 10: Path::Sheet operations
    #[test]
    fn test_path_sheet() {
        let path = Path::Sheet {
            sheet: "Sheet1".to_string(),
            row: 5,
            col: 10,
        };
        let json = serde_json::to_string(&path).unwrap();
        let back: Path = serde_json::from_str(&json).unwrap();
        if let Path::Sheet { sheet, row, col } = back {
            assert_eq!(sheet, "Sheet1");
            assert_eq!(row, 5);
            assert_eq!(col, 10);
        } else {
            panic!("Path deserialized to wrong variant");
        }
    }

    // Test 11: EditableModel apply - Insert
    #[test]
    fn test_editable_model_insert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));

        let op = ModelOp::Insert {
            at: Path::Sheet {
                sheet: "Sheet1".to_string(),
                row: 0,
                col: 0,
            },
            content: "Test".to_string(),
        };

        wb.apply(&op).unwrap();
        assert_eq!(wb.revision, 1);
        assert_eq!(wb.get_cell(0, 0).unwrap().raw, "Test");
    }

    // Test 12: EditableModel apply - Replace
    #[test]
    fn test_editable_model_replace() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("Old"));
        wb.add_sheet(sheet);

        let op = ModelOp::Replace {
            at: Path::Sheet {
                sheet: "Sheet1".to_string(),
                row: 0,
                col: 0,
            },
            content: "New".to_string(),
        };

        wb.apply(&op).unwrap();
        assert_eq!(wb.get_cell(0, 0).unwrap().raw, "New");
    }

    // Test 13: EditableModel invert - Insert
    #[test]
    fn test_editable_model_invert_insert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));

        let op = ModelOp::Insert {
            at: Path::Sheet {
                sheet: "Sheet1".to_string(),
                row: 0,
                col: 0,
            },
            content: "Test".to_string(),
        };

        let inverted = wb.invert(&op);
        // Inverse of insert should be delete
        match inverted {
            ModelOp::Delete { .. } => {},
            _ => panic!("Expected Delete op as inverse of Insert"),
        }
    }

    // Test 14: Merge cell range
    #[test]
    fn test_sheet_merged_cells() {
        let mut sheet = Sheet::new("Test");
        let merge = MergeRange::new(0, 0, 2, 2);
        sheet.add_merge(merge);

        assert!(sheet.is_merged(0, 0));
        assert!(sheet.is_merged(1, 1));
        assert!(sheet.is_merged(2, 2));
        assert!(!sheet.is_merged(3, 3));

        let top_left = sheet.merge_top_left(1, 1);
        assert_eq!(top_left, Some((0, 0)));
    }

    // Test 15: Frozen panes
    #[test]
    fn test_sheet_frozen() {
        let mut sheet = Sheet::new("Test");
        assert!(sheet.frozen.is_none());

        sheet.set_frozen(1, 1);
        assert_eq!(sheet.frozen, Some((1, 1)));

        sheet.clear_frozen();
        assert!(sheet.frozen.is_none());
    }

    // Test 16: SheetOp serialization
    #[test]
    fn test_sheet_op_serde() {
        let op = SheetOp::SetCell {
            row: 5,
            col: 10,
            raw: "Test".to_string(),
        };
        let json = serde_json::to_string(&op).unwrap();
        assert!(json.contains("set_cell"));
        assert!(json.contains("5"));
        assert!(json.contains("10"));
        assert!(json.contains("Test"));

        let back: SheetOp = serde_json::from_str(&json).unwrap();
        match back {
            SheetOp::SetCell { row, col, raw } => {
                assert_eq!(row, 5);
                assert_eq!(col, 10);
                assert_eq!(raw, "Test");
            }
            _ => panic!("Wrong op variant"),
        }
    }

    // Test 17: SortKey serialization
    #[test]
    fn test_sort_key_serde() {
        let key = SortKey {
            col: 2,
            order: SortOrder::Descending,
        };
        let json = serde_json::to_string(&key).unwrap();
        let back: SortKey = serde_json::from_str(&json).unwrap();
        assert_eq!(key.col, back.col);
        assert_eq!(key.order, back.order);
    }

    // Test 18: ConditionalRule serialization
    #[test]
    fn test_conditional_rule_serde() {
        let rule = ConditionalRule::GreaterThan {
            value: 100.0,
            style: CellStyle {
                background_color: Some("#FF0000".to_string()),
                ..Default::default()
            },
        };
        let json = serde_json::to_string(&rule).unwrap();
        assert!(json.contains("greater_than"));
        assert!(json.contains("100"));
        assert!(json.contains("FF0000"));
    }

    // Test 19: DefinedName operations
    #[test]
    fn test_defined_name() {
        let name = DefinedName::new("MyRange", "Sheet1!A1:B10");
        assert_eq!(name.name, "MyRange");
        assert_eq!(name.refs, "Sheet1!A1:B10");

        let mut wb = Workbook::new();
        wb.add_defined_name(name);
        assert_eq!(wb.defined_names.len(), 1);
        assert_eq!(wb.defined_names[0].name, "MyRange");
    }

    // Test 20: Workbook active sheet management
    #[test]
    fn test_workbook_active_sheet() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        wb.add_sheet(Sheet::new("Sheet2"));
        wb.add_sheet(Sheet::new("Sheet3"));

        assert_eq!(wb.active_sheet(), Some(&wb.sheets[0]));

        wb.set_active_sheet(1).unwrap();
        assert_eq!(wb.active_sheet(), Some(&wb.sheets[1]));

        wb.set_active_sheet(2).unwrap();
        assert_eq!(wb.active_sheet(), Some(&wb.sheets[2]));
    }
}
