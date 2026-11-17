//! EPUB serializer — writes an [`EpubDocument`] to a valid EPUB 3.0 ZIP file.

use std::fmt::Write;

use zip::CompressionMethod;

use wo_office_utils::ArchiveWriter;

use crate::model::*;

/// Serializes an [`EpubDocument`] into EPUB bytes (ZIP archive).
pub struct EpubSerializer;

impl EpubSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize the document to EPUB 3.0 bytes.
    pub fn serialize(&self, doc: &EpubDocument) -> Result<Vec<u8>, anyhow::Error> {
        let mut writer = ArchiveWriter::new()?;

        // 1. mimetype — MUST be first entry, MUST be uncompressed (EPUB spec)
        writer.add_file_with_compression(
            "mimetype",
            b"application/epub+zip",
            CompressionMethod::Stored,
        )?;

        // 2. META-INF/container.xml
        let container_xml = build_container_xml();
        writer.add_file("META-INF/container.xml", container_xml.as_bytes())?;

        // 3. OEBPS/content.opf
        let opf_xml = build_opf_xml(doc);
        writer.add_file("OEBPS/content.opf", opf_xml.as_bytes())?;

        // 4. OEBPS/toc.xhtml — nav document (if toc entries exist)
        if !doc.toc.is_empty() {
            let nav_xml = build_nav_xml(&doc.toc);
            writer.add_file("OEBPS/toc.xhtml", nav_xml.as_bytes())?;
        }

        // 5. OEBPS/chapterN.xhtml — chapter content
        for chapter in &doc.chapters {
            let path = format!("OEBPS/{}", chapter.href);
            writer.add_file(&path, chapter.content.as_bytes())?;
        }

        // 6. Cover image if present
        if let (Some(image_data), Some(image_type)) = (&doc.cover_image, &doc.cover_image_type) {
            let ext = media_type_to_ext(image_type);
            let path = format!("OEBPS/images/cover{ext}");
            writer.add_file(&path, image_data.as_slice())?;
        }

        let bytes = writer.finish()?;
        Ok(bytes)
    }
}

