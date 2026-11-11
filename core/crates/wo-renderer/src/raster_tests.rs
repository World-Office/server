//! Anti-aliased rasterization tests.
//!
//! Tests for coverage-based AA rendering, stroke joins/dashes, and clip stack.

use crate::canvas::Canvas;
use crate::color::{Color, Paint};
use crate::path::{FillRule, PathBuilder};

#[test]
fn test_fill_aa_coverage_basic() {
    // Test that fill_aa_coverage can be called without panic
    let mut c = Canvas::new(100, 100);
    c.set_fill(Paint::Color(Color::BLACK));
    c.begin_path();
    c.rect(20.0, 20.0, 60.0, 60.0);
    c.fill_aa_coverage();

    // Background should still be white at (0,0)
    let (r, g, b, _) = c.get_pixel(0, 0);
    assert_eq!(
        (r, g, b),
        (255, 255, 255),
        "AA fill should not affect background"
    );
}

#[test]
fn test_fill_aa_coverage_rectangle() {
    let mut c = Canvas::new(100, 100);
    c.set_fill(Paint::Color(Color::BLACK));
    c.begin_path();
    c.rect(20.0, 20.0, 60.0, 60.0);
    c.fill_aa_coverage();

    // Center should be filled (black or near black)
    let (r, g, b, _) = c.get_pixel(50, 50);
    assert!(
        r < 100 && g < 100 && b < 100,
        "AA fill rectangle center should be dark"
    );
}

#[test]
fn test_stroke_aa_coverage_basic() {
    // Test that stroke_aa_coverage can be called without panic
    let mut c = Canvas::new(100, 100);
    c.set_stroke(Paint::Color(Color::BLACK));
    c.begin_path();
    c.move_to(10.0, 50.0);
    c.line_to(90.0, 50.0);
    c.stroke_aa_coverage();

    // Should not panic
    assert!(true, "AA stroke should complete without panic");
}

#[test]
fn test_stroke_aa_coverage_width() {
    let mut c = Canvas::new(100, 100);
    c.set_stroke(Paint::Color(Color::BLACK));
    c.begin_path();
    c.move_to(10.0, 50.0);
    c.line_to(90.0, 50.0);
    c.set_stroke_style(crate::color::StrokeStyle {
        line_width: 5.0,
        ..Default::default()
    });
    c.stroke_aa_coverage();

    // Should not panic with wide stroke
    assert!(true, "AA stroke with width should complete");
}

#[test]
fn test_clip_aa_coverage() {
    // Test AA clip path
    let mut c = Canvas::new(100, 100);

    // Set up a clip path
    c.begin_path();
    c.rect(20.0, 20.0, 60.0, 60.0);
    c.clip_aa_coverage();

    // Verify clip is set
    assert!(c.has_clip(), "AA clip should be active");
}

#[test]
fn test_rasterize_path_aa_fill() {
    let mut c = Canvas::new(100, 100);
    c.set_fill(Paint::Color(Color::BLACK));
    let mut path = PathBuilder::new();
    path.rect(20.0, 20.0, 60.0, 60.0);

    c.rasterize_path_aa(&path, false, 1.0);

    // Center should be filled
    let (r, g, b, _) = c.get_pixel(50, 50);
    assert!(
        r < 100 && g < 100 && b < 100,
        "AA rasterize fill should work"
    );
}

#[test]
fn test_rasterize_path_aa_stroke() {
    let mut c = Canvas::new(100, 100);
    c.set_stroke(Paint::Color(Color::BLACK));
    let mut path = PathBuilder::new();
    path.move_to(10.0, 50.0);
    path.line_to(90.0, 50.0);

    c.rasterize_path_aa(&path, true, 3.0);

    // Should not panic
    assert!(true, "AA rasterize stroke should complete");
}

#[test]
fn test_aa_rasterization_with_transform() {
    // Test AA rasterization with transforms
    let mut c = Canvas::new(100, 100);
    c.set_fill(Paint::Color(Color::BLACK));
    c.scale(2.0, 2.0);
    c.begin_path();
    c.rect(10.0, 10.0, 20.0, 20.0);
    c.fill_aa_coverage();

    // With scale(2,2), the rect should be at screen coordinates 20-60
    // Check that something was drawn
    let mut found_dark = false;
    for y in 20..60 {
        for x in 20..60 {
            let (r, g, b, _) = c.get_pixel(x, y);
            if r < 100 && g < 100 && b < 100 {
                found_dark = true;
            }
        }
    }
    assert!(
        found_dark,
        "AA fill with transform should produce dark pixels"
    );
}

