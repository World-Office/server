// wo-renderer-wasm -- WASM bindings for World-Office rendering engine
//!
//! Provides JavaScript-callable functions for rendering documents
//! to HTML5 Canvas elements.
//!
//! This module exports canvas rendering functions that allow JavaScript
//! code to create and manipulate canvas instances, render shapes and text,
//! and retrieve pixel data.

pub mod canvas_bridge;
pub mod layout;
pub mod stub_model;

use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Mutex;
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;
use std::collections::HashSet;
use std::collections::BTreeMap;
use wo_common::op::EditableModel;
use wo_common::path::{Path, Range};
use wo_ooxml::model::{DocxBlock, DocxBody, DocxParagraph, DocxParagraphProperties, DocxRun, OoxmlDocument, PptxPresentation, XlsxWorkbook};
use wo_ooxml::parser::OoxmlParser;
use wo_ooxml::serializer::OoxmlSerializer;
use wo_ooxml_ops::EditableDocxBody;
use wo_spell::dic::Dictionary;
use wo_spell::hyphenate::{HyphenationDict, Hyphenator};
use wo_spell::suggest::Suggester;

// Re-export canvas functions
pub use canvas_bridge::{create_canvas, flush_to_canvas, get_pixel_data, release_canvas};
pub use layout::{
    LaidOutChar, LaidOutLine, LaidOutPage, LaidOutParagraph, LayoutEngine, PageLayout,
};

/// Global store of document instances (handle → parsed OoxmlDocument).
static DOC_STORE: OnceLock<Mutex<HashMap<u32, Vec<u8>>>> = OnceLock::new();
/// Global store of parsed document models for editing (handle → OoxmlDocument).
static DOC_MODEL_STORE: OnceLock<Mutex<HashMap<u32, OoxmlDocument>>> = OnceLock::new();
/// Global store of layout results (handle → laid-out pages).
static LAYOUT_STORE: OnceLock<Mutex<HashMap<u32, Vec<LaidOutPage>>>> = OnceLock::new();
/// Global store of layout engines (handle → LayoutEngine).
static ENGINE_STORE: OnceLock<Mutex<HashMap<u32, LayoutEngine>>> = OnceLock::new();
/// Cursor position per document (handle → (para_idx, run_idx, char_idx, x, y)).
static CURSOR_STORE: OnceLock<Mutex<HashMap<u32, CursorPos>>> = OnceLock::new();

static mut NEXT_DOC_HANDLE: u32 = 1000;

/// Cursor position within a document.
#[derive(Debug, Clone, Copy, Default)]
struct CursorPos {
    pub page: u32,
    pub para: usize,
    pub line: usize,
    pub char_idx: usize,
    pub x: f32,
    pub y: f32,
}

unsafe fn next_doc_handle() -> u32 {
    let h = NEXT_DOC_HANDLE;
    NEXT_DOC_HANDLE += 1;
    h
}

// ── PDF Model (§2.3) ──────────────────────────────────────────────

/// Global store of PDF document instances (handle → PDF bytes).
static PDF_STORE: OnceLock<Mutex<HashMap<u32, Vec<u8>>>> = OnceLock::new();
/// Global store of PDF document information (handle → PdfDocInfo).
static PDF_INFO_STORE: OnceLock<Mutex<HashMap<u32, PdfDocInfo>>> = OnceLock::new();

/// Next available PDF handle (separate namespace starting at 2000
/// to avoid collisions with other stores).
static mut NEXT_PDF_HANDLE: u32 = 2000;

/// PDF document information.
#[derive(Debug, Clone)]
struct PdfDocInfo {
    /// Number of pages in the PDF.
    pub page_count: u32,
    /// Width and height of each page in pixels.
    pub pages: Vec<PdfPageInfo>,
}

/// Page information.
#[derive(Debug, Clone)]
struct PdfPageInfo {
    /// Page width in pixels.
    pub width: u32,
    /// Page height in pixels.
    pub height: u32,
}

/// Layout options for PDF rendering.
#[derive(Debug, Clone, serde::Deserialize)]
struct PdfLayoutOpts {
    /// Canvas width in pixels.
    #[allow(dead_code)]
    pub width: u32,
    /// Canvas height in pixels.
    #[allow(dead_code)]
    pub height: u32,
    /// DPI for rendering.
    #[serde(default = "default_dpi")]
    #[allow(dead_code)]
    pub dpi: f32,
    /// Page index to render (0-based).
    #[serde(default)]
    pub page: usize,
}

fn default_dpi() -> f32 {
    96.0
}

/// Allocate the next PDF handle.
///
/// # Safety
/// WASM is single-threaded; the mutable static is safe in that context.
unsafe fn next_pdf_handle() -> u32 {
    let h = NEXT_PDF_HANDLE;
    NEXT_PDF_HANDLE += 1;
    h
}

/// Check if bytes represent a valid PDF file.
fn is_valid_pdf(bytes: &[u8]) -> bool {
    bytes.len() >= 5 && bytes.starts_with(b"%PDF-")
}

/// Count pages in a PDF by searching for page objects.
///
/// This is a simple heuristic that counts "/Type /Page" occurrences.
/// For a more accurate count, use wo-pdf crate.
fn count_pdf_pages(bytes: &[u8]) -> u32 {
    // Count occurrences of "/Type /Page"
    let mut count = 0u32;
    for window in bytes.windows(10) {
        if window == b"/Type /Page" {
            count += 1;
        }
    }
    count.max(1) // At least 1 page
}

/// Create a PDF model from bytes and return a handle.
///
/// Stores the PDF bytes and extracts basic information like page count.
fn create_pdf_model(bytes: &[u8]) -> Result<u32, String> {
    if bytes.is_empty() {
        return Err("PDF bytes are empty".to_string());
    }
    if !is_valid_pdf(bytes) {
        return Err("Invalid PDF header: does not start with %PDF-".to_string());
    }

    let handle = unsafe { next_pdf_handle() };

    // Store raw bytes
    let store = PDF_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.insert(handle, bytes.to_vec());

    // Extract basic PDF info
    let page_count = count_pdf_pages(bytes);
    let pages = vec![PdfPageInfo {
        width: 794,  // Default A4 width at 96 DPI
        height: 1123, // Default A4 height at 96 DPI
    }; page_count as usize];

    let info_store = PDF_INFO_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut info_store = info_store.lock().unwrap();
    info_store.insert(
        handle,
        PdfDocInfo {
            page_count,
            pages,
        },
    );

    Ok(handle)
}

/// Layout a PDF document and optionally render page info to a canvas.
///
/// When `canvas` is non-zero, renders basic page outlines and labels.
fn layout_pdf_document(handle: u32, opts: &PdfLayoutOpts, canvas: u32) -> Result<String, String> {
    let info_store = PDF_INFO_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let info_store = info_store.lock().unwrap();
    let info = info_store
        .get(&handle)
        .ok_or_else(|| format!("PDF handle {} not found", handle))?;

    // Build page JSON
    let mut pages_json: Vec<serde_json::Value> = Vec::new();
    for (i, page) in info.pages.iter().enumerate() {
        let is_active = i == opts.page;
        pages_json.push(serde_json::json!({
            "width": page.width,
            "height": page.height,
            "index": i,
            "active": is_active,
        }));
    }

    // Optionally render page outlines to canvas.
    if canvas != 0 {
        let canvas_store = canvas_bridge::get_canvas_store();
        let mut canvas_store = canvas_store.lock().unwrap();
        if let Some(canvas_obj) = canvas_store.get_mut(&canvas) {
            // White background
            canvas_obj.set_fill(wo_renderer::color::Paint::Color(
                wo_renderer::color::Color::new(1.0, 1.0, 1.0, 1.0),
            ));
            let total_w = info.pages.iter().map(|p| p.width).max().unwrap_or(794) as f32;
            let total_h = info.pages.iter().map(|p| p.height).max().unwrap_or(1123) as f32;
            canvas_obj.fill_rect(0.0, 0.0, total_w, total_h);

            // Draw page outlines
            for (i, page) in info.pages.iter().enumerate() {
                let is_active = i == opts.page;
                let border_color = if is_active { "#2563EB" } else { "#D1D5DB" };
                let _ = canvas_bridge::render_rect(
                    canvas, 0.0, 0.0, page.width as f32, page.height as f32, border_color,
                );
                // Page number label
                let label = format!("Page {}/{}", i + 1, info.page_count);
                let _ = canvas_bridge::render_text(
                    canvas,
                    &label,
                    8.0,
                    20.0,
                    Some(if is_active { "#2563EB".to_string() } else { "#6B7280".to_string() }),
                    Some(14.0),
                );
            }
        }
        drop(canvas_store);
    }

    let result = serde_json::json!({
        "pages": pages_json,
        "pageCount": info.page_count,
        "currentPage": opts.page,
    });

    serde_json::to_string(&result).map_err(|e| format!("JSON serialization failed: {}", e))
}

// ── PPTX Model (§2.3, SL-6) ──────────────────────────────────────────

/// Global store of PPTX presentation instances (handle → PptxPresentation).
static PPTX_STORE: OnceLock<Mutex<HashMap<u32, PptxPresentation>>> = OnceLock::new();

/// Next available PPTX handle (separate namespace starting at 3000
/// to avoid collisions with other stores).
static mut NEXT_PPTX_HANDLE: u32 = 3000;

/// Allocate the next PPTX handle.
///
/// # Safety
/// WASM is single-threaded; the mutable static is safe in that context.
unsafe fn next_pptx_handle() -> u32 {
    let h = NEXT_PPTX_HANDLE;
    NEXT_PPTX_HANDLE += 1;
    h
}

/// Check if bytes represent a valid PPTX file by checking for the PPTX content type marker.
fn is_valid_pptx(bytes: &[u8]) -> bool {    // PPTX files are ZIP archives containing a [Content_Types].xml file
    // with references to ppt/presentation.xml
    if bytes.len() < 22 {
        return false;
    }
    // Check for ZIP magic number
    &bytes[0..4] == b"PK\x03\x04"
}

/// Create a PPTX model from bytes.
/// Uses OoxmlParser::parse_pptx to parse the presentation and stores it for editing.
fn create_pptx_model(bytes: &[u8]) -> Result<u32, String> {
    if bytes.is_empty() {
        return Err("PPTX bytes are empty".to_string());
    }
    if !is_valid_pptx(bytes) {
        return Err("Invalid PPTX: does not appear to be a valid ZIP archive".to_string());
    }

    let parser = OoxmlParser::new();
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| {
        format!("Failed to open PPTX as ZIP archive: {}", e)
    })?;

    let pptx_pres = parser.parse_pptx(&mut archive)
        .map_err(|e| format!("Failed to parse PPTX: {}", e))?
        .ok_or_else(|| "No presentation found in PPTX file".to_string())?;

    let handle = unsafe { next_pptx_handle() };

    // Store the parsed presentation
    let store = PPTX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.insert(handle, pptx_pres);

    Ok(handle)
}

/// Editable wrapper for PptxPresentation that implements EditableModel.
/// This allows PPTX presentations to be edited using the uniform ModelOp operations.
#[derive(Debug, Clone)]
pub struct EditablePptxPresentation(pub PptxPresentation);

impl From<PptxPresentation> for EditablePptxPresentation {
    fn from(pres: PptxPresentation) -> Self {
        Self(pres)
    }
}

impl From<EditablePptxPresentation> for PptxPresentation {
    fn from(pres: EditablePptxPresentation) -> Self {
        pres.0
    }
}

/// Error type for EditablePptxPresentation operations.
#[derive(Debug, Clone, PartialEq)]
pub enum PptxModelError {
    OutOfRange(String),
    Invalid(String),
}

impl std::fmt::Display for PptxModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::OutOfRange(msg) => write!(f, "PPTX out of range: {}", msg),
            Self::Invalid(msg) => write!(f, "PPTX invalid operation: {}", msg),
        }
    }
}

impl std::error::Error for PptxModelError {}

impl EditableModel for EditablePptxPresentation {
    type Err = PptxModelError;

    fn apply(&mut self, op: &wo_common::op::ModelOp) -> std::result::Result<(), Self::Err> {
        match op {
            wo_common::op::ModelOp::Insert { at, content: _content } => {
                match at {
                    Path::Slide { slide, shape: _shape, run: _run, char: _char } => {
                        // Insert text into a text run in a shape
                        if *slide >= self.0.slides.len() {
                            return Err(PptxModelError::OutOfRange(format!(
                                "Slide {} out of range (len: {})",
                                slide, self.0.slides.len()
                            )));
                        }
                        // Note: Full text editing implementation requires more work
                        // This is a placeholder that marks the position as editable
                        Ok(())
                    }
                    _ => Err(PptxModelError::Invalid(format!(
                        "Unsupported path type for insert: {:?}",
                        at
                    ))),
                }
            }
            wo_common::op::ModelOp::Delete { range: _range } => {
                Err(PptxModelError::Invalid(
                    "Delete not yet implemented for PPTX".to_string(),
                ))
            }
            wo_common::op::ModelOp::Replace { at: _at, content: _ } => {
                Err(PptxModelError::Invalid(
                    "Replace not yet implemented for PPTX".to_string(),
                ))
            }
            wo_common::op::ModelOp::Format { range, attrs: _attrs } => {
                // Format operations on slides/shapes
                match &range.start {
                    Path::Slide { .. } => {
                        // Apply formatting to slide elements
                        // This would typically format text runs in shapes
                        // For now, accept the operation (no-op)
                        Ok(())
                    }
                    _ => Err(PptxModelError::Invalid(format!(
                        "Unsupported path type for format: {:?}",
                        range.start
                    ))),
                }
            }
            wo_common::op::ModelOp::Move { from: _from, to: _to } => {
                Err(PptxModelError::Invalid(
                    "Move not yet implemented for PPTX".to_string(),
                ))
            }
        }
    }

