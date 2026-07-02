//! Canvas bridge module for bridging wo-renderer Canvas to Web Canvas API.
//!
//! This module provides handle-based canvas management, allowing JavaScript
//! code to create and manipulate canvas instances without directly managing
//! Rust Canvas objects. Each canvas is assigned a unique integer handle.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, ImageData};
use wo_renderer::{Canvas, Color, FontLibrary};

#[cfg(target_arch = "wasm32")]
static FALLBACK_FONT_BYTES: &[u8] =
    include_bytes!("../../../../assets/fonts/liberation/LiberationSans-Regular.ttf");

/// Global canvas instance store.
///
/// Maps canvas handles to Canvas instances. Uses OnceLock for lazy initialization
/// and a Mutex to provide interior mutability for WASM.
static CANVAS_STORE: OnceLock<Mutex<HashMap<u32, Canvas>>> = OnceLock::new();

/// Next available canvas handle.
static mut NEXT_HANDLE: u32 = 1;

/// Generate a new unique canvas handle.
///
/// # Safety
/// This function uses a mutable static variable, which is safe in WASM
/// because WASM is single-threaded (no shared memory across threads).
unsafe fn next_handle() -> u32 {
    let handle = NEXT_HANDLE;
    NEXT_HANDLE += 1;
    handle
}

/// Create a new offscreen canvas with the given dimensions.
///
/// # Arguments
/// * `width` - Canvas width in pixels
/// * `height` - Canvas height in pixels
///
/// # Returns
/// * `u32` - Unique handle for the canvas instance
///
/// # Example
/// ```javascript
/// const handle = create_canvas(800, 600);
/// // Use handle for subsequent operations
/// ```
#[wasm_bindgen]
pub fn create_canvas(width: u32, height: u32) -> u32 {
    if width == 0 || height == 0 {
        return 0; // Invalid dimensions
    }

    let mut canvas = Canvas::new(width, height);
    #[cfg(target_arch = "wasm32")]
    {
        let mut font_lib = FontLibrary::new();
        font_lib.load_font(FALLBACK_FONT_BYTES);
        canvas.set_font_library(font_lib);
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        canvas.set_font_library(FontLibrary::new());
    }
    let handle = unsafe { next_handle() };

    let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    store.insert(handle, canvas);

    handle
}

/// Render a rectangle on a canvas.
///
/// # Arguments
/// * `handle` - Canvas handle from create_canvas()
/// * `x` - Rectangle x coordinate
/// * `y` - Rectangle y coordinate
/// * `w` - Rectangle width
/// * `h` - Rectangle height
/// * `color` - CSS color string (e.g., "#FF0000", "rgb(255,0,0)", "red")
///
/// # Returns
/// * `Result<(), String>` - Ok(()) on success, error message on failure
///
/// # Example
/// ```javascript
/// render_rect(handle, 10, 10, 100, 100, "#FF0000");
/// ```
#[wasm_bindgen]
pub fn render_rect(handle: u32, x: f32, y: f32, w: f32, h: f32, color: &str) -> Result<(), String> {
    let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    let canvas = store
        .get_mut(&handle)
        .ok_or_else(|| format!("Canvas handle {} not found", handle))?;

    // Parse color string
    let parsed_color = parse_color(color)?;

    use wo_renderer::color::Paint;
    canvas.set_fill(Paint::Color(parsed_color));
    canvas.fill_rect(x, y, w, h);

    Ok(())
}

/// Render text on a canvas.
///
/// # Arguments
/// * `handle` - Canvas handle from create_canvas()
/// * `text` - Text string to render
/// * `x` - Text x coordinate
/// * `y` - Text y coordinate (baseline)
/// * `color` - CSS color string (optional, defaults to black)
/// * `size` - Font size in pixels (optional, defaults to 12)
///
/// # Returns
/// * `Result<(), String>` - Ok(()) on success, error message on failure
///
/// # Example
/// ```javascript
/// render_text(handle, "Hello, World!", 50, 50, "#000000", 16);
/// ```
#[wasm_bindgen]
pub fn render_text(
    handle: u32,
    text: &str,
    x: f32,
    y: f32,
    color: Option<String>,
    size: Option<f32>,
) -> Result<(), String> {
    let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    let canvas = store
        .get_mut(&handle)
        .ok_or_else(|| format!("Canvas handle {} not found", handle))?;

    // Parse color (default to black)
    let parsed_color = if let Some(c) = color {
        parse_color(&c)?
    } else {
        Color::BLACK
    };

    let font_size = size.unwrap_or(12.0);

    canvas.draw_text(
        text,
        x as f64,
        y as f64,
        font_size as f64,
        "sans-serif",
        parsed_color,
    );

    Ok(())
}

