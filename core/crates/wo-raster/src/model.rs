//! Raster image data model.
//!
//! Core types for pixel data, image metadata, and image containers.

use serde::{Deserialize, Serialize};

/// Supported raster image formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ImageFormat {
    Png,
    Jpeg,
    Tiff,
    Gif,
    Bmp,
    Unknown,
}

impl ImageFormat {
    /// Detect format from file extension (case-insensitive).
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_ascii_lowercase().as_str() {
            "png" => ImageFormat::Png,
            "jpg" | "jpeg" => ImageFormat::Jpeg,
            "tif" | "tiff" => ImageFormat::Tiff,
            "gif" => ImageFormat::Gif,
            "bmp" => ImageFormat::Bmp,
            _ => ImageFormat::Unknown,
        }
    }

    /// Detect format from magic bytes.
    pub fn from_magic(data: &[u8]) -> Self {
        if data.len() < 4 {
            return ImageFormat::Unknown;
        }
        // Check 6-byte signatures first (GIF)
        if data.len() >= 6 {
            match &data[..6] {
                b"GIF87a" | b"GIF89a" => return ImageFormat::Gif,
                _ => {}
            }
        }
        if data.len() < 8 {
            return ImageFormat::Unknown;
        }
        match &data[..8] {
            [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] => ImageFormat::Png,
            [0xFF, 0xD8, 0xFF, ..] => ImageFormat::Jpeg,
            [b'I', b'I', 0x2A, ..] | [b'M', b'M', 0x00, 0x2A, ..] => ImageFormat::Tiff,
            [b'B', b'M', ..] => ImageFormat::Bmp,
            _ => ImageFormat::Unknown,
        }
    }

    /// Get the standard file extension.
    pub fn extension(&self) -> &'static str {
        match self {
            ImageFormat::Png => "png",
            ImageFormat::Jpeg => "jpg",
            ImageFormat::Tiff => "tiff",
            ImageFormat::Gif => "gif",
            ImageFormat::Bmp => "bmp",
            ImageFormat::Unknown => "bin",
        }
    }

    /// Get the MIME type.
    pub fn mime_type(&self) -> &'static str {
        match self {
            ImageFormat::Png => "image/png",
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::Tiff => "image/tiff",
            ImageFormat::Gif => "image/gif",
            ImageFormat::Bmp => "image/bmp",
            ImageFormat::Unknown => "application/octet-stream",
        }
    }
}

impl std::fmt::Display for ImageFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.extension())
    }
}

/// A single RGBA pixel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pixel {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Pixel {
    pub const TRANSPARENT: Self = Self {
        r: 0,
        g: 0,
        b: 0,
        a: 0,
    };
    pub const WHITE: Self = Self {
        r: 255,
        g: 255,
        b: 255,
        a: 255,
    };
    pub const BLACK: Self = Self {
        r: 0,
        g: 0,
        b: 0,
        a: 255,
    };
    /// Create from RGBA components.
    pub const fn new(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self { r, g, b, a }
    }

    /// Create from RGB (alpha = 255).
    pub const fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b, a: 255 }
    }

    /// Get the alpha-premultiplied color as u32 (0xAARRGGBB).
    pub fn to_u32(&self) -> u32 {
        ((self.a as u32) << 24) | ((self.r as u32) << 16) | ((self.g as u32) << 8) | (self.b as u32)
    }

    /// Get perceived luminance (0.0 - 1.0).
    pub fn luminance(&self) -> f32 {
        (self.r as f32 * 0.299 + self.g as f32 * 0.587 + self.b as f32 * 0.114) / 255.0
    }

    /// Blend this pixel over another (alpha compositing).
    pub fn blend_over(&self, background: &Pixel) -> Pixel {
        if self.a == 0 {
            return *background;
        }
        if self.a == 255 {
            return *self;
        }
        let alpha = self.a as f32 / 255.0;
        let inv_alpha = 1.0 - alpha;
        Pixel {
            r: (self.r as f32 * alpha + background.r as f32 * inv_alpha) as u8,
            g: (self.g as f32 * alpha + background.g as f32 * inv_alpha) as u8,
            b: (self.b as f32 * alpha + background.b as f32 * inv_alpha) as u8,
            a: 255,
        }
    }
}