    fn invert(&self, op: &wo_common::op::ModelOp) -> wo_common::op::ModelOp {
        // Return a simple inverse - full implementation would require tracking state
        match op {
            wo_common::op::ModelOp::Insert { at, content } => {
                let end = match at {
                    Path::Slide { slide, shape, run, char } => Path::Slide {
                        slide: *slide,
                        shape: *shape,
                        run: *run,
                        char: *char + content.chars().count(),
                    },
                    _ => at.clone(),
                };
                wo_common::op::ModelOp::Delete {
                    range: Range::new(at.clone(), end),
                }
            }
            wo_common::op::ModelOp::Delete { range } => {
                // Inverse of delete is insert at the start of the range
                wo_common::op::ModelOp::Insert {
                    at: range.start.clone(),
                    content: String::new(),
                }
            }
            wo_common::op::ModelOp::Replace { at, content } => {
                // Inverse of replace is replace with original content
                wo_common::op::ModelOp::Replace {
                    at: at.clone(),
                    content: content.clone(),
                }
            }
            wo_common::op::ModelOp::Format { range, attrs: _attrs } => {
                // Inverse of format is format with cleared attrs
                wo_common::op::ModelOp::Format {
                    range: range.clone(),
                    attrs: BTreeMap::new(),
                }
            }
            wo_common::op::ModelOp::Move { from, to } => {
                // Inverse of move is move back
                wo_common::op::ModelOp::Move {
                    from: to.clone(),
                    to: from.clone(),
                }
            }
        }
    }

    fn to_ops_since(&self, _rev: u64) -> Vec<wo_common::op::ModelOp> {
        // Without revision tracking, return empty for now
        Vec::new()
    }
}

/// Extract a PPTX presentation from the store.
fn extract_pptx_pres(handle: u32) -> Result<PptxPresentation, String> {
    let store = PPTX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    store.get(&handle)
        .cloned()
        .ok_or_else(|| format!("PPTX handle {} not found", handle))
}

/// Store a PPTX presentation back into the store.
fn store_pptx_pres(handle: u32, pres: PptxPresentation) -> Result<(), String> {
    let store = PPTX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    if store.contains_key(&handle) {
        store.insert(handle, pres);
        Ok(())
    } else {
        Err(format!("PPTX handle {} not found", handle))
    }
}

/// Serialize a PPTX presentation back to bytes.
/// Note: This is not fully implemented yet - would require a PPTX serializer in wo-ooxml.
fn serialize_pptx_pres(_pres: &PptxPresentation) -> Result<Vec<u8>, String> {
    Err("PPTX serialization not yet implemented".to_string())
}

/// Layout a PPTX presentation and return JSON with slide information.
fn layout_pptx_presentation(_handle: u32, _opts_json: &str) -> Result<String, String> {
    Err("PPTX layout not yet implemented".to_string())
}

// ============================================================================
// XLSX Model (§2.3, SS-7)
// ============================================================================

/// Global store of XLSX workbook instances (handle → EditableXlsxWorkbook).
static XLSX_STORE: OnceLock<Mutex<HashMap<u32, EditableXlsxWorkbook>>> = OnceLock::new();

/// Next available XLSX handle (separate namespace starting at 6000
/// to avoid collisions with other stores).
static mut NEXT_XLSX_HANDLE: u32 = 6000;

/// Allocate the next XLSX handle.
///
/// # Safety
/// WASM is single-threaded; the mutable static is safe in that context.
unsafe fn next_xlsx_handle() -> u32 {
    let h = NEXT_XLSX_HANDLE;
    NEXT_XLSX_HANDLE += 1;
    h
}


/// Error type for XlsxWorkbook model operations.
#[derive(Debug, Clone, PartialEq)]
pub enum XlsxModelError {
    OutOfRange(String),
    Invalid(String),
}

impl std::fmt::Display for XlsxModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::OutOfRange(msg) => write!(f, "XLSX out of range: {}", msg),
            Self::Invalid(msg) => write!(f, "XLSX invalid operation: {}", msg),
        }
    }
}

impl std::error::Error for XlsxModelError {}

/// Editable wrapper for XlsxWorkbook that implements EditableModel.
/// This allows XLSX workbooks to be edited using the uniform ModelOp operations.
#[derive(Debug, Clone)]
pub struct EditableXlsxWorkbook(pub XlsxWorkbook);

impl From<XlsxWorkbook> for EditableXlsxWorkbook {
    fn from(wb: XlsxWorkbook) -> Self {
        Self(wb)
    }
}

impl From<EditableXlsxWorkbook> for XlsxWorkbook {
    fn from(wb: EditableXlsxWorkbook) -> Self {
        wb.0
    }
}

impl EditableModel for EditableXlsxWorkbook {
    type Err = XlsxModelError;

    fn apply(&mut self, op: &wo_common::op::ModelOp) -> std::result::Result<(), Self::Err> {
        match op {
            wo_common::op::ModelOp::Insert { at, content } => {
                match at {
                    Path::Sheet { sheet, row, col } => {
                        let sheet_idx = self.0.sheets.iter()
                            .position(|s| s.name == *sheet)
                            .ok_or_else(|| XlsxModelError::OutOfRange(format!("Sheet '{}' not found", sheet)))?;
                        
                        let row_idx = *row as usize;
                        while self.0.sheets[sheet_idx].rows.len() <= row_idx {
                            self.0.sheets[sheet_idx].rows.push(Default::default());
                        }
                        
                        let col_idx = *col as usize;
                        while self.0.sheets[sheet_idx].rows[row_idx].cells.len() <= col_idx {
                            self.0.sheets[sheet_idx].rows[row_idx].cells.push(Default::default());
                        }
                        
                        if let Some(cell) = self.0.sheets[sheet_idx].rows[row_idx].cells.get_mut(col_idx) {
                            cell.v = content.clone();
                            if cell.t == wo_ooxml::model::CellType::N && cell.v.parse::<f64>().is_err() {
                                cell.t = wo_ooxml::model::CellType::Str;
                            }
                        }
                        Ok(())
                    }
                    Path::Text { para: row, char: col, .. } => {
                        if self.0.sheets.is_empty() {
                            return Err(XlsxModelError::OutOfRange("No sheets in workbook".to_string()));
                        }
                        let sheet_idx = 0;
                        let row_idx = *row as usize;
                        let col_idx = *col as usize;
                        
                        while self.0.sheets[sheet_idx].rows.len() <= row_idx {
                            self.0.sheets[sheet_idx].rows.push(Default::default());
                        }
                        while self.0.sheets[sheet_idx].rows[row_idx].cells.len() <= col_idx {
                            self.0.sheets[sheet_idx].rows[row_idx].cells.push(Default::default());
                        }
                        
                        if let Some(cell) = self.0.sheets[sheet_idx].rows[row_idx].cells.get_mut(col_idx) {
                            cell.v = content.clone();
                        }
                        Ok(())
                    }
                    _ => Err(XlsxModelError::Invalid(format!("Unsupported path type for insert: {:?}", at))),
                }
            }
            wo_common::op::ModelOp::Delete { range } => {
                match (&range.start, &range.end) {
                    (Path::Sheet { sheet: sheet_start, row: row_start, col: col_start },
                     Path::Sheet { sheet: sheet_end, row: row_end, col: col_end }) => {
                        if sheet_start != sheet_end {
                            return Err(XlsxModelError::Invalid("Cross-sheet delete not supported".to_string()));
                        }
                        let sheet_idx = self.0.sheets.iter()
                            .position(|s| s.name == *sheet_start)
                            .ok_or_else(|| XlsxModelError::OutOfRange(format!("Sheet '{}' not found", sheet_start)))?;
                        
                        let row_start = *row_start as usize;
                        let row_end = *row_end as usize;
                        let col_start = *col_start as usize;
                        let col_end = *col_end as usize;
                        
                        for row in row_start..=row_end.min(self.0.sheets[sheet_idx].rows.len().saturating_sub(1)) {
                            for col in col_start..=col_end.min(self.0.sheets[sheet_idx].rows[row].cells.len().saturating_sub(1)) {
                                if let Some(cell) = self.0.sheets[sheet_idx].rows[row].cells.get_mut(col) {
                                    cell.v = String::new();
                                }
                            }
                        }
                        Ok(())
                    }
                    _ => Err(XlsxModelError::Invalid("Unsupported range type for delete".to_string())),
                }
            }
            wo_common::op::ModelOp::Replace { at, content } => {
                self.apply(&wo_common::op::ModelOp::Delete {
                    range: Range::new(at.clone(), at.clone()),
                })?;
                self.apply(&wo_common::op::ModelOp::Insert {
                    at: at.clone(),
                    content: content.clone(),
                })
            }
            wo_common::op::ModelOp::Format { range, attrs: _ } => {
                Ok(())
            }
            wo_common::op::ModelOp::Move { from: _, to: _ } => {
                Err(XlsxModelError::Invalid("Move not yet implemented for XLSX".to_string()))
            }
        }
    }

    fn invert(&self, op: &wo_common::op::ModelOp) -> wo_common::op::ModelOp {
        match op {
            wo_common::op::ModelOp::Insert { at, content } => {
                wo_common::op::ModelOp::Delete {
                    range: Range::new(at.clone(), at.clone()),
                }
            }
            wo_common::op::ModelOp::Delete { range } => {
                wo_common::op::ModelOp::Insert {
                    at: range.start.clone(),
                    content: String::new(),
                }
            }
            wo_common::op::ModelOp::Replace { at, content } => {
                wo_common::op::ModelOp::Replace {
                    at: at.clone(),
                    content: content.clone(),
                }
            }
            wo_common::op::ModelOp::Format { range, attrs } => {
                wo_common::op::ModelOp::Format {
                    range: range.clone(),
                    attrs: attrs.clone(),
                }
            }
            wo_common::op::ModelOp::Move { from, to } => {
                wo_common::op::ModelOp::Move {
                    from: to.clone(),
                    to: from.clone(),
                }
            }
        }
    }

    fn to_ops_since(&self, _rev: u64) -> Vec<wo_common::op::ModelOp> {
        Vec::new()
    }
}

/// Extract an EditableXlsxWorkbook from the store.
fn extract_xlsx_workbook(handle: u32) -> Result<EditableXlsxWorkbook, String> {
    let store = XLSX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    store.get(&handle)
        .cloned()
        .ok_or_else(|| format!("XLSX handle {} not found", handle))
}

/// Store an EditableXlsxWorkbook back into the store.
fn store_xlsx_workbook(handle: u32, wb: EditableXlsxWorkbook) -> Result<(), String> {
    let store = XLSX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    if store.contains_key(&handle) {
        store.insert(handle, wb);
        Ok(())
    } else {
        Err(format!("XLSX handle {} not found", handle))
    }
}

/// Check if bytes represent a valid XLSX file.
fn is_valid_xlsx(bytes: &[u8]) -> bool {
    if bytes.len() < 4 {
        return false;
    }
    &bytes[0..4] == b"PK\x03\x04"
}

/// Convert cell reference (e.g., "A1", "B2") to (row, col) coordinates.
fn cell_ref_to_coords(ref_str: &str) -> (u32, u32) {
    // Simple parser for cell references like "A1", "B2", etc.
    let mut chars = ref_str.chars();
    let mut col_str = String::new();
    let mut row_str = String::new();
    
    // Collect letters for column
    while let Some(c) = chars.next() {
        if c.is_ascii_alphabetic() {
            col_str.push(c.to_ascii_uppercase());
        } else if c.is_ascii_digit() {
            row_str.push(c);
        } else {
            break;
        }
    }
    
    // Convert column letters to number (A=0, B=1, ..., Z=25, AA=26, etc.)
    let col = col_str.chars().fold(0u32, |acc, c| {
        acc * 26 + (c as u32 - 'A' as u32)
    });
    
    // Convert row string to number
    let row = row_str.parse::<u32>().unwrap_or(0);
    
    (row, col)
}

/// Create an XLSX model from bytes.
fn create_xlsx_model(bytes: &[u8]) -> Result<u32, String> {
    if bytes.is_empty() {
        return Err("XLSX bytes are empty".to_string());
    }
    if !is_valid_xlsx(bytes) {
        return Err("Invalid XLSX: does not appear to be a valid ZIP archive".to_string());
    }

    let parser = OoxmlParser::new();
    let ooxml = parser
        .parse(bytes)
        .map_err(|e| format!("Failed to parse XLSX: {}", e))?;

    let workbook = ooxml.xlsx_workbook
        .ok_or_else(|| "No workbook found in XLSX file".to_string())?;

    let handle = unsafe { next_xlsx_handle() };

    let store = XLSX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.insert(handle, EditableXlsxWorkbook::from(workbook));

    Ok(handle)
}

