//! OFD serializer — writes an [`OfdDocument`] to a valid OFD ZIP file.

use std::fmt::Write;

use zip::CompressionMethod;

use wo_office_utils::ArchiveWriter;

use crate::model::*;

/// Serializes an [`OfdDocument`] into OFD bytes (ZIP archive).
pub struct OfdSerializer;

impl OfdSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize the document to OFD bytes.
    pub fn serialize(&self, doc: &OfdDocument) -> Result<Vec<u8>, anyhow::Error> {
        let mut writer = ArchiveWriter::new()?;

        // 1. OFD.xml — root document descriptor
        let ofd_xml = build_ofd_xml(doc);
        writer.add_file_with_compression(
            "OFD.xml",
            ofd_xml.as_bytes(),
            CompressionMethod::Stored,
        )?;

        // 2. Doc_0/Document.xml — document descriptor
        let doc_xml = build_document_xml(doc);
        writer.add_file("Doc_0/Document.xml", doc_xml.as_bytes())?;

        // 3. Page files
        for (i, page) in doc.pages.iter().enumerate() {
            let page_xml = build_page_xml(page);
            let path = format!("Doc_0/Pages/Page_{}.xml", i);
            writer.add_file(&path, page_xml.as_bytes())?;
        }

        let bytes = writer.finish()?;
        Ok(bytes)
    }
}

