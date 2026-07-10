//! WoSpreadsheet model — JSON-compatible with the frontend spreadsheet format.
//!
//! This is the bridge between the frontend spreadsheet JSON format
//! and the wo-ooxml `XlsxWorkbook` model used for XLSX serialization.

use serde::{Deserialize, Serialize};

/// A complete spreadsheet, matching the frontend shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WoSpreadsheet {
    pub version: u32,
    pub name: String,
    pub sheet_order: Vec<String>,
    pub sheets: Vec<WoSheet>,
    pub shared_strings: Vec<String>,
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
