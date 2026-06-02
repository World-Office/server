//! Integration/comparison tests for the rendering pipeline.
//!
//! These tests verify that the canvas produces consistent, deterministic output.

use wo_renderer::gradient::GradientStop;
use wo_renderer::{FontLibrary, *};

// ============================================================================
// 1. Canvas Determinism Tests
// ============================================================================

#[test]
fn test_fill_rect_deterministic() {
    let mut canvas1 = Canvas::new(100, 100);
    let mut canvas2 = Canvas::new(100, 100);

    // Render the same scene twice
    canvas1.set_fill(Paint::Color(Color::RED));
    canvas1.fill_rect(10.0, 10.0, 50.0, 50.0);

    canvas2.set_fill(Paint::Color(Color::RED));
    canvas2.fill_rect(10.0, 10.0, 50.0, 50.0);

    let pixels1 = canvas1.to_rgba_bytes();
    let pixels2 = canvas2.to_rgba_bytes();

    assert_eq!(
        pixels1, pixels2,
        "Same operations should produce identical pixels"
    );
}

#[test]
fn test_fill_circle_deterministic() {
    let mut canvas1 = Canvas::new(100, 100);
    let mut canvas2 = Canvas::new(100, 100);

    canvas1.set_fill(Paint::Color(Color::GREEN));
    canvas1.begin_path();
    canvas1.circle(50.0, 50.0, 25.0);
    canvas1.fill();

    canvas2.set_fill(Paint::Color(Color::GREEN));
    canvas2.begin_path();
    canvas2.circle(50.0, 50.0, 25.0);
    canvas2.fill();

    let pixels1 = canvas1.to_rgba_bytes();
    let pixels2 = canvas2.to_rgba_bytes();

    assert_eq!(pixels1, pixels2);
}

#[test]
fn test_stroke_line_deterministic() {
    let mut canvas1 = Canvas::new(100, 100);
    let mut canvas2 = Canvas::new(100, 100);

    canvas1.set_stroke(Paint::Color(Color::BLUE));
    canvas1.set_stroke_style(StrokeStyle {
        line_width: 3.0,
        ..Default::default()
    });
    canvas1.begin_path();
    canvas1.move_to(10.0, 10.0);
    canvas1.line_to(90.0, 90.0);
    canvas1.stroke();

    canvas2.set_stroke(Paint::Color(Color::BLUE));
    canvas2.set_stroke_style(StrokeStyle {
        line_width: 3.0,
        ..Default::default()
    });
    canvas2.begin_path();
    canvas2.move_to(10.0, 10.0);
    canvas2.line_to(90.0, 90.0);
    canvas2.stroke();

    let pixels1 = canvas1.to_rgba_bytes();
    let pixels2 = canvas2.to_rgba_bytes();

    assert_eq!(pixels1, pixels2);
}

#[test]
fn test_multiple_operations_deterministic() {
    let mut canvas1 = Canvas::new(200, 200);
    let mut canvas2 = Canvas::new(200, 200);

    // Complex scene
    canvas1.set_fill(Paint::Color(Color::WHITE));
    canvas1.fill_rect(0.0, 0.0, 200.0, 200.0);

    canvas1.set_fill(Paint::Color(Color::RED));
    canvas1.fill_rect(10.0, 10.0, 80.0, 80.0);

    canvas1.set_fill(Paint::Color(Color::GREEN));
    canvas1.begin_path();
    canvas1.circle(150.0, 150.0, 40.0);
    canvas1.fill();

    canvas1.set_stroke(Paint::Color(Color::BLUE));
    canvas1.set_stroke_style(StrokeStyle {
        line_width: 5.0,
        ..Default::default()
    });
    canvas1.begin_path();
    canvas1.move_to(10.0, 150.0);
    canvas1.line_to(90.0, 150.0);
    canvas1.stroke();

    // Same operations on second canvas
    canvas2.set_fill(Paint::Color(Color::WHITE));
    canvas2.fill_rect(0.0, 0.0, 200.0, 200.0);

    canvas2.set_fill(Paint::Color(Color::RED));
    canvas2.fill_rect(10.0, 10.0, 80.0, 80.0);

    canvas2.set_fill(Paint::Color(Color::GREEN));
    canvas2.begin_path();
    canvas2.circle(150.0, 150.0, 40.0);
    canvas2.fill();

    canvas2.set_stroke(Paint::Color(Color::BLUE));
    canvas2.set_stroke_style(StrokeStyle {
        line_width: 5.0,
        ..Default::default()
    });
    canvas2.begin_path();
    canvas2.move_to(10.0, 150.0);
    canvas2.line_to(90.0, 150.0);
    canvas2.stroke();

    let pixels1 = canvas1.to_rgba_bytes();
    let pixels2 = canvas2.to_rgba_bytes();

    assert_eq!(pixels1, pixels2);
}

