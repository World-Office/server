//! ODS export functionality for wo-sheet Workbook model.
//!
//! Provides conversion from wo-sheet Workbook to ODF Spreadsheet format,
//! producing valid .ods byte blobs.

use anyhow::Result;

use wo_odf::model::{
    CellType, OdfContent, OdfDocument, OdfManifestEntry, OdfMetadata, OdfType,
    SpreadsheetCell, SpreadsheetRow, SpreadsheetSheet,
};
use wo_odf::OdfSerializer;

use crate::model::{Cell, Workbook};

/// Export a Workbook to ODS format bytes.
///
/// Converts the wo-sheet Workbook model into an ODF Spreadsheet document
/// and serializes it to a valid .ods file (ZIP archive with content.xml, etc.).
///
/// # Arguments
///
/// * `workbook` - The Workbook to export
///
/// # Returns
///
/// A Result containing the ODS file bytes, or an error if serialization fails.
///
/// # Example
///
/// ```ignore
/// use wo_sheet::{Workbook, Sheet, Cell};
///
/// let mut wb = Workbook::new();
/// let mut sheet = Sheet::new("Sheet1");
/// sheet.set_cell(0, 0, Cell::with_text("Hello"));
/// wb.add_sheet(sheet);
///
/// let ods_bytes = export_ods(&wb)?;
/// std::fs::write("output.ods", ods_bytes)?;
/// ```
pub fn export_ods(workbook: &Workbook) -> Result<Vec<u8>> {
    let odf_doc = build_odf_document(workbook);
    let serializer = OdfSerializer::new();
    serializer.serialize(&odf_doc)
}

/// Build an OdfDocument from a Workbook.
///
/// Maps wo-sheet Sheet structures to ODF SpreadsheetSheet structures,
/// preserving cell values (text, numbers, formulas) and their types.
fn build_odf_document(workbook: &Workbook) -> OdfDocument {
    let sheets = convert_sheets(&workbook.sheets);

    let manifest = build_manifest();

    OdfDocument {
        doc_type: OdfType::Spreadsheet,
        version: "1.2".to_string(),
        metadata: OdfMetadata::default(),
        content: OdfContent::Spreadsheet { sheets },
        manifest,
        fonts: vec![],
        styles: vec![],
    }
}

/// Convert wo-sheet Sheets to ODF SpreadsheetSheet structures.
fn convert_sheets(sheets: &[crate::model::Sheet]) -> Vec<SpreadsheetSheet> {
    sheets
        .iter()
        .map(|sheet| {
            let rows = convert_sheet_to_rows(sheet);
            let max_column = find_max_column(sheet);

            SpreadsheetSheet {
                name: sheet.name.clone(),
                rows,
                max_column,
            }
        })
        .collect()
}

/// Convert a single Sheet to ODF rows.
fn convert_sheet_to_rows(sheet: &crate::model::Sheet) -> Vec<SpreadsheetRow> {
    use std::collections::BTreeSet;

    // Collect all unique row indices from the cell grid
    let row_indices: BTreeSet<u32> = sheet
        .cells
        .keys()
        .map(|&(row, _col)| row)
        .collect();

    let mut rows = Vec::new();

    for &row_num in &row_indices {
        // Get all cells for this row
        let row_cells: Vec<_> = sheet
            .cells
            .iter()
            .filter(|((r, _), _)| *r == row_num)
            .map(|(&(_, col), cell)| (col, cell))
            .collect();

        let odf_cells = row_cells
            .into_iter()
            .map(|(col, cell)| convert_cell(row_num, col, cell))
            .collect();

        rows.push(SpreadsheetRow {
            row_num,
            cells: odf_cells,
        });
    }

    // Sort rows by row_num
    rows.sort_by(|a, b| a.row_num.cmp(&b.row_num));
    rows
}

/// Find the maximum column index in a sheet.
fn find_max_column(sheet: &crate::model::Sheet) -> usize {
    sheet
        .cells
        .keys()
        .map(|&(_, col)| col as usize)
        .max()
        .map(|c| c + 1) // Convert from 0-indexed to count
        .unwrap_or(0)
}

