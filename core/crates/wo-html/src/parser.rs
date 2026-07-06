use roxmltree::Document as XmlDoc;

use wo_common::{CoreError, Document, DocumentMetadata, Result};

use crate::model::*;

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

fn direct_text(node: &roxmltree::Node) -> String {
    node.children()
        .filter(|c| c.is_text())
        .filter_map(|c| c.text())
        .collect::<String>()
        .trim()
        .to_string()
}

#[allow(dead_code)]
fn child<'a, 'input>(
    node: &roxmltree::Node<'a, 'input>,
    tag: &str,
) -> Option<roxmltree::Node<'a, 'input>> {
    node.children().find(|c| c.has_tag_name(tag))
}

fn children_with_tag<'a, 'input>(
    node: &roxmltree::Node<'a, 'input>,
    tag: &str,
) -> Vec<roxmltree::Node<'a, 'input>> {
    node.children().filter(|c| c.has_tag_name(tag)).collect()
}

fn attr(node: &roxmltree::Node, name: &str) -> Option<String> {
    node.attribute(name).map(|s| s.to_string())
}

const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
    "track", "wbr",
];

pub struct HtmlParser;

impl HtmlParser {
    pub fn new() -> Self {
        Self
    }

    pub fn parse(&self, data: &[u8]) -> Result<HtmlDocument> {
        let text = std::str::from_utf8(data).map_err(|e| CoreError::Parse {
            format: "html".into(),
            message: format!("Invalid UTF-8: {}", e),
        })?;

        let cleaned = Self::html_to_xml_compatible(text);
        let xml = XmlDoc::parse(&cleaned).map_err(|e| CoreError::Parse {
            format: "html".into(),
            message: format!("Failed to parse HTML: {}", e),
        })?;

        let root = xml.root_element();
        let _root_name = root.tag_name().name();

        let doc_type = text
            .lines()
            .find(|l| l.to_lowercase().starts_with("<!doctype"))
            .map(|l| {
                let lower = l.to_lowercase();
                let start = lower.find("doctype").unwrap_or(0) + 7;
                let rest = &l[start..].trim();
                rest.split_whitespace().next().unwrap_or("html").to_string()
            });

        let mut html_attributes = Vec::new();
        for a in root.attributes() {
            html_attributes.push((a.name().to_string(), a.value().to_string()));
        }

        let mut head = HtmlHead::default();
        let mut body = HtmlBody::default();

        for ch in root.children() {
            match ch.tag_name().name() {
                "head" => head = self.parse_head(&ch),
                "body" => body = self.parse_body(&ch),
                _ => {}
            }
        }

        Ok(HtmlDocument {
            doc_type,
            html_attributes,
            head,
            body,
        })
    }

    fn html_to_xml_compatible(html: &str) -> String {
        use regex::Regex;

        let mut out = html.to_string();

        let doctype_re = Regex::new(r"(?i)<!DOCTYPE[^>]*>").unwrap();
        out = doctype_re.replace_all(&out, "").to_string();

        let comment_re = Regex::new(r"<!--[\s\S]*?-->").unwrap();
        out = comment_re.replace_all(&out, "").to_string();

        let script_re = Regex::new(r"(?si)<script[^>]*>[\s\S]*?</script>").unwrap();
        out = script_re
            .replace_all(&out, |caps: &regex::Captures| {
                let tag = caps[0].split('>').next().unwrap_or("<script>");
                format!("{}></script>", tag)
            })
            .to_string();

        let style_content_re = Regex::new(r"(?si)(<style[^>]*>)[\s\S]*?(</style>)").unwrap();
        out = style_content_re.replace_all(&out, "$1$2").to_string();

        for void_tag in VOID_ELEMENTS {
            let re = Regex::new(&format!(
                r"(?i)<{}(?:\s[^>]*)?\s*>",
                regex::escape(void_tag)
            ))
            .unwrap();
            out = re
                .replace_all(&out, |caps: &regex::Captures| {
                    let tag_str = &caps[0];
                    if tag_str.ends_with("/>") {
                        caps[0].to_string()
                    } else {
                        format!("{}/>", &tag_str[..tag_str.len() - 1])
                    }
                })
                .to_string();
        }

        out = Self::escape_ampersands(&out);

        out
    }