// ============================================================================
// 2. Pixel Accuracy Tests
// ============================================================================

#[test]
fn test_fill_white_rect() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::WHITE));
    canvas.fill_rect(0.0, 0.0, 100.0, 100.0);

    let pixels = canvas.to_rgba_bytes();

    // All pixels should be white
    for i in 0..pixels.len() {
        let pixel_idx = i / 4;
        let channel = i % 4;
        if channel < 3 {
            // R, G, B
            assert_eq!(
                pixels[i], 255,
                "Pixel {} channel {} should be white",
                pixel_idx, channel
            );
        }
    }
}

#[test]
fn test_fill_black_rect() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::BLACK));
    canvas.fill_rect(10.0, 10.0, 80.0, 80.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Center pixel of filled area should be black
    let idx = ((50 * width) + 50) * 4;
    assert_eq!(pixels[idx], 0, "R should be 0");
    assert_eq!(pixels[idx + 1], 0, "G should be 0");
    assert_eq!(pixels[idx + 2], 0, "B should be 0");
    assert_eq!(pixels[idx + 3], 255, "A should be 255");

    // Pixel outside filled area should still be white
    let idx = 0;  // pixel at (0, 0)
    assert_eq!(pixels[idx], 255, "R should be 255");
    assert_eq!(pixels[idx + 1], 255, "G should be 255");
    assert_eq!(pixels[idx + 2], 255, "B should be 255");
}

#[test]
fn test_fill_red_rect() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::RED));
    canvas.fill_rect(10.0, 10.0, 80.0, 80.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Center pixel should be red
    let idx = ((50 * width) + 50) * 4;
    assert_eq!(pixels[idx], 255, "R should be 255");
    assert_eq!(pixels[idx + 1], 0, "G should be 0");
    assert_eq!(pixels[idx + 2], 0, "B should be 0");
    assert_eq!(pixels[idx + 3], 255, "A should be 255");
}

#[test]
fn test_alpha_blending() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::new(1.0, 0.0, 0.0, 0.5))); // 50% red
    canvas.fill_rect(0.0, 0.0, 100.0, 100.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // With 50% red over white, result should be:
    // R: 255*0.5 + 255*0.5 = 255
    // G: 0*0.5 + 255*0.5 = 127.5 → 127 or 128
    // B: 0*0.5 + 255*0.5 = 127.5 → 127 or 128
    let idx = ((50 * width) + 50) * 4;
    assert_eq!(pixels[idx], 255, "R should be 255");
    assert!(
        pixels[idx + 1] >= 127 && pixels[idx + 1] <= 128,
        "G should be ~127"
    );
    assert!(
        pixels[idx + 2] >= 127 && pixels[idx + 2] <= 128,
        "B should be ~127"
    );
}

// ============================================================================
// 3. Gradient Rendering Tests
// ============================================================================

#[test]
fn test_linear_gradient_horizontal() {
    let mut canvas = Canvas::new(100, 100);
    let gradient = Gradient::linear(
        0.0,
        50.0,
        100.0,
        50.0,
        vec![
            GradientStop::new(0.0, Color::RED),
            GradientStop::new(1.0, Color::BLUE),
        ],
    );

    canvas.fill_rect_gradient(10.0, 10.0, 80.0, 80.0, &gradient);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Left side (near red stop) should be more red
    let left_idx = ((50 * width) + 20) * 4;
    assert!(
        pixels[left_idx] > 200,
        "Left side should have high red component"
    );

    // Right side (near blue stop) should be more blue
    let right_idx = ((50 * width) + 80) * 4;
    assert!(
        pixels[right_idx + 2] > 200,
        "Right side should have high blue component"
    );
}