/// Flush canvas pixel data to a Web Canvas element.
///
/// # Arguments
/// * `handle` - Canvas handle from create_canvas()
/// * `canvas_id` - ID of the HTML canvas element to render to
///
/// # Returns
/// * `Result<(), String>` - Ok(()) on success, error message on failure
///
/// # Example
/// ```javascript
/// flush_to_canvas(handle, "myCanvas");
/// ```
#[wasm_bindgen]
pub fn flush_to_canvas(handle: u32, canvas_id: &str) -> Result<(), String> {
    if canvas_id.is_empty() {
        return Err("Canvas ID is required".to_string());
    }

    let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    let canvas = store
        .get(&handle)
        .ok_or_else(|| format!("Canvas handle {} not found", handle))?;

    // Get the browser window and document
    let window = web_sys::window().ok_or_else(|| "Failed to get window object".to_string())?;
    let document = window
        .document()
        .ok_or_else(|| "Failed to get document object".to_string())?;

    // Get the canvas element
    let html_canvas = document
        .get_element_by_id(canvas_id)
        .ok_or_else(|| format!("Canvas element '{}' not found", canvas_id))?
        .dyn_into::<HtmlCanvasElement>()
        .map_err(|_| "Element is not a canvas".to_string())?;

    // Get 2D rendering context
    let ctx = html_canvas
        .get_context("2d")
        .map_err(|e| {
            format!(
                "Failed to get 2d context: {}",
                e.as_string().unwrap_or_default()
            )
        })?
        .ok_or_else(|| "2d context is not available".to_string())?
        .dyn_into::<CanvasRenderingContext2d>()
        .map_err(|_| "Context is not 2d context".to_string())?;

    // Get pixel data from Rust canvas
    let rgba_bytes = canvas.to_rgba_bytes();

    // Create ImageData from the pixel buffer
    let image_data = ImageData::new_with_u8_clamped_array_and_sh(
        wasm_bindgen::Clamped(&rgba_bytes),
        canvas.width,
        canvas.height,
    )
    .map_err(|e| {
        format!(
            "Failed to create ImageData: {}",
            e.as_string().unwrap_or_default()
        )
    })?;

    // Draw the image data to the canvas
    ctx.put_image_data(&image_data, 0.0, 0.0).map_err(|e| {
        format!(
            "Failed to put image data: {}",
            e.as_string().unwrap_or_default()
        )
    })?;

    Ok(())
}

/// Get the raw RGBA pixel data from a canvas.
///
/// # Arguments
/// * `handle` - Canvas handle from create_canvas()
///
/// # Returns
/// * `Vec<u8>` - RGBA pixel data (4 bytes per pixel, row-major order)
///
/// # Example
/// ```javascript
/// const pixels = get_pixel_data(handle);
/// // pixels[0] = R, pixels[1] = G, pixels[2] = B, pixels[3] = A
/// ```
#[wasm_bindgen]
pub fn get_pixel_data(handle: u32) -> Result<Vec<u8>, String> {
    let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    let canvas = store
        .get(&handle)
        .ok_or_else(|| format!("Canvas handle {} not found", handle))?;

    Ok(canvas.to_rgba_bytes())
}

/// Release a canvas and free its memory.
///
/// # Arguments
/// * `handle` - Canvas handle from create_canvas()
///
/// # Returns
/// * `Result<(), String>` - Ok(()) on success, error message on failure
#[wasm_bindgen]
pub fn release_canvas(handle: u32) -> Result<(), String> {
    let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    if store.remove(&handle).is_none() {
        return Err(format!("Canvas handle {} not found", handle));
    }
    Ok(())
}

