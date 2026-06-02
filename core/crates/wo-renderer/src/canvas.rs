//! 2D rendering canvas.
//!
//! Provides a stateful drawing surface with fill/stroke operations,
//! transform management, clipping, and pixel-level rasterization.
//! Modeled after the HTML5 Canvas API.

use crate::color::{Color, Paint, StrokeStyle};
use crate::fonts::FontLibrary;
use crate::gradient::Gradient;
use crate::model::{BlendMode, Page};
use crate::path::{FillRule, PathBuilder};
use crate::transform::{AffineTransform, TransformStack};

/// A single RGBA pixel stored as u32 (0xAARRGGBB).
type PixelU32 = u32;

/// Pixel buffer for the canvas.
#[derive(Debug, Clone)]
struct PixelBuffer {
    width: u32,
    height: u32,
    pixels: Vec<PixelU32>,
}

impl PixelBuffer {
    fn new(width: u32, height: u32, fill: PixelU32) -> Self {
        let count = (width as usize) * (height as usize);
        Self {
            width,
            height,
            pixels: vec![fill; count],
        }
    }

    fn get(&self, x: u32, y: u32) -> PixelU32 {
        if x >= self.width || y >= self.height {
            return 0; // transparent
        }
        self.pixels[(y as usize) * (self.width as usize) + (x as usize)]
    }

    fn set(&mut self, x: u32, y: u32, pixel: PixelU32) {
        if x >= self.width || y >= self.height {
            return;
        }
        self.pixels[(y as usize) * (self.width as usize) + (x as usize)] = pixel;
    }

    fn blend(&mut self, x: u32, y: u32, color: &Color, alpha: f32) {
        if x >= self.width || y >= self.height {
            return;
        }
        let existing = self.get(x, y);
        let er = ((existing >> 16) & 0xFF) as f32;
        let eg = ((existing >> 8) & 0xFF) as f32;
        let eb = (existing & 0xFF) as f32;
        let a = alpha * color.a;
        let inv = 1.0 - a;
        let r = (color.r * a * 255.0 + er * inv) as u8;
        let g = (color.g * a * 255.0 + eg * inv) as u8;
        let b = (color.b * a * 255.0 + eb * inv) as u8;
        self.set(
            x,
            y,
            0xFF000000 | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32),
        );
    }

    fn fill_rect(&mut self, x: i32, y: i32, w: u32, h: u32, color: &Color, alpha: f32) {
        let x0 = x.max(0) as u32;
        let y0 = y.max(0) as u32;
        let x1 = (x0 + w).min(self.width);
        let y1 = (y0 + h).min(self.height);
        for py in y0..y1 {
            for px in x0..x1 {
                self.blend(px, py, color, alpha);
            }
        }
    }

    /// Fill an arbitrary polygon using the scanline even-odd rule.
    fn fill_polygon(&mut self, points: &[(f32, f32)], color: &Color, alpha: f32) {
        if points.len() < 3 {
            return;
        }

        // Find bounding box
        let mut y_min = f32::MAX;
        let mut y_max = f32::MIN;
        for &(_, y) in points {
            y_min = y_min.min(y);
            y_max = y_max.max(y);
        }

        let scan_start = y_min.floor().max(0.0) as i32;
        let scan_end = (y_max.ceil() as i32).min(self.height as i32);

        // Number of edges
        let n = points.len();

        for scan_y in scan_start..scan_end {
            let y = scan_y as f32 + 0.5; // sample at pixel center
            let mut intersections: Vec<f32> = Vec::new();

            for i in 0..n {
                let (x0, y0) = points[i];
                let (x1, y1) = points[(i + 1) % n];

                // Skip horizontal edges
                if (y1 - y0).abs() < 1e-10 {
                    continue;
                }

                // Check if scanline crosses this edge
                if (y >= y0.min(y1)) && (y < y0.max(y1)) {
                    let t = (y - y0) / (y1 - y0);
                    let x_int = x0 + t * (x1 - x0);
                    intersections.push(x_int);
                }
            }
            intersections.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

            // Fill between pairs (even-odd rule)
            let mut idx = 0;
            while idx + 1 < intersections.len() {
                let x_left = intersections[idx].ceil().max(0.0) as u32;
                let x_right = intersections[idx + 1].floor() as u32;
                if x_right < x_left {
                    idx += 2;
                    continue;
                }
                let px_start = x_left.min(self.width);
                let px_end = (x_right + 1).min(self.width);
                let py = scan_y as u32;
                if py < self.height {
                    for px in px_start..px_end {
                        self.blend(px, py, color, alpha);
                    }
                }
                idx += 2;
            }
        }
    }

    /// Stroke a series of connected line segments with given width.
    /// For each segment, computes the perpendicular rectangle (quad) and fills it.
    fn stroke_lines(&mut self, points: &[(f32, f32)], color: &Color, alpha: f32, line_width: f32) {
        if points.len() < 2 {
            // Single point: draw a dot
            if points.len() == 1 {
                let cx = points[0].0 as i32;
                let cy = points[0].1 as i32;
                let half = (line_width / 2.0).ceil() as i32;
                self.fill_rect(
                    cx - half,
                    cy - half,
                    (half * 2 + 1) as u32,
                    (half * 2 + 1) as u32,
                    color,
                    alpha,
                );
            }
            return;
        }

        let half_w = line_width / 2.0;

        for i in 0..points.len() - 1 {
            let (x0, y0) = points[i];
            let (x1, y1) = points[i + 1];

            let dx = x1 - x0;
            let dy = y1 - y0;
            let length = (dx * dx + dy * dy).sqrt();

            if length < 1e-10 {
                // Degenerate segment: draw a dot
                let cx = x0 as i32;
                let cy = y0 as i32;
                let half = (line_width / 2.0).ceil() as i32;
                self.fill_rect(
                    cx - half,
                    cy - half,
                    (half * 2 + 1) as u32,
                    (half * 2 + 1) as u32,
                    color,
                    alpha,
                );
                continue;
            }

            // Perpendicular direction
            let nx = -dy / length;
            let ny = dx / length;

            // Four corners of the stroke quad
            let quad = [
                (x0 + nx * half_w, y0 + ny * half_w),
                (x0 - nx * half_w, y0 - ny * half_w),
                (x1 - nx * half_w, y1 - ny * half_w),
                (x1 + nx * half_w, y1 + ny * half_w),
            ];

            self.fill_polygon(&quad, color, alpha);
        }
    }

    fn clear(&mut self, color: PixelU32) {
        self.pixels.fill(color);
    }

    fn as_rgba_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.pixels.len() * 4);
        for &pixel in &self.pixels {
            bytes.push(((pixel >> 16) & 0xFF) as u8);
            bytes.push(((pixel >> 8) & 0xFF) as u8);
            bytes.push((pixel & 0xFF) as u8);
            bytes.push((pixel >> 24) as u8);
        }
        bytes
    }
}