#[test]
fn test_fill_rule_even_odd_aa() {
    // Test AA with even-odd fill rule
    let mut c = Canvas::new(100, 100);
    c.set_fill(Paint::Color(Color::BLACK));
    c.set_fill_rule(FillRule::EvenOdd);
    c.begin_path();
    // Simple rectangle - should fill with even-odd
    c.rect(20.0, 20.0, 60.0, 60.0);
    c.fill_aa_coverage();

    // Center should be filled (even-odd with one path = filled)
    let (r, g, b, _) = c.get_pixel(50, 50);
    assert!(
        r < 100 && g < 100 && b < 100,
        "Even-odd AA fill: single rect should be filled"
    );
}

#[test]
fn test_aa_coverage_edge_behavior() {
    // Test that AA produces some edge coverage
    let mut c = Canvas::new(100, 100);
    c.set_fill(Paint::Color(Color::BLACK));
    c.begin_path();
    c.rect(20.0, 20.0, 60.0, 60.0);
    c.fill_aa_coverage();

    // Check corner near the rectangle edge
    let (r_corner, _, _, _) = c.get_pixel(20, 20);
    // Corner should have some darkening (either from fill or AA)
    assert!(r_corner < 255, "AA fill should affect corner pixels");
}

#[test]
fn test_stroke_joins_aa() {
    // Test AA stroke with different line joins
    let mut c = Canvas::new(100, 100);
    c.set_stroke(Paint::Color(Color::BLACK));
    c.begin_path();
    c.move_to(10.0, 10.0);
    c.line_to(50.0, 90.0);
    c.line_to(90.0, 10.0);
    c.set_stroke_style(crate::color::StrokeStyle {
        line_width: 5.0,
        line_join: crate::color::LineJoin::Round,
        ..Default::default()
    });
    c.stroke_aa_coverage();

    // Should not panic
    assert!(true, "AA stroke with join should complete");
}

#[test]
fn test_aa_coverage_methods_exist() {
    // Verify that all AA coverage methods exist and are callable
    let mut c = Canvas::new(100, 100);

    // These should all compile and be callable
    c.begin_path();
    c.rect(10.0, 10.0, 10.0, 10.0);
    c.fill_aa_coverage();

    c.begin_path();
    c.move_to(10.0, 10.0);
    c.line_to(20.0, 20.0);
    c.stroke_aa_coverage();

    c.begin_path();
    c.rect(10.0, 10.0, 10.0, 10.0);
    c.clip_aa_coverage();

    let path = PathBuilder::new();
    c.rasterize_path_aa(&path, false, 1.0);
    c.rasterize_path_aa(&path, true, 1.0);

    assert!(true, "All AA coverage methods should be callable");
}

// --- Image drawing: bilinear scaling + transparent blend ---

/// Encode a procedurally generated RGBA image as PNG bytes.
fn encode_test_png(width: u32, height: u32, fill: impl Fn(u32, u32) -> [u8; 4]) -> Vec<u8> {
    let mut img = image::RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            img.put_pixel(x, y, image::Rgba(fill(x, y)));
        }
    }
    let mut bytes = Vec::new();
    img.write_to(
        &mut std::io::Cursor::new(&mut bytes),
        image::ImageFormat::Png,
    )
    .unwrap();
    bytes
}

#[test]
fn test_draw_image_bilinear_upscale_interpolates() {
    // 2x2 source: left column black, right column white.
    let png = encode_test_png(2, 2, |x, _| {
        if x == 0 {
            [0, 0, 0, 255]
        } else {
            [255, 255, 255, 255]
        }
    });
    let mut c = Canvas::new(20, 20);
    c.draw_image(&png, 5.0, 5.0, 10.0, 10.0).unwrap();

    // The middle of the destination must be a grey strictly between black
    // and white: nearest-neighbour sampling would only produce pure
    // black/white, bilinear interpolation produces intermediate values.
    let (r, g, b, _) = c.get_pixel(10, 10);
    assert!(
        r > 10 && r < 245 && g > 10 && g < 245 && b > 10 && b < 245,
        "bilinear upscale should produce intermediate grey at the column boundary, got ({},{},{})",
        r,
        g,
        b
    );
    // Edge pixel centres clamp to the source edge columns.
    let (r_left, _, _, _) = c.get_pixel(5, 5);
    assert_eq!(r_left, 0, "left edge should sample the black source column");
    let (r_right, _, _, _) = c.get_pixel(14, 14);
    assert_eq!(
        r_right, 255,
        "right edge should sample the white source column"
    );
}