#[test]
fn test_linear_gradient_vertical() {
    let mut canvas = Canvas::new(100, 100);
    let gradient = Gradient::linear(
        50.0,
        0.0,
        50.0,
        100.0,
        vec![
            GradientStop::new(0.0, Color::GREEN),
            GradientStop::new(1.0, Color::new(1.0, 1.0, 0.0, 1.0)),
        ],
    );

    canvas.fill_rect_gradient(10.0, 10.0, 80.0, 80.0, &gradient);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Top side (near green stop) should be more green
    let top_idx = ((20 * width) + 50) * 4;
    assert!(
        pixels[top_idx + 1] > 200,
        "Top side should have high green component"
    );

    // Bottom side (near yellow stop) should have high red and green
    let bottom_idx = ((80 * width) + 50) * 4;
    assert!(
        pixels[bottom_idx] > 200 && pixels[bottom_idx + 1] > 200,
        "Bottom side should have high red and green components"
    );
}

#[test]
fn test_radial_gradient_center() {
    let mut canvas = Canvas::new(100, 100);
    let gradient = Gradient::radial(
        50.0,
        50.0,
        30.0,
        vec![
            GradientStop::new(0.0, Color::WHITE),
            GradientStop::new(1.0, Color::BLACK),
        ],
    );

    canvas.fill_rect_gradient(10.0, 10.0, 80.0, 80.0, &gradient);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Center pixel should be white
    let center_idx = ((50 * width) + 50) * 4;
    assert!(
        pixels[center_idx] > 240 && pixels[center_idx + 1] > 240 && pixels[center_idx + 2] > 240,
        "Center should be nearly white"
    );

    // Edge pixel should be darker
    let edge_idx = ((50 * width) + 75) * 4;
    assert!(
        pixels[edge_idx] < 150 || pixels[edge_idx + 1] < 150 || pixels[edge_idx + 2] < 150,
        "Edge should be darker than center"
    );
}

// ============================================================================
// 4. Text Layout Integration Tests
// ============================================================================

#[test]
fn test_text_layout_empty() {
    let engine = TextLayoutEngine::new();
    let fonts = FontLibrary::empty();
    let layout = engine.layout_text("", 12.0, 100.0, &fonts);

    assert_eq!(layout.lines.len(), 0, "Empty text should produce no lines");
    assert_eq!(layout.total_width, 0.0);
    assert_eq!(layout.total_height, 0.0);
}

#[test]
fn test_text_layout_single_word() {
    let engine = TextLayoutEngine::new();
    let fonts = FontLibrary::empty();
    let layout = engine.layout_text("hello", 12.0, 100.0, &fonts);

    assert_eq!(layout.lines.len(), 1, "Single word should produce one line");
    assert_eq!(
        layout.lines[0].glyphs.glyphs.len(),
        5,
        "Should have 5 glyphs for 'hello'"
    );
    assert!(layout.total_width > 0.0);
    assert!(layout.total_height > 0.0);
}

#[test]
fn test_text_layout_word_wrap() {
    let engine = TextLayoutEngine::new();
    let fonts = FontLibrary::empty();
    // Narrow width should force wrapping
    let layout = engine.layout_text("hello world test", 12.0, 50.0, &fonts);

    assert!(layout.lines.len() > 1, "Narrow width should cause wrapping");
}

// ============================================================================
// 5. Transform Tests
// ============================================================================

#[test]
fn test_translate_fill() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::RED));
    canvas.translate(10.0, 10.0);
    canvas.fill_rect(0.0, 0.0, 20.0, 20.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Pixel at (10, 10) should be filled
    let idx = ((10 * width) + 10) * 4;
    assert_eq!(pixels[idx], 255, "Pixel at translated origin should be red");

    // Pixel at (5, 5) should still be white (before translation)
    let idx = ((5 * width) + 5) * 4;
    assert_eq!(
        pixels[idx], 255,
        "Pixel at untranslated origin should be white"
    );
}

#[test]
fn test_scale_fill() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::GREEN));
    canvas.scale(2.0, 2.0);
    canvas.fill_rect(10.0, 10.0, 10.0, 10.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // With scale(2,2), a 10x10 rect at (10,10) becomes 20x20 at (20,20)
    // Pixel at (25, 25) should be filled
    let idx = ((25 * width) + 25) * 4;
    assert_eq!(pixels[idx + 1], 255, "Scaled area should be green");
}

