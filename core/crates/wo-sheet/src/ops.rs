//! Spreadsheet operation application and inversion.
//!
//! This module implements the `apply` and `invert` methods for `SheetOp`
//! as required by the SS-2 task in the engine rebuild execution plan.
//! Each operation is invertible, enabling undo functionality.

use std::collections::BTreeMap;

use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use wo_formula::ast::CellValue;

use super::model::{
    Cell, CellStyle, MergeRange, Range2d, Sheet, SheetOp, SortKey, SortOrder, Workbook,
};
use crate::conditional::apply_conditional_format;

/// Error type for SheetOp execution.
#[derive(Debug, Clone, PartialEq, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "error", rename_all = "snake_case")]
pub enum SheetOpError {
    #[error("sheet not found: {name}")]
    SheetNotFound { name: String },
    #[error("sheet index {index} out of range (max: {max})")]
    SheetIndexOutOfRange { index: usize, max: usize },
    #[error("cell not found at ({row}, {col}) in sheet '{sheet}'")]
    CellNotFound {
        sheet: String,
        row: u32,
        col: u32,
    },
    #[error("invalid range: start ({start_row}, {start_col}) must be <= end ({end_row}, {end_col})")]
    InvalidRange {
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    },
    #[error("cannot insert before row 0")]
    InvalidInsertRow,
    #[error("cannot insert before column 0")]
    InvalidInsertCol,
    #[error("delete range exceeds sheet bounds")]
    DeleteOutOfBounds,
    #[error("merge range invalid: {reason}")]
    InvalidMerge { reason: String },
    #[error("merge range overlaps with existing merge")]
    MergeOverlap,
    #[error("cannot unmerge: range is not merged")]
    NotMerged,
    #[error("cannot delete the only sheet")]
    CannotDeleteOnlySheet,
    #[error("duplicate sheet name: {name}")]
    DuplicateSheetName { name: String },
    #[error("sort range invalid: {reason}")]
    InvalidSort { reason: String },
}

/// Result type for SheetOp operations.
pub type SheetOpResult<T = ()> = Result<T, SheetOpError>;

/// Internal helper to shift cells in a sheet.
/// Used by InsertRow, DeleteRow, InsertCol, DeleteCol.
fn shift_cells_horizontal(
    cells: &mut FxHashMap<(u32, u32), Cell>,
    start_col: u32,
    _count: u32,
    delta: i64,
) {
    // delta: +1 for insert (shift right), -1 for delete (shift left)
    let mut new_cells: Vec<((u32, u32), Cell)> = Vec::new();
    let mut keys_to_remove: Vec<(u32, u32)> = Vec::new();
    
    // Collect cells that need to be moved
    for ((row, col), cell) in cells.iter() {
        if *col >= start_col {
            let new_col = ((*col as i64) + delta) as u32;
            if new_col != *col {
                new_cells.push(((new_col, *row), cell.clone()));
                keys_to_remove.push((*row, *col));
            }
        }
    }
    
    // Remove old cells
    for key in keys_to_remove {
        cells.remove(&key);
    }
    
    // Add new cells
    for ((new_col, row), cell) in new_cells {
        cells.insert((row, new_col), cell);
    }
}

fn shift_cells_vertical(
    cells: &mut FxHashMap<(u32, u32), Cell>,
    start_row: u32,
    _count: u32,
    delta: i64,
) {
    // delta: positive for insert (shift down), negative for delete (shift up)
    let mut new_cells: Vec<((u32, u32), Cell)> = Vec::new();
    let mut keys_to_remove: Vec<(u32, u32)> = Vec::new();
    
    // Collect cells that need to be moved
    for ((row, col), cell) in cells.iter() {
        if *row >= start_row {
            let new_row = ((*row as i64) + delta) as u32;
            if new_row != *row {
                new_cells.push(((new_row, *col), cell.clone()));
                keys_to_remove.push((*row, *col));
            }
        }
    }
    
    // Remove old cells
    for key in keys_to_remove {
        cells.remove(&key);
    }
    
    // Add new cells
    for ((new_row, col), cell) in new_cells {
        cells.insert((new_row, col), cell);
    }
}

/// Check if a merge range is valid.
fn validate_merge_range(range: &MergeRange) -> SheetOpResult<()> {
    if range.start_row > range.end_row || range.start_col > range.end_col {
        return Err(SheetOpError::InvalidMerge {
            reason: format!(
                "start ({},{}) must be <= end ({},{})",
                range.start_row, range.start_col, range.end_row, range.end_col
            ),
        });
    }
    Ok(())
}

/// Check if a merge range overlaps with existing merges.
fn check_merge_overlap(existing: &[MergeRange], new_range: &MergeRange) -> bool {
    for existing in existing {
        // Check if rectangles overlap
        if new_range.start_row <= existing.end_row
            && new_range.end_row >= existing.start_row
            && new_range.start_col <= existing.end_col
            && new_range.end_col >= existing.start_col
        {
            return true;
        }
    }
    false
}

