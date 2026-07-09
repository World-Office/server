pub mod model;
pub mod parser;
pub mod serializer;

pub use model::*;
pub use parser::VisioParser;
pub use serializer::VisioSerializer;

pub const FORMAT_NAME: &str = "visio";

/// Check if data is a VSDX file (ZIP with [Content_Types].xml and visio content).
pub fn is_visio_file(data: &[u8]) -> bool {
    if data.len() < 4 || data[0] != 0x50 || data[1] != 0x4B {
        return false;
    }
    let cursor = std::io::Cursor::new(data);
    if let Ok(mut archive) = zip::ZipArchive::new(cursor)
        && archive.by_name("[Content_Types].xml").is_ok() {
            return true;
        }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_document() -> VisioDocument {
        VisioDocument {
            version: "16.0".to_string(),
            properties: VisioProperties {
                title: Some("Test Diagram".to_string()),
                subject: None,
                creator: Some("wo-visio".to_string()),
                description: None,
            },
            pages: vec![VisioPage {
                id: "0".to_string(),
                name: "Page-1".to_string(),
                width: 8.5,
                height: 11.0,
                shapes: vec![VisioShape {
                    id: "1".to_string(),
                    name: Some("Rectangle.1".to_string()),
                    unique_id: None,
                    master_id: None,
                    x: 2.0,
                    y: 2.0,
                    width: 3.0,
                    height: 2.0,
                    rotation: 0.0,
                    text: Some("Hello".to_string()),
                    fill_color: Some("#F0F0F0".to_string()),
                    fill_foreground: None,
                    fill_background: None,
                    stroke_color: Some("#000000".to_string()),
                    stroke_width: Some(0.01),
                    stroke_pattern: None,
                    shadow_color: None,
                    shadow_offset_x: None,
                    shadow_offset_y: None,
                    layer_member: None,
                    geometry: None,
                    sub_shapes: vec![],
                    style: None,
                    formatting: None,
                }],
                connectors: vec![],
                background_page_id: None,
            }],
            masters: vec![],
            theme_colors: vec![],
        }
    }

    #[test]
    fn roundtrip_basic_document() {
        let doc = create_test_document();
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization should succeed");

        assert!(!bytes.is_empty(), "serialized bytes should not be empty");
        assert!(is_visio_file(&bytes), "output should be a valid VSDX file");

        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing should succeed");

        assert_eq!(parsed.version, doc.version);
        assert_eq!(parsed.properties.title, doc.properties.title);
        assert_eq!(parsed.properties.creator, doc.properties.creator);
        assert_eq!(parsed.pages.len(), doc.pages.len());
        assert_eq!(parsed.pages[0].name, doc.pages[0].name);
        assert_eq!(parsed.pages[0].shapes.len(), doc.pages[0].shapes.len());
        assert_eq!(parsed.pages[0].shapes[0].id, doc.pages[0].shapes[0].id);
        assert_eq!(parsed.pages[0].shapes[0].text.as_deref(), Some("Hello"));
    }

    #[test]
    fn is_visio_identifies_zip_with_content_types() {
        let doc = create_test_document();
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        assert!(is_visio_file(&bytes));
    }

    #[test]
    fn empty_bytes_not_visio() {
        assert!(!is_visio_file(&[]));
        assert!(!is_visio_file(&[0x00, 0x00, 0x00, 0x00]));
    }

    #[test]
    fn document_with_masters_roundtrip() {
        let doc = VisioDocument {
            masters: vec![VisioMaster {
                id: "0".to_string(),
                name: "Rectangle".to_string(),
                unique_id: Some("UUID-1".to_string()),
                shapes: vec![VisioShape {
                    id: "2".to_string(),
                    name: Some("Rect".to_string()),
                    unique_id: None,
                    master_id: None,
                    x: 0.0,
                    y: 0.0,
                    width: 1.0,
                    height: 1.0,
                    rotation: 0.0,
                    text: None,
                    fill_color: None,
                    fill_foreground: None,
                    fill_background: None,
                    stroke_color: None,
                    stroke_width: None,
                    stroke_pattern: None,
                    shadow_color: None,
                    shadow_offset_x: None,
                    shadow_offset_y: None,
                    layer_member: None,
                    geometry: None,
                    sub_shapes: vec![],
                    style: None,
                    formatting: None,
                }],
                connectors: vec![],
                icon: None,
            }],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");
        assert_eq!(parsed.masters.len(), 1);
        assert_eq!(parsed.masters[0].name, "Rectangle");
    }
}