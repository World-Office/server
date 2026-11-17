//! FB2 format parser.
//!
//! Parses FB2 (FictionBook 2.0) XML files into the Fb2Document model
//! using roxmltree for XML parsing.

use roxmltree::Document as XmlDoc;

use wo_common::{CoreError, Document, DocumentMetadata, Result};

use crate::model::*;

/// Helper to get text content of a node (direct text + text from all descendants).
fn node_text(node: &roxmltree::Node) -> String {
    let mut result = String::new();
    for descendant in node.descendants() {
        if descendant.is_text() {
            if let Some(text) = descendant.text() {
                result.push_str(text);
            }
        }
    }
    result.trim().to_string()
}

/// Helper to get direct child text of a node (only immediate text, not descendants).
fn direct_text(node: &roxmltree::Node) -> String {
    node.children()
        .filter(|c| c.is_text())
        .filter_map(|c| c.text())
        .collect::<String>()
        .trim()
        .to_string()
}

/// Helper to find first child by tag name.
fn child<'a, 'input>(
    node: &roxmltree::Node<'a, 'input>,
    tag: &str,
) -> Option<roxmltree::Node<'a, 'input>> {
    node.children().find(|c| c.has_tag_name(tag))
}

/// Helper to iterate all children with a given tag name.
fn children_with_tag<'a, 'input>(
    node: &roxmltree::Node<'a, 'input>,
    tag: &str,
) -> Vec<roxmltree::Node<'a, 'input>> {
    node.children().filter(|c| c.has_tag_name(tag)).collect()
}

/// Helper to get an attribute value.
fn attr(node: &roxmltree::Node, name: &str) -> Option<String> {
    node.attribute(name).map(|s| s.to_string())
}

/// Helper to get an attribute value, stripping '#' prefix.
fn attr_href(node: &roxmltree::Node, name: &str) -> Option<String> {
    attr(node, name).map(|v| v.strip_prefix('#').unwrap_or(&v).to_string())
}

/// FB2 format parser.
pub struct Fb2Parser;

impl Fb2Parser {
    /// Create a new parser.
    pub fn new() -> Self {
        Self
    }

    /// Parse raw FB2 data (XML bytes) into an Fb2Document.
    pub fn parse(&self, data: &[u8]) -> Result<Fb2Document> {
        let text = std::str::from_utf8(data).map_err(|e| CoreError::Parse {
            format: "fb2".into(),
            message: format!("Invalid UTF-8: {}", e),
        })?;
        let xml = XmlDoc::parse(text).map_err(|e| CoreError::Parse {
            format: "fb2".into(),
            message: format!("XML parse error: {}", e),
        })?;

        let root = xml.root_element();
        let root_name = root.tag_name().name();

        if root_name != "FictionBook" && root_name != "fictionbook" {
            return Err(CoreError::Parse {
                format: "fb2".into(),
                message: format!("Root element is '{}', expected 'FictionBook'", root_name),
            });
        }

        let xmlns = root.attribute("xmlns").map(|s| s.to_string());

        let mut doc = Fb2Document {
            xmlns,
            title_info: None,
            src_title_info: None,
            document_info: None,
            publish_info: None,
            custom_info: Vec::new(),
            bodies: Vec::new(),
            binaries: Vec::new(),
        };

        // FB2 wraps metadata inside <description>.
        for child in root.children() {
            match child.tag_name().name() {
                "description" => {
                    for desc_child in child.children() {
                        match desc_child.tag_name().name() {
                            "title-info" => {
                                doc.title_info = Some(self.parse_title_info(&desc_child));
                            }
                            "src-title-info" => {
                                doc.src_title_info = Some(self.parse_title_info(&desc_child));
                            }
                            "document-info" => {
                                doc.document_info = Some(self.parse_document_info(&desc_child));
                            }
                            "publish-info" => {
                                doc.publish_info = Some(self.parse_publish_info(&desc_child));
                            }
                            _ => {}
                        }
                    }
                }
                "body" => doc.bodies.push(self.parse_body(&child)),
                "binary" => {
                    if let Some(bin) = self.parse_binary(&child) {
                        doc.binaries.push(bin);
                    }
                }
                "custom-info" => {
                    for ci in children_with_tag(&child, "custom-info") {
                        for item in children_with_tag(&ci, "info") {
                            let name = attr(&item, "name").unwrap_or_default();
                            let value = node_text(&item);
                            doc.custom_info.push((name, value));
                        }
                    }
                }
                _ => {}
            }
        }

        Ok(doc)
    }