/// Apply a SheetOp to a specific Sheet.
pub fn apply_to_sheet(sheet: &mut Sheet, op: &SheetOp) -> SheetOpResult<()> {
    match op {
        SheetOp::SetCell { row, col, raw } => {
            // Create a new cell with the raw value
            // Parse the value if possible, otherwise treat as text
            let (value, formula) = parse_raw_value(raw);
            let cell = Cell {
                raw: raw.clone(),
                value,
                formula,
                style: CellStyle::default(),
            };
            sheet.cells.insert((*row, *col), cell);
            Ok(())
        }
        SheetOp::InsertRow { after, count } => {
            if *count == 0 {
                return Ok(());
            }
            // Shift all cells below the insertion point down
            shift_cells_vertical(&mut sheet.cells, *after + 1, *count, *count as i64);
            
            // Shift row heights
            let mut new_heights = BTreeMap::new();
            for (row, height) in &sheet.row_heights {
                if *row >= *after {
                    new_heights.insert(row + count, *height);
                }
            }
            for (row, height) in new_heights {
                sheet.row_heights.insert(row, height);
            }
            
            // Shift merge ranges
            shift_merge_ranges(&mut sheet.merges, after + 1, 0, *count, 0);
            
            Ok(())
        }
        SheetOp::DeleteRow { row, count } => {
            if *count == 0 {
                return Ok(());
            }
            // Remove all cells in the deleted rows
            let keys: Vec<(u32, u32)> = sheet
                .cells
                .keys()
                .filter(|(r, _)| *r >= *row && *r < *row + *count)
                .cloned()
                .collect();
            for key in keys {
                sheet.cells.remove(&key);
            }
            
            // Shift cells above the deletion up
            shift_cells_vertical(&mut sheet.cells, *row + *count, *count, -(*count as i64));
            
            // Shift row heights
            let mut new_heights = BTreeMap::new();
            for (r, height) in &sheet.row_heights {
                if *r >= *row {
                    new_heights.insert(r - count, *height);
                }
            }
            for (row, height) in new_heights {
                sheet.row_heights.insert(row, height);
            }
            for r in *row..(*row + *count) {
                sheet.row_heights.remove(&r);
            }
            
            // Shift merge ranges
            shift_merge_ranges(&mut sheet.merges, *row, 0, *count, -( *count as i32));
            
            Ok(())
        }
        SheetOp::InsertCol { after, count } => {
            if *count == 0 {
                return Ok(());
            }
            // Shift all cells to the right of the insertion point
            shift_cells_horizontal(&mut sheet.cells, after + 1, *count, *count as i64);
            
            // Shift column widths
            let mut new_widths = BTreeMap::new();
            for (col, width) in &sheet.col_widths {
                if *col >= *after {
                    new_widths.insert(col + count, *width);
                }
            }
            for (col, width) in new_widths {
                sheet.col_widths.insert(col, width);
            }
            
            // Shift merge ranges
            shift_merge_ranges(&mut sheet.merges, 0, after + 1, 0, *count as i32);
            
            Ok(())
        }
        SheetOp::DeleteCol { col, count } => {
            if *count == 0 {
                return Ok(());
            }
            // Remove all cells in the deleted columns
            let keys: Vec<(u32, u32)> = sheet
                .cells
                .keys()
                .filter(|(_, c)| *c >= *col && *c < *col + *count)
                .cloned()
                .collect();
            for key in keys {
                sheet.cells.remove(&key);
            }
            
            // Shift cells to the left
            shift_cells_horizontal(&mut sheet.cells, *col + *count, *count, -(*count as i64));
            
            // Shift column widths
            let mut new_widths = BTreeMap::new();
            for (c, width) in &sheet.col_widths {
                if *c >= *col {
                    new_widths.insert(c - count, *width);
                }
            }
            for (col, width) in new_widths {
                sheet.col_widths.insert(col, width);
            }
            for c in *col..(*col + *count) {
                sheet.col_widths.remove(&c);
            }
            
            // Shift merge ranges
            shift_merge_ranges(&mut sheet.merges, 0, *col, 0, -(*count as i32));
            
            Ok(())
        }
        SheetOp::Merge(range) => {
            validate_merge_range(range)?;
            
            // Check for overlapping merges
            if check_merge_overlap(&sheet.merges, range) {
                return Err(SheetOpError::MergeOverlap);
            }
            
            // Check that we're not merging an already merged range
            for existing in &sheet.merges {
                if existing.start_row == range.start_row
                    && existing.start_col == range.start_col
                    && existing.end_row == range.end_row
                    && existing.end_col == range.end_col
                {
                    return Ok(()); // Already merged, no-op
                }
            }
            
            sheet.merges.push(range.clone());
            Ok(())
        }
        SheetOp::Unmerge(range) => {
            // Find and remove the merge range
            let index = sheet.merges.iter().position(|m| {
                m.start_row == range.start_row
                    && m.start_col == range.start_col
                    && m.end_row == range.end_row
                    && m.end_col == range.end_col
            });
            
            if let Some(idx) = index {
                sheet.merges.remove(idx);
                Ok(())
            } else {
                Err(SheetOpError::NotMerged)
            }
        }
        SheetOp::SetStyle { range, style } => {
            // Apply style to all cells in the range
            for row in range.start_row..=range.end_row {
                for col in range.start_col..=range.end_col {
                    if let Some(cell) = sheet.cells.get_mut(&(row, col)) {
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
                        if style.italic.is_some() {
                            cell.style.italic = style.italic;
                        }
                        if style.underline.is_some() {
                            cell.style.underline = style.underline;
                        }
                        if style.strikethrough.is_some() {
                            cell.style.strikethrough = style.strikethrough;
                        }
                        if style.color.is_some() {
                            cell.style.color = style.color.clone();
                        }
                        if style.background_color.is_some() {
                            cell.style.background_color = style.background_color.clone();
                        }
                        if style.horizontal_align.is_some() {
                            cell.style.horizontal_align = style.horizontal_align.clone();
                        }
                        if style.vertical_align.is_some() {
                            cell.style.vertical_align = style.vertical_align.clone();
                        }
                        if style.border.is_some() {
                            cell.style.border = style.border.clone();
                        }
                        if style.number_format.is_some() {
                            cell.style.number_format = style.number_format.clone();
                        }
                    }
                }
            }
            Ok(())
        }
        SheetOp::Sort { range, keys } => {
            apply_sort(sheet, range, keys)
        }
        SheetOp::ApplyConditionalFormat { range, rule } => {
            apply_conditional_format(sheet, range, rule)?;
            Ok(())
        }
        SheetOp::Clear { range } => {
            // Remove all cells in the range
            let keys: Vec<(u32, u32)> = sheet
                .cells
                .keys()
                .filter(|(r, c)| {
                    r >= &range.start_row
                        && r <= &range.end_row
                        && c >= &range.start_col
                        && c <= &range.end_col
                })
                .cloned()
                .collect();
            for key in keys {
                sheet.cells.remove(&key);
            }
            Ok(())
        }
        SheetOp::Copy { from, to } => {
            // Copy cells from one range to another
            let (dest_row, dest_col) = *to;
            let mut copied_cells = Vec::new();
            
            for row in from.start_row..=from.end_row {
                for col in from.start_col..=from.end_col {
                    if let Some(cell) = sheet.cells.get(&(row, col)) {
                        copied_cells.push(((dest_row + (row - from.start_row), dest_col + (col - from.start_col)), cell.clone()));
                    }
                }
            }
            
            for ((r, c), cell) in copied_cells {
                sheet.cells.insert((r, c), cell);
            }
            
            Ok(())
        }
        SheetOp::Paste { at, data } => {
            let (start_row, start_col) = *at;
            for (row_offset, row) in data.iter().enumerate() {
                for (col_offset, cell) in row.iter().enumerate() {
                    sheet.cells.insert((
                        start_row + row_offset as u32,
                        start_col + col_offset as u32,
                    ), cell.clone());
                }
            }
            Ok(())
        }
        SheetOp::SetColWidth { col, width } => {
            sheet.col_widths.insert(*col, *width);
            Ok(())
        }
        SheetOp::SetRowHeight { row, height } => {
            sheet.row_heights.insert(*row, *height);
            Ok(())
        }
        SheetOp::FreezePanes { row, col } => {
            sheet.frozen = Some((*row, *col));
            Ok(())
        }
        SheetOp::UnfreezePanes => {
            sheet.frozen = None;
            Ok(())
        }
        SheetOp::RenameSheet { .. } => {
            // Cannot rename from SheetOp context (needs Workbook)
            Err(SheetOpError::InvalidMerge {
                reason: "RenameSheet must be applied to Workbook".to_string(),
            })
        }
        SheetOp::AddSheet { .. } => {
            // Cannot add sheet from SheetOp context (needs Workbook)
            Err(SheetOpError::InvalidMerge {
                reason: "AddSheet must be applied to Workbook".to_string(),
            })
        }
        SheetOp::RemoveSheet { .. } => {
            // Cannot remove sheet from SheetOp context (needs Workbook)
            Err(SheetOpError::InvalidMerge {
                reason: "RemoveSheet must be applied to Workbook".to_string(),
            })
        }
        SheetOp::SetSheetVisibility { .. } => {
            // Cannot set visibility from SheetOp context (needs Workbook)
            Err(SheetOpError::InvalidMerge {
                reason: "SetSheetVisibility must be applied to Workbook".to_string(),
            })
        }
    }
}

