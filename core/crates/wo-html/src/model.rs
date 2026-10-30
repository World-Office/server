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
        /// Block text direction from `dir` attr / `style="direction: rtl"`
        /// (F-041: survives HTML round trips, maps to OOXML w:bidi).
        dir: Option<String>,
        /// Paragraph text alignment from `style="text-align: ..."`
        /// (maps to OOXML w:jc; survives round trips).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<String>,
        /// Paragraph-level background color (F-040: style="background-color"
        /// on <p>, maps to OOXML w:shd).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        background: Option<String>,
        /// Paragraph-level borders (F-040: style="border-{side}" on <p>,
        /// maps to OOXML w:pBdr).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        borders: Option<ParagraphBorders>,
        /// Block vertical text direction (RES1): CSS `writing-mode` value
        /// (vertical-rl, vertical-lr, horizontal-tb, sideways-rl/lr), read
        /// from style="writing-mode" and/or the editor's data-textdir attr.
        /// Survives HTML round trips; format conversion drops it (documented).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        writing_mode: Option<String>,
    },
    Div {
        elements: Vec<BlockElement>,
        id: Option<String>,
        class: Option<String>,
    },
    UnorderedList {
        items: Vec<ListItem>,
        id: Option<String>,
        /// C2-2: inline style (e.g. margin-left/text-indent) carried through
        /// the round trip as w:ind left/hanging.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<String>,
    },
    OrderedList {
        items: Vec<ListItem>,
        id: Option<String>,
        start: Option<u32>,
        /// C2-2: inline style (e.g. margin-left/text-indent) carried through
        /// the round trip as w:ind left/hanging.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<String>,
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
        #[serde(default)]
        width: Option<u32>,
        #[serde(default)]
        height: Option<u32>,
    },
    LineBreak,
    /// A comment thread (F-102): anchored inline range with author, body
    /// text and the thread metadata of the editor dialect (span.comment with
    /// data-author/data-comment/data-id/data-resolved/data-replies).
    Comment {
        content: Vec<InlineElement>,
        author: String,
        comment: String,
        id: Option<String>,
        resolved: bool,
        replies: Vec<CommentReply>,
    },
    /// A content control (RES1): editor dialect span.content-control with
    /// data-cc type + title tooltip (plain, date, dropdown, ...). Content
    /// carries the visible inline runs; contenteditable is editor-only.
    ContentControl {
        cc_type: String,
        title: Option<String>,
        content: Vec<InlineElement>,
    },
}

/// One reply inside a comment thread (F-102).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommentReply {
    pub author: String,
    pub text: String,
}

/// Paragraph-level borders (F-040): per-side border from CSS
/// `border-{side}: {width}pt solid {color}`. Maps to OOXML w:pBdr.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ParagraphBorders {
    pub top: Option<ParagraphBorder>,
    pub bottom: Option<ParagraphBorder>,
    pub left: Option<ParagraphBorder>,
    pub right: Option<ParagraphBorder>,
}

/// One side of a paragraph border (F-040).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParagraphBorder {
    /// CSS border-width in pt (e.g. "1pt").
    pub width: String,
    /// CSS border-style (e.g. "solid").
    pub style: String,
    /// CSS border-color (e.g. "#000000").
    pub color: String,
}
