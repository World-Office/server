use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HtmlDocument {
    pub doc_type: Option<String>,
    pub html_attributes: Vec<(String, String)>,
    pub head: HtmlHead,
    pub body: HtmlBody,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HtmlHead {
    pub title: Option<String>,
    pub meta: Vec<HtmlMeta>,
    pub styles: Vec<String>,
    pub links: Vec<HtmlLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HtmlMeta {
    pub name: Option<String>,
    pub content: Option<String>,
    pub charset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HtmlLink {
    pub rel: Option<String>,
    pub href: Option<String>,
    pub media_type: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HtmlBody {
    pub elements: Vec<BlockElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BlockElement {
    Heading {
        level: u8,
        content: Vec<InlineElement>,
        id: Option<String>,
    },
    Paragraph {
        content: Vec<InlineElement>,
        id: Option<String>,
    },
    Div {
        elements: Vec<BlockElement>,
        id: Option<String>,
        class: Option<String>,
    },
    UnorderedList {
        items: Vec<ListItem>,
        id: Option<String>,
    },
    OrderedList {
        items: Vec<ListItem>,
        id: Option<String>,
        start: Option<u32>,
    },
    Table {
        rows: Vec<TableRow>,
        id: Option<String>,
    },
    Blockquote {
        elements: Vec<BlockElement>,
        id: Option<String>,
    },
    Pre {
        content: String,
        id: Option<String>,
    },
    HorizontalRule,
    RawHtml {
        tag: String,
        content: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListItem {
    pub content: Vec<InlineElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableRow {
    pub cells: Vec<TableCell>,
    pub is_header: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableCell {
    pub content: Vec<InlineElement>,
    pub colspan: u32,
    pub rowspan: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InlineElement {
    Text {
        text: String,
        style: Option<String>,
    },
    Bold {
        content: Vec<InlineElement>,
    },
    Italic {
        content: Vec<InlineElement>,
    },
    Underline {
        content: Vec<InlineElement>,
    },
    Strikethrough {
        content: Vec<InlineElement>,
    },
    Subscript {
        content: Vec<InlineElement>,
    },
    Superscript {
        content: Vec<InlineElement>,
    },
    Code {
        content: String,
    },
    Link {
        href: String,
        title: Option<String>,
        content: Vec<InlineElement>,
    },
    Image {
        src: String,
        alt: Option<String>,
        title: Option<String>,
    },
    LineBreak,
}