impl Default for OfdSerializer {
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
// OFD.xml
// ---------------------------------------------------------------------------

fn build_ofd_xml(doc: &OfdDocument) -> String {
    let version = doc.version.as_deref().unwrap_or("1.0");

    let mut xml = String::new();
    writeln!(xml, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>").unwrap();
    writeln!(xml, "<OFD Version=\"{}\">", escape_xml(version)).unwrap();

    if let Some(ref body) = doc.doc_body {
        writeln!(xml, "  <DocBody>").unwrap();
        if let Some(ref title) = body.title {
            writeln!(xml, "    <Title>{}</Title>", escape_xml(title)).unwrap();
        }
        if let Some(ref author) = body.author {
            writeln!(xml, "    <Author>{}</Author>", escape_xml(author)).unwrap();
        }
        if let Some(ref doc_root) = body.doc_root {
            writeln!(xml, "    <DocRoot FileLoc=\"{}\"/>", escape_xml(doc_root)).unwrap();
        } else {
            writeln!(xml, "    <DocRoot FileLoc=\"Doc_0/Document.xml\"/>").unwrap();
        }
        if let Some(ref doc_id) = body.doc_id {
            writeln!(xml, "    <DocID>{}</DocID>", escape_xml(doc_id)).unwrap();
        }
        if let Some(ref created) = body.creation_date {
            writeln!(
                xml,
                "    <CreationDate>{}</CreationDate>",
                escape_xml(created)
            )
            .unwrap();
        }
        if let Some(ref mod_date) = body.mod_date {
            writeln!(xml, "    <ModDate>{}</ModDate>", escape_xml(mod_date)).unwrap();
        }
        writeln!(xml, "  </DocBody>").unwrap();
    } else {
        // Default minimal DocBody
        writeln!(xml, "  <DocBody>").unwrap();
        writeln!(xml, "    <DocRoot FileLoc=\"Doc_0/Document.xml\"/>").unwrap();
        writeln!(xml, "  </DocBody>").unwrap();
    }

    writeln!(xml, "</OFD>").unwrap();
    xml
}

// ---------------------------------------------------------------------------
// Document.xml
// ---------------------------------------------------------------------------

fn build_document_xml(doc: &OfdDocument) -> String {
    let mut xml = String::new();
    writeln!(xml, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>").unwrap();
    writeln!(xml, "<Document>").unwrap();

    // CommonData
    writeln!(xml, "  <CommonData>").unwrap();
    writeln!(xml, "    <MaxUnitID>{}</MaxUnitID>", doc.page_count * 100).unwrap();
    if let Some(first_page) = doc.pages.first() {
        writeln!(
            xml,
            "    <PageArea><PhysicalBox>0 0 {} {}</PhysicalBox></PageArea>",
            first_page.width, first_page.height
        )
        .unwrap();
    } else {
        writeln!(
            xml,
            "    <PageArea><PhysicalBox>0 0 210 297</PhysicalBox></PageArea>"
        )
        .unwrap();
    }
    writeln!(xml, "  </CommonData>").unwrap();

    // Pages
    writeln!(xml, "  <Pages>").unwrap();
    for (i, page) in doc.pages.iter().enumerate() {
        let page_id_default = format!("{}", i + 1);
        let page_id = page.id.as_deref().unwrap_or(&page_id_default);
        let base_loc_default = format!("Pages/Page_{}.xml", i);
        let base_loc = page.base_loc.as_deref().unwrap_or(&base_loc_default);
        writeln!(
            xml,
            "    <Page ID=\"{}\" BaseLoc=\"{}\"/>",
            escape_xml(page_id),
            escape_xml(base_loc)
        )
        .unwrap();
    }
    writeln!(xml, "  </Pages>").unwrap();

    // DocInfo
    if let Some(ref body) = doc.doc_body {
        if body.title.is_some()
            || body.author.is_some()
            || body.doc_id.is_some()
            || body.creation_date.is_some()
            || body.mod_date.is_some()
        {
            writeln!(xml, "  <DocInfo>").unwrap();
            if let Some(ref id) = body.doc_id {
                writeln!(xml, "    <DocID>{}</DocID>", escape_xml(id)).unwrap();
            }
            if let Some(ref title) = body.title {
                writeln!(xml, "    <Title>{}</Title>", escape_xml(title)).unwrap();
            }
            if let Some(ref author) = body.author {
                writeln!(xml, "    <Author>{}</Author>", escape_xml(author)).unwrap();
            }
            if let Some(ref created) = body.creation_date {
                writeln!(
                    xml,
                    "    <CreationDate>{}</CreationDate>",
                    escape_xml(created)
                )
                .unwrap();
            }
            if let Some(ref mod_date) = body.mod_date {
                writeln!(xml, "    <ModDate>{}</ModDate>", escape_xml(mod_date)).unwrap();
            }
            writeln!(xml, "  </DocInfo>").unwrap();
        }
    }

    writeln!(xml, "</Document>").unwrap();
    xml
}

// ---------------------------------------------------------------------------
// Page XML
// ---------------------------------------------------------------------------

fn build_page_xml(page: &OfdPage) -> String {
    let mut xml = String::new();
    let page_id = page.id.as_deref().unwrap_or("1");

    writeln!(xml, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>").unwrap();
    writeln!(xml, "<Page ID=\"{}\">", escape_xml(page_id)).unwrap();

    // Content
    if !page.text_content.is_empty() || !page.image_refs.is_empty() {
        writeln!(xml, "  <Content>").unwrap();
        writeln!(xml, "    <Layer>").unwrap();

        // Text objects
        for text_obj in &page.text_content {
            write!(xml, "      <TextObject").unwrap();
            if let Some(boundary) = text_obj.boundary {
                write!(
                    xml,
                    " Boundary=\"{} {} {} {}\"",
                    boundary.0, boundary.1, boundary.2, boundary.3
                )
                .unwrap();
            }
            if let Some(ref font_id) = text_obj.font_id {
                write!(xml, " Font=\"{}\"", escape_xml(font_id)).unwrap();
            }
            if let Some(size) = text_obj.font_size {
                write!(xml, " Size=\"{}\"", size).unwrap();
            }
            if text_obj.bold {
                write!(xml, " Bold=\"true\"").unwrap();
            }
            if text_obj.italic {
                write!(xml, " Italic=\"true\"").unwrap();
            }
            writeln!(xml, ">").unwrap();
            writeln!(
                xml,
                "        <TextCode>{}</TextCode>",
                escape_xml(&text_obj.text)
            )
            .unwrap();
            writeln!(xml, "      </TextObject>").unwrap();
        }

        // Image objects
        for img_obj in &page.image_refs {
            write!(xml, "      <ImageObject").unwrap();
            if let Some(boundary) = img_obj.boundary {
                write!(
                    xml,
                    " Boundary=\"{} {} {} {}\"",
                    boundary.0, boundary.1, boundary.2, boundary.3
                )
                .unwrap();
            }
            if let Some(ref resource_id) = img_obj.resource_id {
                write!(xml, " ResourceID=\"{}\"", escape_xml(resource_id)).unwrap();
            }
            if let Some(ref format) = img_obj.format {
                write!(xml, " Format=\"{}\"", escape_xml(format)).unwrap();
            }
            writeln!(xml, "/>").unwrap();
        }

        writeln!(xml, "    </Layer>").unwrap();
        writeln!(xml, "  </Content>").unwrap();
    }

    // PageArea
    writeln!(xml, "  <PageArea>").unwrap();
    writeln!(
        xml,
        "    <PhysicalBox>0 0 {} {}</PhysicalBox>",
        page.width, page.height
    )
    .unwrap();
    writeln!(xml, "  </PageArea>").unwrap();

    writeln!(xml, "</Page>").unwrap();
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

    fn make_minimal_doc() -> OfdDocument {
        OfdDocument {
            version: Some("1.0".to_string()),
            doc_body: Some(OfdDocBody {
                doc_id: Some("test-001".to_string()),
                title: Some("Test Document".to_string()),
                author: Some("World Office".to_string()),
                creation_date: Some("2026-01-01".to_string()),
                mod_date: Some("2026-01-01".to_string()),
                doc_root: Some("Doc_0/Document.xml".to_string()),
            }),
            page_count: 1,
            pages: vec![OfdPage {
                id: Some("1".to_string()),
                index: 0,
                width: 210.0,
                height: 297.0,
                base_loc: Some("Pages/Page_0.xml".to_string()),
                text_content: vec![],
                image_refs: vec![],
            }],
            resources: vec![],
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

    fn zip_is_stored(data: &[u8], name: &str) -> bool {
        let cursor = std::io::Cursor::new(data);
        let mut archive = ZipArchive::new(cursor).unwrap();
        let file = archive.by_name(name).unwrap();
        file.compression() == CompressionMethod::Stored
    }

    // --- 1. Minimal document produces valid ZIP ---
    #[test]
    fn test_serialize_minimal_document() {
        let doc = make_minimal_doc();
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|x| x == "OFD.xml"));
        assert!(names.iter().any(|x| x == "Doc_0/Document.xml"));
        assert!(names.iter().any(|x| x == "Doc_0/Pages/Page_0.xml"));
    }

    // --- 2. OFD.xml is first and uncompressed ---
    #[test]
    fn test_ofd_xml_first_uncompressed() {
        let doc = make_minimal_doc();
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert_eq!(names[0], "OFD.xml");
        assert!(zip_is_stored(&bytes, "OFD.xml"));
    }

    // --- 3. OFD.xml contains version ---
    #[test]
    fn test_ofd_xml_version() {
        let doc = make_minimal_doc();
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let ofd = zip_read(&bytes, "OFD.xml");
        assert!(ofd.contains("Version=\"1.0\""));
        assert!(ofd.contains("<OFD"));
        assert!(ofd.contains("</OFD>"));
    }

    // --- 4. OFD.xml with DocBody metadata ---
    #[test]
    fn test_ofd_xml_doc_body() {
        let doc = make_minimal_doc();
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let ofd = zip_read(&bytes, "OFD.xml");
        assert!(ofd.contains("<DocBody>"));
        assert!(ofd.contains("<Title>Test Document</Title>"));
        assert!(ofd.contains("<Author>World Office</Author>"));
        assert!(ofd.contains("<DocRoot FileLoc=\"Doc_0/Document.xml\"/>"));
        assert!(ofd.contains("<DocID>test-001</DocID>"));
    }

    // --- 5. Document.xml contains pages ---
    #[test]
    fn test_document_xml_pages() {
        let doc = make_minimal_doc();
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let doc_xml = zip_read(&bytes, "Doc_0/Document.xml");
        assert!(doc_xml.contains("<Document>"));
        assert!(doc_xml.contains("<Pages>"));
        assert!(doc_xml.contains("<Page ID=\"1\""));
        assert!(doc_xml.contains("</Pages>"));
        assert!(doc_xml.contains("</Document>"));
    }

    // --- 6. Document.xml contains DocInfo ---
    #[test]
    fn test_document_xml_doc_info() {
        let doc = make_minimal_doc();
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let doc_xml = zip_read(&bytes, "Doc_0/Document.xml");
        assert!(doc_xml.contains("<DocInfo>"));
        assert!(doc_xml.contains("<DocID>test-001</DocID>"));
        assert!(doc_xml.contains("<Title>Test Document</Title>"));
        assert!(doc_xml.contains("<Author>World Office</Author>"));
        assert!(doc_xml.contains("<CreationDate>2026-01-01</CreationDate>"));
        assert!(doc_xml.contains("<ModDate>2026-01-01</ModDate>"));
        assert!(doc_xml.contains("</DocInfo>"));
    }

    // --- 7. Page XML with text content ---
    #[test]
    fn test_page_xml_with_text() {
        let doc = OfdDocument {
            version: Some("1.0".to_string()),
            doc_body: None,
            page_count: 1,
            pages: vec![OfdPage {
                id: Some("1".to_string()),
                index: 0,
                width: 210.0,
                height: 297.0,
                base_loc: None,
                text_content: vec![OfdTextObject {
                    boundary: Some((30.0, 50.0, 150.0, 20.0)),
                    text: "Hello OFD".to_string(),
                    font_id: Some("1".to_string()),
                    font_size: Some(12.0),
                    bold: false,
                    italic: false,
                }],
                image_refs: vec![],
            }],
            resources: vec![],
        };
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let page = zip_read(&bytes, "Doc_0/Pages/Page_0.xml");
        assert!(page.contains("<TextObject"));
        assert!(page.contains("Boundary=\"30 50 150 20\""));
        assert!(page.contains("Font=\"1\""));
        assert!(page.contains("Size=\"12\""));
        assert!(page.contains("<TextCode>Hello OFD</TextCode>"));
        assert!(page.contains("<PhysicalBox>0 0 210 297</PhysicalBox>"));
    }

    // --- 8. Page XML with bold/italic text ---
    #[test]
    fn test_page_xml_with_formatted_text() {
        let doc = OfdDocument {
            version: Some("1.0".to_string()),
            doc_body: None,
            page_count: 1,
            pages: vec![OfdPage {
                id: Some("2".to_string()),
                index: 0,
                width: 210.0,
                height: 297.0,
                base_loc: None,
                text_content: vec![OfdTextObject {
                    boundary: Some((20.0, 30.0, 100.0, 15.0)),
                    text: "Bold Italic".to_string(),
                    font_id: Some("2".to_string()),
                    font_size: Some(14.0),
                    bold: true,
                    italic: true,
                }],
                image_refs: vec![],
            }],
            resources: vec![],
        };
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let page = zip_read(&bytes, "Doc_0/Pages/Page_0.xml");
        assert!(page.contains("Bold=\"true\""));
        assert!(page.contains("Italic=\"true\""));
        assert!(page.contains("Bold Italic"));
    }

    // --- 9. Page XML with image objects ---
    #[test]
    fn test_page_xml_with_images() {
        let doc = OfdDocument {
            version: Some("1.0".to_string()),
            doc_body: None,
            page_count: 1,
            pages: vec![OfdPage {
                id: Some("1".to_string()),
                index: 0,
                width: 210.0,
                height: 297.0,
                base_loc: None,
                text_content: vec![],
                image_refs: vec![OfdImageObject {
                    boundary: Some((10.0, 10.0, 100.0, 80.0)),
                    resource_id: Some("img1".to_string()),
                    format: Some("PNG".to_string()),
                    alt_text: Some("Test image".to_string()),
                }],
            }],
            resources: vec![],
        };
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let page = zip_read(&bytes, "Doc_0/Pages/Page_0.xml");
        assert!(page.contains("<ImageObject"));
        assert!(page.contains("Boundary=\"10 10 100 80\""));
        assert!(page.contains("ResourceID=\"img1\""));
        assert!(page.contains("Format=\"PNG\""));
    }

    // --- 10. Multiple pages ---
    #[test]
    fn test_serialize_multiple_pages() {
        let doc = OfdDocument {
            version: Some("1.0".to_string()),
            doc_body: None,
            page_count: 3,
            pages: vec![
                OfdPage {
                    id: Some("1".to_string()),
                    index: 0,
                    width: 210.0,
                    height: 297.0,
                    base_loc: None,
                    text_content: vec![OfdTextObject {
                        boundary: None,
                        text: "Page 1".to_string(),
                        font_id: None,
                        font_size: None,
                        bold: false,
                        italic: false,
                    }],
                    image_refs: vec![],
                },
                OfdPage {
                    id: Some("2".to_string()),
                    index: 1,
                    width: 210.0,
                    height: 297.0,
                    base_loc: None,
                    text_content: vec![],
                    image_refs: vec![],
                },
                OfdPage {
                    id: Some("3".to_string()),
                    index: 2,
                    width: 297.0,
                    height: 210.0,
                    base_loc: None,
                    text_content: vec![OfdTextObject {
                        boundary: None,
                        text: "Landscape Page".to_string(),
                        font_id: None,
                        font_size: None,
                        bold: false,
                        italic: false,
                    }],
                    image_refs: vec![],
                },
            ],
            resources: vec![],
        };
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|x| x == "Doc_0/Pages/Page_0.xml"));
        assert!(names.iter().any(|x| x == "Doc_0/Pages/Page_1.xml"));
        assert!(names.iter().any(|x| x == "Doc_0/Pages/Page_2.xml"));

        let doc_xml = zip_read(&bytes, "Doc_0/Document.xml");
        assert!(doc_xml.contains("Page ID=\"1\""));
        assert!(doc_xml.contains("Page ID=\"2\""));
        assert!(doc_xml.contains("Page ID=\"3\""));
    }

    // --- 11. Empty document (no pages, no doc_body) ---
    #[test]
    fn test_serialize_empty_document() {
        let doc = OfdDocument {
            version: None,
            doc_body: None,
            page_count: 0,
            pages: vec![],
            resources: vec![],
        };
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|x| x == "OFD.xml"));
        assert!(names.iter().any(|x| x == "Doc_0/Document.xml"));
    }

