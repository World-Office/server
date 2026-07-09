use serde::{Deserialize, Serialize};

/// Parsed PDF document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfDocument {
    /// PDF version (e.g., "1.4", "1.7", "2.0").
    pub version: String,
    /// Number of pages.
    pub page_count: u32,
    /// Document metadata.
    pub metadata: PdfMetadata,
    /// Extracted text per page (may be empty for scanned PDFs).
    pub pages: Vec<PdfPage>,
    /// All indirect objects found in the file.
    pub objects: Vec<PdfObject>,
    /// Whether the file is linearized (optimized for web delivery).
    pub linearized: bool,
    /// Cross-reference table type.
    pub xref_type: XrefType,
    /// Encryption information (None if not encrypted).
    pub encryption: Option<PdfEncryption>,
}

/// PDF document metadata from the Info dictionary.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PdfMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub producer: Option<String>,
    pub creation_date: Option<String>,
    pub modification_date: Option<String>,
}

/// A single PDF page with extracted text and annotations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfPage {
    /// 1-based page number.
    pub number: u32,
    /// Width in points (1/72 inch).
    pub width: Option<f32>,
    /// Height in points.
    pub height: Option<f32>,
    /// Extracted text content.
    pub text: Option<String>,
    /// Rotation angle (0, 90, 180, 270).
    pub rotation: u32,
    /// Annotations on this page (from /Annots).
    #[serde(default)]
    pub annotations: Vec<PdfAnnotation>,
}

/// A PDF annotation object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfAnnotation {
    /// Annotation subtype (e.g., "Text", "Highlight", "StrikeOut", "Underline", "Stamp", "FreeText").
    pub subtype: String,
    /// Rectangle [llx, lly, urx, ury] in PDF user space units.
    pub rect: [f32; 4],
    /// Optional text contents (popup note text).
    pub contents: Option<String>,
    /// Optional author name.
    pub author: Option<String>,
    /// Optional modification date.
    pub modified: Option<String>,
    /// QuadPoints for text markup annotations (highlight/strikeout/underline) — flattened [x1,y1, x2,y2, x3,y3, x4,y4].
    pub quad_points: Option<Vec<f32>>,
    /// Optional color as RGB [r, g, b] in 0.0–1.0 range.
    pub color: Option<[f32; 3]>,
    /// Optional opacity (1.0 = opaque, 0.0 = transparent).
    pub opacity: Option<f32>,
    /// Optional flag indicating the annotation is open (for text annotations).
    pub open: Option<bool>,
    /// Optional annotation name (unique identifier).
    pub name: Option<String>,
    /// Optional border style: [width, dash_pattern...].
    pub border: Option<Vec<f32>>,
}

/// A PDF indirect object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfObject {
    /// Object number.
    pub obj_num: u32,
    /// Generation number (usually 0).
    pub gen_num: u32,
    /// The object's dictionary entries.
    pub entries: Vec<(String, PdfValue)>,
    /// Raw stream data (for streams).
    pub stream_data: Option<Vec<u8>>,
}

/// PDF value types.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PdfValue {
    Null,
    Boolean(bool),
    Integer(i64),
    Real(f64),
    String(String),
    Name(String),
    Array(Vec<PdfValue>),
    Dictionary(Vec<(String, PdfValue)>),
    Reference {
        obj_num: u32,
        gen_num: u32,
    },
    Stream {
        dict: Vec<(String, PdfValue)>,
        data: Vec<u8>,
    },
}

/// Type of cross-reference table in the PDF.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum XrefType {
    /// Classic xref table (text-based, pre-PDF 1.5)
    ClassicTable,
    /// Cross-reference stream (PDF 1.5+)
    XrefStream,
    /// Hybrid: both classic table and xref stream present
    Hybrid,
    /// Unknown / not detected
    #[default]
    Unknown,
}

/// PDF encryption information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfEncryption {
    /// Whether the document is encrypted.
    pub encrypted: bool,
    /// Encryption algorithm version (from /V entry).
    pub version: u32,
    /// Key length in bits (from /Length entry, if present).
    pub key_length: Option<u32>,
    /// Encryption method name (e.g., "AES", "RC4", "None").
    pub method: String,
    /// Whether user password is required (vs owner password).
    pub user_password_required: bool,
}