#[test]
fn test_rotate_fill() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::BLUE));
    canvas.rotate(std::f32::consts::PI / 4.0); // 45 degrees
    canvas.fill_rect(40.0, 40.0, 20.0, 20.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // After 45-degree rotation, the rect should be in a diamond pattern
    // Check that center area has some blue
    let center_idx = ((50 * width) + 50) * 4;
    assert!(
        pixels[center_idx + 2] > 0,
        "Center area should have some blue after rotation"
    );
}

// ============================================================================
// 6. State Stack Tests
// ============================================================================

#[test]
fn test_save_restore_color() {
    let mut canvas = Canvas::new(100, 100);

    // Set red and save
    canvas.set_fill(Paint::Color(Color::RED));
    canvas.save();

    // Change to blue and fill
    canvas.set_fill(Paint::Color(Color::BLUE));
    canvas.fill_rect(10.0, 10.0, 30.0, 30.0);

    // Restore and fill again
    canvas.restore();
    canvas.fill_rect(40.0, 40.0, 30.0, 30.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // First fill should be blue
    let idx1 = ((20 * width) + 20) * 4;
    assert_eq!(pixels[idx1 + 2], 255, "First fill should be blue");

    // Second fill should be red (restored)
    let idx2 = ((55 * width) + 55) * 4;
    assert_eq!(pixels[idx2], 255, "Second fill should be red");
}

#[test]
fn test_save_restore_transform() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::GREEN));

    // Save state before translate
    canvas.save();
    canvas.translate(10.0, 10.0);
    canvas.fill_rect(0.0, 0.0, 10.0, 10.0);

    // Restore to original transform
    canvas.restore();
    canvas.fill_rect(0.0, 0.0, 10.0, 10.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // First rect should be at (10, 10) due to translate
    let idx1 = ((10 * width) + 10) * 4;
    assert_eq!(pixels[idx1 + 1], 255, "First rect at translated position");

    // Second rect should be at (0, 0) after restore
    let idx2 = ((5 * width) + 5) * 4;
    assert_eq!(pixels[idx2 + 1], 255, "Second rect at original position");
}

// ============================================================================
// 7. Page Size Tests
// ============================================================================

#[test]
fn test_a4_canvas_size() {
    let page = Page::a4();
    let canvas = Canvas::from_page(&page, 72.0);

    assert_eq!(canvas.width, 595, "A4 at 72 DPI should be 595px wide");
    assert_eq!(canvas.height, 842, "A4 at 72 DPI should be 842px tall");
}

#[test]
fn test_letter_canvas_size() {
    let page = Page::letter();
    let canvas = Canvas::from_page(&page, 72.0);

    assert_eq!(canvas.width, 612, "Letter at 72 DPI should be 612px wide");
    assert_eq!(canvas.height, 792, "Letter at 72 DPI should be 792px tall");
}

// ============================================================================
// 8. Additional Determinism and Edge Cases
// ============================================================================

#[test]
fn test_transparent_fill() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::TRANSPARENT));
    canvas.fill_rect(0.0, 0.0, 100.0, 100.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Should still be white (canvas default)
    let idx = ((50 * width) + 50) * 4;
    assert_eq!(
        pixels[idx], 255,
        "Transparent fill should show white background"
    );
}

#[test]
fn test_zero_width_rect() {
    let mut canvas1 = Canvas::new(100, 100);
    let mut canvas2 = Canvas::new(100, 100);

    canvas1.set_fill(Paint::Color(Color::RED));
    canvas1.fill_rect(10.0, 10.0, 0.0, 20.0);

    canvas2.set_fill(Paint::Color(Color::RED));
    canvas2.fill_rect(10.0, 10.0, 0.0, 20.0);

    let pixels1 = canvas1.to_rgba_bytes();
    let pixels2 = canvas2.to_rgba_bytes();

    assert_eq!(pixels1, pixels2);
}

#[test]
fn test_zero_height_rect() {
    let mut canvas1 = Canvas::new(100, 100);
    let mut canvas2 = Canvas::new(100, 100);

    canvas1.set_fill(Paint::Color(Color::BLUE));
    canvas1.fill_rect(10.0, 10.0, 20.0, 0.0);

    canvas2.set_fill(Paint::Color(Color::BLUE));
    canvas2.fill_rect(10.0, 10.0, 20.0, 0.0);

    let pixels1 = canvas1.to_rgba_bytes();
    let pixels2 = canvas2.to_rgba_bytes();

    assert_eq!(pixels1, pixels2);
}