    // --- 12. Roundtrip: serialize → parse ---
    #[test]
    fn test_roundtrip_serialize_parse() {
        let doc = make_minimal_doc();
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        // Verify it's a valid OFD file
        assert!(crate::is_ofd_file(&bytes));

        // Parse back
        let parser = crate::parser::OfdParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.page_count, 1);
        assert_eq!(parsed.pages.len(), 1);
        assert_eq!(parsed.pages[0].width, 210.0);
        assert_eq!(parsed.pages[0].height, 297.0);
    }

    // --- 13. XML escaping ---
    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("<>&\"'"), "&lt;&gt;&amp;&quot;&apos;");
        assert_eq!(escape_xml("normal text"), "normal text");
        assert_eq!(escape_xml(""), "");
        assert_eq!(escape_xml("a<b"), "a&lt;b");
    }

    // --- 14. OFD.xml with default version ---
    #[test]
    fn test_default_version() {
        let doc = OfdDocument {
            version: None,
            doc_body: None,
            page_count: 0,
            pages: vec![],
            resources: vec![],
        };
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let ofd = zip_read(&bytes, "OFD.xml");
        assert!(ofd.contains("Version=\"1.0\""));
    }

    // --- 15. PageArea in page XML ---
    #[test]
    fn test_page_area() {
        let doc = OfdDocument {
            version: None,
            doc_body: None,
            page_count: 1,
            pages: vec![OfdPage {
                id: None,
                index: 0,
                width: 148.5,
                height: 210.0,
                base_loc: None,
                text_content: vec![],
                image_refs: vec![],
            }],
            resources: vec![],
        };
        let bytes = OfdSerializer::new().serialize(&doc).unwrap();

        let page = zip_read(&bytes, "Doc_0/Pages/Page_0.xml");
        assert!(page.contains("<PhysicalBox>0 0 148.5 210</PhysicalBox>"));
    }
}