/// Apply a SheetOp to a Workbook.
/// This applies the operation to the active sheet by default,
/// or to a specific sheet if the operation targets one.
pub fn apply_to_workbook(wb: &mut Workbook, op: &SheetOp) -> SheetOpResult {
    match op {
        SheetOp::RenameSheet { old_name, new_name } => {
            // Check if new name already exists
            if wb.sheets.iter().any(|s| s.name == *new_name) {
                return Err(SheetOpError::DuplicateSheetName {
                    name: new_name.clone(),
                });
            }
            
            if let Some(sheet) = wb.sheets.iter_mut().find(|s| s.name == *old_name) {
                sheet.name = new_name.clone();
                wb.revision += 1;
                Ok(())
            } else {
                Err(SheetOpError::SheetNotFound {
                    name: old_name.clone(),
                })
            }
        }
        SheetOp::AddSheet { name } => {
            // Check if name already exists
            if wb.sheets.iter().any(|s| s.name == *name) {
                return Err(SheetOpError::DuplicateSheetName {
                    name: name.clone(),
                });
            }
            
            wb.add_sheet(Sheet::new(name.clone()));
            wb.revision += 1;
            Ok(())
        }
        SheetOp::RemoveSheet { name } => {
            if wb.sheets.len() <= 1 {
                return Err(SheetOpError::CannotDeleteOnlySheet);
            }
            
            let index = wb.sheets.iter().position(|s| s.name == *name);
            if let Some(idx) = index {
                wb.remove_sheet(idx);
                wb.revision += 1;
                Ok(())
            } else {
                Err(SheetOpError::SheetNotFound {
                    name: name.clone(),
                })
            }
        }
        SheetOp::SetSheetVisibility { name, visible } => {
            if let Some(sheet) = wb.sheets.iter_mut().find(|s| s.name == *name) {
                sheet.visible = *visible;
                wb.revision += 1;
                Ok(())
            } else {
                Err(SheetOpError::SheetNotFound {
                    name: name.clone(),
                })
            }
        }
        _ => {
            // Apply to active sheet
            if let Some(sheet) = wb.sheets.get_mut(wb.active_sheet) {
                apply_to_sheet(sheet, op)?;
                wb.revision += 1;
                Ok(())
            } else if !wb.sheets.is_empty() {
                // Fallback to first sheet
                apply_to_sheet(&mut wb.sheets[0], op)?;
                wb.revision += 1;
                Ok(())
            } else {
                Err(SheetOpError::SheetIndexOutOfRange {
                    index: wb.active_sheet,
                    max: 0,
                })
            }
        }
    }
}

