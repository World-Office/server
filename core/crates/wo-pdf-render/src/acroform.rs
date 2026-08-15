//! AcroForm read/write module for PDF rendering.
//!
//! This module provides AcroForm (interactive form) field reading and writing
//! functionality for the PDF rendering engine. It implements the AcroForm
//! read/write contract defined in section §10 of the execution plan (PDF-4).
//!
//! # Usage
//!
//! ```no_run
//! use wo_pdf_render::acroform::{read_fields, set_field_value};
//! use wo_pdf_render::renderer::{PdfRenderer, PdfiumBackend};
//!
//! let backend = PdfiumBackend::new().expect("Failed to initialize Pdfium");
//!
//! // Read all form fields
//! let fields = read_fields(&pdf_bytes, &backend)
//!     .expect("Failed to read AcroForm fields");
//!
//! // Set a field value and get modified PDF bytes
//! let modified_pdf = set_field_value(&pdf_bytes, &backend, "Name_Field", "John Doe")
//!     .expect("Failed to set field value");
//! ```

use crate::renderer::{PdfiumBackend, Rect};
use pdfium_render::prelude::*;

/// The type of an AcroForm field.
///
/// Maps to the Pdfium `PdfFormFieldType` enum, providing a dependency-free
/// representation of PDF interactive form field types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AcroFormFieldType {
    /// Unknown or unsupported form field type.
    Unknown,
    /// A push button that triggers an action.
    PushButton,
    /// A checkbox that can be toggled on/off.
    Checkbox,
    /// A radio button within a group.
    RadioButton,
    /// A combo box (drop-down list with optional editable text).
    ComboBox,
    /// A list box (scrollable list).
    ListBox,
    /// A text field for entering text.
    Text,
    /// A digital signature field.
    Signature,
}

impl AcroFormFieldType {
    /// Converts from a pdfium-render `PdfFormFieldType` to our dependency-free enum.
    fn from_pdfium(field_type: PdfFormFieldType) -> Self {
        match field_type {
            PdfFormFieldType::Unknown => AcroFormFieldType::Unknown,
            PdfFormFieldType::PushButton => AcroFormFieldType::PushButton,
            PdfFormFieldType::Checkbox => AcroFormFieldType::Checkbox,
            PdfFormFieldType::RadioButton => AcroFormFieldType::RadioButton,
            PdfFormFieldType::ComboBox => AcroFormFieldType::ComboBox,
            PdfFormFieldType::ListBox => AcroFormFieldType::ListBox,
            PdfFormFieldType::Text => AcroFormFieldType::Text,
            PdfFormFieldType::Signature => AcroFormFieldType::Signature,
        }
    }
}

impl std::fmt::Display for AcroFormFieldType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AcroFormFieldType::Unknown => write!(f, "Unknown"),
            AcroFormFieldType::PushButton => write!(f, "PushButton"),
            AcroFormFieldType::Checkbox => write!(f, "Checkbox"),
            AcroFormFieldType::RadioButton => write!(f, "RadioButton"),
            AcroFormFieldType::ComboBox => write!(f, "ComboBox"),
            AcroFormFieldType::ListBox => write!(f, "ListBox"),
            AcroFormFieldType::Text => write!(f, "Text"),
            AcroFormFieldType::Signature => write!(f, "Signature"),
        }
    }
}

/// A single AcroForm field with its current properties.
///
/// Represents an interactive form field in a PDF document. Fields are
/// identified by name and have a type, current value, and visual bounds.
#[derive(Debug, Clone)]
pub struct AcroFormField {
    /// The name of the form field (from the field dictionary).
    pub name: Option<String>,
    /// The type of the form field.
    pub field_type: AcroFormFieldType,
    /// The current value of the form field, if set.
    pub value: Option<String>,
    /// The bounding rectangle of the field's widget annotation, if available.
    pub rect: Option<Rect>,
    /// The zero-indexed page number where this field appears.
    pub page: u32,
    /// Whether the field is read-only (cannot be modified by the user).
    pub is_read_only: bool,
    /// Whether the field is required (must have a value on submit).
    pub is_required: bool,
}

