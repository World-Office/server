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

    // ---------------------------------------------------------------------------
    // Head element tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_head_meta_charset() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![HtmlMeta {
                    name: None,
                    content: None,
                    charset: Some("utf-8".into()),
                }],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("<meta charset=\"utf-8\"/>"),
            "charset meta should be serialized"
        );
    }

    #[test]
    fn test_serialize_head_meta_name_content() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![HtmlMeta {
                    name: Some("viewport".into()),
                    content: Some("width=device-width".into()),
                    charset: None,
                }],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("name=\"viewport\""),
            "meta name should be present"
        );
        assert!(
            output.contains("content=\"width=device-width\""),
            "meta content should be present"
        );
    }

    #[test]
    fn test_serialize_head_style() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec!["body { margin: 0; }".into()],
                links: vec![],
            },
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<style>"), "style tag should be opened");
        assert!(
            output.contains("body { margin: 0; }"),
            "style content should be present"
        );
        assert!(output.contains("</style>"), "style tag should be closed");
    }

    #[test]
    fn test_serialize_head_link() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![HtmlLink {
                    rel: Some("stylesheet".into()),
                    href: Some("style.css".into()),
                    media_type: Some("text/css".into()),
                }],
            },
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("rel=\"stylesheet\""),
            "link rel should be present"
        );
        assert!(
            output.contains("href=\"style.css\""),
            "link href should be present"
        );
        assert!(
            output.contains("type=\"text/css\""),
            "link type should be present"
        );
    }

    // ---------------------------------------------------------------------------
    // Block element tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_heading_without_id() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Heading {
                    level: 2,
                    content: vec![InlineElement::Text {
                        text: "Section".into(),
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<h2>"), "h2 open tag");
        assert!(output.contains("</h2>"), "h2 close tag");
        assert!(output.contains("Section"), "heading text");
    }

    #[test]
    fn test_serialize_heading_with_id() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Heading {
                    level: 3,
                    content: vec![InlineElement::Text {
                        text: "Intro".into(),
                    }],
                    id: Some("intro".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<h3 id=\"intro\">"), "h3 with id");
    }

    #[test]
    fn test_serialize_div_with_class() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Div {
                    elements: vec![BlockElement::Paragraph {
                        content: vec![InlineElement::Text {
                            text: "inside".into(),
                        }],
                        id: None,
                    }],
                    id: Some("main".into()),
                    class: Some("container".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<div"), "div open");
        assert!(output.contains("id=\"main\""), "div id");
        assert!(output.contains("class=\"container\""), "div class");
        assert!(output.contains("</div>"), "div close");
        assert!(output.contains("inside"), "div content");
    }

    #[test]
    fn test_serialize_unordered_list() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::UnorderedList {
                    items: vec![
                        ListItem {
                            content: vec![InlineElement::Text { text: "A".into() }],
                        },
                        ListItem {
                            content: vec![InlineElement::Text { text: "B".into() }],
                        },
                    ],
                    id: Some("list1".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<ul id=\"list1\">"), "ul with id");
        assert!(output.contains("<li>A</li>"), "first li");
        assert!(output.contains("<li>B</li>"), "second li");
        assert!(output.contains("</ul>"), "ul close");
    }

    #[test]
    fn test_serialize_ordered_list_with_start() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::OrderedList {
                    items: vec![ListItem {
                        content: vec![InlineElement::Text {
                            text: "first".into(),
                        }],
                    }],
                    id: None,
                    start: Some(5),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<ol start=\"5\">"), "ol with start");
    }

    #[test]
    fn test_serialize_table_with_header() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Table {
                    rows: vec![
                        TableRow {
                            cells: vec![TableCell {
                                content: vec![InlineElement::Text {
                                    text: "Name".into(),
                                }],
                                colspan: 1,
                                rowspan: 1,
                            }],
                            is_header: true,
                        },
                        TableRow {
                            cells: vec![TableCell {
                                content: vec![InlineElement::Text {
                                    text: "Alice".into(),
                                }],
                                colspan: 1,
                                rowspan: 1,
                            }],
                            is_header: false,
                        },
                    ],
                    id: Some("t1".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<table id=\"t1\">"), "table with id");
        assert!(output.contains("<th>"), "header cell");
        assert!(output.contains("</th>"), "header close");
        assert!(output.contains("<td>"), "data cell");
        assert!(output.contains("</td>"), "data close");
        assert!(output.contains("</table>"), "table close");
    }

    #[test]
    fn test_serialize_blockquote() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Blockquote {
                    elements: vec![BlockElement::Paragraph {
                        content: vec![InlineElement::Text {
                            text: "quote".into(),
                        }],
                        id: None,
                    }],
                    id: Some("q1".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("<blockquote id=\"q1\">"),
            "blockquote with id"
        );
        assert!(output.contains("quote"), "quote content");
        assert!(output.contains("</blockquote>"), "blockquote close");
    }

    #[test]
    fn test_serialize_horizontal_rule() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::HorizontalRule],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<hr/>"), "hr tag");
    }

    #[test]
    fn test_serialize_pre_with_id() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Pre {
                    content: "code block".into(),
                    id: Some("code1".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<pre id=\"code1\">"), "pre with id");
        assert!(output.contains("code block"));
    }

    // ---------------------------------------------------------------------------
    // Inline element tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_bold() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Bold {
                        content: vec![InlineElement::Text {
                            text: "bold".into(),
                        }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<strong>bold</strong>"), "bold text");
    }

    #[test]
    fn test_serialize_italic() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Italic {
                        content: vec![InlineElement::Text {
                            text: "emph".into(),
                        }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<em>emph</em>"), "italic text");
    }

    #[test]
    fn test_serialize_underline() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Underline {
                        content: vec![InlineElement::Text { text: "und".into() }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<u>und</u>"), "underline text");
    }

    #[test]
    fn test_serialize_strikethrough() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Strikethrough {
                        content: vec![InlineElement::Text {
                            text: "strike".into(),
                        }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<s>strike</s>"), "strikethrough text");
    }

    #[test]
    fn test_serialize_subscript() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Subscript {
                        content: vec![InlineElement::Text { text: "sub".into() }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<sub>sub</sub>"), "subscript text");
    }

    #[test]
    fn test_serialize_superscript() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Superscript {
                        content: vec![InlineElement::Text { text: "sup".into() }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<sup>sup</sup>"), "superscript text");
    }

    #[test]
    fn test_serialize_line_break() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::LineBreak],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<br/>"), "line break");
    }

    #[test]
    fn test_serialize_no_doctype() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        assert!(
            !output.contains("<!DOCTYPE"),
            "no doctype when doc_type is None"
        );
        assert!(output.contains("<html>"), "html tag still present");
    }

    #[test]
    fn test_serialize_default_impl() {
        let s1 = HtmlSerializer::new();
        let s2: HtmlSerializer = Default::default();
        // Both should produce the same output for an empty doc
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody { elements: vec![] },
        };
        assert_eq!(
            s1.serialize(&doc),
            s2.serialize(&doc),
            "Default should match new()"
        );
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: paragraph with id
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_paragraph_with_id() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Text {
                        text: "hello".into(),
                    }],
                    id: Some("p1".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<p id=\"p1\">"), "p with id");
        assert!(output.contains("hello"));
        assert!(output.contains("</p>"), "p close");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: div without id or class
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_div_plain() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Div {
                    elements: vec![BlockElement::Paragraph {
                        content: vec![InlineElement::Text {
                            text: "plain".into(),
                        }],
                        id: None,
                    }],
                    id: None,
                    class: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<div>"), "plain div open");
        assert!(output.contains("</div>"), "plain div close");
        assert!(output.contains("plain"));
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: unordered list without id
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_unordered_list_plain() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::UnorderedList {
                    items: vec![ListItem {
                        content: vec![InlineElement::Text {
                            text: "item".into(),
                        }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<ul>"), "plain ul open");
        assert!(output.contains("<li>item</li>"), "li content");
        assert!(output.contains("</ul>"), "ul close");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: ordered list with id but no start
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_ordered_list_with_id_only() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::OrderedList {
                    items: vec![ListItem {
                        content: vec![InlineElement::Text {
                            text: "first".into(),
                        }],
                    }],
                    id: Some("ol1".into()),
                    start: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<ol id=\"ol1\">"), "ol with id");
        assert!(!output.contains("start="), "no start attr");
        assert!(output.contains("</ol>"));
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: table without id, header row also covered via td path
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_table_plain() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Table {
                    rows: vec![TableRow {
                        cells: vec![TableCell {
                            content: vec![InlineElement::Text {
                                text: "data".into(),
                            }],
                            colspan: 1,
                            rowspan: 1,
                        }],
                        is_header: false,
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<table>"), "plain table");
        assert!(output.contains("<td>data</td>"), "td content");
        assert!(output.contains("</table>"), "table close");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: blockquote without id
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_blockquote_plain() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Blockquote {
                    elements: vec![BlockElement::HorizontalRule],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<blockquote>"), "plain blockquote");
        assert!(output.contains("<hr/>"), "nested hr");
        assert!(output.contains("</blockquote>"), "blockquote close");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: pre without id
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_pre_plain() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Pre {
                    content: "raw pre".into(),
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<pre>"), "plain pre");
        assert!(output.contains("raw pre"));
        assert!(output.contains("</pre>"), "pre close");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: link without title (no title attr emitted)
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_link_without_title() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Link {
                        href: "/path".into(),
                        title: None,
                        content: vec![InlineElement::Text {
                            text: "click".into(),
                        }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<a href=\"/path\">"), "link without title");
        assert!(!output.contains("title="), "no title attr");
        assert!(output.contains("</a>"));
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: image without alt, with title
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_image_with_title_no_alt() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Image {
                        src: "img.png".into(),
                        alt: None,
                        title: Some("tooltip".into()),
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<img src=\"img.png\""), "img src");
        assert!(!output.contains("alt="), "no alt attr");
        assert!(output.contains("title=\"tooltip\""), "title present");
        assert!(output.contains("/>"), "self-close");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: image without alt and without title
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_image_bare() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Image {
                        src: "bare.png".into(),
                        alt: None,
                        title: None,
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<img src=\"bare.png\"/>"), "bare img");
        assert!(!output.contains("alt="), "no alt");
        assert!(!output.contains("title="), "no title");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: link without rel/href/media_type
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_link_bare() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![],
                styles: vec![],
                links: vec![HtmlLink {
                    rel: None,
                    href: None,
                    media_type: None,
                }],
            },
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        // Bare link should just produce empty <link/>
        assert!(output.contains("<link/>"), "bare link");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: meta with neither charset/name/content
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_meta_bare() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![],
            head: HtmlHead {
                title: None,
                meta: vec![HtmlMeta {
                    name: None,
                    content: None,
                    charset: None,
                }],
                styles: vec![],
                links: vec![],
            },
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<meta/>"), "bare meta tag");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: nested inline elements (bold inside italic)
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_nested_inline() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Paragraph {
                    content: vec![InlineElement::Bold {
                        content: vec![InlineElement::Italic {
                            content: vec![InlineElement::Text {
                                text: "nested".into(),
                            }],
                        }],
                    }],
                    id: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("<strong><em>nested</em></strong>"),
            "bold > italic nested"
        );
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: heading level 1
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_heading_level1() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Heading {
                    level: 1,
                    content: vec![InlineElement::Text {
                        text: "Title".into(),
                    }],
                    id: Some("main-title".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("<h1 id=\"main-title\">Title</h1>"),
            "h1 with id"
        );
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: blockquote containing paragraph with id
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_blockquote_with_paragraph_id() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::Blockquote {
                    elements: vec![BlockElement::Paragraph {
                        content: vec![InlineElement::Text {
                            text: "nested quote".into(),
                        }],
                        id: Some("qp".into()),
                    }],
                    id: Some("bq".into()),
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(
            output.contains("<blockquote id=\"bq\">"),
            "blockquote with id"
        );
        assert!(
            output.contains("<p id=\"qp\">"),
            "p with id inside blockquote"
        );
        assert!(output.contains("nested quote"));
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: html_attributes multiple values
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_multiple_html_attributes() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: vec![("lang".into(), "en".into()), ("dir".into(), "ltr".into())],
            head: HtmlHead::default(),
            body: HtmlBody { elements: vec![] },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("lang=\"en\""), "lang attr");
        assert!(output.contains("dir=\"ltr\""), "dir attr");
    }

    // ---------------------------------------------------------------------------
    // Coverage gap: ordered list without id or start
    // ---------------------------------------------------------------------------

    #[test]
    fn test_serialize_ordered_list_plain() {
        let serializer = HtmlSerializer::new();
        let doc = HtmlDocument {
            doc_type: None,
            html_attributes: vec![],
            head: HtmlHead::default(),
            body: HtmlBody {
                elements: vec![BlockElement::OrderedList {
                    items: vec![ListItem {
                        content: vec![InlineElement::Text { text: "x".into() }],
                    }],
                    id: None,
                    start: None,
                }],
            },
        };
        let output = serializer.serialize(&doc);
        assert!(output.contains("<ol>"), "plain ol open");
        assert!(output.contains("</ol>"), "plain ol close");
    }
}
