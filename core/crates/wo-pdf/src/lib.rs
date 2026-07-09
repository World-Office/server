// wo-pdf -- World-Office PDF format engine
//!
//! Pure Rust implementation of PDF parsing.
//! Reads PDF structure: header, indirect objects, xref table,
//! trailer, page tree, and extracts metadata and text content.

pub mod model;
pub mod parser;
pub mod roundtrip;
pub mod serializer;

pub use model::PdfDocument;
pub use parser::PdfParser;
pub use roundtrip::PdfRoundtrip;
pub use serializer::PdfSerializer;

pub const FORMAT_NAME: &str = "pdf";

/// Check if data starts with a valid PDF header.
/// PDF files start with `%PDF-1.x` where x is 0-7.
pub fn is_pdf_file(data: &[u8]) -> bool {
    if data.len() < 5 {
        return false;
    }
    data.starts_with(b"%PDF-")
}