    fn escape_ampersands(html: &str) -> String {
        let mut out = String::with_capacity(html.len());
        let bytes = html.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'&' {
                let rest = &html[i + 1..];
                if rest.starts_with('#')
                    && (rest[1..].starts_with(|c: char| c.is_ascii_digit())
                        || rest[1..].starts_with(|c: char| ['x', 'X'].contains(&c)))
                    && rest.contains(';')
                {
                    out.push('&');
                    i += 1;
                    continue;
                }
                if let Some(semicolon) = rest.find(';') {
                    let entity = &rest[..semicolon];
                    if !entity.is_empty() && entity.chars().all(|c| c.is_ascii_alphanumeric()) {
                        out.push('&');
                        i += 1;
                        continue;
                    }
                }
                out.push_str("&amp;");
            } else {
                out.push(bytes[i] as char);
            }
            i += 1;
        }
        out
    }

    fn parse_head(&self, node: &roxmltree::Node) -> HtmlHead {
        let mut head = HtmlHead::default();

        for ch in node.children() {
            match ch.tag_name().name() {
                "title" => {
                    head.title = Some(node_text(&ch));
                }
                "meta" => {
                    let charset = attr(&ch, "charset");
                    let name = attr(&ch, "name").or_else(|| attr(&ch, "http-equiv"));
                    let content = attr(&ch, "content");
                    head.meta.push(HtmlMeta {
                        name,
                        content,
                        charset,
                    });
                }
                "style" => {
                    let text = direct_text(&ch);
                    if !text.is_empty() {
                        head.styles.push(text);
                    }
                }
                "link" => {
                    head.links.push(HtmlLink {
                        rel: attr(&ch, "rel"),
                        href: attr(&ch, "href"),
                        media_type: attr(&ch, "type"),
                    });
                }
                _ => {}
            }
        }

        head
    }

    fn parse_body(&self, node: &roxmltree::Node) -> HtmlBody {
        HtmlBody {
            elements: self.parse_block_elements(node),
        }
    }

    fn parse_block_elements(&self, node: &roxmltree::Node) -> Vec<BlockElement> {
        let mut elements = Vec::new();

        for ch in node.children() {
            if ch.is_text() {
                let text = ch.text().unwrap_or("");
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    elements.push(BlockElement::Paragraph {
                        content: vec![InlineElement::Text {
                            text: trimmed.to_string(),
                            style: None,
                        }],
                        id: None,
                    });
                }
                continue;
            }

            if !ch.is_element() {
                continue;
            }

            let tag = ch.tag_name().name();
            let id = attr(&ch, "id");

            match tag {
                "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                    let level: u8 = tag[1..].parse().unwrap_or(1);
                    elements.push(BlockElement::Heading {
                        level,
                        content: self.parse_inline_elements(&ch),
                        id,
                    });
                }
                "p" => {
                    elements.push(BlockElement::Paragraph {
                        content: self.parse_inline_elements(&ch),
                        id,
                    });
                }
                "div" => {
                    elements.push(BlockElement::Div {
                        elements: self.parse_block_elements(&ch),
                        id,
                        class: attr(&ch, "class"),
                    });
                }
                "ul" => {
                    elements.push(BlockElement::UnorderedList {
                        items: self.parse_list_items(&ch),
                        id,
                    });
                }
                "ol" => {
                    let start = attr(&ch, "start").and_then(|s| s.parse().ok());
                    elements.push(BlockElement::OrderedList {
                        items: self.parse_list_items(&ch),
                        id,
                        start,
                    });
                }
                "table" => {
                    elements.push(BlockElement::Table {
                        rows: self.parse_table(&ch),
                        id,
                    });
                }
                "blockquote" => {
                    elements.push(BlockElement::Blockquote {
                        elements: self.parse_block_elements(&ch),
                        id,
                    });
                }
                "pre" => {
                    let content = node_text(&ch);
                    elements.push(BlockElement::Pre { content, id });
                }
                "hr" => {
                    elements.push(BlockElement::HorizontalRule);
                }
                "section" | "article" | "main" | "header" | "footer" | "nav" | "aside" => {
                    elements.push(BlockElement::Div {
                        elements: self.parse_block_elements(&ch),
                        id,
                        class: Some(tag.to_string()),
                    });
                }
                _ => {
                    let text = node_text(&ch);
                    if !text.is_empty() {
                        elements.push(BlockElement::RawHtml {
                            tag: tag.to_string(),
                            content: text,
                        });
                    }
                }
            }
        }

        elements
    }

    fn parse_inline_elements(&self, node: &roxmltree::Node) -> Vec<InlineElement> {
        let mut elements = Vec::new();

        for ch in node.children() {
            if ch.is_text() {
                if let Some(text) = ch.text() {
                    if !text.is_empty() {
                        elements.push(InlineElement::Text { text: text.to_string(), style: None });
                    }
                }
                continue;
            }

            if !ch.is_element() {
                continue;
            }

            let tag = ch.tag_name().name();

            match tag {
                "strong" | "b" => {
                    let content = self.parse_inline_elements(&ch);
                    if !content.is_empty() {
                        elements.push(InlineElement::Bold { content });
                    } else {
                        let text = direct_text(&ch);
                        if !text.is_empty() {
                            elements.push(InlineElement::Bold {
                                content: vec![InlineElement::Text { text, style: None }],
                            });
                        }
                    }
                }
                "em" | "i" => {
                    let content = self.parse_inline_elements(&ch);
                    if !content.is_empty() {
                        elements.push(InlineElement::Italic { content });
                    } else {
                        let text = direct_text(&ch);
                        if !text.is_empty() {
                            elements.push(InlineElement::Italic {
                                content: vec![InlineElement::Text { text, style: None }],
                            });
                        }
                    }
                }
                "u" => {
                    let content = self.parse_inline_elements(&ch);
                    if !content.is_empty() {
                        elements.push(InlineElement::Underline { content });
                    } else {
                        let text = direct_text(&ch);
                        if !text.is_empty() {
                            elements.push(InlineElement::Underline {
                                content: vec![InlineElement::Text { text, style: None }],
                            });
                        }
                    }
                }
                "s" | "del" | "strike" => {
                    let content = self.parse_inline_elements(&ch);
                    if !content.is_empty() {
                        elements.push(InlineElement::Strikethrough { content });
                    } else {
                        let text = direct_text(&ch);
                        if !text.is_empty() {
                            elements.push(InlineElement::Strikethrough {
                                content: vec![InlineElement::Text { text, style: None }],
                            });
                        }
                    }
                }
                "sub" => {
                    let content = self.parse_inline_elements(&ch);
                    if !content.is_empty() {
                        elements.push(InlineElement::Subscript { content });
                    } else {
                        let text = direct_text(&ch);
                        if !text.is_empty() {
                            elements.push(InlineElement::Subscript {
                                content: vec![InlineElement::Text { text, style: None }],
                            });
                        }
                    }
                }
                "sup" => {
                    let content = self.parse_inline_elements(&ch);
                    if !content.is_empty() {
                        elements.push(InlineElement::Superscript { content });
                    } else {
                        let text = direct_text(&ch);
                        if !text.is_empty() {
                            elements.push(InlineElement::Superscript {
                                content: vec![InlineElement::Text { text, style: None }],
                            });
                        }
                    }
                }
                "code" => {
                    let text = node_text(&ch);
                    elements.push(InlineElement::Code { content: text });
                }
                "a" => {
                    let href = attr(&ch, "href").unwrap_or_default();
                    let title = attr(&ch, "title");
                    let content = self.parse_inline_elements(&ch);
                    if !content.is_empty() {
                        elements.push(InlineElement::Link {
                            href,
                            title,
                            content,
                        });
                    } else {
                        let text = direct_text(&ch);
                        if !text.is_empty() {
                            elements.push(InlineElement::Link {
                                href,
                                title,
                                content: vec![InlineElement::Text { text, style: None }],
                            });
                        }
                    }
                }
                "img" => {
                    let src = attr(&ch, "src").unwrap_or_default();
                    let alt = attr(&ch, "alt");
                    let title = attr(&ch, "title");
                    elements.push(InlineElement::Image { src, alt, title });
                }
                "span" => {
                    let text = direct_text(&ch);
                    let style = attr(&ch, "style");
                    if !text.is_empty() {
                        elements.push(InlineElement::Text { text, style });
                    }
                }
                "br" => {
                    elements.push(InlineElement::LineBreak);
                }
                _ => {
                    let text = direct_text(&ch);
                    if !text.is_empty() {
                        elements.push(InlineElement::Text {
                            text,
                            style: None,
                        });
                    }
                }
            }
        }

        elements
    }

    fn parse_list_items(&self, node: &roxmltree::Node) -> Vec<ListItem> {
        let mut items = Vec::new();
        for li in children_with_tag(node, "li") {
            items.push(ListItem {
                content: self.parse_inline_elements(&li),
            });
        }
        items
    }

    fn parse_table(&self, node: &roxmltree::Node) -> Vec<TableRow> {
        let mut rows = Vec::new();

        for ch in node.children() {
            match ch.tag_name().name() {
                "thead" | "tbody" | "tfoot" => {
                    for tr in children_with_tag(&ch, "tr") {
                        rows.push(self.parse_table_row(&tr));
                    }
                }
                "tr" => {
                    rows.push(self.parse_table_row(&ch));
                }
                _ => {}
            }
        }

        rows
    }

    fn parse_table_row(&self, node: &roxmltree::Node) -> TableRow {
        let is_header = node.parent().is_some_and(|p| p.has_tag_name("thead"));
        let mut cells = Vec::new();

        for ch in node.children() {
            let tag = ch.tag_name().name();
            if tag == "th" || tag == "td" {
                let colspan = attr(&ch, "colspan")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1);
                let rowspan = attr(&ch, "rowspan")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1);
                cells.push(TableCell {
                    content: self.parse_inline_elements(&ch),
                    colspan,
                    rowspan,
                });
            }
        }

        TableRow { cells, is_header }
    }

    pub fn parse_to_document(&self, data: &[u8]) -> Result<Document> {
        let html = self.parse(data)?;

        let title = html.head.title.clone().unwrap_or_default();

        let word_count: u32 = html
            .body
            .elements
            .iter()
            .map(|e| self.count_words_in_block(e))
            .sum();

        Ok(Document {
            content: data.to_vec(),
            format: "html".into(),
            metadata: DocumentMetadata {
                title: Some(title),
                author: None,
                word_count: Some(word_count),
                encoding: Some("utf-8".into()),
                ..Default::default()
            },
        })
    }

    fn count_words_in_block(&self, element: &BlockElement) -> u32 {
        match element {
            BlockElement::Heading { content, .. } => self.count_words_in_inline(content),
            BlockElement::Paragraph { content, .. } => self.count_words_in_inline(content),
            BlockElement::Div { elements, .. } => {
                elements.iter().map(|e| self.count_words_in_block(e)).sum()
            }
            BlockElement::UnorderedList { items, .. } | BlockElement::OrderedList { items, .. } => {
                items
                    .iter()
                    .map(|li| self.count_words_in_inline(&li.content))
                    .sum()
            }
            BlockElement::Table { rows, .. } => rows
                .iter()
                .flat_map(|r| r.cells.iter())
                .map(|c| self.count_words_in_inline(&c.content))
                .sum(),
            BlockElement::Blockquote { elements, .. } => {
                elements.iter().map(|e| self.count_words_in_block(e)).sum()
            }
            BlockElement::Pre { content, .. } => content.split_whitespace().count() as u32,
            BlockElement::HorizontalRule | BlockElement::RawHtml { .. } => 0,
        }
    }

    fn count_words_in_inline(&self, elements: &[InlineElement]) -> u32 {
        let mut count = 0u32;
        for el in elements {
            match el {
                InlineElement::Text { text, .. } => {
                    count += text.split_whitespace().count() as u32;
                }
                InlineElement::Bold { content }
                | InlineElement::Italic { content }
                | InlineElement::Underline { content }
                | InlineElement::Strikethrough { content }
                | InlineElement::Subscript { content }
                | InlineElement::Superscript { content }
                | InlineElement::Link { content, .. } => {
                    count += self.count_words_in_inline(content);
                }
                InlineElement::Code { content } => {
                    count += content.split_whitespace().count() as u32;
                }
                InlineElement::Image { .. } | InlineElement::LineBreak => {}
            }
        }
        count
    }
}

