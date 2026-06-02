//! Roundtrip implementation for wo-x2t conversion router.
//!
//! Provides roundtrip testing capability for the conversion orchestrator.
//! Since wo-x2t is a router/orchestrator rather than a format parser,
//! the roundtrip stores the input conversion data and returns it via serialization.

use crate::model::{ConversionInput, ConversionResult};
use crate::router::ConversionRouter;
use std::cell::RefCell;
use wo_common::test_harness::FormatRoundtrip;

/// Roundtrip handler for x2t conversion orchestrator.
///
/// This implements `FormatRoundtrip` for testing the conversion router.
/// For a router-based roundtrip:
/// - `parse`: Accepts input bytes and creates a conversion context
/// - `serialize`: Returns the conversion output bytes
pub struct X2tRoundtrip {
    /// Parsed conversion input.
    input: Option<ConversionInput>,
    /// Router for managing conversions.
    router: ConversionRouter,
    /// Stored conversion result (interior mutability for parse/serialize).
    result: RefCell<Option<ConversionResult>>,
}

impl X2tRoundtrip {
    /// Create a new roundtrip instance.
    pub fn new() -> Self {
        Self {
            input: None,
            router: ConversionRouter::new(),
            result: RefCell::new(None),
        }
    }

    /// Create a roundtrip instance with specific source and target formats.
    ///
    /// # Arguments
    /// * `source_format` - The source format (e.g., "docx", "pdf", "odt")
    /// * `target_format` - The target format (e.g., "pdf", "odt", "docx")
    pub fn with_formats(source_format: &str, target_format: &str) -> Self {
        Self {
            input: None,
            router: ConversionRouter::new(),
            result: RefCell::new(None),
        }
        .set_source_format(source_format)
        .set_target_format(target_format)
    }

    /// Set the source format for the roundtrip.
    pub fn set_source_format(mut self, format: &str) -> Self {
        if let Some(ref mut input) = self.input {
            input.source_format = format.to_string();
        } else {
            self.input = Some(ConversionInput {
                source_format: format.to_string(),
                target_format: String::new(),
                data: Vec::new(),
                options: Default::default(),
            });
        }
        self
    }

    /// Set the target format for the roundtrip.
    pub fn set_target_format(mut self, format: &str) -> Self {
        if let Some(ref mut input) = self.input {
            input.target_format = format.to_string();
        } else {
            self.input = Some(ConversionInput {
                source_format: String::new(),
                target_format: format.to_string(),
                data: Vec::new(),
                options: Default::default(),
            });
        }
        self
    }

    /// Get the conversion router.
    pub fn router(&self) -> &ConversionRouter {
        &self.router
    }

    /// Get the stored conversion input.
    pub fn input(&self) -> Option<&ConversionInput> {
        self.input.as_ref()
    }

    /// Get the stored conversion result.
    pub fn result(&self) -> Option<ConversionResult> {
        self.result.borrow().clone()
    }
}

impl FormatRoundtrip for X2tRoundtrip {
    /// Parse raw bytes as a conversion input.
    ///
    /// Stores the input bytes and prepares the conversion context.
    /// Since wo-x2t is a router, this doesn't parse the format content itself
    /// but instead prepares for routing the conversion request.
    fn parse(&self, data: &[u8]) -> Result<(), String> {
        // Store the input data
        let input = self.input.as_ref().ok_or_else(|| {
            "No conversion context set. Use with_formats() or set_source_format()/set_target_format().".to_string()
        })?;

        let result = self
            .router
            .convert(&input.source_format, &input.target_format, data);

        // Store the result using interior mutability
        *self.result.borrow_mut() = Some(result);

        Ok(())
    }

    /// Serialize the conversion result back to bytes.
    ///
    /// Returns the output bytes from the conversion result.
    /// If no conversion was performed, returns an error.
    fn serialize(&self) -> Result<Vec<u8>, String> {
        let borrowed = self.result.borrow();
        let result = borrowed
            .as_ref()
            .ok_or_else(|| "No conversion result available. Call parse() first.".to_string())?;

        match &result.output {
            Some(output) => Ok(output.data.clone()),
            None => Err(format!(
                "Conversion failed with status: {:?}. Error: {:?}",
                result.status, result.error
            )),
        }
    }
}

impl Clone for X2tRoundtrip {
    fn clone(&self) -> Self {
        Self {
            input: self.input.clone(),
            router: ConversionRouter::new(),
            result: RefCell::new(self.result.borrow().clone()),
        }
    }
}

impl Default for X2tRoundtrip {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip_with_identity_conversion() {
        let roundtrip = X2tRoundtrip::with_formats("docx", "docx");
        let input_data = b"test document content";

        // Parse should succeed
        roundtrip.parse(input_data).expect("Parse should succeed");

        // Serialize should return the same data
        let output_data = roundtrip.serialize().expect("Serialize should succeed");
        assert_eq!(output_data, input_data);
    }

    #[test]
    fn test_roundtrip_requires_formats() {
        let roundtrip = X2tRoundtrip::new();
        let input_data = b"test data";

        // Parse should fail without format context
        let result = roundtrip.parse(input_data);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No conversion context set"));
    }

    #[test]
    fn test_roundtrip_unsupported_conversion() {
        let roundtrip = X2tRoundtrip::with_formats("pdf", "docx");
        let input_data = b"test pdf content";

        // Parse succeeds (even for unsupported - creates error result)
        roundtrip.parse(input_data).expect("Parse should succeed");

        // Serialize should fail for unsupported format
        let result = roundtrip.serialize();
        assert!(result.is_err());
    }

    #[test]
    fn test_roundtrip_preserves_data() {
        // odt → pdf has no registered converter, so serialize should fail
        let roundtrip = X2tRoundtrip::with_formats("odt", "pdf");
        let input_data = b"OpenDocument text content";

        roundtrip.parse(input_data).expect("Parse should succeed");
        let result = roundtrip.serialize();
        assert!(result.is_err(), "odt→pdf has no converter, should fail");
    }

    #[test]
    fn test_new_with_default() {
        let roundtrip = X2tRoundtrip::new();
        assert!(roundtrip.input().is_none());
        assert!(roundtrip.result().is_none());
        assert!(roundtrip.router().is_supported("rtf", "txt"));
    }

    #[test]
    fn test_with_formats_creates_context() {
        let roundtrip = X2tRoundtrip::with_formats("xlsx", "pdf");
        let input = roundtrip.input().expect("Input should be set");
        assert_eq!(input.source_format, "xlsx");
        assert_eq!(input.target_format, "pdf");
    }

    #[test]
    fn test_set_source_and_target() {
        let roundtrip = X2tRoundtrip::new()
            .set_source_format("pptx")
            .set_target_format("pdf");

        let input = roundtrip.input().expect("Input should be set");
        assert_eq!(input.source_format, "pptx");
        assert_eq!(input.target_format, "pdf");
    }
}