    fn parse_title_info(&self, node: &roxmltree::Node) -> TitleInfo {
        let mut ti = TitleInfo::default();

        for g in children_with_tag(node, "genre") {
            ti.genres.push(node_text(&g));
        }

        for a in children_with_tag(node, "author") {
            ti.authors.push(self.parse_author(&a));
        }

        ti.book_title = child(node, "book-title").map(|n| node_text(&n));
        ti.keywords = child(node, "keywords").map(|n| node_text(&n));

        ti.lang = child(node, "lang").map(|n| node_text(&n));
        ti.src_lang = child(node, "src-lang").map(|n| node_text(&n));
        ti.date = child(node, "date").map(|n| node_text(&n));

        if let Some(n) = child(node, "annotation") {
            ti.annotation = Some(node_text(&n));
        }

        if let Some(n) = child(node, "coverpage") {
            for img in children_with_tag(&n, "image") {
                ti.coverpage.push(CoverPage {
                    image_refs: vec![ImageRef {
                        href: attr_href(&img, "href").or_else(|| attr_href(&img, "xlink:href")),
                        content_type: attr(&img, "content-type"),
                        alt: attr(&img, "alt"),
                    }],
                });
            }
        }

        for s in children_with_tag(node, "sequence") {
            ti.sequences.push(Sequence {
                name: node_text(&s),
                number: attr(&s, "number").and_then(|v| v.parse().ok()),
            });
        }

        // translators are inside title-info for translated works
        for a in children_with_tag(node, "translator") {
            ti.translators.push(self.parse_author(&a));
        }

        ti
    }

    fn parse_author(&self, node: &roxmltree::Node) -> Author {
        let mut author = Author {
            first_name: child(node, "first-name").map(|n| node_text(&n)),
            middle_name: child(node, "middle-name").map(|n| node_text(&n)),
            last_name: child(node, "last-name").map(|n| node_text(&n)),
            nickname: child(node, "nickname").map(|n| node_text(&n)),
            home_page: child(node, "home-page").map(|n| node_text(&n)),
            email: child(node, "email").map(|n| node_text(&n)),
            ..Default::default()
        };
        // If no structured fields, use direct text
        if author.first_name.is_none() && author.last_name.is_none() && author.nickname.is_none() {
            let text = direct_text(node);
            if !text.is_empty() {
                author.full_name = Some(text);
            }
        }
        author
    }

    fn parse_document_info(&self, node: &roxmltree::Node) -> DocumentInfo {
        let mut di = DocumentInfo {
            program_used: child(node, "program-used").map(|n| node_text(&n)),
            date: child(node, "date").map(|n| node_text(&n)),
            id: child(node, "id").map(|n| node_text(&n)),
            version: child(node, "version").map(|n| node_text(&n)),
            history: child(node, "history").map(|n| node_text(&n)),
            ..Default::default()
        };

        for a in children_with_tag(node, "author") {
            di.authors.push(self.parse_author(&a));
        }

        for url in children_with_tag(node, "src-url") {
            di.src_urls.push(node_text(&url));
        }

        di
    }

    fn parse_publish_info(&self, node: &roxmltree::Node) -> PublishInfo {
        PublishInfo {
            book_name: child(node, "book-name").map(|n| node_text(&n)),
            publisher: child(node, "publisher").map(|n| node_text(&n)),
            city: child(node, "city").map(|n| node_text(&n)),
            year: child(node, "year").map(|n| node_text(&n)),
            isbn: child(node, "isbn").map(|n| node_text(&n)),
        }
    }

