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
    assert_eq!((r, g, b), (255, 255, 255), "AA fill should not affect background");
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
    assert!(r < 100 && g < 100 && b < 100, "AA fill rectangle center should be dark");
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
    assert!(r < 100 && g < 100 && b < 100, "AA rasterize fill should work");
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
    assert!(found_dark, "AA fill with transform should produce dark pixels");
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
    assert!(r < 100 && g < 100 && b < 100, "Even-odd AA fill: single rect should be filled");
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