#[test]
fn test_draw_image_transparent_blend() {
    let mut c = Canvas::new(16, 16);
    c.set_fill(Paint::Color(Color::new(1.0, 0.0, 0.0, 1.0)));
    c.fill_rect(0.0, 0.0, 16.0, 16.0);

    // A fully transparent image must leave the background untouched.
    let transparent = encode_test_png(4, 4, |_, _| [255, 0, 0, 0]);
    c.draw_image(&transparent, 0.0, 0.0, 8.0, 8.0).unwrap();
    let (r, g, b, _) = c.get_pixel(3, 3);
    assert_eq!(
        (r, g, b),
        (255, 0, 0),
        "fully transparent image must not alter the background"
    );

    // 50% black over red -> roughly half the red channel (alpha applied
    // exactly once, not squared).
    let half = encode_test_png(4, 4, |_, _| [0, 0, 0, 128]);
    c.draw_image(&half, 8.0, 0.0, 8.0, 8.0).unwrap();
    let (r, g, b, _) = c.get_pixel(12, 4);
    assert_eq!((g, b), (0, 0), "black source keeps the other channels off");
    assert!(
        r > 100 && r < 160,
        "50% transparent black over red should halve the red channel, got {}",
        r
    );
}

#[test]
fn test_draw_image_alpha_gradient_smooth() {
    // Horizontal alpha ramp: transparent -> opaque white over a red canvas.
    let png = encode_test_png(8, 1, |x, _| [255, 255, 255, (x * 36) as u8]);
    let mut c = Canvas::new(16, 16);
    c.set_fill(Paint::Color(Color::new(1.0, 0.0, 0.0, 1.0)));
    c.fill_rect(0.0, 0.0, 16.0, 16.0);
    c.draw_image(&png, 0.0, 0.0, 16.0, 16.0).unwrap();

    // Opacity must increase monotonically from left to right. White over
    // red leaves red at 255, so whiteness is read from the blue channel
    // (blue rises toward 255 as the source alpha grows).
    let mut prev = 0.0_f32;
    for x in [2u32, 6, 8, 12, 14] {
        let (_, _, b, _) = c.get_pixel(x, 8);
        let whiteness = b as f32;
        assert!(
            whiteness >= prev - 1.0,
            "alpha ramp should whiten monotonically at x={}",
            x
        );
        prev = whiteness;
    }
}

#[test]
fn test_draw_image_global_alpha() {
    let png = encode_test_png(4, 4, |_, _| [0, 0, 255, 255]); // opaque blue
    let mut c = Canvas::new(16, 16);
    c.set_fill(Paint::Color(Color::new(1.0, 0.0, 0.0, 1.0)));
    c.fill_rect(0.0, 0.0, 16.0, 16.0);
    c.set_global_alpha(0.5);
    c.draw_image(&png, 0.0, 0.0, 8.0, 8.0).unwrap();
    let (r, g, b, _) = c.get_pixel(4, 4);
    assert_eq!(g, 0);
    assert!(
        r > 100 && r < 170 && b > 100 && b < 170,
        "global alpha 0.5 over red should yield a red/blue mix, got ({},{},{})",
        r,
        g,
        b
    );
}

#[test]
fn test_draw_image_respects_transform() {
    // 4x4 opaque green source drawn at (5,5,10,10) under scale(2,2):
    // the image must land on screen in the (10,10)..(30,30) area.
    let png = encode_test_png(4, 4, |_, _| [0, 200, 0, 255]);
    let mut c = Canvas::new(64, 64);
    c.set_fill(Paint::Color(Color::new(1.0, 1.0, 1.0, 1.0)));
    c.fill_rect(0.0, 0.0, 64.0, 64.0);
    c.scale(2.0, 2.0);
    c.draw_image(&png, 5.0, 5.0, 10.0, 10.0).unwrap();

    let (r, g, b, _) = c.get_pixel(20, 20);
    assert_eq!(
        (r, b),
        (0, 0),
        "transformed rect interior should be image green"
    );
    assert!(g > 150, "image green should be present, got {}", g);

    let (r, g, b, _) = c.get_pixel(8, 8);
    assert_eq!(
        (r, g, b),
        (255, 255, 255),
        "no image pixels outside the transformed rectangle"
    );
}

#[test]
fn test_draw_image_respects_clip() {
    let png = encode_test_png(8, 8, |_, _| [0, 0, 255, 255]);
    let mut c = Canvas::new(32, 32);
    c.set_fill(Paint::Color(Color::new(1.0, 1.0, 1.0, 1.0)));
    c.fill_rect(0.0, 0.0, 32.0, 32.0);
    // Clip to the left half; the image spans the whole canvas.
    c.begin_path();
    c.rect(0.0, 0.0, 16.0, 32.0);
    c.clip();
    c.draw_image(&png, 0.0, 0.0, 32.0, 32.0).unwrap();

    let (_, _, b, _) = c.get_pixel(8, 16);
    assert_eq!(b, 255, "image is drawn inside the clip region");
    let (r, g, b, _) = c.get_pixel(24, 16);
    assert_eq!(
        (r, g, b),
        (255, 255, 255),
        "nothing is drawn outside the clip region"
    );
}