    fn parse_body(&self, node: &roxmltree::Node) -> Body {
        let name = attr(node, "name");
        let lang = attr(node, "lang");

        let mut body = Body {
            name,
            lang,
            sections: Vec::new(),
            images: Vec::new(),
        };

        for child in node.children() {
            match child.tag_name().name() {
                "section" => body.sections.push(self.parse_section(&child)),
                "image" => body.images.push(ImageRef {
                    href: attr_href(&child, "href").or_else(|| attr_href(&child, "xlink:href")),
                    content_type: attr(&child, "content-type"),
                    alt: attr(&child, "alt"),
                }),
                _ => {}
            }
        }

        body
    }

    fn parse_section(&self, node: &roxmltree::Node) -> Section {
        let id = attr(node, "id");
        let mut section = Section {
            id,
            title: Vec::new(),
            elements: Vec::new(),
            sections: Vec::new(),
        };

        for child in node.children() {
            match child.tag_name().name() {
                "title" => {
                    for p in children_with_tag(&child, "p") {
                        section.title.push(TitleElement {
                            text: node_text(&p),
                            formatting: Vec::new(),
                        });
                    }
                }
                "p" => {
                    let style = attr(&child, "style");
                    let id = attr(&child, "id");
                    let content = self.parse_inline_content(&child);
                    section
                        .elements
                        .push(ContentElement::Paragraph { style, id, content });
                }
                "empty-line" => {
                    section.elements.push(ContentElement::EmptyLine);
                }
                "image" => {
                    section.elements.push(ContentElement::Image {
                        href: attr_href(&child, "href").or_else(|| attr_href(&child, "xlink:href")),
                        content_type: attr(&child, "content-type"),
                        alt: attr(&child, "alt"),
                        title: attr(&child, "title"),
                    });
                }
                "section" => {
                    section.sections.push(self.parse_section(&child));
                }
                "poem" | "stanza" | "cite" | "subtitle" | "text-author" | "date" => {
                    // These are parsed as paragraph-style content for now
                    let content = self.parse_inline_content(&child);
                    if !content.is_empty() {
                        section.elements.push(ContentElement::Paragraph {
                            style: Some(child.tag_name().name().to_string()),
                            id: attr(&child, "id"),
                            content,
                        });
                    }
                }
                _ => {}
            }
        }

        section
    }

    /// Parse inline content (formatting, links) from a paragraph-like node.
    fn parse_inline_content(&self, node: &roxmltree::Node) -> Vec<Formatting> {
        let mut result = Vec::new();
        self.collect_text_with_formatting(node, &mut result);
        result
    }

    fn collect_text_with_formatting(&self, node: &roxmltree::Node, out: &mut Vec<Formatting>) {
        for child in node.children() {
            match child.tag_name().name() {
                "strong" | "b" => {
                    let start = out.len();
                    self.collect_text_with_formatting(&child, out);
                    for fmt in &mut out[start..] {
                        fmt.style = TextStyle::Strong;
                    }
                }
                "emphasis" | "i" => {
                    let start = out.len();
                    self.collect_text_with_formatting(&child, out);
                    for fmt in &mut out[start..] {
                        fmt.style = TextStyle::Emphasis;
                    }
                }
                "strikethrough" | "s" => {
                    let start = out.len();
                    self.collect_text_with_formatting(&child, out);
                    for fmt in &mut out[start..] {
                        fmt.style = TextStyle::Strikethrough;
                    }
                }
                "sub" => {
                    let start = out.len();
                    self.collect_text_with_formatting(&child, out);
                    for fmt in &mut out[start..] {
                        fmt.style = TextStyle::Subscript;
                    }
                }
                "sup" => {
                    let start = out.len();
                    self.collect_text_with_formatting(&child, out);
                    for fmt in &mut out[start..] {
                        fmt.style = TextStyle::Superscript;
                    }
                }
                "code" => {
                    let start = out.len();
                    self.collect_text_with_formatting(&child, out);
                    for fmt in &mut out[start..] {
                        fmt.style = TextStyle::Code;
                    }
                }
                "a" => {
                    let href =
                        attr_href(&child, "href").or_else(|| attr_href(&child, "xlink:href"));
                    let title = attr(&child, "title");
                    let start = out.len();
                    self.collect_text_with_formatting(&child, out);
                    for fmt in &mut out[start..] {
                        fmt.href = href.clone();
                        fmt.title = title.clone();
                    }
                }
                _ => {
                    if child.is_text() {
                        let text = child.text().unwrap_or("").to_string();
                        if !text.is_empty() {
                            out.push(Formatting {
                                text,
                                style: TextStyle::None,
                                href: None,
                                title: None,
                            });
                        }
                    } else {
                        // Unknown element, recurse
                        self.collect_text_with_formatting(&child, out);
                    }
                }
            }
        }
    }