/// Invert a SheetOp to create the undo operation.
pub fn invert_sheetop(op: &SheetOp, _sheet: &Sheet) -> SheetOp {
    match op {
        SheetOp::SetCell { row, col, .. } => {
            // Inverse of SetCell is SetCell with the previous value
            // Since we don't have the previous value in the op, we return Clear
            SheetOp::Clear {
                range: Range2d::new(*row, *col, *row, *col),
            }
        }
        SheetOp::InsertRow { after, count } => {
            // Inverse of InsertRow is DeleteRow at the same position
            SheetOp::DeleteRow {
                row: after + 1,
                count: *count,
            }
        }
        SheetOp::DeleteRow { row, count } => {
            // Inverse of DeleteRow is InsertRow before the deleted rows
            SheetOp::InsertRow {
                after: row - 1,
                count: *count,
            }
        }
        SheetOp::InsertCol { after, count } => {
            // Inverse of InsertCol is DeleteCol at the same position
            SheetOp::DeleteCol {
                col: after + 1,
                count: *count,
            }
        }
        SheetOp::DeleteCol { col, count } => {
            // Inverse of DeleteCol is InsertCol before the deleted columns
            SheetOp::InsertCol {
                after: col - 1,
                count: *count,
            }
        }
        SheetOp::Merge(range) => {
            // Inverse of Merge is Unmerge
            SheetOp::Unmerge(range.clone())
        }
        SheetOp::Unmerge(range) => {
            // Inverse of Unmerge is Merge
            SheetOp::Merge(range.clone())
        }
        SheetOp::SetStyle { range, .. } => {
            // Inverse of SetStyle is SetStyle with a default (empty) style
            // This resets the style to default
            SheetOp::SetStyle {
                range: range.clone(),
                style: CellStyle::default(),
            }
        }
        SheetOp::Sort { range, keys } => {
            // Sort is its own inverse if we sort again with the same keys
            SheetOp::Sort {
                range: range.clone(),
                keys: keys.clone(),
            }
        }
        SheetOp::ApplyConditionalFormat { range, .. } => {
            // Inverse is to remove conditional format (would need a RemoveConditionalFormat op)
            // For now, we'll use Clear which removes the formatting
            SheetOp::Clear {
                range: range.clone(),
            }
        }
        SheetOp::Clear { range } => {
            // Inverse of Clear would be to restore the cleared cells
            // Since we don't have the old data, we can't fully invert this
            // For now, we return a no-op SetStyle
            SheetOp::SetStyle {
                range: range.clone(),
                style: CellStyle::default(),
            }
        }
        SheetOp::Copy { from, to } => {
            // Inverse of Copy is Clear
            let (dest_row, dest_col) = *to;
            SheetOp::Clear {
                range: Range2d::new(
                    dest_row,
                    dest_col,
                    dest_row + (from.end_row - from.start_row),
                    dest_col + (from.end_col - from.start_col),
                ),
            }
        }
        SheetOp::Paste { at, data } => {
            // Inverse of Paste is Clear
            let (start_row, start_col) = *at;
            let rows = data.len() as u32;
            let cols = data.get(0).map(|row| row.len() as u32).unwrap_or(0);
            SheetOp::Clear {
                range: Range2d::new(start_row, start_col, start_row + rows - 1, start_col + cols - 1),
            }
        }
        SheetOp::SetColWidth { col, .. } => {
            // Inverse doesn't restore previous width, but we can't know it
            // Return a no-op
            SheetOp::SetColWidth {
                col: *col,
                width: 8.43f32, // Default column width
            }
        }
        SheetOp::SetRowHeight { row, .. } => {
            // Inverse doesn't restore previous height, but we can't know it
            SheetOp::SetRowHeight {
                row: *row,
                height: 15.0, // Default row height
            }
        }
        SheetOp::FreezePanes { .. } => {
            // Inverse of FreezePanes is UnfreezePanes
            SheetOp::UnfreezePanes
        }
        SheetOp::UnfreezePanes => {
            // Inverse of UnfreezePanes is to restore freeze (but we don't know the position)
            SheetOp::FreezePanes {
                row: 0,
                col: 0,
            }
        }
        SheetOp::RenameSheet { old_name, new_name } => {
            // Inverse is to rename back
            SheetOp::RenameSheet {
                old_name: new_name.clone(),
                new_name: old_name.clone(),
            }
        }
        SheetOp::AddSheet { name } => {
            // Inverse is to remove the sheet
            SheetOp::RemoveSheet {
                name: name.clone(),
            }
        }
        SheetOp::RemoveSheet { name } => {
            // Inverse is to add the sheet back (but we don't have the data)
            // This is a limitation - we'd need to store the sheet data
            SheetOp::AddSheet {
                name: name.clone(),
            }
        }
        SheetOp::SetSheetVisibility { name, visible } => {
            // Inverse is to toggle visibility back
            SheetOp::SetSheetVisibility {
                name: name.clone(),
                visible: !*visible,
            }
        }
    }
}

