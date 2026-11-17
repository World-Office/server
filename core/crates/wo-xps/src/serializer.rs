//! XPS serializer — writes an [`XpsDocument`] to a valid XPS ZIP file.

use std::fmt::Write;

use wo_office_utils::ArchiveWriter;

use crate::model::*;

/// Serializes an [`XpsDocument`] into XPS bytes (ZIP archive).
pub struct XpsSerializer;

impl XpsSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize the document to XPS bytes.
    pub fn serialize(&self, doc: &XpsDocument) -> Result<Vec<u8>, anyhow::Error> {
        let mut writer = ArchiveWriter::new()?;

        // 1. [Content_Types].xml
        let content_types = build_content_types(doc);
        writer.add_file("[Content_Types].xml", content_types.as_bytes())?;

        // 2. _rels/.rels
        let rels = build_rels(doc);
        writer.add_file("_rels/.rels", rels.as_bytes())?;

        // 3. Documents/1/FixedDocSeq.fdseq
        let fdseq = build_fixed_doc_seq(doc);
        writer.add_file("Documents/1/FixedDocSeq.fdseq", fdseq.as_bytes())?;

        // 4. Documents/1/FixedDocument.fdoc
        let fdoc = build_fixed_document(doc);
        writer.add_file("Documents/1/FixedDocument.fdoc", fdoc.as_bytes())?;

        // 5. Documents/1/_rels/FixedDocument.fdoc.rels
        let fdoc_rels = build_fixed_document_rels(doc);
        writer.add_file(
            "Documents/1/_rels/FixedDocument.fdoc.rels",
            fdoc_rels.as_bytes(),
        )?;

        // 6. Page files
        for page in &doc.pages {
            let fpage = build_fixed_page(page);
            let path = format!("Documents/1/Pages/{}.fpage", page.index + 1);
            writer.add_file(&path, fpage.as_bytes())?;
        }

        // 7. Font resources
        for font in &doc.fonts {
            let uri = font.uri.trim_start_matches('/');
            writer.add_file(uri, &font.data)?;
        }

        // 8. Image resources
        for image in &doc.images {
            let uri = image.uri.trim_start_matches('/');
            writer.add_file(uri, &image.data)?;
        }

        // 9. Core metadata
        if doc.metadata.title.is_some()
            || doc.metadata.author.is_some()
            || doc.metadata.subject.is_some()
        {
            let core_xml = build_core_metadata(&doc.metadata);
            writer.add_file("Documents/1/Metadata/Core.xml", core_xml.as_bytes())?;
        }

        let bytes = writer.finish()?;
        Ok(bytes)
    }
}

impl Default for XpsSerializer {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn escape_xml(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// [Content_Types].xml
// ---------------------------------------------------------------------------

fn build_content_types(doc: &XpsDocument) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n",
    );

    // Default content types
    writeln!(
        xml,
        "  <Default Extension=\".rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
    ).unwrap();
    writeln!(
        xml,
        "  <Default Extension=\".fpage\" ContentType=\"application/vnd.ms-package.xps-fixedpage+xml\"/>"
    ).unwrap();
    writeln!(
        xml,
        "  <Default Extension=\".fdseq\" ContentType=\"application/vnd.ms-package.xps-fixeddocumentsequence+xml\"/>"
    ).unwrap();
    writeln!(
        xml,
        "  <Default Extension=\".fdoc\" ContentType=\"application/vnd.ms-package.xps-fixeddocument+xml\"/>"
    ).unwrap();

    // Override for Core metadata
    if doc.metadata.title.is_some()
        || doc.metadata.author.is_some()
        || doc.metadata.subject.is_some()
    {
        writeln!(
            xml,
            "  <Override PartName=\"/Documents/1/Metadata/Core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>"
        ).unwrap();
    }

    // Add content types for resources
    for font in &doc.fonts {
        if let Some(ref ct) = font.content_type {
            let part_name = font.uri.trim_start_matches('/');
            writeln!(
                xml,
                "  <Override PartName=\"/{part_name}\" ContentType=\"{ct}\"/>"
            )
            .unwrap();
        }
    }
    for image in &doc.images {
        if let Some(ref ct) = image.content_type {
            let part_name = image.uri.trim_start_matches('/');
            writeln!(
                xml,
                "  <Override PartName=\"/{part_name}\" ContentType=\"{ct}\"/>"
            )
            .unwrap();
        }
    }