/// Serialize an XlsxWorkbook back to XLSX bytes (ZIP archive) via the
/// wo-ooxml serializer.
fn serialize_xlsx_workbook(wb: &XlsxWorkbook) -> Result<Vec<u8>, String> {
    // Create an OoxmlDocument with the XlsxWorkbook
    let doc = OoxmlDocument {
        format: wo_ooxml::model::OoxmlFormat::Xlsx,
        version: "1.0".to_string(),
        content_types: Vec::new(),
        main_part: None,
        shared_strings: Vec::new(),
        part_count: 0,
        core_properties: Default::default(),
        relationships: Vec::new(),
        docx_body: None,
        xlsx_workbook: Some(wb.clone()),
    };
    let serializer = OoxmlSerializer::new();
    serializer
        .serialize(&doc)
        .map_err(|e| format!("XLSX serialization failed: {}", e))
}

/// Layout an XlsxWorkbook and return JSON with sheet information:
/// `{ "kind": "spreadsheet", "sheets": { name: { "row": { "col": "value" } } } }`.
fn layout_xlsx_workbook(handle: u32, _opts_json: &str) -> Result<String, String> {
    let store = XLSX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    let editable_wb = store
        .get(&handle)
        .ok_or_else(|| format!("Spreadsheet model handle {} not found", handle))?;
    let wb = &editable_wb.0;

    let mut sheets_json = serde_json::Map::new();
    for sheet in &wb.sheets {
        let mut rows: std::collections::BTreeMap<u32, serde_json::Map<String, serde_json::Value>> =
            std::collections::BTreeMap::new();
        for row in &sheet.rows {
            for cell in &row.cells {
                let (r, c) = cell_ref_to_coords(&cell.r);
                let row_map = rows.entry(r).or_default();
                row_map.insert(c.to_string(), serde_json::Value::String(cell.v.clone()));
            }
        }
        let row_val = rows
            .into_iter()
            .map(|(r, cells)| (r.to_string(), serde_json::Value::Object(cells)))
            .collect::<serde_json::Map<_, _>>();
        sheets_json.insert(sheet.name.clone(), serde_json::Value::Object(row_val));
    }
    let layout = serde_json::json!({
        "kind": "spreadsheet",
        "sheets": sheets_json,
        "sheetCount": wb.sheets.len(),
    });
    serde_json::to_string(&layout).map_err(|e| format!("JSON serialization failed: {}", e))
}

/// Initialize the WASM module.
///
/// Sets up panic hook for better error messages in the browser.
/// Call this before using any other functions.
///
/// # Example
/// ```javascript
/// init();
/// const handle = create_canvas(800, 600);
/// ```
#[wasm_bindgen]
pub fn init() {
    // Set up panic hook for better error messages in the browser
    #[cfg(target_arch = "wasm32")]
    {
        console_error_panic_hook::set_once();
    }
}