#[test]
fn test_negative_rect_position() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::GREEN));
    canvas.fill_rect(-10.0, -10.0, 20.0, 20.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Pixel at (0, 0) should be filled (clipped to visible area)
    let idx = 0;  // pixel at (0, 0)
    assert_eq!(
        pixels[idx + 1],
        255,
        "Negative rect should clip to visible area"
    );
}

#[test]
fn test_oversized_rect() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::new(1.0, 1.0, 0.0, 1.0)));
    canvas.fill_rect(90.0, 90.0, 50.0, 50.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Pixel at (95, 95) should be filled (clipped to visible area)
    let idx = ((95 * width) + 95) * 4;
    assert!(
        pixels[idx] > 200 && pixels[idx + 1] > 200,
        "Oversized rect should clip to visible area"
    );
}

#[test]
fn test_fill_triangle_path() {
    let mut canvas1 = Canvas::new(100, 100);
    let mut canvas2 = Canvas::new(100, 100);

    // Fill a triangle using path
    canvas1.set_fill(Paint::Color(Color::RED));
    canvas1.begin_path();
    canvas1.move_to(50.0, 20.0);
    canvas1.line_to(80.0, 80.0);
    canvas1.line_to(20.0, 80.0);
    canvas1.close_path();
    canvas1.fill();

    // Same operations on second canvas
    canvas2.set_fill(Paint::Color(Color::RED));
    canvas2.begin_path();
    canvas2.move_to(50.0, 20.0);
    canvas2.line_to(80.0, 80.0);
    canvas2.line_to(20.0, 80.0);
    canvas2.close_path();
    canvas2.fill();

    let pixels1 = canvas1.to_rgba_bytes();
    let pixels2 = canvas2.to_rgba_bytes();

    assert_eq!(pixels1, pixels2);
}

#[test]
fn test_ellipse_path() {
    let mut canvas1 = Canvas::new(100, 100);
    let mut canvas2 = Canvas::new(100, 100);

    canvas1.set_fill(Paint::Color(Color::new(0.5, 0.0, 0.5, 1.0)));
    canvas1.begin_path();
    canvas1.ellipse(50.0, 50.0, 30.0, 20.0);
    canvas1.fill();

    canvas2.set_fill(Paint::Color(Color::new(0.5, 0.0, 0.5, 1.0)));
    canvas2.begin_path();
    canvas2.ellipse(50.0, 50.0, 30.0, 20.0);
    canvas2.fill();

    let pixels1 = canvas1.to_rgba_bytes();
    let pixels2 = canvas2.to_rgba_bytes();

    assert_eq!(pixels1, pixels2);
}

#[test]
fn test_multiple_save_restore() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::WHITE));

    // Save state 1
    canvas.save();
    canvas.set_fill(Paint::Color(Color::RED));
    canvas.fill_rect(10.0, 10.0, 20.0, 20.0);

    // Save state 2
    canvas.save();
    canvas.set_fill(Paint::Color(Color::GREEN));
    canvas.fill_rect(40.0, 40.0, 20.0, 20.0);

    // Restore to state 1
    canvas.restore();
    canvas.fill_rect(70.0, 10.0, 20.0, 20.0);

    // Restore to initial state
    canvas.restore();
    canvas.fill_rect(70.0, 70.0, 20.0, 20.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // First and second fills should be red and green
    let idx1 = ((20 * width) + 20) * 4;
    assert_eq!(pixels[idx1], 255, "First fill should be red");

    let idx2 = ((50 * width) + 50) * 4;
    assert_eq!(pixels[idx2 + 1], 255, "Second fill should be green");

    // Third fill should be red (restored to state 1)
    let idx3 = ((20 * width) + 80) * 4;
    assert_eq!(pixels[idx3], 255, "Third fill should be red");

    // Fourth fill should be white (initial state)
    let idx4 = ((80 * width) + 80) * 4;
    assert_eq!(pixels[idx4], 255, "Fourth fill should be white");
    assert_eq!(pixels[idx4 + 1], 255, "Fourth fill should be white");
    assert_eq!(pixels[idx4 + 2], 255, "Fourth fill should be white");
}