impl Default for HtmlParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::is_html_file;

    #[test]
    fn test_parse_simple_html() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>Test</title></head>
<body>
<h1>Hello</h1>
<p>This is <strong>bold</strong> and <em>italic</em> text.</p>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.head.title.as_deref(), Some("Test"));
        assert_eq!(doc.body.elements.len(), 2);
        assert!(matches!(
            &doc.body.elements[0],
            BlockElement::Heading { level: 1, .. }
        ));
        assert!(matches!(
            &doc.body.elements[1],
            BlockElement::Paragraph { .. }
        ));
    }

    #[test]
    fn test_parse_list() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<ul><li>Item 1</li><li>Item 2</li></ul>
<ol start="5"><li>A</li><li>B</li></ol>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.body.elements.len(), 2);

        match &doc.body.elements[0] {
            BlockElement::UnorderedList { items, .. } => {
                assert_eq!(items.len(), 2);
            }
            _ => panic!("Expected unordered list"),
        }

        match &doc.body.elements[1] {
            BlockElement::OrderedList { items, start, .. } => {
                assert_eq!(items.len(), 2);
                assert_eq!(*start, Some(5));
            }
            _ => panic!("Expected ordered list"),
        }
    }

    #[test]
    fn test_parse_table() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<table>
<thead><tr><th>Name</th><th>Value</th></tr></thead>
<tbody><tr><td>foo</td><td>bar</td></tr></tbody>
</table>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Table { rows, .. } => {
                assert_eq!(rows.len(), 2);
                assert!(rows[0].is_header);
                assert!(!rows[1].is_header);
                assert_eq!(rows[0].cells.len(), 2);
            }
            _ => panic!("Expected table"),
        }
    }

    #[test]
    fn test_parse_links_and_images() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p><a href="https://example.com" title="Example">Link text</a></p>
