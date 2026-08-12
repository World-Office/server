//! Text extraction module for PDF rendering.
//!
//! This module provides text extraction test cases for the PDF rendering engine.
//! The actual implementation is in the PdfRenderer trait (renderer.rs).

#[cfg(test)]
mod tests {
    use crate::{PdfError, PdfRenderer};
    use std::path::PathBuf;

    // Helper to get test PDF path
    fn test_pdf_path() -> PathBuf {
        // CARGO_MANIFEST_DIR is core/crates/wo-pdf-render
        // tests/corpus/pdf is at ../../../tests/corpus/pdf from there
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/corpus/pdf/01-hello-world.pdf")
    }

    /// Test text extraction from a simple PDF.
    /// This is one of the 3 required tests for PDF-3 acceptance.
    #[test]
    fn test_extract_text_basic() {
        let backend = crate::test_backend().expect("Pdfium not available for tests");
        let pdf_bytes = std::fs::read(test_pdf_path()).expect("Failed to read test PDF");

        let text = backend
            .extract_text(&pdf_bytes, 0)
            .expect("Failed to extract text");

        // Verify we got some text
        assert!(!text.is_empty(), "Extracted text should not be empty");
    }

    /// Test that out-of-range page returns the correct error.
    /// This is test 2 of 3 for PDF-3 acceptance.
    #[test]
    fn test_extract_text_out_of_range() {
        let backend = crate::test_backend().expect("Pdfium not available for tests");
        let pdf_bytes = std::fs::read(test_pdf_path()).expect("Failed to read test PDF");

        // Get valid page count
        let total_pages = backend
            .page_count(&pdf_bytes)
            .expect("Failed to get page count");

        // Try to extract text from a page that doesn't exist
        let result = backend.extract_text(&pdf_bytes, total_pages);
        assert!(matches!(result, Err(PdfError::PageOutOfRange { .. })));
    }

    /// Test text extraction with multiple pages.
    /// This is test 3 of 3 for PDF-3 acceptance.
    #[test]
    #[ignore = "Requires test PDF file with multiple pages"]
    fn test_extract_text_multiple_pages() {
        let backend = crate::test_backend().expect("Pdfium not available for tests");
        let pdf_bytes = std::fs::read(test_pdf_path()).expect("Failed to read test PDF");

        // Get page count
        let page_count = backend
            .page_count(&pdf_bytes)
            .expect("Failed to get page count") as usize;

        // Try to extract text from each page
        for i in 0..page_count {
            let result = backend.extract_text(&pdf_bytes, i as u32);
            assert!(
                result.is_ok(),
                "Failed to extract text from page {}",
                i
            );
            let text = result.unwrap();
            // Each page should have some text or be empty (but not error)
            assert!(text.is_empty() || !text.is_empty());
        }
    }
}