impl Default for Pixel {
    fn default() -> Self {
        Self::TRANSPARENT
    }
}

/// Image metadata (without pixel data).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
    pub bit_depth: u8,
    pub has_alpha: bool,
    pub color_space: ColorSpace,
}

/// Color space type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColorSpace {
    /// Grayscale (1 channel).
    Grayscale,
    /// RGB (3 channels).
    Rgb,
    /// RGBA (4 channels).
    Rgba,
    /// CMYK (4 channels).
    Cmyk,
    /// Indexed (palette-based).
    Indexed,
    /// Unknown.
    Unknown,
}

/// A raster image in memory (RGBA8).
#[derive(Debug, Clone)]
pub struct RasterImage {
    /// Image width in pixels.
    pub width: u32,
    /// Image height in pixels.
    pub height: u32,
    /// Pixel data in row-major order, RGBA8.
    pub pixels: Vec<Pixel>,
}

impl RasterImage {
    /// Create a new blank image filled with the given pixel.
    pub fn new(width: u32, height: u32, fill: Pixel) -> Self {
        let pixel_count = (width as usize) * (height as usize);
        Self {
            width,
            height,
            pixels: vec![fill; pixel_count],
        }
    }

    /// Create a blank transparent image.
    pub fn blank(width: u32, height: u32) -> Self {
        Self::new(width, height, Pixel::TRANSPARENT)
    }

    /// Get pixel at (x, y). Returns None if out of bounds.
    pub fn get_pixel(&self, x: u32, y: u32) -> Option<Pixel> {
        if x >= self.width || y >= self.height {
            return None;
        }
        let idx = (y as usize) * (self.width as usize) + (x as usize);
        Some(self.pixels[idx])
    }

    /// Set pixel at (x, y). Silently ignores out-of-bounds.
    pub fn set_pixel(&mut self, x: u32, y: u32, pixel: Pixel) {
        if x >= self.width || y >= self.height {
            return;
        }
        let idx = (y as usize) * (self.width as usize) + (x as usize);
        self.pixels[idx] = pixel;
    }