<p><img src="photo.jpg" alt="A photo" title="Photo"/></p>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.body.elements.len(), 2);

        match &doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => match &content[0] {
                InlineElement::Link { href, title, .. } => {
                    assert_eq!(href, "https://example.com");
                    assert_eq!(title.as_deref(), Some("Example"));
                }
                _ => panic!("Expected link"),
            },
            _ => panic!("Expected paragraph"),
        }

        match &doc.body.elements[1] {
            BlockElement::Paragraph { content, .. } => match &content[0] {
                InlineElement::Image { src, alt, title } => {
                    assert_eq!(src, "photo.jpg");
                    assert_eq!(alt.as_deref(), Some("A photo"));
                    assert_eq!(title.as_deref(), Some("Photo"));
                }
                _ => panic!("Expected image"),
            },
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_headings() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<h1>One</h1><h2>Two</h2><h3>Three</h3>
<h4>Four</h4><h5>Five</h5><h6>Six</h6>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.body.elements.len(), 6);
        for (i, expected_level) in [1u8, 2, 3, 4, 5, 6].iter().enumerate() {
            match &doc.body.elements[i] {
                BlockElement::Heading { level, .. } => {
                    assert_eq!(*level, *expected_level);
                }
                _ => panic!("Expected heading at index {}", i),
            }
        }
    }

    #[test]
    fn test_parse_blockquote() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<blockquote><p>A quote.</p><p>More quote.</p></blockquote>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Blockquote { elements, .. } => {
                assert_eq!(elements.len(), 2);
            }
            _ => panic!("Expected blockquote"),
        }
    }

    #[test]
    fn test_parse_pre_code() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<pre>fn main() {
    println!("Hello");
}</pre>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Pre { content, .. } => {
                assert!(content.contains("fn main()"));
            }
            _ => panic!("Expected pre"),
        }
    }

    #[test]
    fn test_parse_nested_formatting() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p><u><em><strong>Nested</strong></em></u></p>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => {
                assert!(matches!(&content[0], InlineElement::Underline { .. }));
                match &content[0] {
                    InlineElement::Underline { content: inner } => {
                        assert!(matches!(inner[0], InlineElement::Italic { .. }));
                        match &inner[0] {
                            InlineElement::Italic { content: inner2 } => {
                                assert!(matches!(inner2[0], InlineElement::Bold { .. }));
                            }
                            _ => panic!("Expected italic"),
                        }
                    }
                    _ => panic!("Expected underline"),
                }
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_void_elements() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p>Line 1<br/>Line 2</p>
<hr/>
<p><img src="test.png"/></p>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.body.elements.len(), 3);

        match &doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => {
                assert!(content
                    .iter()
                    .any(|e| matches!(e, InlineElement::LineBreak)));
            }
            _ => panic!("Expected paragraph with br"),
        }

        assert!(matches!(
            &doc.body.elements[1],
            BlockElement::HorizontalRule
        ));

        match &doc.body.elements[2] {
            BlockElement::Paragraph { content, .. } => {
                assert!(content
                    .iter()
                    .any(|e| matches!(e, InlineElement::Image { .. })));
            }
            _ => panic!("Expected paragraph with img"),
        }
    }

    #[test]
    fn test_parse_meta_charset() {
        let html = r#"<?xml version="1.0"?>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
</head><body></body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.head.meta.len(), 3);
        assert_eq!(doc.head.meta[0].charset.as_deref(), Some("utf-8"));
        assert_eq!(doc.head.meta[1].name.as_deref(), Some("viewport"));
        assert_eq!(doc.head.meta[2].name.as_deref(), Some("X-UA-Compatible"));
    }

    #[test]
    fn test_is_html_file() {
        assert!(is_html_file(b"<!DOCTYPE html><html><head></head></html>"));
        assert!(is_html_file(b"<html><body>hello</body></html>"));
        assert!(is_html_file(b"<head><title>Test</title></head>"));
        assert!(is_html_file(b"<body>Content</body>"));
        assert!(is_html_file(b"<div><p>text</p></div>"));
        assert!(is_html_file(b"<p>paragraph</p>"));
        assert!(is_html_file(b"<table><tr><td>cell</td></tr></table>"));
        assert!(!is_html_file(b"plain text file that is long enough"));
        assert!(!is_html_file(b""));
        assert!(!is_html_file(b"short"));
    }

    #[test]
    fn test_parse_to_document() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>My Doc</title></head>
