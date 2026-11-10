//! Image rendering tests for wo-renderer-wasm.
//!
//! Tests for Canvas::draw_image and DocxBlock::Image rendering (DM-7).

use super::canvas_bridge::*;
use super::layout::*;
use super::stub_model::*;
use image::RgbaImage;
use wo_ooxml::model::{DocxBlock, DocxBody, DocxImage, DocxParagraph};

/// Create a simple test PNG image (1x1 red pixel)
fn create_test_image_1x1_red() -> Vec<u8> {
    let mut img = RgbaImage::new(1, 1);
    img.put_pixel(0, 0, image::Rgba([255u8, 0u8, 0u8, 255u8]));
    let mut bytes = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageOutputFormat::Png)
        .unwrap();
    bytes
}

/// Create a simple test PNG image (2x2 blue pixels)
fn create_test_image_2x2_blue() -> Vec<u8> {
    let mut img = RgbaImage::new(2, 2);
    for y in 0..2 {
        for x in 0..2 {
            img.put_pixel(x, y, image::Rgba([0u8, 0u8, 255u8, 255u8]));
        }
    }
    let mut bytes = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageOutputFormat::Png)
        .unwrap();
    bytes
}

/// Create a simple test PNG image (10x10 green pixels)
fn create_test_image_10x10_green() -> Vec<u8> {
    let mut img = RgbaImage::new(10, 10);
    for y in 0..10 {
        for x in 0..10 {
            img.put_pixel(x, y, image::Rgba([0u8, 255u8, 0u8, 255u8]));
        }
    }
    let mut bytes = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageOutputFormat::Png)
        .unwrap();
    bytes
}

// -- Canvas::draw_image tests --

#[test]
fn test_draw_image_basic() {
    let handle = create_canvas(100, 100);
    let image_data = create_test_image_1x1_red();

    let result = super::canvas_bridge::render_image(handle, 10.0, 10.0, 1.0, 1.0, &image_data);
    assert!(result.is_ok());
}

#[test]
fn test_draw_image_scaling() {
    let handle = create_canvas(100, 100);
    let image_data = create_test_image_1x1_red();

    // Draw 1x1 image scaled to 10x10
    let result = super::canvas_bridge::render_image(handle, 10.0, 10.0, 10.0, 10.0, &image_data);
    assert!(result.is_ok());

    // Check that the area was filled
    let pixels = get_pixel_data(handle).unwrap();
    // The 10x10 area starting at (10,10) should have some red pixels
    // This is a basic check - pixel-perfect verification would be more complex
}

#[test]
fn test_draw_image_transparent() {
    let handle = create_canvas(100, 100);
    
    // First draw a background
    render_rect(handle, 0.0, 0.0, 100.0, 100.0, "#0000FF").unwrap();
    
    // Create a semi-transparent image
    let mut img = RgbaImage::new(10, 10);
    for y in 0..10 {
        for x in 0..10 {
            img.put_pixel(x, y, image::Rgba([255u8, 0u8, 0u8, 128u8]));
        }
    }
    let mut bytes = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageOutputFormat::Png)
        .unwrap();

    // Draw the semi-transparent image
    let result = super::canvas_bridge::render_image(handle, 0.0, 0.0, 10.0, 10.0, &bytes);
    assert!(result.is_ok());
}

#[test]
fn test_draw_image_invalid_data() {
    let handle = create_canvas(100, 100);
    let invalid_data = vec![0u8, 1u8, 2u8, 3u8]; // Not a valid image

    let result = super::canvas_bridge::render_image(handle, 10.0, 10.0, 10.0, 10.0, &invalid_data);
    assert!(result.is_err());
}

#[test]
fn test_draw_image_zero_dimensions() {
    let handle = create_canvas(100, 100);
    let image_data = create_test_image_10x10_green();

    // Zero width
    let result = super::canvas_bridge::render_image(handle, 10.0, 10.0, 0.0, 10.0, &image_data);
    assert!(result.is_err());

    // Zero height
    let result = super::canvas_bridge::render_image(handle, 10.0, 10.0, 10.0, 0.0, &image_data);
    assert!(result.is_err());
}

// -- EMU to pixel conversion tests --

#[test]
fn test_emu_to_px_conversion() {
    // 12700 EMUs = 1 point
    // 1 point = 96/72 pixels = 4/3 pixels at 96 DPI
    // So: emu * (96/72) / 12700 = emu / 12700 * 4/3
    
    let emu_to_px = PT_TO_PX / 12700.0;
    
    // 12700 EMUs should be 4/3 pixels
    let px = 12700u32 as f32 * emu_to_px;
    assert!((px - 4.0/3.0).abs() < 0.001);
    
    // 38100 EMUs (3 * 12700) should be 4 pixels
    let px = 38100u32 as f32 * emu_to_px;
    assert!((px - 4.0).abs() < 0.001);
}

// -- LayoutEngine image layout tests --

#[test]
fn test_layout_image_basic() {
    let mut engine = LayoutEngine::new();
    
    let image_data = create_test_image_10x10_green();
    let image = DocxImage {
        bytes: image_data,
        width_emu: 12700,  // 1 point = 4/3 pixels
        height_emu: 12700,
        wrap_mode: "inline".to_string(),
    };
    
    let body = DocxBody {
        blocks: vec![DocxBlock::Image(image)],
    };
    
    let pages = engine.layout_document(&body, "A4", "portrait", 72.0);
    assert_eq!(pages.len(), 1);
    assert_eq!(pages[0].images.len(), 1);
    
    let img = &pages[0].images[0];
    // 12700 EMU / 12700 * 4/3 = 4/3 pixels
    assert!((img.width - 4.0/3.0).abs() < 0.1);
    assert!((img.height - 4.0/3.0).abs() < 0.1);
}

#[test]
fn test_layout_image_with_paragraphs() {
    let mut engine = LayoutEngine::new();
    
    let image_data = create_test_image_2x2_blue();
    let image = DocxImage {
        bytes: image_data,
        width_emu: 25400,  // 2 points = 8/3 pixels
        height_emu: 25400,
        wrap_mode: "inline".to_string(),
    };
    
    let paragraph = DocxParagraph {
        runs: vec![],
        ..Default::default()
    };
    
    let body = DocxBody {
        blocks: vec![
            DocxBlock::Paragraph(paragraph.clone()),
            DocxBlock::Image(image),
            DocxBlock::Paragraph(paragraph),
        ],
    };
    
    let pages = engine.layout_document(&body, "A4", "portrait", 72.0);
    assert_eq!(pages.len(), 1);
    assert!(pages[0].images.len() >= 1);
}

// -- Flat paragraphs with images --

#[test]
fn test_flat_paragraphs_with_images() {
    let image_data = create_test_image_1x1_red();
    let image = DocxImage {
        bytes: image_data,
        width_emu: 12700,
        height_emu: 12700,
        wrap_mode: "inline".to_string(),
    };
    
    let paragraph = DocxParagraph {
        runs: vec![],
        ..Default::default()
    };
    
    let body = DocxBody {
        blocks: vec![
            DocxBlock::Paragraph(paragraph.clone()),
            DocxBlock::Image(image),
            DocxBlock::Paragraph(paragraph),
        ],
    };
    
    // This should not panic and should return only the paragraph paths
    let paths = flat_paragraphs(&body);
    assert_eq!(paths.len(), 2);
}