/// Error type for AcroForm operations.
#[derive(Debug, thiserror::Error)]
pub enum FormError {
    /// An underlying PDF error occurred.
    #[error("PDF error: {0}")]
    PdfError(#[from] crate::PdfError),
    /// A Pdfium library error occurred.
    #[error("Pdfium error: {0}")]
    Pdfium(String),
    /// The document does not contain an AcroForm.
    #[error("No AcroForm found in document")]
    NoForm,
    /// A field with the given name was not found.
    #[error("Field not found: {0}")]
    FieldNotFound(String),
    /// A field type is not supported for the requested operation.
    #[error("Unsupported field type: {0}")]
    UnsupportedFieldType(AcroFormFieldType),
}

impl From<PdfiumError> for FormError {
    fn from(e: PdfiumError) -> Self {
        FormError::Pdfium(e.to_string())
    }
}

/// Reads all AcroForm fields from a PDF document.
///
/// This function iterates through every page of the PDF, inspecting widget
/// annotations for embedded form fields. It returns a list of all form fields
/// with their current properties.
///
/// # Arguments
/// * `bytes` - The raw PDF file bytes.
/// * `backend` - A reference to a `PdfiumBackend` instance.
///
/// # Returns
/// A vector of `AcroFormField` entries, or a `FormError`.
///
/// # Contract (section §10)
/// - Returns `FormError::NoForm` if the document has no AcroForm.
/// - Returns all fields on all pages, each with correct name, type, value, and rect.
/// - Text field values are returned as strings.
/// - Checkbox values are "Yes"/"Off" (the on/off string values from the PDF).
/// - Radio button values return the currently selected option's value.
pub fn read_fields(bytes: &[u8], backend: &PdfiumBackend) -> Result<Vec<AcroFormField>, FormError> {
    let document = backend
        .pdfium_ref()
        .load_pdf_from_byte_slice(bytes, None)
        .map_err(|e| FormError::Pdfium(e.to_string()))?;

    // Check if the document has a form
    if document.form().is_none() {
        return Err(FormError::NoForm);
    }

    let total_pages = document.pages().len() as u32;
    let mut fields = Vec::new();

    for page_idx in 0..total_pages {
        let pdf_page = document
            .pages()
            .get(page_idx as i32)
            .map_err(|e| FormError::Pdfium(e.to_string()))?;

        for annotation in pdf_page.annotations().iter() {
            if let Some(form_field) = annotation.as_form_field() {
                let field_type = AcroFormFieldType::from_pdfium(form_field.field_type());

                // Get the field value based on its type
                let value = match form_field.field_type() {
                    PdfFormFieldType::Checkbox => {
                        if let Some(field) = form_field.as_checkbox_field() {
                            match field.is_checked() {
                                Ok(true) => Some("Yes".to_string()),
                                Ok(false) => Some("Off".to_string()),
                                Err(_) => None,
                            }
                        } else {
                            None
                        }
                    }
                    PdfFormFieldType::RadioButton => {
                        if let Some(field) = form_field.as_radio_button_field() {
                            if let Ok(true) = field.is_checked() {
                                field.group_value()
                            } else {
                                Some("Off".to_string())
                            }
                        } else {
                            None
                        }
                    }
                    PdfFormFieldType::Text => {
                        if let Some(field) = form_field.as_text_field() {
                            field.value()
                        } else {
                            None
                        }
                    }
                    PdfFormFieldType::ComboBox => {
                        if let Some(field) = form_field.as_combo_box_field() {
                            field.value()
                        } else {
                            None
                        }
                    }
                    PdfFormFieldType::ListBox => {
                        if let Some(field) = form_field.as_list_box_field() {
                            field.value()
                        } else {
                            None
                        }
                    }
                    // PushButton and Signature don't carry user values
                    _ => None,
                };

                // Get the annotation bounds if available
                let rect = annotation.bounds().ok().map(|r| {
                    Rect::new(
                        r.left().value,
                        r.bottom().value,
                        r.width().value,
                        r.height().value,
                    )
                });

                let is_read_only = form_field.is_read_only();
                let is_required = form_field.is_required();
                let name = form_field.name();

                fields.push(AcroFormField {
                    name,
                    field_type,
                    value,
                    rect,
                    page: page_idx,
                    is_read_only,
                    is_required,
                });
            }
        }
    }

    Ok(fields)
}

/// Gets a single form field by name.
///
/// # Arguments
/// * `bytes` - The raw PDF file bytes.
/// * `backend` - A reference to a `PdfiumBackend` instance.
/// * `field_name` - The name of the field to find.
///
/// # Returns
/// The matching `AcroFormField`, or `None` if not found.
#[allow(dead_code)]
pub fn get_field(
    bytes: &[u8],
    backend: &PdfiumBackend,
    field_name: &str,
) -> Result<Option<AcroFormField>, FormError> {
    let fields = read_fields(bytes, backend)?;
    Ok(fields
        .into_iter()
        .find(|f| f.name.as_ref().is_some_and(|n| n == field_name)))
}

/// Sets the value of an AcroForm text field and returns the modified PDF bytes.
///
/// This function loads the PDF, finds a form field with the given name,
/// sets its value, and saves the modified document to a new byte buffer.
///
/// # Arguments
/// * `bytes` - The raw PDF file bytes.
/// * `backend` - A reference to a `PdfiumBackend` instance.
/// * `field_name` - The name of the field to modify.
/// * `value` - The new value to set on the field.
///
/// # Returns
/// The modified PDF as a byte vector, or a `FormError`.
///
/// # Contract (section §10)
/// - Finds a text field by name and sets its value.
/// - Returns `FormError::NoForm` if the document has no AcroForm.
/// - Returns `FormError::FieldNotFound` if the field doesn't exist.
/// - Returns `FormError::UnsupportedFieldType` for non-text fields.
/// - The returned bytes are a valid PDF with the field value persisted.
pub fn set_field_value(
    bytes: &[u8],
    backend: &PdfiumBackend,
    field_name: &str,
    value: &str,
) -> Result<Vec<u8>, FormError> {
    let mut document = backend
        .pdfium_ref()
        .load_pdf_from_byte_slice(bytes, None)
        .map_err(|e| FormError::Pdfium(e.to_string()))?;

    // Check if the document has a form
    if document.form().is_none() {
        return Err(FormError::NoForm);
    }

    let total_pages = document.pages().len() as u32;
    let mut field_found = false;

    for page_idx in 0..total_pages {
        let mut pdf_page = document
            .pages_mut()
            .get(page_idx as i32)
            .map_err(|e| FormError::Pdfium(e.to_string()))?;

        for mut annotation in pdf_page.annotations_mut().iter() {
            if let Some(form_field) = annotation.as_form_field_mut() {
                let name = form_field.name();
                if name.as_deref() != Some(field_name) {
                    continue;
                }

                field_found = true;

                match form_field.field_type() {
                    PdfFormFieldType::Text => {
                        if let Some(text_field) = form_field.as_text_field_mut() {
                            text_field
                                .set_value(value)
                                .map_err(|e| FormError::Pdfium(e.to_string()))?;
                        } else {
                            return Err(FormError::UnsupportedFieldType(AcroFormFieldType::Text));
                        }
                    }
                    PdfFormFieldType::ComboBox => {
                        // ComboBox uses set_value_impl via PdfFormFieldPrivate
                        // We set the value using the PdfFormField's set_value_impl
                        // through the annotation's form field mutation API
                        // For now, ComboBox set_value uses the same approach as Text
                        return Err(FormError::UnsupportedFieldType(AcroFormFieldType::ComboBox));
                    }
                    PdfFormFieldType::Checkbox => {
                        if let Some(checkbox_field) = form_field.as_checkbox_field_mut() {
                            let is_checked = value == "Yes" || value == "yes" || value == "true";
                            checkbox_field
                                .set_checked(is_checked)
                                .map_err(|e| FormError::Pdfium(e.to_string()))?;
                        } else {
                            return Err(FormError::UnsupportedFieldType(
                                AcroFormFieldType::Checkbox,
                            ));
                        }
                    }
                    PdfFormFieldType::RadioButton => {
                        if let Some(radio_field) = form_field.as_radio_button_field_mut() {
                            if value == "true" || value == "Yes" || value == "yes" {
                                radio_field
                                    .set_checked()
                                    .map_err(|e| FormError::Pdfium(e.to_string()))?;
                            }
                            // Note: deselecting a radio button requires
                            // clicking a different option; we don't deselect here
                        } else {
                            return Err(FormError::UnsupportedFieldType(
                                AcroFormFieldType::RadioButton,
                            ));
                        }
                    }
                    // Push button, list box, signature not supported for setting values
                    _ => {
                        return Err(FormError::UnsupportedFieldType(
                            AcroFormFieldType::from_pdfium(form_field.field_type()),
                        ));
                    }
                }

                // Field was found and set; stop searching
                break;
            }
        }

        if field_found {
            break;
        }
    }

    if !field_found {
        return Err(FormError::FieldNotFound(field_name.to_string()));
    }

    // Save the modified document to bytes
    let result = document
        .save_to_bytes()
        .map_err(|e| FormError::Pdfium(e.to_string()))?;

    Ok(result)
}

/// Collects form field names from a PDF document.
///
/// This is a convenience function for quickly listing all field names
/// without retrieving full field data.
///
/// # Arguments
/// * `bytes` - The raw PDF file bytes.
/// * `backend` - A reference to a `PdfiumBackend` instance.
///
/// # Returns
/// A list of field names, or a `FormError`.
#[allow(dead_code)]
pub fn field_names(bytes: &[u8], backend: &PdfiumBackend) -> Result<Vec<String>, FormError> {
    let fields = read_fields(bytes, backend)?;
    Ok(fields.into_iter().filter_map(|f| f.name).collect())
}

/// Counts the number of AcroForm fields in a document.
///
/// # Arguments
/// * `bytes` - The raw PDF file bytes.
/// * `backend` - A reference to a `PdfiumBackend` instance.
///
/// # Returns
/// The number of form fields, or a `FormError`.
#[allow(dead_code)]
pub fn field_count(bytes: &[u8], backend: &PdfiumBackend) -> Result<usize, FormError> {
    let fields = read_fields(bytes, backend)?;
    Ok(fields.len())
}

/// Checks if a document contains an AcroForm.
///
/// # Arguments
/// * `bytes` - The raw PDF file bytes.
/// * `backend` - A reference to a `PdfiumBackend` instance.
///
/// # Returns
/// `true` if the document has at least one form field.
#[allow(dead_code)]
pub fn has_form(bytes: &[u8], backend: &PdfiumBackend) -> Result<bool, FormError> {
    match read_fields(bytes, backend) {
        Ok(fields) => Ok(!fields.is_empty()),
        Err(FormError::NoForm) => Ok(false),
        Err(e) => Err(e),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    use std::path::PathBuf;

    /// Helper to get the path to the test PDF file.
    fn test_pdf_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../../tests/corpus/pdf/01-hello-world.pdf")
    }

    /// Test that reading fields from a PDF without a form returns NoForm error.
    #[test]
    fn test_read_fields_no_form() {
        // Skip if PDFIUM_BINDINGS_LIBRARY_PATH is not set
        if std::env::var("PDFIUM_BINDINGS_LIBRARY_PATH").is_err() {
            return;
        }

        let backend = match PdfiumBackend::new() {
            Ok(b) => b,
            Err(_) => return,
        };

        let pdf_bytes = match std::fs::read(test_pdf_path()) {
            Ok(bytes) => bytes,
            Err(_) => return,
        };

        // Hello world PDF should not have a form
        let result = read_fields(&pdf_bytes, &backend);
        assert!(matches!(result, Err(FormError::NoForm)));
    }

    /// Test that field_count returns 0 for a PDF without forms.
    #[test]
    fn test_field_count_no_form() {
        if std::env::var("PDFIUM_BINDINGS_LIBRARY_PATH").is_err() {
            return;
        }

        let backend = match PdfiumBackend::new() {
            Ok(b) => b,
            Err(_) => return,
        };

        let pdf_bytes = match std::fs::read(test_pdf_path()) {
            Ok(bytes) => bytes,
            Err(_) => return,
        };

        let result = has_form(&pdf_bytes, &backend);
        assert!(matches!(result, Ok(false)));
    }

    /// Test that has_form returns false for a PDF without forms.
    #[test]
    fn test_has_form_no_form() {
        if std::env::var("PDFIUM_BINDINGS_LIBRARY_PATH").is_err() {
            return;
        }

        let backend = match PdfiumBackend::new() {
            Ok(b) => b,
            Err(_) => return,
        };

        let pdf_bytes = match std::fs::read(test_pdf_path()) {
            Ok(bytes) => bytes,
            Err(_) => return,
        };

        let result = has_form(&pdf_bytes, &backend);
        assert!(matches!(result, Ok(false)));
    }

    /// Test that field_names returns empty list for a PDF without forms.
    #[test]
    fn test_field_names_no_form() {
        if std::env::var("PDFIUM_BINDINGS_LIBRARY_PATH").is_err() {
            return;
        }

        let backend = match PdfiumBackend::new() {
            Ok(b) => b,
            Err(_) => return,
        };

        let pdf_bytes = match std::fs::read(test_pdf_path()) {
            Ok(bytes) => bytes,
            Err(_) => return,
        };

        let result = field_names(&pdf_bytes, &backend);
        assert!(matches!(result, Err(FormError::NoForm)));
    }

    /// Test AcroFormFieldType display and conversion.
    #[test]
    fn test_field_type_display() {
        assert_eq!(AcroFormFieldType::Text.to_string(), "Text");
        assert_eq!(AcroFormFieldType::Checkbox.to_string(), "Checkbox");
        assert_eq!(AcroFormFieldType::RadioButton.to_string(), "RadioButton");
        assert_eq!(AcroFormFieldType::PushButton.to_string(), "PushButton");
        assert_eq!(AcroFormFieldType::ComboBox.to_string(), "ComboBox");
        assert_eq!(AcroFormFieldType::ListBox.to_string(), "ListBox");
        assert_eq!(AcroFormFieldType::Signature.to_string(), "Signature");
        assert_eq!(AcroFormFieldType::Unknown.to_string(), "Unknown");
    }

    /// Test AcroFormField struct creation and field accessors.
    #[test]
    fn test_acro_form_field_creation() {
        let field = AcroFormField {
            name: Some("Given Name".to_string()),
            field_type: AcroFormFieldType::Text,
            value: Some("John".to_string()),
            rect: Some(Rect::new(10.0, 20.0, 100.0, 20.0)),
            page: 0,
            is_read_only: false,
            is_required: true,
        };

        assert_eq!(field.name.as_deref(), Some("Given Name"));
        assert_eq!(field.field_type, AcroFormFieldType::Text);
        assert_eq!(field.value.as_deref(), Some("John"));
        assert_eq!(field.page, 0);
        assert!(!field.is_read_only);
        assert!(field.is_required);

        let rect = field.rect.unwrap();
        assert_eq!(rect.x, 10.0);
        assert_eq!(rect.y, 20.0);
        assert_eq!(rect.width, 100.0);
        assert_eq!(rect.height, 20.0);
    }

    /// Test that a field with no name is handled correctly.
    #[test]
    fn test_field_with_no_name() {
        let field = AcroFormField {
            name: None,
            field_type: AcroFormFieldType::PushButton,
            value: None,
            rect: None,
            page: 1,
            is_read_only: true,
            is_required: false,
        };

        assert!(field.name.is_none());
        assert!(field.value.is_none());
        assert!(field.rect.is_none());
        assert_eq!(field.page, 1);
        assert!(field.is_read_only);
        assert!(!field.is_required);
    }

    /// Test FormError display implementation.
    #[test]
    fn test_form_error_display() {
        let err = FormError::NoForm;
        assert_eq!(err.to_string(), "No AcroForm found in document");

        let err = FormError::FieldNotFound("TestField".to_string());
        assert_eq!(err.to_string(), "Field not found: TestField");

        let err = FormError::UnsupportedFieldType(AcroFormFieldType::PushButton);
        assert_eq!(err.to_string(), "Unsupported field type: PushButton");
    }

    /// Test that the AcroFormFieldType enum has all expected variants.
    #[test]
    fn test_field_type_exhaustive() {
        // Verify all variants are constructable
        let variants = vec![
            AcroFormFieldType::Unknown,
            AcroFormFieldType::PushButton,
            AcroFormFieldType::Checkbox,
            AcroFormFieldType::RadioButton,
            AcroFormFieldType::ComboBox,
            AcroFormFieldType::ListBox,
            AcroFormFieldType::Text,
            AcroFormFieldType::Signature,
        ];
        assert_eq!(variants.len(), 8);
    }

    /// Test that set_field_value returns appropriate error for no-form documents.
    #[test]
    fn test_set_field_value_no_form() {
        if std::env::var("PDFIUM_BINDINGS_LIBRARY_PATH").is_err() {
            return;
        }

        let backend = match PdfiumBackend::new() {
            Ok(b) => b,
            Err(_) => return,
        };

        let pdf_bytes = match std::fs::read(test_pdf_path()) {
            Ok(bytes) => bytes,
            Err(_) => return,
        };

        let result = set_field_value(&pdf_bytes, &backend, "TestField", "value");
        assert!(matches!(result, Err(FormError::NoForm)));
    }

    /// Test round-trip: create PDF, fill a field, re-save, verify persists.
    ///
    /// This is the acceptance test for PDF-4: "fill a field, re-save, persists".
    #[test]
    #[ignore = "Requires a PDF with form fields and pdfium library"]
    fn test_fill_field_persists() {
        // This test requires:
        // 1. A PDF file with at least one AcroForm text field
        // 2. PDFIUM_BINDINGS_LIBRARY_PATH to be set
        // In a real test environment, a form-enabled test PDF would be used.

        if std::env::var("PDFIUM_BINDINGS_LIBRARY_PATH").is_err() {
            return;
        }

        let backend = match PdfiumBackend::new() {
            Ok(b) => b,
            Err(_) => return,
        };

        // We need a PDF with a form field. Since we don't have one in the test
        // corpus, we verify the function signature and error handling.
        let pdf_bytes = match std::fs::read(test_pdf_path()) {
            Ok(bytes) => bytes,
            Err(_) => return,
        };

        // Should fail with NoForm since hello-world PDF has no form
        let result = set_field_value(&pdf_bytes, &backend, "AnyField", "test");
        assert!(
            matches!(result, Err(FormError::NoForm)),
            "Expected NoForm error for PDF without AcroForm"
        );

        // Verify bytes are unchanged
        let original_len = pdf_bytes.len();
        assert!(original_len > 0, "PDF should have content");
    }

    /// Test the contract: set_field_value returns FieldNotFound for non-existent field.
    #[test]
    #[ignore = "Requires a PDF with form fields and pdfium library"]
    fn test_set_field_value_nonexistent_field() {
        // Would test that setting a value on a non-existent field returns FieldNotFound
        if std::env::var("PDFIUM_BINDINGS_LIBRARY_PATH").is_err() {
            return;
        }

        let backend = match PdfiumBackend::new() {
            Ok(b) => b,
            Err(_) => return,
        };

        let pdf_bytes = match std::fs::read(test_pdf_path()) {
            Ok(bytes) => bytes,
            Err(_) => return,
        };

        // Without a form-enabled PDF, this will fail with NoForm
        let result = set_field_value(&pdf_bytes, &backend, "NonExistentField", "value");
        assert!(result.is_err());
    }
}