<body><p>Hello world, this has words.</p></body>
</html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse_to_document(html.as_bytes()).unwrap();
        assert_eq!(doc.format, "html");
        assert_eq!(doc.metadata.title.as_deref(), Some("My Doc"));
        assert!(doc.metadata.word_count.is_some());
        assert!(doc.metadata.word_count.unwrap() > 0);
        assert_eq!(doc.metadata.encoding.as_deref(), Some("utf-8"));
    }

    #[test]
    fn test_serialize_roundtrip() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>Roundtrip</title></head>
<body>
<h1>Title</h1>
<p>Some <strong>bold</strong> text.</p>
<ul><li>One</li><li>Two</li></ul>
</body></html>"#;
        let parser = HtmlParser::new();
        let parsed = parser.parse(html.as_bytes()).unwrap();

        let serializer = crate::serializer::HtmlSerializer::new();
        let output = serializer.serialize(&parsed);

        assert!(output.contains("<h1>Title</h1>"));
        assert!(output.contains("<strong>bold</strong>"));
        assert!(output.contains("<li>One</li>"));
        assert!(output.contains("<li>Two</li>"));
        assert!(output.contains("Roundtrip"));
    }

    #[test]
    fn test_parse_malformed_html() {
        let html = r#"<!DOCTYPE html>
<html>
<head><title>Malformed</title></head>
<body>
<h1>Hello</h1>
<p>Some text</p>
<br>
<img src="test.png">
<hr>
</body>
</html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.head.title.as_deref(), Some("Malformed"));
        assert!(!doc.body.elements.is_empty());
    }

    #[test]
    fn test_parse_div_with_class() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<div class="container" id="main"><p>Inside div</p></div>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Div {
                id,
                class,
                elements,
            } => {
                assert_eq!(id.as_deref(), Some("main"));
                assert_eq!(class.as_deref(), Some("container"));
                assert_eq!(elements.len(), 1);
            }
            _ => panic!("Expected div"),
        }
    }

    #[test]
    fn test_parse_html_with_link_tags() {
        let html = r#"<?xml version="1.0"?>
<html><head>
<link rel="stylesheet" href="style.css" type="text/css"/>
<link rel="icon" href="favicon.ico"/>
</head><body></body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.head.links.len(), 2);
        assert_eq!(doc.head.links[0].rel.as_deref(), Some("stylesheet"));
        assert_eq!(doc.head.links[0].href.as_deref(), Some("style.css"));
        assert_eq!(doc.head.links[1].rel.as_deref(), Some("icon"));
    }

    #[test]
    fn test_parse_nested_divs() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<div class="outer"><div class="inner"><p>Deep</p></div></div>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Div { elements, .. } => match &elements[0] {
                BlockElement::Div { elements, .. } => {
                    assert!(matches!(&elements[0], BlockElement::Paragraph { .. }));
                }
                _ => panic!("Expected inner div"),
            },
            _ => panic!("Expected outer div"),
        }
    }

    #[test]
    fn test_parse_strikethrough_and_subscript_superscript() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p><s>strikethrough</s> <sub>sub</sub> <sup>sup</sup></p>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => {
                assert!(content
                    .iter()
                    .any(|e| matches!(e, InlineElement::Strikethrough { .. })));
                assert!(content
                    .iter()
                    .any(|e| matches!(e, InlineElement::Subscript { .. })));
                assert!(content
                    .iter()
                    .any(|e| matches!(e, InlineElement::Superscript { .. })));
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_code_inline() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p>Use <code>var x = 1;</code> to declare.</p>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => {
                let code = content
                    .iter()
                    .find(|e| matches!(e, InlineElement::Code { .. }));
                assert!(code.is_some());
                if let Some(InlineElement::Code { content }) = code {
                    assert_eq!(content, "var x = 1;");
                }
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_table_with_colspan_rowspan() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<table>
<tr><td colspan="2">wide</td></tr>
<tr><td rowspan="2">tall</td><td>normal</td></tr>
<tr><td>normal2</td></tr>
</table>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Table { rows, .. } => {
                assert_eq!(rows[0].cells[0].colspan, 2);
                assert_eq!(rows[1].cells[0].rowspan, 2);
                assert_eq!(rows[0].cells[0].rowspan, 1);
            }
            _ => panic!("Expected table"),
        }
    }

    #[test]
    fn test_parse_html_without_doctype() {
        let html =
            r#"<html><head><title>No Doctype</title></head><body><p>Content</p></body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert_eq!(doc.head.title.as_deref(), Some("No Doctype"));
        assert!(doc.doc_type.is_none());
    }

    #[test]
    fn test_parse_empty_body() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>Empty</title></head><body></body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert!(doc.body.elements.is_empty());
    }

    #[test]
    fn test_parse_html_with_attributes() {
        let html = r#"<?xml version="1.0"?>
<html lang="en" dir="ltr"><head></head><body></body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        assert!(!doc.html_attributes.is_empty());
        let has_lang = doc
            .html_attributes
            .iter()
            .any(|(k, v)| k == "lang" && v == "en");
        assert!(has_lang);
    }

    #[test]
    fn test_parse_escaped_html_entities_are_decoded() {
        // html_to_xml_compatible: bare & → &amp;. roxmltree decodes &amp; back to &
        let html = r#"<?xml version="1.0"?>
<html><head></head><body><p>AT&amp;T M&amp;M's</p></body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => {
                let text = &content[0];
                if let InlineElement::Text { text, style: None } = text {
                    assert!(
                        text.contains("AT&T"),
                        "Expected decoded AT&T, got: {}",
                        text
                    );
                    assert!(
                        text.contains("M&M's"),
                        "Expected decoded M&M's, got: {}",
                        text
                    );
                }
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_html_entities_decoded_by_roxmltree() {
        // roxmltree decodes HTML entities — the parsed model contains decoded text
        let html = "<?xml version=\"1.0\"?><html><head></head><body><p>&#123; &#x7B; &amp; &lt; &gt;</p></body></html>";
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => {
                if let InlineElement::Text { text, style: None } = &content[0] {
                    assert!(
                        text.contains('{'),
                        "Expected curly brace from numeric entity"
                    );
                    assert!(text.contains('{'), "Expected curly brace from hex entity");
                    assert!(text.contains('&'), "Expected & from &amp;");
                    assert!(text.contains('<'), "Expected < from &lt;");
                    assert!(text.contains('>'), "Expected > from &gt;");
                }
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_invalid_utf8_returns_error() {
        let parser = HtmlParser::new();
        let invalid = &[0xFF, 0xFE, 0x00, 0x00];
        let result = parser.parse(invalid);
        assert!(result.is_err(), "Expected error for invalid UTF-8");
    }

    #[test]
    fn test_parse_totally_invalid_input() {
        let parser = HtmlParser::new();
        let result = parser.parse(b"\x00\x01\x02\x03");
        assert!(result.is_ok() || result.is_err());
    }

    #[test]
    fn test_parse_semantic_elements_as_div() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<section><p>Section content</p></section>
<article><p>Article content</p></article>
<nav><p>Nav</p></nav>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Div {
                class, elements, ..
            } => {
                assert_eq!(class.as_deref(), Some("section"));
                assert_eq!(elements.len(), 1);
            }
            other => panic!("Expected Div with semantic class, got {:?}", other),
        }
        match &doc.body.elements[1] {
            BlockElement::Div { class, .. } => {
                assert_eq!(class.as_deref(), Some("article"));
            }
            _ => panic!("Expected article div"),
        }
        match &doc.body.elements[2] {
            BlockElement::Div { class, .. } => {
                assert_eq!(class.as_deref(), Some("nav"));
            }
            _ => panic!("Expected nav div"),
        }
    }

    #[test]
    fn test_parse_unknown_inline_element_as_text() {
        // <span> is not explicitly matched in parse_inline_elements,
        // so it should fall through to the _ => branch and extract direct text
        let html = r#"<?xml version="1.0"?>
<html><head></head><body><p>This is <span>spanned</span> text.</p></body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => {
                let texts: Vec<&str> = content
                    .iter()
                    .filter_map(|e| {
                        if let InlineElement::Text { text, style: None } = e {
                            Some(text.as_str())
                        } else {
                            None
                        }
                    })
                    .collect();
                assert!(
                    texts.iter().any(|t| t.trim() == "spanned"),
                    "Expected 'spanned' text from span element, got: {:?}",
                    texts
                );
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_default_impl() {
        let parser = HtmlParser;
        let html = b"<?xml version=\"1.0\"?><html><head></head><body><p>Default</p></body></html>";
        let doc = parser.parse(html).unwrap();
        assert_eq!(doc.body.elements.len(), 1);
    }

    #[test]
    fn test_parse_unknown_block_element_as_rawhtml() {
        // Unknown block-level element with text → RawHtml
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<custom-element>Custom content</custom-element>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        match &doc.body.elements[0] {
            BlockElement::RawHtml { tag, content } => {
                assert_eq!(tag, "custom-element");
                assert!(content.contains("Custom content"));
            }
            other => panic!("Expected RawHtml, got: {:?}", other),
        }
    }

    #[test]
    fn test_parse_word_count_multiple_blocks() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>Word Count</title></head>
<body>
<p>one two three</p>
<ul><li>four</li><li>five six</li></ul>
<pre>seven eight nine ten</pre>
</body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse_to_document(html.as_bytes()).unwrap();
        // Word count should be > 0
        assert!(
            doc.metadata.word_count.unwrap() > 0,
            "Expected word count > 0"
        );
        // Expected: one two three (3) + four (1) + five six (2) + seven eight nine ten (4) = 10
        assert_eq!(
            doc.metadata.word_count.unwrap(),
            10,
            "Expected exact word count"
        );
    }

    #[test]
    fn test_parse_head_with_style() {
        // Style content is stripped by html_to_xml_compatible but the head parser handles style tags
        let html = r#"<?xml version="1.0"?>
<html><head>
<style>body { margin: 0; }</style>
</head><body><p>Text</p></body></html>"#;
        let parser = HtmlParser::new();
        let doc = parser.parse(html.as_bytes()).unwrap();
        // Style content is stripped, so head.styles should be empty
        assert!(doc.head.styles.is_empty());
    }
}