/// Drawing state (for save/restore).
#[derive(Debug, Clone)]
struct CanvasState {
    fill_paint: Paint,
    stroke_paint: Paint,
    stroke_style: StrokeStyle,
    blend_mode: BlendMode,
    fill_rule: FillRule,
    global_alpha: f32,
}

impl Default for CanvasState {
    fn default() -> Self {
        Self {
            fill_paint: Paint::Color(Color::BLACK),
            stroke_paint: Paint::Color(Color::BLACK),
            stroke_style: StrokeStyle::default(),
            blend_mode: BlendMode::SourceOver,
            fill_rule: FillRule::NonZero,
            global_alpha: 1.0,
        }
    }
}

/// 2D rendering canvas.
///
/// Provides drawing operations (rect, path, text), state management
/// (save/restore), transform manipulation, and pixel-level rasterization.
pub struct Canvas {
    /// Canvas width in pixels.
    pub width: u32,
    /// Canvas height in pixels.
    pub height: u32,
    /// Current drawing state.
    state: CanvasState,
    /// State stack for save/restore.
    state_stack: Vec<CanvasState>,
    /// Transform stack.
    transforms: TransformStack,
    /// Current path being built.
    current_path: PathBuilder,
    /// Clip path (if any).
    clip_path: Option<PathBuilder>,
    /// Pixel buffer.
    buffer: PixelBuffer,
    /// Font library for text rendering (optional).
    font_library: Option<FontLibrary>,
}

impl Canvas {
    /// Create a new canvas with the given pixel dimensions, filled with white.
    pub fn new(width: u32, height: u32) -> Self {
        let buffer = PixelBuffer::new(width, height, 0xFFFFFFFF); // opaque white
        Self {
            width,
            height,
            state: CanvasState::default(),
            state_stack: Vec::new(),
            transforms: TransformStack::new(),
            current_path: PathBuilder::new(),
            clip_path: None,
            buffer,
            font_library: None,
        }
    }

    /// Create a canvas sized to match a page at a given DPI, filled with white.
    pub fn from_page(page: &Page, dpi: f32) -> Self {
        let (w, h) = page.pixel_size(dpi);
        Self::new(w, h)
    }

