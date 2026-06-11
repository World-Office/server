use crate::model::*;

/// Escape string for use in HTML attribute values.
/// Escapes: &, ", <, >
fn escape_attr(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}

/// Escape string for use in HTML text content.
/// Escapes: &, <, > (not " because it's valid in text)
fn escape_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}

pub struct HtmlSerializer {
    #[allow(dead_code)]
    indent: usize,
}

impl HtmlSerializer {
    pub fn new() -> Self {
        Self { indent: 0 }
    }

    pub fn serialize(&self, doc: &HtmlDocument) -> String {
        let mut out = String::new();
        if let Some(ref dt) = doc.doc_type {
            out.push_str(&format!("<!DOCTYPE {}>\n", dt));
        }
        out.push_str("<html");
        for (k, v) in &doc.html_attributes {
            out.push_str(&format!(" {}=\"{}\"", k, escape_attr(v)));
        }
        out.push_str(">\n");
        out.push_str(&self.serialize_head(&doc.head));
        out.push_str(&self.serialize_body(&doc.body));
        out.push_str("</html>\n");
        out
    }

    fn serialize_head(&self, head: &HtmlHead) -> String {
        let mut out = String::new();
        out.push_str("<head>\n");
        if let Some(ref title) = head.title {
            out.push_str(&format!("<title>{}</title>\n", escape_text(title)));
        }
        for meta in &head.meta {
            if let Some(ref charset) = meta.charset {
                out.push_str(&format!("<meta charset=\"{}\"/>\n", escape_attr(charset)));
            } else {
                out.push_str("<meta");
                if let Some(ref name) = meta.name {
                    out.push_str(&format!(" name=\"{}\"", escape_attr(name)));
                }
                if let Some(ref content) = meta.content {
                    out.push_str(&format!(" content=\"{}\"", escape_attr(content)));
                }
                out.push_str("/>\n");
            }
        }
        for style in &head.styles {
            out.push_str("<style>\n");
            out.push_str(&escape_text(style));
            out.push_str("\n</style>\n");
        }
        for link in &head.links {
            out.push_str("<link");
            if let Some(ref rel) = link.rel {
                out.push_str(&format!(" rel=\"{}\"", escape_attr(rel)));
            }
            if let Some(ref href) = link.href {
                out.push_str(&format!(" href=\"{}\"", escape_attr(href)));
            }
            if let Some(ref mt) = link.media_type {
                out.push_str(&format!(" type=\"{}\"", escape_attr(mt)));
            }
            out.push_str("/>\n");
        }
        out.push_str("</head>\n");
        out
    }

    fn serialize_body(&self, body: &HtmlBody) -> String {
        let mut out = String::new();
        out.push_str("<body>\n");
        for element in &body.elements {
            out.push_str(&self.serialize_block(element, 1));
        }
        out.push_str("</body>\n");
        out
    }