    fn parse_binary(&self, node: &roxmltree::Node) -> Option<Binary> {
        let id = attr(node, "id")?;
        let content_type = attr(node, "content-type").unwrap_or_else(|| "image/jpeg".into());
        let text = node_text(node);
        let clean: String = text.chars().filter(|c| !c.is_whitespace()).collect();
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        let data = STANDARD.decode(&clean).ok()?;

        Some(Binary {
            id,
            content_type,
            data,
        })
    }

    /// Parse FB2 data and convert to a generic Document.
    pub fn parse_to_document(&self, data: &[u8]) -> Result<Document> {
        let fb2 = self.parse(data)?;

        let title = fb2
            .title_info
            .as_ref()
            .and_then(|ti| ti.book_title.clone())
            .unwrap_or_default();

        let author = fb2
            .title_info
            .as_ref()
            .and_then(|ti| {
                ti.authors.first().map(|a| {
                    let mut parts = Vec::new();
                    if let Some(ref f) = a.first_name {
                        parts.push(f.as_str());
                    }
                    if let Some(ref m) = a.middle_name {
                        parts.push(m.as_str());
                    }
                    if let Some(ref l) = a.last_name {
                        parts.push(l.as_str());
                    }
                    parts.join(" ")
                })
            })
            .unwrap_or_default();

        let word_count: u32 = fb2
            .bodies
            .iter()
            .flat_map(|b| b.sections.iter())
            .flat_map(|s| s.elements.iter())
            .map(|e| match e {
                ContentElement::Paragraph { content, .. } => content
                    .iter()
                    .map(|f| f.text.split_whitespace().count() as u32)
                    .sum::<u32>(),
                _ => 0,
            })
            .sum();

        Ok(Document {
            content: data.to_vec(),
            format: "fb2".into(),
            metadata: DocumentMetadata {
                title: Some(title),
                author: Some(author),
                word_count: Some(word_count),
                ..Default::default()
            },
        })
    }
}

impl Default for Fb2Parser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::is_fb2_file;
    use base64::Engine as _;

    const MINIMAL_FB2: &str = r##"<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>sci_history</genre>
      <author>
        <first-name>Leo</first-name>
        <middle-name>Nikolayevich</middle-name>
        <last-name>Tolstoy</last-name>
      </author>
      <book-title>War and Peace</book-title>
      <lang>en</lang>
    </title-info>
    <document-info>
      <program-used>World Office</program-used>
      <date>2026-01-01</date>
      <id>test-uuid-123</id>
      <version>1.0</version>
    </document-info>
  </description>
  <body>
    <title>
      <p>Chapter 1</p>
    </title>
    <section>
      <p>Hello, <strong>World</strong>!</p>
      <empty-line/>
      <p>This is a test paragraph with <emphasis>italic</emphasis> and <a href="#note1">a link</a>.</p>
    </section>
  </body>