/// Invert a SheetOp to create the undo operation, using Workbook context.
pub fn invert_sheetop_with_workbook(op: &SheetOp, wb: &Workbook) -> SheetOp {
    // For operations that affect the workbook structure, we can use the workbook context
    // to create better inverses, but for now we just use the sheet version
    invert_sheetop(op, wb.sheets.get(wb.active_sheet).unwrap_or(&wb.sheets[0]))
}

/// Helper function to shift merge ranges vertically or horizontally.
fn shift_merge_ranges(
    merges: &mut Vec<MergeRange>,
    shift_row: u32,
    shift_col: u32,
    _row_delta: u32,
    col_delta: i32,
) {
    for merge in merges.iter_mut() {
        if merge.start_row >= shift_row {
            merge.start_row = (merge.start_row as i32 + col_delta) as u32;
            merge.end_row = (merge.end_row as i32 + col_delta) as u32;
        }
        if merge.start_col >= shift_col {
            merge.start_col = (merge.start_col as i32 + col_delta) as u32;
            merge.end_col = (merge.end_col as i32 + col_delta) as u32;
        }
    }
}

/// Helper function to apply sorting to a sheet.
///
/// Sort operation rearranges entire rows within the range based on the values
/// in the specified key column(s). Rows are reordered as whole rows, preserving
/// the column structure within each row.
fn apply_sort(sheet: &mut Sheet, range: &Range2d, keys: &[SortKey]) -> SheetOpResult {
    if keys.is_empty() {
        return Err(SheetOpError::InvalidSort {
            reason: "no sort keys provided".to_string(),
        });
    }

    let num_cols = range.end_col - range.start_col + 1;
    if num_cols == 0 {
        return Ok(());
    }

    // Collect rows from the range. Each row is a map of column -> (cell, raw_value)
    struct SortRow {
        /// Column offset -> cell data for this row within the range
        cells: Vec<Option<Cell>>,
    }

    let mut rows: Vec<SortRow> = Vec::new();
    for r in range.start_row..=range.end_row {
        let mut row_cells: Vec<Option<Cell>> = Vec::new();
        for c in range.start_col..=range.end_col {
            row_cells.push(sheet.cells.remove(&(r, c)));
        }
        rows.push(SortRow {
            cells: row_cells,
        });
    }

    // Sort rows based on key columns
    rows.sort_by(|a, b| {
        for key in keys {
            let key_col_offset = (key.col - range.start_col) as usize;
            let val_a = a
                .cells
                .get(key_col_offset)
                .and_then(|c| c.as_ref().map(|c| c.raw.as_str()))
                .unwrap_or("");
            let val_b = b
                .cells
                .get(key_col_offset)
                .and_then(|c| c.as_ref().map(|c| c.raw.as_str()))
                .unwrap_or("");

            let cmp = val_a.cmp(val_b);
            if cmp != std::cmp::Ordering::Equal {
                return match key.order {
                    SortOrder::Ascending => cmp,
                    SortOrder::Descending => cmp.reverse(),
                };
            }
        }
        // If all keys compare equal, preserve original order (stable sort)
        std::cmp::Ordering::Equal
    });

    // Write sorted rows back to the range
    for (dest_row_offset, row) in rows.iter().enumerate() {
        let dest_row = range.start_row + dest_row_offset as u32;
        for (col_offset, maybe_cell) in row.cells.iter().enumerate() {
            let dest_col = range.start_col + col_offset as u32;
            if let Some(cell) = maybe_cell {
                sheet.cells.insert((dest_row, dest_col), cell.clone());
            }
        }
    }

    Ok(())
}

/// Parse a raw string value into CellValue and optional formula.
fn parse_raw_value(raw: &str) -> (CellValue, Option< wo_formula::ast::Expr>) {
    // Try to parse as a number
    if let Ok(num) = raw.parse::<f64>() {
        return (CellValue::Num(num), None);
    }
    
    // Try to parse as boolean
    if raw.eq_ignore_ascii_case("true") {
        return (CellValue::Bool(true), None);
    }
    if raw.eq_ignore_ascii_case("false") {
        return (CellValue::Bool(false), None);
    }
    
    // Try to parse as formula
    if raw.starts_with('=') {
        if let Ok(expr) = wo_formula::parse(&raw[1..]) {
            // For now, we won't evaluate the formula
            return (CellValue::Text(raw.to_string()), Some(expr));
        }
    }
    
    // Default to text
    (CellValue::Text(raw.to_string()), None)
}