/// Get canvas dimensions.
///
/// # Arguments
/// * `handle` - Canvas handle from create_canvas()
///
/// # Returns
/// * `String` - JSON string with width and height
#[wasm_bindgen]
pub fn get_canvas_size(handle: u32) -> Result<String, String> {
    let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let store = store.lock().unwrap();
    let canvas = store
        .get(&handle)
        .ok_or_else(|| format!("Canvas handle {} not found", handle))?;

    let size = serde_json::json!({
        "width": canvas.width,
        "height": canvas.height,
    });

    Ok(size.to_string())
}

/// Clear a canvas to transparent.
///
/// # Arguments
/// * `handle` - Canvas handle from create_canvas()
///
/// # Returns
/// * `Result<(), String>` - Ok(()) on success, error message on failure
#[wasm_bindgen]
pub fn clear_canvas(handle: u32) -> Result<(), String> {
    let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut store = store.lock().unwrap();
    let canvas = store
        .get_mut(&handle)
        .ok_or_else(|| format!("Canvas handle {} not found", handle))?;

    canvas.clear();
    Ok(())
}

/// Parse a CSS color string to a Color.
///
/// Supports: hex (#RRGGBB, #RGB), rgb(r,g,b), rgba(r,g,b,a), and named colors.
fn parse_color(color: &str) -> Result<Color, String> {
    let color = color.trim();

    // Use Color::from_hex if available for hex colors
    if color.starts_with('#') {
        return Color::from_hex(color).ok_or_else(|| "Invalid hex color format".to_string());
    }

    // rgb() and rgba()
    if color.starts_with("rgb") {
        let (has_alpha, inner) = if color.starts_with("rgba(") {
            (true, color.strip_prefix("rgba(").ok_or("Invalid rgba")?)
        } else {
            (false, color.strip_prefix("rgb(").ok_or("Invalid rgb")?)
        };
        let inner = inner
            .strip_suffix(')')
            .ok_or("Missing closing parenthesis")?;

        let parts: Vec<&str> = inner.split(',').collect();
        if parts.len() != 3 + (has_alpha as usize) {
            return Err("Invalid rgb/rgba format".to_string());
        }

        let r: f32 = parts[0]
            .trim()
            .parse::<f32>()
            .map_err(|_| "Invalid red value".to_string())?
            / 255.0;
        let g: f32 = parts[1]
            .trim()
            .parse::<f32>()
            .map_err(|_| "Invalid green value".to_string())?
            / 255.0;
        let b: f32 = parts[2]
            .trim()
            .parse::<f32>()
            .map_err(|_| "Invalid blue value".to_string())?
            / 255.0;
        let a: f32 = if has_alpha {
            parts[3]
                .trim()
                .parse::<f32>()
                .map_err(|_| "Invalid alpha value".to_string())?
        } else {
            1.0
        };

        return Ok(Color::new(r, g, b, a));
    }

    // Named colors (basic set)
    match color.to_lowercase().as_str() {
        "red" => Ok(Color::RED),
        "green" => Ok(Color::GREEN),
        "blue" => Ok(Color::BLUE),
        "black" => Ok(Color::BLACK),
        "white" => Ok(Color::WHITE),
        "yellow" => Ok(Color::rgb(1.0, 1.0, 0.0)),
        "cyan" => Ok(Color::rgb(0.0, 1.0, 1.0)),
        "magenta" => Ok(Color::rgb(1.0, 0.0, 1.0)),
        "transparent" => Ok(Color::new(0.0, 0.0, 0.0, 0.0)),
        _ => Err(format!("Unknown color: {}", color)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_canvas() {
        let handle = create_canvas(100, 100);
        assert_ne!(handle, 0);

        let store = CANVAS_STORE.get_or_init(|| Mutex::new(HashMap::new()));
        let store = store.lock().unwrap();
        assert!(store.contains_key(&handle));
    }

    #[test]
    fn test_create_canvas_zero_dimensions() {
        let handle = create_canvas(0, 100);
        assert_eq!(handle, 0);

        let handle = create_canvas(100, 0);
        assert_eq!(handle, 0);
    }

    #[test]
    fn test_render_rect() {
        let handle = create_canvas(100, 100);
        let result = render_rect(handle, 10.0, 10.0, 50.0, 50.0, "#FF0000");
        assert!(result.is_ok());
    }

    #[test]
    fn test_render_rect_invalid_handle() {
        let result = render_rect(999, 10.0, 10.0, 50.0, 50.0, "#FF0000");
        assert!(result.is_err());
    }

    #[test]
    fn test_render_text() {
        let handle = create_canvas(100, 100);
        let result = render_text(handle, "Test", 10.0, 50.0, None, None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_pixel_data() {
        let handle = create_canvas(100, 100);
        let result = get_pixel_data(handle);
        assert!(result.is_ok());

        let pixels = result.unwrap();
        assert_eq!(pixels.len(), 100 * 100 * 4);
    }

    #[test]
    fn test_release_canvas() {
        let handle = create_canvas(100, 100);
        let result = release_canvas(handle);
        assert!(result.is_ok());

        let result = get_pixel_data(handle);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_canvas_size() {
        let handle = create_canvas(800, 600);
        let result = get_canvas_size(handle);
        assert!(result.is_ok());

        let json = result.unwrap();
        assert!(json.contains("800"));
        assert!(json.contains("600"));
    }

    #[test]
    fn test_clear_canvas() {
        let handle = create_canvas(100, 100);
        render_rect(handle, 0.0, 0.0, 100.0, 100.0, "#FF0000").unwrap();

        let result = clear_canvas(handle);
        assert!(result.is_ok());

        // Canvas should be transparent now
        let pixels = get_pixel_data(handle).unwrap();
        assert_eq!(pixels[3], 0); // Alpha channel is 0 (transparent)
    }

    #[test]
    fn test_parse_color_hex() {
        let color = parse_color("#FF0000").unwrap();
        assert_eq!(color.r, 1.0);
        assert_eq!(color.g, 0.0);
        assert_eq!(color.b, 0.0);
        assert_eq!(color.a, 1.0);

        let color = parse_color("#F00").unwrap();
        assert_eq!(color.r, 1.0);
        assert_eq!(color.g, 0.0);
        assert_eq!(color.b, 0.0);

        let color = parse_color("#FF000080").unwrap();
        assert!((color.a - 128.0 / 255.0).abs() < 0.001);
    }

    #[test]
    fn test_parse_color_rgb() {
        let color = parse_color("rgb(255, 0, 0)").unwrap();
        assert_eq!(color.r, 1.0);
        assert_eq!(color.g, 0.0);
        assert_eq!(color.b, 0.0);

        let color = parse_color("rgba(255, 0, 0, 0.5)").unwrap();
        assert_eq!(color.r, 1.0);
        assert_eq!(color.a, 0.5);
    }

    #[test]
    fn test_parse_color_named() {
        let color = parse_color("red").unwrap();
        assert_eq!(color.r, 1.0);
        assert_eq!(color.g, 0.0);
        assert_eq!(color.b, 0.0);

        let color = parse_color("white").unwrap();
        assert_eq!(color.r, 1.0);
        assert_eq!(color.g, 1.0);
        assert_eq!(color.b, 1.0);

        let color = parse_color("yellow").unwrap();
        assert_eq!(color.r, 1.0);
        assert_eq!(color.g, 1.0);
        assert_eq!(color.b, 0.0);

        let color = parse_color("cyan").unwrap();
        assert_eq!(color.r, 0.0);
        assert_eq!(color.g, 1.0);
        assert_eq!(color.b, 1.0);

        let color = parse_color("magenta").unwrap();
        assert_eq!(color.r, 1.0);
        assert_eq!(color.g, 0.0);
        assert_eq!(color.b, 1.0);
    }

    #[test]
    fn test_parse_color_invalid() {
        let result = parse_color("invalid");
        assert!(result.is_err());

        let result = parse_color("#GG0000");
        assert!(result.is_err());
    }
}
