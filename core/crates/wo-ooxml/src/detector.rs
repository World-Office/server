//! OOXML format detection.

use crate::model::OoxmlFormat;

/// Detect the specific OOXML format from ZIP contents.
pub fn detect_ooxml_format(content_types_xml: &str) -> OoxmlFormat {
    if content_types_xml.contains("word/")
        || content_types_xml
            .contains("application/vnd.openxmlformats-officedocument.wordprocessingml")
    {
        OoxmlFormat::Docx
    } else if content_types_xml.contains("spreadsheet/")
        || content_types_xml.contains("application/vnd.openxmlformats-officedocument.spreadsheetml")
    {
        OoxmlFormat::Xlsx
    } else if content_types_xml.contains("presentation/")
        || content_types_xml
            .contains("application/vnd.openxmlformats-officedocument.presentationml")
    {
        OoxmlFormat::Pptx
    } else {
        OoxmlFormat::Unknown
    }
}

/// Detect if data is a flat OPC (single-XML) DOCX document.
/// Flat OPC format is a single XML file (not a ZIP) that represents a complete
/// DOCX document. This includes:
///
/// - Word 2003 XML format (w:wordDocument root element)
/// - Flat OPC format with w:document root element
///
/// Returns true if the data looks like a flat OPC XML document.
pub fn is_flat_opc_docx(data: &[u8]) -> bool {
    if data.len() < 50 {
        return false;
    }

    // Must start with XML declaration or < tag
    let starts_with_xml = data.starts_with(b"<?xml")
        || data.starts_with(b"<w:wordDocument")
        || data.starts_with(b"<w:document")
        || data.starts_with(b"<pk:");

    if !starts_with_xml {
        return false;
    }

    // Quick check: not a ZIP (ZIP files start with PK magic number)
    if data[0] == 0x50 && data[1] == 0x4B {
        return false;
    }

    // Try to detect Word-specific XML
    let data_lower = String::from_utf8_lossy(data).to_lowercase();

    // Word 2003 XML format
    if data_lower.contains("<w:worddocument")
        && data_lower.contains("xmlns:w=\"http://schemas.microsoft.com/office/word/2003/wordml\"")
    {
        return true;
    }

    // Flat OPC DOCX (Word 2007+ in flat format)
    if data_lower.contains("<w:document")
        && data_lower
            .contains("xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"")
    {
        return true;
    }

    // Flat OPC wrapper
    if data_lower.contains("flatopc")
        || data_lower.contains("FlatOpc")
        || data_lower.contains("<pkg:package")
        || data_lower.contains("xmlns:pkg=\"http://schemas.microsoft.com/office/2006/xmlPackage\"")
    {
        return true;
    }

    false
}

/// Check if data is an OOXML file (either ZIP-based or flat OPC).
pub fn is_ooxml(data: &[u8]) -> bool {
    // First check for flat OPC
    if is_flat_opc_docx(data) {
        return true;
    }

    // Then check for ZIP-based OPC
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