    /// Get raw RGBA bytes.
    pub fn as_rgba_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.pixels.len() * 4);
        for p in &self.pixels {
            bytes.extend_from_slice(&[p.r, p.g, p.b, p.a]);
        }
        bytes
    }

    /// Create from raw RGBA bytes.
    pub fn from_rgba_bytes(width: u32, height: u32, data: &[u8]) -> Self {
        let pixel_count = (width as usize) * (height as usize);
        let mut pixels = Vec::with_capacity(pixel_count);
        for chunk in data.as_chunks::<4>().0.iter() {
            pixels.push(Pixel::new(chunk[0], chunk[1], chunk[2], chunk[3]));
        }
        // Pad with transparent if data is short
        while pixels.len() < pixel_count {
            pixels.push(Pixel::TRANSPARENT);
        }
        Self {
            width,
            height,
            pixels,
        }
    }

    /// Total number of pixels.
    pub fn pixel_count(&self) -> usize {
        self.pixels.len()
    }

    /// Check if the image is empty (zero dimensions).
    pub fn is_empty(&self) -> bool {
        self.width == 0 || self.height == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_format_from_extension() {
        assert_eq!(ImageFormat::from_extension("png"), ImageFormat::Png);
        assert_eq!(ImageFormat::from_extension("PNG"), ImageFormat::Png);
        assert_eq!(ImageFormat::from_extension("jpg"), ImageFormat::Jpeg);
        assert_eq!(ImageFormat::from_extension("jpeg"), ImageFormat::Jpeg);
        assert_eq!(ImageFormat::from_extension("tif"), ImageFormat::Tiff);
        assert_eq!(ImageFormat::from_extension("tiff"), ImageFormat::Tiff);
        assert_eq!(ImageFormat::from_extension("gif"), ImageFormat::Gif);
        assert_eq!(ImageFormat::from_extension("bmp"), ImageFormat::Bmp);
        assert_eq!(ImageFormat::from_extension("xyz"), ImageFormat::Unknown);
    }

    #[test]
    fn test_image_format_from_magic() {
        let png_magic: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(ImageFormat::from_magic(&png_magic), ImageFormat::Png);

        let jpeg_magic: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x00, 0x00, 0x00];
        assert_eq!(ImageFormat::from_magic(&jpeg_magic), ImageFormat::Jpeg);

        let gif_magic = b"GIF89a\x00\x00";
        assert_eq!(ImageFormat::from_magic(gif_magic), ImageFormat::Gif);

        assert_eq!(ImageFormat::from_magic(b"short"), ImageFormat::Unknown);
        assert_eq!(ImageFormat::from_magic(b""), ImageFormat::Unknown);
    }

    #[test]
    fn test_pixel_constants() {
        assert_eq!(Pixel::WHITE, Pixel::rgb(255, 255, 255));
        assert_eq!(Pixel::BLACK, Pixel::rgb(0, 0, 0));
        assert_eq!(Pixel::TRANSPARENT, Pixel::new(0, 0, 0, 0));
    }

    #[test]
    fn test_pixel_luminance() {
        assert!((Pixel::WHITE.luminance() - 1.0).abs() < 0.001);
        assert!((Pixel::BLACK.luminance() - 0.0).abs() < 0.001);
        assert!((Pixel::rgb(128, 128, 128).luminance() - 0.502).abs() < 0.01);
    }

    #[test]
    fn test_pixel_blend() {
        let bg = Pixel::rgb(100, 100, 100);
        let fg = Pixel::new(200, 0, 0, 128); // 50% red
        let blended = fg.blend_over(&bg);
        assert!(blended.r > 100);
        assert!(blended.r < 200);
        assert_eq!(blended.a, 255);
    }

    #[test]
    fn test_raster_image_new() {
        let img = RasterImage::new(10, 5, Pixel::WHITE);
        assert_eq!(img.width, 10);
        assert_eq!(img.height, 5);
        assert_eq!(img.pixel_count(), 50);
        assert_eq!(img.get_pixel(0, 0), Some(Pixel::WHITE));
    }

    #[test]
    fn test_raster_image_set_get() {
        let mut img = RasterImage::blank(10, 10);
        img.set_pixel(3, 4, Pixel::rgb(255, 0, 0));
        assert_eq!(img.get_pixel(3, 4), Some(Pixel::rgb(255, 0, 0)));
        assert_eq!(img.get_pixel(0, 0), Some(Pixel::TRANSPARENT));
    }

    #[test]
    fn test_raster_image_out_of_bounds() {
        let img = RasterImage::blank(5, 5);
        assert_eq!(img.get_pixel(5, 0), None);
        assert_eq!(img.get_pixel(0, 5), None);
    }

    #[test]
    fn test_raster_image_rgba_roundtrip() {
        let img = RasterImage::new(2, 2, Pixel::rgb(10, 20, 30));
        let bytes = img.as_rgba_bytes();
        assert_eq!(bytes.len(), 16); // 2*2*4
        assert_eq!(bytes[0..4], [10, 20, 30, 255]);

        let img2 = RasterImage::from_rgba_bytes(2, 2, &bytes);
        assert_eq!(img2.get_pixel(0, 0), Some(Pixel::rgb(10, 20, 30)));
    }

    #[test]
    fn test_pixel_to_u32() {
        let p = Pixel::new(0x11, 0x22, 0x33, 0xFF);
        assert_eq!(p.to_u32(), 0xFF112233);
    }

    #[test]
    fn test_image_format_display() {
        assert_eq!(ImageFormat::Png.to_string(), "png");
        assert_eq!(ImageFormat::Jpeg.to_string(), "jpg");
    }

    #[test]
    fn test_image_format_mime() {
        assert_eq!(ImageFormat::Png.mime_type(), "image/png");
        assert_eq!(ImageFormat::Jpeg.mime_type(), "image/jpeg");
    }

    #[test]
    fn test_is_empty() {
        assert!(RasterImage::blank(0, 10).is_empty());
        assert!(RasterImage::blank(10, 0).is_empty());
        assert!(!RasterImage::blank(1, 1).is_empty());
    }
}
