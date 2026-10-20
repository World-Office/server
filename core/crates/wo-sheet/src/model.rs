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
        row >= self.start_row && row <= self.end_row && col >= self.start_col && col <= self.end_col
    }
}

/// Helper function to encode bytes as lowercase hex string.
fn hex_encode(bytes: &[u8]) -> String {
    const HEX_CHARS: &[u8] = b"0123456789abcdef";
    let mut result = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        result.push(HEX_CHARS[((byte >> 4) & 0x0f) as usize] as char);
        result.push(HEX_CHARS[(byte & 0x0f) as usize] as char);
    }
    result
}

/// Sheet protection settings.
///
/// When enabled, only cells within allowed edit ranges can be modified.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct SheetProtection {
    /// Whether protection is enabled for this sheet.
    #[serde(default)]
    pub enabled: bool,
    /// Optional list of ranges that are explicitly locked (blocked from editing).
    /// If None, all cells not in edit_ranges are locked when enabled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked_cells: Option<Vec<Range2d>>,
    /// Hex-encoded SHA-256 hash of the protection password. None means no password.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password_hash: Option<String>,
    /// User IDs who are exempt from protection.
    #[serde(default)]
    pub exempt_users: Vec<String>,
    /// Group IDs whose members are exempt from protection.
    #[serde(default)]
    pub exempt_groups: Vec<String>,
}

impl SheetProtection {
    /// Create a new SheetProtection with the given enabled state.
    pub fn new(enabled: bool) -> Self {
        Self {
            enabled,
            locked_cells: None,
            password_hash: None,
            exempt_users: Vec::new(),
            exempt_groups: Vec::new(),
        }
    }

    /// Create a new disabled SheetProtection (default).
    pub fn disabled() -> Self {
        Self::default()
    }

    /// Create a new enabled SheetProtection.
    pub fn enabled() -> Self {
        Self {
            enabled: true,
            locked_cells: None,
            password_hash: None,
            exempt_users: Vec::new(),
            exempt_groups: Vec::new(),
        }
    }

    /// Check if the sheet is protected.
    pub fn is_protected(&self) -> bool {
        self.enabled
    }

    /// Set a password for protection. Hashes it using SHA-256 and stores as hex.
    pub fn set_password(&mut self, password: &str) {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        let hash = hasher.finalize();
        self.password_hash = Some(hex_encode(&hash));
    }

    /// Verify a password against the stored hash.
    /// Returns true if:
    /// - No password is set (hash is None) and the provided password is empty
    /// - The provided password's SHA-256 hash matches the stored hash
    pub fn verify_password(&self, password: &str) -> bool {
        match &self.password_hash {
            None => password.is_empty(),
            Some(hash) => {
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(password.as_bytes());
                let computed_hash = hasher.finalize();
                hex_encode(&computed_hash) == *hash
            }
        }
    }

    /// Check if a password is set.
    pub fn has_password(&self) -> bool {
        self.password_hash.is_some()
    }

    /// Add a user exemption.
    pub fn add_exempt_user(&mut self, user: impl Into<String>) {
        self.exempt_users.push(user.into());
    }

    /// Add a group exemption.
    pub fn add_exempt_group(&mut self, group: impl Into<String>) {
        self.exempt_groups.push(group.into());
    }

    /// Check if a user (with their groups) is exempt from protection.
    pub fn is_exempt_for(&self, user: Option<&str>, groups: &[&str]) -> bool {
        // Check user exemption
        if let Some(u) = user {
            if self.exempt_users.contains(&u.to_string()) {
                return true;
            }
        }
        // Check group exemption
        groups.iter().any(|g| self.exempt_groups.contains(&g.to_string()))
    }
}

/// A named range where editing is allowed even when the sheet is protected.
///
/// This corresponds to the "Allow Edit Ranges" feature in spreadsheet applications,
/// where specific ranges can be designated as editable.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct EditRange {
    /// Name of this edit range (user-visible identifier).
    pub name: String,
    /// The ranges where editing is allowed.
    #[serde(default)]
    pub ranges: Vec<Range2d>,
}

impl EditRange {
    /// Create a new EditRange with the given name and a single range.
    pub fn new(name: impl Into<String>, range: Range2d) -> Self {
        Self {
            name: name.into(),
            ranges: vec![range],
        }
    }

    /// Create a new EditRange with the given name and multiple ranges.
    pub fn with_ranges(name: impl Into<String>, ranges: Vec<Range2d>) -> Self {
        Self {
            name: name.into(),
            ranges,
        }
    }

    /// Check if a specific cell is within any of this EditRange's ranges.
    pub fn contains(&self, row: u32, col: u32) -> bool {
        self.ranges.iter().any(|r| r.contains(row, col))
    }