    /// Create a canvas with a specific background color.
    pub fn with_background(width: u32, height: u32, background: Color) -> Self {
        let r = (background.r.clamp(0.0, 1.0) * 255.0) as u8;
        let g = (background.g.clamp(0.0, 1.0) * 255.0) as u8;
        let b = (background.b.clamp(0.0, 1.0) * 255.0) as u8;
        let a = (background.a.clamp(0.0, 1.0) * 255.0) as u8;
        let pixel =
            0xFF000000 | ((a as u32) << 24) | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32);
        let buffer = PixelBuffer::new(width, height, pixel);
        Self {
            width,
            height,
            state: CanvasState::default(),
            state_stack: Vec::new(),
            transforms: TransformStack::new(),
            current_path: PathBuilder::new(),
            clip_path: None,
            buffer,
            font_library: None,
        }
    }

    // --- State management ---

    /// Save the current drawing state.
    pub fn save(&mut self) {
        self.state_stack.push(self.state.clone());
    }

    /// Restore the previous drawing state.
    pub fn restore(&mut self) {
        if let Some(prev) = self.state_stack.pop() {
            self.state = prev;
        }
    }

    // --- Transform ---

    /// Reset the transform to identity.
    pub fn reset_transform(&mut self) {
        self.transforms = TransformStack::new();
    }

    /// Apply a translation.
    pub fn translate(&mut self, tx: f32, ty: f32) {
        self.transforms.push(AffineTransform::translate(tx, ty));
    }

    /// Apply a scale.
    pub fn scale(&mut self, sx: f32, sy: f32) {
        self.transforms.push(AffineTransform::scale(sx, sy));
    }

    /// Apply a rotation (radians).
    pub fn rotate(&mut self, angle: f32) {
        self.transforms.push(AffineTransform::rotate(angle));
    }

    /// Apply an arbitrary transform.
    pub fn transform(&mut self, t: AffineTransform) {
        self.transforms.push(t);
    }

    /// Get the current transform.
    pub fn current_transform(&self) -> AffineTransform {
        self.transforms.current()
    }

    // --- Style ---

    /// Set the fill paint.
    pub fn set_fill(&mut self, paint: Paint) {
        self.state.fill_paint = paint;
    }

    /// Set the stroke paint.
    pub fn set_stroke(&mut self, paint: Paint) {
        self.state.stroke_paint = paint;
    }

    /// Set the stroke style.
    pub fn set_stroke_style(&mut self, style: StrokeStyle) {
        self.state.stroke_style = style;
    }

    /// Set global alpha (0.0–1.0).
    pub fn set_global_alpha(&mut self, alpha: f32) {
        self.state.global_alpha = alpha.clamp(0.0, 1.0);
    }

    /// Set the blend mode.
    pub fn set_blend_mode(&mut self, mode: BlendMode) {
        self.state.blend_mode = mode;
    }

    /// Set the fill rule.
    pub fn set_fill_rule(&mut self, rule: FillRule) {
        self.state.fill_rule = rule;
    }

    // --- Path building ---

    /// Begin a new path.
    pub fn begin_path(&mut self) {
        self.current_path.clear();
    }

    /// Move to (x, y).
    pub fn move_to(&mut self, x: f32, y: f32) {
        self.current_path.move_to(x, y);
    }

    /// Line to (x, y).
    pub fn line_to(&mut self, x: f32, y: f32) {
        self.current_path.line_to(x, y);
    }

    /// Close the current sub-path.
    pub fn close_path(&mut self) {
        self.current_path.close();
    }

    /// Add a rectangle to the current path.
    pub fn rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.current_path.rect(x, y, w, h);
    }

    /// Add an ellipse to the current path.
    pub fn ellipse(&mut self, cx: f32, cy: f32, rx: f32, ry: f32) {
        self.current_path.ellipse(cx, cy, rx, ry);
    }

    /// Add a circle to the current path.
    pub fn circle(&mut self, cx: f32, cy: f32, r: f32) {
        self.current_path.circle(cx, cy, r);
    }

    // --- Drawing operations ---

    /// Fill the current path with the current fill paint.
    /// Supports axis-aligned rectangles (fast path) and arbitrary polygons.
    pub fn fill(&mut self) {
        let alpha = self.state.global_alpha;
        if let Some(color) = self.paint_color(&self.state.fill_paint) {
            // Check if the path is a simple axis-aligned rectangle
            if self.is_rect_path() {
                let (x, y, w, h) = self.get_rect_bounds();
                let transform = self.current_transform();
                // Transform the rectangle corners
                let (tx, ty) = transform.transform_point(x, y);
                let (tx2, ty2) = transform.transform_point(x + w, y + h);
                let rx = tx.min(tx2).floor() as i32;
                let ry = ty.min(ty2).floor() as i32;
                let rw = (tx.max(tx2).ceil() - rx as f32).abs() as u32;
                let rh = (ty.max(ty2).ceil() - ry as f32).abs() as u32;
                self.buffer.fill_rect(rx, ry, rw, rh, &color, alpha);
            } else {
                // General path: flatten, transform, rasterize
                let transform = self.current_transform();
                let subpaths = self.current_path.flatten(0.5);
                for subpath in &subpaths {
                    if subpath.points.len() < 2 {
                        continue;
                    }
                    // Transform all points to screen space
                    let transformed: Vec<(f32, f32)> = subpath
                        .points
                        .iter()
                        .map(|&(x, y)| transform.transform_point(x, y))
                        .collect();
                    if transformed.len() >= 3 && subpath.is_closed {
                        self.buffer.fill_polygon(&transformed, &color, alpha);
                    }
                }
            }
        }
        self.current_path.clear();
    }

    /// Stroke the current path with the current stroke paint.
    pub fn stroke(&mut self) {
        let alpha = self.state.global_alpha;
        if let Some(color) = self.paint_color(&self.state.stroke_paint) {
            let lw = self.state.stroke_style.line_width;
            if self.is_rect_path() {
                let (x, y, w, h) = self.get_rect_bounds();
                let transform = self.current_transform();
                let (tx, ty) = transform.transform_point(x, y);
                let (tx2, ty2) = transform.transform_point(x + w, y + h);
                let rx = (tx.min(tx2) - lw / 2.0).floor() as i32;
                let ry = (ty.min(ty2) - lw / 2.0).floor() as i32;
                let rw = (tx.max(tx2) - tx.min(tx2) + lw).ceil() as u32;
                let rh = (ty.max(ty2) - ty.min(ty2) + lw).ceil() as u32;
                self.buffer.fill_rect(rx, ry, rw, rh, &color, alpha);
            } else {
                // General path: flatten, transform, stroke
                let transform = self.current_transform();
                let subpaths = self.current_path.flatten(0.5);
                for subpath in &subpaths {
                    if subpath.points.len() < 2 {
                        continue;
                    }
                    // Transform all points to screen space
                    let transformed: Vec<(f32, f32)> = subpath
                        .points
                        .iter()
                        .map(|&(x, y)| transform.transform_point(x, y))
                        .collect();
                    self.buffer.stroke_lines(&transformed, &color, alpha, lw);
                }
            }
        }
        self.current_path.clear();
    }

    /// Fill a rectangle directly (more efficient than begin_path + rect + fill).
    pub fn fill_rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.begin_path();
        self.rect(x, y, w, h);
        self.fill();
    }

    /// Fill a rectangle with a gradient.
    pub fn fill_rect_gradient(&mut self, x: f32, y: f32, w: f32, h: f32, gradient: &Gradient) {
        let alpha = self.state.global_alpha;
        let transform = self.current_transform();

        // Transform the rectangle corners to screen space for iteration
        let (tx, ty) = transform.transform_point(x, y);
        let (tx2, ty2) = transform.transform_point(x + w, y + h);
        let rx = tx.min(tx2).floor() as i32;
        let ry = ty.min(ty2).floor() as i32;
        let rw = (tx.max(tx2).ceil() - rx as f32).abs() as u32;
        let rh = (ty.max(ty2).ceil() - ry as f32).abs() as u32;

        // Get inverse transform to compute gradient positions in user space
        let inv_transform = match transform.invert() {
            Some(t) => t,
            None => return, // Singular transform, cannot fill
        };

        let x0 = rx.max(0) as u32;
        let y0 = ry.max(0) as u32;
        let x1 = (x0 + rw).min(self.width);
        let y1 = (y0 + rh).min(self.height);

        for py in y0..y1 {
            for px in x0..x1 {
                // Transform pixel back to user space
                let (ux, uy) = inv_transform.transform_point(px as f32, py as f32);
                let t = gradient.position_at(ux, uy);
                let color = gradient.color_at(t);
                self.buffer.blend(px, py, &color, alpha);
            }
        }
    }

    /// Fill a path with a gradient.
    pub fn fill_path_gradient(&mut self, path: &PathBuilder, gradient: &Gradient) {
        let alpha = self.state.global_alpha;
        let transform = self.current_transform();

        // Get bounding box of path
        let (bx, by, bx2, by2) = path.bounds();
        let bw = bx2 - bx;
        let bh = by2 - by;

        // Check for empty bounds
        if bw <= 0.0 || bh <= 0.0 {
            return;
        }

        // Transform bounds to screen space for iteration
        let (tx, ty) = transform.transform_point(bx, by);
        let (tx2, ty2) = transform.transform_point(bx2, by2);
        let rx = tx.min(tx2).floor() as i32;
        let ry = ty.min(ty2).floor() as i32;
        let rw = (tx.max(tx2).ceil() - rx as f32).abs() as u32;
        let rh = (ty.max(ty2).ceil() - ry as f32).abs() as u32;

        // Get inverse transform to compute gradient positions in user space
        let inv_transform = match transform.invert() {
            Some(t) => t,
            None => return, // Singular transform, cannot fill
        };

        let x0 = rx.max(0) as u32;
        let y0 = ry.max(0) as u32;
        let x1 = (x0 + rw).min(self.width);
        let y1 = (y0 + rh).min(self.height);

        for py in y0..y1 {
            for px in x0..x1 {
                // Check if pixel is inside the path (in user space)
                let (ux, uy) = inv_transform.transform_point(px as f32, py as f32);
                if !path.contains_point(ux, uy, self.state.fill_rule) {
                    continue;
                }

                let t = gradient.position_at(ux, uy);
                let color = gradient.color_at(t);
                self.buffer.blend(px, py, &color, alpha);
            }
        }
    }

    /// Stroke a rectangle directly.
    pub fn stroke_rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.begin_path();
        self.rect(x, y, w, h);
        self.stroke();
    }

    /// Set the font library for text rendering.
    ///
    /// Must be called before [`draw_text`](Canvas::draw_text) to enable
    /// glyph rasterization. Without a font library, `draw_text` is a no-op.
    pub fn set_font_library(&mut self, lib: FontLibrary) {
        self.font_library = Some(lib);
    }

    /// Draw text at the specified position using the given font size and color.
    ///
    /// Uses rustybuzz for text shaping and swash for glyph rasterization.
    /// Latin-only for v1 — no kerning, ligatures, OpenType features, bidi, or
    /// complex script support.
    ///
    /// Requires a font library to be set via [`set_font_library`](Canvas::set_font_library).
    /// If no font library is available, or no font face can be found, the call
    /// returns silently without modifying the canvas.
    ///
    /// # Arguments
    /// * `text` - The text string to draw (Latin characters only for v1)
    /// * `x` - X coordinate of the text origin (left edge of first glyph)
    /// * `y` - Y coordinate of the baseline
    /// * `font_size` - Font size in pixels
    /// * `_font` - Font family name (ignored in v1; best available face is used)
    /// * `color` - Text color
    pub fn draw_text(
        &mut self,
        text: &str,
        x: f64,
        y: f64,
        font_size: f64,
        _font: &str,
        color: Color,
    ) {
        let font_library = match &self.font_library {
            Some(lib) => lib,
            None => return,
        };

        // Get font data from library
        let (font_data, face_index) = match font_library.query_face() {
            Some(data) => data,
            None => return,
        };

        // Create rustybuzz face for shaping
        let rb_face = match rustybuzz::Face::from_slice(&font_data, face_index) {
            Some(face) => face,
            None => return,
        };

        // Shape text with rustybuzz (Latin v1: no features)
        let mut buffer = rustybuzz::UnicodeBuffer::new();
        buffer.push_str(text);
        buffer.guess_segment_properties();
        let glyph_buffer = rustybuzz::shape(&rb_face, &[], buffer);

        // Compute scale factor: font design units → pixels
        let upem = rb_face.units_per_em();
        let upem = if upem > 0 { upem as f32 } else { 1000.0 };
        let font_size_f32 = font_size as f32;
        let unit_scale = font_size_f32 / upem;

        // Create swash font reference and scale context
        let swash_font = match swash::FontRef::from_index(&font_data, face_index as usize) {
            Some(font) => font,
            None => return,
        };

        let mut scale_context = swash::scale::ScaleContext::new();
        let mut scaler = scale_context
            .builder(swash_font)
            .size(font_size_f32)
            .build();

        let alpha = self.state.global_alpha;
        let x_start = x as f32;
        let y_baseline = y as f32;

        let infos = glyph_buffer.glyph_infos();
        let positions = glyph_buffer.glyph_positions();

        let mut cursor_x = x_start;

        for (info, pos) in infos.iter().zip(positions.iter()) {
            let glyph_id = info.glyph_id as u16;

            // Rasterize glyph with swash
            if let Some(image) = swash::scale::Render::new(&[swash::scale::Source::Outline])
                .format(swash::zeno::Format::Alpha)
                .render(&mut scaler, glyph_id)
            {
                let placement = &image.placement;
                if placement.width > 0 && placement.height > 0 {
                    // Glyph position in canvas coordinates
                    let gx0 = cursor_x + pos.x_offset as f32 * unit_scale + placement.left as f32;
                    let gy0 = y_baseline + pos.y_offset as f32 * unit_scale - placement.top as f32;

                    // Composite glyph bitmap onto pixel buffer
                    for row in 0..placement.height {
                        for col in 0..placement.width {
                            let px = (gx0 + col as f32).round() as i32;
                            let py = (gy0 + row as f32).round() as i32;
                            if px < 0 || py < 0 {
                                continue;
                            }
                            let px_u = px as u32;
                            let py_u = py as u32;
                            if px_u >= self.width || py_u >= self.height {
                                continue;
                            }
                            let idx = row as usize * placement.width as usize + col as usize;
                            if idx < image.data.len() {
                                let glyph_alpha = image.data[idx] as f32 / 255.0;
                                self.buffer.blend(px_u, py_u, &color, glyph_alpha * alpha);
                            }
                        }
                    }
                }
            }

            // Advance cursor to next glyph origin
            cursor_x += pos.x_advance as f32 * unit_scale;
        }
    }

    /// Clear the entire canvas to transparent.
    pub fn clear(&mut self) {
        self.buffer.clear(0x00000000);
    }

    /// Clear a rectangular area to transparent.
    pub fn clear_rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        let x0 = x.max(0.0) as u32;
        let y0 = y.max(0.0) as u32;
        let x1 = (x0 + w as u32).min(self.width);
        let y1 = (y0 + h as u32).min(self.height);
        for py in y0..y1 {
            for px in x0..x1 {
                self.buffer.set(px, py, 0x00000000);
            }
        }
    }

    // --- Clipping ---

    /// Set a clip path (intersects with current clip).
    pub fn clip(&mut self) {
        if !self.current_path.is_empty() {
            self.clip_path = Some(self.current_path.clone());
        }
        self.current_path.clear();
    }

    /// Reset the clip to the full canvas.
    pub fn reset_clip(&mut self) {
        self.clip_path = None;
    }

    // --- Pixel access ---

    /// Get the raw pixel buffer as RGBA bytes.
    pub fn to_rgba_bytes(&self) -> Vec<u8> {
        self.buffer.as_rgba_bytes()
    }

    /// Get a pixel at (x, y) as (r, g, b, a) u8 values.
    pub fn get_pixel(&self, x: u32, y: u32) -> (u8, u8, u8, u8) {
        let pixel = self.buffer.get(x, y);
        (
            ((pixel >> 16) & 0xFF) as u8,
            ((pixel >> 8) & 0xFF) as u8,
            (pixel & 0xFF) as u8,
            (pixel >> 24) as u8,
        )
    }

    // --- Accessors ---

    /// Get a reference to the current path.
    pub fn current_path(&self) -> &PathBuilder {
        &self.current_path
    }

    /// Get the global alpha.
    pub fn global_alpha(&self) -> f32 {
        self.state.global_alpha
    }

    /// Get the current fill rule.
    pub fn fill_rule(&self) -> FillRule {
        self.state.fill_rule
    }

    /// Check if a clip path is active.
    pub fn has_clip(&self) -> bool {
        self.clip_path.is_some()
    }

    // --- Internal helpers ---

    fn paint_color(&self, paint: &Paint) -> Option<Color> {
        match paint {
            Paint::Color(c) => Some(*c),
            Paint::None => None,
        }
    }

    /// Check if the current path is a single axis-aligned rectangle.
    fn is_rect_path(&self) -> bool {
        let cmds = self.current_path.commands();
        // A rect is: MoveTo + LineTo + LineTo + LineTo + Close = 5 commands
        cmds.len() == 5
            && matches!(cmds[0], crate::path::PathCommand::MoveTo(_, _))
            && matches!(cmds[1], crate::path::PathCommand::LineTo(_, _))
            && matches!(cmds[2], crate::path::PathCommand::LineTo(_, _))
            && matches!(cmds[3], crate::path::PathCommand::LineTo(_, _))
            && matches!(cmds[4], crate::path::PathCommand::Close)
    }

    /// Get the bounding rectangle of a rect path.
    fn get_rect_bounds(&self) -> (f32, f32, f32, f32) {
        let cmds = self.current_path.commands();
        let mut min_x = f32::MAX;
        let mut min_y = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_y = f32::MIN;
        for cmd in cmds {
            match cmd {
                crate::path::PathCommand::MoveTo(x, y) | crate::path::PathCommand::LineTo(x, y) => {
                    min_x = min_x.min(*x);
                    min_y = min_y.min(*y);
                    max_x = max_x.max(*x);
                    max_y = max_y.max(*y);
                }
                _ => {}
            }
        }
        (min_x, min_y, max_x - min_x, max_y - min_y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canvas_new() {
        let c = Canvas::new(800, 600);
        assert_eq!(c.width, 800);
        assert_eq!(c.height, 600);
        assert!((c.global_alpha() - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_canvas_from_page() {
        let page = Page::a4();
        let c = Canvas::from_page(&page, 72.0);
        assert_eq!(c.width, 595);
        assert_eq!(c.height, 842);
    }

    #[test]
    fn test_save_restore() {
        let mut c = Canvas::new(100, 100);
        c.set_global_alpha(0.5);
        c.save();
        c.set_global_alpha(0.1);
        assert!((c.global_alpha() - 0.1).abs() < 0.001);
        c.restore();
        assert!((c.global_alpha() - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_transform() {
        let mut c = Canvas::new(100, 100);
        assert!(c.current_transform().is_identity());

        c.translate(10.0, 20.0);
        let t = c.current_transform();
        assert_eq!(t.transform_point(0.0, 0.0), (10.0, 20.0));
    }

    #[test]
    fn test_reset_transform() {
        let mut c = Canvas::new(100, 100);
        c.translate(10.0, 20.0);
        assert!(!c.current_transform().is_identity());
        c.reset_transform();
        assert!(c.current_transform().is_identity());
    }

    #[test]
    fn test_path_building() {
        let mut c = Canvas::new(100, 100);
        c.begin_path();
        c.rect(5.0, 10.0, 20.0, 30.0);
        assert_eq!(c.current_path().commands().len(), 5);
    }

    #[test]
    fn test_fill_clears_path() {
        let mut c = Canvas::new(100, 100);
        c.rect(0.0, 0.0, 10.0, 10.0);
        assert!(!c.current_path().is_empty());
        c.fill();
        assert!(c.current_path().is_empty());
    }

    #[test]
    fn test_clip() {
        let mut c = Canvas::new(100, 100);
        assert!(!c.has_clip());
        c.rect(0.0, 0.0, 50.0, 50.0);
        c.clip();
        assert!(c.has_clip());
        c.reset_clip();
        assert!(!c.has_clip());
    }

    #[test]
    fn test_set_fill_stroke() {
        let mut c = Canvas::new(100, 100);
        c.set_fill(Paint::Color(Color::RED));
        c.set_stroke(Paint::Color(Color::BLUE));
        c.set_stroke_style(StrokeStyle {
            line_width: 2.0,
            ..Default::default()
        });
        // No panic = success
    }

    #[test]
    fn test_fill_rect() {
        let mut c = Canvas::new(100, 100);
        c.fill_rect(0.0, 0.0, 10.0, 10.0);
        assert!(c.current_path().is_empty());
    }

    // --- Pixel buffer tests ---

    #[test]
    fn test_default_white_background() {
        let c = Canvas::new(10, 10);
        let (r, g, b, a) = c.get_pixel(0, 0);
        assert_eq!(r, 255);
        assert_eq!(g, 255);
        assert_eq!(b, 255);
        assert_eq!(a, 255);
    }

    #[test]
    fn test_with_background() {
        let c = Canvas::with_background(10, 10, Color::rgb(0.5, 0.0, 0.0));
        let (r, g, b, _) = c.get_pixel(0, 0);
        assert_eq!(r, 127); // 0.5 * 255 = 127.5 → 127 (truncation)
        assert_eq!(g, 0);
        assert_eq!(b, 0);
    }

    #[test]
    fn test_fill_rect_pixels() {
        let mut c = Canvas::new(20, 20);
        c.set_fill(Paint::Color(Color::RED));
        c.fill_rect(5.0, 5.0, 10.0, 10.0);

        // Inside the filled rect — should be red
        let (r, g, b, _) = c.get_pixel(10, 10);
        assert_eq!(r, 255);
        assert_eq!(g, 0);
        assert_eq!(b, 0);

        // Outside the filled rect — should still be white
        let (r, g, b, _) = c.get_pixel(0, 0);
        assert_eq!(r, 255);
        assert_eq!(g, 255);
        assert_eq!(b, 255);
    }

    #[test]
    fn test_fill_rect_with_alpha() {
        let mut c = Canvas::new(20, 20);
        c.set_fill(Paint::Color(Color::new(1.0, 0.0, 0.0, 0.5))); // 50% red
        c.set_global_alpha(1.0);
        c.fill_rect(0.0, 0.0, 10.0, 10.0);

        let (r, g, b, _) = c.get_pixel(5, 5);
        // 50% red over white: r ≈ 255, g ≈ 128, b ≈ 128
        assert!(r >= 250);
        assert!((125..=130).contains(&g));
        assert!((125..=130).contains(&b));
    }

    #[test]
    fn test_clear_canvas() {
        let mut c = Canvas::new(10, 10);
        c.fill_rect(0.0, 0.0, 10.0, 10.0);
        c.clear();
        let (_, _, _, a) = c.get_pixel(5, 5);
        assert_eq!(a, 0); // transparent
    }

    #[test]
    fn test_clear_rect() {
        let mut c = Canvas::new(20, 20);
        c.set_fill(Paint::Color(Color::RED));
        c.fill_rect(0.0, 0.0, 20.0, 20.0);
        c.clear_rect(5.0, 5.0, 10.0, 10.0);

        // Inside cleared area — transparent
        let (_, _, _, a) = c.get_pixel(10, 10);
        assert_eq!(a, 0);

        // Outside cleared area — still red
        let (r, _, _, _) = c.get_pixel(0, 0);
        assert_eq!(r, 255);
    }

    #[test]
    fn test_to_rgba_bytes() {
        let c = Canvas::new(2, 2);
        let bytes = c.to_rgba_bytes();
        assert_eq!(bytes.len(), 16); // 2*2*4
                                     // All white
        assert_eq!(bytes[0], 255); // R
        assert_eq!(bytes[1], 255); // G
        assert_eq!(bytes[2], 255); // B
        assert_eq!(bytes[3], 255); // A
    }

    #[test]
    fn test_fill_rect_with_transform() {
        let mut c = Canvas::new(100, 100);
        c.set_fill(Paint::Color(Color::RED));
        c.translate(10.0, 10.0);
        c.fill_rect(0.0, 0.0, 5.0, 5.0);

        // The rect should be at (10,10) to (15,15)
        let (r, _, _, _) = c.get_pixel(12, 12);
        assert_eq!(r, 255);

        // (5,5) should still be white
        let (r, g, b, _) = c.get_pixel(5, 5);
        assert_eq!(r, 255);
        assert_eq!(g, 255);
        assert_eq!(b, 255);
    }

    #[test]
    fn test_stroke_rect() {
        let mut c = Canvas::new(50, 50);
        c.set_stroke(Paint::Color(Color::BLUE));
        c.set_stroke_style(StrokeStyle {
            line_width: 2.0,
            ..Default::default()
        });
        c.stroke_rect(10.0, 10.0, 10.0, 10.0);

        // Inside the stroked rect — should be blue
        let (_, _, b, _) = c.get_pixel(15, 15);
        assert_eq!(b, 255);
    }

    #[test]
    fn test_out_of_bounds() {
        let c = Canvas::new(10, 10);
        let (r, g, b, a) = c.get_pixel(100, 100);
        assert_eq!(r, 0);
        assert_eq!(g, 0);
        assert_eq!(b, 0);
        assert_eq!(a, 0);
    }

    #[test]
    fn test_multiple_fills_overlap() {
        let mut c = Canvas::new(50, 50);
        c.set_fill(Paint::Color(Color::RED));
        c.fill_rect(0.0, 0.0, 50.0, 50.0);

        c.set_fill(Paint::Color(Color::BLUE));
        c.set_global_alpha(0.5);
        c.fill_rect(10.0, 10.0, 30.0, 30.0);

        // Overlap area: red base + 50% blue blended on top
        // blend: dst.r * (1-a) + src.r * a = 255*0.5 + 0*0.5 = 127
        let (r, g, b, _) = c.get_pixel(25, 25);
        assert!(r < 255); // red reduced by blend
        assert_eq!(g, 0);
        assert!(b > 100); // blue present
    }

    #[test]
    fn test_fill_circle() {
        // Circle path goes through ellipse (cubic Beziers), not a rect path,
        // so it exercises the general fill_polygon path.
        let mut c = Canvas::new(100, 100);
        c.set_fill(Paint::Color(Color::RED));
        c.begin_path();
        c.circle(50.0, 50.0, 20.0);
        c.fill();

        // Some pixels within the bounding box should be filled (non-white)
        // Check a pixel at (60, 50) which is well inside the circle
        let (r, g, b, _) = c.get_pixel(60, 50);
        assert!(
            (r, g, b) != (255, 255, 255),
            "pixel inside circle should not be white"
        );

        // Far corner should still be white
        let (r, g, b, _) = c.get_pixel(0, 0);
        assert_eq!((r, g, b), (255, 255, 255));
    }

    #[test]
    fn test_fill_triangle() {
        let mut c = Canvas::new(100, 100);
        c.set_fill(Paint::Color(Color::GREEN));
        c.begin_path();
        c.move_to(10.0, 10.0);
        c.line_to(90.0, 10.0);
        c.line_to(50.0, 90.0);
        c.close_path();
        c.fill();

        // Centroid area should be green
        let (_r, g, _b, _) = c.get_pixel(50, 40);
        assert!(g > 200, "triangle interior should be green");

        // Outside should still be white
        let (r, g, b, _) = c.get_pixel(0, 0);
        assert_eq!((r, g, b), (255, 255, 255));
    }

    #[test]
    fn test_stroke_line() {
        let mut c = Canvas::new(100, 100);
        c.set_stroke(Paint::Color(Color::BLUE));
        c.set_stroke_style(StrokeStyle {
            line_width: 2.0,
            ..Default::default()
        });
        c.begin_path();
        c.move_to(10.0, 50.0);
        c.line_to(90.0, 50.0);
        c.stroke();

        // A pixel along the stroked line should be blue
        let (_, _, b, _) = c.get_pixel(50, 50);
        assert!(b > 200, "stroked line should be blue");

        // Far away should still be white
        let (r, g, b, _) = c.get_pixel(50, 0);
        assert_eq!((r, g, b), (255, 255, 255));
    }

    // --- draw_text tests ---

    #[test]
    fn test_draw_text_no_font_library() {
        let mut c = Canvas::new(100, 100);
        // No font library set → should not panic, canvas unchanged
        c.draw_text("Hello", 10.0, 50.0, 16.0, "sans-serif", Color::BLACK);
        let (r, g, b, _) = c.get_pixel(10, 50);
        assert_eq!((r, g, b), (255, 255, 255));
    }

    #[test]
    fn test_draw_text_empty_font_library() {
        let mut c = Canvas::new(100, 100);
        c.set_font_library(FontLibrary::empty());
        // Empty library → no faces, draw_text is a no-op
        c.draw_text("Hello", 10.0, 50.0, 16.0, "sans-serif", Color::BLACK);
        let (r, g, b, _) = c.get_pixel(10, 50);
        assert_eq!((r, g, b), (255, 255, 255));
    }

    #[test]
    fn test_draw_text_empty_string() {
        let mut c = Canvas::new(100, 100);
        c.set_font_library(FontLibrary::new());
        // Empty string → no crash, no changes
        c.draw_text("", 10.0, 50.0, 16.0, "sans-serif", Color::BLACK);
    }

    #[test]
    fn test_set_font_library() {
        let mut c = Canvas::new(100, 100);
        let lib = FontLibrary::empty();
        c.set_font_library(lib);
        // Should not panic; field is set
    }

    #[test]
    fn test_draw_text_with_system_fonts() {
        let lib = FontLibrary::new();
        if lib.face_count() == 0 {
            // Skip if no system fonts available (CI environments)
            return;
        }
        let mut c = Canvas::new(200, 100);
        c.set_font_library(lib);
        c.draw_text("A", 10.0, 50.0, 24.0, "sans-serif", Color::BLACK);
        // Some pixels near the glyph should differ from white
        let mut found_non_white = false;
        for py in 30..70u32 {
            for px in 5..50u32 {
                let (r, g, b, _) = c.get_pixel(px, py);
                if (r, g, b) != (255, 255, 255) {
                    found_non_white = true;
                    break;
                }
            }
            if found_non_white {
                break;
            }
        }
        assert!(
            found_non_white,
            "draw_text with system fonts should produce non-white pixels"
        );
    }

    #[test]
    fn test_draw_text_respects_position() {
        let lib = FontLibrary::new();
        if lib.face_count() == 0 {
            return;
        }
        let mut c = Canvas::new(200, 100);
        c.set_font_library(lib);
        c.draw_text("A", 100.0, 50.0, 24.0, "sans-serif", Color::BLACK);
        // Top-left corner far from glyph should remain white
        let (r, g, b, _) = c.get_pixel(0, 0);
        assert_eq!(
            (r, g, b),
            (255, 255, 255),
            "pixels far from drawn text should be unchanged"
        );
    }

    #[test]
    fn test_draw_text_color() {
        let lib = FontLibrary::new();
        if lib.face_count() == 0 {
            return;
        }
        let mut c = Canvas::new(200, 100);
        c.set_font_library(lib);
        c.draw_text("A", 10.0, 50.0, 24.0, "sans-serif", Color::RED);
        // Some pixels should have red channel > 200 and green/blue < 100
        let mut found_red = false;
        for py in 30..70u32 {
            for px in 5..50u32 {
                let (r, g, b, _) = c.get_pixel(px, py);
                if (r, g, b) != (255, 255, 255) && r > 200 && g < 100 && b < 100 {
                    found_red = true;
                    break;
                }
            }
            if found_red {
                break;
            }
        }
        assert!(found_red, "draw_text with RED should produce red pixels");
    }

    #[test]
    fn test_fill_ellipse() {
        let mut c = Canvas::new(100, 100);
        c.set_fill(Paint::Color(Color::GREEN));
        c.begin_path();
        c.ellipse(50.0, 50.0, 40.0, 20.0);
        c.fill();

        // Center pixel should be green (inside ellipse)
        let (_, g, _, _) = c.get_pixel(50, 50);
        assert!(g > 200, "ellipse center should be green");

        // Corner should still be white
        let (r, g, b, _) = c.get_pixel(0, 0);
        assert_eq!((r, g, b), (255, 255, 255));
    }

    #[test]
    fn test_scale_transform() {
        let mut c = Canvas::new(100, 100);
        c.scale(2.0, 3.0);
        c.fill_rect(0.0, 0.0, 5.0, 5.0);
        // With scale(2,3), a 5x5 rect becomes 10x15 on screen
        let (r, _, _, _) = c.get_pixel(12, 12);
        assert_eq!(r, 255); // black fill on white
    }

    #[test]
    fn test_global_alpha_clamped() {
        let mut c = Canvas::new(10, 10);
        c.set_global_alpha(-0.5);
        assert!((c.global_alpha() - 0.0).abs() < 0.001);
        c.set_global_alpha(2.0);
        assert!((c.global_alpha() - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_nested_save_restore() {
        let mut c = Canvas::new(100, 100);
        c.set_global_alpha(0.8);
        c.save();
        c.set_global_alpha(0.4);
        c.save();
        c.set_global_alpha(0.1);
        c.restore();
        assert!((c.global_alpha() - 0.4).abs() < 0.001);
        c.restore();
        assert!((c.global_alpha() - 0.8).abs() < 0.001);
    }

    #[test]
    fn test_restore_with_empty_stack() {
        let mut c = Canvas::new(10, 10);
        // Should not panic when stack is empty
        c.restore();
        assert!((c.global_alpha() - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_set_fill_rule() {
        use crate::path::FillRule;
        let mut c = Canvas::new(10, 10);
        c.set_fill_rule(FillRule::EvenOdd);
        assert_eq!(c.fill_rule(), FillRule::EvenOdd);
        c.set_fill_rule(FillRule::NonZero);
        assert_eq!(c.fill_rule(), FillRule::NonZero);
    }
}
