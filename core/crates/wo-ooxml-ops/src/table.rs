//! Table operations for DOCX document mutation
//!
//! Provides 6 core table operations:
//! - InsertTableRow
//! - DeleteTableRow
//! - InsertTableColumn
//! - DeleteTableColumn
//! - MergeCells
//! - SplitCell
//!
//! Plus SetCellShading for completeness.

use super::ops::{DocModel, DocOp, DocOpError};
use wo_ooxml::model::{
    DocxBlock, DocxParagraph, DocxParagraphProperties, DocxRun, DocxTableCell, DocxTableRow,
};

/// Create a default paragraph
fn default_paragraph() -> DocxParagraph {
    DocxParagraph {
        style_id: None,
        properties: DocxParagraphProperties::default(),
        runs: vec![DocxRun {
            text: String::new(),
            bold: false,
            italic: false,
            underline: None,
            strikethrough: false,
            double_strikethrough: false,
            font: None,
            font_size: None,
            font_size_cs: None,
            color: None,
            highlight: None,
            vertical_alignment: None,
            small_caps: false,
            all_caps: false,
        }],
        section_properties: None,
    }
}

impl<'a> DocModel<'a> {
    /// Apply InsertTableRow operation
    pub fn table_apply_insert_row(
        &mut self,
        table_idx: usize,
        after_row: usize,
    ) -> Result<DocOp, DocOpError> {
        // Validate table index
        let table_block = self
            .body
            .get_block_mut(table_idx)
            .ok_or_else(|| DocOpError::TableIndexOutOfRange(table_idx, 0, 0))?;

        let table = match table_block {
            DocxBlock::Table(t) => t,
            DocxBlock::Image(_) => return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0)),
            DocxBlock::Paragraph(_) => {
                return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0))
            }
        };

        // Validate row index
        if after_row >= table.rows.len() {
            return Err(DocOpError::TableIndexOutOfRange(table_idx, after_row, 0));
        }

        // Clone the row after which we're inserting
        let template_row = &table.rows[after_row];
        let new_row = DocxTableRow {
            cells: template_row
                .cells
                .iter()
                .map(|cell| DocxTableCell {
                    paragraphs: cell.paragraphs.clone(),
                    column_span: cell.column_span,
                    row_span: cell.row_span,
                    width: cell.width,
                    shading: cell.shading.clone(),
                })
                .collect(),
            height: template_row.height,
            is_header: false, // New rows are not headers by default
        };

        // Insert the new row
        let insert_pos = after_row + 1;
        table.rows.insert(insert_pos, new_row);

        // Return inverse operation: DeleteTableRow
        Ok(DocOp::DeleteTableRow {
            table: table_idx,
            row: insert_pos,
        })
    }

    /// Apply DeleteTableRow operation
    pub fn table_apply_delete_row(
        &mut self,
        table_idx: usize,
        row_idx: usize,
    ) -> Result<DocOp, DocOpError> {
        // Validate table index
        let table_block = self
            .body
            .get_block_mut(table_idx)
            .ok_or_else(|| DocOpError::TableIndexOutOfRange(table_idx, 0, 0))?;

        let table = match table_block {
            DocxBlock::Table(t) => t,
            DocxBlock::Image(_) => return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0)),
            DocxBlock::Paragraph(_) => {
                return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0))
            }
        };

        // Validate row index and ensure at least one row remains
        if row_idx >= table.rows.len() {
            return Err(DocOpError::TableIndexOutOfRange(table_idx, row_idx, 0));
        }

        if table.rows.len() <= 1 {
            return Err(DocOpError::Invalid(
                "Cannot delete the only row in a table".to_string(),
            ));
        }

        // Remove the row
        table.rows.remove(row_idx);

        // Return inverse operation: InsertTableRow
        let after_row = if row_idx > 0 { row_idx - 1 } else { 0 };
        Ok(DocOp::InsertTableRow {
            table: table_idx,
            after_row,
        })
    }

    /// Apply InsertTableColumn operation
    pub fn table_apply_insert_column(
        &mut self,
        table_idx: usize,
        after_col: usize,
    ) -> Result<DocOp, DocOpError> {
        // Validate table index
        let table_block = self
            .body
            .get_block_mut(table_idx)
            .ok_or_else(|| DocOpError::TableIndexOutOfRange(table_idx, 0, 0))?;

        let table = match table_block {
            DocxBlock::Table(t) => t,
            DocxBlock::Image(_) => return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0)),
            DocxBlock::Paragraph(_) => {
                return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0))
            }
        };

        // Validate column index
        if table.rows.is_empty() {
            return Err(DocOpError::Invalid(
                "Cannot insert column into empty table".to_string(),
            ));
        }

        if after_col >= table.rows[0].cells.len() {
            return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, after_col));
        }

        let insert_col = after_col + 1;

        // For each row, add a new cell after the specified column
        for row in &mut table.rows {
            // Get the template cell from the same row
            let template_cell = &row.cells[after_col];
            let new_cell = DocxTableCell {
                paragraphs: if template_cell.paragraphs.is_empty() {
                    vec![default_paragraph()]
                } else {
                    // Clone the first paragraph and clear its text
                    let mut para = template_cell.paragraphs[0].clone();
                    for run in &mut para.runs {
                        run.text.clear();
                    }
                    vec![para]
                },
                column_span: 1, // New cells are single-column by default
                row_span: 1,
                width: None,
                shading: None,
            };
            row.cells.insert(insert_col, new_cell);
        }

        // Return inverse operation: DeleteTableColumn
        Ok(DocOp::DeleteTableColumn {
            table: table_idx,
            col: insert_col,
        })
    }

    /// Apply DeleteTableColumn operation
    pub fn table_apply_delete_column(
        &mut self,
        table_idx: usize,
        col_idx: usize,
    ) -> Result<DocOp, DocOpError> {
        // Validate table index
        let table_block = self
            .body
            .get_block_mut(table_idx)
            .ok_or_else(|| DocOpError::TableIndexOutOfRange(table_idx, 0, 0))?;

        let table = match table_block {
            DocxBlock::Table(t) => t,
            DocxBlock::Image(_) => return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0)),
            DocxBlock::Paragraph(_) => {
                return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0))
            }
        };

        // Validate column index
        if table.rows.is_empty() {
            return Err(DocOpError::Invalid(
                "Cannot delete column from empty table".to_string(),
            ));
        }

        if col_idx >= table.rows[0].cells.len() {
            return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, col_idx));
        }

        // Check if any column would have 0 cells after deletion
        if table.rows[0].cells.len() <= 1 {
            return Err(DocOpError::Invalid(
                "Cannot delete the only column in a table".to_string(),
            ));
        }

        // Remove the column from each row
        for row in &mut table.rows {
            if col_idx < row.cells.len() {
                row.cells.remove(col_idx);
            }
        }

        // Return inverse operation
        let after_col = if col_idx > 0 { col_idx - 1 } else { 0 };
        Ok(DocOp::InsertTableColumn {
            table: table_idx,
            after_col,
        })
    }

    /// Apply MergeCells operation
    pub fn table_apply_merge_cells(
        &mut self,
        table_idx: usize,
        r1: usize,
        c1: usize,
        r2: usize,
        c2: usize,
    ) -> Result<DocOp, DocOpError> {
        // Validate table index
        let table_block = self
            .body
            .get_block_mut(table_idx)
            .ok_or_else(|| DocOpError::TableIndexOutOfRange(table_idx, 0, 0))?;

        let table = match table_block {
            DocxBlock::Table(t) => t,
            DocxBlock::Image(_) => return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0)),
            DocxBlock::Paragraph(_) => {
                return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0))
            }
        };

        // Validate range
        let max_row = table.rows.len();
        let max_col = if max_row > 0 {
            table.rows[0].cells.len()
        } else {
            0
        };

        if r1 >= max_row || r2 >= max_row || c1 >= max_col || c2 >= max_col {
            return Err(DocOpError::TableIndexOutOfRange(
                table_idx,
                r1.max(r2),
                c1.max(c2),
            ));
        }

        if r1 > r2 || c1 > c2 {
            return Err(DocOpError::OutOfRange(
                "Merge range must have r1<=r2 and c1<=c2".to_string(),
            ));
        }

        // Normalize to top-left and bottom-right
        let start_row = r1.min(r2);
        let end_row = r1.max(r2);
        let start_col = c1.min(c2);
        let end_col = c1.max(c2);

        // Check if the range is already merged (top-left cell has spans covering the region)
        // We allow merging cells with content - the content will be moved to the top-left cell
        let top_left_cell = &table.rows[start_row].cells[start_col];
        if top_left_cell.row_span > 1 || top_left_cell.column_span > 1 {
            // Already merged, check if it matches the requested range
            let expected_row_span = (end_row - start_row + 1) as u32;
            let expected_col_span = (end_col - start_col + 1) as u32;
            if top_left_cell.row_span == expected_row_span
                && top_left_cell.column_span == expected_col_span
            {
                return Err(DocOpError::Invalid("Cells are already merged".to_string()));
            }
        }

        // Collect content from all cells in the region to move to top-left
        let mut all_paragraphs = Vec::new();
        for row_idx in start_row..=end_row {
            for col_idx in start_col..=end_col {
                let cell = &table.rows[row_idx].cells[col_idx];
                all_paragraphs.extend(cell.paragraphs.clone());
            }
        }

        // Set the top-left cell to span the entire region with all content
        let top_left_cell = &mut table.rows[start_row].cells[start_col];
        top_left_cell.row_span = (end_row - start_row + 1) as u32;
        top_left_cell.column_span = (end_col - start_col + 1) as u32;
        top_left_cell.paragraphs = all_paragraphs;

        // Clear the other cells in the merge region
        for row_idx in start_row..=end_row {
            for col_idx in start_col..=end_col {
                if row_idx == start_row && col_idx == start_col {
                    continue; // Skip the top-left cell
                }
                let cell = &mut table.rows[row_idx].cells[col_idx];
                cell.row_span = 0;
                cell.column_span = 0;
                // Clear content from merged cells
                cell.paragraphs.clear();
            }
        }

        // Return inverse operation: Split the top-left cell
        Ok(DocOp::SplitCell {
            table: table_idx,
            row: start_row,
            col: start_col,
            horizontal: false,
        })
    }

    /// Apply SplitCell operation
    pub fn table_apply_split_cell(
        &mut self,
        table_idx: usize,
        row: usize,
        col: usize,
        horizontal: bool,
    ) -> Result<DocOp, DocOpError> {
        // Validate table index
        let table_block = self
            .body
            .get_block_mut(table_idx)
            .ok_or_else(|| DocOpError::TableIndexOutOfRange(table_idx, 0, 0))?;

        let table = match table_block {
            DocxBlock::Table(t) => t,
            DocxBlock::Image(_) => return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0)),
            DocxBlock::Paragraph(_) => {
                return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0))
            }
        };

        // Validate indices
        if row >= table.rows.len() {
            return Err(DocOpError::TableIndexOutOfRange(table_idx, row, col));
        }

        let max_col = if table.rows[row].cells.len() > 0 {
            table.rows[row].cells.len()
        } else {
            0
        };
        if col >= max_col {
            return Err(DocOpError::TableIndexOutOfRange(table_idx, row, col));
        }

        let cell = &table.rows[row].cells[col];

        // Check if cell is actually merged (has span > 1)
        if cell.row_span <= 1 && cell.column_span <= 1 {
            return Err(DocOpError::UnmergedCellSplit);
        }

        let row_span = cell.row_span as usize;
        let col_span = cell.column_span as usize;

        if horizontal {
            // Split horizontally: reduce row_span
            if cell.row_span <= 1 {
                return Err(DocOpError::UnmergedCellSplit);
            }

            // For each row that the original cell spans, ensure there's a cell
            for r in 0..row_span {
                let target_row = row + r;

                // Ensure row exists
                if target_row >= table.rows.len() {
                    table.rows.push(DocxTableRow {
                        cells: vec![],
                        height: None,
                        is_header: false,
                    });
                }

                // Ensure the row has enough cells
                while table.rows[target_row].cells.len() <= col {
                    table.rows[target_row].cells.push(DocxTableCell {
                        paragraphs: vec![],
                        column_span: 1,
                        row_span: 1,
                        width: None,
                        shading: None,
                    });
                }

                // Update the cell
                if r == 0 {
                    // Original cell - set row_span to 1
                    table.rows[target_row].cells[col].row_span = 1;
                    table.rows[target_row].cells[col].column_span = col_span as u32;
                } else {
                    // Split cell - set row_span to 1 and column_span to match
                    table.rows[target_row].cells[col].row_span = 1;
                    table.rows[target_row].cells[col].column_span = col_span as u32;
                }
            }

            // Return inverse: merge all the rows back
            let r2 = row + row_span - 1;
            Ok(DocOp::MergeCells {
                table: table_idx,
                r1: row,
                c1: col,
                r2,
                c2: col,
            })
        } else {
            // Split vertically: reduce column_span
            if cell.column_span <= 1 {
                return Err(DocOpError::UnmergedCellSplit);
            }

            // The original cell keeps column_span=1
            let original_cell = &mut table.rows[row].cells[col];
            original_cell.column_span = 1;

            // Insert new cells to the right
            let start_col = col;
            for c_offset in 1..col_span {
                let insert_col = start_col + c_offset;

                // For each row that the original cell spans
                for r_offset in 0..row_span {
                    let target_row = row + r_offset;

                    // Ensure row exists
                    if target_row >= table.rows.len() {
                        table.rows.push(DocxTableRow {
                            cells: vec![],
                            height: None,
                            is_header: false,
                        });
                    }

                    // Ensure the row has enough cells
                    while table.rows[target_row].cells.len() < insert_col {
                        table.rows[target_row].cells.push(DocxTableCell {
                            paragraphs: vec![],
                            column_span: 1,
                            row_span: 1,
                            width: None,
                            shading: None,
                        });
                    }

                    // Insert the new cell (shift others to the right)
                    table.rows[target_row].cells.insert(
                        insert_col,
                        DocxTableCell {
                            paragraphs: vec![],
                            column_span: 1,
                            row_span: if r_offset == 0 { 1 } else { 0 },
                            width: None,
                            shading: None,
                        },
                    );
                }
            }

            // Return inverse: merge all the columns back
            let c2 = col + col_span - 1;
            Ok(DocOp::MergeCells {
                table: table_idx,
                r1: row,
                c1: col,
                r2: row + row_span - 1,
                c2,
            })
        }
    }

    /// Apply SetCellShading operation
    pub fn table_apply_set_cell_shading(
        &mut self,
        table_idx: usize,
        row: usize,
        col: usize,
        hex: String,
    ) -> Result<DocOp, DocOpError> {
        // Validate table index
        let table_block = self
            .body
            .get_block_mut(table_idx)
            .ok_or_else(|| DocOpError::TableIndexOutOfRange(table_idx, 0, 0))?;

        let table = match table_block {
            DocxBlock::Table(t) => t,
            DocxBlock::Image(_) => return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0)),
            DocxBlock::Paragraph(_) => {
                return Err(DocOpError::TableIndexOutOfRange(table_idx, 0, 0))
            }
        };

        // Validate indices
        if row >= table.rows.len() {
            return Err(DocOpError::TableIndexOutOfRange(table_idx, row, col));
        }

        let max_col = if table.rows[row].cells.len() > 0 {
            table.rows[row].cells.len()
        } else {
            0
        };
        if col >= max_col {
            return Err(DocOpError::TableIndexOutOfRange(table_idx, row, col));
        }

        // Get the old shading value for inverse
        let old_shading = table.rows[row].cells[col].shading.clone();

        // Set the new shading
        table.rows[row].cells[col].shading = Some(hex);

        // Return inverse operation
        Ok(DocOp::SetCellShading {
            table: table_idx,
            row,
            col,
            hex: old_shading.unwrap_or_default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wo_ooxml::model::{
        DocxBlock, DocxBody, DocxParagraphProperties, DocxRun, DocxTable, DocxTableCell,
        DocxTableRow,
    };

    fn create_test_table(rows: usize, cols: usize) -> DocxTable {
        DocxTable {
            rows: (0..rows)
                .map(|_| DocxTableRow {
                    cells: (0..cols)
                        .map(|_| DocxTableCell {
                            paragraphs: vec![DocxParagraph {
                                style_id: None,
                                properties: DocxParagraphProperties::default(),
                                runs: vec![DocxRun {
                                    text: "test".to_string(),
                                    bold: false,
                                    italic: false,
                                    underline: None,
                                    strikethrough: false,
                                    double_strikethrough: false,
                                    font: None,
                                    font_size: None,
                                    font_size_cs: None,
                                    color: None,
                                    highlight: None,
                                    vertical_alignment: None,
                                    small_caps: false,
                                    all_caps: false,
                                }],
                                section_properties: None,
                            }],
                            column_span: 1,
                            row_span: 1,
                            width: None,
                            shading: None,
                        })
                        .collect(),
                    height: None,
                    is_header: false,
                })
                .collect(),
            properties: wo_ooxml::model::DocxTableProperties::default(),
        }
    }

    fn create_test_body() -> DocxBody {
        let mut body = DocxBody::new();
        body.push_table(create_test_table(3, 3));
        body
    }

    #[test]
    fn test_insert_table_row() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        let op = DocOp::InsertTableRow {
            table: 0,
            after_row: 0,
        };
        let inverse = model.apply(&op).unwrap();

        // Check that the table now has 4 rows
        match &body.blocks[0] {
            DocxBlock::Table(table) => assert_eq!(table.rows.len(), 4),
            _ => panic!("Expected table"),
        }

        // Check inverse
        if let DocOp::DeleteTableRow { table: t, row: r } = inverse {
            assert_eq!(t, 0);
            assert_eq!(r, 1);
        } else {
            panic!("Expected DeleteTableRow inverse");
        }
    }

    #[test]
    fn test_delete_table_row() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        let op = DocOp::DeleteTableRow { table: 0, row: 1 };
        let inverse = model.apply(&op).unwrap();

        // Check that the table now has 2 rows
        match &body.blocks[0] {
            DocxBlock::Table(table) => assert_eq!(table.rows.len(), 2),
            _ => panic!("Expected table"),
        }

        // Check inverse
        if let DocOp::InsertTableRow {
            table: t,
            after_row: r,
        } = inverse
        {
            assert_eq!(t, 0);
            assert_eq!(r, 0);
        } else {
            panic!("Expected InsertTableRow inverse");
        }
    }

    #[test]
    fn test_insert_table_column() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        let op = DocOp::InsertTableColumn {
            table: 0,
            after_col: 0,
        };
        let inverse = model.apply(&op).unwrap();

        // Check that the table now has 4 columns in each row
        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                assert_eq!(table.rows.len(), 3);
                for row in &table.rows {
                    assert_eq!(row.cells.len(), 4);
                }
            }
            _ => panic!("Expected table"),
        }

        // Check inverse
        if let DocOp::DeleteTableColumn { table: t, col: c } = inverse {
            assert_eq!(t, 0);
            assert_eq!(c, 1);
        } else {
            panic!("Expected DeleteTableColumn inverse");
        }
    }

    #[test]
    fn test_delete_table_column() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        let op = DocOp::DeleteTableColumn { table: 0, col: 1 };
        let inverse = model.apply(&op).unwrap();

        // Check that the table now has 2 columns in each row
        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                assert_eq!(table.rows.len(), 3);
                for row in &table.rows {
                    assert_eq!(row.cells.len(), 2);
                }
            }
            _ => panic!("Expected table"),
        }

        // Check inverse
        if let DocOp::InsertTableColumn {
            table: t,
            after_col: c,
        } = inverse
        {
            assert_eq!(t, 0);
            assert_eq!(c, 0);
        } else {
            panic!("Expected InsertTableColumn inverse");
        }
    }

    #[test]
    fn test_merge_cells() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // Merge a 2x2 region
        let op = DocOp::MergeCells {
            table: 0,
            r1: 0,
            c1: 0,
            r2: 1,
            c2: 1,
        };
        let inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                // Top-left cell should have row_span=2, column_span=2
                assert_eq!(table.rows[0].cells[0].row_span, 2);
                assert_eq!(table.rows[0].cells[0].column_span, 2);

                // Other cells in the region should have span=0
                assert_eq!(table.rows[0].cells[1].row_span, 0);
                assert_eq!(table.rows[0].cells[1].column_span, 0);
                assert_eq!(table.rows[1].cells[0].row_span, 0);
                assert_eq!(table.rows[1].cells[0].column_span, 0);
                assert_eq!(table.rows[1].cells[1].row_span, 0);
                assert_eq!(table.rows[1].cells[1].column_span, 0);
            }
            _ => panic!("Expected table"),
        }

        // Check inverse exists
        match inverse {
            DocOp::SplitCell { .. } => {}
            _ => panic!("Expected SplitCell inverse"),
        }
    }

    #[test]
    fn test_split_cell_vertical() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // First merge cells horizontally
        let merge_op = DocOp::MergeCells {
            table: 0,
            r1: 0,
            c1: 0,
            r2: 0,
            c2: 2,
        };
        model.apply(&merge_op).unwrap();

        // Now split the first cell vertically
        let split_op = DocOp::SplitCell {
            table: 0,
            row: 0,
            col: 0,
            horizontal: false,
        };
        let result = model.apply(&split_op);

        assert!(result.is_ok(), "Split should succeed");

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                // After split, the first row should have more cells
                assert!(
                    table.rows[0].cells.len() > 3,
                    "Should have more than 3 cells after split"
                );
                // First cell should have column_span=1
                assert_eq!(table.rows[0].cells[0].column_span, 1);
            }
            _ => panic!("Expected table"),
        }
    }

    #[test]
    fn test_split_cell_horizontal() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // First merge cells vertically
        let merge_op = DocOp::MergeCells {
            table: 0,
            r1: 0,
            c1: 0,
            r2: 2,
            c2: 0,
        };
        model.apply(&merge_op).unwrap();

        // Now split the first cell horizontally
        let split_op = DocOp::SplitCell {
            table: 0,
            row: 0,
            col: 0,
            horizontal: true,
        };
        let result = model.apply(&split_op);

        assert!(result.is_ok(), "Split should succeed");

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                // After split, we should still have 3 rows (same as before merge)
                assert_eq!(table.rows.len(), 3);
                // First cell should have row_span=1
                assert_eq!(table.rows[0].cells[0].row_span, 1);
                // All cells in column 0 should have row_span=1
                for r in 0..3 {
                    if r < table.rows.len() && 0 < table.rows[r].cells.len() {
                        assert_eq!(
                            table.rows[r].cells[0].row_span, 1,
                            "Row {} col 0 should have row_span=1",
                            r
                        );
                    }
                }
            }
            _ => panic!("Expected table"),
        }
    }

    #[test]
    fn test_set_cell_shading() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        let old_shading = "000000".to_string();

        // First set shading
        let op1 = DocOp::SetCellShading {
            table: 0,
            row: 0,
            col: 0,
            hex: old_shading.clone(),
        };
        model.apply(&op1).unwrap();

        // Now change it
        let new_shading = "FF0000".to_string();
        let op2 = DocOp::SetCellShading {
            table: 0,
            row: 0,
            col: 0,
            hex: new_shading.clone(),
        };
        let inverse = model.apply(&op2).unwrap();

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                assert_eq!(table.rows[0].cells[0].shading, Some(new_shading));
            }
            _ => panic!("Expected table"),
        }

        // Check inverse
        if let DocOp::SetCellShading {
            table: _,
            row: _,
            col: _,
            hex: h,
        } = inverse
        {
            assert_eq!(h, old_shading);
        } else {
            panic!("Expected SetCellShading inverse");
        }
    }

    #[test]
    fn test_merge_split_roundtrip() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // Merge cells
        let merge_op = DocOp::MergeCells {
            table: 0,
            r1: 0,
            c1: 0,
            r2: 1,
            c2: 1,
        };
        let _inverse_merge = model.apply(&merge_op).unwrap();

        // Split the merged cell vertically first
        let split_op1 = DocOp::SplitCell {
            table: 0,
            row: 0,
            col: 0,
            horizontal: false,
        };
        model.apply(&split_op1).unwrap();

        // Split the first cell horizontally
        let split_op2 = DocOp::SplitCell {
            table: 0,
            row: 0,
            col: 0,
            horizontal: true,
        };
        let result = model.apply(&split_op2);

        // The split should succeed
        assert!(result.is_ok(), "Merge-split roundtrip failed");

        // After split, cells should be back to original state
        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                // All cells should have row_span <= 1 and column_span <= 1
                for row_idx in 0..2 {
                    for col_idx in 0..2 {
                        if row_idx < table.rows.len() && col_idx < table.rows[row_idx].cells.len() {
                            let cell = &table.rows[row_idx].cells[col_idx];
                            assert!(
                                cell.row_span <= 1,
                                "Cell at ({},{}) still has row_span > 1",
                                row_idx,
                                col_idx
                            );
                            assert!(
                                cell.column_span <= 1,
                                "Cell at ({},{}) still has column_span > 1",
                                row_idx,
                                col_idx
                            );
                            if row_idx == 0 && col_idx == 0 {
                                // The original content should be preserved
                                assert!(
                                    !cell.paragraphs.is_empty(),
                                    "Cell (0,0) should have content"
                                );
                            }
                        }
                    }
                }
            }
            _ => panic!("Expected table"),
        }
    }

    #[test]
    fn test_insert_row_at_end() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // Insert after the last row
        let op = DocOp::InsertTableRow {
            table: 0,
            after_row: 2,
        };
        let inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                assert_eq!(table.rows.len(), 4);
            }
            _ => panic!("Expected table"),
        }

        if let DocOp::DeleteTableRow { table: _, row: r } = inverse {
            assert_eq!(r, 3);
        } else {
            panic!("Expected DeleteTableRow inverse");
        }
    }

    #[test]
    fn test_delete_first_row() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // Delete first row
        let op = DocOp::DeleteTableRow { table: 0, row: 0 };
        let inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                assert_eq!(table.rows.len(), 2);
            }
            _ => panic!("Expected table"),
        }

        if let DocOp::InsertTableRow {
            table: _,
            after_row: r,
        } = inverse
        {
            // Should insert after row 0 (which is now the first row after deletion)
            assert_eq!(r, 0);
        } else {
            panic!("Expected InsertTableRow inverse");
        }
    }

    #[test]
    fn test_cannot_delete_only_column() {
        let mut body = DocxBody::new();
        body.push_table(DocxTable {
            rows: vec![DocxTableRow {
                cells: vec![DocxTableCell {
                    paragraphs: vec![],
                    column_span: 1,
                    row_span: 1,
                    width: None,
                    shading: None,
                }],
                height: None,
                is_header: false,
            }],
            properties: wo_ooxml::model::DocxTableProperties::default(),
        });

        let mut model = DocModel { body: &mut body };

        let op = DocOp::DeleteTableColumn { table: 0, col: 0 };
        let result = model.apply(&op);

        assert!(result.is_err(), "Should not be able to delete only column");
    }

    #[test]
    fn test_cannot_delete_only_row() {
        let mut body = DocxBody::new();
        body.push_table(DocxTable {
            rows: vec![DocxTableRow {
                cells: vec![DocxTableCell {
                    paragraphs: vec![],
                    column_span: 1,
                    row_span: 1,
                    width: None,
                    shading: None,
                }],
                height: None,
                is_header: false,
            }],
            properties: wo_ooxml::model::DocxTableProperties::default(),
        });

        let mut model = DocModel { body: &mut body };

        let op = DocOp::DeleteTableRow { table: 0, row: 0 };
        let result = model.apply(&op);

        assert!(result.is_err(), "Should not be able to delete only row");
    }

    #[test]
    fn test_cannot_split_unmerged_cell() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // Try to split a cell that's not merged
        let op = DocOp::SplitCell {
            table: 0,
            row: 0,
            col: 0,
            horizontal: false,
        };
        let result = model.apply(&op);

        assert!(result.is_err(), "Should not be able to split unmerged cell");
    }

    #[test]
    fn test_merge_single_cell() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // Merge a single cell (should just set spans to 1,1)
        let op = DocOp::MergeCells {
            table: 0,
            r1: 0,
            c1: 0,
            r2: 0,
            c2: 0,
        };
        let result = model.apply(&op);

        assert!(result.is_ok(), "Should be able to merge single cell");

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                assert_eq!(table.rows[0].cells[0].row_span, 1);
                assert_eq!(table.rows[0].cells[0].column_span, 1);
            }
            _ => panic!("Expected table"),
        }
    }

    #[test]
    fn test_insert_column_at_end() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // Insert after the last column
        let op = DocOp::InsertTableColumn {
            table: 0,
            after_col: 2,
        };
        let inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                for row in &table.rows {
                    assert_eq!(row.cells.len(), 4);
                }
            }
            _ => panic!("Expected table"),
        }

        if let DocOp::DeleteTableColumn { table: _, col: c } = inverse {
            assert_eq!(c, 3);
        } else {
            panic!("Expected DeleteTableColumn inverse");
        }
    }

    #[test]
    fn test_delete_last_column() {
        let mut body = create_test_body();
        let mut model = DocModel { body: &mut body };

        // Delete last column
        let op = DocOp::DeleteTableColumn { table: 0, col: 2 };
        let inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Table(table) => {
                for row in &table.rows {
                    assert_eq!(row.cells.len(), 2);
                }
            }
            _ => panic!("Expected table"),
        }

        if let DocOp::InsertTableColumn {
            table: _,
            after_col: c,
        } = inverse
        {
            assert_eq!(c, 1);
        } else {
            panic!("Expected InsertTableColumn inverse");
        }
    }
}