    xml.push_str("</Types>");
    xml
}

// ---------------------------------------------------------------------------
// _rels/.rels
// ---------------------------------------------------------------------------

fn build_rels(doc: &XpsDocument) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n",
    );

    // Default relationship to FixedDocSeq
    writeln!(
        xml,
        "  <Relationship Target=\"/Documents/1/FixedDocSeq.fdseq\" Type=\"http://schemas.microsoft.com/xps/2005/06/fixed-document-sequence\" Id=\"R0\"/>"
    ).unwrap();

    // Additional relationships from document
    for (i, rel) in doc.relationships.iter().enumerate() {
        writeln!(
            xml,
            "  <Relationship Target=\"{}\" Type=\"{}\" Id=\"R{}\"/>",
            escape_xml(&rel.target),
            escape_xml(&rel.rel_type),
            i + 1
        )
        .unwrap();
    }

    xml.push_str("</Relationships>");
    xml
}

// ---------------------------------------------------------------------------
// FixedDocSeq.fdseq
// ---------------------------------------------------------------------------

fn build_fixed_doc_seq(doc: &XpsDocument) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <FixedDocumentSequence xmlns=\"http://schemas.microsoft.com/xps/2005/06\">\n",
    );

    if doc.page_count > 0 {
        writeln!(
            xml,
            "  <DocumentReference Source=\"/Documents/1/FixedDocument.fdoc\"/>"
        )
        .unwrap();
    }

    xml.push_str("</FixedDocumentSequence>");
    xml
}

// ---------------------------------------------------------------------------
// FixedDocument.fdoc
// ---------------------------------------------------------------------------

fn build_fixed_document(doc: &XpsDocument) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <FixedDocument xmlns=\"http://schemas.microsoft.com/xps/2005/06\">\n",
    );

    for page in &doc.pages {
        writeln!(
            xml,
            "  <PageContent Source=\"/Documents/1/Pages/{}.fpage\"/>",
            page.index + 1
        )
        .unwrap();
    }

    xml.push_str("</FixedDocument>");
    xml
}

// ---------------------------------------------------------------------------
// FixedDocument.fdoc.rels
// ---------------------------------------------------------------------------

fn build_fixed_document_rels(doc: &XpsDocument) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n",
    );

    for (i, page) in doc.pages.iter().enumerate() {
        writeln!(
            xml,
            "  <Relationship Target=\"/Documents/1/Pages/{}.fpage\" Type=\"http://schemas.microsoft.com/xps/2005/06/fixed-page\" Id=\"PageRel{}\"/>",
            page.index + 1,
            i
        ).unwrap();
    }

    xml.push_str("</Relationships>");
    xml
}

// ---------------------------------------------------------------------------
// FixedPage (.fpage)
// ---------------------------------------------------------------------------

fn build_fixed_page(page: &XpsPage) -> String {
    let mut xml = String::new();
    writeln!(
        xml,
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <FixedPage Width=\"{}\" Height=\"{}\" xmlns=\"http://schemas.microsoft.com/xps/2005/06\" xml:lang=\"en-US\">",
        page.width,
        page.height
    ).unwrap();

    // Glyphs
    for glyph in &page.content.glyphs {
        write!(
            xml,
            "  <Glyphs UnicodeString=\"{}\" FontUri=\"{}\" FontRenderingEmSize=\"{}\" OriginX=\"{}\" OriginY=\"{}\"",
            escape_xml(&glyph.text),
            escape_xml(&glyph.font_uri),
            glyph.font_size,
            glyph.origin_x,
            glyph.origin_y
        ).unwrap();
        if let Some(ref fill) = glyph.fill {
            write!(xml, " Fill=\"{}\"", escape_xml(fill)).unwrap();
        }
        if glyph.is_unicode {
            write!(xml, " IsUnicode=\"true\"").unwrap();
        }
        writeln!(xml, "/>").unwrap();
    }

    // Paths
    for path in &page.content.paths {
        write!(xml, "  <Path").unwrap();
        if let Some(ref data) = path.data {
            write!(xml, " Data=\"{}\"", escape_xml(data)).unwrap();
        }
        if let Some(ref fill) = path.fill {
            write!(xml, " Fill=\"{}\"", escape_xml(fill)).unwrap();
        }
        if let Some(ref stroke) = path.stroke {
            write!(xml, " Stroke=\"{}\"", escape_xml(stroke)).unwrap();
        }
        if let Some(ref transform) = path.transform {
            write!(xml, " RenderTransform=\"{}\"", escape_xml(transform)).unwrap();
        }
        writeln!(xml, "/>").unwrap();
    }

    xml.push_str("</FixedPage>");
    xml
}

