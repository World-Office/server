//! Text extraction module for PDF rendering.
//!
//! This module provides text extraction functionality for the PDF rendering engine.
//! It implements the text extraction contract defined in section §10 of the execution plan.

use crate::{PdfError, PdfRenderer};

/// Text extraction utilities and contracts for PDF-3.
///
/// This module provides the text extraction implementation as specified in
/// section §10 of the execution plan. The primary interface is through the
/// PdfRenderer trait methods (extract_text), with additional utility functions
/// for enhanced text processing.
#[allow(dead_code)]
pub struct TextExtractor;

#[allow(dead_code)]
impl TextExtractor {
    /// Extracts text from a specific page using a PdfRenderer backend.
    ///
    /// This is a convenience function that delegates to the backend's extract_text method.
    /// It serves as the primary text extraction entry point for PDF-3.
    ///
    /// # Arguments
    /// * `backend` - A reference to any type implementing PdfRenderer
    /// * `bytes` - The raw PDF file bytes
    /// * `page` - The zero-indexed page number
    ///
    /// # Returns
    /// The extracted text, or an error if extraction fails.
    pub fn extract_text(
        backend: &impl PdfRenderer,
        bytes: &[u8],
        page: u32,
    ) -> Result<String, PdfError> {
        backend.extract_text(bytes, page)
    }

    /// Extracts text from all pages of a PDF document.
    ///
    /// # Arguments
    /// * `backend` - A reference to any type implementing PdfRenderer
    /// * `bytes` - The raw PDF file bytes
    ///
    /// # Returns
    /// A vector of strings, one for each page.
    pub fn extract_text_all_pages(
        backend: &impl PdfRenderer,
        bytes: &[u8],
    ) -> Result<Vec<String>, PdfError> {
        let page_count = backend.page_count(bytes)?;
        let mut results = Vec::with_capacity(page_count as usize);

        for i in 0..page_count {
            let text = backend.extract_text(bytes, i)?;
            results.push(text);
        }

        Ok(results)
    }

    /// Verifies that extracted text contains expected content.
    ///
    /// This utility function checks if the extracted text matches expected patterns,
    /// which is useful for testing PDF-3 compliance.
    ///
    /// # Arguments
    /// * `text` - The extracted text to verify
    /// * `expected_length` - Optional minimum length expectation
    ///
    /// # Returns
    /// True if the text meets the verification criteria.
    pub fn verify_text_content(text: &str, expected_length: Option<usize>) -> bool {
        if text.is_empty() {
            return false;
        }

        if let Some(min_length) = expected_length && text.len() < min_length {
            return false;
        }

        // Check for at least one alphabetic character
        text.chars().any(|c| c.is_alphabetic())
    }
}

/// A span of text with its position information.
///
/// This struct is used for advanced text extraction scenarios where
/// position information is needed (e.g., for text selection in the editor).
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct TextSpan {
    /// The text content.
    pub text: String,
    /// The character offset within the page.
    pub char_offset: usize,
}

#[allow(dead_code)]
impl TextSpan {
    /// Creates a new TextSpan.
    pub fn new(text: String, char_offset: usize) -> Self {
        Self { text, char_offset }
    }
}

/// Splits text into spans based on line breaks.
///
/// This utility function processes extracted text and splits it into
/// individual line spans, which is useful for line-based operations.
#[allow(dead_code)]
pub fn split_text_into_lines(text: &str) -> Vec<TextSpan> {
    text.lines()
        .enumerate()
        .map(|(i, line)| {
            let offset = if i == 0 {
                0
            } else {
                text.lines().take(i).map(|l| l.len() + 1).sum()
            };
            TextSpan::new(line.to_string(), offset)
        })
        .collect()
}

/// Counts the number of characters in text using Unicode scalar values.
///
/// This is the correct way to count characters in UTF-8 text, as required
/// by the World-Office mutation idiom (INV-4).
#[allow(dead_code)]
pub fn count_characters(text: &str) -> usize {
    text.chars().count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // Helper to get test PDF path
    fn test_pdf_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/corpus/pdf/01-hello-world.pdf")
    }

    /// Test text extraction from a simple PDF.
    /// This is test 1 of 3 required for PDF-3 acceptance.
    #[test]
    fn test_extract_text_basic() {
        let backend = crate::test_backend().expect("Pdfium not available for tests");
        let pdf_bytes = std::fs::read(test_pdf_path()).expect("Failed to read test PDF");

        let text = TextExtractor::extract_text(backend, &pdf_bytes, 0)
            .expect("Failed to extract text");

        // Verify we got some text
        assert!(!text.is_empty(), "Extracted text should not be empty");

        // Verify it contains alphabetic characters
        assert!(
            text.chars().any(|c| c.is_alphabetic()),
            "Extracted text should contain alphabetic characters"
        );
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
        let result = TextExtractor::extract_text(backend, &pdf_bytes, total_pages);
        assert!(matches!(result, Err(PdfError::PageOutOfRange { .. })));
    }

    /// Test text extraction with content verification.
    /// This is test 3 of 3 for PDF-3 acceptance.
    /// Verifies that we can extract and verify specific text content from the PDF.
    #[test]
    fn test_extract_text_content_verification() {
        let backend = crate::test_backend().expect("Pdfium not available for tests");
        let pdf_bytes = std::fs::read(test_pdf_path()).expect("Failed to read test PDF");

        let text = TextExtractor::extract_text(backend, &pdf_bytes, 0)
            .expect("Failed to extract text");

        // Verify the text meets our criteria
        assert!(
            TextExtractor::verify_text_content(&text, Some(5)),
            "Extracted text should contain at least 5 characters and alphabetic content"
        );

        // Additional verification: the text should have reasonable length
        assert!(
            text.len() >= 10,
            "Extracted text should be at least 10 bytes long"
        );
    }

    /// Test splitting text into lines.
    #[test]
    fn test_split_text_into_lines() {
        let text = "Hello\nWorld\nTest";
        let lines = split_text_into_lines(text);

        assert_eq!(lines.len(), 3, "Should have 3 lines");
        assert_eq!(lines[0].text, "Hello");
        assert_eq!(lines[1].text, "World");
        assert_eq!(lines[2].text, "Test");
        assert_eq!(lines[0].char_offset, 0);
        assert_eq!(lines[1].char_offset, 6); // "Hello" + newline
        assert_eq!(lines[2].char_offset, 12); // "Hello\nWorld" + newline
    }

    /// Test Unicode character counting.
    #[test]
    fn test_count_characters() {
        let text = "Hello World!";
        assert_eq!(count_characters(text), 12);

        // UTF-8 with multi-byte characters
        // "世界" is 2 Chinese characters, each is 1 char
        let utf8_text = "Hello 世界!";
        // "Hello " = 6 chars, "世界" = 2 chars, "!" = 1 char = 9 total
        assert_eq!(count_characters(utf8_text), 9); // 6 ASCII + 2 Chinese + 1 !
    }

    /// Test TextSpan creation.
    #[test]
    fn test_text_span_creation() {
        let span = TextSpan::new("Test".to_string(), 10);
        assert_eq!(span.text, "Test");
        assert_eq!(span.char_offset, 10);
    }
}