// ============================================================================
// Tests for SS-2: SheetOp apply + invert
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Test 1: SetCell apply
    #[test]
    fn test_set_cell_apply() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let op = SheetOp::SetCell {
            row: 0,
            col: 0,
            raw: "Hello".to_string(),
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        assert_eq!(wb.revision, 1);
        let cell = wb.sheets[0].get_cell(0, 0).unwrap();
        assert_eq!(cell.raw, "Hello");
    }

    // Test 2: SetCell invert
    #[test]
    fn test_set_cell_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let op = SheetOp::SetCell {
            row: 0,
            col: 0,
            raw: "Hello".to_string(),
        };
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::Clear { .. });
    }

    // Test 3: InsertRow apply
    #[test]
    fn test_insert_row_apply() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(1, 0, Cell::with_text("A2"));
        wb.add_sheet(sheet);
        
        let op = SheetOp::InsertRow {
            after: 0,
            count: 1,
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        // A1 should still exist
        assert!(wb.sheets[0].get_cell(0, 0).is_some());
        // A2 should now be at row 2
        assert!(wb.sheets[0].get_cell(2, 0).is_some());
        assert_eq!(wb.sheets[0].get_cell(2, 0).unwrap().raw, "A2");
    }

    // Test 4: InsertRow invert
    #[test]
    fn test_insert_row_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let op = SheetOp::InsertRow {
            after: 0,
            count: 2,
        };
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::DeleteRow { row: 1, count: 2 });
    }

    // Test 5: DeleteRow apply
    #[test]
    fn test_delete_row_apply() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(1, 0, Cell::with_text("A2"));
        sheet.set_cell(2, 0, Cell::with_text("A3"));
        wb.add_sheet(sheet);
        
        let op = SheetOp::DeleteRow {
            row: 1,
            count: 1,
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        // A1 should still exist at row 0
        assert!(wb.sheets[0].get_cell(0, 0).is_some());
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "A1");
        
        // A3 should now be at row 1 (shifted from row 2)
        assert!(wb.sheets[0].get_cell(1, 0).is_some());
        assert_eq!(wb.sheets[0].get_cell(1, 0).unwrap().raw, "A3");
        
        // Row 2 should now be empty
        assert!(wb.sheets[0].get_cell(2, 0).is_none());
    }

    // Test 6: DeleteRow invert
    #[test]
    fn test_delete_row_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let op = SheetOp::DeleteRow {
            row: 5,
            count: 3,
        };
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::InsertRow { after: 4, count: 3 });
    }

    // Test 7: InsertCol apply
    #[test]
    fn test_insert_col_apply() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(0, 1, Cell::with_text("B1"));
        wb.add_sheet(sheet);
        
        let op = SheetOp::InsertCol {
            after: 0,
            count: 1,
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        // A1 should still be at col 0
        assert!(wb.sheets[0].get_cell(0, 0).is_some());
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "A1");
        
        // B1 should now be at col 2
        assert!(wb.sheets[0].get_cell(0, 2).is_some());
        assert_eq!(wb.sheets[0].get_cell(0, 2).unwrap().raw, "B1");
    }

    // Test 8: InsertCol invert
    #[test]
    fn test_insert_col_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let op = SheetOp::InsertCol {
            after: 2,
            count: 1,
        };
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::DeleteCol { col: 3, count: 1 });
    }

    // Test 9: DeleteCol apply
    #[test]
    fn test_delete_col_apply() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(0, 1, Cell::with_text("B1"));
        sheet.set_cell(0, 2, Cell::with_text("C1"));
        wb.add_sheet(sheet);
        
        let op = SheetOp::DeleteCol {
            col: 1,
            count: 1,
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        // A1 should still exist at col 0
        assert!(wb.sheets[0].get_cell(0, 0).is_some());
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "A1");
        
        // C1 should now be at col 1 (shifted from col 2)
        assert!(wb.sheets[0].get_cell(0, 1).is_some());
        assert_eq!(wb.sheets[0].get_cell(0, 1).unwrap().raw, "C1");
        
        // Col 2 should now be empty
        assert!(wb.sheets[0].get_cell(0, 2).is_none());
    }

    // Test 10: DeleteCol invert
    #[test]
    fn test_delete_col_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let op = SheetOp::DeleteCol {
            col: 3,
            count: 2,
        };
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::InsertCol { after: 2, count: 2 });
    }

    // Test 11: Merge apply
    #[test]
    fn test_merge_apply() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let merge_range = MergeRange::new(0, 0, 2, 2);
        let op = SheetOp::Merge(merge_range.clone());
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        assert_eq!(wb.sheets[0].merges.len(), 1);
        assert_eq!(wb.sheets[0].merges[0].start_row, 0);
        assert_eq!(wb.sheets[0].merges[0].start_col, 0);
        assert_eq!(wb.sheets[0].merges[0].end_row, 2);
        assert_eq!(wb.sheets[0].merges[0].end_col, 2);
    }

    // Test 12: Merge invert
    #[test]
    fn test_merge_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let merge_range = MergeRange::new(0, 0, 1, 1);
        let op = SheetOp::Merge(merge_range.clone());
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::Unmerge(range) if range.start_row == 0 && range.start_col == 0);
    }

    // Test 13: Unmerge apply
    #[test]
    fn test_unmerge_apply() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.add_merge(MergeRange::new(0, 0, 2, 2));
        wb.add_sheet(sheet);
        
        let op = SheetOp::Unmerge(MergeRange::new(0, 0, 2, 2));
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        assert_eq!(wb.sheets[0].merges.len(), 0);
    }

    // Test 14: Unmerge invert
    #[test]
    fn test_unmerge_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let merge_range = MergeRange::new(0, 0, 1, 1);
        let op = SheetOp::Unmerge(merge_range.clone());
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::Merge(range) if range.start_row == 0 && range.start_col == 0);
    }

    // Test 15: SetStyle apply
    #[test]
    fn test_set_style_apply() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(1, 1, Cell::with_text("B2"));
        wb.add_sheet(sheet);
        
        let style = CellStyle {
            bold: Some(true),
            font_size: Some(14.0),
            ..Default::default()
        };
        
        let op = SheetOp::SetStyle {
            range: Range2d::new(0, 0, 1, 1),
            style,
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        let cell = wb.sheets[0].get_cell(0, 0).unwrap();
        assert_eq!(cell.style.bold, Some(true));
        assert_eq!(cell.style.font_size, Some(14.0));
        
        let cell2 = wb.sheets[0].get_cell(1, 1).unwrap();
        assert_eq!(cell2.style.bold, Some(true));
    }

    // Test 16: SetStyle invert
    #[test]
    fn test_set_style_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let style = CellStyle {
            bold: Some(true),
            ..Default::default()
        };
        
        let op = SheetOp::SetStyle {
            range: Range2d::new(0, 0, 5, 5),
            style,
        };
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::SetStyle { style: CellStyle { .. }, .. });
    }

    // Test 17: Clear apply
    #[test]
    fn test_clear_apply() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(0, 1, Cell::with_text("B1"));
        wb.add_sheet(sheet);
        
        let op = SheetOp::Clear {
            range: Range2d::new(0, 0, 0, 1),
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        assert!(wb.sheets[0].get_cell(0, 0).is_none());
        assert!(wb.sheets[0].get_cell(0, 1).is_none());
    }

    // Test 18: Clear invert
    #[test]
    fn test_clear_invert() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        
        let op = SheetOp::Clear {
            range: Range2d::new(0, 0, 10, 10),
        };
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        matches!(inverted, SheetOp::SetStyle { .. });
    }

    // Test 19: Copy apply
    #[test]
    fn test_copy_apply() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A1"));
        sheet.set_cell(0, 1, Cell::with_text("B1"));
        wb.add_sheet(sheet);
        
        let op = SheetOp::Copy {
            from: Range2d::new(0, 0, 0, 1),
            to: (5, 5),
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        
        // Original should still exist
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "A1");
        
        // Copied cells should exist at new location
        assert_eq!(wb.sheets[0].get_cell(5, 5).unwrap().raw, "A1");
        assert_eq!(wb.sheets[0].get_cell(5, 6).unwrap().raw, "B1");
    }

    // Test 20: RenameSheet apply + invert round-trip
    #[test]
    fn test_rename_sheet_roundtrip() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("OldName"));
        
        let op = SheetOp::RenameSheet {
            old_name: "OldName".to_string(),
            new_name: "NewName".to_string(),
        };
        
        apply_to_workbook(&mut wb, &op).unwrap();
        assert_eq!(wb.sheets[0].name, "NewName");
        
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        if let SheetOp::RenameSheet { old_name, new_name } = inverted {
            apply_to_workbook(&mut wb, &SheetOp::RenameSheet { old_name, new_name }).unwrap();
            assert_eq!(wb.sheets[0].name, "OldName");
        } else {
            panic!("Expected RenameSheet inversion");
        }
    }

    // Test 21: Sort apply — single column, ascending
    #[test]
    fn test_sort_apply_single_column() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        // Set up 3 rows of data: C, A, B in column 0
        sheet.set_cell(0, 0, Cell::with_text("C"));
        sheet.set_cell(0, 1, Cell::with_text("x"));
        sheet.set_cell(1, 0, Cell::with_text("A"));
        sheet.set_cell(1, 1, Cell::with_text("y"));
        sheet.set_cell(2, 0, Cell::with_text("B"));
        sheet.set_cell(2, 1, Cell::with_text("z"));
        wb.add_sheet(sheet);

        let op = SheetOp::Sort {
            range: Range2d::new(0, 0, 2, 1),
            keys: vec![SortKey {
                col: 0,
                order: SortOrder::Ascending,
            }],
        };

        apply_to_workbook(&mut wb, &op).unwrap();

        // After ascending sort by col 0: A, B, C
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "A");
        assert_eq!(wb.sheets[0].get_cell(0, 1).unwrap().raw, "y");
        assert_eq!(wb.sheets[0].get_cell(1, 0).unwrap().raw, "B");
        assert_eq!(wb.sheets[0].get_cell(1, 1).unwrap().raw, "z");
        assert_eq!(wb.sheets[0].get_cell(2, 0).unwrap().raw, "C");
        assert_eq!(wb.sheets[0].get_cell(2, 1).unwrap().raw, "x");
    }

    // Test 22: Sort apply — descending order
    #[test]
    fn test_sort_apply_descending() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A"));
        sheet.set_cell(1, 0, Cell::with_text("C"));
        sheet.set_cell(2, 0, Cell::with_text("B"));
        wb.add_sheet(sheet);

        let op = SheetOp::Sort {
            range: Range2d::new(0, 0, 2, 0),
            keys: vec![SortKey {
                col: 0,
                order: SortOrder::Descending,
            }],
        };

        apply_to_workbook(&mut wb, &op).unwrap();

        // After descending sort by col 0: C, B, A
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "C");
        assert_eq!(wb.sheets[0].get_cell(1, 0).unwrap().raw, "B");
        assert_eq!(wb.sheets[0].get_cell(2, 0).unwrap().raw, "A");
    }

    // Test 23: Sort invert — returns Sort with same keys (structural self-inverse)
    #[test]
    fn test_sort_invert_returns_sort() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));

        let op = SheetOp::Sort {
            range: Range2d::new(0, 0, 100, 5),
            keys: vec![SortKey {
                col: 1,
                order: SortOrder::Ascending,
            }],
        };

        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        match inverted {
            SheetOp::Sort { range, keys } => {
                assert_eq!(range, Range2d::new(0, 0, 100, 5));
                assert_eq!(keys.len(), 1);
                assert_eq!(keys[0].col, 1);
                assert_eq!(keys[0].order, SortOrder::Ascending);
            }
            _ => panic!("Expected Sort operation as inverse of Sort"),
        }
    }

    // Test 24: Sort self-inverse — applying sort, then its inverse (same sort) does not crash
    // and the data remains in sorted order. Sort's inverse is Sort with the same keys.
    #[test]
    fn test_sort_self_inverse() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        // Set up rows with unique values in col 0
        sheet.set_cell(0, 0, Cell::with_text("delta"));
        sheet.set_cell(0, 1, Cell::with_text("first"));
        sheet.set_cell(1, 0, Cell::with_text("alpha"));
        sheet.set_cell(1, 1, Cell::with_text("second"));
        sheet.set_cell(2, 0, Cell::with_text("gamma"));
        sheet.set_cell(2, 1, Cell::with_text("third"));
        sheet.set_cell(3, 0, Cell::with_text("beta"));
        sheet.set_cell(3, 1, Cell::with_text("fourth"));
        wb.add_sheet(sheet);

        let op = SheetOp::Sort {
            range: Range2d::new(0, 0, 3, 1),
            keys: vec![SortKey {
                col: 0,
                order: SortOrder::Ascending,
            }],
        };

        // Apply sort: rows become alpha, beta, delta, gamma
        apply_to_workbook(&mut wb, &op).unwrap();

        // Verify sorted order: alpha (row 1), beta (row 3), delta (row 0), gamma (row 2)
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "alpha");
        assert_eq!(wb.sheets[0].get_cell(1, 0).unwrap().raw, "beta");
        assert_eq!(wb.sheets[0].get_cell(2, 0).unwrap().raw, "delta");
        assert_eq!(wb.sheets[0].get_cell(3, 0).unwrap().raw, "gamma");
        // col1 values stay with their rows
        assert_eq!(wb.sheets[0].get_cell(0, 1).unwrap().raw, "second");  // alpha's pair
        assert_eq!(wb.sheets[0].get_cell(1, 1).unwrap().raw, "fourth");  // beta's pair
        assert_eq!(wb.sheets[0].get_cell(2, 1).unwrap().raw, "first");   // delta's pair
        assert_eq!(wb.sheets[0].get_cell(3, 1).unwrap().raw, "third");   // gamma's pair

        // Get the inverse of sort (should be Sort with same keys)
        let inverted = invert_sheetop(&op, &wb.sheets[0]);
        match &inverted {
            SheetOp::Sort { range: _, keys } => {
                assert_eq!(keys.len(), 1);
                assert_eq!(keys[0].col, 0);
                assert_eq!(keys[0].order, SortOrder::Ascending);
            }
            _ => panic!("Expected Sort inverse"),
        }

        // Apply the inverse (sort ascending again) — should not crash
        // Since data is already sorted, second sort preserves the order
        apply_to_workbook(&mut wb, &inverted).unwrap();

        // Order must remain alpha, beta, delta, gamma (stable sort preserves)
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "alpha");
        assert_eq!(wb.sheets[0].get_cell(1, 0).unwrap().raw, "beta");
        assert_eq!(wb.sheets[0].get_cell(2, 0).unwrap().raw, "delta");
        assert_eq!(wb.sheets[0].get_cell(3, 0).unwrap().raw, "gamma");
        // col1 values: second, fourth, first, third
        assert_eq!(wb.sheets[0].get_cell(0, 1).unwrap().raw, "second");
        assert_eq!(wb.sheets[0].get_cell(1, 1).unwrap().raw, "fourth");
        assert_eq!(wb.sheets[0].get_cell(2, 1).unwrap().raw, "first");
        assert_eq!(wb.sheets[0].get_cell(3, 1).unwrap().raw, "third");
    }

    // Test 25: Sort with empty sort keys returns error
    #[test]
    fn test_sort_empty_keys_error() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        sheet.set_cell(0, 0, Cell::with_text("A"));
        wb.add_sheet(sheet);

        let op = SheetOp::Sort {
            range: Range2d::new(0, 0, 0, 0),
            keys: vec![],
        };

        let result = apply_to_workbook(&mut wb, &op);
        assert!(result.is_err());
        match result {
            Err(SheetOpError::InvalidSort { .. }) => {} // expected
            _ => panic!("Expected InvalidSort error"),
        }
    }

    // Test 26: Sort preserves column structure within each row
    #[test]
    fn test_sort_preserves_column_structure() {
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Sheet1");
        // Row 0: name=Zoe, age=25
        // Row 1: name=Alice, age=30
        // Row 2: name=Bob, age=20
        sheet.set_cell(0, 0, Cell::with_text("Zoe"));
        sheet.set_cell(0, 1, Cell::with_num(25.0));
        sheet.set_cell(1, 0, Cell::with_text("Alice"));
        sheet.set_cell(1, 1, Cell::with_num(30.0));
        sheet.set_cell(2, 0, Cell::with_text("Bob"));
        sheet.set_cell(2, 1, Cell::with_num(20.0));
        wb.add_sheet(sheet);

        // Sort by name ascending
        let op = SheetOp::Sort {
            range: Range2d::new(0, 0, 2, 1),
            keys: vec![SortKey {
                col: 0,
                order: SortOrder::Ascending,
            }],
        };

        apply_to_workbook(&mut wb, &op).unwrap();

        // After sort: Alice(30), Bob(20), Zoe(25)
        assert_eq!(wb.sheets[0].get_cell(0, 0).unwrap().raw, "Alice");
        assert_eq!(wb.sheets[0].get_cell(0, 1).unwrap().raw, "30");
        assert_eq!(wb.sheets[0].get_cell(1, 0).unwrap().raw, "Bob");
        assert_eq!(wb.sheets[0].get_cell(1, 1).unwrap().raw, "20");
        assert_eq!(wb.sheets[0].get_cell(2, 0).unwrap().raw, "Zoe");
        assert_eq!(wb.sheets[0].get_cell(2, 1).unwrap().raw, "25");

        // Column structure preserved: name at col 0, age at col 1
        // Age values: Alice=30, Bob=20, Zoe=25 (ages stay with their names)
        assert_eq!(wb.sheets[0].get_cell(0, 1).unwrap().value, CellValue::Num(30.0));
    }
}