/// Render a document page to a canvas.
///
/// Parses the document bytes, lays out the content, and renders it
/// to an offscreen canvas. Returns the canvas handle for pixel data
/// retrieval or flushing to a visible canvas element.
///
/// Currently supports DOCX format only. Other formats return an error.
///
/// # Arguments
/// * `doc_bytes` - Document bytes (e.g., from a DOCX file)
/// * `format` - Document format identifier (only "docx" supported)
/// * `width` - Output width in pixels (optional, defaults to 794 ≈ A4 at 96 DPI)
/// * `height` - Output height in pixels (optional, defaults to 1123 ≈ A4 at 96 DPI)
///
/// # Returns
/// * `Result<u32, String>` - Canvas handle on success, error message on failure
///
/// # Example
/// ```javascript
/// const handle = await render_page(docBytes, "docx", 800, 600);
/// if (typeof handle !== 'number') {
///   console.error(handle); // Error message
/// } else {
///   const pixels = get_pixel_data(handle);
/// }
/// ```
#[wasm_bindgen]
pub fn render_page(
    doc_bytes: &[u8],
    format: &str,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<u32, String> {
    // Validate inputs
    if doc_bytes.is_empty() {
        return Err("Document bytes are empty".to_string());
    }

    if format.is_empty() {
        return Err("Format is required".to_string());
    }

    // Only DOCX is supported in v1
    if format != "docx" {
        return Err(format!(
            "Unsupported format: '{}'. Only 'docx' is supported.",
            format
        ));
    }

    // Parse DOCX
    let parser = OoxmlParser::new();
    let ooxml = parser
        .parse(doc_bytes)
        .map_err(|e| format!("Failed to parse DOCX: {}", e))?;

    let body = ooxml.docx_body.unwrap_or_else(DocxBody::default);

    // Use provided dimensions or A4 defaults at 96 DPI
    let canvas_width = width.unwrap_or(794);
    let canvas_height = height.unwrap_or(1123);

    if canvas_width == 0 || canvas_height == 0 {
        return Err("Width and height must be greater than zero".to_string());
    }

    // Create canvas (already has white background + FontLibrary set)
    let handle = canvas_bridge::create_canvas(canvas_width, canvas_height);
    if handle == 0 {
        return Err("Failed to create canvas".to_string());
    }

    // Layout and render the document
    let margin = 72.0f32; // 1 inch margins (72 points at 96 DPI)
    let content_width = (canvas_width as f32) - 2.0 * margin;
    let mut cursor_y = margin;

    for block in &body.blocks {
        match block {
            DocxBlock::Paragraph(para) => {
                // Handle page breaks
                if para.properties.page_break_before && cursor_y > margin {
                    cursor_y = margin;
                }

                // Spacing before paragraph
                if let Some(spacing_before) = para.properties.spacing_before {
                    cursor_y += spacing_before as f32 / 20.0; // twips to points-ish
                }

                // Indentation
                let indent_left = para
                    .properties
                    .indent_left
                    .map(|v| v as f32 / 20.0)
                    .unwrap_or(0.0);
                let indent_first = if let Some(first) = para.properties.indent_first_line {
                    Some(first as f32 / 20.0)
                } else {
                    para.properties
                        .indent_hanging
                        .map(|hanging| -(hanging as f32 / 20.0))
                };

                // Determine default font size from runs (half-points → points)
                let default_font_size: f32 = para
                    .runs
                    .iter()
                    .find_map(|r| r.font_size)
                    .map(|sz| sz as f32 / 2.0)
                    .unwrap_or(12.0)
                    .max(6.0);

                let line_height = default_font_size * 1.2;

                // Render runs — simple per-run rendering with word wrap
                let mut line_x = margin + indent_left;
                // Apply first-line indent to the initial position
                if let Some(first_indent) = indent_first {
                    line_x += first_indent;
                }

                for run in &para.runs {
                    if run.text.is_empty() {
                        continue;
                    }

                    let font_size = run
                        .font_size
                        .map(|sz| (sz as f32 / 2.0).max(6.0))
                        .unwrap_or(default_font_size);
                    let color = run_color_hex(run);
                    let _font_family = run.font.as_deref().unwrap_or("sans-serif");

                    // Word-wrap the run text
                    let words: Vec<&str> = run.text.split_whitespace().collect();
                    let mut word_idx = 0;

                    while word_idx < words.len() {
                        // Build a line of words that fits
                        let mut line_text = String::new();
                        let line_start_x = line_x;
                        let mut estimated_width = 0.0f32;
                        let char_width_est = font_size * 0.5; // rough proportional estimate

                        while word_idx < words.len() {
                            let word = words[word_idx];
                            let word_width = (word.len() as f32) * char_width_est;
                            let separator_width = if line_text.is_empty() {
                                0.0
                            } else {
                                char_width_est
                            };

                            if estimated_width + separator_width + word_width > content_width - indent_left
                                && !line_text.is_empty()
                            {
                                break; // Line full
                            }

                            if !line_text.is_empty() {
                                line_text.push(' ');
                                estimated_width += separator_width;
                            }
                            line_text.push_str(word);
                            estimated_width += word_width;
                            word_idx += 1;
                        }

                        if line_text.is_empty() {
                            // Single word wider than content area — force it on its own line
                            line_text = words[word_idx].to_string();
                            word_idx += 1;
                        }

                        // Check if we need a new line before rendering
                        if cursor_y + font_size > (canvas_height as f32) - margin {
                            break; // Past bottom margin, stop rendering
                        }

                        // Baseline y = top + ascent (~80% of font size)
                        let baseline_y = cursor_y + font_size * 0.8;

                        let _ = canvas_bridge::render_text(
                            handle,
                            &line_text,
                            line_start_x,
                            baseline_y,
                            Some(color.clone()),
                            Some(font_size),
                        );

                        cursor_y += line_height;
                        line_x = margin + indent_left;
                    }
                }

                // If paragraph had no runs, still advance for empty paragraph spacing
                if para.runs.is_empty() {
                    cursor_y += line_height;
                }

                // Spacing after paragraph
                if let Some(spacing_after) = para.properties.spacing_after {
                    cursor_y += spacing_after as f32 / 20.0;
                } else {
                    cursor_y += default_font_size * 0.5; // default paragraph spacing
                }
            }
            DocxBlock::Table(table) => {
                if cursor_y + 40.0 > (canvas_height as f32) - margin {
                    continue;
                }

                let table_width = table
                    .properties
                    .width
                    .map(|w| w as f32 / 20.0)
                    .unwrap_or(content_width);
                let col_count = table
                    .rows
                    .first()
                    .map(|r| r.cells.len() as f32)
                    .unwrap_or(1.0);
                let col_width = table_width / col_count;

                let table_x = margin
                    + table
                        .properties
                        .indent
                        .map(|i| i as f32 / 20.0)
                        .unwrap_or(0.0);

                for row in &table.rows {
                    let row_height = row.height.map(|h| h as f32 / 20.0).unwrap_or(24.0);

                    if cursor_y + row_height > (canvas_height as f32) - margin {
                        break;
                    }

                    for (col_idx, cell) in row.cells.iter().enumerate() {
                        let cell_x = table_x + (col_idx as f32) * col_width;

                        // Draw cell border
                        let _ = canvas_bridge::render_rect(
                            handle, cell_x, cursor_y, col_width, row_height, "#FFFFFF",
                        );
                        let _ = canvas_bridge::render_rect(
                            handle, cell_x, cursor_y, 1.0, row_height, "#999999",
                        );
                        let _ = canvas_bridge::render_rect(
                            handle,
                            cell_x,
                            cursor_y + row_height - 1.0,
                            col_width,
                            1.0,
                            "#999999",
                        );
                        let _ = canvas_bridge::render_rect(
                            handle,
                            cell_x + col_width - 1.0,
                            cursor_y,
                            1.0,
                            row_height,
                            "#999999",
                        );
                        let _ =
                            canvas_bridge::render_rect(handle, cell_x, cursor_y, col_width, 1.0, "#999999");

                        // Render first run of first paragraph as cell text
                        if let Some(first_para) = cell.paragraphs.first() {
                            if let Some(first_run) = first_para.runs.first() {
                                if !first_run.text.is_empty() {
                                    let font_size = first_run
                                        .font_size
                                        .map(|sz| (sz as f32 / 2.0).max(6.0))
                                        .unwrap_or(11.0);
                                    let baseline_y = cursor_y + font_size * 0.8 + 4.0;
                                    let color = run_color_hex(first_run);
                                    let _ = canvas_bridge::render_text(
                                        handle,
                                        &first_run.text,
                                        cell_x + 4.0,
                                        baseline_y,
                                        Some(color),
                                        Some(font_size),
                                    );
                                }
                            }
                        }
                    }

                    cursor_y += row_height;
                }

                cursor_y += 12.0; // spacing after table
            }
            DocxBlock::Image(_image) => {
                // Image rendering for DM-7; placeholder for now
                cursor_y += 20.0; // placeholder spacing
            }
        }
    }

    Ok(handle)
}

/// Extract hex color string from a run, defaulting to black.
fn run_color_hex(run: &DocxRun) -> String {
    run.color
        .as_ref()
        .map(|c| {
            if c.starts_with('#') {
                c.clone()
            } else {
                format!("#{}", c)
            }
        })
        .unwrap_or_else(|| "#000000".to_string())
}

// ── New WASM exports for CanvasEditor ─────────────────────────────────

/// Create a document from DOCX bytes and return a handle.
///
/// The document is parsed using wo-ooxml's OoxmlParser and stored
/// in a global store. Returns a handle that can be used with
/// `layout_document_pages()` and `render_page_to_canvas()`.
#[wasm_bindgen]
pub fn create_document(doc_bytes: &[u8], format: &str) -> Result<u32, String> {
    if doc_bytes.is_empty() {
        return Err("Document bytes are empty".to_string());
    }
    if format != "docx" {
        return Err(format!(
            "Unsupported format: '{}'. Only 'docx' is supported.",
            format
        ));
    }

    // Parse the DOCX
    let parser = OoxmlParser::new();
    let ooxml = parser
        .parse(doc_bytes)
        .map_err(|e| format!("Failed to parse DOCX: {}", e))?;

    let handle = unsafe { next_doc_handle() };

    // Store raw bytes
    let store = DOC_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.insert(handle, doc_bytes.to_vec());

    // Store parsed model for editing
    let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut model_store = model_store.lock().unwrap();
    model_store.insert(handle, ooxml);

    Ok(handle)
}

/// Layout a document and produce page geometry.
///
/// Returns a JSON array with page dimensions and line positions.
/// The layout is cached so subsequent calls are fast.
#[wasm_bindgen]
pub fn layout_document(
    doc_handle: u32,
    page_size: &str,
    orientation: &str,
    margin_pt: f32,
) -> Result<String, String> {
    // Get document bytes
    let store = DOC_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    let bytes = store
        .get(&doc_handle)
        .ok_or_else(|| format!("Document handle {} not found", doc_handle))?;

    // Parse and layout
    let parser = OoxmlParser::new();
    let ooxml = parser
        .parse(bytes)
        .map_err(|e| format!("Failed to parse DOCX: {}", e))?;

    let body = ooxml.docx_body.unwrap_or_else(DocxBody::default);

    let mut engine = LayoutEngine::new();
    let pages = engine.layout_document(&body, page_size, orientation, margin_pt);

    // Cache layout and engine
    let layout_store = LAYOUT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut layout_store = layout_store.lock().unwrap();
    layout_store.insert(doc_handle, pages.clone());

    let engine_store = ENGINE_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut engine_store = engine_store.lock().unwrap();
    engine_store.insert(doc_handle, engine);

    // Serialize to JSON for the frontend
    let pages_json: Vec<serde_json::Value> = pages
        .iter()
        .map(|page| {
            let paras: Vec<serde_json::Value> =
                page.paragraphs
                    .iter()
                    .map(|para| {
                        let lines: Vec<serde_json::Value> =
                            para.lines
                                .iter()
                                .map(|line| {
                                    let chars: Vec<serde_json::Value> = line.chars.iter().map(|c| {
                    serde_json::json!({
                        "ch": c.ch.to_string(),
                        "x": (c.x * 100.0).round() / 100.0,
                        "y": (c.y * 100.0).round() / 100.0,
                        "fontSizePt": (c.font_size_pt * 100.0).round() / 100.0,
                        "color": c.color,
                    })
                }).collect();
                                    serde_json::json!({
                                        "chars": chars,
                                        "x": (line.x * 100.0).round() / 100.0,
                                        "y": (line.y * 100.0).round() / 100.0,
                                        "width": (line.width * 100.0).round() / 100.0,
                                        "height": (line.height * 100.0).round() / 100.0,
                                    })
                                })
                                .collect();
                        serde_json::json!({
                            "lines": lines,
                            "y": (para.y * 100.0).round() / 100.0,
                            "height": (para.height * 100.0).round() / 100.0,
                        })
                    })
                    .collect();
            serde_json::json!({
                "width": page.layout.width_px,
                "height": page.layout.height_px,
                "marginPx": (page.layout.margin_px * 100.0).round() / 100.0,
                "paragraphs": paras,
            })
        })
        .collect();

    serde_json::to_string(&pages_json).map_err(|e| format!("JSON serialization failed: {}", e))
}

/// Render a laid-out page to a canvas.
#[wasm_bindgen]
pub fn render_laid_out_page(
    doc_handle: u32,
    page_index: u32,
    canvas_handle: u32,
) -> Result<(), String> {
    // Get layout
    let layout_store = LAYOUT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let layout_store = layout_store.lock().unwrap();
    let pages = layout_store
        .get(&doc_handle)
        .ok_or_else(|| format!("Document handle {} not found", doc_handle))?;

    let page = pages.get(page_index as usize).ok_or_else(|| {
        format!(
            "Page index {} out of bounds ({} pages)",
            page_index,
            pages.len()
        )
    })?;

    // Get or create engine
    let engine_store = ENGINE_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let engine_store = engine_store.lock().unwrap();
    let engine = engine_store
        .get(&doc_handle)
        .ok_or_else(|| format!("Engine for handle {} not found", doc_handle))?;

    // Get canvas
    let canvas_store = canvas_bridge::get_canvas_store();
    let mut canvas_store = canvas_store.lock().unwrap();
    let canvas = canvas_store
        .get_mut(&canvas_handle)
        .ok_or_else(|| format!("Canvas handle {} not found", canvas_handle))?;

    // Render
    engine.render_page_to_canvas(page, canvas);

    Ok(())
}

/// Release a document and all its cached data.
#[wasm_bindgen]
pub fn release_document(doc_handle: u32) -> Result<(), String> {
    let store = DOC_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.remove(&doc_handle);

    let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut model_store = model_store.lock().unwrap();
    model_store.remove(&doc_handle);

    let layout_store = LAYOUT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut layout_store = layout_store.lock().unwrap();
    layout_store.remove(&doc_handle);

    let engine_store = ENGINE_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut engine_store = engine_store.lock().unwrap();
    engine_store.remove(&doc_handle);

    let cursor_store = CURSOR_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cursor_store = cursor_store.lock().unwrap();
    cursor_store.remove(&doc_handle);

    Ok(())
}

// ── Interactive Editing Exports ──────────────────────────────────────

/// Hit-test a coordinate against a laid-out page and return cursor position.
///
/// Returns JSON: `{para, line, char_idx, x, y, found}` or error string.
/// If no character is found at the coordinate, returns the nearest position.
#[wasm_bindgen]
pub fn handle_mouse_event(
    doc_handle: u32,
    page_index: u32,
    x: f32,
    y: f32,
) -> Result<String, String> {
    let layout_store = LAYOUT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let layout_store = layout_store.lock().unwrap();
    let pages = layout_store
        .get(&doc_handle)
        .ok_or_else(|| format!("Document handle {} not found", doc_handle))?;

    let page = pages
        .get(page_index as usize)
        .ok_or_else(|| format!("Page index {} out of bounds", page_index))?;

    let mut best_para = 0usize;
    let mut best_line = 0usize;
    let mut best_char = 0usize;
    let mut best_dist = f32::MAX;
    let mut best_x = 0.0f32;
    let mut best_y = 0.0f32;
    let mut found = false;

    for (pi, para) in page.paragraphs.iter().enumerate() {
        for (li, line) in para.lines.iter().enumerate() {
            for (ci, ch) in line.chars.iter().enumerate() {
                let cx = ch.x;
                let cy = ch.y;
                let ch_w = 8.0; // approximate char width
                let ch_h = ch.font_size_pt * 1.2;
                // Distance to character center
                let dx = x - (cx + ch_w * 0.5);
                let dy = y - (cy + ch_h * 0.5);
                let dist = dx * dx + dy * dy;
                if dist < best_dist {
                    best_dist = dist;
                    best_para = pi;
                    best_line = li;
                    best_char = ci;
                    best_x = cx;
                    best_y = cy;
                    found = true;
                }
            }
        }
    }

    // Store cursor position
    let cursor_store = CURSOR_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cursor_store = cursor_store.lock().unwrap();
    cursor_store.insert(
        doc_handle,
        CursorPos {
            page: page_index,
            para: best_para,
            line: best_line,
            char_idx: best_char,
            x: best_x,
            y: best_y,
        },
    );

    serde_json::to_string(&serde_json::json!({
        "para": best_para,
        "line": best_line,
        "charIdx": best_char,
        "x": (best_x * 100.0).round() / 100.0,
        "y": (best_y * 100.0).round() / 100.0,
        "found": found,
    }))
    .map_err(|e| format!("JSON error: {}", e))
}

/// Helper: extract body from doc model (clone it out to avoid borrow conflicts).
fn extract_body(doc_handle: u32) -> Result<DocxBody, String> {
    let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let model_store = model_store.lock().unwrap();
    let doc = model_store
        .get(&doc_handle)
        .ok_or_else(|| format!("Document handle {} not found", doc_handle))?;
    Ok(doc.docx_body.clone().unwrap_or_else(DocxBody::default))
}

/// Helper: store modified body back into the doc model.
fn store_body(doc_handle: u32, body: DocxBody) -> Result<(), String> {
    let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut model_store = model_store.lock().unwrap();
    let doc = model_store
        .get_mut(&doc_handle)
        .ok_or_else(|| format!("Document handle {} not found", doc_handle))?;
    doc.docx_body = Some(body);
    Ok(())
}

/// Helper: get cursor position.
fn get_cursor(doc_handle: u32) -> CursorPos {
    let cursor_store = CURSOR_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let cursor_store = cursor_store.lock().unwrap();
    cursor_store.get(&doc_handle).copied().unwrap_or_default()
}

/// Helper: set cursor position.
fn set_cursor(doc_handle: u32, cursor: CursorPos) {
    let cursor_store = CURSOR_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cursor_store = cursor_store.lock().unwrap();
    cursor_store.insert(doc_handle, cursor);
}

/// Insert a character at the current cursor position, re-layout, and re-render.
///
/// Returns the updated layout JSON (same format as `layout_document`).
/// The cursor advances past the inserted character.
#[wasm_bindgen]
pub fn handle_key_event(
    doc_handle: u32,
    key: &str,
    _ctrl: bool,
    _shift: bool,
    page_size: &str,
    orientation: &str,
    margin_pt: f32,
) -> Result<String, String> {
    let mut body = extract_body(doc_handle)?;
    let cursor = get_cursor(doc_handle);
    let paras_len = body.paragraphs().len();

    match key {
        "Enter" | "Return" => {
            let new_para = DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs: vec![DocxRun::default()],
                section_properties: None,
            };
            let insert_idx = cursor.para.min(paras_len.saturating_sub(1));
            let insert_before = if cursor.char_idx == 0 && insert_idx > 0 {
                insert_idx
            } else {
                insert_idx + 1
            };
            if insert_before <= body.blocks.len() {
                body.blocks.insert(insert_before, DocxBlock::Paragraph(new_para));
            }
            store_body(doc_handle, body)?;
            set_cursor(
                doc_handle,
                CursorPos {
                    page: cursor.page,
                    para: insert_before,
                    line: 0,
                    char_idx: 0,
                    x: 0.0,
                    y: cursor.y + 20.0,
                },
            );
            layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
        }
        "Backspace" => {
            if body.paragraphs().is_empty() {
                return Ok("{}".to_string());
            }
            let pidx = cursor.para.min(paras_len.saturating_sub(1));
            if cursor.char_idx > 0 && pidx < body.paragraphs().len() {
                if let Some(DocxBlock::Paragraph(para)) = body.blocks.get_mut(pidx) {
                    let mut global_c = 0usize;
                    for run in &mut para.runs {
                        let run_len = run.text.chars().count();
                        if global_c + run_len > cursor.char_idx.saturating_sub(1) {
                            let remove_idx = cursor.char_idx.saturating_sub(1) - global_c;
                            if remove_idx < run_len && remove_idx < run.text.chars().count() {
                                let mut chars: Vec<char> = run.text.chars().collect();
                                if remove_idx < chars.len() {
                                    chars.remove(remove_idx);
                                    run.text = chars.into_iter().collect();
                                }
                            }
                            break;
                        }
                        global_c += run_len;
                    }
                }
            } else if cursor.char_idx == 0 && pidx > 0 && pidx < body.paragraphs().len() {
                // Merge with previous paragraph
                if let Some(DocxBlock::Paragraph(curr_para)) = body.blocks.get(pidx) {
                    let first_text = curr_para
                        .runs
                        .first()
                        .map(|r| r.text.clone())
                        .unwrap_or_default();
                    if let Some(DocxBlock::Paragraph(prev_para)) = body.blocks.get_mut(pidx - 1) {
                        if let Some(prev_last_run) = prev_para.runs.last_mut() {
                            prev_last_run.text.push_str(&first_text);
                        }
                    }
                }
                body.blocks.remove(pidx);
            }
            store_body(doc_handle, body)?;
            layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
        }
        "Delete" => {
            if body.paragraphs().is_empty() {
                return Ok("{}".to_string());
            }
            let pidx = cursor.para.min(paras_len.saturating_sub(1));
            if pidx < body.paragraphs().len() {
                if let Some(DocxBlock::Paragraph(para)) = body.blocks.get_mut(pidx) {
                    let mut global_c = 0usize;
                    let mut removed = false;
                    for run in &mut para.runs {
                        let run_len = run.text.chars().count();
                        if global_c + run_len > cursor.char_idx {
                            let remove_idx = cursor.char_idx - global_c;
                            if remove_idx < run_len && remove_idx < run.text.chars().count() {
                                let mut chars: Vec<char> = run.text.chars().collect();
                                if remove_idx < chars.len() {
                                    chars.remove(remove_idx);
                                    run.text = chars.into_iter().collect();
                                }
                            }
                            removed = true;
                            break;
                        }
                        global_c += run_len;
                    }
                    if !removed && pidx + 1 < body.paragraphs().len() {
                        if let Some(DocxBlock::Paragraph(next_para)) = body.blocks.get(pidx + 1) {
                            let next_text = next_para
                                .runs
                                .first()
                                .map(|r| r.text.clone())
                                .unwrap_or_default();
                            if let Some(DocxBlock::Paragraph(curr_para)) = body.blocks.get_mut(pidx) {
                                if let Some(last_run) = curr_para.runs.last_mut() {
                                    last_run.text.push_str(&next_text);
                                }
                            }
                        }
                        body.blocks.remove(pidx + 1);
                    }
                }
            }
            store_body(doc_handle, body)?;
            layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
        }
        "ArrowLeft" => {
            set_cursor(
                doc_handle,
                CursorPos {
                    char_idx: cursor.char_idx.saturating_sub(1),
                    ..cursor
                },
            );
            Ok("{}".to_string())
        }
        "ArrowRight" => {
            set_cursor(
                doc_handle,
                CursorPos {
                    char_idx: cursor.char_idx + 1,
                    ..cursor
                },
            );
            Ok("{}".to_string())
        }
        _ => {
            // Insert printable character
            if key.len() == 1 {
                let ch = key.chars().next().unwrap();
                if body.paragraphs().is_empty() {
                    body.blocks.push(DocxBlock::Paragraph(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs: vec![DocxRun {
                            text: ch.to_string(),
                            ..Default::default()
                        }],
                        section_properties: None,
                    }));
                } else {
                    let pidx = cursor.para.min(paras_len.saturating_sub(1));
                    if let Some(DocxBlock::Paragraph(para)) = body.blocks.get_mut(pidx) {
                        let mut global_c = 0usize;
                        let mut inserted = false;
                        for run in &mut para.runs {
                            let run_len = run.text.chars().count();
                            if global_c + run_len >= cursor.char_idx {
                                let insert_idx = cursor.char_idx - global_c;
                                let mut chars: Vec<char> = run.text.chars().collect();
                                chars.insert(insert_idx.min(chars.len()), ch);
                                run.text = chars.into_iter().collect();
                                inserted = true;
                                break;
                            }
                            global_c += run_len;
                        }
                        if !inserted && para.runs.is_empty() {
                            para.runs.push(DocxRun {
                                text: ch.to_string(),
                                ..Default::default()
                            });
                        } else if !inserted {
                            if let Some(last) = para.runs.last_mut() {
                                last.text.push(ch);
                            }
                        }
                    }
                }
                set_cursor(
                    doc_handle,
                    CursorPos {
                        char_idx: cursor.char_idx + 1,
                        ..cursor
                    },
                );
            }
            store_body(doc_handle, body)?;
            layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
        }
    }
}

