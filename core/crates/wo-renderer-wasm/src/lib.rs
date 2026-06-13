// wo-renderer-wasm -- WASM bindings for World-Office rendering engine
//!
//! Provides JavaScript-callable functions for rendering documents
//! to HTML5 Canvas elements.
//!
//! This module exports canvas rendering functions that allow JavaScript
//! code to create and manipulate canvas instances, render shapes and text,
//! and retrieve pixel data.

pub mod canvas_bridge;

use wasm_bindgen::prelude::*;
use wo_ooxml::model::{DocxBody, DocxRun};
use wo_ooxml::parser::OoxmlParser;

// Re-export canvas functions
pub use canvas_bridge::{create_canvas, flush_to_canvas, get_pixel_data};

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

    let body = ooxml.body.unwrap_or_else(DocxBody::default);

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
