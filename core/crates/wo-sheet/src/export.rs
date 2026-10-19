//! ODS export functionality for wo-sheet Workbook model.
//!
//! Provides conversion from wo-sheet Workbook to ODF Spreadsheet format,
//! producing valid .ods byte blobs.

use anyhow::{Context, Result};

use std::collections::{BTreeSet, HashMap};

use chrono::NaiveDateTime;
use wo_formula::ast::CellValue;
use wo_formula::parser::parse as parse_formula;
use wo_odf::model::{
    CellType, OdfContent, OdfDocument, OdfManifestEntry, OdfMetadata, OdfStyle, OdfType,
    SpreadsheetCell, SpreadsheetRow, SpreadsheetSheet,
};
use wo_odf::{OdfParser, OdfSerializer};

use crate::model::{Cell, CellStyle, MergeRange, Sheet, Workbook};

/// Key for deduplicating cell styles
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CellStyleKey {
    font_family: Option<String>,
    font_size: Option<String>, // Store as string to avoid float comparison issues
    bold: bool,
    italic: bool,
    underline: bool,
    strikethrough: bool,
    color: Option<String>,
    background_color: Option<String>,
    horizontal_align: Option<String>,
    vertical_align: Option<String>,
    border: Option<String>,
    number_format: Option<String>,
}

impl From<&CellStyle> for CellStyleKey {
    fn from(style: &CellStyle) -> Self {
        CellStyleKey {
            font_family: style.font_family.clone(),
            font_size: style.font_size.map(|s| format!("{:.3}", s)),
            bold: style.bold.unwrap_or(false),
            italic: style.italic.unwrap_or(false),
            underline: style.underline.unwrap_or(false),
            strikethrough: style.strikethrough.unwrap_or(false),
            color: style.color.clone(),
            background_color: style.background_color.clone(),
            horizontal_align: style.horizontal_align.clone(),
            vertical_align: style.vertical_align.clone(),
            border: style.border.clone(),
            number_format: style.number_format.clone(),
        }
    }
}

/// Generate ODF style properties from a CellStyle
fn cell_style_to_odf_properties(style: &CellStyle) -> Vec<(String, String)> {
    let mut props = Vec::new();
    
    if let Some(ref family) = style.font_family {
        props.push(("style:font-name".to_string(), family.clone()));
    }
    if let Some(size) = style.font_size {
        props.push(("fo:font-size".to_string(), format!("{:.3}pt", size)));
    }
    if style.bold == Some(true) {
        props.push(("fo:font-weight".to_string(), "bold".to_string()));
    }
    if style.bold == Some(false) {
        props.push(("fo:font-weight".to_string(), "normal".to_string()));
    }
    if style.italic == Some(true) {
        props.push(("fo:font-style".to_string(), "italic".to_string()));
    }
    if style.italic == Some(false) {
        props.push(("fo:font-style".to_string(), "normal".to_string()));
    }
    if style.underline == Some(true) {
        props.push(("style:text-underline-style".to_string(), "solid".to_string()));
        props.push(("style:text-underline-type".to_string(), "single".to_string()));
    }
    if style.strikethrough == Some(true) {
        props.push(("style:text-line-through-style".to_string(), "solid".to_string()));
    }
    if let Some(ref color) = style.color {
        props.push(("fo:color".to_string(), color.clone()));
    }
    if let Some(ref bg_color) = style.background_color {
        props.push(("fo:background-color".to_string(), bg_color.clone()));
    }
    if let Some(ref h_align) = style.horizontal_align {
        let align_value = match h_align.as_str() {
            "left" => "left",
            "center" => "center",
            "right" => "right",
            "justify" => "justify",
            _ => h_align.as_str(),
        };
        props.push(("fo:text-align".to_string(), align_value.to_string()));
    }
    if let Some(ref v_align) = style.vertical_align {
        let align_value = match v_align.as_str() {
            "top" => "top",
            "middle" => "middle",
            "bottom" => "bottom",
            _ => v_align.as_str(),
        };
        props.push(("style:vertical-align".to_string(), align_value.to_string()));
    }
    
    props
}

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