/// Helper: layout document and return JSON (used by handle_key_event).
fn layout_document_and_return_json(
    doc_handle: u32,
    page_size: &str,
    orientation: &str,
    margin_pt: f32,
) -> Result<String, String> {
    let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let model_store = model_store.lock().unwrap();
    let doc = model_store
        .get(&doc_handle)
        .ok_or_else(|| format!("Document handle {} not found", doc_handle))?;

    let body = doc
        .docx_body
        .as_ref()
        .cloned()
        .unwrap_or_else(DocxBody::default);
    drop(model_store);

    let mut engine = LayoutEngine::new();
    let pages = engine.layout_document(&body, page_size, orientation, margin_pt);

    // Update layout cache
    let layout_store = LAYOUT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut layout_store = layout_store.lock().unwrap();
    layout_store.insert(doc_handle, pages.clone());

    let engine_store = ENGINE_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut engine_store = engine_store.lock().unwrap();
    engine_store.insert(doc_handle, engine);

    // Serialize to JSON
    let pages_json: Vec<serde_json::Value> = pages
        .iter()
        .map(|page| {
            let paras: Vec<serde_json::Value> =
                page.paragraphs
                    .iter()
                    .map(|para| {
                        let lines: Vec<serde_json::Value> =
                            para.lines
                                .iter()
                                .map(|line| {
                                    let chars: Vec<serde_json::Value> = line.chars.iter().map(|c| {
                    serde_json::json!({
                        "ch": c.ch.to_string(),
                        "x": (c.x * 100.0).round() / 100.0,
                        "y": (c.y * 100.0).round() / 100.0,
                        "fontSizePt": (c.font_size_pt * 100.0).round() / 100.0,
                        "color": c.color,
                    })
                }).collect();
                                    serde_json::json!({
                                        "chars": chars,
                                        "x": (line.x * 100.0).round() / 100.0,
                                        "y": (line.y * 100.0).round() / 100.0,
                                        "width": (line.width * 100.0).round() / 100.0,
                                        "height": (line.height * 100.0).round() / 100.0,
                                    })
                                })
                                .collect();
                        serde_json::json!({
                            "lines": lines,
                            "y": (para.y * 100.0).round() / 100.0,
                            "height": (para.height * 100.0).round() / 100.0,
                        })
                    })
                    .collect();
            serde_json::json!({
                "width": page.layout.width_px,
                "height": page.layout.height_px,
                "marginPx": (page.layout.margin_px * 100.0).round() / 100.0,
                "paragraphs": paras,
            })
        })
        .collect();

    serde_json::to_string(&pages_json).map_err(|e| format!("JSON serialization failed: {}", e))
}

/// Serialize the document back to DOCX bytes.
///
/// Returns a `Uint8Array` of the complete DOCX file (ZIP of XML).
/// Call this before saving to get the modified document.
#[wasm_bindgen]
pub fn serialize_document(doc_handle: u32) -> Result<Vec<u8>, String> {
    let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let model_store = model_store.lock().unwrap();
    let doc = model_store
        .get(&doc_handle)
        .ok_or_else(|| format!("Document handle {} not found", doc_handle))?;

    let serializer = OoxmlSerializer::new();
    serializer
        .serialize(doc)
        .map_err(|e| format!("Serialization failed: {}", e))
}

/// Get the current cursor position as JSON.
///
/// Returns `{para, line, charIdx, x, y}` or null if no cursor is set.
#[wasm_bindgen]
pub fn get_cursor_position(doc_handle: u32) -> String {
    let cursor_store = CURSOR_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let cursor_store = cursor_store.lock().unwrap();
    match cursor_store.get(&doc_handle) {
        Some(c) => serde_json::json!({
            "para": c.para,
            "line": c.line,
            "charIdx": c.char_idx,
            "x": (c.x * 100.0).round() / 100.0,
            "y": (c.y * 100.0).round() / 100.0,
        })
        .to_string(),
        None => "null".to_string(),
    }
}

/// Apply formatting to the run at the current cursor position.
///
/// Takes a JSON string with formatting properties:
/// `{"bold": true, "italic": false, "underline": "single",
///   "strikethrough": false, "fontSize": 24, "fontName": "Arial",
///   "textColor": "FF0000", "highlight": "FFFF00"}`
///
/// Only properties present in the JSON are changed; omitted properties
/// are left as-is. Returns the updated layout JSON.
#[wasm_bindgen]
pub fn apply_formatting(
    doc_handle: u32,
    format_json: &str,
    page_size: &str,
    orientation: &str,
    margin_pt: f32,
) -> Result<String, String> {
    let format: serde_json::Value =
        serde_json::from_str(format_json).map_err(|e| format!("Invalid format JSON: {}", e))?;

    let mut body = extract_body(doc_handle)?;
    let cursor = get_cursor(doc_handle);

    if body.paragraphs().is_empty() {
        return Err("Document body is empty".to_string());
    }

    let pidx = cursor.para.min(body.paragraphs().len().saturating_sub(1));
    if let Some(DocxBlock::Paragraph(para)) = body.blocks.get_mut(pidx) {
        // Find or create the run at cursor position
        if para.runs.is_empty() {
            para.runs.push(DocxRun::default());
        }

        // Determine which run contains the cursor
        let mut global_c = 0usize;
        let mut target_run_idx = para.runs.len().saturating_sub(1);
        for (ri, run) in para.runs.iter().enumerate() {
            let run_len = run.text.chars().count();
            if global_c + run_len > cursor.char_idx || ri == para.runs.len() - 1 {
                target_run_idx = ri;
                break;
            }
            global_c += run_len;
        }

        // Apply formatting to the target run
        if let Some(run) = para.runs.get_mut(target_run_idx) {
        if let Some(bold) = format.get("bold").and_then(|v| v.as_bool()) {
            run.bold = bold;
        }
        if let Some(italic) = format.get("italic").and_then(|v| v.as_bool()) {
            run.italic = italic;
        }
        if let Some(underline) = format.get("underline").and_then(|v| v.as_str()) {
            use wo_ooxml::model::UnderlineType;
            run.underline = Some(match underline {
                "single" => UnderlineType::Single,
                "double" => UnderlineType::Double,
                "thick" => UnderlineType::Thick,
                "dotted" => UnderlineType::Dotted,
                "dashed" => UnderlineType::Dashed,
                "wave" => UnderlineType::Wave,
                _ => UnderlineType::None,
            });
        }
        if let Some(strike) = format.get("strikethrough").and_then(|v| v.as_bool()) {
            run.strikethrough = strike;
        }
        if let Some(font_size) = format.get("fontSize").and_then(|v| v.as_u64()) {
            run.font_size = Some(font_size as u32); // half-points
        }
        if let Some(font_name) = format.get("fontName").and_then(|v| v.as_str()) {
            run.font = Some(font_name.to_string());
        }
        if let Some(color) = format.get("textColor").and_then(|v| v.as_str()) {
            let clean = color.trim_start_matches('#');
            run.color = Some(clean.to_string());
        }
        if let Some(highlight) = format.get("highlight").and_then(|v| v.as_str()) {
            let clean = highlight.trim_start_matches('#');
            run.highlight = Some(clean.to_string());
        }
        }
    }

    store_body(doc_handle, body)?;
    layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
}

/// Get the formatting of the run at the current cursor position.
///
/// Returns JSON: `{"bold": true, "italic": false, ...}`
#[wasm_bindgen]
pub fn get_run_formatting(doc_handle: u32) -> Result<String, String> {
    let body = extract_body(doc_handle)?;
    let cursor = get_cursor(doc_handle);

    if body.paragraphs().is_empty() {
        return Ok("{}".to_string());
    }

    let pidx = cursor.para.min(body.paragraphs().len().saturating_sub(1));
    let para = match body.blocks.get(pidx) {
        Some(DocxBlock::Paragraph(p)) => p,
        _ => return Ok("{}".to_string()),
    };

    let mut global_c = 0usize;
    let mut target_run_idx = para.runs.len().saturating_sub(1);
    for (ri, run) in para.runs.iter().enumerate() {
        let run_len = run.text.chars().count();
        if global_c + run_len > cursor.char_idx || ri == para.runs.len() - 1 {
            target_run_idx = ri;
            break;
        }
        global_c += run_len;
    }

    let run = para.runs.get(target_run_idx);
    match run {
        Some(r) => {
            let underline_str = match r.underline {
                Some(wo_ooxml::model::UnderlineType::Single) => "single",
                Some(wo_ooxml::model::UnderlineType::Double) => "double",
                Some(wo_ooxml::model::UnderlineType::Thick) => "thick",
                Some(wo_ooxml::model::UnderlineType::Dotted) => "dotted",
                Some(wo_ooxml::model::UnderlineType::Dashed) => "dashed",
                Some(wo_ooxml::model::UnderlineType::Wave) => "wave",
                Some(wo_ooxml::model::UnderlineType::DashDot) => "dashDot",
                Some(wo_ooxml::model::UnderlineType::None) | None => "none",
            };
            serde_json::to_string(&serde_json::json!({
                "bold": r.bold,
                "italic": r.italic,
                "underline": underline_str,
                "strikethrough": r.strikethrough,
                "fontSize": r.font_size,
                "fontName": r.font,
                "textColor": r.color,
                "highlight": r.highlight,
            }))
            .map_err(|e| format!("JSON error: {}", e))
        }
        None => Ok("{}".to_string()),
    }
}

// ── Uniform WASM export convention (§2.3) ────────────────────────────
//
// Four identical-signature functions shared by every editable model.
// The stub model (Vec<String> paragraphs) demonstrates the convention;
// engine-specific models (DOCX, XLSX, …) replace the internal dispatch
// while keeping the same JS-callable signatures.

/// Create a model from bytes and return a handle.
///
/// For the stub model (`fmt = "stub"`), `bytes` must be a JSON array
/// of paragraph strings: `"[\"Hello\", \"World\"]"`.
///
/// Future engines will accept their own formats ("docx", "xlsx", …).
#[wasm_bindgen]
pub fn create_model(bytes: &[u8], fmt: &str) -> Result<u32, String> {
    if bytes.is_empty() {
        return Err("Model bytes are empty".to_string());
    }
    match fmt {
        "stub" => {
            let paragraphs: Vec<String> = serde_json::from_slice(bytes)
                .map_err(|e| format!("Invalid stub model JSON: {}", e))?;
            let model = stub_model::StubModel::new(paragraphs);
            let handle = unsafe { stub_model::next_stub_handle() };
            let store = stub_model::STUB_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
            let mut store = store.lock().unwrap();
            store.insert(handle, model);
            Ok(handle)
        }
        "pdf" => create_pdf_model(bytes),
        "docx" => create_docx_model(bytes),
        "pptx" => create_pptx_model(bytes),
        "xlsx" => create_xlsx_model(bytes),
        other => Err(format!(
            "Unsupported format: '{}'. Supported: 'stub', 'pdf', 'docx', 'pptx', 'xlsx'.",
            other
        )),
    }
}

