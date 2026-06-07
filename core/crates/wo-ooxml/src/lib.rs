// wo-ooxml -- World-Office OOXML format engine
//!
//! Pure Rust implementation of Office Open XML format parsing.
//! Supports DOCX, XLSX, PPTX (Office 2007+ formats).
//! OOXML is a ZIP-based XML format defined by ECMA-376/ISO 29500.

pub mod detector;
pub mod model;
pub mod parser;
pub mod roundtrip;
pub mod serializer;

pub use model::{
    Bounds, ColorScheme, FontScheme, OoxmlDocument, OoxmlFormat, PictureShape, PlaceholderShape,
PptxPresentation, Slide, SlideLayout, SlideMaster, SlideShape, SlideSize, TableCell, TableColumn,
TableRow, TableShape, TextBody, TextBoxShape, Theme, ThemeColor, ThemeFont, ThemePreset,
ConnectorShape, ConnectorShapeType,
};
pub use model::builtin_theme_presets;
pub use parser::OoxmlParser;
pub use roundtrip::OoxmlRoundtrip;
pub use serializer::OoxmlSerializer;

pub const FORMAT_NAME: &str = "ooxml";

/// Check if data is an OOXML file (ZIP with [Content_Types].xml).
pub fn is_ooxml_file(data: &[u8]) -> bool {
    if data.len() < 4 || data[0] != 0x50 || data[1] != 0x4B {
        return false;
    }
    let cursor = std::io::Cursor::new(data);
    if let Ok(mut archive) = zip::ZipArchive::new(cursor) {
        if archive.by_name("[Content_Types].xml").is_ok() {
            return true;
        }
    }
    false
}