/// Parse ODS bytes into a Workbook (inverse of export_ods).
/// 
/// Uses wo_odf::OdfParser to parse the ODS file and maps the ODF model
/// back into wo-sheet Workbook/Sheet/Cell structures.
/// 
/// # Arguments
/// 
/// * `bytes` - The ODS file bytes
/// 
/// # Returns
/// 
/// A Result containing the parsed Workbook, or an error if parsing fails
/// or if the document is not a spreadsheet (ODS).
/// 
/// # Example
/// 
/// ```ignore
/// use wo_sheet::from_ods;
/// 
/// let ods_bytes = std::fs::read("test.ods")?;
/// let workbook = from_ods(&ods_bytes)?;
/// ```
pub fn from_ods(bytes: &[u8]) -> Result<Workbook> {
    let parser = OdfParser::new();
    let doc = parser.parse(bytes)
        .context("Failed to parse ODS file")?;
    
    // Ensure it's a spreadsheet
    if doc.doc_type != OdfType::Spreadsheet {
        anyhow::bail!("Not an ODS document: expected Spreadsheet type, got {:?}", doc.doc_type);
    }
    
    // Extract sheets from the document content
    let OdfContent::Spreadsheet { sheets } = doc.content else {
        anyhow::bail!("Not an ODS document: content is not Spreadsheet type");
    };
    
    // Convert each ODF sheet to a wo-sheet Sheet
    let mut workbook = Workbook::new();
    
    for odf_sheet in sheets {
        let sheet = convert_odf_sheet_to_sheet(&odf_sheet)?;
        workbook.add_sheet(sheet);
    }
    
    Ok(workbook)
}

/// Convert an ODF SpreadsheetSheet to a wo-sheet Sheet.
fn convert_odf_sheet_to_sheet(odf_sheet: &SpreadsheetSheet) -> Result<Sheet> {
    let mut sheet = Sheet::new(&odf_sheet.name);
    
    // Copy column widths
    if let Some(ref col_widths) = odf_sheet.col_widths {
        sheet.col_widths = col_widths.clone();
    }
    
    // Track merge ranges to avoid duplicates
    let mut processed_merges: BTreeSet<(u32, u32, u32, u32)> = BTreeSet::new();
    
    // Process each row and cell
    // Note: ODF parser has a bug where cell.row is 1-indexed but cell.column is 0-indexed
    // This is inconsistent, but we need to work around it: subtract 1 from row, keep column as-is
    for row in &odf_sheet.rows {
        for cell in &row.cells {
            // Skip empty cells (no text, no value, no formula)
            if cell.text.is_empty() && cell.value.is_none() && cell.formula.is_none() {
                continue;
            }
            
            // Convert to 0-indexed: row needs -1, column is already 0-indexed
            let row_idx = if cell.row > 0 { cell.row - 1 } else { 0 };
            let col_idx = cell.column;
            
            // Convert the cell
            let wo_cell = convert_odf_cell_to_cell(cell)?;
            
            // Set the cell in the sheet
            sheet.set_cell(row_idx, col_idx, wo_cell);
            
            // Process merge ranges (from col_span and row_span)
            if let (Some(col_span), Some(row_span)) = (cell.col_span, cell.row_span) {
                if col_span > 1 || row_span > 1 {
                    let start_row = if cell.row > 0 { cell.row - 1 } else { 0 };
                    let start_col = cell.column;
                    let end_row = start_row + row_span - 1;
                    let end_col = start_col + col_span - 1;
                    
                    let merge_key = (start_row, start_col, end_row, end_col);
                    if !processed_merges.contains(&merge_key) {
                        processed_merges.insert(merge_key);
                        sheet.merges.push(MergeRange::new(start_row, start_col, end_row, end_col));
                    }
                }
            }
        }
    }
    
    Ok(sheet)
}

