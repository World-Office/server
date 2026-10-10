//! WoSpreadsheet model — JSON-compatible with the frontend spreadsheet format.
//!
//! This is the bridge between the frontend spreadsheet JSON format
//! and the wo-ooxml `XlsxWorkbook` model used for XLSX serialization.

use serde::{Deserialize, Serialize};

/// A non-core XLSX ZIP part preserved for byte-faithful round-tripping
/// (charts, pivot tables, media, drawings, comments, etc.).
///
/// The 9 core parts that the serializer regenerates are excluded:
/// `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`,
/// `xl/_rels/workbook.xml.rels`, `xl/worksheets/sheetN.xml`,
/// `xl/sharedStrings.xml`, `xl/styles.xml`, `xl/theme/theme1.xml`,
/// `docProps/core.xml`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XlsxExtraPart {
    /// ZIP entry path (e.g., "xl/charts/chart1.xml").
    pub name: String,
    /// Base64-encoded part bytes.
    pub data_base64: String,
    /// Content-type override from `[Content_Types].xml`, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

/// A complete spreadsheet, matching the frontend shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoSpreadsheet {
    pub version: u32,
    pub name: String,
    pub sheet_order: Vec<String>,
    pub sheets: Vec<WoSheet>,
    pub shared_strings: Vec<String>,
    /// Non-core XLSX parts preserved for byte-faithful round-tripping.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extra_parts: Vec<XlsxExtraPart>,
}

/// A single sheet in the spreadsheet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoSheet {
    pub id: String,
    pub name: String,
    pub row_count: u32,
    pub column_count: u32,
    pub rows: Vec<WoRow>,
    #[serde(default)]
    pub merges: Vec<String>, // e.g. "A1:B2"
}

/// A row in a sheet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoRow {
    pub r: u32,
    pub cells: Vec<WoCell>,
}

/// A cell in a row.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoCell {
    pub r: String, // e.g. "A1"
    pub t: String, // cell type: "n", "s", "b", "str"
    pub v: String, // value (resolved shared string if t="s")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub s: Option<u32>, // style index
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f: Option<String>, // formula
}