/// Convert a wo-sheet Cell to an ODF SpreadsheetCell.
fn convert_cell(row: u32, col: u32, cell: &Cell) -> SpreadsheetCell {
    match &cell.value {
        wo_formula::ast::CellValue::Empty => SpreadsheetCell {
            row,
            column: col,
            text: cell.raw.clone(),
            value: None,
            formula: cell.formula.as_ref().map(|f| f.to_string()),
            cell_type: CellType::String,
        },
        wo_formula::ast::CellValue::Num(n) => SpreadsheetCell {
            row,
            column: col,
            text: n.to_string(),
            value: Some(*n),
            formula: cell.formula.as_ref().map(|f| f.to_string()),
            // ODS emits table:formula on string-typed cells; a cached numeric
            // value with a live formula must not drop the formula.
            cell_type: if cell.formula.is_some() {
                CellType::String
            } else {
                CellType::Number
            },
        },
        wo_formula::ast::CellValue::Text(s) => {
            // Check if this is actually a formula result
            if cell.formula.is_some() {
                SpreadsheetCell {
                    row,
                    column: col,
                    text: s.clone(),
                    value: None,
                    formula: cell.formula.as_ref().map(|f| f.to_string()),
                    cell_type: CellType::String,
                }
            } else {
                SpreadsheetCell {
                    row,
                    column: col,
                    text: s.clone(),
                    value: None,
                    formula: None,
                    cell_type: CellType::String,
                }
            }
        }
        wo_formula::ast::CellValue::Bool(b) => SpreadsheetCell {
            row,
            column: col,
            text: b.to_string(),
            value: Some(if *b { 1.0 } else { 0.0 }),
            formula: cell.formula.as_ref().map(|f| f.to_string()),
            cell_type: CellType::Boolean,
        },
        wo_formula::ast::CellValue::Err(_) => SpreadsheetCell {
            row,
            column: col,
            text: "#ERROR!".to_string(),
            value: None,
            formula: cell.formula.as_ref().map(|f| f.to_string()),
            cell_type: CellType::String,
        },
        wo_formula::ast::CellValue::Date(dt) => SpreadsheetCell {
            row,
            column: col,
            text: dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
            value: None,
            formula: cell.formula.as_ref().map(|f| f.to_string()),
            cell_type: CellType::Date,
        },
    }
}

/// Build a manifest for the ODF document.
fn build_manifest() -> Vec<OdfManifestEntry> {
    let mut entries = vec![
        OdfManifestEntry {
            path: "/".to_string(),
            media_type: None,
            full_path: Some("/".to_string()),
            version: Some("1.2".to_string()),
        },
        OdfManifestEntry {
            path: "content.xml".to_string(),
            media_type: Some("text/xml".to_string()),
            full_path: Some("content.xml".to_string()),
            version: None,
        },
        OdfManifestEntry {
            path: "styles.xml".to_string(),
            media_type: Some("text/xml".to_string()),
            full_path: Some("styles.xml".to_string()),
            version: None,
        },
        OdfManifestEntry {
            path: "meta.xml".to_string(),
            media_type: Some("text/xml".to_string()),
            full_path: Some("meta.xml".to_string()),
            version: None,
        },
        OdfManifestEntry {
            path: "META-INF/".to_string(),
            media_type: None,
            full_path: Some("META-INF/".to_string()),
            version: None,
        },
        OdfManifestEntry {
            path: "META-INF/manifest.xml".to_string(),
            media_type: Some("text/xml".to_string()),
            full_path: Some("META-INF/manifest.xml".to_string()),
            version: None,
        },
    ];

    // Add mimetype entry
    entries.insert(
        0,
        OdfManifestEntry {
            path: "mimetype".to_string(),
            media_type: Some("application/vnd.oasis.opendocument.spreadsheet".to_string()),
            full_path: Some("mimetype".to_string()),
            version: None,
        },
    );

    entries
}

#[cfg(test)]
mod tests {
    use super::*;
    use wo_formula::ast::Expr;