impl Default for EpubSerializer {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

fn escape_xml(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn media_type_to_ext(media_type: &str) -> String {
    match media_type {
        "image/jpeg" => ".jpg".to_string(),
        "image/png" => ".png".to_string(),
        "image/gif" => ".gif".to_string(),
        "image/svg+xml" => ".svg".to_string(),
        "image/webp" => ".webp".to_string(),
        other => {
            // Try to extract extension from the media type
            if let Some(sub) = other.strip_prefix("image/") {
                format!(".{sub}")
            } else {
                ".jpg".to_string()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// container.xml
// ---------------------------------------------------------------------------

fn build_container_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#
        .to_string()
}

// ---------------------------------------------------------------------------
// content.opf
// ---------------------------------------------------------------------------

fn build_opf_xml(doc: &EpubDocument) -> String {
    let mut xml = String::new();

    let version = if doc.version.is_empty() {
        "3.0"
    } else {
        &doc.version
    };
    let uid = doc.metadata.unique_identifier.as_deref().unwrap_or("uid");

    writeln!(
        xml,
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <package xmlns=\"http://www.idpf.org/2007/opf\" version=\"{}\" unique-identifier=\"{}\">",
        version, uid
    )
    .unwrap();

    // Metadata
    xml.push_str("  <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n");

    if let Some(ref id) = doc.metadata.identifier {
        writeln!(
            xml,
            "    <dc:identifier id=\"{}\">{}</dc:identifier>",
            uid,
            escape_xml(id)
        )
        .unwrap();
    } else {
        writeln!(xml, "    <dc:identifier id=\"{}\"></dc:identifier>", uid).unwrap();
    }

    if let Some(ref title) = doc.metadata.title {
        writeln!(xml, "    <dc:title>{}</dc:title>", escape_xml(title)).unwrap();
    }

    for creator in &doc.metadata.creator {
        writeln!(xml, "    <dc:creator>{}</dc:creator>", escape_xml(creator)).unwrap();
    }

    if let Some(ref lang) = doc.metadata.language {
        writeln!(xml, "    <dc:language>{}</dc:language>", escape_xml(lang)).unwrap();
    }

    if let Some(ref publisher) = doc.metadata.publisher {
        writeln!(
            xml,
            "    <dc:publisher>{}</dc:publisher>",
            escape_xml(publisher)
        )
        .unwrap();
    }

    if let Some(ref date) = doc.metadata.date {
        writeln!(xml, "    <dc:date>{}</dc:date>", escape_xml(date)).unwrap();
    }

    if let Some(ref desc) = doc.metadata.description {
        writeln!(
            xml,
            "    <dc:description>{}</dc:description>",
            escape_xml(desc)
        )
        .unwrap();
    }

    for subject in &doc.metadata.subject {
        writeln!(xml, "    <dc:subject>{}</dc:subject>", escape_xml(subject)).unwrap();
    }

    if let Some(ref rights) = doc.metadata.rights {
        writeln!(xml, "    <dc:rights>{}</dc:rights>", escape_xml(rights)).unwrap();
    }

    xml.push_str("  </metadata>\n");

    // Manifest
    xml.push_str("  <manifest>\n");

    for chapter in &doc.chapters {
        let id = href_to_id(&chapter.href);
        writeln!(
            xml,
            "    <item id=\"{}\" href=\"{}\" media-type=\"application/xhtml+xml\"/>",
            escape_xml(&id),
            escape_xml(&chapter.href)
        )
        .unwrap();
    }

    // Nav item (if toc entries exist)
    if !doc.toc.is_empty() {
        writeln!(
            xml,
            "    <item id=\"nav\" href=\"toc.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>"
        )
        .unwrap();
    }

    // Cover image item
    if let (Some(_), Some(ref image_type)) = (&doc.cover_image, &doc.cover_image_type) {
        let ext = media_type_to_ext(image_type);
        writeln!(
            xml,
            "    <item id=\"cover-image\" href=\"images/cover{}\" media-type=\"{}\" properties=\"cover-image\"/>",
            ext, escape_xml(image_type)
        )
        .unwrap();
    }

    // Include any manifest items from the original document that aren't chapters
    for item in &doc.manifest {
        // Skip items we already generated (chapters, nav, cover-image)
        let id = &item.id;
        if doc.chapters.iter().any(|c| &href_to_id(&c.href) == id) {
            continue;
        }
        if id == "nav" || id == "cover-image" {
            continue;
        }
        let properties_attr = if item.properties.is_empty() {
            String::new()
        } else {
            format!(" properties=\"{}\"", item.properties.join(" "))
        };
        writeln!(
            xml,
            "    <item id=\"{}\" href=\"{}\" media-type=\"{}\"{}/>",
            escape_xml(&item.id),
            escape_xml(&item.href),
            escape_xml(&item.media_type),
            properties_attr
        )
        .unwrap();
    }

    xml.push_str("  </manifest>\n");

    // Spine
    xml.push_str("  <spine>\n");
    for idref in &doc.spine {
        writeln!(xml, "    <itemref idref=\"{}\"/>", escape_xml(idref)).unwrap();
    }
    // If spine is empty but chapters exist, generate spine from chapters
    if doc.spine.is_empty() {
        for chapter in &doc.chapters {
            let id = href_to_id(&chapter.href);
            writeln!(xml, "    <itemref idref=\"{}\"/>", escape_xml(&id)).unwrap();
        }
    }
    xml.push_str("  </spine>\n");

    xml.push_str("</package>");
    xml
}

/// Convert a href like "chapter1.xhtml" to an id like "chapter1".
fn href_to_id(href: &str) -> String {
    let name = href.rsplit('/').next().unwrap_or(href);
    name.strip_suffix(".xhtml")
        .or_else(|| name.strip_suffix(".html"))
        .or_else(|| name.strip_suffix(".htm"))
        .unwrap_or(name)
        .to_string()
}

// ---------------------------------------------------------------------------
// toc.xhtml (EPUB 3.0 nav document)
// ---------------------------------------------------------------------------

fn build_nav_xml(toc: &[TocEntry]) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">\n\
         <head><title>Table of Contents</title></head>\n\
         <body>\n\
         <nav epub:type=\"toc\">\n",
    );

    build_nav_ol(toc, &mut xml, 1);

    xml.push_str("  </nav>\n</body>\n</html>");
    xml
}

fn build_nav_ol(entries: &[TocEntry], xml: &mut String, level: u32) {
    let indent = "  ".repeat(level as usize);
    writeln!(xml, "{indent}<ol>").unwrap();

    for entry in entries {
        write!(xml, "{indent}  <li><a").unwrap();
        if let Some(ref href) = entry.href {
            write!(xml, " href=\"{}\"", escape_xml(href)).unwrap();
        }
        write!(xml, ">{}</a>", escape_xml(&entry.title)).unwrap();

        if !entry.children.is_empty() {
            writeln!(xml).unwrap();
            build_nav_ol(&entry.children, xml, level + 1);
            write!(xml, "{indent}  </li>").unwrap();
        } else {
            write!(xml, "</li>").unwrap();
        }
        writeln!(xml).unwrap();
    }

    writeln!(xml, "{indent}</ol>").unwrap();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::EpubParser;
    use std::io::Read as _;
    use zip::ZipArchive;

    fn make_chapter(title: &str, content: &str, href: &str) -> Chapter {
        Chapter {
            title: title.to_string(),
            content: content.to_string(),
            href: href.to_string(),
        }
    }

    fn minimal_doc() -> EpubDocument {
        EpubDocument {
            version: "3.0".to_string(),
            metadata: EpubMetadata {
                title: Some("Test Book".to_string()),
                creator: vec!["Test Author".to_string()],
                language: Some("en".to_string()),
                identifier: Some("urn:uuid:test-123".to_string()),
                publisher: None,
                date: None,
                description: None,
                subject: vec![],
                rights: None,
                unique_identifier: Some("uid".to_string()),
            },
            manifest: vec![],
            spine: vec!["chapter1".to_string()],
            toc: vec![],
            chapters: vec![make_chapter(
                "Chapter 1",
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
                 <html xmlns=\"http://www.w3.org/1999/xhtml\">\n\
                 <head><title>Chapter 1</title></head>\n\
                 <body><h1>Hello World</h1><p>Content here.</p></body>\n\
                 </html>",
                "chapter1.xhtml",
            )],
            cover_image: None,
            cover_image_type: None,
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

    fn zip_is_stored(data: &[u8], name: &str) -> bool {
        let cursor = std::io::Cursor::new(data);
        let mut archive = ZipArchive::new(cursor).unwrap();
        let file = archive.by_name(name).unwrap();
        file.compression() == CompressionMethod::Stored
    }

    // --- 1. Minimal EPUB ---
    #[test]
    fn test_serialize_minimal_epub() {
        let doc = minimal_doc();
        let bytes = EpubSerializer::new().serialize(&doc).unwrap();

        // Verify it parses back correctly
        let parser = EpubParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.version, "3.0");
        assert_eq!(parsed.metadata.title.as_deref(), Some("Test Book"));
        assert_eq!(parsed.metadata.creator, vec!["Test Author"]);
        assert_eq!(parsed.metadata.language.as_deref(), Some("en"));
        assert_eq!(parsed.chapters.len(), 1);
        assert_eq!(parsed.chapters[0].title, "Chapter 1");
        assert!(parsed.chapters[0].content.contains("Hello World"));
    }

    // --- 2. All metadata fields roundtrip ---
    #[test]
    fn test_serialize_epub_with_metadata() {
        let mut doc = minimal_doc();
        doc.metadata.title = Some("Advanced Metadata".to_string());
        doc.metadata.creator = vec!["Author One".to_string(), "Author Two".to_string()];
        doc.metadata.language = Some("fr".to_string());
        doc.metadata.identifier = Some("urn:uuid:meta-test".to_string());
        doc.metadata.publisher = Some("Test Publisher".to_string());
        doc.metadata.date = Some("2025-06-15".to_string());
        doc.metadata.description = Some("A test description".to_string());
        doc.metadata.subject = vec!["Fiction".to_string(), "Adventure".to_string()];
        doc.metadata.rights = Some("Public Domain".to_string());
        doc.metadata.unique_identifier = Some("uid".to_string());

        let bytes = EpubSerializer::new().serialize(&doc).unwrap();
        let parser = EpubParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.metadata.title.as_deref(), Some("Advanced Metadata"));
        assert_eq!(parsed.metadata.creator, vec!["Author One", "Author Two"]);
        assert_eq!(parsed.metadata.language.as_deref(), Some("fr"));
        assert_eq!(
            parsed.metadata.identifier.as_deref(),
            Some("urn:uuid:meta-test")
        );
        assert_eq!(parsed.metadata.publisher.as_deref(), Some("Test Publisher"));
        assert_eq!(parsed.metadata.date.as_deref(), Some("2025-06-15"));
        assert_eq!(
            parsed.metadata.description.as_deref(),
            Some("A test description")
        );
        assert_eq!(parsed.metadata.subject, vec!["Fiction", "Adventure"]);
        assert_eq!(parsed.metadata.rights.as_deref(), Some("Public Domain"));
    }

    // --- 3. Multiple chapters with spine order ---
    #[test]
    fn test_serialize_epub_multiple_chapters() {
        let doc = EpubDocument {
            version: "3.0".to_string(),
            metadata: EpubMetadata {
                title: Some("Multi Chapter".to_string()),
                creator: vec!["Author".to_string()],
                language: Some("en".to_string()),
                identifier: Some("multi-test".to_string()),
                unique_identifier: Some("uid".to_string()),
                ..Default::default()
            },
            manifest: vec![],
            spine: vec![
                "chapter1".to_string(),
                "chapter2".to_string(),
                "chapter3".to_string(),
            ],
            toc: vec![],
            chapters: vec![
                make_chapter(
                    "Ch1",
                    "<?xml version=\"1.0\"?><html xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>Ch1</title></head><body><p>One</p></body></html>",
                    "chapter1.xhtml",
                ),
                make_chapter(
                    "Ch2",
                    "<?xml version=\"1.0\"?><html xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>Ch2</title></head><body><p>Two</p></body></html>",
                    "chapter2.xhtml",
                ),
                make_chapter(
                    "Ch3",
                    "<?xml version=\"1.0\"?><html xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>Ch3</title></head><body><p>Three</p></body></html>",
                    "chapter3.xhtml",
                ),
            ],
            cover_image: None,
            cover_image_type: None,
        };

        let bytes = EpubSerializer::new().serialize(&doc).unwrap();
        let parser = EpubParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.chapters.len(), 3);
        assert_eq!(parsed.chapters[0].href, "chapter1.xhtml");
        assert_eq!(parsed.chapters[1].href, "chapter2.xhtml");
        assert_eq!(parsed.chapters[2].href, "chapter3.xhtml");
        assert_eq!(parsed.spine, vec!["chapter1", "chapter2", "chapter3"]);
    }

    // --- 4. TOC entries roundtrip ---
    #[test]
    fn test_serialize_epub_with_toc() {
        let mut doc = minimal_doc();
        doc.toc = vec![
            TocEntry {
                title: "Part 1".to_string(),
                href: Some("chapter1.xhtml".to_string()),
                level: 1,
                children: vec![TocEntry {
                    title: "Chapter 1".to_string(),
                    href: Some("chapter1.xhtml".to_string()),
                    level: 2,
                    children: vec![],
                    play_order: None,
                }],
                play_order: None,
            },
            TocEntry {
                title: "Part 2".to_string(),
                href: Some("chapter2.xhtml".to_string()),
                level: 1,
                children: vec![],
                play_order: None,
            },
        ];

        let bytes = EpubSerializer::new().serialize(&doc).unwrap();
        let parser = EpubParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.toc.len(), 2);
        assert_eq!(parsed.toc[0].title, "Part 1");
        assert_eq!(parsed.toc[0].level, 1);
        assert_eq!(parsed.toc[0].children.len(), 1);
        assert_eq!(parsed.toc[0].children[0].title, "Chapter 1");
        assert_eq!(parsed.toc[0].children[0].level, 2);
        assert_eq!(parsed.toc[1].title, "Part 2");
        assert_eq!(parsed.toc[1].href.as_deref(), Some("chapter2.xhtml"));
    }

    // --- 5. Cover image preserved ---
    #[test]
    fn test_serialize_epub_with_cover_image() {
        let mut doc = minimal_doc();
        let fake_jpeg: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xE0, b'J', b'F', b'I', b'F'];
        doc.cover_image = Some(fake_jpeg.clone());
        doc.cover_image_type = Some("image/jpeg".to_string());

        let bytes = EpubSerializer::new().serialize(&doc).unwrap();
        let parser = EpubParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert!(parsed.cover_image.is_some());
        assert_eq!(parsed.cover_image.unwrap(), fake_jpeg);
        assert_eq!(parsed.cover_image_type.as_deref(), Some("image/jpeg"));
    }