</FictionBook>"##;

    #[test]
    fn test_parse_minimal_fb2() {
        let parser = Fb2Parser::new();
        let doc = parser.parse(MINIMAL_FB2.as_bytes()).unwrap();

        // Title info
        assert!(doc.title_info.is_some());
        let ti = doc.title_info.as_ref().unwrap();
        assert_eq!(ti.genres, vec!["sci_history"]);
        assert_eq!(ti.authors.len(), 1);
        assert_eq!(ti.authors[0].first_name.as_deref(), Some("Leo"));
        assert_eq!(ti.authors[0].last_name.as_deref(), Some("Tolstoy"));
        assert_eq!(ti.book_title.as_deref(), Some("War and Peace"));
        assert_eq!(ti.lang.as_deref(), Some("en"));

        // Document info
        assert!(doc.document_info.is_some());
        let di = doc.document_info.as_ref().unwrap();
        assert_eq!(di.program_used.as_deref(), Some("World Office"));
        assert_eq!(di.id.as_deref(), Some("test-uuid-123"));

        // Body
        assert_eq!(doc.bodies.len(), 1);
        let body = &doc.bodies[0];
        assert_eq!(body.sections.len(), 1);

        let section = &body.sections[0];
        assert_eq!(section.elements.len(), 3); // p, empty-line, p

        // First paragraph with bold
        match &section.elements[0] {
            ContentElement::Paragraph { content, .. } => {
                assert_eq!(content.len(), 3); // "Hello, ", "World", "!"
                assert_eq!(content[0].text, "Hello, ");
                assert_eq!(content[0].style, TextStyle::None);
                assert_eq!(content[1].text, "World");
                assert_eq!(content[1].style, TextStyle::Strong);
                assert_eq!(content[2].text, "!");
                assert_eq!(content[2].style, TextStyle::None);
            }
            _ => panic!("Expected paragraph"),
        }

        // Empty line
        assert!(matches!(&section.elements[1], ContentElement::EmptyLine));

        // Third paragraph with italic and link
        match &section.elements[2] {
            ContentElement::Paragraph { content, .. } => {
                assert!(content.iter().any(|f| f.style == TextStyle::Emphasis));
                assert!(content.iter().any(|f| f.href.is_some()));
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_rejects_non_fb2() {
        let parser = Fb2Parser::new();
        let result = parser.parse(b"<html><body>Not FB2</body></html>");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("expected 'FictionBook'"));
    }

    #[test]
    fn test_parse_rejects_invalid_utf8() {
        let parser = Fb2Parser::new();
        let invalid = b"\xff\xfe\xfd\xfc";
        let result = parser.parse(invalid);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_empty_body() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Empty Book</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section></section>
  </body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        assert_eq!(doc.bodies.len(), 1);
        assert_eq!(doc.bodies[0].sections.len(), 1);
        assert!(doc.bodies[0].sections[0].elements.is_empty());
    }

    #[test]
    fn test_parse_nested_sections() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Nested</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section>
      <p>Outer</p>
      <section>
        <p>Inner</p>
      </section>
    </section>
  </body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        assert_eq!(doc.bodies[0].sections.len(), 1);
        let outer = &doc.bodies[0].sections[0];
        assert_eq!(outer.elements.len(), 1);
        assert_eq!(outer.sections.len(), 1);
        assert_eq!(outer.sections[0].elements.len(), 1);
    }

    #[test]
    fn test_parse_multiple_authors_and_genres() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>sci_history</genre>
      <genre>novel</genre>
      <author><first-name>A1</first-name><last-name>B1</last-name></author>
      <author><first-name>A2</first-name><last-name>B2</last-name></author>
      <book-title>Multi</book-title>
      <lang>en</lang>
      <keywords>war, peace, history</keywords>
      <date>1869</date>
      <src-lang>ru</src-lang>
    </title-info>
  </description>
  <body></body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        let ti = doc.title_info.unwrap();
        assert_eq!(ti.genres.len(), 2);
        assert_eq!(ti.authors.len(), 2);
        assert_eq!(ti.keywords.as_deref(), Some("war, peace, history"));
        assert_eq!(ti.date.as_deref(), Some("1869"));
        assert_eq!(ti.src_lang.as_deref(), Some("ru"));
    }

    #[test]
    fn test_parse_publish_info() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Published</book-title>
      <lang>en</lang>
    </title-info>
    <publish-info>
      <book-name>The Book</book-name>
      <publisher>Penguin</publisher>
      <city>New York</city>
      <year>2020</year>
      <isbn>978-0-123456-78-9</isbn>
    </publish-info>
  </description>
  <body></body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        let pi = doc.publish_info.unwrap();
        assert_eq!(pi.book_name.as_deref(), Some("The Book"));
        assert_eq!(pi.publisher.as_deref(), Some("Penguin"));
        assert_eq!(pi.city.as_deref(), Some("New York"));
        assert_eq!(pi.year.as_deref(), Some("2020"));
        assert_eq!(pi.isbn.as_deref(), Some("978-0-123456-78-9"));
    }

    #[test]
    fn test_parse_binary_image() {
        // base64 of a 1x1 red PNG pixel (smallest valid PNG)
        let tiny_png = base64::engine::general_purpose::STANDARD.encode(b"\x89PNG\r\n\x1a\n"); // just the header
        let fb2 = format!(
            r##"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:xlink="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>With Image</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section>
      <image xlink:href="#cover.png"/>
    </section>
  </body>
  <binary id="cover.png" content-type="image/png">{}</binary>
</FictionBook>"##,
            tiny_png
        );
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        assert_eq!(doc.binaries.len(), 1);
        assert_eq!(doc.binaries[0].id, "cover.png");
        assert_eq!(doc.binaries[0].content_type, "image/png");
        assert!(!doc.binaries[0].data.is_empty());
    }

    #[test]
    fn test_parse_to_document() {
        let parser = Fb2Parser::new();
        let doc = parser.parse_to_document(MINIMAL_FB2.as_bytes()).unwrap();
        assert_eq!(doc.format, "fb2");
        assert_eq!(doc.metadata.title.as_deref(), Some("War and Peace"));
        assert_eq!(
            doc.metadata.author.as_deref(),
            Some("Leo Nikolayevich Tolstoy")
        );
        assert!(doc.metadata.word_count.is_some());
        assert!(doc.metadata.word_count.unwrap() > 0);
    }

    #[test]
    fn test_is_fb2_file() {
        assert!(is_fb2_file(b"<?xml version='1.0'?><FictionBook>"));
        assert!(is_fb2_file(b"<fictionbook xmlns='http://test'>"));
        assert!(!is_fb2_file(b"<html><body>Nope</body></html>"));
        assert!(!is_fb2_file(b"plain text file that is long enough"));
        assert!(!is_fb2_file(b""));
    }

    #[test]
    fn test_parse_strikethrough_and_code() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Styles</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section>
      <p>Normal <strikethrough>deleted</strikethrough> <code>println!("hi")</code></p>
    </section>
  </body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        let section = &doc.bodies[0].sections[0];
        match &section.elements[0] {
            ContentElement::Paragraph { content, .. } => {
                assert!(content
                    .iter()
                    .any(|f| f.style == TextStyle::Strikethrough && f.text == "deleted"));
                assert!(content
                    .iter()
                    .any(|f| f.style == TextStyle::Code && f.text.contains("println")));
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_multiple_bodies() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Multi Body</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section><p>Main body</p></section>
  </body>
  <body name="notes">
    <section><p>Notes body</p></section>
  </body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        assert_eq!(doc.bodies.len(), 2);
        assert!(doc.bodies[0].name.is_none());
        assert_eq!(doc.bodies[1].name.as_deref(), Some("notes"));
    }

    #[test]
    fn test_parse_multiple_genres() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>science_fiction</genre>
      <genre>adventure</genre>
      <genre>humor</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Multi Genre</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section><p>Content</p></section>
  </body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        assert_eq!(doc.title_info.as_ref().unwrap().genres.len(), 3);
        assert!(doc
            .title_info
            .as_ref()
            .unwrap()
            .genres
            .iter()
            .any(|x| x == "science_fiction"));
        assert!(doc
            .title_info
            .as_ref()
            .unwrap()
            .genres
            .iter()
            .any(|x| x == "adventure"));
        assert!(doc
            .title_info
            .as_ref()
            .unwrap()
            .genres
            .iter()
            .any(|x| x == "humor"));
    }

    #[test]
    fn test_parse_author_with_all_fields() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author>
        <first-name>Leo</first-name>
        <middle-name>Nikolayevich</middle-name>
        <last-name>Tolstoy</last-name>
        <nickname>Count</nickname>
        <home-page>https://tolstoy.example.com</home-page>
        <email>leo@example.com</email>
      </author>
      <book-title>Author Fields</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section><p>Content</p></section>
  </body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        let author = &doc.title_info.as_ref().unwrap().authors[0];
        assert_eq!(author.first_name.as_deref(), Some("Leo"));
        assert_eq!(author.middle_name.as_deref(), Some("Nikolayevich"));
        assert_eq!(author.last_name.as_deref(), Some("Tolstoy"));
        assert_eq!(author.nickname.as_deref(), Some("Count"));
        assert_eq!(
            author.home_page.as_deref(),
            Some("https://tolstoy.example.com")
        );
        assert_eq!(author.email.as_deref(), Some("leo@example.com"));
    }

    #[test]
    fn test_parse_binary_images() {
        let fb2 = r##"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>computers</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Images</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section>
      <p>Text</p>
      <image l:href="#cover.jpg"/>
    </section>
  </body>
  <binary id="cover.jpg" content-type="image/jpeg">SGVsbG8=</binary>
</FictionBook>"##;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        assert_eq!(doc.binaries.len(), 1);
        assert_eq!(doc.binaries[0].id, "cover.jpg");
        assert_eq!(doc.binaries[0].content_type, "image/jpeg");
        assert!(!doc.binaries[0].data.is_empty());
    }

    #[test]
    fn test_parse_keywords_and_date() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Keywords</book-title>
      <keywords>war, peace, love</keywords>
      <date>2024-01-01</date>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section><p>Content</p></section>
  </body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        let ti = doc.title_info.as_ref().unwrap();
        assert_eq!(ti.keywords.as_deref(), Some("war, peace, love"));
        assert_eq!(ti.date.as_deref(), Some("2024-01-01"));
    }

    #[test]
    fn test_parse_invalid_utf8_rejected() {
        let parser = Fb2Parser::new();
        let invalid = &[0xFF, 0xFE, 0xFD]; // invalid UTF-8
        let result = parser.parse(invalid);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_wrong_root_element() {
        let fb2 = r#"<?xml version="1.0"?>
<NotFictionBook><body><p>Wrong root</p></body></NotFictionBook>"#;
        let parser = Fb2Parser::new();
        let result = parser.parse(fb2.as_bytes());
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("expected 'FictionBook'"));
    }

    #[test]
    fn test_parse_document_info() {
        let fb2 = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>A</first-name><last-name>B</last-name></author>
      <book-title>Doc Info</book-title>
      <lang>en</lang>
    </title-info>
    <document-info>
      <author><first-name>Editor</first-name><last-name>Smith</last-name></author>
      <program-used>FB2 Editor v2.0</program-used>
      <date value="2024-06-15">15 June 2024</date>
      <id>uuid-1234</id>
      <version>1.1</version>
    </document-info>
  </description>
  <body>
    <section><p>Content</p></section>
  </body>
</FictionBook>"#;
        let parser = Fb2Parser::new();
        let doc = parser.parse(fb2.as_bytes()).unwrap();
        let di = doc.document_info.as_ref().unwrap();
        assert_eq!(di.program_used.as_deref(), Some("FB2 Editor v2.0"));
        assert_eq!(di.id.as_deref(), Some("uuid-1234"));
        assert_eq!(di.version.as_deref(), Some("1.1"));
        assert_eq!(di.authors.len(), 1);
        assert_eq!(di.authors[0].last_name.as_deref(), Some("Smith"));
    }
}