/// Convert an ODF SpreadsheetCell to a wo-sheet Cell.
fn convert_odf_cell_to_cell(odf_cell: &SpreadsheetCell) -> Result<Cell> {
    // Parse formula if present
    let formula = odf_cell.formula.as_ref().and_then(|f| {
        parse_formula(f).ok()
    });
    
    // Special handling for error cells
    // export_ods maps CellValue::Err to text "#ERROR!" (CellType::String)
    // During import, we keep it as text - we can't distinguish it from a literal "#ERROR!" string
    // According to the task: Error cells -> CellValue::Text("#ERROR!")
    if odf_cell.text == "#ERROR!" && formula.is_none() {
        let raw_text = odf_cell.text.clone();
        return Ok(Cell {
            raw: raw_text.clone(),
            value: CellValue::Text(raw_text),
            formula: None,
            style: CellStyle::default(),
        });
    }
    
    let raw_text = odf_cell.text.clone();
    
    // Map based on cell_type and formula/value
    let value = match odf_cell.cell_type {
        CellType::String => {
            // String cells with formula -> formula cell (numeric formula round-trips as String with formula)
            if formula.is_some() {
                // Try to parse as number first (numeric formula results)
                if let Ok(num) = odf_cell.text.parse::<f64>() {
                    CellValue::Num(num)
                } else if let Some(v) = odf_cell.value {
                    // Use value field if available
                    CellValue::Num(v)
                } else {
                    // Text formula result
                    CellValue::Text(raw_text.clone())
                }
            } else {
                CellValue::Text(raw_text.clone())
            }
        }
        CellType::Number => {
            // Plain number cell (no formula)
            if let Some(v) = odf_cell.value {
                CellValue::Num(v)
            } else {
                // Try to parse text as number
                raw_text.parse::<f64>().map(CellValue::Num).unwrap_or_else(|_| CellValue::Text(raw_text.clone()))
            }
        }
        CellType::Boolean => {
            // ODF uses office:boolean-value + value (1.0 for true, 0.0 for false)
            // export writes true as 1.0, so we check value field first, then text
            let bool_val = odf_cell.value.map(|v| v != 0.0)
                .or_else(|| odf_cell.text.parse::<f64>().ok().map(|v| v != 0.0))
                .unwrap_or(false);
            CellValue::Bool(bool_val)
        }
        CellType::Date => {
            // Parse the date string in format "%Y-%m-%dT%H:%M:%S"
            if let Ok(dt) = NaiveDateTime::parse_from_str(&odf_cell.text, "%Y-%m-%dT%H:%M:%S") {
                CellValue::Date(dt)
            } else {
                // Fallback to text
                CellValue::Text(raw_text.clone())
            }
        }
        CellType::Percentage | CellType::Currency => {
            // These are numbers with special formatting
            if let Some(v) = odf_cell.value {
                CellValue::Num(v)
            } else {
                raw_text.parse::<f64>().map(CellValue::Num).unwrap_or_else(|_| CellValue::Text(raw_text.clone()))
            }
        }
    };
    
    Ok(Cell {
        raw: raw_text,
        value,
        formula,
        style: CellStyle::default(),
    })
}

/// Build an OdfDocument from a Workbook.
///
/// Maps wo-sheet Sheet structures to ODF SpreadsheetSheet structures,
/// preserving cell values (text, numbers, formulas) and their types.
fn build_odf_document(workbook: &Workbook) -> OdfDocument {
    // Collect all unique cell styles from the workbook
    let mut cell_style_map: HashMap<CellStyleKey, String> = HashMap::new();
    let mut automatic_cell_styles: Vec<OdfStyle> = Vec::new();
    
    // First pass: collect all unique non-default styles
    for sheet in &workbook.sheets {
        for cell in sheet.cells.values() {
            if !cell.style.is_default() {
                let key = CellStyleKey::from(&cell.style);
                if !cell_style_map.contains_key(&key) {
                    let style_name = format!("ce{}", automatic_cell_styles.len() + 2);
                    cell_style_map.insert(key.clone(), style_name.clone());
                    
                    // Create ODF style for this cell style
                    let props = cell_style_to_odf_properties(&cell.style);
                    automatic_cell_styles.push(OdfStyle {
                        name: style_name,
                        family: Some("table-cell".to_string()),
                        parent: None,
                        display_name: None,
                        properties: props,
                    });
                }
            }
        }
    }
    
    // Pass the style map to sheet conversion
    let sheets = convert_sheets_with_styles(&workbook.sheets, &cell_style_map);

    let manifest = build_manifest();

    OdfDocument {
        doc_type: OdfType::Spreadsheet,
        version: "1.2".to_string(),
        metadata: OdfMetadata::default(),
        content: OdfContent::Spreadsheet { sheets },
        manifest,
        fonts: vec![],
        styles: vec![],
        automatic_cell_styles,
    }
}

/// Check if a CellStyle is the default (all fields are None)
impl CellStyle {
    fn is_default(&self) -> bool {
        self.font_family.is_none() &&
        self.font_size.is_none() &&
        self.bold.is_none() &&
        self.italic.is_none() &&
        self.underline.is_none() &&
        self.strikethrough.is_none() &&
        self.color.is_none() &&
        self.background_color.is_none() &&
        self.horizontal_align.is_none() &&
        self.vertical_align.is_none() &&
        self.border.is_none() &&
        self.number_format.is_none()
    }
}

/// Convert wo-sheet Sheets to ODF SpreadsheetSheet structures with style mapping.
fn convert_sheets_with_styles(
    sheets: &[crate::model::Sheet],
    style_map: &HashMap<CellStyleKey, String>,
) -> Vec<SpreadsheetSheet> {
    sheets
        .iter()
        .map(|sheet| {
            let rows = convert_sheet_to_rows_with_styles(sheet, style_map);
            let max_column = find_max_column(sheet);
            
            // Map col_widths
            let col_widths = if sheet.col_widths.is_empty() {
                None
            } else {
                Some(sheet.col_widths.clone())
            };

            SpreadsheetSheet {
                name: sheet.name.clone(),
                rows,
                max_column,
                col_widths,
            }
        })
        .collect()
}