#[test]
fn test_reset_transform() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::new(0.0, 1.0, 1.0, 1.0)));

    canvas.translate(50.0, 50.0);
    canvas.scale(2.0, 2.0);

    canvas.reset_transform();
    canvas.fill_rect(0.0, 0.0, 10.0, 10.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Should be at (0, 0) after reset
    let idx = ((5 * width) + 5) * 4;
    assert_eq!(pixels[idx + 1], 255, "Fill should be at origin after reset");
}

#[test]
fn test_clear_canvas() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::RED));
    canvas.fill_rect(0.0, 0.0, 100.0, 100.0);

    canvas.clear();

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // All pixels should be transparent
    let idx = ((50 * width) + 50) * 4;
    assert_eq!(
        pixels[idx + 3],
        0,
        "Canvas should be transparent after clear"
    );
}

#[test]
fn test_clear_rect() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::new(1.0, 0.0, 1.0, 1.0)));
    canvas.fill_rect(0.0, 0.0, 100.0, 100.0);

    canvas.clear_rect(20.0, 20.0, 40.0, 40.0);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // Cleared area should be transparent
    let idx1 = ((40 * width) + 40) * 4;
    assert_eq!(pixels[idx1 + 3], 0, "Cleared area should be transparent");

    // Outside cleared area should still be magenta
    let idx2 = 0;  // pixel at (0, 0)
    assert!(
        pixels[idx2] > 200 && pixels[idx2 + 2] > 200,
        "Outside area should be magenta"
    );
}

#[test]
fn test_to_rgba_bytes_size() {
    let canvas = Canvas::new(10, 20);
    let pixels = canvas.to_rgba_bytes();

    // Should be width * height * 4 (RGBA)
    assert_eq!(pixels.len(), 10 * 20 * 4);
}

#[test]
fn test_get_pixel() {
    let mut canvas = Canvas::new(100, 100);
    canvas.set_fill(Paint::Color(Color::RED));
    canvas.fill_rect(0.0, 0.0, 100.0, 100.0);

    let (r, g, b, a) = canvas.get_pixel(50, 50);

    assert_eq!(r, 255, "Red channel should be 255");
    assert_eq!(g, 0, "Green channel should be 0");
    assert_eq!(b, 0, "Blue channel should be 0");
    assert_eq!(a, 255, "Alpha channel should be 255");
}

#[test]
fn test_get_pixel_out_of_bounds() {
    let canvas = Canvas::new(100, 100);

    let (r, g, b, a) = canvas.get_pixel(200, 200);

    assert_eq!(r, 0, "Out of bounds pixel should be 0");
    assert_eq!(g, 0, "Out of bounds pixel should be 0");
    assert_eq!(b, 0, "Out of bounds pixel should be 0");
    assert_eq!(a, 0, "Out of bounds pixel should be 0");
}

#[test]
fn test_gradient_single_stop() {
    let mut canvas = Canvas::new(100, 100);
    let gradient = Gradient::linear(
        0.0,
        0.0,
        100.0,
        0.0,
        vec![GradientStop::new(0.5, Color::RED)],
    );

    canvas.fill_rect_gradient(10.0, 10.0, 80.0, 80.0, &gradient);

    let pixels = canvas.to_rgba_bytes();
    let width = 100;

    // With single stop, all pixels should be the same color
    let idx1 = ((50 * width) + 20) * 4;
    let idx2 = ((50 * width) + 80) * 4;

    assert_eq!(
        pixels[idx1], pixels[idx2],
        "Single stop should produce uniform color"
    );
    assert_eq!(pixels[idx1], 255, "Should be red");
}

#[test]
fn test_text_layout_metrics() {
    let engine = TextLayoutEngine::new();
    let fonts = FontLibrary::empty();
    let layout = engine.layout_text("test", 12.0, 100.0, &fonts);

    assert_eq!(layout.lines.len(), 1);
    assert!(layout.total_width > 0.0);
    assert!(layout.total_height > 0.0);

    let line = &layout.lines[0];
    assert!(line.ascent > 0.0);
    assert!(line.descent >= 0.0);
    assert!(line.width > 0.0);
}