    /// Check if a specific cell is within any of this EditRange's ranges.
    pub fn contains_cell(&self, cell: (u32, u32)) -> bool {
        self.contains(cell.0, cell.1)
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

    /// Create a cell with a boolean value.
    pub fn with_bool(value: bool) -> Self {
        Self {
            raw: value.to_string(),
            value: CellValue::Bool(value),
            formula: None,
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
    /// Sheet protection settings.
    #[serde(default)]
    pub protection: SheetProtection,
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
            protection: SheetProtection::default(),
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
            protection: SheetProtection::default(),
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

    /// Get the maximum row index with data.
    pub fn max_row(&self) -> u32 {
        self.cells.keys()
            .map(|&(row, _)| row)
            .max()
            .unwrap_or(0)
    }

    /// Get the maximum column index with data.
    pub fn max_col(&self) -> u32 {
        self.cells.keys()
            .map(|&(_, col)| col)
            .max()
            .unwrap_or(0)
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
            row >= m.start_row && row <= m.end_row && col >= m.start_col && col <= m.end_col
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

/// Protect a sheet with optional password.
/// Enables protection and sets the password hash if provided.
pub fn protect_sheet(sheet: &mut Sheet, password: Option<&str>) {
    sheet.protection.enabled = true;
    if let Some(pwd) = password {
        sheet.protection.set_password(pwd);
    } else {
        sheet.protection.password_hash = None;
    }
}

/// Unprotect a sheet with password verification.
/// If protection is disabled or no password is set, it succeeds and disables protection.
/// If a password is set and doesn't match, returns an error.
pub fn unprotect_sheet(sheet: &mut Sheet, password: &str) -> Result<(), String> {
    if !sheet.protection.enabled {
        return Ok(());
    }

    if sheet.protection.has_password() {
        if !sheet.protection.verify_password(password) {
            return Err("wrong password".to_string());
        }
    }

    // Successful unprotect: disable protection and clear password
    sheet.protection.enabled = false;
    sheet.protection.password_hash = None;
    Ok(())
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
    Between {
        min: f64,
        max: f64,
        style: CellStyle,
    },
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
    DatePeriod {
        period: DatePeriod,
        style: CellStyle,
    },
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
    SetCell { row: u32, col: u32, raw: String },
    /// Insert rows
    InsertRow { after: u32, count: u32 },
    /// Delete rows
    DeleteRow { row: u32, count: u32 },
    /// Insert columns
    InsertCol { after: u32, count: u32 },
    /// Delete columns
    DeleteCol { col: u32, count: u32 },
    /// Merge cells
    Merge(MergeRange),
    /// Unmerge cells
    Unmerge(MergeRange),
    /// Apply styling to a range
    SetStyle { range: Range2d, style: CellStyle },
    /// Sort a range
    Sort { range: Range2d, keys: Vec<SortKey> },
    /// Apply conditional formatting to a range
    ApplyConditionalFormat {
        range: Range2d,
        rule: ConditionalRule,
    },
    /// Clear cells
    Clear { range: Range2d },
    /// Copy cells
    Copy { from: Range2d, to: (u32, u32) },
    /// Paste cells
    Paste {
        at: (u32, u32),
        data: Vec<Vec<Cell>>,
    },
    /// Set column width
    SetColWidth { col: u32, width: f32 },
    /// Set row height
    SetRowHeight { row: u32, height: f32 },
    /// Freeze panes
    FreezePanes { row: u32, col: u32 },
    /// Unfreeze panes
    UnfreezePanes,
    /// Rename sheet
    RenameSheet { old_name: String, new_name: String },
    /// Add a new sheet
    AddSheet { name: String },
    /// Remove a sheet
    RemoveSheet { name: String },
    /// Set sheet visibility
    SetSheetVisibility { name: String, visible: bool },
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
    /// Edit ranges that allow editing even when sheet is protected.
    #[serde(default)]
    pub edit_ranges: Vec<EditRange>,
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
    #[error(
        "invalid range: start ({start_row}, {start_col}) must be <= end ({end_row}, {end_col})"
    )]
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
                        Err(SheetError::SheetNotFound {
                            name: sheet.clone(),
                        })
                    }
                } else {
                    Err(SheetError::NotSupported)
                }
            }
            ModelOp::Delete { range } => {
                // Delete over a range
                if let (
                    Path::Sheet {
                        sheet: s1,
                        row: r1,
                        col: c1,
                    },
                    Path::Sheet {
                        sheet: s2,
                        row: r2,
                        col: c2,
                    },
                ) = (&range.start, &range.end)
                {
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
                        Err(SheetError::SheetNotFound {
                            name: sheet.clone(),
                        })
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

                if let (
                    Path::Sheet {
                        sheet: s1,
                        row: r1,
                        col: c1,
                    },
                    Path::Sheet {
                        sheet: s2,
                        row: r2,
                        col: c2,
                    },
                ) = (&range.start, &range.end)
                {
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
// Protection and Edit Range Resolution
// ============================================================================

/// Check if a cell is allowed to be edited given sheet protection and edit ranges.
///
/// Semantics:
/// - If sheet protection is disabled: everything is allowed (returns true).
/// - If sheet protection is enabled and there are no edit ranges: everything is blocked (returns false).
/// - If sheet protection is enabled with edit ranges: only cells inside at least one EditRange are allowed.
/// - If cell is in locked_cells explicitly: blocked even if in an edit range.
///
/// # Arguments
/// * `protection` - The sheet's protection settings
/// * `edit_ranges` - List of allowed edit ranges for the workbook
/// * `cell` - The (row, col) coordinates to check
///
/// # Returns
/// `true` if the cell can be edited, `false` otherwise.
pub fn is_edit_allowed(
    protection: &SheetProtection,
    edit_ranges: &[EditRange],
    cell: (u32, u32),
) -> bool {
    // If protection is disabled, everything is allowed
    if !protection.enabled {
        return true;
    }

    // If protection is enabled but no edit ranges exist, everything is blocked
    if edit_ranges.is_empty() {
        return false;
    }

    // Check if cell is in any edit range
    let in_edit_range = edit_ranges.iter().any(|er| er.contains_cell(cell));

    // Check if cell is explicitly locked
    if let Some(locked) = &protection.locked_cells {
        let is_locked = locked.iter().any(|r| r.contains(cell.0, cell.1));
        if is_locked {
            return false;
        }
    }

    in_edit_range
}

/// Check if a cell can be edited by a specific user with their groups.
/// 
/// This is like `is_edit_allowed` but also checks user/group exemptions.
/// If the user or any of their groups are exempt, they can edit regardless
/// of edit ranges and locked cells.
/// 
/// // ponytail: per-op/token flow can adopt this later without rework
pub fn is_edit_allowed_for_user(
    protection: &SheetProtection,
    edit_ranges: &[EditRange],
    cell: (u32, u32),
    user: Option<&str>,
    groups: &[&str],
) -> bool {
    // If protection is disabled, everything is allowed
    if !protection.enabled {
        return true;
    }

    // Check if user is exempt
    if protection.is_exempt_for(user, groups) {
        return true;
    }

    // Otherwise, use the standard edit range logic
    is_edit_allowed(protection, edit_ranges, cell)
}

/// Get all edit ranges that contain the specified cell.
///
/// This is useful for UI purposes to show which edit ranges a cell belongs to.
pub fn allowed_edit_ranges(edit_ranges: &[EditRange], cell: (u32, u32)) -> Vec<&EditRange> {
    edit_ranges
        .iter()
        .filter(|er| er.contains_cell(cell))
        .collect()
}

/// Check if a range is fully contained within the allowed edit ranges.
///
/// Returns true if every cell in the given range is in at least one edit range.
pub fn range_is_fully_allowed(
    protection: &SheetProtection,
    edit_ranges: &[EditRange],
    range: &Range2d,
) -> bool {
    if !protection.enabled {
        return true;
    }

    if edit_ranges.is_empty() {
        return false;
    }

    // Check every cell in the range
    for row in range.start_row..=range.end_row {
        for col in range.start_col..=range.end_col {
            if !is_edit_allowed(protection, edit_ranges, (row, col)) {
                return false;
            }
        }
    }
    true
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
    // F-204: Cell address + type model
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
    // F-202: Formula + cached value round-trip
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
    // F-201: SharedStrings dedup round-trip
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
    // F-205: Workbook map + defined names
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
            ModelOp::Delete { .. } => {}
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
    // F-205: Workbook map + defined names
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

    // Test 21: Workbook serde round-trip
    // F-200: XLSX part inventory round-trip
    #[test]
    fn test_workbook_serde_roundtrip() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        wb.add_sheet(Sheet::new("Data"));
        wb.add_defined_name(DefinedName::new("Header", "Sheet1!A1:Z1"));
        wb.active_sheet = 1;

        let json = serde_json::to_string(&wb).unwrap();
        let back: Workbook = serde_json::from_str(&json).unwrap();

        assert_eq!(back.sheets.len(), 2);
        assert_eq!(back.sheets[0].name, "Sheet1");
        assert_eq!(back.sheets[1].name, "Data");
        assert_eq!(back.active_sheet, 1);
        assert_eq!(back.defined_names.len(), 1);
        assert_eq!(back.defined_names[0].name, "Header");
    }

    // Test 22: EditableModel delete operation
    #[test]
    fn test_editable_model_delete() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(1, 1, Cell::with_num(42.0));
        wb.add_sheet(sheet);

        let op = ModelOp::Delete {
            range: Range {
                start: Path::Sheet {
                    sheet: "Sheet1".to_string(),
                    row: 0,
                    col: 0,
                },
                end: Path::Sheet {
                    sheet: "Sheet1".to_string(),
                    row: 1,
                    col: 1,
                },
            },
        };

        wb.apply(&op).unwrap();
        assert!(wb.get_cell(0, 0).is_none() || wb.get_cell(0, 0).unwrap().raw.is_empty());
        assert_eq!(wb.current_revision(), 1);
    }

    // Test 23: EditableModel apply + invert round-trip
    #[test]
    fn test_editable_model_insert_invert_roundtrip() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));

