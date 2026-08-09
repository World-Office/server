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

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;
use wo_ooxml::model::{DocxBody, DocxParagraph, DocxParagraphProperties, DocxRun, OoxmlDocument};
use wo_ooxml::parser::OoxmlParser;
use wo_ooxml::serializer::OoxmlSerializer;

// Re-export canvas functions
pub use canvas_bridge::{create_canvas, flush_to_canvas, get_pixel_data};
pub use layout::{LaidOutChar, LaidOutLine, LaidOutPage, LaidOutParagraph, LayoutEngine, PageLayout};

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

    for para in &body.paragraphs {
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

    // Render tables
    for table in &body.tables {
        if cursor_y + 40.0 > (canvas_height as f32) - margin {
            break;
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
        return Err(format!("Unsupported format: '{}'. Only 'docx' is supported.", format));
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
pub fn layout_document(doc_handle: u32, page_size: &str, orientation: &str, margin_pt: f32) -> Result<String, String> {
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
    let pages_json: Vec<serde_json::Value> = pages.iter().map(|page| {
        let paras: Vec<serde_json::Value> = page.paragraphs.iter().map(|para| {
            let lines: Vec<serde_json::Value> = para.lines.iter().map(|line| {
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
            }).collect();
            serde_json::json!({
                "lines": lines,
                "y": (para.y * 100.0).round() / 100.0,
                "height": (para.height * 100.0).round() / 100.0,
            })
        }).collect();
        serde_json::json!({
            "width": page.layout.width_px,
            "height": page.layout.height_px,
            "marginPx": (page.layout.margin_px * 100.0).round() / 100.0,
            "paragraphs": paras,
        })
    }).collect();

    serde_json::to_string(&pages_json).map_err(|e| format!("JSON serialization failed: {}", e))
}

/// Render a laid-out page to a canvas.
#[wasm_bindgen]
pub fn render_laid_out_page(doc_handle: u32, page_index: u32, canvas_handle: u32) -> Result<(), String> {
    // Get layout
    let layout_store = LAYOUT_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let layout_store = layout_store.lock().unwrap();
    let pages = layout_store
        .get(&doc_handle)
        .ok_or_else(|| format!("Document handle {} not found", doc_handle))?;

    let page = pages
        .get(page_index as usize)
        .ok_or_else(|| format!("Page index {} out of bounds ({} pages)", page_index, pages.len()))?;

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
    cursor_store.insert(doc_handle, CursorPos {
        page: page_index,
        para: best_para,
        line: best_line,
        char_idx: best_char,
        x: best_x,
        y: best_y,
    });

    serde_json::to_string(&serde_json::json!({
        "para": best_para,
        "line": best_line,
        "charIdx": best_char,
        "x": (best_x * 100.0).round() / 100.0,
        "y": (best_y * 100.0).round() / 100.0,
        "found": found,
    })).map_err(|e| format!("JSON error: {}", e))
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
    let paras_len = body.paragraphs.len();

    match key {
        "Enter" | "Return" => {
            let new_para = DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs: vec![DocxRun::default()],
            };
            let insert_idx = cursor.para.min(paras_len.saturating_sub(1));
            let insert_before = if cursor.char_idx == 0 && insert_idx > 0 {
                insert_idx
            } else {
                insert_idx + 1
            };
            if insert_before <= body.paragraphs.len() {
                body.paragraphs.insert(insert_before, new_para);
            }
            store_body(doc_handle, body)?;
            set_cursor(doc_handle, CursorPos {
                page: cursor.page,
                para: insert_before,
                line: 0,
                char_idx: 0,
                x: 0.0,
                y: cursor.y + 20.0,
            });
            layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
        },
        "Backspace" => {
            if body.paragraphs.is_empty() {
                return Ok("{}".to_string());
            }
            let pidx = cursor.para.min(paras_len.saturating_sub(1));
            if cursor.char_idx > 0 && pidx < body.paragraphs.len() {
                let para = &mut body.paragraphs[pidx];
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
            } else if cursor.char_idx == 0 && pidx > 0 && pidx < body.paragraphs.len() {
                // Merge with previous paragraph
                let first_text = body.paragraphs[pidx].runs.first()
                    .map(|r| r.text.clone())
                    .unwrap_or_default();
                if let Some(prev_last_run) = body.paragraphs[pidx - 1].runs.last_mut() {
                    prev_last_run.text.push_str(&first_text);
                }
                body.paragraphs.remove(pidx);
            }
            store_body(doc_handle, body)?;
            layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
        },
        "Delete" => {
            if body.paragraphs.is_empty() {
                return Ok("{}".to_string());
            }
            let pidx = cursor.para.min(paras_len.saturating_sub(1));
            if pidx < body.paragraphs.len() {
                let para = &mut body.paragraphs[pidx];
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
                if !removed && pidx + 1 < body.paragraphs.len() {
                    let next_text = body.paragraphs[pidx + 1].runs.first()
                        .map(|r| r.text.clone())
                        .unwrap_or_default();
                    if let Some(last_run) = body.paragraphs[pidx].runs.last_mut() {
                        last_run.text.push_str(&next_text);
                    }
                    body.paragraphs.remove(pidx + 1);
                }
            }
            store_body(doc_handle, body)?;
            layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
        },
        "ArrowLeft" => {
            set_cursor(doc_handle, CursorPos {
                char_idx: cursor.char_idx.saturating_sub(1),
                ..cursor
            });
            Ok("{}".to_string())
        },
        "ArrowRight" => {
            set_cursor(doc_handle, CursorPos {
                char_idx: cursor.char_idx + 1,
                ..cursor
            });
            Ok("{}".to_string())
        },
        _ => {
            // Insert printable character
            if key.len() == 1 {
                let ch = key.chars().next().unwrap();
                if body.paragraphs.is_empty() {
                    body.paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs: vec![DocxRun {
                            text: ch.to_string(),
                            ..Default::default()
                        }],
                    });
                } else {
                    let pidx = cursor.para.min(paras_len.saturating_sub(1));
                    let para = &mut body.paragraphs[pidx];
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
                set_cursor(doc_handle, CursorPos {
                    char_idx: cursor.char_idx + 1,
                    ..cursor
                });
            }
            store_body(doc_handle, body)?;
            layout_document_and_return_json(doc_handle, page_size, orientation, margin_pt)
        },
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

    let body = doc.docx_body.as_ref().cloned()
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
    let pages_json: Vec<serde_json::Value> = pages.iter().map(|page| {
        let paras: Vec<serde_json::Value> = page.paragraphs.iter().map(|para| {
            let lines: Vec<serde_json::Value> = para.lines.iter().map(|line| {
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
            }).collect();
            serde_json::json!({
                "lines": lines,
                "y": (para.y * 100.0).round() / 100.0,
                "height": (para.height * 100.0).round() / 100.0,
            })
        }).collect();
        serde_json::json!({
            "width": page.layout.width_px,
            "height": page.layout.height_px,
            "marginPx": (page.layout.margin_px * 100.0).round() / 100.0,
            "paragraphs": paras,
        })
    }).collect();

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
        }).to_string(),
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
    let format: serde_json::Value = serde_json::from_str(format_json)
        .map_err(|e| format!("Invalid format JSON: {}", e))?;

    let mut body = extract_body(doc_handle)?;
    let cursor = get_cursor(doc_handle);

    if body.paragraphs.is_empty() {
        return Err("Document body is empty".to_string());
    }

    let pidx = cursor.para.min(body.paragraphs.len().saturating_sub(1));
    let para = &mut body.paragraphs[pidx];

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

    if body.paragraphs.is_empty() {
        return Ok("{}".to_string());
    }

    let pidx = cursor.para.min(body.paragraphs.len().saturating_sub(1));
    let para = &body.paragraphs[pidx];

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
            })).map_err(|e| format!("JSON error: {}", e))
        }
        None => Ok("{}".to_string()),
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_release_document() {
        let doc_data = vec![0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
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
        set_cursor(doc_handle, CursorPos {
            page: 0,
            para: 1,
            line: 2,
            char_idx: 3,
            x: 100.0,
            y: 200.0,
        });
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
}