    fn serialize_block(&self, element: &BlockElement, depth: usize) -> String {
        let pad = "  ".repeat(depth);
        let mut out = String::new();

        match element {
            BlockElement::Heading { level, content, id } => {
                out.push_str(&pad);
                if let Some(id_val) = id {
                    out.push_str(&format!("<h{} id=\"{}\">", level, escape_attr(id_val)));
                } else {
                    out.push_str(&format!("<h{}>", level));
                }
                out.push_str(&self.serialize_inline(content));
                out.push_str(&format!("</h{}>\n", level));
            }
            BlockElement::Paragraph { content, id } => {
                out.push_str(&pad);
                if let Some(id_val) = id {
                    out.push_str(&format!("<p id=\"{}\">", escape_attr(id_val)));
                } else {
                    out.push_str("<p>");
                }
                out.push_str(&self.serialize_inline(content));
                out.push_str("</p>\n");
            }
            BlockElement::Div {
                elements,
                id,
                class,
            } => {
                out.push_str(&pad);
                out.push_str("<div");
                if let Some(id_val) = id {
                    out.push_str(&format!(" id=\"{}\"", escape_attr(id_val)));
                }
                if let Some(cls) = class {
                    out.push_str(&format!(" class=\"{}\"", escape_attr(cls)));
                }
                out.push_str(">\n");
                for el in elements {
                    out.push_str(&self.serialize_block(el, depth + 1));
                }
                out.push_str(&pad);
                out.push_str("</div>\n");
            }
            BlockElement::UnorderedList { items, id } => {
                out.push_str(&pad);
                if let Some(id_val) = id {
                    out.push_str(&format!("<ul id=\"{}\">\n", escape_attr(id_val)));
                } else {
                    out.push_str("<ul>\n");
                }
                for item in items {
                    out.push_str(&pad);
                    out.push_str("  <li>");
                    out.push_str(&self.serialize_inline(&item.content));
                    out.push_str("</li>\n");
                }
                out.push_str(&pad);
                out.push_str("</ul>\n");
            }
            BlockElement::OrderedList { items, id, start } => {
                out.push_str(&pad);
                out.push_str("<ol");
                if let Some(id_val) = id {
                    out.push_str(&format!(" id=\"{}\"", escape_attr(id_val)));
                }
                if let Some(s) = start {
                    out.push_str(&format!(" start=\"{}\"", escape_attr(&s.to_string())));
                }
                out.push_str(">\n");
                for item in items {
                    out.push_str(&pad);
                    out.push_str("  <li>");
                    out.push_str(&self.serialize_inline(&item.content));
                    out.push_str("</li>\n");
                }
                out.push_str(&pad);
                out.push_str("</ol>\n");
            }
            BlockElement::Table { rows, id } => {
                out.push_str(&pad);
                if let Some(id_val) = id {
                    out.push_str(&format!("<table id=\"{}\">\n", escape_attr(id_val)));
                } else {
                    out.push_str("<table>\n");
                }
                for row in rows {
                    out.push_str(&pad);
                    out.push_str("  <tr>\n");
                    for cell in &row.cells {
                        out.push_str(&pad);
                        out.push_str("    ");
                        if row.is_header {
                            out.push_str("<th>");
                        } else {
                            out.push_str("<td>");
                        }
                        out.push_str(&self.serialize_inline(&cell.content));
                        if row.is_header {
                            out.push_str("</th>\n");
                        } else {
                            out.push_str("</td>\n");
                        }
                    }
                    out.push_str(&pad);
                    out.push_str("  </tr>\n");
                }
                out.push_str(&pad);
                out.push_str("</table>\n");
            }
            BlockElement::Blockquote { elements, id } => {
                out.push_str(&pad);
                if let Some(id_val) = id {
                    out.push_str(&format!("<blockquote id=\"{}\">\n", escape_attr(id_val)));
                } else {
                    out.push_str("<blockquote>\n");
                }
                for el in elements {
                    out.push_str(&self.serialize_block(el, depth + 1));
                }
                out.push_str(&pad);
                out.push_str("</blockquote>\n");
            }
            BlockElement::Pre { content, id } => {
                out.push_str(&pad);
                if let Some(id_val) = id {
                    out.push_str(&format!("<pre id=\"{}\">", escape_attr(id_val)));
                } else {
                    out.push_str("<pre>");
                }
                out.push_str(&escape_text(content));
                out.push_str("</pre>\n");
            }
            BlockElement::HorizontalRule => {
                out.push_str(&pad);
                out.push_str("<hr/>\n");
            }
            BlockElement::RawHtml { tag, content } => {
                out.push_str(&pad);
                out.push_str(&format!("<{}>", tag));
                out.push_str(content);
                out.push_str(&format!("</{}>\n", tag));
            }
        }

        out
    }

    fn serialize_inline(&self, elements: &[InlineElement]) -> String {
        let mut out = String::new();
        for el in elements {
            match el {
                InlineElement::Text { text } => {
                    out.push_str(&escape_text(text));
                }
                InlineElement::Bold { content } => {
                    out.push_str("<strong>");
                    out.push_str(&self.serialize_inline(content));
                    out.push_str("</strong>");
                }
                InlineElement::Italic { content } => {
                    out.push_str("<em>");
                    out.push_str(&self.serialize_inline(content));
                    out.push_str("</em>");
                }
                InlineElement::Underline { content } => {
                    out.push_str("<u>");
                    out.push_str(&self.serialize_inline(content));
                    out.push_str("</u>");
                }
                InlineElement::Strikethrough { content } => {
                    out.push_str("<s>");
                    out.push_str(&self.serialize_inline(content));
                    out.push_str("</s>");
                }
                InlineElement::Subscript { content } => {
                    out.push_str("<sub>");
                    out.push_str(&self.serialize_inline(content));
                    out.push_str("</sub>");
                }
                InlineElement::Superscript { content } => {
                    out.push_str("<sup>");
                    out.push_str(&self.serialize_inline(content));
                    out.push_str("</sup>");
                }
                InlineElement::Code { content } => {
                    out.push_str("<code>");
                    out.push_str(&escape_text(content));
                    out.push_str("</code>");
                }
                InlineElement::Link {
                    href,
                    title,
                    content,
                } => {
                    out.push_str("<a href=\"");
                    out.push_str(&escape_attr(href));
                    out.push('"');
                    if let Some(t) = title {
                        out.push_str(&format!(" title=\"{}\"", escape_attr(t)));
                    }
                    out.push('>');
                    out.push_str(&self.serialize_inline(content));
                    out.push_str("</a>");
                }
                InlineElement::Image { src, alt, title } => {
                    out.push_str("<img src=\"");
                    out.push_str(&escape_attr(src));
                    out.push('"');
                    if let Some(a) = alt {
                        out.push_str(&format!(" alt=\"{}\"", escape_attr(a)));
                    }
                    if let Some(t) = title {
                        out.push_str(&format!(" title=\"{}\"", escape_attr(t)));
                    }
                    out.push_str("/>");
                }
                InlineElement::LineBreak => {
                    out.push_str("<br/>");
                }
            }
        }
        out
    }
}