// ---------------------------------------------------------------------------
// Core metadata
// ---------------------------------------------------------------------------

fn build_core_metadata(meta: &XpsMetadata) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <coreProperties xmlns=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\"\n\
         xmlns:dc=\"http://purl.org/dc/elements/1.1/\"\n\
         xmlns:dcterms=\"http://purl.org/dc/terms/\">\n",
    );

    if let Some(ref title) = meta.title {
        writeln!(xml, "  <dc:title>{}</dc:title>", escape_xml(title)).unwrap();
    }
    if let Some(ref author) = meta.author {
        writeln!(xml, "  <dc:creator>{}</dc:creator>", escape_xml(author)).unwrap();
    }
    if let Some(ref subject) = meta.subject {
        writeln!(xml, "  <dc:subject>{}</dc:subject>", escape_xml(subject)).unwrap();
    }
    if let Some(ref keywords) = meta.keywords {
        writeln!(xml, "  <dc:subject>{}</dc:subject>", escape_xml(keywords)).unwrap();
    }
    if let Some(ref created) = meta.created {
        writeln!(
            xml,
            "  <dcterms:created>{}</dcterms:created>",
            escape_xml(created)
        )
        .unwrap();
    }
    if let Some(ref modified) = meta.modified {
        writeln!(
            xml,
            "  <dcterms:modified>{}</dcterms:modified>",
            escape_xml(modified)
        )
        .unwrap();
    }

    xml.push_str("</coreProperties>");
    xml
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read as _;
    use zip::ZipArchive;

    fn make_minimal_doc() -> XpsDocument {
        XpsDocument {
            page_count: 1,
            pages: vec![XpsPage {
                index: 0,
                width: 816.0,
                height: 1056.0,
                content: XpsPageContent {
                    glyphs: vec![],
                    paths: vec![],
                },
            }],
            fonts: vec![],
            images: vec![],
            relationships: vec![],
            metadata: XpsMetadata::default(),
        }
    }

    fn make_doc_with_glyphs() -> XpsDocument {
        XpsDocument {
            page_count: 1,
            pages: vec![XpsPage {
                index: 0,
                width: 612.0,
                height: 792.0,
                content: XpsPageContent {
                    glyphs: vec![XpsGlyphs {
                        text: "Hello World".to_string(),
                        font_uri: "/Documents/1/Resources/Fonts/Arial.ttf".to_string(),
                        font_size: 24.0,
                        origin_x: 72.0,
                        origin_y: 120.0,
                        fill: Some("#FF000000".to_string()),
                        is_unicode: true,
                    }],
                    paths: vec![],
                },
            }],
            fonts: vec![],
            images: vec![],
            relationships: vec![],
            metadata: XpsMetadata::default(),
        }
    }

    fn zip_entry_names(data: &[u8]) -> Vec<String> {
        let cursor = std::io::Cursor::new(data);
        let mut archive = ZipArchive::new(cursor).unwrap();
        (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect()
    }

    fn zip_read(data: &[u8], name: &str) -> String {
        let cursor = std::io::Cursor::new(data);
        let mut archive = ZipArchive::new(cursor).unwrap();
        let mut file = archive.by_name(name).unwrap();
        let mut s = String::new();
        file.read_to_string(&mut s).unwrap();
        s
    }

    fn zip_read_bytes(data: &[u8], name: &str) -> Vec<u8> {
        let cursor = std::io::Cursor::new(data);
        let mut archive = ZipArchive::new(cursor).unwrap();
        let mut file = archive.by_name(name).unwrap();
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).unwrap();
        buf
    }

    // --- 1. Minimal document produces valid ZIP ---
    #[test]
    fn test_serialize_minimal_document() {
        let doc = make_minimal_doc();
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|x| x == "[Content_Types].xml"));
        assert!(names.iter().any(|x| x == "_rels/.rels"));
        assert!(names.iter().any(|x| x == "Documents/1/Pages/1.fpage"));
        assert!(names.iter().any(|x| x == "Documents/1/FixedDocSeq.fdseq"));
        assert!(names.iter().any(|x| x == "Documents/1/FixedDocument.fdoc"));
    }

    // --- 2. Content types are valid ---
    #[test]
    fn test_content_types_valid() {
        let doc = make_minimal_doc();
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let ct = zip_read(&bytes, "[Content_Types].xml");
        assert!(ct.contains("application/vnd.ms-package.xps-fixedpage+xml"));
        assert!(ct.contains("application/vnd.ms-package.xps-fixeddocumentsequence+xml"));
        assert!(ct.contains("application/vnd.ms-package.xps-fixeddocument+xml"));
        assert!(ct.contains("<Types"));
        assert!(ct.contains("</Types>"));
    }

    // --- 3. Relationships are valid ---
    #[test]
    fn test_rels_valid() {
        let doc = make_minimal_doc();
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let rels = zip_read(&bytes, "_rels/.rels");
        assert!(rels.contains("FixedDocSeq.fdseq"));
        assert!(rels.contains("http://schemas.microsoft.com/xps/2005/06/fixed-document-sequence"));
        assert!(rels.contains("<Relationships"));
        assert!(rels.contains("</Relationships>"));
    }

    // --- 4. Page content with glyphs ---
    #[test]
    fn test_serialize_page_with_glyphs() {
        let doc = make_doc_with_glyphs();
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let page = zip_read(&bytes, "Documents/1/Pages/1.fpage");
        assert!(page.contains("Hello World"));
        assert!(page.contains("FontUri=\"/Documents/1/Resources/Fonts/Arial.ttf\""));
        assert!(page.contains("FontRenderingEmSize=\"24\""));
        assert!(page.contains("OriginX=\"72\""));
        assert!(page.contains("OriginY=\"120\""));
        assert!(page.contains("Fill=\"#FF000000\""));
        assert!(page.contains("IsUnicode=\"true\""));
        assert!(page.contains("<FixedPage"));
    }

    // --- 5. Page content with paths ---
    #[test]
    fn test_serialize_page_with_paths() {
        let doc = XpsDocument {
            page_count: 1,
            pages: vec![XpsPage {
                index: 0,
                width: 612.0,
                height: 792.0,
                content: XpsPageContent {
                    glyphs: vec![],
                    paths: vec![XpsPath {
                        data: Some("M 0,0 L 100,100 L 100,0 Z".to_string()),
                        fill: Some("#FF0000FF".to_string()),
                        stroke: Some("#FF000000".to_string()),
                        transform: None,
                    }],
                },
            }],
            fonts: vec![],
            images: vec![],
            relationships: vec![],
            metadata: XpsMetadata::default(),
        };
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let page = zip_read(&bytes, "Documents/1/Pages/1.fpage");
        assert!(page.contains("<Path"));
        assert!(page.contains("Data=\"M 0,0 L 100,100 L 100,0 Z\""));
        assert!(page.contains("Fill=\"#FF0000FF\""));
        assert!(page.contains("Stroke=\"#FF000000\""));
    }

    // --- 6. Multiple pages ---
    #[test]
    fn test_serialize_multiple_pages() {
        let doc = XpsDocument {
            page_count: 3,
            pages: vec![
                XpsPage {
                    index: 0,
                    width: 612.0,
                    height: 792.0,
                    content: XpsPageContent {
                        glyphs: vec![XpsGlyphs {
                            text: "Page 1".to_string(),
                            font_uri: "/Fonts/A.ttf".to_string(),
                            font_size: 12.0,
                            origin_x: 50.0,
                            origin_y: 50.0,
                            fill: None,
                            is_unicode: true,
                        }],
                        paths: vec![],
                    },
                },
                XpsPage {
                    index: 1,
                    width: 612.0,
                    height: 792.0,
                    content: XpsPageContent {
                        glyphs: vec![],
                        paths: vec![],
                    },
                },
                XpsPage {
                    index: 2,
                    width: 612.0,
                    height: 792.0,
                    content: XpsPageContent {
                        glyphs: vec![XpsGlyphs {
                            text: "Page 3".to_string(),
                            font_uri: "/Fonts/A.ttf".to_string(),
                            font_size: 12.0,
                            origin_x: 50.0,
                            origin_y: 50.0,
                            fill: None,
                            is_unicode: true,
                        }],
                        paths: vec![],
                    },
                },
            ],
            fonts: vec![],
            images: vec![],
            relationships: vec![],
            metadata: XpsMetadata::default(),
        };
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|x| x == "Documents/1/Pages/1.fpage"));
        assert!(names.iter().any(|x| x == "Documents/1/Pages/2.fpage"));
        assert!(names.iter().any(|x| x == "Documents/1/Pages/3.fpage"));

        let fdoc = zip_read(&bytes, "Documents/1/FixedDocument.fdoc");
        assert!(fdoc.contains("1.fpage"));
        assert!(fdoc.contains("2.fpage"));
        assert!(fdoc.contains("3.fpage"));
    }

    // --- 7. Font resources ---
    #[test]
    fn test_serialize_font_resources() {
        let font_data = b"FAKE_FONT_DATA";
        let doc = XpsDocument {
            page_count: 1,
            pages: vec![XpsPage {
                index: 0,
                width: 612.0,
                height: 792.0,
                content: XpsPageContent {
                    glyphs: vec![],
                    paths: vec![],
                },
            }],
            fonts: vec![XpsResource {
                uri: "/Documents/1/Resources/Fonts/Arial.ttf".to_string(),
                content_type: Some("application/vnd.ms-package.obfuscated-opentype".to_string()),
                data: font_data.to_vec(),
            }],
            images: vec![],
            relationships: vec![],
            metadata: XpsMetadata::default(),
        };
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let extracted = zip_read_bytes(&bytes, "Documents/1/Resources/Fonts/Arial.ttf");
        assert_eq!(extracted, font_data);

        let ct = zip_read(&bytes, "[Content_Types].xml");
        assert!(ct.contains("application/vnd.ms-package.obfuscated-opentype"));
    }

    // --- 8. Image resources ---
    #[test]
    fn test_serialize_image_resources() {
        let img_data = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]; // fake PNG header
        let doc = XpsDocument {
            page_count: 1,
            pages: vec![XpsPage {
                index: 0,
                width: 612.0,
                height: 792.0,
                content: XpsPageContent {
                    glyphs: vec![],
                    paths: vec![],
                },
            }],
            fonts: vec![],
            images: vec![XpsResource {
                uri: "/Documents/1/Resources/Images/photo.png".to_string(),
                content_type: Some("image/png".to_string()),
                data: img_data.clone(),
            }],
            relationships: vec![],
            metadata: XpsMetadata::default(),
        };
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let extracted = zip_read_bytes(&bytes, "Documents/1/Resources/Images/photo.png");
        assert_eq!(extracted, img_data);
    }

    // --- 9. Core metadata ---
    #[test]
    fn test_serialize_core_metadata() {
        let doc = XpsDocument {
            page_count: 0,
            pages: vec![],
            fonts: vec![],
            images: vec![],
            relationships: vec![],
            metadata: XpsMetadata {
                title: Some("Test Document".to_string()),
                author: Some("Test Author".to_string()),
                subject: Some("XPS Serialization".to_string()),
                keywords: Some("test, xps".to_string()),
                created: Some("2025-01-01T00:00:00Z".to_string()),
                modified: Some("2025-06-15T12:00:00Z".to_string()),
            },
        };
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|x| x == "Documents/1/Metadata/Core.xml"));

        let core = zip_read(&bytes, "Documents/1/Metadata/Core.xml");
        assert!(core.contains("<dc:title>Test Document</dc:title>"));
        assert!(core.contains("<dc:creator>Test Author</dc:creator>"));
        assert!(core.contains("<dc:subject>XPS Serialization</dc:subject>"));
        assert!(core.contains("<dcterms:created>2025-01-01T00:00:00Z</dcterms:created>"));
        assert!(core.contains("<dcterms:modified>2025-06-15T12:00:00Z</dcterms:modified>"));
    }

    // --- 10. No metadata file when metadata is empty ---
    #[test]
    fn test_no_metadata_when_empty() {
        let doc = make_minimal_doc();
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(!names.iter().any(|n| n.contains("Metadata")));
    }

    // --- 11. Empty document (no pages) ---
    #[test]
    fn test_serialize_empty_document() {
        let doc = XpsDocument {
            page_count: 0,
            pages: vec![],
            fonts: vec![],
            images: vec![],
            relationships: vec![],
            metadata: XpsMetadata::default(),
        };
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|x| x == "[Content_Types].xml"));
        assert!(names.iter().any(|x| x == "_rels/.rels"));
    }

    // --- 12. Additional relationships ---
    #[test]
    fn test_serialize_relationships() {
        let doc = XpsDocument {
            page_count: 1,
            pages: vec![XpsPage {
                index: 0,
                width: 612.0,
                height: 792.0,
                content: XpsPageContent {
                    glyphs: vec![],
                    paths: vec![],
                },
            }],
            fonts: vec![],
            images: vec![],
            relationships: vec![XpsRelationship {
                target: "/Documents/1/Structure/DocStructure.struct".to_string(),
                rel_type: "http://schemas.microsoft.com/xps/2005/06/document-structure".to_string(),
            }],
            metadata: XpsMetadata::default(),
        };
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let rels = zip_read(&bytes, "_rels/.rels");
        assert!(rels.contains("DocStructure.struct"));
        assert!(rels.contains("document-structure"));
    }

    // --- 13. Roundtrip: serialize → parse ---
    #[test]
    fn test_roundtrip_serialize_parse() {
        let doc = make_doc_with_glyphs();
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        // Verify it's a valid XPS file
        assert!(crate::is_xps_file(&bytes));

        // Parse back
        let parser = crate::parser::XpsParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.page_count, 1);
        assert_eq!(parsed.pages.len(), 1);
        assert_eq!(parsed.pages[0].content.glyphs.len(), 1);
        assert_eq!(parsed.pages[0].content.glyphs[0].text, "Hello World");
    }

    // --- 14. XML escaping ---
    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("<>&\"'"), "&lt;&gt;&amp;&quot;&apos;");
        assert_eq!(escape_xml("normal text"), "normal text");
        assert_eq!(escape_xml(""), "");
        assert_eq!(escape_xml("a<b"), "a&lt;b");
    }

    // --- 15. Path with transform ---
    #[test]
    fn test_serialize_path_with_transform() {
        let doc = XpsDocument {
            page_count: 1,
            pages: vec![XpsPage {
                index: 0,
                width: 612.0,
                height: 792.0,
                content: XpsPageContent {
                    glyphs: vec![],
                    paths: vec![XpsPath {
                        data: Some("M 0,0 L 50,50".to_string()),
                        fill: None,
                        stroke: Some("#FF000000".to_string()),
                        transform: Some("1.5,0,0,1.5,10,20".to_string()),
                    }],
                },
            }],
            fonts: vec![],
            images: vec![],
            relationships: vec![],
            metadata: XpsMetadata::default(),
        };
        let bytes = XpsSerializer::new().serialize(&doc).unwrap();

        let page = zip_read(&bytes, "Documents/1/Pages/1.fpage");
        assert!(page.contains("RenderTransform=\"1.5,0,0,1.5,10,20\""));
        assert!(page.contains("Stroke=\"#FF000000\""));
    }
}