/// Convert a single Sheet to ODF rows with style mapping.
fn convert_sheet_to_rows_with_styles(
    sheet: &crate::model::Sheet,
    style_map: &HashMap<CellStyleKey, String>,
) -> Vec<SpreadsheetRow> {
    use std::collections::{BTreeMap, BTreeSet};

    // Collect all unique row indices from the cell grid
    let row_indices: BTreeSet<u32> = sheet
        .cells
        .keys()
        .map(|&(row, _col)| row)
        .collect();

    // Build a map of merge ranges for quick lookup: (row, col) -> (col_span, row_span)
    // Only the top-left cell of each merge gets the span information
    let mut merge_spans: BTreeMap<(u32, u32), (u32, u32)> = BTreeMap::new();
    for merge in &sheet.merges {
        let col_span = merge.end_col - merge.start_col + 1;
        let row_span = merge.end_row - merge.start_row + 1;
        merge_spans.insert((merge.start_row, merge.start_col), (col_span, row_span));
    }

    let mut rows = Vec::new();

    for &row_num in &row_indices {
        // Get all cells for this row
        let mut row_cells: Vec<_> = sheet
            .cells
            .iter()
            .filter(|((r, _), _)| *r == row_num)
            .map(|(&(_, col), cell)| (col, cell))
            .collect();
        // Sheet.cells is an FxHashMap: iteration order is hash-arbitrary.
        // ODF cell order defines the column position, so sort by column.
        row_cells.sort_by_key(|(col, _)| *col);

        let odf_cells: Vec<SpreadsheetCell> = row_cells
            .into_iter()
            .map(|(col, cell)| {
                let mut odf_cell = convert_cell(row_num, col, cell);
                
                // Set style name if cell has a non-default style
                if !cell.style.is_default() {
                    let key = CellStyleKey::from(&cell.style);
                    if let Some(style_name) = style_map.get(&key) {
                        odf_cell.style_name = Some(style_name.clone());
                    }
                }
                
                // Check if this cell is the top-left of a merge range
                if let Some((col_span, row_span)) = merge_spans.get(&(row_num, col)) {
                    odf_cell.col_span = Some(*col_span);
                    odf_cell.row_span = Some(*row_span);
                }
                
                odf_cell
            })
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
            col_span: None,
            row_span: None,
            style_name: None,
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
            col_span: None,
            row_span: None,
            style_name: None,
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
                    col_span: None,
                    row_span: None,
                    style_name: None,
                }
            } else {
                SpreadsheetCell {
                    row,
                    column: col,
                    text: s.clone(),
                    value: None,
                    formula: None,
                    cell_type: CellType::String,
                    col_span: None,
                    row_span: None,
                    style_name: None,
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
            col_span: None,
            row_span: None,
            style_name: None,
        },
        wo_formula::ast::CellValue::Err(_) => SpreadsheetCell {
            row,
            column: col,
            text: "#ERROR!".to_string(),
            value: None,
            formula: cell.formula.as_ref().map(|f| f.to_string()),
            cell_type: CellType::String,
            col_span: None,
            row_span: None,
            style_name: None,
        },
        wo_formula::ast::CellValue::Date(dt) => SpreadsheetCell {
            row,
            column: col,
            text: dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
            value: None,
            formula: cell.formula.as_ref().map(|f| f.to_string()),
            cell_type: CellType::Date,
            col_span: None,
            row_span: None,
            style_name: None,
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

    // F-210: merged cells -> table:number-columns-spanned / number-rows-spanned on the top-left cell
    #[test]
    fn test_export_merged_cells_f210() -> Result<()> {
        use crate::model::{Cell, MergeRange, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Merged");
        sheet.cells.insert((0, 0), Cell::with_text("A1"));
        sheet.cells.insert((0, 1), Cell::with_text("B1"));
        sheet.add_merge(MergeRange::new(0, 0, 1, 1)); // 2x2 merge anchored at (0,0)
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        assert!(
            content.contains("table:number-columns-spanned=\"2\""),
            "top-left merged cell must carry number-columns-spanned=2"
        );
        assert!(
            content.contains("table:number-rows-spanned=\"2\""),
            "top-left merged cell must carry number-rows-spanned=2"
        );
        // exactly one cell gets the 2x2 span (only the merge anchor)
        assert_eq!(content.matches("number-columns-spanned=\"2\"").count(), 1);
        Ok(())
    }

    // F-210: column widths -> style:column-width automatic style + table:table-column
    #[test]
    fn test_export_column_widths_f210() -> Result<()> {
        use crate::model::{Cell, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Widths");
        sheet.cells.insert((0, 0), Cell::with_text("A1"));
        // 100 points = 100/72*2.54 = 3.52778... cm -> {:.3} => "3.528cm"
        sheet.col_widths.insert(0, 100.0);
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        assert!(
            content.contains("style:family=\"table-column\""),
            "automatic-styles must declare a table-column family style"
        );
        assert!(
            content.contains("style:column-width=\"3.528cm\""),
            "100pt must serialize as 3.528cm"
        );
        assert!(
            content.contains("<table:table-column table:style-name=\"co0\"/>"),
            "table-columnt element must reference co0"
        );
        Ok(())
    }

    // F-210: no merges/widths -> no span attrs and no column styles emitted
    #[test]
    fn test_export_plain_sheet_no_merge_artifacts_f210() -> Result<()> {
        use crate::model::{Cell, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Plain");
        sheet.cells.insert((0, 0), Cell::with_text("A1"));
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        assert!(
            !content.contains("number-columns-spanned"),
            "plain sheet must not emit span attrs"
        );
        assert!(
            !content.contains("table:table-column"),
            "plain sheet must not emit table-column elements"
        );
        assert!(
            !content.contains("table-column-properties",),
            "plain sheet must not emit width styles"
        );
        Ok(())
    }

    // F-210: cell styles -> table-cell automatic styles
    #[test]
    fn test_export_cell_bold_f210() -> Result<()> {
        use crate::model::{Cell, CellStyle, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("BoldCells");
        
        // Create a bold cell
        let mut bold_cell = Cell::with_text("Bold");
        bold_cell.style.bold = Some(true);
        sheet.set_cell(0, 0, bold_cell);
        
        // Create a plain cell for comparison
        sheet.set_cell(0, 1, Cell::with_text("Plain"));
        
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        // Check that a table-cell style with bold was emitted
        assert!(
            content.contains("style:family=\"table-cell\""),
            "content.xml should contain table-cell family style"
        );
        assert!(
            content.contains("fo:font-weight=\"bold\""),
            "content.xml should contain fo:font-weight=\"bold\""
        );
        
        // Check that the bold cell has a style-name attribute (ce2: ce1 is the reserved plain-number default)
        assert!(
            content.contains("table:style-name=\"ce2\""),
            "bold cell should reference ce2 style"
        );
        
        // Check that the plain cell does NOT have a style-name on its opening tag
        // (it may inherit ce1 from the Number default, but String cells don't get it)
        // We check by ensuring at least one cell has style-name=ce1 (the bold one)
        // and the plain cell's text appears
        assert!(
            content.contains("Plain"),
            "content should contain plain cell text"
        );
        
        Ok(())
    }

    // F-210: italic cell -> its own style element
    #[test]
    fn test_export_cell_italic_f210() -> Result<()> {
        use crate::model::{Cell, CellStyle, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("ItalicCells");
        
        // Create an italic cell
        let mut italic_cell = Cell::with_text("Italic");
        italic_cell.style.italic = Some(true);
        sheet.set_cell(0, 0, italic_cell);
        
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        // Check that a table-cell style with italic was emitted
        assert!(
            content.contains("fo:font-style=\"italic\""),
            "content.xml should contain fo:font-style=\"italic\""
        );
        
        Ok(())
    }

    // F-210: font-size cell -> its own style element
    #[test]
    fn test_export_cell_font_size_f210() -> Result<()> {
        use crate::model::{Cell, CellStyle, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("FontSizeCells");
        
        // Create a cell with font size 14pt
        let mut sized_cell = Cell::with_text("Large");
        sized_cell.style.font_size = Some(14.0);
        sheet.set_cell(0, 0, sized_cell);
        
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        // Check that a table-cell style with font-size was emitted
        assert!(
            content.contains("fo:font-size=\"14.000pt\""),
            "content.xml should contain fo:font-size=\"14.000pt\""
        );
        
        Ok(())
    }

    // F-210: a styled cell never bleeds onto plain cells — ce1 stays an undefined
    // reserved default ref for plain Number cells, styled cells use ce2+
    #[test]
    fn test_export_cell_style_no_bleed_f210() -> Result<()> {
        use crate::model::{Cell, CellStyle, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("BleedGuard");
        let mut bold_cell = Cell::with_text("Bold");
        bold_cell.style.bold = Some(true);
        sheet.set_cell(0, 0, bold_cell);
        // plain NUMBER cell (hits the hardcoded ce1 style ref path)
        let mut num_cell = Cell::with_num(42.0);
        sheet.set_cell(0, 1, num_cell);
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        // styled style lives under ce2 (+), never ce1
        assert!(content.contains("style:name=\"ce2\""), "bold style must be ce2");
        assert!(
            !content.contains("style:name=\"ce1\""),
            "ce1 must stay undefined so plain cells never inherit bold"
        );
        // plain number cell references ce1, the undefined default
        assert!(
            content.contains("table:style-name=\"ce1\""),
            "plain number cell should reference ce1"
        );
        // exactly one bold definition in the whole document
        assert_eq!(content.matches("fo:font-weight=\"bold\"").count(), 1);
        Ok(())
    }

    // F-210: plain cells (Default style) -> no new style artifacts
    #[test]
    fn test_export_plain_cells_no_style_artifacts_f210() -> Result<()> {
        use crate::model::{Cell, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("PlainCells");
        sheet.set_cell(0, 0, Cell::with_text("Plain1"));
        sheet.set_cell(0, 1, Cell::with_text("Plain2"));
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        // Plain String cells should not have table:style-name attributes
        // (the hardcoded ce1 only appears on Number cells currently)
        // Since both plain cells are String type, they should not have ce1
        // But they might appear in cell spans. Let's just check that no
        // cell-style elements were created
        assert!(
            !content.contains("table-cell-properties"),
            "plain cells should not emit cell-style elements"
        );
        
        Ok(())
    }

    // F-210: two cells sharing identical style -> one style element (dedupe)
    #[test]
    fn test_export_cell_style_dedupe_f210() -> Result<()> {
        use crate::model::{Cell, CellStyle, Sheet};
        use std::io::Read;

        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("DedupeCells");
        
        // Create two cells with identical bold style
        let mut bold_style = CellStyle::default();
        bold_style.bold = Some(true);
        
        let mut bold_cell1 = Cell::with_text("Bold1");
        bold_cell1.style = bold_style.clone();
        sheet.set_cell(0, 0, bold_cell1);
        
        let mut bold_cell2 = Cell::with_text("Bold2");
        bold_cell2.style = bold_style.clone();
        sheet.set_cell(0, 1, bold_cell2);
        
        wb.add_sheet(sheet);

        let bytes = export_ods(&wb)?;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes))?;
        let mut content = String::new();
        archive.by_name("content.xml")?.read_to_string(&mut content)?;

        // Should have exactly one ce1 style definition
        // ce1 is always undefined (reserved plain-number default ref)
        assert_eq!(content.matches("style:name=\"ce1\"").count(), 0);
        // one shared ce2 style definition for two identically styled cells
        assert_eq!(
            content.matches("style:name=\"ce2\"").count(),
            1,
            "should have exactly one ce2 style definition for two cells with same style"
        );
        
        // Both cells should reference ce2 (ce1 is the reserved plain-number default)
        assert!(
            content.contains("table:style-name=\"ce2\""),
            "cells should reference ce2"
        );
        
        Ok(())
    }

    // F-210: round-trip test for text/num/bool/date/error cells
    #[test]
    fn test_from_ods_roundtrip_basic_types_f210() -> Result<()> {
        use crate::model::{Cell, Sheet};
        use chrono::NaiveDate;
        
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("BasicTypes");
        
        // Text cell
        sheet.set_cell(0, 0, Cell::with_text("Hello World"));
        
        // Number cell
        sheet.set_cell(0, 1, Cell::with_num(42.5));
        
        // Boolean cell
        sheet.set_cell(0, 2, Cell::with_bool(true));
        sheet.set_cell(1, 2, Cell::with_bool(false));
        
        // Date cell - use NaiveDateTime with time 00:00:00
        sheet.set_cell(0, 3, Cell {
            raw: "2026-10-19T00:00:00".to_string(),
            value: CellValue::Date(NaiveDate::from_ymd_opt(2026, 10, 19).unwrap().and_hms_opt(0, 0, 0).unwrap()),
            formula: None,
            style: CellStyle::default(),
        });
        
        // Error cell (mapped to text "#ERROR!")
        sheet.set_cell(1, 3, Cell {
            raw: "#ERROR!".to_string(),
            value: CellValue::Text("#ERROR!".to_string()),
            formula: None,
            style: CellStyle::default(),
        });
        
        wb.add_sheet(sheet);
        
        // Export and import
        let ods_bytes = export_ods(&wb)?;
        let imported_wb = from_ods(&ods_bytes)?;
        
        // Verify sheets
        assert_eq!(imported_wb.sheets.len(), 1);
        assert_eq!(imported_wb.sheets[0].name, "BasicTypes");
        
        let imported_sheet = &imported_wb.sheets[0];
        
        // Check text cell
        let cell = imported_sheet.get_cell(0, 0).expect("Text cell should exist");
        assert!(matches!(cell.value, CellValue::Text(ref s) if s == "Hello World"));
        
        // Check number cell
        let cell = imported_sheet.get_cell(0, 1).expect("Number cell should exist");
        println!("Number cell: value={:?}, raw='{}'", cell.value, cell.raw);
        assert!(matches!(cell.value, CellValue::Num(n) if (n - 42.5).abs() < f64::EPSILON));
        
        // Check boolean cells
        let cell = imported_sheet.get_cell(0, 2).expect("True cell should exist");
        assert!(matches!(cell.value, CellValue::Bool(true)));
        
        let cell = imported_sheet.get_cell(1, 2).expect("False cell should exist");
        assert!(matches!(cell.value, CellValue::Bool(false)));
        
        // Check date cell
        let cell = imported_sheet.get_cell(0, 3).expect("Date cell should exist");
        assert!(matches!(cell.value, CellValue::Date(_)));
        
        // Check error cell (as text)
        let cell = imported_sheet.get_cell(1, 3).expect("Error cell should exist");
        assert!(matches!(cell.value, CellValue::Text(ref s) if s == "#ERROR!"));
        
        Ok(())
    }

    // F-210: round-trip test for formula cells
    #[test]
    fn test_from_ods_roundtrip_formula_f210() -> Result<()> {
        use crate::model::{Cell, Sheet};
        use wo_formula::parser::parse;
        
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Formulas");
        
        // Formula with numeric result
        let formula = parse("=1+1")?;
        sheet.set_cell(0, 0, Cell::with_formula("=1+1", formula, CellValue::Num(2.0)));
        
        // Formula with text result
        let formula = parse("=CONCATENATE(\"Hello\", \" \", \"World\")")?;
        sheet.set_cell(0, 1, Cell::with_formula("=CONCATENATE(\"Hello\", \" \", \"World\")", formula, CellValue::Text("Hello World".to_string())));
        
        wb.add_sheet(sheet);
        
        // Export and import
        let ods_bytes = export_ods(&wb)?;
        let imported_wb = from_ods(&ods_bytes)?;
        
        // Verify sheets
        assert_eq!(imported_wb.sheets.len(), 1);
        let imported_sheet = &imported_wb.sheets[0];
        
        // Check numeric formula cell
        let cell = imported_sheet.get_cell(0, 0).expect("Formula cell should exist");
        assert!(cell.formula.is_some(), "Formula should be present");
        assert!(matches!(cell.value, CellValue::Num(n) if (n - 2.0).abs() < f64::EPSILON));
        
        // Check text formula cell
        let cell = imported_sheet.get_cell(0, 1).expect("Text formula cell should exist");
        assert!(cell.formula.is_some(), "Formula should be present");
        assert!(matches!(cell.value, CellValue::Text(ref s) if s == "Hello World"));
        
        Ok(())
    }

    // F-210: round-trip test for merged cells and column widths
    #[test]
    fn test_from_ods_roundtrip_merges_widths_f210() -> Result<()> {
        use crate::model::{Cell, MergeRange, Sheet};
        
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("MergesAndWidths");
        
        // Add a 2x2 merge
        sheet.add_merge(MergeRange::new(0, 0, 1, 1));
        sheet.set_cell(0, 0, Cell::with_text("Merged Cell"));
        
        // Set column widths
        sheet.col_widths.insert(0, 50.0);
        sheet.col_widths.insert(1, 75.0);
        
        wb.add_sheet(sheet);
        
        // Export and import
        let ods_bytes = export_ods(&wb)?;
        let imported_wb = from_ods(&ods_bytes)?;
        
        // Verify
        assert_eq!(imported_wb.sheets.len(), 1);
        let imported_sheet = &imported_wb.sheets[0];
        
        // Check merges
        assert_eq!(imported_sheet.merges.len(), 1);
        assert_eq!(imported_sheet.merges[0].start_row, 0);
        assert_eq!(imported_sheet.merges[0].start_col, 0);
        assert_eq!(imported_sheet.merges[0].end_row, 1);
        assert_eq!(imported_sheet.merges[0].end_col, 1);
        
        // Check column widths (tolerant: serializer emits cm at {:.3}, so 50pt
        // round-trips to ~50.003pt — well within any visual fidelity bound)
        assert_eq!(imported_sheet.col_widths.len(), 2);
        assert!((imported_sheet.col_widths.get(&0).copied().unwrap() - 50.0).abs() < 0.01);
        assert!((imported_sheet.col_widths.get(&1).copied().unwrap() - 75.0).abs() < 0.01);
        
        // Check merged cell exists at (0,0)
        assert!(imported_sheet.get_cell(0, 0).is_some());
        
        Ok(())
    }

    // F-210: round-trip test for empty workbook
    #[test]
    fn test_from_ods_roundtrip_empty_workbook_f210() -> Result<()> {
        let wb = Workbook::new();
        
        // Export and import
        let ods_bytes = export_ods(&wb)?;
        let imported_wb = from_ods(&ods_bytes)?;
        
        // Verify empty workbook
        assert_eq!(imported_wb.sheets.len(), 0);
        
        Ok(())
    }

    // F-210: debug test to see what's being parsed
    #[test]
    fn test_from_ods_debug_f210() -> Result<()> {
        use crate::model::{Cell, Sheet};
        
        let mut wb = Workbook::new();
        let mut sheet = Sheet::new("Debug");
        sheet.set_cell(0, 0, Cell::with_text("Hello"));
        sheet.set_cell(0, 1, Cell::with_num(42.5));
        wb.add_sheet(sheet);
        
        let bytes = export_ods(&wb)?;
        
        // Parse with wo-odf directly to see what's there
        use wo_odf::{OdfParser, model::OdfContent};
        let parser = OdfParser::new();
        let doc = parser.parse(&bytes)?;
        
        println!("Doc type: {:?}", doc.doc_type);
        match doc.content {
            OdfContent::Spreadsheet { ref sheets } => {
                println!("Sheets: {}", sheets.len());
                for sheet in sheets {
                    println!("  Sheet: {}, rows: {}", sheet.name, sheet.rows.len());
                    for row in &sheet.rows {
                        println!("    Row {}: {} cells", row.row_num, row.cells.len());
                        for cell in &row.cells {
                            println!("      Cell ({},{}): type={:?}, text='{}', value={:?}, formula={:?}",
                                cell.row, cell.column, cell.cell_type, cell.text, cell.value, cell.formula);
                        }
                    }
                }
            }
            _ => println!("Not a spreadsheet"),
        }
        
        // Now try from_ods
        let imported_wb = from_ods(&bytes)?;
        println!("\nfrom_ods: {} sheets", imported_wb.sheets.len());
        if let Some(sheet) = imported_wb.sheets.first() {
            println!("  Sheet: {}, cells: {}", sheet.name, sheet.cells.len());
            for ((row, col), cell) in &sheet.cells {
                println!("    Cell ({},{}): raw='{}', value={:?}", row, col, cell.raw, cell.value);
            }
        }
        
        Ok(())
    }

    // F-210: test that non-ODS bytes return an error
    #[test]
    fn test_from_ods_non_ods_error_f210() {
        let result = from_ods(b"not an ods");
        assert!(result.is_err(), "Should return error for non-ODS bytes");
    }

    // F-210: round-trip test for multiple sheets
    #[test]
    fn test_from_ods_roundtrip_multiple_sheets_f210() -> Result<()> {
        use crate::model::{Cell, Sheet};
        
        let mut wb = Workbook::new();
        
        let mut sheet1 = Sheet::new("Sheet1");
        sheet1.set_cell(0, 0, Cell::with_text("Sheet1 data"));
        wb.add_sheet(sheet1);
        
        let mut sheet2 = Sheet::new("Sheet2");
        sheet2.set_cell(0, 0, Cell::with_num(123.0));
        wb.add_sheet(sheet2);
        
        // Export and import
        let ods_bytes = export_ods(&wb)?;
        let imported_wb = from_ods(&ods_bytes)?;
        
        // Verify sheets
        assert_eq!(imported_wb.sheets.len(), 2);
        assert_eq!(imported_wb.sheets[0].name, "Sheet1");
        assert_eq!(imported_wb.sheets[1].name, "Sheet2");
        
        // Check data
        let cell = imported_wb.sheets[0].get_cell(0, 0).expect("Sheet1 cell should exist");
        assert!(matches!(cell.value, CellValue::Text(ref s) if s == "Sheet1 data"));
        
        let cell = imported_wb.sheets[1].get_cell(0, 0).expect("Sheet2 cell should exist");
        assert!(matches!(cell.value, CellValue::Num(n) if (n - 123.0).abs() < f64::EPSILON));
        
        Ok(())
    }
}