    #[test]
    fn test_export_empty_workbook() -> Result<()> {
        let wb = Workbook::new();
        let bytes = export_ods(&wb)?;

        // Verify it's a valid ZIP
        use zip::ZipArchive;
        let cursor = std::io::Cursor::new(&bytes);
        let mut archive = ZipArchive::new(cursor)?;

        // Check for required ODS files
        assert!(archive.by_name("mimetype").is_ok());
        assert!(archive.by_name("content.xml").is_ok());
        assert!(archive.by_name("META-INF/manifest.xml").is_ok());

        // Verify mimetype
        let mut mimetype = archive.by_name("mimetype")?;
        let mut buf = String::new();
        std::io::Read::read_to_string(&mut mimetype, &mut buf)?;
        assert_eq!(
            buf.trim(),
            "application/vnd.oasis.opendocument.spreadsheet"
        );

        Ok(())
    }

    #[test]
    fn test_export_workbook_with_data() -> Result<()> {
        use crate::model::{Cell, Sheet};

        let mut wb = Workbook::new();

        // Sheet 1: Text and numbers
        let mut sheet1 = Sheet::new("Sheet1");
        sheet1.cells.insert(
            (0, 0),
            Cell::with_text("Hello World"),
        );
        sheet1.cells.insert(
            (0, 1),
            Cell::with_num(42.5),
        );
        sheet1.cells.insert(
            (1, 0),
            Cell::with_num(100.0),
        );
        wb.add_sheet(sheet1);

        // Sheet 2: More data
        let mut sheet2 = Sheet::new("Data");
        sheet2.cells.insert(
            (0, 0),
            Cell::with_text("Test"),
        );
        wb.add_sheet(sheet2);

        let bytes = export_ods(&wb)?;

        // Verify it's a valid ZIP with content
        use zip::ZipArchive;
        use std::io::Read;

        let cursor = std::io::Cursor::new(&bytes);
        let mut archive = ZipArchive::new(cursor)?;

        // Check mimetype (scoped so the archive borrow ends before content.xml)
        let mime_buf = {
            let mut mimetype = archive.by_name("mimetype")?;
            let mut mime_buf = String::new();
            mimetype.read_to_string(&mut mime_buf)?;
            mime_buf
        };
        assert_eq!(
            mime_buf.trim(),
            "application/vnd.oasis.opendocument.spreadsheet"
        );

        // Check content.xml contains table:table entries
        let mut content = archive.by_name("content.xml")?;
        let mut content_buf = String::new();
        content.read_to_string(&mut content_buf)?;

        assert!(content_buf.contains("table:table"), "Expected table:table in content.xml");
        assert!(content_buf.contains("Sheet1"), "Expected Sheet1 in content.xml");
        assert!(content_buf.contains("Data"), "Expected Data in content.xml");
        assert!(content_buf.contains("Hello World"), "Expected cell text in content.xml");
        assert!(content_buf.contains("42.5"), "Expected numeric value in content.xml");

        Ok(())
    }

    #[test]
    fn test_export_with_formula() -> Result<()> {
        use crate::model::{Cell, Sheet};
        use wo_formula::parser::parse;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Formulas");

        // Parse a simple formula
        let formula = parse("=1+1").unwrap_or_else(|_| Expr::Num(2.0));
        sheet.cells.insert(
            (0, 0),
            Cell::with_formula("=1+1", formula, wo_formula::ast::CellValue::Num(2.0)),
        );

        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;

        // Verify content.xml contains the formula
        use zip::ZipArchive;
        use std::io::Read;

        let cursor = std::io::Cursor::new(&bytes);
        let mut archive = ZipArchive::new(cursor)?;
        let mut content = archive.by_name("content.xml")?;
        let mut content_buf = String::new();
        content.read_to_string(&mut content_buf)?;

        assert!(content_buf.contains("table:formula"), "Expected formula attribute in content.xml");

        Ok(())
    }