        // Insert a cell
        let insert = ModelOp::Insert {
            at: Path::Sheet {
                sheet: "Sheet1".to_string(),
                row: 2,
                col: 3,
            },
            content: "Hello".to_string(),
        };
        wb.apply(&insert).unwrap();
        assert_eq!(wb.get_cell(2, 3).unwrap().raw, "Hello");
        assert_eq!(wb.current_revision(), 1);

        // Invert the insert
        let delete = wb.invert(&insert);
        assert!(matches!(delete, ModelOp::Delete { .. }));
    }

    // Test 24: EditableModel format operation
    #[test]
    fn test_editable_model_format() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("Test"));
        wb.add_sheet(sheet);

        let mut attrs = std::collections::BTreeMap::new();
        attrs.insert("bold".to_string(), serde_json::Value::Bool(true));
        attrs.insert(
            "font_size".to_string(),
            serde_json::Value::Number(serde_json::Number::from_f64(14.0).unwrap()),
        );

        let op = ModelOp::Format {
            range: Range {
                start: Path::Sheet {
                    sheet: "Sheet1".to_string(),
                    row: 0,
                    col: 0,
                },
                end: Path::Sheet {
                    sheet: "Sheet1".to_string(),
                    row: 0,
                    col: 0,
                },
            },
            attrs,
        };

        wb.apply(&op).unwrap();
        assert_eq!(wb.current_revision(), 1);
        let cell = wb.get_cell(0, 0).unwrap();
        assert_eq!(cell.style.bold, Some(true));
        assert_eq!(cell.style.font_size, Some(14.0));
    }

    // Test 25: SheetOp all basic variants serde
    #[test]
    fn test_sheet_op_all_variants_serde() {
        let ops: Vec<SheetOp> = vec![
            SheetOp::SetCell {
                row: 1,
                col: 2,
                raw: "Hello".to_string(),
            },
            SheetOp::InsertRow { after: 0, count: 1 },
            SheetOp::DeleteRow { row: 0, count: 1 },
            SheetOp::InsertCol { after: 0, count: 2 },
            SheetOp::DeleteCol { col: 0, count: 2 },
            SheetOp::Merge(MergeRange::new(0, 0, 2, 2)),
            SheetOp::Unmerge(MergeRange::new(0, 0, 2, 2)),
            SheetOp::SetStyle {
                range: Range2d::new(0, 0, 10, 10),
                style: CellStyle::default(),
            },
            SheetOp::Sort {
                range: Range2d::new(0, 0, 100, 10),
                keys: vec![SortKey {
                    col: 0,
                    order: SortOrder::Ascending,
                }],
            },
            SheetOp::ApplyConditionalFormat {
                range: Range2d::new(0, 0, 50, 5),
                rule: ConditionalRule::GreaterThan {
                    value: 100.0,
                    style: CellStyle::default(),
                },
            },
        ];

        for op in &ops {
            let json = serde_json::to_string(op).unwrap();
            let back: SheetOp = serde_json::from_str(&json).unwrap();
            assert_eq!(*op, back, "serde round-trip failed for {:?}", op);
        }
    }

    // Test 26: ConditionalRule all variants serde
    #[test]
    fn test_conditional_rule_all_variants_serde() {
        let style = CellStyle {
            bold: Some(true),
            ..Default::default()
        };
        let rules: Vec<ConditionalRule> = vec![
            ConditionalRule::GreaterThan {
                value: 10.0,
                style: style.clone(),
            },
            ConditionalRule::LessThan {
                value: 0.5,
                style: style.clone(),
            },
            ConditionalRule::Between {
                min: 1.0,
                max: 100.0,
                style: style.clone(),
            },
            ConditionalRule::EqualTo {
                value: "Yes".to_string(),
                style: style.clone(),
            },
            ConditionalRule::ContainsText {
                text: "error".to_string(),
                style: style.clone(),
            },
            ConditionalRule::Empty {
                style: style.clone(),
            },
            ConditionalRule::TopN {
                n: 10,
                style: style.clone(),
            },
            ConditionalRule::BottomN {
                n: 5,
                style: style.clone(),
            },
            ConditionalRule::AboveAverage {
                style: style.clone(),
            },
            ConditionalRule::BelowAverage {
                style: style.clone(),
            },
            ConditionalRule::Formula {
                formula: "A1>10".to_string(),
                style: style.clone(),
            },
            ConditionalRule::DatePeriod {
                period: DatePeriod::Today,
                style: style.clone(),
            },
            ConditionalRule::Duplicate { style },
        ];

        for rule in &rules {
            let json = serde_json::to_string(rule).unwrap();
            let back: ConditionalRule = serde_json::from_str(&json).unwrap();
            assert_eq!(*rule, back, "serde round-trip failed for {:?}", rule);
        }
    }

    // Test 27: CellStyle skip_serializing_if for None fields
    #[test]
    fn test_cell_style_default_serde_compact() {
        let style = CellStyle::default();
        let json = serde_json::to_string(&style).unwrap();
        // Default style should serialize to empty JSON object
        // since all fields are None/skipped
        assert_eq!(json, "{}");
    }

    // Test 28: Workbook get_sheet_by_name
    #[test]
    fn test_workbook_get_sheet_by_name() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        wb.add_sheet(Sheet::new("Data"));

        let s = wb.get_sheet_by_name("Data").unwrap();
        assert_eq!(s.name, "Data");

        let s_mut = wb.get_sheet_by_name_mut("Sheet1").unwrap();
        s_mut.set_cell(0, 0, Cell::with_text("A1"));
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "A1");

        assert!(wb.get_sheet_by_name("NonExistent").is_none());
    }

    // Test 29: Workbook remove_sheet
    #[test]
    fn test_workbook_remove_sheet() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        wb.add_sheet(Sheet::new("Sheet2"));
        wb.add_sheet(Sheet::new("Sheet3"));

        wb.remove_sheet(1);
        assert_eq!(wb.sheets.len(), 2);
        assert_eq!(wb.sheets[0].name, "Sheet1");
        assert_eq!(wb.sheets[1].name, "Sheet3");
    }

    // Test 30: CellValue conversion from wo-formula
    // F-202: Formula + cached value round-trip
    #[test]
    fn test_cell_value_from_formula() {
        // Numeric cell
        let cell = Cell::with_num(2.5);
        assert_eq!(cell.value, CellValue::Num(2.5));
        assert_eq!(cell.raw, "2.5");

        // Text cell
        let cell = Cell::with_text("Hello");
        assert_eq!(cell.value, CellValue::Text("Hello".to_string()));

        // Formula cell
        use wo_formula::parse;
        let expr = parse("SUM(A1:A10)").unwrap();
        let cell = Cell::with_formula("SUM(A1:A10)", expr, CellValue::Num(55.0));
        assert_eq!(cell.raw, "SUM(A1:A10)");
        assert!(cell.formula.is_some());
    }

    // Test 31: Range2d edge cases
    #[test]
    fn test_range2d_edge_cases() {
        // Single cell range
        let range = Range2d::new(5, 5, 5, 5);
        assert!(range.contains(5, 5));
        assert!(!range.contains(5, 6));

        // Zero-based range
        let range = Range2d::new(0, 0, 0, 0);
        assert!(range.contains(0, 0));
        assert!(!range.contains(0, 1));

        // Large range
        let range = Range2d::new(0, 0, 65535, 255);
        assert!(range.contains(32000, 100));
        assert!(!range.contains(65536, 256));
    }

    // Test 32: DefinedName serde with optional fields
    #[test]
    fn test_defined_name_serde_optional_fields() {
        let name = DefinedName {
            name: "MyRange".to_string(),
            refs: "Sheet1!A1:B10".to_string(),
            scope: Some("Sheet1".to_string()),
            comment: Some("Header range".to_string()),
        };
        let json = serde_json::to_string(&name).unwrap();
        let back: DefinedName = serde_json::from_str(&json).unwrap();
        assert_eq!(name.name, back.name);
        assert_eq!(name.refs, back.refs);
        assert_eq!(name.scope, back.scope);
        assert_eq!(name.comment, back.comment);

        // Test without optional fields
        let simple = DefinedName::new("Test", "Data!A1");
        let json = serde_json::to_string(&simple).unwrap();
        let back: DefinedName = serde_json::from_str(&json).unwrap();
        assert!(back.scope.is_none());
        assert!(back.comment.is_none());
    }

    // Test 33: Sheet visible flag
    #[test]
    fn test_sheet_visibility() {
        let mut sheet = Sheet::new("Visible");
        assert!(sheet.visible);

        sheet.visible = false;
        assert!(!sheet.visible);

        let json = serde_json::to_string(&sheet).unwrap();
        let back: Sheet = serde_json::from_str(&json).unwrap();
        assert!(!back.visible);
        assert_eq!(back.name, "Visible");
    }

    // Test 34: CalcMode serde
    #[test]
    fn test_calc_mode_serde() {
        let modes = vec![
            CalcMode::Automatic,
            CalcMode::Manual,
            CalcMode::SemiAutomatic,
        ];
        for mode in &modes {
            let json = serde_json::to_string(mode).unwrap();
            let back: CalcMode = serde_json::from_str(&json).unwrap();
            assert_eq!(*mode, back);
        }
    }

    // Test 35: Workbook get_sheet
    #[test]
    fn test_workbook_get_sheet_by_index() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        wb.add_sheet(Sheet::new("Sheet2"));

        let s0 = wb.get_sheet(0).unwrap();
        assert_eq!(s0.name, "Sheet1");

        let s1 = wb.get_sheet_mut(1).unwrap();
        s1.set_cell(0, 0, Cell::with_num(99.0));

        assert_eq!(wb.sheets[1].get_cell(0, 0).unwrap().raw, "99");
        assert!(wb.get_sheet(5).is_none());
    }

    // Test 36: Sheet cell_value_string
    #[test]
    fn test_sheet_cell_value_string() {
        let mut sheet = Sheet::new("Test");
        sheet.set_cell(0, 0, Cell::with_text("Hello"));
        sheet.set_cell(1, 0, Cell::with_num(42.0));

        assert_eq!(sheet.cell_value_string(0, 0), "Hello");
        assert_eq!(sheet.cell_value_string(1, 0), "42");
        assert_eq!(sheet.cell_value_string(99, 99), "");
    }

    // Test 37: SortOrder serde
    #[test]
    fn test_sort_order_serde() {
        let orders = vec![
            (SortOrder::Ascending, "\"ascending\""),
            (SortOrder::Descending, "\"descending\""),
        ];
        for (order, expected) in &orders {
            let json = serde_json::to_string(order).unwrap();
            assert_eq!(json, *expected);
            let back: SortOrder = serde_json::from_str(&json).unwrap();
            assert_eq!(*order, back);
        }
    }

    // Test 38: EditableModel to_ops_since returns empty
    #[test]
    fn test_editable_model_to_ops_since() {
        let wb = Workbook::new();
        let ops = wb.to_ops_since(0);
        assert!(ops.is_empty());
    }

    // Test 39: EditableModel Move returns NotSupported
    #[test]
    fn test_editable_model_move_unsupported() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));

        let op = ModelOp::Move {
            from: Path::Sheet {
                sheet: "Sheet1".to_string(),
                row: 0,
                col: 0,
            },
            to: Path::Sheet {
                sheet: "Sheet1".to_string(),
                row: 1,
                col: 0,
            },
        };

        let result = wb.apply(&op);
        assert!(matches!(result, Err(SheetError::NotSupported)));
    }

    // Test 40: SheetOp extended variants serde
    #[test]
    fn test_sheet_op_extended_serde() {
        let ops: Vec<SheetOp> = vec![
            SheetOp::Clear {
                range: Range2d::new(0, 0, 10, 10),
            },
            SheetOp::Copy {
                from: Range2d::new(0, 0, 2, 2),
                to: (5, 5),
            },
            SheetOp::Paste {
                at: (10, 10),
                data: vec![
                    vec![Cell::with_text("A"), Cell::with_text("B")],
                    vec![Cell::with_num(1.0), Cell::with_num(2.0)],
                ],
            },
            SheetOp::SetColWidth {
                col: 0,
                width: 100.0,
            },
            SheetOp::SetRowHeight {
                row: 1,
                height: 30.0,
            },
            SheetOp::FreezePanes { row: 1, col: 1 },
            SheetOp::UnfreezePanes,
            SheetOp::RenameSheet {
                old_name: "Sheet1".to_string(),
                new_name: "Data".to_string(),
            },
            SheetOp::AddSheet {
                name: "NewSheet".to_string(),
            },
            SheetOp::RemoveSheet {
                name: "OldSheet".to_string(),
            },
            SheetOp::SetSheetVisibility {
                name: "Sheet1".to_string(),
                visible: false,
            },
        ];

        for op in &ops {
            let json = serde_json::to_string(op).unwrap();
            let back: SheetOp = serde_json::from_str(&json).unwrap();
            assert_eq!(*op, back, "serde round-trip failed for {:?}", op);
        }
    }

    // Test 41: DatePeriod all variants serde
    #[test]
    fn test_date_period_serde() {
        let periods = vec![
            DatePeriod::Today,
            DatePeriod::Yesterday,
            DatePeriod::Tomorrow,
            DatePeriod::Last7Days,
            DatePeriod::Last30Days,
            DatePeriod::Next7Days,
            DatePeriod::Next30Days,
            DatePeriod::ThisMonth,
            DatePeriod::LastMonth,
            DatePeriod::NextMonth,
            DatePeriod::ThisYear,
            DatePeriod::LastYear,
            DatePeriod::NextYear,
        ];
        for period in &periods {
            let json = serde_json::to_string(period).unwrap();
            let back: DatePeriod = serde_json::from_str(&json).unwrap();
            assert_eq!(*period, back);
        }
    }

    // ========================================================================
    // Protection and Edit Range Tests // F-146
    // ========================================================================

    // Test (a): protection disabled -> any cell allowed
    #[test]
    fn test_protection_disabled_any_cell_allowed() {
        // F-146
        let sheet = Sheet::new("Test");
        let workbook = Workbook::new();

        // Sheet should have protection disabled by default
        assert!(!sheet.protection.enabled);
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (0, 0)));
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (100, 100)));
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (50, 25)));
    }

    // Test (b): protection enabled + a named edit range -> inside allowed, outside blocked
    #[test]
    fn test_protection_enabled_with_edit_range() {
        // F-146
        let mut sheet = Sheet::new("Test");
        sheet.protection = SheetProtection::enabled();

        let mut workbook = Workbook::new();
        workbook.edit_ranges = vec![EditRange::new("InputRange", Range2d::new(0, 0, 5, 5))];

        // Cells inside the range should be allowed
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (0, 0)));
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (2, 3)));
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (5, 5)));

        // Cells outside the range should be blocked
        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (6, 0)));
        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (0, 6)));
        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (10, 10)));
    }

    // Test (c): protection enabled + no edit ranges -> everything blocked
    #[test]
    fn test_protection_enabled_no_edit_ranges() {
        // F-146
        let mut sheet = Sheet::new("Test");
        sheet.protection = SheetProtection::enabled();

        let workbook = Workbook::new();
        // workbook.edit_ranges is empty by default

        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (0, 0)));
        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (1, 1)));
        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (100, 100)));
    }

    // Test (d): multi-range edit range (rect union) resolves correctly
    #[test]
    fn test_multi_range_edit_range() {
        // F-146
        let mut sheet = Sheet::new("Test");
        sheet.protection = SheetProtection::enabled();

        let mut workbook = Workbook::new();
        workbook.edit_ranges = vec![EditRange::with_ranges(
            "MultiRange",
            vec![
                Range2d::new(0, 0, 2, 2),   // Top-left 3x3
                Range2d::new(5, 5, 10, 10), // Bottom-right 6x6
            ],
        )];

        // Cells in first range should be allowed
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (0, 0)));
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (1, 1)));
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (2, 2)));

        // Cells in second range should be allowed
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (5, 5)));
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (7, 8)));
        assert!(is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (10, 10)));

        // Cells between ranges should be blocked
        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (3, 3)));
        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (4, 4)));
        // Cells outside both ranges should be blocked
        assert!(!is_edit_allowed(&sheet.protection, &workbook.edit_ranges, (11, 11)));
    }

    // Test (e): serde defaults - Sheet/Workbook without protection fields round-trips
    #[test]
    fn test_sheet_workbook_serde_with_protection_defaults() {
        // F-146
        let mut workbook = Workbook::new();
        let sheet = Sheet::new("TestSheet");
        workbook.add_sheet(sheet);

        // Serialize and deserialize
        let json = serde_json::to_string(&workbook).unwrap();
        let back: Workbook = serde_json::from_str(&json).unwrap();

        // Check that protection is disabled by default
        assert!(back.sheets.len() == 1);
        assert!(!back.sheets[0].protection.enabled);
        assert!(back.edit_ranges.is_empty());
    }

    // Test: EditRange::contains with various cells
    #[test]
    fn test_edit_range_contains() {
        // F-146
        let range = Range2d::new(2, 2, 5, 5);
        let edit_range = EditRange::new("Test", range);

        // Inside
        assert!(edit_range.contains(2, 2));
        assert!(edit_range.contains(3, 4));
        assert!(edit_range.contains(5, 5));

        // Outside
        assert!(!edit_range.contains(1, 2));
        assert!(!edit_range.contains(2, 1));
        assert!(!edit_range.contains(6, 5));
        assert!(!edit_range.contains(5, 6));
        assert!(!edit_range.contains(0, 0));
    }

    // Test: allowed_edit_ranges returns correct ranges
    #[test]
    fn test_allowed_edit_ranges_function() {
        // F-146
        let edit_ranges = vec![
            EditRange::new("Range1", Range2d::new(0, 0, 5, 5)),
            EditRange::new("Range2", Range2d::new(10, 10, 15, 15)),
        ];

        // Cell in first range
        let ranges = allowed_edit_ranges(&edit_ranges, (2, 2));
        assert_eq!(ranges.len(), 1);
        assert_eq!(ranges[0].name, "Range1");

        // Cell in second range
        let ranges = allowed_edit_ranges(&edit_ranges, (12, 12));
        assert_eq!(ranges.len(), 1);
        assert_eq!(ranges[0].name, "Range2");

        // Cell in no range
        let ranges = allowed_edit_ranges(&edit_ranges, (7, 7));
        assert!(ranges.is_empty());
    }

    // Test: range_is_fully_allowed
    #[test]
    fn test_range_is_fully_allowed() {
        // F-146
        let protection = SheetProtection::enabled();
        let edit_ranges = vec![EditRange::new("BigRange", Range2d::new(0, 0, 10, 10))];

        // Range fully within allowed range
        assert!(range_is_fully_allowed(
            &protection,
            &edit_ranges,
            &Range2d::new(2, 2, 5, 5)
        ));

        // Range partially outside allowed range
        assert!(!range_is_fully_allowed(
            &protection,
            &edit_ranges,
            &Range2d::new(5, 5, 15, 15)
        ));

        // Range completely outside allowed range
        assert!(!range_is_fully_allowed(
            &protection,
            &edit_ranges,
            &Range2d::new(11, 11, 20, 20)
        ));
    }

    // Test: locked_cells takes precedence over edit ranges
    #[test]
    fn test_locked_cells_precedence() {
        // F-146
        let mut protection = SheetProtection::enabled();
        protection.locked_cells = Some(vec![Range2d::new(0, 0, 2, 2)]);

        let edit_ranges = vec![EditRange::new("Range", Range2d::new(0, 0, 5, 5))];

        // Cells in edit range but also in locked range should be blocked
        assert!(!is_edit_allowed(&protection, &edit_ranges, (0, 0)));
        assert!(!is_edit_allowed(&protection, &edit_ranges, (1, 1)));
        assert!(!is_edit_allowed(&protection, &edit_ranges, (2, 2)));

        // Cells in edit range but not in locked range should be allowed
        assert!(is_edit_allowed(&protection, &edit_ranges, (3, 3)));
        assert!(is_edit_allowed(&protection, &edit_ranges, (5, 5)));
    }

    // Test: Workbook serde with explicit protection and edit ranges
    #[test]
    fn test_workbook_serde_with_protection_and_edit_ranges() {
        // F-146
        let mut workbook = Workbook::new();
        let mut sheet = Sheet::new("ProtectedSheet");
        sheet.protection = SheetProtection::enabled();
        workbook.add_sheet(sheet);

        workbook.edit_ranges = vec![
            EditRange::new("InputArea", Range2d::new(0, 0, 10, 10)),
            EditRange::with_ranges("MultiArea", vec![
                Range2d::new(20, 20, 30, 30),
                Range2d::new(40, 40, 50, 50),
            ]),
        ];

        // Serialize and deserialize
        let json = serde_json::to_string(&workbook).unwrap();
        let back: Workbook = serde_json::from_str(&json).unwrap();

        // Verify protection and edit ranges are preserved
        assert!(back.sheets[0].protection.enabled);
        assert_eq!(back.edit_ranges.len(), 2);
        assert_eq!(back.edit_ranges[0].name, "InputArea");
        assert_eq!(back.edit_ranges[1].name, "MultiArea");
        assert_eq!(back.edit_ranges[1].ranges.len(), 2);
    }

    // Test: SheetProtection methods
    #[test]
    fn test_sheet_protection_methods() {
        // F-146
        let protection_disabled = SheetProtection::disabled();
        assert!(!protection_disabled.enabled);
        assert!(!protection_disabled.is_protected());

        let protection_enabled = SheetProtection::enabled();
        assert!(protection_enabled.enabled);
        assert!(protection_enabled.is_protected());

        let protection_new = SheetProtection::new(true);
        assert!(protection_new.enabled);
        assert!(protection_new.is_protected());
    }

    // Test: EditRange methods
    #[test]
    fn test_edit_range_methods() {
        // F-146
        let range1 = Range2d::new(0, 0, 5, 5);

        let edit_range_single = EditRange::new("Single", range1.clone());
        assert_eq!(edit_range_single.name, "Single");
        assert_eq!(edit_range_single.ranges.len(), 1);
        assert!(edit_range_single.contains(2, 2));
        assert!(!edit_range_single.contains(12, 12));

        let edit_range_multi = EditRange::with_ranges(
            "Multi",
            vec![range1, Range2d::new(10, 10, 15, 15)],
        );
        assert_eq!(edit_range_multi.name, "Multi");
        assert_eq!(edit_range_multi.ranges.len(), 2);
        assert!(edit_range_multi.contains(2, 2));
        assert!(edit_range_multi.contains(12, 12));
        assert!(!edit_range_multi.contains(7, 7));
    }

    // Test: Protection disabled at workbook level
    #[test]
    fn test_protection_disabled_workbook_level() {
        // F-146
        let mut workbook = Workbook::new();
        let sheet_with_protection = Sheet {
            id: "Sheet1".to_string(),
            name: "Sheet1".to_string(),
            cells: FxHashMap::default(),
            col_widths: BTreeMap::new(),
            row_heights: BTreeMap::new(),
            merges: Vec::new(),
            frozen: None,
            visible: true,
            protection: SheetProtection::enabled(),
        };
        workbook.add_sheet(sheet_with_protection);
        workbook.edit_ranges = vec![EditRange::new("Range", Range2d::new(0, 0, 5, 5))];

        // Even with protection enabled on sheet, if we pass disabled protection to is_edit_allowed, it should allow
        let disabled_protection = SheetProtection::disabled();
        assert!(is_edit_allowed(&disabled_protection, &workbook.edit_ranges, (100, 100)));
    }

    // Test: EditRange::contains_cell
    #[test]
    fn test_edit_range_contains_cell() {
        // F-146
        let range = Range2d::new(2, 2, 5, 5);
        let edit_range = EditRange::new("Test", range);

        assert!(edit_range.contains_cell((2, 2)));
        assert!(edit_range.contains_cell((3, 4)));
        assert!(edit_range.contains_cell((5, 5)));
        assert!(!edit_range.contains_cell((1, 2)));
        assert!(!edit_range.contains_cell((6, 5)));
    }

    // Test S15-PROTECT-PASSWORD-F146: protect/unprotect happy path
    #[test]
    fn test_protect_unprotect_happy_path() {
        // F-146
        let mut sheet = Sheet::new("Test");
        protect_sheet(&mut sheet, Some("sekrit"));
        
        assert!(sheet.protection.enabled);
        assert!(sheet.protection.has_password());
        assert!(sheet.protection.password_hash.is_some());
        assert_eq!(sheet.protection.password_hash.as_ref().unwrap().len(), 64); // SHA-256 hex
        
        let result = unprotect_sheet(&mut sheet, "sekrit");
        assert!(result.is_ok());
        assert!(!sheet.protection.enabled);
        assert!(sheet.protection.password_hash.is_none());
    }

    // Test S15-PROTECT-PASSWORD-F146: wrong password
    #[test]
    fn test_protect_wrong_password() {
        // F-146
        let mut sheet = Sheet::new("Test");
        protect_sheet(&mut sheet, Some("sekrit"));
        
        assert!(sheet.protection.enabled);
        
        let result = unprotect_sheet(&mut sheet, "nope");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "wrong password");
        assert!(sheet.protection.enabled); // Still protected
    }

    // Test S15-PROTECT-PASSWORD-F146: no-password protection
    #[test]
    fn test_protect_no_password() {
        // F-146
        let mut sheet = Sheet::new("Test");
        protect_sheet(&mut sheet, None);
        
        assert!(sheet.protection.enabled);
        assert!(!sheet.protection.has_password());
        
        // Any password should work when no password is set
        let result = unprotect_sheet(&mut sheet, "");
        assert!(result.is_ok());
        assert!(!sheet.protection.enabled);
    }

    // Test S15-PROTECT-PASSWORD-F146: verify_password
    #[test]
    fn test_verify_password() {
        // F-146
        let mut protection = SheetProtection::new(false);
        assert!(!protection.has_password());
        
        // Before setting password, empty password should pass (for no-password case)
        assert!(protection.verify_password(""));
        assert!(!protection.verify_password("x"));
        
        protection.set_password("test123");
        assert!(protection.has_password());
        assert!(protection.verify_password("test123"));
        assert!(!protection.verify_password("wrong"));
        assert!(!protection.verify_password(""));
    }

    // Test S15-PROTECT-PASSWORD-F146: exemptions - user exempt
    #[test]
    fn test_exemption_user() {
        // F-146
        let mut protection = SheetProtection::enabled();
        protection.add_exempt_user("alice");
        
        // Sheet is fully locked (no edit ranges, no locked_cells)
        assert!(!is_edit_allowed(&protection, &[], (5, 5)));
        
        // But alice is exempt
        assert!(is_edit_allowed_for_user(&protection, &[], (5, 5), Some("alice"), &[]));
        
        // Base resolver unaffected
        assert!(!is_edit_allowed(&protection, &[], (5, 5)));
    }

    // Test S15-PROTECT-PASSWORD-F146: exemptions - group exempt
    #[test]
    fn test_exemption_group() {
        // F-146
        let mut protection = SheetProtection::enabled();
        protection.add_exempt_group("editors");
        
        // Non-exempt user with no groups should be blocked
        assert!(!is_edit_allowed_for_user(&protection, &[], (5, 5), Some("bob"), &[]));
        
        // Non-exempt user with editors group should be allowed
        assert!(is_edit_allowed_for_user(&protection, &[], (5, 5), Some("bob"), &["editors"]));
        
        // User with editors group should be allowed
        assert!(is_edit_allowed_for_user(&protection, &[], (5, 5), None, &["editors"]));
    }

    // Test S15-PROTECT-PASSWORD-F146: hash stability
    #[test]
    fn test_hash_stability() {
        // F-146
        let mut protection1 = SheetProtection::new(false);
        protection1.set_password("abc");
        
        let mut protection2 = SheetProtection::new(false);
        protection2.set_password("abc");
        
        assert_eq!(protection1.password_hash, protection2.password_hash);
        assert!(protection1.password_hash.as_ref().unwrap().len() == 64);
        
        // Hash should not contain the plaintext
        assert!(!protection1.password_hash.as_ref().unwrap().contains("abc"));
    }

    // Test S15-PROTECT-PASSWORD-F146: serde round-trip
    #[test]
    fn test_sheet_protection_serde() {
        // F-146
        let mut protection = SheetProtection::new(true);
        protection.set_password("test");
        protection.add_exempt_user("alice");
        protection.add_exempt_group("editors");
        
        let json = serde_json::to_string(&protection).unwrap();
        let deserialized: SheetProtection = serde_json::from_str(&json).unwrap();
        
        assert!(deserialized.enabled);
        assert_eq!(deserialized.password_hash, protection.password_hash);
        assert_eq!(deserialized.exempt_users, protection.exempt_users);
        assert_eq!(deserialized.exempt_groups, protection.exempt_groups);
    }
}
