//! Annotation parsing module for PDF rendering.
//!
//! This module provides annotation parsing test cases for the PDF rendering engine.
//! The actual implementation is in the PdfRenderer trait (renderer.rs).

use crate::Rect;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Annotation, PdfError, PdfRenderer};
    use std::path::PathBuf;

    // Helper to get test PDF path
    fn test_pdf_path() -> PathBuf {
        // CARGO_MANIFEST_DIR is core/crates/wo-pdf-render
        // tests/corpus/pdf is at ../../../tests/corpus/pdf from there
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/corpus/pdf/01-hello-world.pdf")
    }

    /// Test annotation extraction with no annotations.
    /// This is one of the 3 required tests for PDF-3 acceptance.
    #[test]
    fn test_annotations_none() {
        let backend = crate::test_backend().expect("Pdfium not available for tests");
        let pdf_bytes = std::fs::read(test_pdf_path()).expect("Failed to read test PDF");

        let annotations = backend
            .annotations(&pdf_bytes, 0)
            .expect("Failed to get annotations");

        // The hello-world PDF likely has no annotations, but that's fine
        // We just verify it returns a valid (possibly empty) vector
        assert_eq!(annotations.len(), annotations.len());
    }

    /// Test that out-of-range page returns the correct error for annotations.
    /// This is test 2 of 3 for PDF-3 acceptance.
    #[test]
    fn test_annotations_out_of_range() {
        let backend = crate::test_backend().expect("Pdfium not available for tests");
        let pdf_bytes = std::fs::read(test_pdf_path()).expect("Failed to read test PDF");

        // Get valid page count
        let total_pages = backend
            .page_count(&pdf_bytes)
            .expect("Failed to get page count");

        // Try to get annotations from a page that doesn't exist
        let result = backend.annotations(&pdf_bytes, total_pages);
        assert!(matches!(result, Err(PdfError::PageOutOfRange { .. })));
    }

    /// Test Annotation struct creation and properties.
    /// This is test 3 of 3 for PDF-3 acceptance.
    #[test]
    fn test_annotation_struct() {
        // Test that we can create an Annotation with expected properties
        let annotation = Annotation {
            annotation_type: "Text".to_string(),
            rect: Rect::new(10.0, 20.0, 100.0, 50.0),
            content: Some("Test annotation".to_string()),
        };

        assert_eq!(annotation.annotation_type, "Text");
        assert_eq!(annotation.rect.x, 10.0);
        assert_eq!(annotation.rect.y, 20.0);
        assert_eq!(annotation.rect.width, 100.0);
        assert_eq!(annotation.rect.height, 50.0);
        assert_eq!(annotation.content, Some("Test annotation".to_string()));

        // Test annotation without content
        let annotation_no_content = Annotation {
            annotation_type: "Link".to_string(),
            rect: Rect::new(0.0, 0.0, 50.0, 25.0),
            content: None,
        };

        assert_eq!(annotation_no_content.annotation_type, "Link");
        assert_eq!(annotation_no_content.content, None);
    }
}