impl Default for HtmlSerializer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_attr_amps_and_quotes() {
        assert_eq!(escape_attr("a\"b<c>d&e"), "a&quot;b&lt;c&gt;d&amp;e");
    }

    #[test]
    fn test_escape_attr_no_change() {
        assert_eq!(escape_attr("hello world"), "hello world");
    }

    #[test]
    fn test_escape_attr_empty() {
        assert_eq!(escape_attr(""), "");
    }

    #[test]
    fn test_escape_text_amps_angle_brackets() {
        assert_eq!(escape_text("a\"b<c>d&e"), "a\"b&lt;c&gt;d&amp;e");
    }

    #[test]
    fn test_escape_text_no_change() {
        assert_eq!(escape_text("plain text"), "plain text");
    }

    #[test]
    fn test_serialize_escapes_id_attribute() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Text {
                        text: "hello".into(),
                    }],
                    id: Some("foo\"bar".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("foo&quot;bar"),
            "id with quote should be escaped"
        );
        assert!(
            !output.contains("foo\"bar"),
            "raw quote in id should NOT appear"
        );
    }

    #[test]
    fn test_serialize_escapes_text_content() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Text {
                        text: "a < b & c > d".into(),
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("a &lt; b &amp; c &gt; d"),
            "text with special chars should be escaped"
        );
    }

    #[test]
    fn test_serialize_escapes_link_href() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Link {
                        href: "https://example.com?a=1&b=2".into(),
                        title: Some("click \"here\"".into()),
                        content: vec![InlineElement::Text {
                            text: "link".into(),
                        }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("a=1&amp;b=2"),
            "href &amp; should be escaped"
        );
        assert!(
            output.contains("click &quot;here&quot;"),
            "title quotes should be escaped"
        );
    }

    #[test]
    fn test_serialize_escapes_image_src() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Image {
                        src: "image?name=<test>&size=1".into(),
                        alt: Some("an \"image\"".into()),
                        title: None,
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("&lt;test&gt;"),
            "image src angle brackets should be escaped"
        );
        assert!(
            output.contains("an &quot;image&quot;"),
            "image alt quotes should be escaped"
        );
    }

    #[test]
    fn test_serialize_does_not_escape_rawhtml() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody {
                elements: vec![BlockElement::RawHtml {
                    tag: "custom".into(),
                    content: "<b>raw & unescaped</b>".into(),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("<b>raw & unescaped</b>"),
            "RawHtml content should be passed through unescaped"
        );
    }

    #[test]
    fn test_serialize_escapes_pre_content() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody {
                elements: vec![BlockElement::Pre {
                    content: "code <x> & more".into(),
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("code &lt;x&gt; &amp; more"),
            "pre content should be escaped"
        );
    }

    #[test]
    fn test_serialize_escapes_inline_code() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Code {
                        content: "x < 1 & y > 2".into(),
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("x &lt; 1 &amp; y &gt; 2"),
            "inline code should be escaped"
        );
    }

    #[test]
    fn test_serialize_escapes_html_attributes() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![("lang".into(), "en\"US".into())],
            head: HtmlHead {
                title: Some("Title <test>".into()),
                meta: vec![],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("en&quot;US"),
            "html attr value should be escaped"
        );
        assert!(
            output.contains("Title &lt;test&gt;"),
            "title text should be escaped"
        );
    }
}