    // --- 6. mimetype is first ZIP entry and uncompressed ---
    #[test]
    fn test_serialize_epub_mimetype_first() {
        let doc = minimal_doc();
        let bytes = EpubSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert_eq!(names[0], "mimetype");

        assert!(zip_is_stored(&bytes, "mimetype"));

        let mt = zip_read(&bytes, "mimetype");
        assert_eq!(mt, "application/epub+zip");
    }

    // --- 7. Full roundtrip: serialize then parse ---
    #[test]
    fn test_serialize_roundtrip() {
        let mut doc = minimal_doc();
        doc.toc = vec![TocEntry {
            title: "Chapter 1".to_string(),
            href: Some("chapter1.xhtml".to_string()),
            level: 1,
            children: vec![],
            play_order: None,
        }];

        let bytes = EpubSerializer::new().serialize(&doc).unwrap();

        // Verify it's a valid EPUB file
        assert!(crate::is_epub_file(&bytes));

        // Parse back
        let parser = EpubParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.version, doc.version);
        assert_eq!(parsed.metadata.title, doc.metadata.title);
        assert_eq!(parsed.metadata.creator, doc.metadata.creator);
        assert_eq!(parsed.metadata.language, doc.metadata.language);
        assert_eq!(parsed.metadata.identifier, doc.metadata.identifier);
        assert_eq!(parsed.chapters.len(), doc.chapters.len());
        assert_eq!(parsed.chapters[0].title, doc.chapters[0].title);
        assert_eq!(parsed.chapters[0].content, doc.chapters[0].content);
        assert_eq!(parsed.chapters[0].href, doc.chapters[0].href);
        assert_eq!(parsed.toc.len(), doc.toc.len());
        assert_eq!(parsed.toc[0].title, doc.toc[0].title);
    }

    // --- 8. Empty chapters list ---
    #[test]
    fn test_serialize_empty_chapters() {
        let doc = EpubDocument {
            version: "3.0".to_string(),
            metadata: EpubMetadata {
                title: Some("Empty Book".to_string()),
                language: Some("en".to_string()),
                unique_identifier: Some("uid".to_string()),
                ..Default::default()
            },
            manifest: vec![],
            spine: vec![],
            toc: vec![],
            chapters: vec![],
            cover_image: None,
            cover_image_type: None,
        };

        let bytes = EpubSerializer::new().serialize(&doc).unwrap();

        // Verify valid ZIP
        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|x| x == "mimetype"));
        assert!(names.iter().any(|x| x == "META-INF/container.xml"));
        assert!(names.iter().any(|x| x == "OEBPS/content.opf"));

        // Verify mimetype is first
        assert_eq!(names[0], "mimetype");

        // Parse back
        let parser = EpubParser::new();
        let parsed = parser.parse(&bytes).unwrap();
        assert_eq!(parsed.chapters.len(), 0);
        assert_eq!(parsed.metadata.title.as_deref(), Some("Empty Book"));
    }

    // --- 9. XML escaping ---
    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("<>&\"'"), "&lt;&gt;&amp;&quot;&#39;");
        assert_eq!(escape_xml("normal text"), "normal text");
        assert_eq!(escape_xml(""), "");
        assert_eq!(escape_xml("a<b"), "a&lt;b");
    }

    // --- 10. Container XML content ---
    #[test]
    fn test_container_xml_content() {
        let doc = minimal_doc();
        let bytes = EpubSerializer::new().serialize(&doc).unwrap();

        let container = zip_read(&bytes, "META-INF/container.xml");
        assert!(container.contains("urn:oasis:names:tc:opendocument:xmlns:container"));
        assert!(container.contains("OEBPS/content.opf"));
        assert!(container.contains("application/oebps-package+xml"));
    }

    // --- 11. OPF contains required elements ---
    #[test]
    fn test_opf_structure() {
        let doc = minimal_doc();
        let bytes = EpubSerializer::new().serialize(&doc).unwrap();

        let opf = zip_read(&bytes, "OEBPS/content.opf");
        assert!(opf.contains("xmlns=\"http://www.idpf.org/2007/opf\""));
        assert!(opf.contains("version=\"3.0\""));
        assert!(opf.contains("unique-identifier=\"uid\""));
        assert!(opf.contains("<dc:identifier"));
        assert!(opf.contains("<dc:title>Test Book</dc:title>"));
        assert!(opf.contains("<dc:creator>Test Author</dc:creator>"));
        assert!(opf.contains("<dc:language>en</dc:language>"));
        assert!(opf.contains("<manifest>"));
        assert!(opf.contains("<spine>"));
        assert!(opf.contains("<itemref idref=\"chapter1\"/>"));
    }

    // --- 12. Cover image with PNG ---
    #[test]
    fn test_serialize_cover_image_png() {
        let mut doc = minimal_doc();
        let fake_png: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47];
        doc.cover_image = Some(fake_png.clone());
        doc.cover_image_type = Some("image/png".to_string());

        let bytes = EpubSerializer::new().serialize(&doc).unwrap();
        let names = zip_entry_names(&bytes);
        assert!(names.iter().any(|n| n == "OEBPS/images/cover.png"));

        let img_data = zip_read_bytes(&bytes, "OEBPS/images/cover.png");
        assert_eq!(img_data, fake_png);

        let parser = EpubParser::new();
        let parsed = parser.parse(&bytes).unwrap();
        assert_eq!(parsed.cover_image_type.as_deref(), Some("image/png"));
    }
}