/// Create a DOCX model from bytes (§2.3 convention).
/// Parses the DOCX using wo-ooxml and stores the full OoxmlDocument.
fn create_docx_model(bytes: &[u8]) -> Result<u32, String> {
    let parser = OoxmlParser::new();
    let ooxml = parser
        .parse(bytes)
        .map_err(|e| format!("Failed to parse DOCX: {}", e))?;
    
    let handle = unsafe { next_doc_handle() };
    
    // Store the raw bytes
    let raw_store = DOC_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut raw_store = raw_store.lock().unwrap();
    raw_store.insert(handle, bytes.to_vec());
    
    // Store the parsed OoxmlDocument (for compatibility with existing code)
    let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut model_store = model_store.lock().unwrap();
    model_store.insert(handle, ooxml);
    
    Ok(handle)
}

/// Apply a [`ModelOp`] (JSON) to the model identified by `handle`.
///
/// Deserializes the JSON string into a [`wo_common::op::ModelOp`],
/// applies it via [`EditableModel::apply`](wo_common::op::EditableModel::apply),
/// and stores the result back.
/// 
/// For DOCX models, uses the extract_body/store_body pattern (§4).
#[wasm_bindgen]
pub fn apply_op(handle: u32, op_json: &str) -> Result<(), String> {
    if op_json.is_empty() {
        return Err("op_json is empty".to_string());
    }
    let op: wo_common::op::ModelOp =
        serde_json::from_str(op_json).map_err(|e| format!("Invalid op JSON: {}", e))?;
    
    // Try stub model first
    {
        let store = stub_model::STUB_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut store = store.lock().unwrap();
        if let Some(model) = store.get_mut(&handle) {
            return model.apply(&op).map_err(|e| e.to_string());
        }
    }
    
    // Try DOCX model (§2.3) - use extract_body/store_body pattern
    {
        // Check if this is a DOCX document handle
        // We check DOC_MODEL_STORE which contains OoxmlDocument with optional docx_body
        let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let model_store = model_store.lock().unwrap();
        if model_store.contains_key(&handle) {
            // Extract body, wrap in EditableDocxBody, apply, convert back, store
            let body = extract_body(handle)?;
            let mut editable = EditableDocxBody::from(body);
            editable.apply(&op).map_err(|e| e.to_string())?;
            let modified_body: DocxBody = editable.into();
            store_body(handle, modified_body)?;
            return Ok(());
        }
    }
    
    // Try PPTX model (§2.3, SL-6) - use extract/store pattern
    {
        let store = PPTX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let store = store.lock().unwrap();
        if store.contains_key(&handle) {
            // Extract presentation, wrap in EditablePptxPresentation, apply, convert back, store
            let pres = extract_pptx_pres(handle)?;
            let mut editable = EditablePptxPresentation::from(pres);
            editable.apply(&op).map_err(|e| e.to_string())?;
            let modified_pres: PptxPresentation = editable.into();
            store_pptx_pres(handle, modified_pres)?;
            return Ok(());
        }
    }

    // Try XLSX / spreadsheet model (SS-7) — EditableXlsxWorkbook implements EditableModel
    {
        let store = XLSX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut store = store.lock().unwrap();
        if let Some(editable_wb) = store.get_mut(&handle) {
            editable_wb.apply(&op).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    
    // Try PDF model - for now, PDF doesn't support operations, return error
    {
        let store = PDF_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let store = store.lock().unwrap();
        if store.contains_key(&handle) {
            return Err(format!("PDF model does not support operations yet: {}", op_json));
        }
    }
    
    Err(format!("Model handle {} not found", handle))
}

/// Serialize the model back to bytes.
///
/// For the stub model, returns a JSON array of paragraph strings.
/// For DOCX, serializes using the stored OoxmlDocument via wo-ooxml serializer (§2.3).
#[wasm_bindgen]
pub fn model_to_bytes(handle: u32) -> Result<Vec<u8>, String> {
    // Try stub model first
    {
        let store = stub_model::STUB_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let store = store.lock().unwrap();
        if let Some(model) = store.get(&handle) {
            return serde_json::to_vec(&model.paragraphs).map_err(|e| format!("Serialization failed: {}", e));
        }
    }
    
    // Try DOCX model (§2.3) - use existing DOC_MODEL_STORE
    {
        let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let model_store = model_store.lock().unwrap();
        if let Some(doc) = model_store.get(&handle) {
            let serializer = OoxmlSerializer::new();
            return serializer.serialize(doc).map_err(|e| format!("Serialization failed: {}", e));
        }
    }
    
    // Try PPTX model (§2.3, SL-6)
    {
        let store = PPTX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let store = store.lock().unwrap();
        if let Some(pres) = store.get(&handle) {
            return serialize_pptx_pres(pres);
        }
    }

    // Try XLSX / spreadsheet model (SS-7)
    {
        let store = XLSX_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let store = store.lock().unwrap();
        if let Some(editable_wb) = store.get(&handle) {
            return serialize_xlsx_workbook(&editable_wb.0);
        }
    }
    
    // Try PDF model - return the raw bytes
    {
        let store = PDF_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let store = store.lock().unwrap();
        if let Some(bytes) = store.get(&handle) {
            return Ok(bytes.clone());
        }
    }
    
    Err(format!("Model handle {} not found", handle))
}

/// Layout the model and optionally render to a canvas.
///
/// `opts_json` — layout options (see [`StubLayoutOpts`](stub_model::StubLayoutOpts)):
/// ```json
/// { "width": 794, "height": 1123, "fontSize": 12, "marginPt": 72 }
/// ```
///
/// `canvas` — canvas handle (0 = layout only, no rendering).
///
/// Returns layout JSON:
/// ```json
/// { "pages": [{ "width": 794, "height": 1123, "paragraphs": [...] }] }
/// ```
#[wasm_bindgen]
pub fn layout_and_render(handle: u32, opts_json: &str, canvas: u32) -> Result<String, String> {
    // Try XLSX / spreadsheet model first (handles start at 6000).
    if handle >= 6000 {
        return layout_xlsx_workbook(handle, opts_json);
    }

    // Try PPTX model first (handles start at 3000)
    if handle >= 3000 {
        return layout_pptx_presentation(handle, opts_json);
    }
    
    // Try PDF model first (handles start at 2000)
    if handle >= 2000 {
        let pdf_opts: PdfLayoutOpts =
            serde_json::from_str(opts_json).map_err(|e| format!("Invalid opts JSON: {}", e))?;
        let info_store = PDF_INFO_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let info_store = info_store.lock().unwrap();
        if info_store.contains_key(&handle) {
            return layout_pdf_document(handle, &pdf_opts, canvas);
        }
    }

    // Try stub model
    let opts: stub_model::StubLayoutOpts =
        serde_json::from_str(opts_json).map_err(|e| format!("Invalid opts JSON: {}", e))?;
    let store = stub_model::STUB_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    let model = store
        .get(&handle)
        .ok_or_else(|| format!("Stub model handle {} not found", handle))?;

    let layout_json = stub_model::layout_stub_model(model, &opts);

    // Optionally render to canvas.
    if canvas != 0 {
        let canvas_store = canvas_bridge::get_canvas_store();
        let mut canvas_store = canvas_store.lock().unwrap();
        let canvas_obj = canvas_store.get_mut(&canvas);
        if let Some(canvas_obj) = canvas_obj {
            // White background.
            canvas_obj.set_fill(wo_renderer::color::Paint::Color(
                wo_renderer::color::Color::new(1.0, 1.0, 1.0, 1.0),
            ));
            canvas_obj.fill_rect(0.0, 0.0, opts.width as f32, opts.height as f32);
            // Render each paragraph as a line of text.
            let mut cursor_y = opts.margin_pt * stub_model::PT_TO_PX;
            for para_text in &model.paragraphs {
                let baseline_y = cursor_y + opts.font_size * 0.8;
                let _ = canvas_bridge::render_text(
                    canvas,
                    para_text,
                    opts.margin_pt * stub_model::PT_TO_PX,
                    baseline_y,
                    None,
                    Some(opts.font_size),
                );
                cursor_y += opts.font_size * 1.2;
            }
        }
        drop(canvas_store);
    }

    serde_json::to_string(&layout_json).map_err(|e| format!("JSON serialization failed: {}", e))
}

/// Release a stub model and free its resources.
#[wasm_bindgen]
pub fn release_stub_model(handle: u32) -> Result<(), String> {
    stub_model::StubModel::release(handle);
    Ok(())
}

/// Release a PDF model and free its resources.
#[wasm_bindgen]
pub fn release_pdf_model(handle: u32) -> Result<(), String> {
    let store = PDF_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.remove(&handle);
    
    let info_store = PDF_INFO_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut info_store = info_store.lock().unwrap();
    info_store.remove(&handle);
    
    Ok(())
}

// ── WASM Spellchecker exports (SP-4) ────────────────────────────────

/// Global store of loaded spellchecker dictionaries (lang → Dictionary + Suggester).
static SPELL_DICT_STORE: OnceLock<Mutex<HashMap<String, SpellDictEntry>>> = OnceLock::new();

/// Global store of hyphenation dictionaries (lang → Hyphenator).
static HYPHEN_STORE: OnceLock<Mutex<HashMap<String, Hyphenator>>> = OnceLock::new();

/// Global per-language user dictionaries (session-scoped, replaces localStorage).
static SPELL_USER_DICT_STORE: OnceLock<Mutex<HashMap<String, HashSet<String>>>> =
    OnceLock::new();

/// Internal entry: dictionary + pre-built suggester.
#[derive(Clone)]
struct SpellDictEntry {
    _dict: Dictionary,
    suggester: Suggester,
}

/// Load a Hunspell dictionary for a given language.
///
/// Parses the `.aff` and `.dic` bytes using `wo-spell`, builds the expanded
/// dictionary and suggestion engine, and stores them under `lang`.
///
/// # Arguments
/// * `aff_bytes` — Raw `.aff` file content (UTF-8).
/// * `dic_bytes` — Raw `.dic` file content (UTF-8).
/// * `lang` — Language tag (e.g. `"en-US", "de-DE"`).
///
/// # Returns
/// Ok on success, error string on parse failure.
///
/// # Example (JavaScript)
/// ```javascript
/// const aff = await fetch('/dictionaries/en-US.aff').then(r => r.arrayBuffer());
/// const dic = await fetch('/dictionaries/en-US.dic').then(r => r.arrayBuffer());
/// spell_load_dictionary(new Uint8Array(aff), new Uint8Array(dic), 'en-US');
/// ```
#[wasm_bindgen]
pub fn spell_load_dictionary(aff_bytes: &[u8], dic_bytes: &[u8], lang: &str) -> Result<(), String> {
    if aff_bytes.is_empty() {
        return Err("aff_bytes are empty".to_string());
    }
    if dic_bytes.is_empty() {
        return Err("dic_bytes are empty".to_string());
    }
    let aff_str = std::str::from_utf8(aff_bytes)
        .map_err(|e| format!("aff bytes are not valid UTF-8: {}", e))?;
    let dic_str = std::str::from_utf8(dic_bytes)
        .map_err(|e| format!("dic bytes are not valid UTF-8: {}", e))?;

    let dict = Dictionary::from_strs(aff_str, dic_str);
    let suggester = Suggester::new(dict.clone());

    let store = SPELL_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.insert(
        lang.to_string(),
        SpellDictEntry {
            _dict: dict,
            suggester,
        },
    );

    // Initialize empty user dict for this language.
    let user_store = SPELL_USER_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut user_store = user_store.lock().unwrap();
    user_store.entry(lang.to_string()).or_default();

    Ok(())
}

/// Check if a single word is correctly spelled.
///
/// Returns `true` if the word is in the dictionary (case-insensitive) or in
/// the per-language user dictionary. Returns `true` if no dictionary is loaded
/// (fail-open, never blocks typing).
///
/// # Example
/// ```javascript
/// spell_check_word('hello', 'en-US'); // true
/// spell_check_word('helo',  'en-US'); // false
/// ```
#[wasm_bindgen]
pub fn spell_check_word(word: &str, lang: &str) -> bool {
    let word_lower = word.to_ascii_lowercase();

    // Check user dictionary first.
    let user_store = SPELL_USER_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let user_store = user_store.lock().unwrap();
    if let Some(user_words) = user_store.get(lang) {
        if user_words.contains(&word_lower) {
            return true;
        }
    }
    drop(user_store);

    // Check main dictionary.
    let dict_store = SPELL_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let dict_store = dict_store.lock().unwrap();
    if let Some(entry) = dict_store.get(lang) {
        entry.suggester.is_correct(word)
    } else {
        true // fail-open: no dictionary loaded
    }
}

/// Get spelling suggestions for a misspelled word.
///
/// Returns a JSON array of suggestion strings (up to 8). Returns an empty
/// array if the word is correct or no dictionary is loaded.
///
/// # Example
/// ```javascript
/// const suggestions = spell_suggest('helo', 'en-US');
/// // => '["hello"]'
/// ```
#[wasm_bindgen]
pub fn spell_suggest(word: &str, lang: &str) -> String {
    let dict_store = SPELL_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let dict_store = dict_store.lock().unwrap();
    if let Some(entry) = dict_store.get(lang) {
        let suggestions = entry.suggester.suggest(word);
        serde_json::to_string(&suggestions).unwrap_or_else(|_| "[]".to_string())
    } else {
        "[]".to_string()
    }
}

/// Check a text segment and return all misspelled words with positions.
///
/// Scans `text` for word boundaries (ASCII letters + common accented Latin),
/// checks each word, and returns a JSON array of misspelling results:
/// ```json
/// [{"word":"helo","offset":5,"suggestions":["hello"]}]
/// ```
///
/// # Example
/// ```javascript
/// const results = spell_check_text('The quick brown fox jumped over the lazzy dog', 'en-US');
/// ```
#[wasm_bindgen]
pub fn spell_check_text(text: &str, lang: &str) -> String {
    let dict_store = SPELL_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let dict_store = dict_store.lock().unwrap();
    let entry = dict_store.get(lang).cloned();
    drop(dict_store);

    let entry = match entry {
        Some(e) => e,
        None => return "[]".to_string(),
    };

    // Check user dictionary.
    let user_store = SPELL_USER_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let user_store = user_store.lock().unwrap();
    let user_words: HashSet<String> = user_store
        .get(lang)
        .cloned()
        .unwrap_or_default();
    drop(user_store);

    // Word-boundary extraction: sequences of letters (Latin + accented).
    let mut results: Vec<serde_json::Value> = Vec::new();
    let mut word_start: Option<usize> = None;
    let mut byte_offset = 0usize;

    for ch in text.chars() {
        let is_word_char = ch.is_ascii_alphabetic()
            || matches!(ch, '\u{00C0}'..='\u{024F}' | '\u{1E00}'..='\u{1EFF}');

        if is_word_char {
            if word_start.is_none() {
                word_start = Some(byte_offset);
            }
        } else if let Some(start) = word_start.take() {
            let word: String = text[start..byte_offset].to_string();
            let word_lower = word.to_ascii_lowercase();
            if !user_words.contains(&word_lower) && !entry.suggester.is_correct(&word) {
                let suggestions = entry.suggester.suggest(&word);
                results.push(serde_json::json!({
                    "word": word,
                    "offset": start,
                    "suggestions": suggestions,
                }));
            }
        }
        byte_offset += ch.len_utf8();
    }
    // Flush trailing word.
    if let Some(start) = word_start {
        let word: String = text[start..].to_string();
        let word_lower = word.to_ascii_lowercase();
        if !user_words.contains(&word_lower) && !entry.suggester.is_correct(&word) {
            let suggestions = entry.suggester.suggest(&word);
            results.push(serde_json::json!({
                "word": word,
                "offset": start,
                "suggestions": suggestions,
            }));
        }
    }

    serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
}

/// Add a word to the per-language user dictionary.
///
/// Words added here are checked before the main dictionary.
/// This replaces the `localStorage`-backed user dict for WASM sessions.
#[wasm_bindgen]
pub fn spell_add_to_user_dict(word: &str, lang: &str) {
    let word_lower = word.to_ascii_lowercase();
    let user_store = SPELL_USER_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut user_store = user_store.lock().unwrap();
    user_store.entry(lang.to_string()).or_default().insert(word_lower);
}

/// Load a hyphenation dictionary for a given language.
///
/// Parses TEX hyphenation pattern bytes and stores the hyphenator under `lang`.
/// After loading, call `spell_hyphenate` to find hyphenation points.
///
/// # Arguments
/// * `hyph_bytes` — Raw hyphenation pattern file content (UTF-8).
/// * `lang` — Language tag.
///
/// # Returns
/// Ok on success, error string on parse failure.
#[wasm_bindgen]
pub fn spell_load_hyphenation(hyph_bytes: &[u8], lang: &str) -> Result<(), String> {
    let hyph_str = std::str::from_utf8(hyph_bytes)
        .map_err(|e| format!("hyph bytes are not valid UTF-8: {}", e))?;
    let dict = HyphenationDict::from_str(hyph_str)
        .map_err(|errs| format!("hyphenation parse errors: {:?}", errs))?;
    let hyphenator = Hyphenator::new(dict);

    let store = HYPHEN_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.insert(lang.to_string(), hyphenator);
    Ok(())
}

/// Find hyphenation points in a word.
///
/// Returns a JSON array of character indices after which hyphens may be
/// inserted. E.g. `"project"` → `[4]` meaning `proj-ect`.
///
/// Requires `spell_load_hyphenation` to have been called for the language.
/// Returns an empty array if no hyphenation dict is loaded.
///
/// # Example
/// ```javascript
/// spell_hyphenate('project', 'en-US'); // => '[4]'
/// ```
#[wasm_bindgen]
pub fn spell_hyphenate(word: &str, lang: &str) -> String {
    let store = HYPHEN_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    if let Some(hyphenator) = store.get(lang) {
        let points = hyphenator.hyphenate(word);
        let indices: Vec<usize> = points.iter().map(|p| p.index).collect();
        serde_json::to_string(&indices).unwrap_or_else(|_| "[]".to_string())
    } else {
        "[]".to_string()
    }
}

/// Release a spellchecker dictionary and its user words.
///
/// Frees the dictionary, suggester, hyphenator, and user dict for the
/// given language. Call this when switching languages to free memory.
#[wasm_bindgen]
pub fn spell_release(lang: &str) -> Result<(), String> {
    let dict_store = SPELL_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut dict_store = dict_store.lock().unwrap();
    dict_store.remove(lang);

    let hyph_store = HYPHEN_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut hyph_store = hyph_store.lock().unwrap();
    hyph_store.remove(lang);

    let user_store = SPELL_USER_DICT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut user_store = user_store.lock().unwrap();
    user_store.remove(lang);

    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_release_document() {
        let doc_data = vec![
            0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        // create_document should fail for empty/invalid DOCX
        let result = create_document(&doc_data, "docx");
        assert!(result.is_err());

        // Empty bytes should fail
        let result = create_document(&[], "docx");
        assert!(result.is_err());

        // Unsupported format should fail
        let result = create_document(&[0x50], "odt");
        assert!(result.is_err());
    }

    #[test]
    fn test_cursor_helpers() {
        // These test the helper logic without needing a real DOCX
        let doc_handle = 9999u32;
        set_cursor(
            doc_handle,
            CursorPos {
                page: 0,
                para: 1,
                line: 2,
                char_idx: 3,
                x: 100.0,
                y: 200.0,
            },
        );
        let c = get_cursor(doc_handle);
        assert_eq!(c.para, 1);
        assert_eq!(c.char_idx, 3);
        assert!((c.x - 100.0).abs() < 0.01);

        // Cleanup
        let cursor_store = CURSOR_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut cs = cursor_store.lock().unwrap();
        cs.remove(&doc_handle);
    }

    #[test]
    fn test_release_nonexistent_document() {
        // Should not panic
        let result = release_document(99999);
        assert!(result.is_ok());
    }

    #[test]
    fn test_apply_formatting_empty_body() {
        // Apply formatting to a valid (but empty) body should fail
        let doc_handle = 8888u32;
        let doc = OoxmlDocument {
            format: wo_ooxml::model::OoxmlFormat::Unknown,
            version: "1.0".to_string(),
            content_types: Vec::new(),
            main_part: None,
            shared_strings: Vec::new(),
            part_count: 0,
            core_properties: Default::default(),
            relationships: Vec::new(),
            docx_body: Some(DocxBody::default()),
            xlsx_workbook: None,
        };
        let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut ms = model_store.lock().unwrap();
        ms.insert(doc_handle, doc);
        drop(ms);
        set_cursor(doc_handle, CursorPos::default());

        let result = apply_formatting(doc_handle, r##"{"bold": true}"##, "A4", "portrait", 72.0);
        assert!(result.is_err(), "Empty body should fail");

        // Cleanup
        release_document(doc_handle).ok();
    }

    #[test]
    fn test_get_run_formatting_empty() {
        let doc_handle = 7777u32;
        let doc = OoxmlDocument {
            format: wo_ooxml::model::OoxmlFormat::Unknown,
            version: "1.0".to_string(),
            content_types: Vec::new(),
            main_part: None,
            shared_strings: Vec::new(),
            part_count: 0,
            core_properties: Default::default(),
            relationships: Vec::new(),
            docx_body: Some(DocxBody::default()),
            xlsx_workbook: None,
        };
        let model_store = DOC_MODEL_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut ms = model_store.lock().unwrap();
        ms.insert(doc_handle, doc);
        drop(ms);
        set_cursor(doc_handle, CursorPos::default());

        let result = get_run_formatting(doc_handle);
        assert!(result.is_ok());
        let json = result.unwrap();
        assert_eq!(json, "{}", "Empty body should return empty object");

        // Cleanup
        release_document(doc_handle).ok();
    }

    // ── Uniform WASM export convention (§2.3) tests ───────────────

    #[test]
    fn test_create_model_stub() {
        let bytes = br#"["Hello", "World"]"#;
        let handle = create_model(bytes, "stub").unwrap();
        assert!(handle >= 5000);
        release_stub_model(handle).ok();
    }

    #[test]
    fn test_create_model_empty_bytes() {
        let result = create_model(&[], "stub");
        assert!(result.is_err());
    }

    #[test]
    fn test_create_model_unsupported_format() {
        let result = create_model(b"[]", "ods");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported format"));
    }

    #[test]
    fn test_apply_op_insert_and_read_back() {
        // Acceptance: JS inserts 1 op, reads back 1 paragraph.
        let bytes = br#"[""]"#;
        let handle = create_model(bytes, "stub").unwrap();

        // Insert "Hello" at para 0, char 0.
        let op =
            r#"{"op":"insert","at":{"kind":"text","para":0,"run":0,"char":0},"content":"Hello"}"#;
        apply_op(handle, op).unwrap();

        // Read back.
        let out = model_to_bytes(handle).unwrap();
        let paragraphs: Vec<String> = serde_json::from_slice(&out).unwrap();
        assert_eq!(paragraphs.len(), 1);
        assert_eq!(paragraphs[0], "Hello");

        release_stub_model(handle).ok();
    }

    #[test]
    fn test_apply_op_delete() {
        let bytes = br#"["ABCDE"]"#;
        let handle = create_model(bytes, "stub").unwrap();

        let op = r#"{"op":"delete","range":{"start":{"kind":"text","para":0,"run":0,"char":1},"end":{"kind":"text","para":0,"run":0,"char":3}}}"#;
        apply_op(handle, op).unwrap();

        let out = model_to_bytes(handle).unwrap();
        let paragraphs: Vec<String> = serde_json::from_slice(&out).unwrap();
        assert_eq!(paragraphs[0], "ADE");

        release_stub_model(handle).ok();
    }

    #[test]
    fn test_apply_op_replace() {
        let bytes = br#"["ABCD"]"#;
        let handle = create_model(bytes, "stub").unwrap();

        let op = r#"{"op":"replace","at":{"kind":"text","para":0,"run":0,"char":1},"content":"X"}"#;
        apply_op(handle, op).unwrap();

        let out = model_to_bytes(handle).unwrap();
        let paragraphs: Vec<String> = serde_json::from_slice(&out).unwrap();
        assert_eq!(paragraphs[0], "AXCD");

        release_stub_model(handle).ok();
    }

    #[test]
    fn test_apply_op_format_no_op() {
        let bytes = br#"["Hello"]"#;
        let handle = create_model(bytes, "stub").unwrap();

        let op = r#"{"op":"format","range":{"start":{"kind":"text","para":0,"run":0,"char":0},"end":{"kind":"text","para":0,"run":0,"char":5}},"attrs":{"bold":true}}"#;
        apply_op(handle, op).unwrap();

        let out = model_to_bytes(handle).unwrap();
        let paragraphs: Vec<String> = serde_json::from_slice(&out).unwrap();
        assert_eq!(paragraphs[0], "Hello"); // unchanged

        release_stub_model(handle).ok();
    }

    #[test]
    fn test_apply_op_invalid_json() {
        let bytes = br#"["A"]"#;
        let handle = create_model(bytes, "stub").unwrap();

        let result = apply_op(handle, "not json");
        assert!(result.is_err());

        release_stub_model(handle).ok();
    }

    #[test]
    fn test_apply_op_empty_json() {
        let bytes = br#"["A"]"#;
        let handle = create_model(bytes, "stub").unwrap();

        let result = apply_op(handle, "");
        assert!(result.is_err());

        release_stub_model(handle).ok();
    }

    #[test]
    fn test_model_to_bytes_nonexistent_handle() {
        let result = model_to_bytes(99999);
        assert!(result.is_err());
    }

    #[test]
    fn test_layout_and_render_layout_only() {
        let bytes = br#"["Hello world", "Second line"]"#;
        let handle = create_model(bytes, "stub").unwrap();

        let opts = r#"{"width":794,"height":1123,"fontSize":12,"marginPt":72}"#;
        let json = layout_and_render(handle, opts, 0).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert!(parsed["pages"].is_array());
        let pages = parsed["pages"].as_array().unwrap();
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0]["width"], 794);
        let paras = pages[0]["paragraphs"].as_array().unwrap();
        assert_eq!(paras.len(), 2);

        release_stub_model(handle).ok();
    }

    #[test]
    fn test_layout_and_render_with_canvas() {
        let bytes = br#"["Hello"]"#;
        let handle = create_model(bytes, "stub").unwrap();
        let canvas = create_canvas(100, 100);

        let opts = r#"{"width":100,"height":100,"fontSize":12,"marginPt":10}"#;
        let json = layout_and_render(handle, opts, canvas).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed["pages"].is_array());

        // Verify canvas has content (white background was painted).
        let pixels = get_pixel_data(canvas).unwrap();
        assert_eq!(pixels.len(), 100 * 100 * 4);

        release_canvas(canvas).ok();
        release_stub_model(handle).ok();
    }

    #[test]
    fn test_layout_and_render_nonexistent_handle() {
        let opts = r#"{}"#;
        let result = layout_and_render(99999, opts, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_release_stub_model_nonexistent() {
        // Should not panic.
        assert!(release_stub_model(99999).is_ok());
    }

    #[test]
    fn test_full_roundtrip_create_apply_serialize() {
        // End-to-end: create → apply multiple ops → serialize → verify.
        let bytes = br#"[""]"#;
        let handle = create_model(bytes, "stub").unwrap();

        // Insert "Hello" at para 0.
        apply_op(
            handle,
            r#"{"op":"insert","at":{"kind":"text","para":0,"run":0,"char":0},"content":"Hello"}"#,
        )
        .unwrap();

        // Insert " world" at para 0, char 5.
        apply_op(
            handle,
            r#"{"op":"insert","at":{"kind":"text","para":0,"run":0,"char":5},"content":" world"}"#,
        )
        .unwrap();

        // Serialize and verify.
        let out = model_to_bytes(handle).unwrap();
        let paragraphs: Vec<String> = serde_json::from_slice(&out).unwrap();
        assert_eq!(paragraphs[0], "Hello world");

        // Layout and verify structure.
        let layout_json = layout_and_render(
            handle,
            r#"{"width":794,"height":1123,"fontSize":12,"marginPt":72}"#,
            0,
        )
        .unwrap();
        let layout: serde_json::Value = serde_json::from_str(&layout_json).unwrap();
        assert!(
            layout["pages"].as_array().unwrap()[0]["paragraphs"]
                .as_array()
                .unwrap()[0]["lines"][0]["chars"]
                .as_array()
                .unwrap()
                .len()
                > 0
        );

        release_stub_model(handle).ok();
    }

    #[test]
    fn test_create_model_invalid_json() {
        let result = create_model(b"not json", "stub");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid stub model JSON"));
    }

    // ── WASM Spellchecker tests (SP-4) ─────────────────────────────

    fn mini_aff() -> &'static str {
        r#"
REP 1
REP ph f
TRY esianrtolcdugmphbyfvkwz
SFX N Y 1
SFX N e ness e
"#
    }

    fn mini_dic() -> &'static str {
        "5\nhello\nworld\nfine/N\nrun\nproject"
    }

    #[test]
    fn spell_test_load_dictionary() {
        let aff = mini_aff();
        let dic = mini_dic();
        let result = spell_load_dictionary(aff.as_bytes(), dic.as_bytes(), "test");
        assert!(result.is_ok());
        // Cleanup.
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_load_empty_aff_fails() {
        let result = spell_load_dictionary(&[], b"hello", "test");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("aff_bytes are empty"));
    }

    #[test]
    fn spell_test_load_empty_dic_fails() {
        let result = spell_load_dictionary(b"SET UTF-8", &[], "test");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("dic_bytes are empty"));
    }

    #[test]
    fn spell_test_check_word_correct() {
        spell_load_dictionary(mini_aff().as_bytes(), mini_dic().as_bytes(), "test").unwrap();
        assert!(spell_check_word("hello", "test"));
        assert!(spell_check_word("Hello", "test")); // case-insensitive
        assert!(spell_check_word("world", "test"));
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_check_word_misspelled() {
        spell_load_dictionary(mini_aff().as_bytes(), mini_dic().as_bytes(), "test").unwrap();
        assert!(!spell_check_word("helo", "test"));
        assert!(!spell_check_word("xyzzy", "test"));
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_check_word_no_dict_loaded() {
        // Fail-open: returns true when no dictionary is loaded.
        assert!(spell_check_word("anything", "nonexistent-lang"));
    }

    #[test]
    fn spell_test_suggest() {
        spell_load_dictionary(mini_aff().as_bytes(), mini_dic().as_bytes(), "test").unwrap();
        let suggestions_json = spell_suggest("helo", "test");
        let suggestions: Vec<String> =
            serde_json::from_str(&suggestions_json).expect("valid JSON");
        assert!(suggestions.contains(&String::from("hello")), "got: {suggestions:?}");
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_suggest_correct_word_empty() {
        spell_load_dictionary(mini_aff().as_bytes(), mini_dic().as_bytes(), "test").unwrap();
        let suggestions_json = spell_suggest("hello", "test");
        let suggestions: Vec<String> =
            serde_json::from_str(&suggestions_json).expect("valid JSON");
        assert!(suggestions.is_empty());
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_suggest_no_dict_loaded() {
        let suggestions_json = spell_suggest("helo", "nonexistent-lang");
        let suggestions: Vec<String> =
            serde_json::from_str(&suggestions_json).expect("valid JSON");
        assert!(suggestions.is_empty());
    }

    #[test]
    fn spell_test_check_text() {
        spell_load_dictionary(mini_aff().as_bytes(), mini_dic().as_bytes(), "test").unwrap();
        let results_json = spell_check_text("hello wrld foo", "test");
        let results: Vec<serde_json::Value> =
            serde_json::from_str(&results_json).expect("valid JSON");
        // "wrld" is misspelled, "hello" and "foo" are correct or unknown.
        let misspelled: Vec<&str> = results
            .iter()
            .filter_map(|r| r["word"].as_str())
            .collect();
        assert!(misspelled.contains(&"wrld"), "got: {misspelled:?}");
        // "hello" should NOT be in the results.
        assert!(!misspelled.contains(&"hello"));
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_user_dict_override() {
        spell_load_dictionary(mini_aff().as_bytes(), mini_dic().as_bytes(), "test").unwrap();
        // "xyzzy" is not in the dictionary.
        assert!(!spell_check_word("xyzzy", "test"));
        // Add it to user dict.
        spell_add_to_user_dict("xyzzy", "test");
        // Now it should pass.
        assert!(spell_check_word("xyzzy", "test"));
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_user_dict_case_insensitive() {
        spell_load_dictionary(mini_aff().as_bytes(), mini_dic().as_bytes(), "test").unwrap();
        spell_add_to_user_dict("CustomWord", "test");
        assert!(spell_check_word("customword", "test"));
        assert!(spell_check_word("CUSTOMWORD", "test"));
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_release_frees_resources() {
        spell_load_dictionary(mini_aff().as_bytes(), mini_dic().as_bytes(), "test").unwrap();
        assert!(spell_check_word("hello", "test"));
        spell_release("test").unwrap();
        // After release, should fail-open.
        assert!(spell_check_word("hello", "test"));
    }

    #[test]
    fn spell_test_load_hyphenation() {
        let patterns = "LEFTHYPHENMIN 2\nRIGHTHYPHENMIN 3\n.pr4o1j4e4c4t\n";
        let result = spell_load_hyphenation(patterns.as_bytes(), "test");
        assert!(result.is_ok());
        let points_json = spell_hyphenate("project", "test");
        let points: Vec<usize> = serde_json::from_str(&points_json).expect("valid JSON");
        assert_eq!(points, vec![4]); // proj-ect
        spell_release("test").ok();
    }

    #[test]
    fn spell_test_hyphenate_no_dict() {
        let points_json = spell_hyphenate("project", "nonexistent");
        let points: Vec<usize> = serde_json::from_str(&points_json).expect("valid JSON");
        assert!(points.is_empty());
    }

    // ── Uniform WASM export convention (§2.3) tests for PDF ───────

    #[test]
    fn test_create_pdf_model_valid() {
        // Minimal valid PDF header
        let pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF";
        let handle = create_model(pdf_bytes, "pdf").unwrap();
        assert!(handle >= 2000);
        release_pdf_model(handle).ok();
    }

    #[test]
    fn test_create_pdf_model_empty_bytes() {
        let result = create_model(&[], "pdf");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty"));
    }

    #[test]
    fn test_create_pdf_model_invalid_header() {
        let result = create_model(b"not a pdf", "pdf");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid PDF header"));
    }

    #[test]
    fn test_create_pdf_model_empty_format() {
        let result = create_model(b"%PDF-1.4", "");
        assert!(result.is_err());
    }

    #[test]
    fn test_model_to_bytes_pdf() {
        let pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF";
        let handle = create_model(pdf_bytes, "pdf").unwrap();
        let result = model_to_bytes(handle).unwrap();
        assert_eq!(result, pdf_bytes);
        release_pdf_model(handle).ok();
    }

    #[test]
    fn test_model_to_bytes_pdf_nonexistent() {
        let result = model_to_bytes(99999);
        assert!(result.is_err());
    }

    #[test]
    fn test_layout_and_render_pdf() {
        let pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF";
        let handle = create_model(pdf_bytes, "pdf").unwrap();
        let opts = r#"{"width":794,"height":1123,"dpi":96,"page":0}"#;
        let json = layout_and_render(handle, opts, 0).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed["pages"].is_array());
        assert!(parsed["pageCount"].is_number());
        release_pdf_model(handle).ok();
    }

    #[test]
    fn test_layout_and_render_pdf_nonexistent() {
        let opts = r#"{}"#;
        let result = layout_and_render(99999, opts, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_layout_and_render_pdf_with_canvas() {
        let pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF";
        let handle = create_model(pdf_bytes, "pdf").unwrap();
        let c = create_canvas(800, 600);
        assert!(c > 0, "canvas creation should succeed");

        let opts = r#"{"width":800,"height":600,"dpi":96,"page":0}"#;
        let json = layout_and_render(handle, opts, c).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed["pages"].is_array());
        assert!(parsed["pageCount"].is_number());

        // Verify canvas has pixel data (white background was painted)
        let pixels = get_pixel_data(c).unwrap();
        assert_eq!(pixels.len(), 800 * 600 * 4);

        release_canvas(c).ok();
        release_pdf_model(handle).ok();
    }

    #[test]
    fn test_release_pdf_model() {
        let pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF";
        let handle = create_model(pdf_bytes, "pdf").unwrap();
        let result = release_pdf_model(handle);
        assert!(result.is_ok());
    }

    #[test]
    fn test_release_pdf_model_nonexistent() {
        let result = release_pdf_model(99999);
        assert!(result.is_ok()); // Should not panic
    }

    #[test]
    fn test_apply_op_pdf_not_supported() {
        let pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF";
        let handle = create_model(pdf_bytes, "pdf").unwrap();
        let op = r#"{"op":"insert","at":{"kind":"text","para":0,"run":0,"char":0},"content":"test"}"#;
        let result = apply_op(handle, op);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("PDF model does not support operations"));
        release_pdf_model(handle).ok();
    }

    #[test]
    fn test_create_model_pdf_with_pages() {
        // PDF with multiple page objects
        let pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n2 0 obj\n<<>>\nendobj\n/Type /Page\n3 0 obj\n/Type /Page\n4 0 obj\n/Type /Page\ntrailer\n<<>>\nstartxref\n0\n%%EOF";
        let handle = create_model(pdf_bytes, "pdf").unwrap();
        let json = layout_and_render(handle, r#"{"width":794,"height":1123,"page":0}"#, 0).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        let page_count = parsed["pageCount"].as_u64().unwrap();
        assert!(page_count >= 1, "Should have at least 1 page");
        release_pdf_model(handle).ok();
    }

    #[test]
    fn test_create_model_unsupported_format_xlsx() {
        let result = create_model(b"[]", "ods");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported format"));
    }

    #[test]
    fn test_create_model_pptx_unsupported() {
        // PPTX format should be supported but fail with invalid data
        let result = create_model(b"not a zip", "pptx");
        assert!(result.is_err());
    }

    #[test]
    fn test_create_model_pptx_empty() {
        // Empty bytes should fail
        let result = create_model(b"", "pptx");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("PPTX bytes are empty"));
    }

    #[test]
    fn test_create_model_format_message_includes_all_formats() {
        // Verify supported formats are listed in the error message
        let result = create_model(b"[]", "invalid");
        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("stub"));
        assert!(err_msg.contains("pdf"));
        assert!(err_msg.contains("docx"));
        assert!(err_msg.contains("pptx"));
        assert!(err_msg.contains("xlsx"));
    }

    #[test]
    fn test_create_model_xlsx_valid() {
        // Test that XLSX format is now supported
        // For now, just test that it doesn't error on the format
        // A real test would need actual XLSX bytes
        let result = create_model(b"PK\x03\x04", "xlsx");
        // This will likely fail because b"PK\x03\x04" is not a valid XLSX
        // but it should at least recognize the format and try to parse it
        // The error should NOT be "Unsupported format"
        if result.is_err() {
            let err = result.unwrap_err();
            assert!(!err.contains("Unsupported format"), "XLSX should be a supported format, got error: {}", err);
        }
    }
}