    // Round-trip test tagged F-210
    #[test]
    fn test_ods_roundtrip_f210() -> Result<()> {
        // Feature F-210: Test ODS export round-trip with text+number+formula cells
        use crate::model::{Cell, Sheet};
        use wo_formula::parser::parse;

        let mut wb = Workbook::new();

        // Sheet 1: Mixed content
        let mut sheet1 = Sheet::new("TestSheet");
        sheet1.cells.insert((0, 0), Cell::with_text("Text Cell"));
        sheet1.cells.insert((0, 1), Cell::with_num(123.45));
        
        // Add a formula cell
        let formula = parse("=A1+B1").unwrap_or_else(|_| Expr::Num(0.0));
        sheet1.cells.insert(
            (0, 2),
            Cell::with_formula("=A1+B1", formula, wo_formula::ast::CellValue::Num(0.0)),
        );
        
        sheet1.cells.insert((1, 0), Cell::with_bool(true));
        wb.add_sheet(sheet1);

        // Sheet 2: More data
        let mut sheet2 = Sheet::new("SecondSheet");
        sheet2.cells.insert((0, 0), Cell::with_num(999.99));
        sheet2.cells.insert((1, 1), Cell::with_text("Another cell"));
        wb.add_sheet(sheet2);

        // Export to ODS
        let ods_bytes = export_ods(&wb)?;

        // Verify it's a valid ODS file
        use zip::ZipArchive;
        use std::io::Read;

        let cursor = std::io::Cursor::new(&ods_bytes);
        let mut archive = ZipArchive::new(cursor)?;

        // Check mimetype (scoped so the archive borrow ends before content.xml)
        let mime_buf = {
            let mut mimetype = archive.by_name("mimetype")?;
            let mut mime_buf = String::new();
            mimetype.read_to_string(&mut mime_buf)?;
            mime_buf
        };
        assert_eq!(
            mime_buf.trim(),
            "application/vnd.oasis.opendocument.spreadsheet",
            "mimetype should be application/vnd.oasis.opendocument.spreadsheet"
        );

        // Check content.xml contains our data
        let mut content = archive.by_name("content.xml")?;
        let mut content_buf = String::new();
        content.read_to_string(&mut content_buf)?;

        // Verify table:table entries exist
        assert!(
            content_buf.contains("table:table"),
            "content.xml should contain table:table"
        );
        assert!(
            content_buf.contains("TestSheet"),
            "content.xml should contain TestSheet"
        );
        assert!(
            content_buf.contains("SecondSheet"),
            "content.xml should contain SecondSheet"
        );
        
        // Verify values are present
        assert!(
            content_buf.contains("Text Cell"),
            "content.xml should contain 'Text Cell'"
        );
        assert!(
            content_buf.contains("123.45"),
            "content.xml should contain 123.45"
        );
        assert!(
            content_buf.contains("999.99"),
            "content.xml should contain 999.99"
        );
        assert!(
            content_buf.contains("Another cell"),
            "content.xml should contain 'Another cell'"
        );
        
        // Verify formula is present
        assert!(
            content_buf.contains("table:formula"),
            "content.xml should contain table:formula"
        );

        // Parse back with wo-odf parser to verify it's parseable
        use wo_odf::OdfParser;
        let parser = OdfParser::new();
        let parsed_doc = parser.parse(&ods_bytes)?;
        
        assert_eq!(parsed_doc.doc_type, OdfType::Spreadsheet);
        
        if let OdfContent::Spreadsheet { sheets } = &parsed_doc.content {
            assert_eq!(sheets.len(), 2, "Should have 2 sheets");
            assert_eq!(sheets[0].name, "TestSheet");
            assert_eq!(sheets[1].name, "SecondSheet");
            
            // Check that TestSheet has cells
            let test_sheet = &sheets[0];
            assert!(!test_sheet.rows.is_empty(), "TestSheet should have rows");
            
            // Verify at least one row has cells
            let has_cells = test_sheet.rows.iter().any(|r| !r.cells.is_empty());
            assert!(has_cells, "TestSheet should have cells in at least one row");
        } else {
            panic!("Expected Spreadsheet content type");
        }

        Ok(())
    }
}
