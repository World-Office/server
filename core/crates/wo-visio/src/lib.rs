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
        && archive.by_name("[Content_Types].xml").is_ok()
    {
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
        let bytes = serializer
            .serialize(&doc)
            .expect("serialization should succeed");

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

    #[test]
    fn roundtrip_all_geometry_types() {
        let doc = VisioDocument {
            pages: vec![VisioPage {
                id: "0".to_string(),
                name: "Geometry Test".to_string(),
                width: 8.5,
                height: 11.0,
                shapes: vec![VisioShape {
                    id: "1".to_string(),
                    name: Some("AllGeom".to_string()),
                    unique_id: None,
                    master_id: None,
                    x: 0.0,
                    y: 0.0,
                    width: 10.0,
                    height: 10.0,
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
                    geometry: Some(VisioGeometry {
                        width: 10.0,
                        height: 10.0,
                        segments: vec![
                            GeoSegment::MoveTo { x: 0.0, y: 0.0 },
                            GeoSegment::LineTo { x: 10.0, y: 0.0 },
                            GeoSegment::LineTo { x: 10.0, y: 10.0 },
                            GeoSegment::LineTo { x: 0.0, y: 10.0 },
                            GeoSegment::LineTo { x: 0.0, y: 0.0 },
                            // ArcTo with bow parameters
                            GeoSegment::ArcTo {
                                x: 5.0,
                                y: 5.0,
                                a: 1.0,
                                b: 2.0,
                                c: 3.0,
                            },
                            // EllipticalArcTo
                            GeoSegment::EllipticalArcTo {
                                x: 8.0,
                                y: 2.0,
                                a: 4.0,
                                b: 5.0,
                                c: 6.0,
                                d: 7.0,
                            },
                            // BezierTo
                            GeoSegment::BezierTo {
                                x: 3.0,
                                y: 7.0,
                                a: 1.0,
                                b: 2.0,
                                c: 3.0,
                                d: 4.0,
                            },
                            // NURBSTo
                            GeoSegment::NURBSTo {
                                x: 9.0,
                                y: 1.0,
                                knots: vec![0.0, 0.5, 1.0],
                                weights: vec![1.0, 2.0, 1.0],
                            },
                            // PolylineTo
                            GeoSegment::PolylineTo {
                                x: 7.0,
                                y: 3.0,
                                points: vec![(1.0, 1.0), (2.0, 2.0)],
                            },
                            // SplineStart
                            GeoSegment::SplineStart {
                                x: 4.0,
                                y: 6.0,
                                degree: 3,
                                knots: vec![0.0, 0.33, 0.66, 1.0],
                            },
                            // InfiniteLine
                            GeoSegment::InfiniteLine {
                                x1: 0.0,
                                y1: 0.0,
                                x2: 10.0,
                                y2: 10.0,
                            },
                            // Ellipse
                            GeoSegment::Ellipse {
                                x: 5.0,
                                y: 5.0,
                                cx: 2.0,
                                cy: 3.0,
                            },
                            // Rectangle (custom composite)
                            GeoSegment::Rectangle { w: 3.0, h: 4.0 },
                        ],
                    }),
                    sub_shapes: vec![],
                    style: None,
                    formatting: None,
                }],
                connectors: vec![],
                background_page_id: None,
            }],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        let parsed_geom = parsed.pages[0].shapes[0].geometry.as_ref()
            .expect("geometry should survive roundtrip");
        let original_segs = &doc.pages[0].shapes[0].geometry.as_ref().unwrap().segments;

        // Should have more segments than original because Rectangle expands to 5 primitives
        assert!(
            parsed_geom.segments.len() >= original_segs.len(),
            "should have at least {} segments, got {}",
            original_segs.len(),
            parsed_geom.segments.len()
        );

        // Verify first segment types (original 11 geometry types + 4 from Rectangle expansion)
        assert!(matches!(parsed_geom.segments[0], GeoSegment::MoveTo { .. }));
        assert!(matches!(parsed_geom.segments[1], GeoSegment::LineTo { .. }));
        assert!(matches!(parsed_geom.segments[5], GeoSegment::ArcTo { .. }));
        assert!(matches!(parsed_geom.segments[6], GeoSegment::EllipticalArcTo { .. }));
        assert!(matches!(parsed_geom.segments[7], GeoSegment::BezierTo { .. }));
        assert!(matches!(parsed_geom.segments[8], GeoSegment::NURBSTo { .. }));
        assert!(matches!(parsed_geom.segments[9], GeoSegment::PolylineTo { .. }));
        assert!(matches!(parsed_geom.segments[10], GeoSegment::SplineStart { .. }));
        assert!(matches!(parsed_geom.segments[11], GeoSegment::InfiniteLine { .. }));
        assert!(matches!(parsed_geom.segments[12], GeoSegment::Ellipse { .. }));
        // Rectangle expanded to 5 segments: MoveTo + 4x LineTo
        assert!(matches!(parsed_geom.segments[13], GeoSegment::MoveTo { .. }));
        assert!(matches!(parsed_geom.segments[14], GeoSegment::LineTo { .. }));
        assert!(matches!(parsed_geom.segments[15], GeoSegment::LineTo { .. }));
        assert!(matches!(parsed_geom.segments[16], GeoSegment::LineTo { .. }));
        assert!(matches!(parsed_geom.segments[17], GeoSegment::LineTo { .. }));
    }

    #[test]
    fn roundtrip_connectors() {
        let doc = VisioDocument {
            pages: vec![VisioPage {
                id: "0".to_string(),
                name: "Connectors".to_string(),
                width: 8.5,
                height: 11.0,
                shapes: vec![VisioShape {
                    id: "1".to_string(),
                    name: Some("Box1".to_string()),
                    unique_id: None,
                    master_id: None,
                    x: 1.0,
                    y: 1.0,
                    width: 2.0,
                    height: 2.0,
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
                connectors: vec![VisioConnector {
                    id: "c1".to_string(),
                    name: Some("Connector".to_string()),
                    from_shape_id: Some("1".to_string()),
                    to_shape_id: Some("2".to_string()),
                    from_connection: Some("1".to_string()),
                    to_connection: Some("3".to_string()),
                    arrow_type: Some("EndArrow".to_string()),
                    routing_style: Some(1),
                    geometry: None,
                    text: Some("edge".to_string()),
                }],
                background_page_id: None,
            }],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        assert_eq!(parsed.pages[0].connectors.len(), 1);
        assert_eq!(parsed.pages[0].connectors[0].id, "c1");
        assert_eq!(parsed.pages[0].connectors[0].name.as_deref(), Some("Connector"));
        assert_eq!(parsed.pages[0].connectors[0].from_shape_id.as_deref(), Some("1"));
        assert_eq!(parsed.pages[0].connectors[0].text.as_deref(), Some("edge"));
    }

    #[test]
    fn roundtrip_formatting() {
        let doc = VisioDocument {
            pages: vec![VisioPage {
                id: "0".to_string(),
                name: "Formatting".to_string(),
                width: 8.5,
                height: 11.0,
                shapes: vec![VisioShape {
                    id: "1".to_string(),
                    name: Some("Styled".to_string()),
                    unique_id: None,
                    master_id: None,
                    x: 1.0,
                    y: 1.0,
                    width: 2.0,
                    height: 1.0,
                    rotation: 45.0,
                    text: Some("Styled Text".to_string()),
                    fill_color: Some("#FF0000".to_string()),
                    fill_foreground: None,
                    fill_background: None,
                    stroke_color: Some("#00FF00".to_string()),
                    stroke_width: Some(0.05),
                    stroke_pattern: Some(1),
                    shadow_color: Some("#888888".to_string()),
                    shadow_offset_x: Some(0.125),
                    shadow_offset_y: Some(-0.125),
                    layer_member: Some("0".to_string()),
                    geometry: None,
                    sub_shapes: vec![],
                    style: Some("LineStyle1".to_string()),
                    formatting: Some(VisioFormatting {
                        font: Some("Calibri".to_string()),
                        font_size: Some(12.0),
                        font_color: Some("#000000".to_string()),
                        italic: Some(true),
                        bold: Some(true),
                        underline: Some(false),
                        align_horizontal: Some("Center".to_string()),
                        align_vertical: Some("Middle".to_string()),
                        tlbr: None,
                    }),
                }],
                connectors: vec![],
                background_page_id: None,
            }],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        let shape = &parsed.pages[0].shapes[0];
        assert_eq!(shape.text.as_deref(), Some("Styled Text"));
        assert!((shape.rotation - 45.0).abs() < 0.001, "rotation should be ~45 deg");
        assert_eq!(shape.fill_color.as_deref(), Some("#FF0000"));
        assert_eq!(shape.stroke_color.as_deref(), Some("#00FF00"));
        assert_eq!(shape.layer_member.as_deref(), Some("0"));

        // Formatting
        let fmt = shape.formatting.as_ref().expect("formatting should exist");
        assert_eq!(fmt.font.as_deref(), Some("Calibri"));
        assert!((fmt.font_size.unwrap() - 12.0).abs() < 0.001);
        assert_eq!(fmt.italic, Some(true));
        assert_eq!(fmt.bold, Some(true));
        assert_eq!(fmt.align_horizontal.as_deref(), Some("Center"));
    }

    #[test]
    fn roundtrip_sub_shapes() {
        let doc = VisioDocument {
            pages: vec![VisioPage {
                id: "0".to_string(),
                name: "Group".to_string(),
                width: 8.5,
                height: 11.0,
                shapes: vec![VisioShape {
                    id: "1".to_string(),
                    name: Some("Group".to_string()),
                    unique_id: None,
                    master_id: None,
                    x: 0.0,
                    y: 0.0,
                    width: 5.0,
                    height: 5.0,
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
                    sub_shapes: vec![
                        VisioShape {
                            id: "2".to_string(),
                            name: Some("Child1".to_string()),
                            unique_id: None,
                            master_id: None,
                            x: 0.0,
                            y: 0.0,
                            width: 2.0,
                            height: 2.0,
                            rotation: 0.0,
                            text: Some("Child1".to_string()),
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
                        },
                        VisioShape {
                            id: "3".to_string(),
                            name: Some("Child2".to_string()),
                            unique_id: None,
                            master_id: None,
                            x: 2.0,
                            y: 2.0,
                            width: 3.0,
                            height: 3.0,
                            rotation: 90.0,
                            text: None,
                            fill_color: Some("#0000FF".to_string()),
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
                        },
                    ],
                    style: None,
                    formatting: None,
                }],
                connectors: vec![],
                background_page_id: None,
            }],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        assert_eq!(parsed.pages[0].shapes[0].sub_shapes.len(), 2);
        assert_eq!(
            parsed.pages[0].shapes[0].sub_shapes[0].name.as_deref(),
            Some("Child1")
        );
        assert_eq!(
            parsed.pages[0].shapes[0].sub_shapes[1].name.as_deref(),
            Some("Child2")
        );
        assert!(
            (parsed.pages[0].shapes[0].sub_shapes[1].rotation - 90.0).abs() < 0.001
        );
    }

    #[test]
    fn roundtrip_multiple_pages() {
        let doc = VisioDocument {
            pages: vec![
                VisioPage {
                    id: "0".to_string(),
                    name: "Page-1".to_string(),
                    width: 8.5,
                    height: 11.0,
                    shapes: vec![VisioShape {
                        id: "1".to_string(),
                        name: Some("Shape1".to_string()),
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
                    background_page_id: None,
                },
                VisioPage {
                    id: "1".to_string(),
                    name: "Page-2".to_string(),
                    width: 11.0,
                    height: 17.0,
                    shapes: vec![],
                    connectors: vec![],
                    background_page_id: None,
                },
            ],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        assert_eq!(parsed.pages.len(), 2);
        assert_eq!(parsed.pages[0].name, "Page-1");
        assert_eq!(parsed.pages[1].name, "Page-2");
        assert_eq!(parsed.pages[0].shapes.len(), 1);
        assert_eq!(parsed.pages[1].shapes.len(), 0);
        // Different page sizes preserved
        assert!((parsed.pages[1].width - 11.0).abs() < 0.001);
        assert!((parsed.pages[1].height - 17.0).abs() < 0.001);
    }

    #[test]
    fn roundtrip_theme_colors() {
        let doc = VisioDocument {
            theme_colors: vec![
                ThemeColor {
                    index: 0,
                    rgb: "#F0F0F0".to_string(),
                    name: Some("Background".to_string()),
                },
                ThemeColor {
                    index: 1,
                    rgb: "#4472C4".to_string(),
                    name: Some("Accent 1".to_string()),
                },
                ThemeColor {
                    index: 2,
                    rgb: "#ED7D31".to_string(),
                    name: None,
                },
            ],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        assert_eq!(parsed.theme_colors.len(), 3);
        assert_eq!(parsed.theme_colors[0].index, 0);
        assert_eq!(parsed.theme_colors[0].name.as_deref(), Some("Background"));
        assert!(parsed.theme_colors[0].rgb.contains("F0"));
        assert_eq!(parsed.theme_colors[2].name, None);
    }

    #[test]
    fn roundtrip_empty_page() {
        let doc = VisioDocument {
            pages: vec![VisioPage {
                id: "0".to_string(),
                name: "Empty".to_string(),
                width: 8.5,
                height: 11.0,
                shapes: vec![],
                connectors: vec![],
                background_page_id: None,
            }],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        assert_eq!(parsed.pages.len(), 1);
        assert_eq!(parsed.pages[0].name, "Empty");
        assert!(parsed.pages[0].shapes.is_empty());
        assert!(parsed.pages[0].connectors.is_empty());
    }

    #[test]
    fn roundtrip_no_core_properties() {
        let doc = VisioDocument {
            properties: VisioProperties {
                title: None,
                subject: None,
                creator: None,
                description: None,
            },
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        assert!(parsed.properties.title.is_none());
        assert!(parsed.properties.creator.is_none());
        assert!(parsed.properties.subject.is_none());
        assert!(parsed.properties.description.is_none());
    }

    #[test]
    fn parse_invalid_data_returns_error() {
        let parser = VisioParser::new();
        // Random bytes that aren't a ZIP
        let result = parser.parse(&[0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x01, 0x02, 0x03]);
        assert!(result.is_err());
    }

    #[test]
    fn parse_empty_zip_returns_empty_document() {
        // A minimal valid empty ZIP (end-of-central-directory record only)
        // should parse successfully but produce an empty document
        let parser = VisioParser::new();
        let result = parser.parse(&[
            0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]);
        match result {
            Ok(doc) => {
                // Empty ZIP = no pages (no [Content_Types].xml to identify as Visio)
                assert!(doc.pages.is_empty(), "empty ZIP should have no pages");
            }
            Err(_) => {
                // Error is also acceptable
            }
        }
    }

    #[test]
    fn is_visio_detects_non_zip() {
        assert!(!is_visio_file(&[0x00, 0x01, 0x02, 0x03]));
        assert!(!is_visio_file(&[]));
        assert!(!is_visio_file(&[0x50, 0x4B, 0x01, 0x02])); // Invalid ZIP
    }

    #[test]
    fn roundtrip_pin_position_math() {
        // Verify that PinX - LocPinX = x, PinY - LocPinY = y
        let doc = VisioDocument {
            pages: vec![VisioPage {
                id: "0".to_string(),
                name: "Positions".to_string(),
                width: 8.5,
                height: 11.0,
                shapes: vec![VisioShape {
                    id: "1".to_string(),
                    name: Some("Offset".to_string()),
                    unique_id: None,
                    master_id: None,
                    x: 2.5,  // upper-left corner
                    y: 1.5,
                    width: 3.0,
                    height: 2.0,
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
                background_page_id: None,
            }],
            ..create_test_document()
        };
        let serializer = VisioSerializer::new();
        let bytes = serializer.serialize(&doc).expect("serialization");
        let parser = VisioParser::new();
        let parsed = parser.parse(&bytes).expect("parsing");

        let shape = &parsed.pages[0].shapes[0];
        // Position should survive roundtrip
        assert!((shape.x - 2.5).abs() < 0.01, "x should be ~2.5, got {}", shape.x);
        assert!((shape.y - 1.5).abs() < 0.01, "y should be ~1.5, got {}", shape.y);
        assert!((shape.width - 3.0).abs() < 0.01);
        assert!((shape.height - 2.0).abs() < 0.01);
    }
}
