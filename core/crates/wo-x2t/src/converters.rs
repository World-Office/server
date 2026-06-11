//! Native format converters: RTF↔TXT, RTF↔HTML, HTML↔TXT, TXT↔HTML,
//! DOCX→TXT, DOCX→HTML, DOCX→ODT, ODT→TXT, ODT→HTML, ODT→DOCX,
//! TXT→RTF, HTML→RTF, RTF→DOCX,
//! EPUB→TXT, EPUB→HTML, EPUB→DOCX, FB2→TXT, FB2→DOCX, HWP→TXT,
//! TXT→DOCX, HTML→DOCX, TXT→ODT, HTML→ODT,
//! XPS→TXT, XPS→HTML, XPS→DOCX, OFD→TXT, OFD→HTML, OFD→DOCX,
//! DJVU→TXT, DJVU→DOCX, HWP→DOCX, DOCX→XPS,
//! TXT→EPUB, HTML→EPUB, DOCX→EPUB, TXT→FB2, HTML→FB2.
//!
//! Each converter implements the `FormatConverter` trait, going directly
//! from source native type to target native type (no intermediate document).

use wo_common::encoding::Encoding;

use crate::converter::FormatConverter;
use crate::error::ConversionError;

use wo_html::model::{
    BlockElement, HtmlBody, HtmlDocument, HtmlHead, InlineElement, TableCell, TableRow,
};
use wo_html::{HtmlParser, HtmlSerializer};
use wo_odf::OdfParser;

use wo_rtf::model::{RtfBlock, RtfDocument, RtfFont, RtfInline};
use wo_rtf::{RtfParser, RtfSerializer};
use wo_txt::parser::TxtDocument;
use wo_txt::serializer::SerializeOptions;
use wo_txt::{TxtParser, TxtSerializer};

use wo_djvu::DjvuParser;
use wo_epub::model::{Chapter as EpubChapter, EpubDocument, EpubMetadata, TocEntry};
use wo_epub::{EpubParser, EpubSerializer};
use wo_fb2::model::{
    Body, ContentElement, DocumentInfo, Fb2Document, Formatting, Section, TextStyle, TitleInfo,
};
use wo_fb2::{Fb2Parser, Fb2Serializer};
use wo_hwp::HwpParser;
use wo_ofd::OfdParser;
use wo_xps::model::{XpsGlyphs, XpsMetadata, XpsPage, XpsPageContent};
use wo_xps::XpsParser;
use wo_xps::XpsSerializer;

use wo_odf::model::{
    CellType, OdfContent, OdfDocument, OdfList, OdfListItem, OdfListType, OdfMetadata, OdfTable,
    OdfTextContent, OdfType, TableCell as OdfTableCell, TableRow as OdfTableRow, TextHeading,
    TextParagraph, TextSpan,
};
use wo_odf::OdfSerializer;
use wo_ooxml::model::{
    AdvanceMode, AnimationData as OoxmlAnimData, Bounds, ConnectorShape, ConnectorShapeType,
    CoreProperties, DocxBody, DocxParagraph, DocxParagraphProperties, DocxRun,
    DocxTable, DocxTableCell, DocxTableRow, Fill, OoxmlDocument, OoxmlFormat, PictureShape,
    PptxPresentation, Slide, SlideShape, SlideSize, SlideTransition, TextBody as OoxmlTextBody,
    TextBoxShape, TransitionEffect, UnderlineType,
};
use wo_ooxml::{OoxmlParser, OoxmlSerializer};

use crate::presentation_model::{
    WoAnimationData, WoImageData, WoPresentation, WoShapeData, WoSlide,
};

// ── Converter structs ────────────────────────────────────────────────

/// Converts RTF → plain text.
pub struct RtfToTxtConverter;

impl FormatConverter for RtfToTxtConverter {
    fn source_format(&self) -> &str {
        "rtf"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let rtf_doc = RtfParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let lines = rtf_blocks_to_text_lines(&rtf_doc.body);

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts RTF → HTML.
pub struct RtfToHtmlConverter;

impl FormatConverter for RtfToHtmlConverter {
    fn source_format(&self) -> &str {
        "rtf"
    }

    fn target_format(&self) -> &str {
        "html"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let rtf_doc = RtfParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let html_doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: Vec::new(),
            head: HtmlHead {
                title: rtf_doc.info.as_ref().and_then(|info| info.title.clone()),
                meta: Vec::new(),
                styles: Vec::new(),
                links: Vec::new(),
            },
            body: HtmlBody {
                elements: rtf_blocks_to_html_blocks(&rtf_doc.body),
            },
        };

        let html_string = HtmlSerializer::new().serialize(&html_doc);
        Ok(html_string.into_bytes())
    }
}

/// Converts HTML → plain text.
pub struct HtmlToTxtConverter;

impl FormatConverter for HtmlToTxtConverter {
    fn source_format(&self) -> &str {
        "html"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let html_doc = HtmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let lines = html_blocks_to_lines(&html_doc.body.elements);

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts plain text → HTML.
pub struct TxtToHtmlConverter;

impl FormatConverter for TxtToHtmlConverter {
    fn source_format(&self) -> &str {
        "txt"
    }

    fn target_format(&self) -> &str {
        "html"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let txt_doc = TxtParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let elements: Vec<BlockElement> = txt_doc
            .lines
            .iter()
            .map(|line| BlockElement::Paragraph {
                content: vec![InlineElement::Text { text: line.clone() }],
                id: None,
            })
            .collect();

        let html_doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: Vec::new(),
            head: HtmlHead::default(),
            body: HtmlBody { elements },
        };

        let html_string = HtmlSerializer::new().serialize(&html_doc);
        Ok(html_string.into_bytes())
    }
}

/// Converts DOCX → plain text.
pub struct DocxToTxtConverter;

impl FormatConverter for DocxToTxtConverter {
    fn source_format(&self) -> &str {
        "docx"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OoxmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let lines = docx_body_to_text_lines(&doc);

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts DOCX → HTML.
pub struct DocxToHtmlConverter;

impl FormatConverter for DocxToHtmlConverter {
    fn source_format(&self) -> &str {
        "docx"
    }

    fn target_format(&self) -> &str {
        "html"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OoxmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let html_doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: Vec::new(),
            head: HtmlHead {
                title: doc.core_properties.title.clone(),
                meta: Vec::new(),
                styles: Vec::new(),
                links: Vec::new(),
            },
            body: HtmlBody {
                elements: docx_body_to_html_blocks(&doc),
            },
        };

        let html_string = HtmlSerializer::new().serialize(&html_doc);
        Ok(html_string.into_bytes())
    }
}

/// Converts ODT → plain text.
pub struct OdtToTxtConverter;

impl FormatConverter for OdtToTxtConverter {
    fn source_format(&self) -> &str {
        "odt"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OdfParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let lines = odf_content_to_text_lines(&doc.content);

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts ODT → HTML.
pub struct OdtToHtmlConverter;

impl FormatConverter for OdtToHtmlConverter {
    fn source_format(&self) -> &str {
        "odt"
    }

    fn target_format(&self) -> &str {
        "html"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OdfParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let html_doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: Vec::new(),
            head: HtmlHead {
                title: doc.metadata.title.clone(),
                meta: Vec::new(),
                styles: Vec::new(),
                links: Vec::new(),
            },
            body: HtmlBody {
                elements: odf_content_to_html_blocks(&doc.content),
            },
        };

        let html_string = HtmlSerializer::new().serialize(&html_doc);
        Ok(html_string.into_bytes())
    }
}

/// Converts plain text → RTF.
pub struct TxtToRtfConverter;

impl FormatConverter for TxtToRtfConverter {
    fn source_format(&self) -> &str {
        "txt"
    }

    fn target_format(&self) -> &str {
        "rtf"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let txt_doc = TxtParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let body: Vec<RtfBlock> = txt_doc
            .lines
            .iter()
            .map(|line| RtfBlock::Paragraph {
                content: vec![RtfInline::Text { text: line.clone() }],
                alignment: None,
                indent_left: None,
                indent_first: None,
            })
            .collect();

        let rtf_doc = RtfDocument {
            version: 1,
            ansi_codepage: Some(1252),
            fonts: vec![RtfFont {
                index: 0,
                name: "Calibri".into(),
                alt_name: None,
                charset: None,
            }],
            colors: vec![],
            body,
            info: None,
        };

        let rtf_string = RtfSerializer::new().serialize(&rtf_doc);
        Ok(rtf_string.into_bytes())
    }
}

/// Converts HTML → RTF.
pub struct HtmlToRtfConverter;

impl FormatConverter for HtmlToRtfConverter {
    fn source_format(&self) -> &str {
        "html"
    }

    fn target_format(&self) -> &str {
        "rtf"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let html_doc = HtmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let body = html_blocks_to_rtf_blocks(&html_doc.body.elements);

        let rtf_doc = RtfDocument {
            version: 1,
            ansi_codepage: Some(1252),
            fonts: vec![RtfFont {
                index: 0,
                name: "Calibri".into(),
                alt_name: None,
                charset: None,
            }],
            colors: vec![],
            body,
            info: html_doc.head.title.map(|title| wo_rtf::model::RtfInfo {
                title: Some(title),
                ..Default::default()
            }),
        };

        let rtf_string = RtfSerializer::new().serialize(&rtf_doc);
        Ok(rtf_string.into_bytes())
    }
}

/// Converts EPUB → plain text.
pub struct EpubToTxtConverter;

impl FormatConverter for EpubToTxtConverter {
    fn source_format(&self) -> &str {
        "epub"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = EpubParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut lines = Vec::new();

        for chapter in &doc.chapters {
            if !chapter.title.is_empty() {
                lines.push(format!("## {}", chapter.title));
            }
            let clean = strip_html_tags(&chapter.content);
            for line in clean.lines() {
                lines.push(line.to_string());
            }
            lines.push(String::new());
        }

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts EPUB → HTML.
pub struct EpubToHtmlConverter;

impl FormatConverter for EpubToHtmlConverter {
    fn source_format(&self) -> &str {
        "epub"
    }

    fn target_format(&self) -> &str {
        "html"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = EpubParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut elements: Vec<BlockElement> = Vec::new();

        // Book title as <h1>
        if let Some(title) = &doc.metadata.title {
            elements.push(BlockElement::Heading {
                level: 1,
                content: vec![InlineElement::Text {
                    text: title.clone(),
                }],
                id: None,
            });
        }

        for chapter in &doc.chapters {
            if !chapter.title.is_empty() {
                elements.push(BlockElement::Heading {
                    level: 2,
                    content: vec![InlineElement::Text {
                        text: chapter.title.clone(),
                    }],
                    id: None,
                });
            }
            let clean = strip_html_tags(&chapter.content);
            for line in clean.lines() {
                if !line.is_empty() {
                    elements.push(BlockElement::Paragraph {
                        content: vec![InlineElement::Text {
                            text: line.to_string(),
                        }],
                        id: None,
                    });
                }
            }
        }

        let html_doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: Vec::new(),
            head: HtmlHead {
                title: doc.metadata.title.clone(),
                meta: Vec::new(),
                styles: Vec::new(),
                links: Vec::new(),
            },
            body: HtmlBody { elements },
        };

        let html_string = HtmlSerializer::new().serialize(&html_doc);
        Ok(html_string.into_bytes())
    }
}

/// Converts FB2 → plain text.
pub struct Fb2ToTxtConverter;

impl FormatConverter for Fb2ToTxtConverter {
    fn source_format(&self) -> &str {
        "fb2"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = Fb2Parser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut lines = Vec::new();

        // Book title
        if let Some(title_info) = &doc.title_info {
            if let Some(book_title) = &title_info.book_title {
                lines.push(format!("# {}", book_title));
                lines.push(String::new());
            }
        }

        for body in &doc.bodies {
            fb2_body_to_lines(body, &mut lines);
        }

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts HWP → plain text.
pub struct HwpToTxtConverter;

impl FormatConverter for HwpToTxtConverter {
    fn source_format(&self) -> &str {
        "hwp"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = HwpParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut lines = Vec::new();

        // Title from doc_info
        if let Some(doc_info) = &doc.doc_info {
            if let Some(title) = &doc_info.title {
                if !title.is_empty() {
                    lines.push(format!("# {}", title));
                    lines.push(String::new());
                }
            }
        }

        for para in &doc.paragraphs {
            lines.push(para.text.clone());
        }

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts plain text → DOCX.
pub struct TxtToDocxConverter;

impl FormatConverter for TxtToDocxConverter {
    fn source_format(&self) -> &str {
        "txt"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let txt_doc = TxtParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = txt_to_ooxml(&txt_doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts HTML → DOCX.
pub struct HtmlToDocxConverter;

impl FormatConverter for HtmlToDocxConverter {
    fn source_format(&self) -> &str {
        "html"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let html_doc = HtmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = html_to_ooxml(&html_doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts plain text → ODT.
pub struct TxtToOdtConverter;

impl FormatConverter for TxtToOdtConverter {
    fn source_format(&self) -> &str {
        "txt"
    }

    fn target_format(&self) -> &str {
        "odt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let txt_doc = TxtParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let odf_doc = txt_to_odf(&txt_doc);

        OdfSerializer::new()
            .serialize(&odf_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts HTML → ODT.
pub struct HtmlToOdtConverter;

impl FormatConverter for HtmlToOdtConverter {
    fn source_format(&self) -> &str {
        "html"
    }

    fn target_format(&self) -> &str {
        "odt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let html_doc = HtmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let odf_doc = html_to_odf(&html_doc);

        OdfSerializer::new()
            .serialize(&odf_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts XPS → plain text.
pub struct XpsToTxtConverter;

impl FormatConverter for XpsToTxtConverter {
    fn source_format(&self) -> &str {
        "xps"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = XpsParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut lines = Vec::new();

        for page in &doc.pages {
            lines.push(format!("Page {}:", page.index + 1));
            for glyph in &page.content.glyphs {
                if !glyph.text.is_empty() {
                    lines.push(glyph.text.clone());
                }
            }
            lines.push(String::new());
        }

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts XPS → HTML.
pub struct XpsToHtmlConverter;

impl FormatConverter for XpsToHtmlConverter {
    fn source_format(&self) -> &str {
        "xps"
    }

    fn target_format(&self) -> &str {
        "html"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = XpsParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut elements: Vec<BlockElement> = Vec::new();

        for page in &doc.pages {
            let mut page_inlines: Vec<InlineElement> = Vec::new();
            for glyph in &page.content.glyphs {
                if !glyph.text.is_empty() {
                    page_inlines.push(InlineElement::Text {
                        text: glyph.text.clone(),
                    });
                }
            }
            if !page_inlines.is_empty() {
                elements.push(BlockElement::Div {
                    elements: vec![BlockElement::Paragraph {
                        content: page_inlines,
                        id: None,
                    }],
                    id: None,
                    class: None,
                });
            }
        }

        let html_doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: Vec::new(),
            head: HtmlHead {
                title: doc.metadata.title.clone(),
                meta: Vec::new(),
                styles: Vec::new(),
                links: Vec::new(),
            },
            body: HtmlBody { elements },
        };

        let html_string = HtmlSerializer::new().serialize(&html_doc);
        Ok(html_string.into_bytes())
    }
}

/// Converts OFD → plain text.
pub struct OfdToTxtConverter;

impl FormatConverter for OfdToTxtConverter {
    fn source_format(&self) -> &str {
        "ofd"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OfdParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut lines = Vec::new();

        for page in &doc.pages {
            lines.push(format!("Page {}:", page.index + 1));
            for text_obj in &page.text_content {
                if !text_obj.text.is_empty() {
                    lines.push(text_obj.text.clone());
                }
            }
            lines.push(String::new());
        }

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts OFD → HTML.
pub struct OfdToHtmlConverter;

impl FormatConverter for OfdToHtmlConverter {
    fn source_format(&self) -> &str {
        "ofd"
    }

    fn target_format(&self) -> &str {
        "html"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OfdParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut elements: Vec<BlockElement> = Vec::new();

        for page in &doc.pages {
            let mut page_inlines: Vec<InlineElement> = Vec::new();
            for text_obj in &page.text_content {
                if text_obj.text.is_empty() {
                    continue;
                }
                let inline: InlineElement = if text_obj.bold && text_obj.italic {
                    InlineElement::Bold {
                        content: vec![InlineElement::Italic {
                            content: vec![InlineElement::Text {
                                text: text_obj.text.clone(),
                            }],
                        }],
                    }
                } else if text_obj.bold {
                    InlineElement::Bold {
                        content: vec![InlineElement::Text {
                            text: text_obj.text.clone(),
                        }],
                    }
                } else if text_obj.italic {
                    InlineElement::Italic {
                        content: vec![InlineElement::Text {
                            text: text_obj.text.clone(),
                        }],
                    }
                } else {
                    InlineElement::Text {
                        text: text_obj.text.clone(),
                    }
                };
                page_inlines.push(inline);
            }
            if !page_inlines.is_empty() {
                elements.push(BlockElement::Div {
                    elements: vec![BlockElement::Paragraph {
                        content: page_inlines,
                        id: None,
                    }],
                    id: None,
                    class: None,
                });
            }
        }

        let html_doc = HtmlDocument {
            doc_type: Some("html".into()),
            html_attributes: Vec::new(),
            head: HtmlHead {
                title: doc.doc_body.as_ref().and_then(|b| b.title.clone()),
                meta: Vec::new(),
                styles: Vec::new(),
                links: Vec::new(),
            },
            body: HtmlBody { elements },
        };

        let html_string = HtmlSerializer::new().serialize(&html_doc);
        Ok(html_string.into_bytes())
    }
}

/// Converts DjVu → plain text (metadata only — DjVu is scanned images with no text layer).
pub struct DjvuToTxtConverter;

impl FormatConverter for DjvuToTxtConverter {
    fn source_format(&self) -> &str {
        "djvu"
    }

    fn target_format(&self) -> &str {
        "txt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = DjvuParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let mut lines = Vec::new();
        lines.push("DjVu Document".to_string());
        lines.push(format!(
            "Title: {}",
            doc.title.as_deref().unwrap_or("(none)")
        ));
        lines.push(format!("Pages: {}", doc.page_count));
        lines.push(format!("Version: {}", doc.version));
        lines.push(format!("Subtype: {}", doc.subtype));

        let txt_doc = TxtDocument {
            lines,
            encoding: Encoding::Utf8,
            had_bom: false,
        };

        TxtSerializer::with_options(SerializeOptions::unix())
            .serialize(&txt_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts plain text → EPUB.
pub struct TxtToEpubConverter;

impl FormatConverter for TxtToEpubConverter {
    fn source_format(&self) -> &str {
        "txt"
    }

    fn target_format(&self) -> &str {
        "epub"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let txt_doc = TxtParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let chapters_data = txt_to_epub_chapters(&txt_doc);

        let book_title = chapters_data
            .first()
            .map(|(t, _)| t.as_str())
            .unwrap_or("Untitled");

        let chapters: Vec<EpubChapter> = chapters_data
            .iter()
            .enumerate()
            .map(|(i, (ch_title, lines))| {
                let href = format!("chapter{}.xhtml", i + 1);
                let body_html = lines
                    .iter()
                    .map(|l| format!("<p>{}</p>", escape_xhtml_text(l)))
                    .collect::<Vec<_>>()
                    .join("\n");
                let content = build_xhtml_content(ch_title, &body_html);
                EpubChapter {
                    title: ch_title.clone(),
                    content,
                    href,
                }
            })
            .collect();

        let spine: Vec<String> = (1..=chapters.len())
            .map(|i| format!("chapter{}", i))
            .collect();

        let toc: Vec<TocEntry> = chapters_data
            .iter()
            .enumerate()
            .map(|(i, (ch_title, _))| TocEntry {
                title: ch_title.clone(),
                href: Some(format!("chapter{}.xhtml", i + 1)),
                level: 1,
                children: Vec::new(),
                play_order: Some(i as u32 + 1),
            })
            .collect();

        let epub_doc = EpubDocument {
            version: "3.0".to_string(),
            metadata: EpubMetadata {
                title: Some(book_title.to_string()),
                language: Some("en".to_string()),
                identifier: Some(format!("urn:uuid:wo-x2t-{:016x}", book_title.len() as u64)),
                unique_identifier: Some("uid".to_string()),
                ..Default::default()
            },
            manifest: Vec::new(),
            spine,
            toc,
            chapters,
            cover_image: None,
            cover_image_type: None,
        };

        EpubSerializer::new()
            .serialize(&epub_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts HTML → EPUB.
pub struct HtmlToEpubConverter;

impl FormatConverter for HtmlToEpubConverter {
    fn source_format(&self) -> &str {
        "html"
    }

    fn target_format(&self) -> &str {
        "epub"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let html_doc = HtmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let book_title = html_doc.head.title.as_deref().unwrap_or("Untitled");

        let chapters_data = html_to_epub_chapters(&html_doc.body.elements);

        let chapters: Vec<EpubChapter> = chapters_data
            .iter()
            .enumerate()
            .map(|(i, (ch_title, elements))| {
                let href = format!("chapter{}.xhtml", i + 1);
                let body_html = elements
                    .iter()
                    .map(block_element_to_xhtml)
                    .collect::<Vec<_>>()
                    .join("\n");
                let content = build_xhtml_content(ch_title, &body_html);
                EpubChapter {
                    title: ch_title.clone(),
                    content,
                    href,
                }
            })
            .collect();

        let spine: Vec<String> = (1..=chapters.len())
            .map(|i| format!("chapter{}", i))
            .collect();

        let toc: Vec<TocEntry> = chapters_data
            .iter()
            .enumerate()
            .map(|(i, (ch_title, _))| TocEntry {
                title: ch_title.clone(),
                href: Some(format!("chapter{}.xhtml", i + 1)),
                level: 1,
                children: Vec::new(),
                play_order: Some(i as u32 + 1),
            })
            .collect();

        let epub_doc = EpubDocument {
            version: "3.0".to_string(),
            metadata: EpubMetadata {
                title: Some(book_title.to_string()),
                language: Some("en".to_string()),
                identifier: Some(format!("urn:uuid:wo-x2t-{:016x}", book_title.len() as u64)),
                unique_identifier: Some("uid".to_string()),
                ..Default::default()
            },
            manifest: Vec::new(),
            spine,
            toc,
            chapters,
            cover_image: None,
            cover_image_type: None,
        };

        EpubSerializer::new()
            .serialize(&epub_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

// ── TXT → FB2 ──────────────────────────────────────────────────────

/// Converts plain text → FB2.
pub struct TxtToFb2Converter;

impl FormatConverter for TxtToFb2Converter {
    fn source_format(&self) -> &str {
        "txt"
    }

    fn target_format(&self) -> &str {
        "fb2"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let txt_doc = TxtParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let book_title = txt_doc
            .lines
            .iter()
            .find(|l| !l.is_empty())
            .cloned()
            .unwrap_or_else(|| "Untitled".to_string());

        let elements: Vec<ContentElement> = txt_doc
            .lines
            .iter()
            .filter(|l| !l.is_empty())
            .map(|line| ContentElement::Paragraph {
                style: None,
                id: None,
                content: vec![Formatting {
                    text: line.clone(),
                    style: TextStyle::None,
                    href: None,
                    title: None,
                }],
            })
            .collect();

        let fb2_doc = Fb2Document {
            xmlns: Some("http://www.gribuser.ru/xml/fictionbook/2.0".to_string()),
            title_info: Some(TitleInfo {
                book_title: Some(book_title),
                lang: Some("en".to_string()),
                ..Default::default()
            }),
            document_info: Some(DocumentInfo {
                id: Some(format!(
                    "wo-txt-fb2-{:x}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis()
                )),
                program_used: Some("World-Office".to_string()),
                ..Default::default()
            }),
            publish_info: None,
            src_title_info: None,
            custom_info: vec![],
            bodies: vec![Body {
                name: None,
                lang: None,
                sections: vec![Section {
                    id: None,
                    title: vec![],
                    elements,
                    sections: vec![],
                }],
                images: vec![],
            }],
            binaries: vec![],
        };

        let xml = Fb2Serializer::new()
            .serialize(&fb2_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))?;
        Ok(xml.into_bytes())
    }
}

// ── HTML → FB2 ─────────────────────────────────────────────────────

/// Converts HTML → FB2.
pub struct HtmlToFb2Converter;

impl FormatConverter for HtmlToFb2Converter {
    fn source_format(&self) -> &str {
        "html"
    }

    fn target_format(&self) -> &str {
        "fb2"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let html_doc = HtmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let book_title = html_doc
            .head
            .title
            .clone()
            .unwrap_or_else(|| "Untitled".to_string());

        let elements = html_elements_to_fb2(&html_doc.body.elements);

        let fb2_doc = Fb2Document {
            xmlns: Some("http://www.gribuser.ru/xml/fictionbook/2.0".to_string()),
            title_info: Some(TitleInfo {
                book_title: Some(book_title),
                lang: Some("en".to_string()),
                ..Default::default()
            }),
            document_info: Some(DocumentInfo {
                id: Some(format!(
                    "wo-html-fb2-{:x}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis()
                )),
                program_used: Some("World-Office".to_string()),
                ..Default::default()
            }),
            publish_info: None,
            src_title_info: None,
            custom_info: vec![],
            bodies: vec![Body {
                name: None,
                lang: None,
                sections: vec![Section {
                    id: None,
                    title: vec![],
                    elements,
                    sections: vec![],
                }],
                images: vec![],
            }],
            binaries: vec![],
        };

        let xml = Fb2Serializer::new()
            .serialize(&fb2_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))?;
        Ok(xml.into_bytes())
    }
}

// ── DOCX → ODT ──────────────────────────────────────────────────────

/// Converts DOCX → ODT (cross-format).
pub struct DocxToOdtConverter;

impl FormatConverter for DocxToOdtConverter {
    fn source_format(&self) -> &str {
        "docx"
    }

    fn target_format(&self) -> &str {
        "odt"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OoxmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let odf_doc = docx_to_odf(&doc);

        OdfSerializer::new()
            .serialize(&odf_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

// ── ODT → DOCX ──────────────────────────────────────────────────────

/// Converts ODT → DOCX (cross-format).
pub struct OdtToDocxConverter;

impl FormatConverter for OdtToDocxConverter {
    fn source_format(&self) -> &str {
        "odt"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OdfParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = odf_to_ooxml(&doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

// ── RTF → DOCX ──────────────────────────────────────────────────────

/// Converts RTF → DOCX (cross-format).
pub struct RtfToDocxConverter;

impl FormatConverter for RtfToDocxConverter {
    fn source_format(&self) -> &str {
        "rtf"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let rtf_doc = RtfParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = rtf_to_ooxml(&rtf_doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

// ── HTML → FB2 helpers ──────────────────────────────────────────────

/// Convert HTML block elements to FB2 content elements.
fn html_elements_to_fb2(elements: &[BlockElement]) -> Vec<ContentElement> {
    let mut result = Vec::new();
    for elem in elements {
        match elem {
            BlockElement::Heading { content, .. } => {
                let text = extract_inline_text(content);
                if !text.is_empty() {
                    result.push(ContentElement::Paragraph {
                        style: None,
                        id: None,
                        content: vec![Formatting {
                            text,
                            style: TextStyle::Strong,
                            href: None,
                            title: None,
                        }],
                    });
                }
            }
            BlockElement::Paragraph { content, .. } => {
                let formatting = inline_elements_to_formatting(content);
                if !formatting.is_empty() {
                    result.push(ContentElement::Paragraph {
                        style: None,
                        id: None,
                        content: formatting,
                    });
                }
            }
            BlockElement::Div { elements, .. } => {
                result.extend(html_elements_to_fb2(elements));
            }
            BlockElement::Blockquote { elements, .. } => {
                result.extend(html_elements_to_fb2(elements));
            }
            BlockElement::Pre { content, .. } => {
                if !content.is_empty() {
                    result.push(ContentElement::Paragraph {
                        style: None,
                        id: None,
                        content: vec![Formatting {
                            text: content.clone(),
                            style: TextStyle::Code,
                            href: None,
                            title: None,
                        }],
                    });
                }
            }
            BlockElement::UnorderedList { items, .. } | BlockElement::OrderedList { items, .. } => {
                for item in items {
                    let formatting = inline_elements_to_formatting(&item.content);
                    if !formatting.is_empty() {
                        result.push(ContentElement::Paragraph {
                            style: None,
                            id: None,
                            content: formatting,
                        });
                    }
                }
            }
            BlockElement::Table { rows, .. } => {
                for row in rows {
                    for cell in &row.cells {
                        let formatting = inline_elements_to_formatting(&cell.content);
                        if !formatting.is_empty() {
                            result.push(ContentElement::Paragraph {
                                style: None,
                                id: None,
                                content: formatting,
                            });
                        }
                    }
                }
            }
            BlockElement::HorizontalRule => {
                result.push(ContentElement::EmptyLine);
            }
            BlockElement::RawHtml { .. } => {}
        }
    }
    result
}

/// Convert HTML inline elements to FB2 formatting items.
fn inline_elements_to_formatting(elements: &[InlineElement]) -> Vec<Formatting> {
    let mut result = Vec::new();
    for elem in elements {
        match elem {
            InlineElement::Text { text } => {
                if !text.is_empty() {
                    result.push(Formatting {
                        text: text.clone(),
                        style: TextStyle::None,
                        href: None,
                        title: None,
                    });
                }
            }
            InlineElement::Bold { content } => {
                for f in inline_elements_to_formatting(content) {
                    result.push(Formatting {
                        text: f.text,
                        style: TextStyle::Strong,
                        href: f.href,
                        title: f.title,
                    });
                }
            }
            InlineElement::Italic { content } => {
                for f in inline_elements_to_formatting(content) {
                    result.push(Formatting {
                        text: f.text,
                        style: TextStyle::Emphasis,
                        href: f.href,
                        title: f.title,
                    });
                }
            }
            InlineElement::Strikethrough { content } => {
                for f in inline_elements_to_formatting(content) {
                    result.push(Formatting {
                        text: f.text,
                        style: TextStyle::Strikethrough,
                        href: f.href,
                        title: f.title,
                    });
                }
            }
            InlineElement::Underline { content } => {
                result.extend(inline_elements_to_formatting(content));
            }
            InlineElement::Subscript { content } => {
                for f in inline_elements_to_formatting(content) {
                    result.push(Formatting {
                        text: f.text,
                        style: TextStyle::Subscript,
                        href: f.href,
                        title: f.title,
                    });
                }
            }
            InlineElement::Superscript { content } => {
                for f in inline_elements_to_formatting(content) {
                    result.push(Formatting {
                        text: f.text,
                        style: TextStyle::Superscript,
                        href: f.href,
                        title: f.title,
                    });
                }
            }
            InlineElement::Code { content } => {
                if !content.is_empty() {
                    result.push(Formatting {
                        text: content.clone(),
                        style: TextStyle::Code,
                        href: None,
                        title: None,
                    });
                }
            }
            InlineElement::Link {
                href,
                title,
                content,
            } => {
                let text = extract_inline_text(content);
                if !text.is_empty() {
                    result.push(Formatting {
                        text,
                        style: TextStyle::None,
                        href: Some(href.clone()),
                        title: title.clone(),
                    });
                }
            }
            InlineElement::Image { alt, .. } => {
                if let Some(alt_text) = alt {
                    if !alt_text.is_empty() {
                        result.push(Formatting {
                            text: alt_text.clone(),
                            style: TextStyle::None,
                            href: None,
                            title: None,
                        });
                    }
                }
            }
            InlineElement::LineBreak => {}
        }
    }
    result
}

/// Extract plain text from a list of inline elements.
fn extract_inline_text(elements: &[InlineElement]) -> String {
    let mut result = String::new();
    for elem in elements {
        match elem {
            InlineElement::Text { text } => result.push_str(text),
            InlineElement::Bold { content }
            | InlineElement::Italic { content }
            | InlineElement::Underline { content }
            | InlineElement::Strikethrough { content }
            | InlineElement::Subscript { content }
            | InlineElement::Superscript { content } => {
                result.push_str(&extract_inline_text(content));
            }
            InlineElement::Code { content } => result.push_str(content),
            InlineElement::Link { content, .. } => {
                result.push_str(&extract_inline_text(content));
            }
            InlineElement::Image { alt, .. } => {
                if let Some(t) = alt {
                    result.push_str(t);
                }
            }
            InlineElement::LineBreak => result.push(' '),
        }
    }
    result
}

// ── RTF helpers ──────────────────────────────────────────────────────

/// Extract plain text from a list of RTF inline elements.
fn extract_rtf_text(inlines: &[RtfInline]) -> String {
    let mut result = String::new();
    for inline in inlines {
        match inline {
            RtfInline::Text { text } => result.push_str(text),
            RtfInline::Bold { content }
            | RtfInline::Italic { content }
            | RtfInline::Underline { content }
            | RtfInline::Strikethrough { content }
            | RtfInline::Superscript { content }
            | RtfInline::Subscript { content }
            | RtfInline::Font { content, .. }
            | RtfInline::FontSize { content, .. }
            | RtfInline::Color { content, .. } => {
                result.push_str(&extract_rtf_text(content));
            }
            RtfInline::LineBreak => result.push('\n'),
            RtfInline::PageBreak => result.push_str("\n\n"),
            RtfInline::Tab => result.push('\t'),
        }
    }
    result
}

/// Convert RTF blocks to plain text lines.
fn rtf_blocks_to_text_lines(blocks: &[RtfBlock]) -> Vec<String> {
    let mut lines = Vec::new();
    for block in blocks {
        match block {
            RtfBlock::Paragraph { content, .. } => {
                let text = extract_rtf_text(content);
                // A paragraph may contain LineBreaks, split those into separate lines
                for part in text.split('\n') {
                    lines.push(part.to_string());
                }
            }
            RtfBlock::Table { rows } => {
                for row in rows {
                    let cells: Vec<String> = row
                        .cells
                        .iter()
                        .map(|c| extract_rtf_text(&c.content))
                        .collect();
                    lines.push(cells.join("\t"));
                }
            }
        }
    }
    lines
}

/// Convert RTF inline elements to HTML inline elements.
fn rtf_to_html_inlines(inlines: &[RtfInline]) -> Vec<InlineElement> {
    let mut result = Vec::new();
    for inline in inlines {
        match inline {
            RtfInline::Text { text } => {
                result.push(InlineElement::Text { text: text.clone() });
            }
            RtfInline::Bold { content } => {
                let inner = rtf_to_html_inlines(content);
                if !inner.is_empty() {
                    result.push(InlineElement::Bold { content: inner });
                }
            }
            RtfInline::Italic { content } => {
                let inner = rtf_to_html_inlines(content);
                if !inner.is_empty() {
                    result.push(InlineElement::Italic { content: inner });
                }
            }
            RtfInline::Underline { content } => {
                let inner = rtf_to_html_inlines(content);
                if !inner.is_empty() {
                    result.push(InlineElement::Underline { content: inner });
                }
            }
            RtfInline::Strikethrough { content } => {
                let inner = rtf_to_html_inlines(content);
                if !inner.is_empty() {
                    result.push(InlineElement::Strikethrough { content: inner });
                }
            }
            RtfInline::Superscript { content } => {
                let inner = rtf_to_html_inlines(content);
                if !inner.is_empty() {
                    result.push(InlineElement::Superscript { content: inner });
                }
            }
            RtfInline::Subscript { content } => {
                let inner = rtf_to_html_inlines(content);
                if !inner.is_empty() {
                    result.push(InlineElement::Subscript { content: inner });
                }
            }
            RtfInline::Font { content, .. }
            | RtfInline::FontSize { content, .. }
            | RtfInline::Color { content, .. } => {
                // Drop font/size/color info, preserve nested content
                result.extend(rtf_to_html_inlines(content));
            }
            RtfInline::LineBreak => {
                result.push(InlineElement::LineBreak);
            }
            RtfInline::PageBreak => {
                // Page breaks have no direct HTML equivalent; skip
            }
            RtfInline::Tab => {
                // Tabs have no direct HTML equivalent; skip
            }
        }
    }
    result
}

/// Convert RTF block elements to HTML block elements.
fn rtf_blocks_to_html_blocks(blocks: &[RtfBlock]) -> Vec<BlockElement> {
    let mut result = Vec::new();
    for block in blocks {
        match block {
            RtfBlock::Paragraph { content, .. } => {
                let inlines = rtf_to_html_inlines(content);
                result.push(BlockElement::Paragraph {
                    content: inlines,
                    id: None,
                });
            }
            RtfBlock::Table { rows } => {
                let html_rows: Vec<TableRow> = rows
                    .iter()
                    .map(|row| TableRow {
                        cells: row
                            .cells
                            .iter()
                            .map(|cell| TableCell {
                                content: rtf_to_html_inlines(&cell.content),
                                colspan: 1,
                                rowspan: 1,
                            })
                            .collect(),
                        is_header: false,
                    })
                    .collect();
                result.push(BlockElement::Table {
                    rows: html_rows,
                    id: None,
                });
            }
        }
    }
    result
}

/// Convert HTML inline elements to RTF inline elements, preserving formatting.
fn html_inlines_to_rtf_inlines(inlines: &[InlineElement]) -> Vec<RtfInline> {
    let mut result = Vec::new();
    for inline in inlines {
        match inline {
            InlineElement::Text { text } => {
                if !text.is_empty() {
                    result.push(RtfInline::Text { text: text.clone() });
                }
            }
            InlineElement::Bold { content } => {
                let inner = html_inlines_to_rtf_inlines(content);
                if !inner.is_empty() {
                    result.push(RtfInline::Bold { content: inner });
                }
            }
            InlineElement::Italic { content } => {
                let inner = html_inlines_to_rtf_inlines(content);
                if !inner.is_empty() {
                    result.push(RtfInline::Italic { content: inner });
                }
            }
            InlineElement::Underline { content } => {
                let inner = html_inlines_to_rtf_inlines(content);
                if !inner.is_empty() {
                    result.push(RtfInline::Underline { content: inner });
                }
            }
            InlineElement::Strikethrough { content } => {
                let inner = html_inlines_to_rtf_inlines(content);
                if !inner.is_empty() {
                    result.push(RtfInline::Strikethrough { content: inner });
                }
            }
            InlineElement::Superscript { content } => {
                let inner = html_inlines_to_rtf_inlines(content);
                if !inner.is_empty() {
                    result.push(RtfInline::Superscript { content: inner });
                }
            }
            InlineElement::Subscript { content } => {
                let inner = html_inlines_to_rtf_inlines(content);
                if !inner.is_empty() {
                    result.push(RtfInline::Subscript { content: inner });
                }
            }
            InlineElement::Link { content, .. } => {
                result.extend(html_inlines_to_rtf_inlines(content));
            }
            InlineElement::Code { content } => {
                if !content.is_empty() {
                    result.push(RtfInline::Text {
                        text: content.clone(),
                    });
                }
            }
            InlineElement::Image { alt, .. } => {
                if let Some(alt_text) = alt {
                    if !alt_text.is_empty() {
                        result.push(RtfInline::Text {
                            text: alt_text.clone(),
                        });
                    }
                }
            }
            InlineElement::LineBreak => {
                result.push(RtfInline::LineBreak);
            }
        }
    }
    result
}

/// Convert HTML block elements to RTF block elements.
fn html_blocks_to_rtf_blocks(elements: &[BlockElement]) -> Vec<RtfBlock> {
    let mut result = Vec::new();
    for element in elements {
        match element {
            BlockElement::Heading { level, content, .. } => {
                // Map heading levels to font sizes (in half-points):
                // h1=32 (16pt), h2=28 (14pt), h3=24 (12pt), h4=22 (11pt), h5=20 (10pt), h6=18 (9pt)
                let half_points = match level {
                    1 => 32,
                    2 => 28,
                    3 => 24,
                    4 => 22,
                    5 => 20,
                    _ => 18,
                };
                let inlines = html_inlines_to_rtf_inlines(content);
                if !inlines.is_empty() {
                    result.push(RtfBlock::Paragraph {
                        content: vec![RtfInline::FontSize {
                            half_points,
                            content: inlines,
                        }],
                        alignment: None,
                        indent_left: None,
                        indent_first: None,
                    });
                }
            }
            BlockElement::Paragraph { content, .. } => {
                let inlines = html_inlines_to_rtf_inlines(content);
                if !inlines.is_empty() {
                    result.push(RtfBlock::Paragraph {
                        content: inlines,
                        alignment: None,
                        indent_left: None,
                        indent_first: None,
                    });
                }
            }
            BlockElement::Div { elements, .. } | BlockElement::Blockquote { elements, .. } => {
                result.extend(html_blocks_to_rtf_blocks(elements));
            }
            BlockElement::UnorderedList { items, .. } => {
                for item in items {
                    let inlines = html_inlines_to_rtf_inlines(&item.content);
                    let mut content = vec![RtfInline::Text {
                        text: "\\bullet ".to_string(),
                    }];
                    content.extend(inlines);
                    result.push(RtfBlock::Paragraph {
                        content,
                        alignment: None,
                        indent_left: Some(720),
                        indent_first: Some(-360),
                    });
                }
            }
            BlockElement::OrderedList { items, start, .. } => {
                for (i, item) in items.iter().enumerate() {
                    let num = start.unwrap_or(1) + i as u32;
                    let inlines = html_inlines_to_rtf_inlines(&item.content);
                    let mut content = vec![RtfInline::Text {
                        text: format!("{}\\tab ", num),
                    }];
                    content.extend(inlines);
                    result.push(RtfBlock::Paragraph {
                        content,
                        alignment: None,
                        indent_left: Some(720),
                        indent_first: Some(-360),
                    });
                }
            }
            BlockElement::Table { rows, .. } => {
                for row in rows {
                    let cells: Vec<wo_rtf::model::RtfTableCell> = row
                        .cells
                        .iter()
                        .map(|c| wo_rtf::model::RtfTableCell {
                            content: html_inlines_to_rtf_inlines(&c.content),
                            width: None,
                        })
                        .collect();
                    result.push(RtfBlock::Table {
                        rows: vec![wo_rtf::model::RtfTableRow { cells }],
                    });
                }
            }
            BlockElement::Pre { content, .. } => {
                for line in content.lines() {
                    result.push(RtfBlock::Paragraph {
                        content: vec![RtfInline::Text {
                            text: line.to_string(),
                        }],
                        alignment: None,
                        indent_left: Some(360),
                        indent_first: None,
                    });
                }
            }
            BlockElement::HorizontalRule => {
                result.push(RtfBlock::Paragraph {
                    content: vec![RtfInline::Text {
                        text: "\\emdash\\emdash\\emdash".to_string(),
                    }],
                    alignment: Some(wo_rtf::model::RtfAlignment::Center),
                    indent_left: None,
                    indent_first: None,
                });
            }
            BlockElement::RawHtml { content, .. } => {
                if !content.trim().is_empty() {
                    result.push(RtfBlock::Paragraph {
                        content: vec![RtfInline::Text {
                            text: content.trim().to_string(),
                        }],
                        alignment: None,
                        indent_left: None,
                        indent_first: None,
                    });
                }
            }
        }
    }
    result
}

// ── HTML helpers ─────────────────────────────────────────────────────

/// Extract plain text from HTML inline elements.
fn extract_html_text(inlines: &[InlineElement]) -> String {
    let mut result = String::new();
    for inline in inlines {
        match inline {
            InlineElement::Text { text } => result.push_str(text),
            InlineElement::Bold { content }
            | InlineElement::Italic { content }
            | InlineElement::Underline { content }
            | InlineElement::Strikethrough { content }
            | InlineElement::Subscript { content }
            | InlineElement::Superscript { content }
            | InlineElement::Link { content, .. } => {
                result.push_str(&extract_html_text(content));
            }
            InlineElement::Code { content } => result.push_str(content),
            InlineElement::Image { alt, .. } => {
                if let Some(alt_text) = alt {
                    result.push_str(alt_text);
                }
            }
            InlineElement::LineBreak => result.push('\n'),
        }
    }
    result
}

/// Convert HTML block elements to plain text lines.
fn html_blocks_to_lines(elements: &[BlockElement]) -> Vec<String> {
    let mut lines = Vec::new();
    for element in elements {
        match element {
            BlockElement::Heading { level, content, .. } => {
                let text = extract_html_text(content);
                let prefix = "#".repeat(*level as usize);
                lines.push(format!("{} {}", prefix, text));
            }
            BlockElement::Paragraph { content, .. } => {
                let text = extract_html_text(content);
                // Paragraphs may contain LineBreaks
                for part in text.split('\n') {
                    lines.push(part.to_string());
                }
            }
            BlockElement::Div { elements, .. } | BlockElement::Blockquote { elements, .. } => {
                lines.extend(html_blocks_to_lines(elements));
            }
            BlockElement::UnorderedList { items, .. } => {
                for item in items {
                    let text = extract_html_text(&item.content);
                    lines.push(format!("- {}", text));
                }
            }
            BlockElement::OrderedList { items, .. } => {
                for (i, item) in items.iter().enumerate() {
                    let text = extract_html_text(&item.content);
                    lines.push(format!("{}. {}", i + 1, text));
                }
            }
            BlockElement::Table { rows, .. } => {
                for row in rows {
                    let cells: Vec<String> = row
                        .cells
                        .iter()
                        .map(|c| extract_html_text(&c.content))
                        .collect();
                    lines.push(cells.join("\t"));
                }
            }
            BlockElement::Pre { content, .. } => {
                for line in content.lines() {
                    lines.push(line.to_string());
                }
            }
            BlockElement::HorizontalRule => {
                lines.push("---".to_string());
            }
            BlockElement::RawHtml { content, .. } => {
                if !content.trim().is_empty() {
                    lines.push(content.trim().to_string());
                }
            }
        }
    }
    lines
}

// ── TO helpers ──────────────────────────────────────────────────────

/// Convert a TXT document to an OOXML DOCX document.
fn txt_to_ooxml(txt_doc: &TxtDocument) -> OoxmlDocument {
    let paragraphs: Vec<DocxParagraph> = txt_doc
        .lines
        .iter()
        .map(|line| DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: line.clone(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: None,
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        })
        .collect();

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties::default(),
        relationships: vec![],
        body: Some(DocxBody {
            paragraphs,
            tables: vec![],
        }),
    }
}

/// Convert an HTML document to an OOXML DOCX document.
fn html_to_ooxml(html_doc: &HtmlDocument) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();
    let mut tables: Vec<DocxTable> = Vec::new();

    for element in &html_doc.body.elements {
        match element {
            BlockElement::Heading { level, content, .. } => {
                let text = extract_html_text(content);
                let font_size = 36u32 - (*level as u32 - 1) * 4;
                let font_size = font_size.max(18);
                paragraphs.push(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text,
                        bold: true,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: Some(font_size),
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    }],
                });
            }
            BlockElement::Paragraph { content, .. } => {
                let runs = html_inlines_to_docx_runs(content);
                if !runs.is_empty() {
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs,
                    });
                }
            }
            BlockElement::UnorderedList { items, .. } => {
                for item in items {
                    let text = extract_html_text(&item.content);
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties {
                            indent_left: Some(720),
                            ..Default::default()
                        },
                        runs: vec![DocxRun {
                            text: format!("\u{2022} {}", text),
                            bold: false,
                            italic: false,
                            underline: None,
                            strikethrough: false,
                            double_strikethrough: false,
                            font: None,
                            font_size: None,
                            font_size_cs: None,
                            color: None,
                            highlight: None,
                            vertical_alignment: None,
                            small_caps: false,
                            all_caps: false,
                        }],
                    });
                }
            }
            BlockElement::OrderedList { items, start, .. } => {
                for (i, item) in items.iter().enumerate() {
                    let num = start.unwrap_or(1) + i as u32;
                    let text = extract_html_text(&item.content);
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties {
                            indent_left: Some(720),
                            ..Default::default()
                        },
                        runs: vec![DocxRun {
                            text: format!("{}. {}", num, text),
                            bold: false,
                            italic: false,
                            underline: None,
                            strikethrough: false,
                            double_strikethrough: false,
                            font: None,
                            font_size: None,
                            font_size_cs: None,
                            color: None,
                            highlight: None,
                            vertical_alignment: None,
                            small_caps: false,
                            all_caps: false,
                        }],
                    });
                }
            }
            BlockElement::Table { rows, .. } => {
                let docx_rows: Vec<DocxTableRow> = rows
                    .iter()
                    .map(|row| DocxTableRow {
                        cells: row
                            .cells
                            .iter()
                            .map(|cell| {
                                let text = extract_html_text(&cell.content);
                                DocxTableCell {
                                    paragraphs: vec![DocxParagraph {
                                        style_id: None,
                                        properties: DocxParagraphProperties::default(),
                                        runs: vec![DocxRun {
                                            text,
                                            bold: false,
                                            italic: false,
                                            underline: None,
                                            strikethrough: false,
                                            double_strikethrough: false,
                                            font: None,
                                            font_size: None,
                                            font_size_cs: None,
                                            color: None,
                                            highlight: None,
                                            vertical_alignment: None,
                                            small_caps: false,
                                            all_caps: false,
                                        }],
                                    }],
                                    column_span: cell.colspan,
                                    row_span: cell.rowspan,
                                    width: None,
                                    shading: None,
                                }
                            })
                            .collect(),
                        height: None,
                        is_header: row.is_header,
                    })
                    .collect();
                tables.push(DocxTable {
                    rows: docx_rows,
                    properties: Default::default(),
                });
            }
            BlockElement::HorizontalRule => {
                paragraphs.push(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text: "\u{2500}".repeat(24),
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    }],
                });
            }
            BlockElement::Pre { content, .. } => {
                for line in content.lines() {
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs: vec![DocxRun {
                            text: line.to_string(),
                            bold: false,
                            italic: false,
                            underline: None,
                            strikethrough: false,
                            double_strikethrough: false,
                            font: None,
                            font_size: None,
                            font_size_cs: None,
                            color: None,
                            highlight: None,
                            vertical_alignment: None,
                            small_caps: false,
                            all_caps: false,
                        }],
                    });
                }
            }
            BlockElement::Div { elements, .. } | BlockElement::Blockquote { elements, .. } => {
                let sub_doc = HtmlDocument {
                    doc_type: None,
                    html_attributes: vec![],
                    head: HtmlHead::default(),
                    body: HtmlBody {
                        elements: elements.clone(),
                    },
                };
                let sub = html_to_ooxml(&sub_doc);
                if let Some(body) = &sub.body {
                    paragraphs.extend(body.paragraphs.clone());
                    tables.extend(body.tables.clone());
                }
            }
            BlockElement::RawHtml { content, .. } => {
                if !content.trim().is_empty() {
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs: vec![DocxRun {
                            text: content.trim().to_string(),
                            bold: false,
                            italic: false,
                            underline: None,
                            strikethrough: false,
                            double_strikethrough: false,
                            font: None,
                            font_size: None,
                            font_size_cs: None,
                            color: None,
                            highlight: None,
                            vertical_alignment: None,
                            small_caps: false,
                            all_caps: false,
                        }],
                    });
                }
            }
        }
    }

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties::default(),
        relationships: vec![],
        body: Some(DocxBody { paragraphs, tables }),
    }
}

/// Convert HTML inline elements to DOCX runs.
fn html_inlines_to_docx_runs(inlines: &[InlineElement]) -> Vec<DocxRun> {
    let mut runs = Vec::new();
    for inline in inlines {
        match inline {
            InlineElement::Text { text } => {
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text: text.clone(),
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            InlineElement::Bold { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text,
                        bold: true,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            InlineElement::Italic { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text,
                        bold: false,
                        italic: true,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            InlineElement::Underline { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text,
                        bold: false,
                        italic: false,
                        underline: Some(UnderlineType::Single),
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            InlineElement::Strikethrough { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text,
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: true,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            InlineElement::Link { content, href, .. } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text: format!("{} ({})", text, href),
                        bold: false,
                        italic: false,
                        underline: Some(UnderlineType::Single),
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            InlineElement::Code { content } => {
                if !content.is_empty() {
                    runs.push(DocxRun {
                        text: content.clone(),
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: Some("Courier New".to_string()),
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            InlineElement::Image { alt, .. } => {
                if let Some(alt_text) = alt {
                    if !alt_text.is_empty() {
                        runs.push(DocxRun {
                            text: alt_text.clone(),
                            bold: false,
                            italic: false,
                            underline: None,
                            strikethrough: false,
                            double_strikethrough: false,
                            font: None,
                            font_size: None,
                            font_size_cs: None,
                            color: None,
                            highlight: None,
                            vertical_alignment: None,
                            small_caps: false,
                            all_caps: false,
                        });
                    }
                }
            }
            InlineElement::LineBreak => {
                if let Some(last) = runs.last_mut() {
                    last.text.push('\n');
                }
            }
            InlineElement::Superscript { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text,
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: Some(wo_ooxml::model::VerticalAlignment::Superscript),
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            InlineElement::Subscript { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text,
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: Some(wo_ooxml::model::VerticalAlignment::Subscript),
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
        }
    }
    runs
}

/// Convert a TXT document to an ODF ODT document.
fn txt_to_odf(txt_doc: &TxtDocument) -> OdfDocument {
    let content: Vec<OdfTextContent> = txt_doc
        .lines
        .iter()
        .map(|line| {
            OdfTextContent::Paragraph(TextParagraph {
                text: line.clone(),
                style_name: None,
                spans: vec![],
            })
        })
        .collect();

    OdfDocument {
        doc_type: OdfType::Text,
        version: "1.2".to_string(),
        metadata: OdfMetadata::default(),
        content: OdfContent::Text {
            content,
            page_layouts: vec![],
            sections: vec![],
        },
        manifest: vec![],
        fonts: vec![],
        styles: vec![],
    }
}

/// Convert an HTML document to an ODF ODT document.
fn html_to_odf(html_doc: &HtmlDocument) -> OdfDocument {
    let content = html_blocks_to_odf_content(&html_doc.body.elements);

    OdfDocument {
        doc_type: OdfType::Text,
        version: "1.2".to_string(),
        metadata: OdfMetadata::default(),
        content: OdfContent::Text {
            content,
            page_layouts: vec![],
            sections: vec![],
        },
        manifest: vec![],
        fonts: vec![],
        styles: vec![],
    }
}

/// Convert HTML block elements to ODF text content.
fn html_blocks_to_odf_content(elements: &[BlockElement]) -> Vec<OdfTextContent> {
    let mut result = Vec::new();
    for element in elements {
        match element {
            BlockElement::Heading { level, content, .. } => {
                let text = extract_html_text(content);
                result.push(OdfTextContent::Heading(TextHeading {
                    text,
                    level: *level as u32,
                    style_name: None,
                }));
            }
            BlockElement::Paragraph { content, .. } => {
                let text = extract_html_text(content);
                let spans = html_inlines_to_odf_spans(content);
                result.push(OdfTextContent::Paragraph(TextParagraph {
                    text,
                    style_name: None,
                    spans,
                }));
            }
            BlockElement::UnorderedList { items, .. } => {
                let list_items: Vec<OdfListItem> = items
                    .iter()
                    .map(|item| OdfListItem {
                        content: item
                            .content
                            .iter()
                            .map(|inline| {
                                OdfTextContent::Paragraph(TextParagraph {
                                    text: extract_html_text(std::slice::from_ref(inline)),
                                    style_name: None,
                                    spans: vec![],
                                })
                            })
                            .collect(),
                        nesting_level: 0,
                    })
                    .collect();
                result.push(OdfTextContent::List(OdfList {
                    list_style_name: None,
                    items: list_items,
                    list_type: OdfListType::Unordered,
                    continue_numbering: false,
                    start_value: None,
                }));
            }
            BlockElement::OrderedList { items, .. } => {
                let list_items: Vec<OdfListItem> = items
                    .iter()
                    .map(|item| OdfListItem {
                        content: item
                            .content
                            .iter()
                            .map(|inline| {
                                OdfTextContent::Paragraph(TextParagraph {
                                    text: extract_html_text(std::slice::from_ref(inline)),
                                    style_name: None,
                                    spans: vec![],
                                })
                            })
                            .collect(),
                        nesting_level: 0,
                    })
                    .collect();
                result.push(OdfTextContent::List(OdfList {
                    list_style_name: None,
                    items: list_items,
                    list_type: OdfListType::Ordered,
                    continue_numbering: false,
                    start_value: None,
                }));
            }
            BlockElement::Table { rows, .. } => {
                let odf_rows: Vec<OdfTableRow> = rows
                    .iter()
                    .map(|row| OdfTableRow {
                        cells: row
                            .cells
                            .iter()
                            .map(|cell| OdfTableCell {
                                text: extract_html_text(&cell.content),
                                row_span: cell.rowspan,
                                col_span: cell.colspan,
                                cell_type: CellType::String,
                                value: None,
                            })
                            .collect(),
                    })
                    .collect();
                let num_columns = rows.first().map(|r| r.cells.len()).unwrap_or(0);
                result.push(OdfTextContent::Table(OdfTable {
                    name: None,
                    rows: odf_rows,
                    num_columns,
                }));
            }
            BlockElement::HorizontalRule => {
                result.push(OdfTextContent::Paragraph(TextParagraph {
                    text: "\u{2500}".repeat(24),
                    style_name: None,
                    spans: vec![],
                }));
            }
            BlockElement::Pre { content, .. } => {
                for line in content.lines() {
                    result.push(OdfTextContent::Paragraph(TextParagraph {
                        text: line.to_string(),
                        style_name: None,
                        spans: vec![],
                    }));
                }
            }
            BlockElement::Div { elements, .. } | BlockElement::Blockquote { elements, .. } => {
                result.extend(html_blocks_to_odf_content(elements));
            }
            BlockElement::RawHtml { content, .. } => {
                if !content.trim().is_empty() {
                    result.push(OdfTextContent::Paragraph(TextParagraph {
                        text: content.trim().to_string(),
                        style_name: None,
                        spans: vec![],
                    }));
                }
            }
        }
    }
    result
}

/// Convert HTML inline elements to ODF text spans.
fn html_inlines_to_odf_spans(inlines: &[InlineElement]) -> Vec<TextSpan> {
    let mut spans = Vec::new();
    for inline in inlines {
        match inline {
            InlineElement::Text { text } => {
                if !text.is_empty() {
                    spans.push(TextSpan {
                        text: text.clone(),
                        style_name: None,
                        bold: false,
                        italic: false,
                        underline: false,
                    });
                }
            }
            InlineElement::Bold { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    spans.push(TextSpan {
                        text,
                        style_name: None,
                        bold: true,
                        italic: false,
                        underline: false,
                    });
                }
            }
            InlineElement::Italic { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    spans.push(TextSpan {
                        text,
                        style_name: None,
                        bold: false,
                        italic: true,
                        underline: false,
                    });
                }
            }
            InlineElement::Underline { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    spans.push(TextSpan {
                        text,
                        style_name: None,
                        bold: false,
                        italic: false,
                        underline: true,
                    });
                }
            }
            InlineElement::Strikethrough { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    spans.push(TextSpan {
                        text,
                        style_name: None,
                        bold: false,
                        italic: false,
                        underline: false,
                    });
                }
            }
            InlineElement::Link { content, href, .. } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    spans.push(TextSpan {
                        text: format!("{} ({})", text, href),
                        style_name: None,
                        bold: false,
                        italic: false,
                        underline: true,
                    });
                }
            }
            InlineElement::Code { content } => {
                if !content.is_empty() {
                    spans.push(TextSpan {
                        text: content.clone(),
                        style_name: None,
                        bold: false,
                        italic: false,
                        underline: false,
                    });
                }
            }
            InlineElement::Image { alt, .. } => {
                if let Some(alt_text) = alt {
                    if !alt_text.is_empty() {
                        spans.push(TextSpan {
                            text: alt_text.clone(),
                            style_name: None,
                            bold: false,
                            italic: false,
                            underline: false,
                        });
                    }
                }
            }
            InlineElement::LineBreak => {
                if let Some(last) = spans.last_mut() {
                    last.text.push('\n');
                }
            }
            InlineElement::Superscript { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    spans.push(TextSpan {
                        text,
                        style_name: None,
                        bold: false,
                        italic: false,
                        underline: false,
                    });
                }
            }
            InlineElement::Subscript { content } => {
                let text = extract_html_text(content);
                if !text.is_empty() {
                    spans.push(TextSpan {
                        text,
                        style_name: None,
                        bold: false,
                        italic: false,
                        underline: false,
                    });
                }
            }
        }
    }
    spans
}

// ── OOXML (DOCX) "from" helpers ─────────────────────────────────────

/// Extract plain text from DOCX runs.
fn extract_docx_run_text(runs: &[DocxRun]) -> String {
    let mut result = String::new();
    for run in runs {
        for ch in run.text.chars() {
            if ch == '\x0C' {
                // form feed → paragraph break
                result.push('\n');
            } else {
                result.push(ch);
            }
        }
    }
    result
}

/// Convert an OOXML document body to plain text lines.
fn docx_body_to_text_lines(doc: &OoxmlDocument) -> Vec<String> {
    let mut lines = Vec::new();

    let body = match &doc.body {
        Some(b) => b,
        None => return lines,
    };

    for para in &body.paragraphs {
        let text = extract_docx_run_text(&para.runs);
        // A paragraph may contain newlines (from <w:br/>), split those
        for part in text.split('\n') {
            lines.push(part.to_string());
        }
    }

    for table in &body.tables {
        for row in &table.rows {
            let cells: Vec<String> = row
                .cells
                .iter()
                .map(|c| {
                    c.paragraphs
                        .iter()
                        .map(|p| extract_docx_run_text(&p.runs))
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .collect();
            lines.push(cells.join("\t"));
        }
    }

    lines
}

/// Convert DOCX runs to HTML inline elements.
fn docx_runs_to_html_inlines(runs: &[DocxRun]) -> Vec<InlineElement> {
    let mut result = Vec::new();
    for run in runs {
        let text = run.text.clone();
        if text.is_empty() {
            continue;
        }

        let element: InlineElement = if run.bold && run.italic {
            InlineElement::Bold {
                content: vec![InlineElement::Italic {
                    content: vec![InlineElement::Text { text }],
                }],
            }
        } else if run.bold {
            InlineElement::Bold {
                content: vec![InlineElement::Text { text }],
            }
        } else if run.italic {
            InlineElement::Italic {
                content: vec![InlineElement::Text { text }],
            }
        } else if run.strikethrough {
            InlineElement::Strikethrough {
                content: vec![InlineElement::Text { text }],
            }
        } else if run.underline.is_some() {
            InlineElement::Underline {
                content: vec![InlineElement::Text { text }],
            }
        } else {
            InlineElement::Text { text }
        };

        result.push(element);
    }
    result
}

/// Convert an OOXML document body to HTML block elements.
fn docx_body_to_html_blocks(doc: &OoxmlDocument) -> Vec<BlockElement> {
    let mut result = Vec::new();

    let body = match &doc.body {
        Some(b) => b,
        None => return result,
    };

    for para in &body.paragraphs {
        // Check for heading style
        let is_heading = para
            .style_id
            .as_deref()
            .is_some_and(|s| s.starts_with("Heading"));

        let level = para
            .style_id
            .as_deref()
            .and_then(|s| s.strip_prefix("Heading"))
            .and_then(|n| n.parse::<u32>().ok())
            .unwrap_or(1);

        let inlines = docx_runs_to_html_inlines(&para.runs);

        if is_heading {
            result.push(BlockElement::Heading {
                level: level as u8,
                content: inlines,
                id: None,
            });
        } else {
            result.push(BlockElement::Paragraph {
                content: inlines,
                id: None,
            });
        }
    }

    for table in &body.tables {
        let html_rows: Vec<TableRow> = table
            .rows
            .iter()
            .map(|row| TableRow {
                cells: row
                    .cells
                    .iter()
                    .map(|cell| {
                        let inlines: Vec<InlineElement> = cell
                            .paragraphs
                            .iter()
                            .flat_map(|p| docx_runs_to_html_inlines(&p.runs))
                            .collect();
                        TableCell {
                            content: inlines,
                            colspan: cell.column_span,
                            rowspan: cell.row_span,
                        }
                    })
                    .collect(),
                is_header: row.is_header,
            })
            .collect();
        result.push(BlockElement::Table {
            rows: html_rows,
            id: None,
        });
    }

    result
}

// ── ODF (ODT) "from" helpers ─────────────────────────────────────────

/// Convert an OOXML document to an ODF document (DOCX → ODT).
fn docx_to_odf(doc: &OoxmlDocument) -> OdfDocument {
    let mut content: Vec<OdfTextContent> = Vec::new();

    if let Some(body) = &doc.body {
        for para in &body.paragraphs {
            let is_heading = para
                .style_id
                .as_deref()
                .is_some_and(|s| s.starts_with("Heading"));

            let level = para
                .style_id
                .as_deref()
                .and_then(|s| s.strip_prefix("Heading"))
                .and_then(|n| n.parse::<u32>().ok())
                .unwrap_or(1);

            if is_heading {
                let text = extract_docx_run_text(&para.runs);
                content.push(OdfTextContent::Heading(TextHeading {
                    text,
                    level,
                    style_name: None,
                }));
            } else {
                let text = extract_docx_run_text(&para.runs);
                let spans = docx_runs_to_odf_spans(&para.runs);
                content.push(OdfTextContent::Paragraph(TextParagraph {
                    text,
                    style_name: None,
                    spans,
                }));
            }
        }

        for table in &body.tables {
            let odf_rows: Vec<OdfTableRow> = table
                .rows
                .iter()
                .map(|row| OdfTableRow {
                    cells: row
                        .cells
                        .iter()
                        .map(|c| {
                            let text = c
                                .paragraphs
                                .iter()
                                .map(|p| extract_docx_run_text(&p.runs))
                                .collect::<Vec<_>>()
                                .join(" ");
                            OdfTableCell {
                                text,
                                row_span: c.row_span,
                                col_span: c.column_span,
                                cell_type: CellType::String,
                                value: None,
                            }
                        })
                        .collect(),
                })
                .collect();
            let num_columns = table.rows.first().map(|r| r.cells.len()).unwrap_or(0);
            content.push(OdfTextContent::Table(OdfTable {
                name: None,
                rows: odf_rows,
                num_columns,
            }));
        }
    }

    OdfDocument {
        doc_type: OdfType::Text,
        version: "1.2".to_string(),
        metadata: OdfMetadata {
            title: doc.core_properties.title.clone(),
            creator: doc.core_properties.creator.clone(),
            subject: doc.core_properties.subject.clone(),
            description: doc.core_properties.description.clone(),
            keywords: doc.core_properties.keywords.clone(),
            language: doc.core_properties.language.clone(),
            ..Default::default()
        },
        content: OdfContent::Text {
            content,
            page_layouts: vec![],
            sections: vec![],
        },
        manifest: vec![],
        fonts: vec![],
        styles: vec![],
    }
}

/// Convert DOCX runs to ODF text spans.
fn docx_runs_to_odf_spans(runs: &[DocxRun]) -> Vec<TextSpan> {
    let mut spans = Vec::new();
    for run in runs {
        if run.text.is_empty() {
            continue;
        }
        spans.push(TextSpan {
            text: run.text.clone(),
            style_name: None,
            bold: run.bold,
            italic: run.italic,
            underline: run.underline.is_some(),
        });
    }
    spans
}

/// Convert an ODF document to an OOXML document (ODT → DOCX).
fn odf_to_ooxml(doc: &OdfDocument) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();
    let mut tables: Vec<DocxTable> = Vec::new();

    if let OdfContent::Text { content, .. } = &doc.content {
        for item in content {
            match item {
                OdfTextContent::Heading(h) => {
                    let font_size = 36u32 - (h.level.saturating_sub(1)) * 4;
                    let font_size = font_size.max(18);
                    paragraphs.push(DocxParagraph {
                        style_id: Some(format!("Heading{}", h.level)),
                        properties: DocxParagraphProperties::default(),
                        runs: vec![DocxRun {
                            text: h.text.clone(),
                            bold: true,
                            italic: false,
                            underline: None,
                            strikethrough: false,
                            double_strikethrough: false,
                            font: None,
                            font_size: Some(font_size),
                            font_size_cs: None,
                            color: None,
                            highlight: None,
                            vertical_alignment: None,
                            small_caps: false,
                            all_caps: false,
                        }],
                    });
                }
                OdfTextContent::Paragraph(p) => {
                    if p.spans.is_empty() {
                        if !p.text.is_empty() {
                            paragraphs.push(DocxParagraph {
                                style_id: None,
                                properties: DocxParagraphProperties::default(),
                                runs: vec![DocxRun {
                                    text: p.text.clone(),
                                    bold: false,
                                    italic: false,
                                    underline: None,
                                    strikethrough: false,
                                    double_strikethrough: false,
                                    font: None,
                                    font_size: None,
                                    font_size_cs: None,
                                    color: None,
                                    highlight: None,
                                    vertical_alignment: None,
                                    small_caps: false,
                                    all_caps: false,
                                }],
                            });
                        }
                    } else {
                        let runs: Vec<DocxRun> = p
                            .spans
                            .iter()
                            .map(|span| DocxRun {
                                text: span.text.clone(),
                                bold: span.bold,
                                italic: span.italic,
                                underline: if span.underline {
                                    Some(UnderlineType::Single)
                                } else {
                                    None
                                },
                                strikethrough: false,
                                double_strikethrough: false,
                                font: None,
                                font_size: None,
                                font_size_cs: None,
                                color: None,
                                highlight: None,
                                vertical_alignment: None,
                                small_caps: false,
                                all_caps: false,
                            })
                            .collect();
                        if !runs.is_empty() {
                            paragraphs.push(DocxParagraph {
                                style_id: None,
                                properties: DocxParagraphProperties::default(),
                                runs,
                            });
                        }
                    }
                }
                OdfTextContent::List(list) => {
                    for (i, list_item) in list.items.iter().enumerate() {
                        for sub_item in &list_item.content {
                            if let OdfTextContent::Paragraph(p) = sub_item {
                                let prefix = match list.list_type {
                                    OdfListType::Ordered => {
                                        format!("{}. ", i + 1)
                                    }
                                    OdfListType::Unordered => "\u{2022} ".to_string(),
                                };
                                paragraphs.push(DocxParagraph {
                                    style_id: None,
                                    properties: DocxParagraphProperties {
                                        indent_left: Some(720),
                                        ..Default::default()
                                    },
                                    runs: vec![DocxRun {
                                        text: format!("{}{}", prefix, p.text),
                                        bold: false,
                                        italic: false,
                                        underline: None,
                                        strikethrough: false,
                                        double_strikethrough: false,
                                        font: None,
                                        font_size: None,
                                        font_size_cs: None,
                                        color: None,
                                        highlight: None,
                                        vertical_alignment: None,
                                        small_caps: false,
                                        all_caps: false,
                                    }],
                                });
                            }
                        }
                    }
                }
                OdfTextContent::Table(table) => {
                    let docx_rows: Vec<DocxTableRow> = table
                        .rows
                        .iter()
                        .map(|row| DocxTableRow {
                            cells: row
                                .cells
                                .iter()
                                .map(|c| DocxTableCell {
                                    paragraphs: vec![DocxParagraph {
                                        style_id: None,
                                        properties: DocxParagraphProperties::default(),
                                        runs: vec![DocxRun {
                                            text: c.text.clone(),
                                            bold: false,
                                            italic: false,
                                            underline: None,
                                            strikethrough: false,
                                            double_strikethrough: false,
                                            font: None,
                                            font_size: None,
                                            font_size_cs: None,
                                            color: None,
                                            highlight: None,
                                            vertical_alignment: None,
                                            small_caps: false,
                                            all_caps: false,
                                        }],
                                    }],
                                    column_span: c.col_span,
                                    row_span: c.row_span,
                                    width: None,
                                    shading: None,
                                })
                                .collect(),
                            height: None,
                            is_header: false,
                        })
                        .collect();
                    tables.push(DocxTable {
                        rows: docx_rows,
                        properties: Default::default(),
                    });
                }
                OdfTextContent::Image(_) => {
                    // Images are not supported in cross-format conversion; skip
                }
            }
        }
    }

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties {
            title: doc.metadata.title.clone(),
            creator: doc.metadata.creator.clone(),
            subject: doc.metadata.subject.clone(),
            description: doc.metadata.description.clone(),
            keywords: doc.metadata.keywords.clone(),
            language: doc.metadata.language.clone(),
            ..Default::default()
        },
        relationships: vec![],
        body: Some(DocxBody { paragraphs, tables }),
    }
}

/// Convert an RTF document to an OOXML document (RTF → DOCX).
fn rtf_to_ooxml(rtf_doc: &RtfDocument) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();

    for block in &rtf_doc.body {
        match block {
            RtfBlock::Paragraph { content, .. } => {
                let runs = rtf_inlines_to_docx_runs(content);
                if !runs.is_empty() {
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs,
                    });
                }
            }
            RtfBlock::Table { rows } => {
                let _docx_rows: Vec<DocxTableRow> = rows
                    .iter()
                    .map(|row| DocxTableRow {
                        cells: row
                            .cells
                            .iter()
                            .map(|c| {
                                let runs = rtf_inlines_to_docx_runs(&c.content);
                                DocxTableCell {
                                    paragraphs: if runs.is_empty() {
                                        vec![]
                                    } else {
                                        vec![DocxParagraph {
                                            style_id: None,
                                            properties: DocxParagraphProperties::default(),
                                            runs,
                                        }]
                                    },
                                    column_span: 1,
                                    row_span: 1,
                                    width: c.width.map(|w| w as i32),
                                    shading: None,
                                }
                            })
                            .collect(),
                        height: None,
                        is_header: false,
                    })
                    .collect();
                paragraphs.push(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![],
                });
                // Tables are collected separately
            }
        }
    }

    // Collect tables from RTF body
    let tables: Vec<DocxTable> = rtf_doc
        .body
        .iter()
        .filter_map(|block| {
            if let RtfBlock::Table { rows } = block {
                let docx_rows: Vec<DocxTableRow> = rows
                    .iter()
                    .map(|row| DocxTableRow {
                        cells: row
                            .cells
                            .iter()
                            .map(|c| {
                                let runs = rtf_inlines_to_docx_runs(&c.content);
                                DocxTableCell {
                                    paragraphs: vec![DocxParagraph {
                                        style_id: None,
                                        properties: DocxParagraphProperties::default(),
                                        runs,
                                    }],
                                    column_span: 1,
                                    row_span: 1,
                                    width: c.width.map(|w| w as i32),
                                    shading: None,
                                }
                            })
                            .collect(),
                        height: None,
                        is_header: false,
                    })
                    .collect();
                Some(DocxTable {
                    rows: docx_rows,
                    properties: Default::default(),
                })
            } else {
                None
            }
        })
        .collect();

    // Remove empty paragraphs that were added for table placeholders
    paragraphs.retain(|p| !p.runs.is_empty());

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties {
            title: rtf_doc.info.as_ref().and_then(|info| info.title.clone()),
            ..Default::default()
        },
        relationships: vec![],
        body: Some(DocxBody { paragraphs, tables }),
    }
}

/// Convert RTF inline elements to DOCX runs.
fn rtf_inlines_to_docx_runs(inlines: &[RtfInline]) -> Vec<DocxRun> {
    let mut runs = Vec::new();
    for inline in inlines {
        match inline {
            RtfInline::Text { text } => {
                if !text.is_empty() {
                    runs.push(DocxRun {
                        text: text.clone(),
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    });
                }
            }
            RtfInline::Bold { content } => {
                for mut run in rtf_inlines_to_docx_runs(content) {
                    run.bold = true;
                    runs.push(run);
                }
            }
            RtfInline::Italic { content } => {
                for mut run in rtf_inlines_to_docx_runs(content) {
                    run.italic = true;
                    runs.push(run);
                }
            }
            RtfInline::Underline { content } => {
                for mut run in rtf_inlines_to_docx_runs(content) {
                    run.underline = Some(UnderlineType::Single);
                    runs.push(run);
                }
            }
            RtfInline::Strikethrough { content } => {
                for mut run in rtf_inlines_to_docx_runs(content) {
                    run.strikethrough = true;
                    runs.push(run);
                }
            }
            RtfInline::Superscript { content } => {
                for mut run in rtf_inlines_to_docx_runs(content) {
                    run.vertical_alignment = Some(wo_ooxml::model::VerticalAlignment::Superscript);
                    runs.push(run);
                }
            }
            RtfInline::Subscript { content } => {
                for mut run in rtf_inlines_to_docx_runs(content) {
                    run.vertical_alignment = Some(wo_ooxml::model::VerticalAlignment::Subscript);
                    runs.push(run);
                }
            }
            RtfInline::Font { content, .. } => {
                runs.extend(rtf_inlines_to_docx_runs(content));
            }
            RtfInline::FontSize { content, .. } => {
                runs.extend(rtf_inlines_to_docx_runs(content));
            }
            RtfInline::Color { content, .. } => {
                runs.extend(rtf_inlines_to_docx_runs(content));
            }
            RtfInline::LineBreak => {
                if let Some(last) = runs.last_mut() {
                    last.text.push('\n');
                }
            }
            RtfInline::PageBreak | RtfInline::Tab => {}
        }
    }
    runs
}

// ── ODF (ODT) "from" helpers (existing) ──────────────────────────────

/// Convert ODF content to plain text lines.
fn odf_content_to_text_lines(content: &OdfContent) -> Vec<String> {
    let mut lines = Vec::new();

    let text_items = match content {
        OdfContent::Text { content, .. } => content,
        _ => return lines,
    };

    for item in text_items {
        match item {
            OdfTextContent::Heading(h) => {
                let prefix = "#".repeat(h.level as usize);
                lines.push(format!("{} {}", prefix, h.text));
            }
            OdfTextContent::Paragraph(p) => {
                if !p.text.is_empty() {
                    lines.push(p.text.clone());
                }
            }
            OdfTextContent::List(list) => {
                for list_item in &list.items {
                    for sub_item in &list_item.content {
                        if let OdfTextContent::Paragraph(p) = sub_item {
                            let prefix = match list.list_type {
                                wo_odf::model::OdfListType::Ordered => {
                                    format!("{}. ", lines.len())
                                }
                                wo_odf::model::OdfListType::Unordered => "- ".to_string(),
                            };
                            lines.push(format!("{}{}", prefix, p.text));
                        }
                    }
                }
            }
            OdfTextContent::Table(table) => {
                for row in &table.rows {
                    let cells: Vec<String> = row.cells.iter().map(|c| c.text.clone()).collect();
                    lines.push(cells.join("\t"));
                }
            }
            OdfTextContent::Image(_) => {
                // Images have no text representation; skip
            }
        }
    }

    lines
}

/// Convert ODF content to HTML block elements.
fn odf_content_to_html_blocks(content: &OdfContent) -> Vec<BlockElement> {
    let mut result = Vec::new();

    let text_items = match content {
        OdfContent::Text { content, .. } => content,
        _ => return result,
    };

    for item in text_items {
        match item {
            OdfTextContent::Heading(h) => {
                result.push(BlockElement::Heading {
                    level: h.level as u8,
                    content: vec![InlineElement::Text {
                        text: h.text.clone(),
                    }],
                    id: None,
                });
            }
            OdfTextContent::Paragraph(p) => {
                let inlines = odf_paragraph_to_inlines(p);
                result.push(BlockElement::Paragraph {
                    content: inlines,
                    id: None,
                });
            }
            OdfTextContent::List(list) => {
                let items: Vec<wo_html::model::ListItem> = list
                    .items
                    .iter()
                    .map(|li| {
                        let inlines: Vec<InlineElement> = li
                            .content
                            .iter()
                            .filter_map(|c| {
                                if let OdfTextContent::Paragraph(p) = c {
                                    Some(InlineElement::Text {
                                        text: p.text.clone(),
                                    })
                                } else {
                                    None
                                }
                            })
                            .collect();
                        wo_html::model::ListItem { content: inlines }
                    })
                    .collect();

                match list.list_type {
                    wo_odf::model::OdfListType::Ordered => {
                        result.push(BlockElement::OrderedList {
                            items,
                            id: None,
                            start: None,
                        });
                    }
                    wo_odf::model::OdfListType::Unordered => {
                        result.push(BlockElement::UnorderedList { items, id: None });
                    }
                }
            }
            OdfTextContent::Table(table) => {
                let html_rows: Vec<TableRow> = table
                    .rows
                    .iter()
                    .map(|row| TableRow {
                        cells: row
                            .cells
                            .iter()
                            .map(|c| TableCell {
                                content: vec![InlineElement::Text {
                                    text: c.text.clone(),
                                }],
                                colspan: c.col_span,
                                rowspan: c.row_span,
                            })
                            .collect(),
                        is_header: false,
                    })
                    .collect();
                result.push(BlockElement::Table {
                    rows: html_rows,
                    id: None,
                });
            }
            OdfTextContent::Image(_) => {
                // Images have no HTML representation in this simple converter; skip
            }
        }
    }

    result
}

/// Convert an ODF paragraph (with spans) to HTML inline elements.
fn odf_paragraph_to_inlines(p: &wo_odf::model::TextParagraph) -> Vec<InlineElement> {
    if p.spans.is_empty() {
        // No spans — emit as single text element
        if p.text.is_empty() {
            return Vec::new();
        }
        return vec![InlineElement::Text {
            text: p.text.clone(),
        }];
    }

    // Build text from spans; the paragraph text is the full text,
    // spans provide styling hints (but bold/italic are always false
    // in the current parser, so just emit spans as text)
    let mut inlines = Vec::new();
    for span in &p.spans {
        if !span.text.is_empty() {
            inlines.push(InlineElement::Text {
                text: span.text.clone(),
            });
        }
    }
    inlines
}

// ── EPUB helpers ─────────────────────────────────────────────────────

/// Escape text for safe inclusion in XHTML content.
fn escape_xhtml_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
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

/// Build a full XHTML document string for an EPUB chapter.
fn build_xhtml_content(title: &str, body_html: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <html xmlns=\"http://www.w3.org/1999/xhtml\">\n\
         <head><title>{}</title></head>\n\
         <body>\n{}\n</body>\n\
         </html>",
        escape_xhtml_text(title),
        body_html
    )
}

/// Split a TXT document into chapters for EPUB conversion.
///
/// If lines start with `## `, those become chapter headings.
/// Otherwise, all content goes into a single chapter.
fn txt_to_epub_chapters(txt_doc: &TxtDocument) -> Vec<(String, Vec<String>)> {
    let has_headings = txt_doc.lines.iter().any(|l| l.starts_with("## "));

    if has_headings {
        let mut chapters = Vec::new();
        let mut current_title: Option<String> = None;
        let mut current_lines: Vec<String> = Vec::new();

        for line in &txt_doc.lines {
            if let Some(heading) = line.strip_prefix("## ") {
                let title = current_title
                    .take()
                    .unwrap_or_else(|| "Untitled".to_string());
                if !current_lines.is_empty() || chapters.is_empty() {
                    chapters.push((title, std::mem::take(&mut current_lines)));
                }
                current_title = Some(heading.to_string());
            } else {
                current_lines.push(line.clone());
            }
        }
        let title = current_title.unwrap_or_else(|| "Untitled".to_string());
        chapters.push((title, current_lines));
        chapters
    } else {
        let title = txt_doc
            .lines
            .first()
            .filter(|l| !l.is_empty())
            .map(|s| s.as_str())
            .unwrap_or("Untitled")
            .to_string();
        vec![(title, txt_doc.lines.clone())]
    }
}

/// Split HTML body elements into chapters for EPUB conversion.
///
/// Each `<h1>` or `<h2>` starts a new chapter.
/// If no headings exist, all content goes into one chapter.
fn html_to_epub_chapters(elements: &[BlockElement]) -> Vec<(String, Vec<BlockElement>)> {
    let has_headings = elements
        .iter()
        .any(|e| matches!(e, BlockElement::Heading { level: 1 | 2, .. }));

    if has_headings {
        let mut chapters = Vec::new();
        let mut current_title = String::new();
        let mut current_elements: Vec<BlockElement> = Vec::new();

        for element in elements {
            if let BlockElement::Heading {
                level: 1 | 2,
                content,
                ..
            } = element
            {
                if !current_elements.is_empty() || !chapters.is_empty() {
                    chapters.push((
                        std::mem::take(&mut current_title),
                        std::mem::take(&mut current_elements),
                    ));
                }
                current_title = extract_html_text(content);
            } else {
                current_elements.push(element.clone());
            }
        }
        if current_title.is_empty() {
            current_title = "Untitled".to_string();
        }
        chapters.push((current_title, current_elements));
        chapters
    } else {
        let title = elements
            .first()
            .and_then(|e| match e {
                BlockElement::Paragraph { content, .. } => {
                    let text = extract_html_text(content);
                    if text.is_empty() {
                        None
                    } else {
                        Some(text)
                    }
                }
                BlockElement::Heading { content, .. } => {
                    let text = extract_html_text(content);
                    if text.is_empty() {
                        None
                    } else {
                        Some(text)
                    }
                }
                _ => None,
            })
            .unwrap_or_else(|| "Untitled".to_string());

        vec![(title, elements.to_vec())]
    }
}

/// Convert an HTML block element to an XHTML string fragment.
fn block_element_to_xhtml(element: &BlockElement) -> String {
    match element {
        BlockElement::Heading { level, content, .. } => {
            let text = extract_html_text(content);
            format!("<h{}>{}</h{}>", level, escape_xhtml_text(&text), level)
        }
        BlockElement::Paragraph { content, .. } => {
            let text = extract_html_text(content);
            format!("<p>{}</p>", escape_xhtml_text(&text))
        }
        BlockElement::UnorderedList { items, .. } => {
            let items_html: Vec<String> = items
                .iter()
                .map(|item| {
                    let text = extract_html_text(&item.content);
                    format!("<li>{}</li>", escape_xhtml_text(&text))
                })
                .collect();
            format!("<ul>\n{}\n</ul>", items_html.join("\n"))
        }
        BlockElement::OrderedList { items, .. } => {
            let items_html: Vec<String> = items
                .iter()
                .map(|item| {
                    let text = extract_html_text(&item.content);
                    format!("<li>{}</li>", escape_xhtml_text(&text))
                })
                .collect();
            format!("<ol>\n{}\n</ol>", items_html.join("\n"))
        }
        BlockElement::Pre { content, .. } => {
            format!("<pre>{}</pre>", escape_xhtml_text(content))
        }
        BlockElement::HorizontalRule => "<hr/>".to_string(),
        BlockElement::Div { elements, .. } => {
            let inner: Vec<String> = elements.iter().map(block_element_to_xhtml).collect();
            inner.join("\n")
        }
        BlockElement::Blockquote { elements, .. } => {
            let inner: Vec<String> = elements.iter().map(block_element_to_xhtml).collect();
            format!("<blockquote>\n{}\n</blockquote>", inner.join("\n"))
        }
        BlockElement::Table { rows, .. } => {
            let rows_html: Vec<String> = rows
                .iter()
                .map(|row| {
                    let cells_html: Vec<String> = row
                        .cells
                        .iter()
                        .map(|cell| {
                            let text = extract_html_text(&cell.content);
                            format!("<td>{}</td>", escape_xhtml_text(&text))
                        })
                        .collect();
                    format!("<tr>{}</tr>", cells_html.join(""))
                })
                .collect();
            format!("<table>\n{}\n</table>", rows_html.join("\n"))
        }
        BlockElement::RawHtml { content, .. } => content.clone(),
    }
}

/// Strip HTML tags from a string, producing plain text.
fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    // Collapse excessive whitespace left by removed tags
    let trimmed: String = result
        .lines()
        .map(|l| l.trim())
        .collect::<Vec<_>>()
        .join("\n");
    trimmed
}

// ── FB2 helpers ──────────────────────────────────────────────────────

use wo_fb2::model::{Body as Fb2Body, Section as Fb2Section};

/// Recursively convert FB2 body content to plain text lines.
fn fb2_body_to_lines(body: &Fb2Body, lines: &mut Vec<String>) {
    for section in &body.sections {
        fb2_section_to_lines(section, lines);
    }
}

/// Recursively convert an FB2 section to plain text lines.
fn fb2_section_to_lines(section: &Fb2Section, lines: &mut Vec<String>) {
    // Section title
    if !section.title.is_empty() {
        let title_text: String = section
            .title
            .iter()
            .map(|te| {
                if te.text.is_empty() {
                    te.formatting.iter().map(|f| f.text.as_str()).collect()
                } else {
                    te.text.clone()
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        if !title_text.trim().is_empty() {
            lines.push(format!("## {}", title_text.trim()));
            lines.push(String::new());
        }
    }

    for element in &section.elements {
        match element {
            ContentElement::Paragraph { content, .. } => {
                let text: String = content.iter().map(|f| f.text.as_str()).collect();
                lines.push(text);
            }
            ContentElement::EmptyLine => {
                lines.push(String::new());
            }
            ContentElement::Subtitle { content } => {
                let text: String = content.iter().map(|f| f.text.as_str()).collect();
                if !text.trim().is_empty() {
                    lines.push(format!("### {}", text.trim()));
                }
            }
            ContentElement::Cite {
                paragraphs,
                text_author,
                ..
            } => {
                for para in paragraphs {
                    let text: String = para.iter().map(|f| f.text.as_str()).collect();
                    lines.push(format!("> {}", text));
                }
                if let Some(author) = text_author {
                    lines.push(format!("  -- {}", author));
                }
                lines.push(String::new());
            }
            ContentElement::TextAuthor { content } => {
                let text: String = content.iter().map(|f| f.text.as_str()).collect();
                if !text.trim().is_empty() {
                    lines.push(format!("  -- {}", text.trim()));
                }
            }
            ContentElement::Date { value, .. } => {
                lines.push(value.clone());
            }
            ContentElement::Image { alt, .. } => {
                if let Some(alt_text) = alt {
                    if !alt_text.is_empty() {
                        lines.push(format!("[image: {}]", alt_text));
                    }
                }
            }
            ContentElement::Poem { title, stanzas, .. } => {
                if !title.is_empty() {
                    let title_text: String = title.iter().map(|te| te.text.as_str()).collect();
                    if !title_text.trim().is_empty() {
                        lines.push(format!("*{}*", title_text.trim()));
                    }
                }
                for stanza in stanzas {
                    for stanza_line in &stanza.lines {
                        let text: String = stanza_line.iter().map(|f| f.text.as_str()).collect();
                        lines.push(format!("  {}", text));
                    }
                    lines.push(String::new());
                }
            }
        }
    }

    // Recurse into nested sections
    for nested in &section.sections {
        fb2_section_to_lines(nested, lines);
    }
}

// ── EPUB → DOCX ──────────────────────────────────────────────────────

/// Converts EPUB → DOCX.
pub struct EpubToDocxConverter;

impl FormatConverter for EpubToDocxConverter {
    fn source_format(&self) -> &str {
        "epub"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let epub_doc = EpubParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = epub_to_ooxml(&epub_doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Convert an EPUB document to an OOXML DOCX document.
fn epub_to_ooxml(epub_doc: &EpubDocument) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();

    // Book title as a large heading
    if let Some(title) = &epub_doc.metadata.title {
        paragraphs.push(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: title.clone(),
                bold: true,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(36),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        });
    }

    for chapter in &epub_doc.chapters {
        // Chapter title as a subheading
        if !chapter.title.is_empty() {
            paragraphs.push(DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs: vec![DocxRun {
                    text: chapter.title.clone(),
                    bold: true,
                    italic: false,
                    underline: None,
                    strikethrough: false,
                    double_strikethrough: false,
                    font: None,
                    font_size: Some(28),
                    font_size_cs: None,
                    color: None,
                    highlight: None,
                    vertical_alignment: None,
                    small_caps: false,
                    all_caps: false,
                }],
            });
        }

        // Chapter content as plain text paragraphs
        let clean = strip_html_tags(&chapter.content);
        for line in clean.lines() {
            if !line.is_empty() {
                paragraphs.push(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text: line.to_string(),
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    }],
                });
            }
        }
    }

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties {
            title: epub_doc.metadata.title.clone(),
            creator: epub_doc.metadata.creator.first().cloned(),
            language: epub_doc.metadata.language.clone(),
            ..Default::default()
        },
        relationships: vec![],
        body: Some(DocxBody {
            paragraphs,
            tables: vec![],
        }),
    }
}

// ── FB2 → DOCX ──────────────────────────────────────────────────────

/// Converts FB2 → DOCX.
pub struct Fb2ToDocxConverter;

impl FormatConverter for Fb2ToDocxConverter {
    fn source_format(&self) -> &str {
        "fb2"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let fb2_doc = Fb2Parser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = fb2_to_ooxml(&fb2_doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Convert an FB2 document to an OOXML DOCX document.
fn fb2_to_ooxml(fb2_doc: &Fb2Document) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();

    // Book title from title_info
    if let Some(title_info) = &fb2_doc.title_info {
        if let Some(book_title) = &title_info.book_title {
            paragraphs.push(DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs: vec![DocxRun {
                    text: book_title.clone(),
                    bold: true,
                    italic: false,
                    underline: None,
                    strikethrough: false,
                    double_strikethrough: false,
                    font: None,
                    font_size: Some(36),
                    font_size_cs: None,
                    color: None,
                    highlight: None,
                    vertical_alignment: None,
                    small_caps: false,
                    all_caps: false,
                }],
            });
        }
    }

    // Extract body content
    for body in &fb2_doc.bodies {
        fb2_body_to_docx_paragraphs(body, &mut paragraphs);
    }

    // Build creator string from authors
    let creator = fb2_doc
        .title_info
        .as_ref()
        .and_then(|ti| ti.authors.first())
        .and_then(|author| {
            let parts: Vec<&str> = [&author.first_name, &author.middle_name, &author.last_name]
                .iter()
                .filter_map(|s| s.as_deref())
                .collect();
            if parts.is_empty() {
                author.full_name.clone()
            } else {
                Some(parts.join(" "))
            }
        });

    let language = fb2_doc.title_info.as_ref().and_then(|ti| ti.lang.clone());

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties {
            title: fb2_doc
                .title_info
                .as_ref()
                .and_then(|ti| ti.book_title.clone()),
            creator,
            language,
            ..Default::default()
        },
        relationships: vec![],
        body: Some(DocxBody {
            paragraphs,
            tables: vec![],
        }),
    }
}

/// Convert FB2 body content to DOCX paragraphs.
fn fb2_body_to_docx_paragraphs(body: &Body, paragraphs: &mut Vec<DocxParagraph>) {
    for section in &body.sections {
        fb2_section_to_docx_paragraphs(section, paragraphs);
    }
}

/// Recursively convert FB2 sections to DOCX paragraphs.
fn fb2_section_to_docx_paragraphs(section: &Section, paragraphs: &mut Vec<DocxParagraph>) {
    // Section title
    if !section.title.is_empty() {
        let title_text: String = section
            .title
            .iter()
            .map(|te| {
                if te.text.is_empty() {
                    te.formatting.iter().map(|f| f.text.as_str()).collect()
                } else {
                    te.text.clone()
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        let title_text = title_text.trim().to_string();
        if !title_text.is_empty() {
            paragraphs.push(DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs: vec![DocxRun {
                    text: title_text,
                    bold: true,
                    italic: false,
                    underline: None,
                    strikethrough: false,
                    double_strikethrough: false,
                    font: None,
                    font_size: Some(28),
                    font_size_cs: None,
                    color: None,
                    highlight: None,
                    vertical_alignment: None,
                    small_caps: false,
                    all_caps: false,
                }],
            });
        }
    }

    for element in &section.elements {
        match element {
            ContentElement::Paragraph { content, .. } => {
                let runs = fb2_formatting_to_docx_runs(content);
                if !runs.is_empty() {
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs,
                    });
                }
            }
            ContentElement::EmptyLine => {
                paragraphs.push(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![],
                });
            }
            ContentElement::Subtitle { content } => {
                let runs = fb2_formatting_to_docx_runs(content);
                if !runs.is_empty() {
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs,
                    });
                }
            }
            ContentElement::Cite {
                paragraphs: cite_paras,
                ..
            } => {
                for para in cite_paras {
                    let runs = fb2_formatting_to_docx_runs(para);
                    if !runs.is_empty() {
                        paragraphs.push(DocxParagraph {
                            style_id: None,
                            properties: DocxParagraphProperties {
                                indent_left: Some(720),
                                ..Default::default()
                            },
                            runs,
                        });
                    }
                }
            }
            ContentElement::TextAuthor { content } => {
                let runs = fb2_formatting_to_docx_runs(content);
                if !runs.is_empty() {
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties {
                            indent_left: Some(720),
                            ..Default::default()
                        },
                        runs,
                    });
                }
            }
            ContentElement::Date { value, .. } => {
                paragraphs.push(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text: value.clone(),
                        bold: false,
                        italic: true,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    }],
                });
            }
            ContentElement::Image { alt, .. } => {
                if let Some(alt_text) = alt {
                    if !alt_text.is_empty() {
                        paragraphs.push(DocxParagraph {
                            style_id: None,
                            properties: DocxParagraphProperties::default(),
                            runs: vec![DocxRun {
                                text: format!("[image: {}]", alt_text),
                                bold: false,
                                italic: true,
                                underline: None,
                                strikethrough: false,
                                double_strikethrough: false,
                                font: None,
                                font_size: None,
                                font_size_cs: None,
                                color: None,
                                highlight: None,
                                vertical_alignment: None,
                                small_caps: false,
                                all_caps: false,
                            }],
                        });
                    }
                }
            }
            ContentElement::Poem {
                title: poem_title,
                stanzas,
                ..
            } => {
                if !poem_title.is_empty() {
                    let title_text: String = poem_title.iter().map(|te| te.text.as_str()).collect();
                    if !title_text.trim().is_empty() {
                        paragraphs.push(DocxParagraph {
                            style_id: None,
                            properties: DocxParagraphProperties {
                                indent_left: Some(720),
                                ..Default::default()
                            },
                            runs: vec![DocxRun {
                                text: title_text.trim().to_string(),
                                bold: true,
                                italic: false,
                                underline: None,
                                strikethrough: false,
                                double_strikethrough: false,
                                font: None,
                                font_size: None,
                                font_size_cs: None,
                                color: None,
                                highlight: None,
                                vertical_alignment: None,
                                small_caps: false,
                                all_caps: false,
                            }],
                        });
                    }
                }
                for stanza in stanzas {
                    for stanza_line in &stanza.lines {
                        let text: String = stanza_line.iter().map(|f| f.text.as_str()).collect();
                        if !text.trim().is_empty() {
                            paragraphs.push(DocxParagraph {
                                style_id: None,
                                properties: DocxParagraphProperties {
                                    indent_left: Some(1080),
                                    ..Default::default()
                                },
                                runs: vec![DocxRun {
                                    text,
                                    bold: false,
                                    italic: true,
                                    underline: None,
                                    strikethrough: false,
                                    double_strikethrough: false,
                                    font: None,
                                    font_size: None,
                                    font_size_cs: None,
                                    color: None,
                                    highlight: None,
                                    vertical_alignment: None,
                                    small_caps: false,
                                    all_caps: false,
                                }],
                            });
                        }
                    }
                    paragraphs.push(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs: vec![],
                    });
                }
            }
        }
    }

    for nested in &section.sections {
        fb2_section_to_docx_paragraphs(nested, paragraphs);
    }
}

/// Convert FB2 formatting items to DOCX runs.
fn fb2_formatting_to_docx_runs(formattings: &[Formatting]) -> Vec<DocxRun> {
    let mut runs = Vec::new();
    for fmt in formattings {
        if fmt.text.is_empty() {
            continue;
        }
        let bold = matches!(fmt.style, TextStyle::Strong);
        let italic = matches!(fmt.style, TextStyle::Emphasis);
        let strikethrough = matches!(fmt.style, TextStyle::Strikethrough);
        let vertical_alignment = match fmt.style {
            TextStyle::Subscript => Some(wo_ooxml::model::VerticalAlignment::Subscript),
            TextStyle::Superscript => Some(wo_ooxml::model::VerticalAlignment::Superscript),
            _ => None,
        };

        runs.push(DocxRun {
            text: fmt.text.clone(),
            bold,
            italic,
            underline: None,
            strikethrough,
            double_strikethrough: false,
            font: if fmt.style == TextStyle::Code {
                Some("Courier New".to_string())
            } else {
                None
            },
            font_size: None,
            font_size_cs: None,
            color: None,
            highlight: None,
            vertical_alignment,
            small_caps: false,
            all_caps: false,
        });
    }
    runs
}

// ── DOCX → EPUB ──────────────────────────────────────────────────────

/// Converts DOCX → EPUB.
pub struct DocxToEpubConverter;

impl FormatConverter for DocxToEpubConverter {
    fn source_format(&self) -> &str {
        "docx"
    }

    fn target_format(&self) -> &str {
        "epub"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OoxmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let epub_doc = docx_to_epub(&doc);

        EpubSerializer::new()
            .serialize(&epub_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Convert an OOXML DOCX document to an EPUB document.
fn docx_to_epub(doc: &OoxmlDocument) -> EpubDocument {
    let book_title = doc
        .core_properties
        .title
        .clone()
        .unwrap_or_else(|| "Untitled".to_string());

    let body = match &doc.body {
        Some(b) => b,
        None => {
            let chapters = vec![EpubChapter {
                title: book_title.clone(),
                content: build_xhtml_content(&book_title, "<p/>"),
                href: "chapter1.xhtml".to_string(),
            }];
            return EpubDocument {
                version: "3.0".to_string(),
                metadata: EpubMetadata {
                    title: Some(book_title.clone()),
                    language: Some("en".to_string()),
                    identifier: Some("urn:uuid:wo-x2t-docx-epub".to_string()),
                    unique_identifier: Some("uid".to_string()),
                    ..Default::default()
                },
                manifest: Vec::new(),
                spine: vec!["chapter1".to_string()],
                toc: vec![TocEntry {
                    title: book_title.clone(),
                    href: Some("chapter1.xhtml".to_string()),
                    level: 1,
                    children: Vec::new(),
                    play_order: Some(1),
                }],
                chapters,
                cover_image: None,
                cover_image_type: None,
            };
        }
    };

    let chapters_data = docx_body_to_epub_chapters(body);

    let chapters: Vec<EpubChapter> = chapters_data
        .iter()
        .enumerate()
        .map(|(i, (ch_title, lines))| {
            let href = format!("chapter{}.xhtml", i + 1);
            let body_html = lines
                .iter()
                .map(|l| format!("<p>{}</p>", escape_xhtml_text(l)))
                .collect::<Vec<_>>()
                .join("\n");
            let content = build_xhtml_content(ch_title, &body_html);
            EpubChapter {
                title: ch_title.clone(),
                content,
                href,
            }
        })
        .collect();

    let spine: Vec<String> = (1..=chapters.len())
        .map(|i| format!("chapter{}", i))
        .collect();

    let toc: Vec<TocEntry> = chapters_data
        .iter()
        .enumerate()
        .map(|(i, (ch_title, _))| TocEntry {
            title: ch_title.clone(),
            href: Some(format!("chapter{}.xhtml", i + 1)),
            level: 1,
            children: Vec::new(),
            play_order: Some(i as u32 + 1),
        })
        .collect();

    EpubDocument {
        version: "3.0".to_string(),
        metadata: EpubMetadata {
            title: Some(book_title),
            language: doc
                .core_properties
                .language
                .clone()
                .or(Some("en".to_string())),
            identifier: Some(format!(
                "urn:uuid:wo-x2t-docx-epub-{:016x}",
                doc.core_properties
                    .title
                    .as_deref()
                    .unwrap_or("untitled")
                    .len() as u64
            )),
            unique_identifier: Some("uid".to_string()),
            creator: doc
                .core_properties
                .creator
                .as_ref()
                .map(|c| vec![c.clone()])
                .unwrap_or_default(),
            ..Default::default()
        },
        manifest: Vec::new(),
        spine,
        toc,
        chapters,
        cover_image: None,
        cover_image_type: None,
    }
}

/// Split DOCX body into chapters for EPUB conversion.
fn docx_body_to_epub_chapters(body: &DocxBody) -> Vec<(String, Vec<String>)> {
    let has_headings = body.paragraphs.iter().any(|p| {
        p.style_id
            .as_deref()
            .is_some_and(|s| s.starts_with("Heading"))
    });

    if has_headings {
        let mut chapters = Vec::new();
        let mut current_title: Option<String> = None;
        let mut current_lines: Vec<String> = Vec::new();

        for para in &body.paragraphs {
            if para
                .style_id
                .as_deref()
                .is_some_and(|s| s.starts_with("Heading"))
            {
                let title = current_title
                    .take()
                    .unwrap_or_else(|| "Untitled".to_string());
                if !current_lines.is_empty() || chapters.is_empty() {
                    chapters.push((title, std::mem::take(&mut current_lines)));
                }
                current_title = Some(extract_docx_run_text(&para.runs));
            } else {
                let text = extract_docx_run_text(&para.runs);
                if !text.is_empty() {
                    current_lines.push(text);
                }
            }
        }

        let title = current_title.unwrap_or_else(|| "Untitled".to_string());
        chapters.push((title, current_lines));
        chapters
    } else {
        let title = body
            .paragraphs
            .first()
            .map(|p| extract_docx_run_text(&p.runs))
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "Untitled".to_string());

        let lines: Vec<String> = body
            .paragraphs
            .iter()
            .map(|p| extract_docx_run_text(&p.runs))
            .filter(|t| !t.is_empty())
            .collect();

        vec![(title, lines)]
    }
}

// ── XPS → DOCX ──────────────────────────────────────────────────────

/// Converts XPS → DOCX.
pub struct XpsToDocxConverter;

impl FormatConverter for XpsToDocxConverter {
    fn source_format(&self) -> &str {
        "xps"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = XpsParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = xps_to_ooxml(&doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Convert an XPS document to an OOXML DOCX document.
fn xps_to_ooxml(xps_doc: &wo_xps::model::XpsDocument) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();

    for page in &xps_doc.pages {
        for glyph in &page.content.glyphs {
            if !glyph.text.is_empty() {
                paragraphs.push(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text: glyph.text.clone(),
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: None,
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    }],
                });
            }
        }
    }

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties {
            title: xps_doc.metadata.title.clone(),
            creator: xps_doc.metadata.author.clone(),
            subject: xps_doc.metadata.subject.clone(),
            ..Default::default()
        },
        relationships: vec![],
        body: Some(DocxBody {
            paragraphs,
            tables: vec![],
        }),
    }
}

// ── OFD → DOCX ──────────────────────────────────────────────────────

/// Converts OFD → DOCX.
pub struct OfdToDocxConverter;

impl FormatConverter for OfdToDocxConverter {
    fn source_format(&self) -> &str {
        "ofd"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OfdParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = ofd_to_ooxml(&doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Convert an OFD document to an OOXML DOCX document.
fn ofd_to_ooxml(ofd_doc: &wo_ofd::model::OfdDocument) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();

    for page in &ofd_doc.pages {
        for text_obj in &page.text_content {
            if text_obj.text.is_empty() {
                continue;
            }
            paragraphs.push(DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs: vec![DocxRun {
                    text: text_obj.text.clone(),
                    bold: text_obj.bold,
                    italic: text_obj.italic,
                    underline: None,
                    strikethrough: false,
                    double_strikethrough: false,
                    font: None,
                    font_size: text_obj.font_size.map(|f| f as u32),
                    font_size_cs: None,
                    color: None,
                    highlight: None,
                    vertical_alignment: None,
                    small_caps: false,
                    all_caps: false,
                }],
            });
        }
    }

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties {
            title: ofd_doc.doc_body.as_ref().and_then(|b| b.title.clone()),
            creator: ofd_doc.doc_body.as_ref().and_then(|b| b.author.clone()),
            ..Default::default()
        },
        relationships: vec![],
        body: Some(DocxBody {
            paragraphs,
            tables: vec![],
        }),
    }
}

// ── HWP → DOCX ──────────────────────────────────────────────────────

/// Converts HWP → DOCX.
pub struct HwpToDocxConverter;

impl FormatConverter for HwpToDocxConverter {
    fn source_format(&self) -> &str {
        "hwp"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = HwpParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = hwp_to_ooxml(&doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Convert an HWP document to an OOXML DOCX document.
fn hwp_to_ooxml(hwp_doc: &wo_hwp::model::HwpDocument) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();

    // Title from doc_info
    if let Some(doc_info) = &hwp_doc.doc_info {
        if let Some(title) = &doc_info.title {
            if !title.is_empty() {
                paragraphs.push(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text: title.clone(),
                        bold: true,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: Some(36),
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    }],
                });
            }
        }
    }

    for para in &hwp_doc.paragraphs {
        paragraphs.push(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: para.text.clone(),
                bold: para.bold,
                italic: para.italic,
                underline: if para.underline {
                    Some(UnderlineType::Single)
                } else {
                    None
                },
                strikethrough: false,
                double_strikethrough: false,
                font: para.font_name.clone(),
                font_size: para.font_size.map(|f| f as u32),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        });
    }

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties {
            title: hwp_doc
                .doc_info
                .as_ref()
                .and_then(|di| di.title.clone())
                .or(hwp_doc.metadata.title.clone()),
            creator: hwp_doc
                .doc_info
                .as_ref()
                .and_then(|di| di.author.clone())
                .or(hwp_doc.metadata.author.clone()),
            ..Default::default()
        },
        relationships: vec![],
        body: Some(DocxBody {
            paragraphs,
            tables: vec![],
        }),
    }
}

// ── DjVu → DOCX ─────────────────────────────────────────────────────

/// Converts DjVu → DOCX (minimal — DjVu is scanned images with no text layer).
pub struct DjvuToDocxConverter;

impl FormatConverter for DjvuToDocxConverter {
    fn source_format(&self) -> &str {
        "djvu"
    }

    fn target_format(&self) -> &str {
        "docx"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = DjvuParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let ooxml_doc = djvu_to_ooxml(&doc);

        OoxmlSerializer::new()
            .serialize(&ooxml_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Convert a DjVu document to an OOXML DOCX document (metadata-only).
fn djvu_to_ooxml(djvu_doc: &wo_djvu::model::DjvuDocument) -> OoxmlDocument {
    let mut paragraphs: Vec<DocxParagraph> = Vec::new();

    // Title line
    if let Some(title) = &djvu_doc.title {
        if !title.is_empty() {
            paragraphs.push(DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs: vec![DocxRun {
                    text: title.clone(),
                    bold: true,
                    italic: false,
                    underline: None,
                    strikethrough: false,
                    double_strikethrough: false,
                    font: None,
                    font_size: Some(36),
                    font_size_cs: None,
                    color: None,
                    highlight: None,
                    vertical_alignment: None,
                    small_caps: false,
                    all_caps: false,
                }],
            });
        }
    }

    // Metadata line
    paragraphs.push(DocxParagraph {
        style_id: None,
        properties: DocxParagraphProperties::default(),
        runs: vec![DocxRun {
            text: format!(
                "DjVu Document — {} pages, version {}, subtype {}",
                djvu_doc.page_count, djvu_doc.version, djvu_doc.subtype
            ),
            bold: false,
            italic: true,
            underline: None,
            strikethrough: false,
            double_strikethrough: false,
            font: None,
            font_size: None,
            font_size_cs: None,
            color: None,
            highlight: None,
            vertical_alignment: None,
            small_caps: false,
            all_caps: false,
        }],
    });

    OoxmlDocument {
        format: OoxmlFormat::Docx,
        version: "1.0".to_string(),
        content_types: vec![],
        main_part: Some("word/document.xml".to_string()),
        shared_strings: vec![],
        part_count: 1,
        core_properties: CoreProperties {
            title: djvu_doc.title.clone(),
            ..Default::default()
        },
        relationships: vec![],
        body: Some(DocxBody {
            paragraphs,
            tables: vec![],
        }),
    }
}

// ── DOCX → XPS ──────────────────────────────────────────────────────

/// Converts DOCX → XPS.
pub struct DocxToXpsConverter;

impl FormatConverter for DocxToXpsConverter {
    fn source_format(&self) -> &str {
        "docx"
    }

    fn target_format(&self) -> &str {
        "xps"
    }

    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let doc = OoxmlParser::new()
            .parse(data)
            .map_err(|e| ConversionError::Parse(e.to_string()))?;

        let xps_doc = docx_to_xps(&doc);

        XpsSerializer::new()
            .serialize(&xps_doc)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Convert an OOXML DOCX document to an XPS document.
fn docx_to_xps(doc: &OoxmlDocument) -> wo_xps::model::XpsDocument {
    const PAGE_WIDTH: f64 = 612.0;
    const PAGE_HEIGHT: f64 = 792.0;
    const TOP_MARGIN: f64 = 72.0;
    const BOTTOM_MARGIN: f64 = 72.0;
    const LINE_HEIGHT: f64 = 18.0;

    // Collect all lines from the DOCX body
    let mut lines: Vec<String> = Vec::new();
    if let Some(body) = &doc.body {
        for para in &body.paragraphs {
            let text = extract_docx_run_text(&para.runs);
            if !text.is_empty() {
                for line in text.split('\n') {
                    if !line.is_empty() {
                        lines.push(line.to_string());
                    }
                }
            }
        }
    }

    // Split lines into pages
    let mut pages: Vec<XpsPage> = Vec::new();
    let mut current_glyphs: Vec<XpsGlyphs> = Vec::new();
    let mut current_y = TOP_MARGIN;
    let mut page_idx: u32 = 0;

    for line_text in &lines {
        if current_y + LINE_HEIGHT > PAGE_HEIGHT - BOTTOM_MARGIN {
            // Flush current page
            pages.push(XpsPage {
                index: page_idx,
                width: PAGE_WIDTH,
                height: PAGE_HEIGHT,
                content: XpsPageContent {
                    glyphs: std::mem::take(&mut current_glyphs),
                    paths: vec![],
                },
            });
            page_idx += 1;
            current_y = TOP_MARGIN;
        }

        current_glyphs.push(XpsGlyphs {
            text: line_text.clone(),
            font_uri: "/Documents/1/Resources/Fonts/Arial.ttf".to_string(),
            font_size: 12.0,
            origin_x: 72.0,
            origin_y: current_y,
            fill: Some("#FF000000".to_string()),
            is_unicode: true,
        });
        current_y += LINE_HEIGHT;
    }

    // Flush last page
    pages.push(XpsPage {
        index: page_idx,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        content: XpsPageContent {
            glyphs: current_glyphs,
            paths: vec![],
        },
    });

    if pages.is_empty() {
        pages.push(XpsPage {
            index: 0,
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            content: XpsPageContent {
                glyphs: vec![],
                paths: vec![],
            },
        });
    }

    let page_count = pages.len() as u32;

    wo_xps::model::XpsDocument {
        page_count,
        pages,
        fonts: vec![],
        images: vec![],
        relationships: vec![],
        metadata: XpsMetadata {
            title: doc.core_properties.title.clone(),
            author: doc.core_properties.creator.clone(),
            subject: doc.core_properties.subject.clone(),
            ..Default::default()
        },
    }
}

// ── Presentation format converters (WoPresentation ↔ PPTX) ──────────
//
// These converters bridge the frontend JSON presentation format
// with the OOXML PPTX format via the wo-ooxml PptxPresentation model.

/// Canvas logical width used by the frontend (all slide sizes).
const CANVAS_WIDTH: f64 = 960.0;

/// Canvas logical heights by slide size name.
fn canvas_height(slide_size: &str) -> f64 {
    match slide_size {
        "standard" => 720.0,
        _ => 540.0, // widescreen / default
    }
}

/// Convert a frontend pixel coordinate to OOXML EMU.
fn px_to_emu(px: f64, canvas_dim: f64, slide_dim: i64) -> i64 {
    (px * slide_dim as f64 / canvas_dim) as i64
}

/// Convert OOXML EMU back to frontend pixel coordinate.
fn emu_to_px(emu: i64, canvas_dim: f64, slide_dim: i64) -> f64 {
    if slide_dim == 0 {
        return 0.0;
    }
    emu as f64 * canvas_dim / slide_dim as f64
}

/// Parse a data URL of the form `data:image/png;base64,<data>`.
fn parse_data_url(url: &str) -> (String, Vec<u8>) {
    if let Some(rest) = url.strip_prefix("data:") {
        if let Some(comma_pos) = rest.find(',') {
            let header = &rest[..comma_pos];
            let b64_data = &rest[comma_pos + 1..];
            // Determine extension from MIME type
            let ext = if header.contains("png") {
                "png"
            } else if header.contains("jpeg") || header.contains("jpg") {
                "jpg"
            } else if header.contains("gif") {
                "gif"
            } else if header.contains("bmp") {
                "bmp"
            } else if header.contains("webp") {
                "webp"
            } else {
                "png" // fallback
            };
            let decoded = base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                b64_data,
            )
            .unwrap_or_default();
            return (ext.to_string(), decoded);
        }
    }
    ("png".to_string(), Vec::new())
}

/// Encode raw image data into a data URL.
fn encode_data_url(ext: &str, data: &[u8]) -> String {
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        data,
    );
    format!("data:{};base64,{}", mime, b64)
}

/// Convert a frontend WoShapeData to an OOXML SlideShape.
fn wo_shape_to_slide_shape(
    shape: &WoShapeData,
    slide_size: &SlideSize,
    slide_size_name: &str,
) -> SlideShape {
    let cw = CANVAS_WIDTH;
    let ch = canvas_height(slide_size_name);

    let bounds = Bounds {
        x: px_to_emu(shape.x, cw, slide_size.cx),
        y: px_to_emu(shape.y, ch, slide_size.cy),
        cx: px_to_emu(shape.width, cw, slide_size.cx),
        cy: px_to_emu(shape.height, ch, slide_size.cy),
    };

    match shape.shape_type.as_str() {
        "image" => {
            // Build PictureShape from imageData
            let (image_extension, image_data) = shape
                .image_data
                .as_ref()
                .map(|img| parse_data_url(&img.src))
                .unwrap_or_else(|| ("png".to_string(), Vec::new()));

            SlideShape::Picture(PictureShape {
                id: shape.id.clone(),
                bounds,
                name: shape.image_data.as_ref()
                    .and_then(|img| img.alt.clone())
                    .unwrap_or_else(|| "Image".to_string()),
                image_extension,
                image_data,
                effect: None,
            })
        }
        "line" | "arrow" | "connector" => {
            let ctype = if shape.shape_type == "connector" {
                ConnectorShapeType::Straight
            } else {
                ConnectorShapeType::Straight
            };
            SlideShape::Connector(ConnectorShape {
                id: shape.id.clone(),
                bounds,
                connector_type: ctype,
                line_width: shape
                    .stroke_width
                    .map(|w| px_to_emu(w, cw, slide_size.cx)),
                has_start_arrow: shape.shape_type == "arrow",
                has_end_arrow: shape.shape_type == "arrow" || shape.shape_type == "line",
                fill: shape.fill_color.as_ref().map(|c| {
                    Fill::Solid(c.trim_start_matches('#').to_string())
                }),
                effect: None,
            })
        }
        _ => {
            // TextBox or rectangle/ellipse/etc.
            let text_body = if let Some(ref text) = shape.text {
                OoxmlTextBody {
                    paragraphs: vec![DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs: vec![DocxRun {
                            text: text.clone(),
                            font_size: shape.font_size.map(|fs| (fs * 100.0) as u32),
                            color: shape.font_color.as_ref().map(|fc| fc.trim_start_matches('#').to_string()),
                            ..DocxRun::default()
                        }],
                    }],
                }
            } else {
                OoxmlTextBody {
                    paragraphs: vec![DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs: vec![],
                    }],
                }
            };

            let fill = shape.fill_color.as_ref().map(|c| {
                Fill::Solid(c.trim_start_matches('#').to_string())
            });

            SlideShape::TextBox(TextBoxShape {
                id: shape.id.clone(),
                bounds,
                text_body,
                fill,
                effect: None,
            })
        }
    }
}

/// Convert an OOXML SlideShape back to a frontend WoShapeData.
fn slide_shape_to_wo_shape(
    shape: &SlideShape,
    slide_size: &SlideSize,
    slide_size_name: &str,
) -> WoShapeData {
    let cw = CANVAS_WIDTH;
    let ch = canvas_height(slide_size_name);

    let (id, bounds, shape_type, fill_color, text, font_size, font_color, stroke_width,
         _has_arrow_start, _has_arrow_end, image_data) = match shape {
        SlideShape::TextBox(tb) => {
            let (txt, fs, fc) = extract_text_info(&tb.text_body);
            (
                tb.id.clone(),
                tb.bounds,
                "textbox".to_string(),
                tb.fill.as_ref().and_then(|f| match f {
                    Fill::Solid(c) => Some(format!("#{}", c)),
                    _ => None,
                }),
                txt,
                fs,
                fc,
                None,
                false,
                false,
                None,
            )
        }
        SlideShape::Picture(pic) => {
            let img_data = if pic.image_data.is_empty() {
                None
            } else {
                Some(WoImageData {
                    src: encode_data_url(&pic.image_extension, &pic.image_data),
                    alt: Some(pic.name.clone()),
                })
            };
            (
                pic.id.clone(),
                pic.bounds,
                "image".to_string(),
                None,
                None,
                None,
                None,
                None,
                false,
                false,
                img_data,
            )
        }
        SlideShape::Placeholder(ph) => {
            let (txt, fs, fc) = ph.text_body.as_ref()
                .map(|tb| extract_text_info(tb))
                .unwrap_or((None, None, None));
            (
                ph.id.clone(),
                ph.bounds,
                "textbox".to_string(),
                ph.fill.as_ref().and_then(|f| match f {
                    Fill::Solid(c) => Some(format!("#{}", c)),
                    _ => None,
                }),
                txt,
                fs,
                fc,
                None,
                false,
                false,
                None,
            )
        }
        SlideShape::Connector(conn) => {
            let stype = if conn.has_start_arrow && conn.has_end_arrow {
                "arrow"
            } else {
                "connector"
            };
            let sw = conn.line_width.map(|w| emu_to_px(w, cw, slide_size.cx));
            (
                conn.id.clone(),
                conn.bounds,
                stype.to_string(),
                conn.fill.as_ref().and_then(|f| match f {
                    Fill::Solid(c) => Some(format!("#{}", c)),
                    _ => None,
                }),
                None,
                None,
                None,
                sw,
                conn.has_start_arrow,
                conn.has_end_arrow,
                None,
            )
        }
        SlideShape::Table(table) => {
            // Tables are exported as textbox for now — minimal lossy conversion
            (
                table.id.clone(),
                table.bounds,
                "textbox".to_string(),
                None,
                Some(format!("<table> {} cols, {} rows", table.columns.len(), table.rows.len())),
                None,
                None,
                None,
                false,
                false,
                None,
            )
        }
    };

    WoShapeData {
        id,
        shape_type,
        x: emu_to_px(bounds.x, cw, slide_size.cx),
        y: emu_to_px(bounds.y, ch, slide_size.cy),
        width: emu_to_px(bounds.cx, cw, slide_size.cx),
        height: emu_to_px(bounds.cy, ch, slide_size.cy),
        rotation: 0.0,
        z_index: 0,
        fill_color,
        stroke_color: None,
        stroke_width,
        text,
        font_size,
        font_color,
        image_data,
        group_id: None,
        connector: None,
        chart: None,
        gradient_fill: None,
        shadow: None,
    }
}

/// Extract text info from an OOXML TextBody.
fn extract_text_info(
    tb: &OoxmlTextBody,
) -> (Option<String>, Option<f64>, Option<String>) {
    let mut text_parts: Vec<&str> = Vec::new();
    let mut font_size: Option<f64> = None;
    let mut font_color: Option<String> = None;

    for para in &tb.paragraphs {
        for run in &para.runs {
            if !run.text.is_empty() {
                text_parts.push(&run.text);
            }
            if font_size.is_none() {
                font_size = run.font_size.map(|s| s as f64 / 100.0);
            }
            if font_color.is_none() {
                font_color = run
                    .color
                    .as_ref()
                    .map(|c| format!("#{}", c));
            }
        }
    }

    let text = if text_parts.is_empty() {
        None
    } else {
        Some(text_parts.join(""))
    };

    (text, font_size, font_color)
}

/// Map frontend transition effect string to OOXML TransitionEffect.
fn wo_transition_to_ooxml(effect: &str) -> TransitionEffect {
    match effect {
        "fade" => TransitionEffect::Fade,
        "push" => TransitionEffect::Push,
        "wipe" => TransitionEffect::Wipe,
        "split" => TransitionEffect::Split,
        "reveal" => TransitionEffect::Reveal,
        "zoom" => TransitionEffect::Zoom,
        "morph" => TransitionEffect::Morph,
        "dissolve" => TransitionEffect::Dissolve,
        "wheel" => TransitionEffect::Wheel,
        "random" => TransitionEffect::Random,
        _ => TransitionEffect::Fade,
    }
}

/// Map OOXML TransitionEffect back to frontend string.
fn ooxml_transition_to_wo(effect: &TransitionEffect) -> String {
    match effect {
        TransitionEffect::None => String::new(),
        TransitionEffect::Fade => "fade".to_string(),
        TransitionEffect::Push => "push".to_string(),
        TransitionEffect::Wipe => "wipe".to_string(),
        TransitionEffect::Split => "split".to_string(),
        TransitionEffect::Reveal => "reveal".to_string(),
        TransitionEffect::Zoom => "zoom".to_string(),
        TransitionEffect::Morph => "morph".to_string(),
        TransitionEffect::Dissolve => "dissolve".to_string(),
        TransitionEffect::Wheel => "wheel".to_string(),
        TransitionEffect::Random => "random".to_string(),
        _ => "fade".to_string(),
    }
}

/// Converts frontend WoPresentation JSON → PPTX bytes.
pub struct WoPresentationToPptxConverter;

impl FormatConverter for WoPresentationToPptxConverter {
    fn source_format(&self) -> &str {
        "wo-presentation"
    }
    fn target_format(&self) -> &str {
        "pptx"
    }
    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let wo: WoPresentation = serde_json::from_slice(data)
            .map_err(|e| ConversionError::Parse(format!("Invalid WoPresentation JSON: {}", e)))?;

        let slide_size_name = if wo.slide_size == "standard" {
            "standard"
        } else {
            "widescreen"
        };
        let slide_size = match slide_size_name {
            "standard" => SlideSize::standard(),
            _ => SlideSize::widescreen(),
        };

        let slides: Vec<Slide> = wo
            .slides
            .iter()
            .map(|ws| {
                let _shape_count = ws.shapes.len();
                let shapes: Vec<SlideShape> = ws
                    .shapes
                    .iter()
                    .map(|s| wo_shape_to_slide_shape(s, &slide_size, slide_size_name))
                    .collect();

                let transition = ws.transition_effect.as_ref().map(|eff| {
                    SlideTransition {
                        effect: wo_transition_to_ooxml(eff),
                        duration: ws.transition_duration.unwrap_or(0.5),
                        advance_mode: match ws.advance_mode.as_deref() {
                            Some("timed") => AdvanceMode::Timed,
                            _ => AdvanceMode::Manual,
                        },
                        advance_timing: ws.advance_timing.unwrap_or(0.0),
                    }
                });

                let animations: Vec<OoxmlAnimData> = ws
                    .animations
                    .iter()
                    .map(|a| OoxmlAnimData {
                        id: a.id.clone(),
                        effect: a.effect.clone(),
                        category: a.category.clone(),
                        target: a.target.clone(),
                        start: a.start.clone(),
                        duration: a.duration,
                        delay: a.delay,
                    })
                    .collect();

                // Parse slide id — if it's not a number, use index + 1
                let slide_id: u32 = ws.id.parse().unwrap_or(0);

                Slide {
                    id: slide_id,
                    name: ws.title.clone(),
                    shapes,
                    notes: ws.notes.clone(),
                    transition,
                    animations,
                    timing_raw: None,
                }
            })
            .collect();

        let pptx = PptxPresentation {
            slide_size,
            slides,
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties::default(),
        };

        let serializer = OoxmlSerializer::new();
        serializer
            .serialize_pptx(&pptx)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

/// Converts PPTX bytes → frontend WoPresentation JSON.
pub struct PptxToWoPresentationConverter;

impl FormatConverter for PptxToWoPresentationConverter {
    fn source_format(&self) -> &str {
        "pptx"
    }
    fn target_format(&self) -> &str {
        "wo-presentation"
    }
    fn convert(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        use std::io::Cursor;
        use zip::ZipArchive;

        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| ConversionError::Parse(format!("Invalid PPTX zip: {}", e)))?;

        let parser = OoxmlParser::new();
        let pptx = parser
            .parse_pptx(&mut archive)
            .map_err(|e| ConversionError::Parse(e.to_string()))?
            .ok_or_else(|| {
                ConversionError::Parse("Not a valid PPTX file".to_string())
            })?;

        let slide_size_name = if pptx.slide_size.cx <= 10000000 {
            "standard"
        } else {
            "widescreen"
        };

        let slides: Vec<WoSlide> = pptx
            .slides
            .iter()
            .map(|slide| {
                let shapes: Vec<WoShapeData> = slide
                    .shapes
                    .iter()
                    .map(|s| slide_shape_to_wo_shape(s, &pptx.slide_size, slide_size_name))
                    .collect();

                let (transition_effect, transition_duration, advance_mode, advance_timing) =
                    slide.transition.as_ref().map_or(
                        (None, None, None, None),
                        |t| {
                            let eff = ooxml_transition_to_wo(&t.effect);
                            (
                                Some(eff),
                                Some(t.duration),
                                match t.advance_mode {
                                    AdvanceMode::Timed => Some("timed".to_string()),
                                    AdvanceMode::Manual => Some("click".to_string()),
                                },
                                if t.advance_timing > 0.0 {
                                    Some(t.advance_timing)
                                } else {
                                    None
                                },
                            )
                        },
                    );

                let animations: Vec<WoAnimationData> = slide
                    .animations
                    .iter()
                    .map(|a| WoAnimationData {
                        id: a.id.clone(),
                        effect: a.effect.clone(),
                        category: a.category.clone(),
                        target: a.target.clone(),
                        start: a.start.clone(),
                        duration: a.duration,
                        delay: a.delay,
                    })
                    .collect();

                WoSlide {
                    id: slide.id.to_string(),
                    title: slide.name.clone(),
                    layout: "blank".to_string(),
                    notes: slide.notes.clone(),
                    transition_effect,
                    transition_duration,
                    transition_sound_enabled: None,
                    advance_mode,
                    advance_timing,
                    animations,
                    shapes,
                }
            })
            .collect();

        let wo = WoPresentation {
            version: 3,
            slide_size: slide_size_name.to_string(),
            theme_type: "builtin".to_string(),
            theme: None,
            slides,
        };

        serde_json::to_vec_pretty(&wo)
            .map_err(|e| ConversionError::Serialize(e.to_string()))
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use wo_epub::is_epub_file;

    // ── RtfToTxt ─────────────────────────────────────────────────────

    #[test]
    fn test_rtf_to_txt_simple() {
        let rtf = r#"{\rtf1\ansi Hello World!\par}"#;
        let converter = RtfToTxtConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(
            text.contains("Hello World"),
            "missing 'Hello World' in: {:?}",
            text
        );
    }

    #[test]
    fn test_rtf_to_txt_multiple_paragraphs() {
        let rtf = r#"{\rtf1\ansi First\par Second\par Third\par}"#;
        let converter = RtfToTxtConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(text.contains("First"), "missing 'First'");
        assert!(text.contains("Second"), "missing 'Second'");
        assert!(text.contains("Third"), "missing 'Third'");
    }

    #[test]
    fn test_rtf_to_txt_strips_formatting() {
        // Bold, italic, underline text should all be extracted as plain text
        let rtf = r#"{\rtf1\ansi normal\~\b bold\i bolditalic\i0\b0\~rest\par}"#;
        let converter = RtfToTxtConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(text.contains("normal"), "missing 'normal' in: {:?}", text);
        assert!(text.contains("bold"), "missing 'bold'");
        assert!(text.contains("rest"), "missing 'rest'");
    }

    #[test]
    fn test_rtf_to_txt_line_break() {
        let rtf = r#"{\rtf1\ansi line1\line line2\par}"#;
        let converter = RtfToTxtConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(text.contains("line1"), "missing 'line1'");
        assert!(text.contains("line2"), "missing 'line2'");
    }

    #[test]
    fn test_rtf_to_txt_parse_error() {
        let converter = RtfToTxtConverter;
        let result = converter.convert(b"not rtf at all");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── RtfToHtml ────────────────────────────────────────────────────

    #[test]
    fn test_rtf_to_html_simple() {
        let rtf = r#"{\rtf1\ansi Hello World!\par}"#;
        let converter = RtfToHtmlConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<html>"), "missing <html> in: {:?}", html);
        assert!(html.contains("</html>"), "missing </html>");
        assert!(html.contains("Hello World"), "missing text content");
        assert!(html.contains("<p>"), "missing <p> tag");
    }

    #[test]
    fn test_rtf_to_html_preserves_bold() {
        let rtf = r#"{\rtf1\ansi text\~\b bold\~text\b0\par}"#;
        let converter = RtfToHtmlConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<strong>"), "missing <strong> in: {:?}", html);
        assert!(html.contains("bold"), "missing 'bold' text");
    }

    #[test]
    fn test_rtf_to_html_preserves_italic() {
        let rtf = r#"{\rtf1\ansi text\~\i italic\i0\~text\par}"#;
        let converter = RtfToHtmlConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<em>"), "missing <em> in: {:?}", html);
        assert!(html.contains("italic"), "missing 'italic' text");
    }

    #[test]
    fn test_rtf_to_html_title_from_info() {
        let rtf = r#"{\rtf1\ansi{\info{\title My Title}}Content\par}"#;
        let converter = RtfToHtmlConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(
            html.contains("<title>My Title</title>"),
            "missing title in: {:?}",
            html
        );
    }

    #[test]
    fn test_rtf_to_html_multiple_paragraphs() {
        let rtf = r#"{\rtf1\ansi First\par Second\par Third\par}"#;
        let converter = RtfToHtmlConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let html = String::from_utf8(result).unwrap();
        // Should have 3 <p> tags
        let p_count = html.matches("<p>").count();
        assert_eq!(p_count, 3, "expected 3 <p> tags, got {}", p_count);
    }

    // ── HtmlToTxt ────────────────────────────────────────────────────

    #[test]
    fn test_html_to_txt_simple() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p>Hello World</p>
</body></html>"#;
        let converter = HtmlToTxtConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(
            text.contains("Hello World"),
            "missing 'Hello World' in: {:?}",
            text
        );
    }

    #[test]
    fn test_html_to_txt_strips_formatting() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p>This is <strong>bold</strong> and <em>italic</em> text.</p>
</body></html>"#;
        let converter = HtmlToTxtConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(text.contains("This is"), "missing start");
        assert!(text.contains("bold"), "missing 'bold'");
        assert!(text.contains("italic"), "missing 'italic'");
        assert!(text.contains("text."), "missing 'text.'");
    }

    #[test]
    fn test_html_to_txt_heading() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<h1>Title</h1>
</body></html>"#;
        let converter = HtmlToTxtConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(text.contains("# Title"), "missing '# Title' in: {:?}", text);
    }

    #[test]
    fn test_html_to_txt_list() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<ul><li>Item 1</li><li>Item 2</li></ul>
</body></html>"#;
        let converter = HtmlToTxtConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(text.contains("- Item 1"), "missing '- Item 1'");
        assert!(text.contains("- Item 2"), "missing '- Item 2'");
    }

    #[test]
    fn test_html_to_txt_parse_error() {
        let converter = HtmlToTxtConverter;
        // The HTML parser may or may not fail on garbage input depending on
        // how roxmltree handles it, but extremely malformed input should fail
        let result = converter.convert(b"\x00\x01\x02");
        // Just verify it either succeeds with something or fails gracefully
        match result {
            Ok(data) => {
                // If it succeeded, the output should be valid UTF-8
                let _ = String::from_utf8(data).expect("output should be valid UTF-8");
            }
            Err(e) => {
                assert!(
                    e.to_string().contains("parse error"),
                    "expected parse error, got: {}",
                    e
                );
            }
        }
    }

    // ── TxtToHtml ────────────────────────────────────────────────────

    #[test]
    fn test_txt_to_html_simple() {
        let txt = b"Hello World";
        let converter = TxtToHtmlConverter;
        let result = converter.convert(txt).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<html>"), "missing <html>");
        assert!(html.contains("</html>"), "missing </html>");
        assert!(html.contains("Hello World"), "missing text content");
        assert!(html.contains("<p>"), "missing <p> tag");
    }

    #[test]
    fn test_txt_to_html_multiple_lines() {
        let txt = b"Line 1\nLine 2\nLine 3";
        let converter = TxtToHtmlConverter;
        let result = converter.convert(txt).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("Line 1"), "missing 'Line 1'");
        assert!(html.contains("Line 2"), "missing 'Line 2'");
        assert!(html.contains("Line 3"), "missing 'Line 3'");
        // Should have 3 <p> tags
        let p_count = html.matches("<p>").count();
        assert_eq!(p_count, 3, "expected 3 <p> tags, got {}", p_count);
    }

    #[test]
    fn test_txt_to_html_empty_input() {
        let txt = b"";
        let converter = TxtToHtmlConverter;
        let result = converter.convert(txt).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<html>"), "missing <html>");
        assert!(html.contains("</html>"), "missing </html>");
    }

    #[test]
    fn test_txt_to_html_roundtrip() {
        // Convert TXT→HTML, then verify the HTML can be re-parsed
        let txt = b"Hello\nWorld";
        let converter = TxtToHtmlConverter;
        let result = converter.convert(txt).unwrap();

        // The result should be parseable HTML
        let html_doc = HtmlParser::new()
            .parse(&result)
            .expect("converter output should be valid HTML");

        assert_eq!(html_doc.body.elements.len(), 2);
        match &html_doc.body.elements[0] {
            BlockElement::Paragraph { content, .. } => {
                assert_eq!(
                    extract_html_text(content),
                    "Hello",
                    "first paragraph should be 'Hello'"
                );
            }
            _ => panic!("expected Paragraph"),
        }
        match &html_doc.body.elements[1] {
            BlockElement::Paragraph { content, .. } => {
                assert_eq!(
                    extract_html_text(content),
                    "World",
                    "second paragraph should be 'World'"
                );
            }
            _ => panic!("expected Paragraph"),
        }
    }

    // ── Cross-converter roundtrip ────────────────────────────────────

    #[test]
    fn test_rtf_to_html_to_txt_roundtrip() {
        let rtf = r#"{\rtf1\ansi Hello World!\par}"#;
        let rtf_to_html = RtfToHtmlConverter;
        let html_to_txt = HtmlToTxtConverter;

        let html_bytes = rtf_to_html.convert(rtf.as_bytes()).unwrap();
        let txt_bytes = html_to_txt.convert(&html_bytes).unwrap();
        let text = String::from_utf8(txt_bytes).unwrap();
        assert!(
            text.contains("Hello World"),
            "roundtrip lost content: {:?}",
            text
        );
    }

    #[test]
    fn test_txt_to_html_to_txt_roundtrip() {
        let original = b"Hello\nWorld";
        let txt_to_html = TxtToHtmlConverter;
        let html_to_txt = HtmlToTxtConverter;

        let html_bytes = txt_to_html.convert(original).unwrap();
        let txt_bytes = html_to_txt.convert(&html_bytes).unwrap();
        let text = String::from_utf8(txt_bytes).unwrap();
        assert!(text.contains("Hello"), "roundtrip lost 'Hello'");
        assert!(text.contains("World"), "roundtrip lost 'World'");
    }

    // ── Trait method verification ────────────────────────────────────

    #[test]
    fn test_converter_format_strings() {
        let rtf_txt = RtfToTxtConverter;
        assert_eq!(rtf_txt.source_format(), "rtf");
        assert_eq!(rtf_txt.target_format(), "txt");

        let rtf_html = RtfToHtmlConverter;
        assert_eq!(rtf_html.source_format(), "rtf");
        assert_eq!(rtf_html.target_format(), "html");

        let html_txt = HtmlToTxtConverter;
        assert_eq!(html_txt.source_format(), "html");
        assert_eq!(html_txt.target_format(), "txt");

        let txt_html = TxtToHtmlConverter;
        assert_eq!(txt_html.source_format(), "txt");
        assert_eq!(txt_html.target_format(), "html");

        let docx_txt = DocxToTxtConverter;
        assert_eq!(docx_txt.source_format(), "docx");
        assert_eq!(docx_txt.target_format(), "txt");

        let docx_html = DocxToHtmlConverter;
        assert_eq!(docx_html.source_format(), "docx");
        assert_eq!(docx_html.target_format(), "html");

        let odt_txt = OdtToTxtConverter;
        assert_eq!(odt_txt.source_format(), "odt");
        assert_eq!(odt_txt.target_format(), "txt");

        let odt_html = OdtToHtmlConverter;
        assert_eq!(odt_html.source_format(), "odt");
        assert_eq!(odt_html.target_format(), "html");

        let txt_rtf = TxtToRtfConverter;
        assert_eq!(txt_rtf.source_format(), "txt");
        assert_eq!(txt_rtf.target_format(), "rtf");

        let html_rtf = HtmlToRtfConverter;
        assert_eq!(html_rtf.source_format(), "html");
        assert_eq!(html_rtf.target_format(), "rtf");
    }

    // ── Test fixtures ────────────────────────────────────────────────

    fn make_minimal_docx() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            zip.start_file(
                "[Content_Types].xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)
                .unwrap();

            zip.start_file("_rels/.rels", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#)
                .unwrap();

            zip.start_file(
                "docProps/core.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Test Document</dc:title>
  <dc:creator>World Office</dc:creator>
</cp:coreProperties>"#)
                .unwrap();

            zip.start_file(
                "word/document.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body>
</w:document>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    fn make_docx_with_body(document_xml: &str) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            zip.start_file(
                "[Content_Types].xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)
                .unwrap();

            zip.start_file(
                "word/document.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(document_xml.as_bytes()).unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    fn make_minimal_odt() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            zip.start_file(
                "mimetype",
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored),
            )
            .unwrap();
            zip.write_all(b"application/vnd.oasis.opendocument.text")
                .unwrap();

            zip.start_file("content.xml", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    office:version="1.2">
  <office:body>
    <office:text>
      <text:p>First paragraph.</text:p>
      <text:h text:outline-level="1">Chapter One</text:h>
      <text:p>Second paragraph.</text:p>
    </office:text>
  </office:body>
</office:document-content>"#,
            )
            .unwrap();

            zip.start_file(
                "META-INF/manifest.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest
    xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    fn make_odt_with_content(content_xml: &str) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            zip.start_file(
                "mimetype",
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored),
            )
            .unwrap();
            zip.write_all(b"application/vnd.oasis.opendocument.text")
                .unwrap();

            zip.start_file("content.xml", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(content_xml.as_bytes()).unwrap();

            zip.start_file(
                "META-INF/manifest.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest
    xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    // ── DocxToTxt ────────────────────────────────────────────────────

    #[test]
    fn test_docx_to_txt_simple() {
        let docx = make_minimal_docx();
        let converter = DocxToTxtConverter;
        let result = converter.convert(&docx).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(
            text.contains("Hello World"),
            "missing 'Hello World' in: {:?}",
            text
        );
    }

    #[test]
    fn test_docx_to_txt_multiple_paragraphs() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>First paragraph</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>
    <w:p><w:r><w:t>Third paragraph</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToTxtConverter;
        let result = converter.convert(&docx).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(
            text.contains("First paragraph"),
            "missing 'First paragraph'"
        );
        assert!(
            text.contains("Second paragraph"),
            "missing 'Second paragraph'"
        );
        assert!(
            text.contains("Third paragraph"),
            "missing 'Third paragraph'"
        );
    }

    #[test]
    fn test_docx_to_txt_strips_formatting() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Bold Italic</w:t></w:r>
      <w:r><w:t> plain</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToTxtConverter;
        let result = converter.convert(&docx).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(text.contains("Bold Italic"), "missing formatted text");
        assert!(text.contains("plain"), "missing plain text");
    }

    #[test]
    fn test_docx_to_txt_parse_error() {
        let converter = DocxToTxtConverter;
        let result = converter.convert(b"not a zip file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── DocxToHtml ───────────────────────────────────────────────────

    #[test]
    fn test_docx_to_html_simple() {
        let docx = make_minimal_docx();
        let converter = DocxToHtmlConverter;
        let result = converter.convert(&docx).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<html>"), "missing <html> in: {:?}", html);
        assert!(html.contains("</html>"), "missing </html>");
        assert!(html.contains("Hello World"), "missing text content");
        assert!(html.contains("<p>"), "missing <p> tag");
    }

    #[test]
    fn test_docx_to_html_title() {
        let docx = make_minimal_docx();
        let converter = DocxToHtmlConverter;
        let result = converter.convert(&docx).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(
            html.contains("<title>Test Document</title>"),
            "missing title in: {:?}",
            html
        );
    }

    #[test]
    fn test_docx_to_html_preserves_bold() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToHtmlConverter;
        let result = converter.convert(&docx).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<strong>"), "missing <strong> in: {:?}", html);
        assert!(html.contains("Bold text"), "missing 'Bold text'");
    }

    #[test]
    fn test_docx_to_html_preserves_italic() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:i/></w:rPr><w:t>Italic text</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToHtmlConverter;
        let result = converter.convert(&docx).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<em>"), "missing <em> in: {:?}", html);
        assert!(html.contains("Italic text"), "missing 'Italic text'");
    }

    #[test]
    fn test_docx_to_html_heading() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle val="Heading1"/></w:pPr>
      <w:r><w:t>Chapter One</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>Normal text</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToHtmlConverter;
        let result = converter.convert(&docx).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<h1>"), "missing <h1> in: {:?}", html);
        assert!(html.contains("Chapter One"), "missing 'Chapter One'");
        assert!(html.contains("<p>"), "missing <p> tag");
    }

    // ── OdtToTxt ─────────────────────────────────────────────────────

    #[test]
    fn test_odt_to_txt_simple() {
        let odt = make_minimal_odt();
        let converter = OdtToTxtConverter;
        let result = converter.convert(&odt).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(
            text.contains("First paragraph"),
            "missing 'First paragraph' in: {:?}",
            text
        );
    }

    #[test]
    fn test_odt_to_txt_heading() {
        let odt = make_minimal_odt();
        let converter = OdtToTxtConverter;
        let result = converter.convert(&odt).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(
            text.contains("# Chapter One"),
            "missing '# Chapter One' in: {:?}",
            text
        );
    }

    #[test]
    fn test_odt_to_txt_multiple_paragraphs() {
        let odt = make_minimal_odt();
        let converter = OdtToTxtConverter;
        let result = converter.convert(&odt).unwrap();
        let text = String::from_utf8(result).unwrap();
        assert!(
            text.contains("First paragraph"),
            "missing 'First paragraph'"
        );
        assert!(
            text.contains("Second paragraph"),
            "missing 'Second paragraph'"
        );
    }

    #[test]
    fn test_odt_to_txt_parse_error() {
        let converter = OdtToTxtConverter;
        let result = converter.convert(b"not a zip file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── OdtToHtml ────────────────────────────────────────────────────

    #[test]
    fn test_odt_to_html_simple() {
        let odt = make_minimal_odt();
        let converter = OdtToHtmlConverter;
        let result = converter.convert(&odt).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<html>"), "missing <html> in: {:?}", html);
        assert!(html.contains("</html>"), "missing </html>");
        assert!(html.contains("First paragraph"), "missing text content");
        assert!(html.contains("<p>"), "missing <p> tag");
    }

    #[test]
    fn test_odt_to_html_heading() {
        let odt = make_minimal_odt();
        let converter = OdtToHtmlConverter;
        let result = converter.convert(&odt).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<h1>"), "missing <h1> in: {:?}", html);
        assert!(html.contains("Chapter One"), "missing 'Chapter One'");
    }

    #[test]
    fn test_odt_to_html_multiple_paragraphs() {
        let odt = make_minimal_odt();
        let converter = OdtToHtmlConverter;
        let result = converter.convert(&odt).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(
            html.contains("First paragraph"),
            "missing 'First paragraph'"
        );
        assert!(
            html.contains("Second paragraph"),
            "missing 'Second paragraph'"
        );
    }

    #[test]
    fn test_odt_to_html_with_table() {
        let odt = make_odt_with_content(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
    office:version="1.2">
  <office:body>
    <office:text>
      <table:table table:name="MyTable">
        <table:table-row>
          <table:table-cell><text:p>A1</text:p></table:table-cell>
          <table:table-cell><text:p>B1</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell><text:p>A2</text:p></table:table-cell>
          <table:table-cell><text:p>B2</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    </office:text>
  </office:body>
</office:document-content>"#,
        );
        let converter = OdtToHtmlConverter;
        let result = converter.convert(&odt).unwrap();
        let html = String::from_utf8(result).unwrap();
        assert!(html.contains("<table>"), "missing <table> in: {:?}", html);
        assert!(html.contains("A1"), "missing 'A1'");
        assert!(html.contains("B2"), "missing 'B2'");
    }

    // ── DOCX roundtrip ──────────────────────────────────────────────

    #[test]
    fn test_docx_to_html_to_txt_roundtrip() {
        let docx = make_minimal_docx();
        let docx_to_html = DocxToHtmlConverter;
        let html_to_txt = HtmlToTxtConverter;

        let html_bytes = docx_to_html.convert(&docx).unwrap();
        let txt_bytes = html_to_txt.convert(&html_bytes).unwrap();
        let text = String::from_utf8(txt_bytes).unwrap();
        assert!(
            text.contains("Hello World"),
            "roundtrip lost content: {:?}",
            text
        );
    }

    // ── TxtToRtf ─────────────────────────────────────────────────────

    #[test]
    fn test_txt_to_rtf_basic() {
        let txt = b"Hello World";
        let converter = TxtToRtfConverter;
        let result = converter.convert(txt).unwrap();
        let rtf = String::from_utf8(result).unwrap();
        assert!(rtf.contains("{\\rtf"), "missing RTF header in: {:?}", rtf);
        assert!(
            rtf.contains("Hello World"),
            "missing 'Hello World' in: {:?}",
            rtf
        );
    }

    #[test]
    fn test_txt_to_rtf_multiple_lines() {
        let txt = b"line1\nline2";
        let converter = TxtToRtfConverter;
        let result = converter.convert(txt).unwrap();
        let rtf = String::from_utf8(result).unwrap();
        assert!(rtf.contains("line1"), "missing 'line1'");
        assert!(rtf.contains("line2"), "missing 'line2'");
    }

    #[test]
    fn test_txt_to_rtf_empty() {
        let txt = b"";
        let converter = TxtToRtfConverter;
        let result = converter.convert(txt).unwrap();
        let rtf = String::from_utf8(result).unwrap();
        assert!(
            rtf.contains("{\\rtf"),
            "empty input should still produce valid RTF in: {:?}",
            rtf
        );
    }

    // ── HtmlToRtf ────────────────────────────────────────────────────

    #[test]
    fn test_html_to_rtf_basic() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p>Hello <strong>World</strong></p>
</body></html>"#;
        let converter = HtmlToRtfConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let rtf = String::from_utf8(result).unwrap();
        assert!(rtf.contains("{\\rtf"), "missing RTF header in: {:?}", rtf);
        assert!(rtf.contains("Hello"), "missing 'Hello'");
        assert!(rtf.contains("World"), "missing 'World'");
        assert!(rtf.contains("\\b "), "missing bold marker in: {:?}", rtf);
    }

    #[test]
    fn test_html_to_rtf_heading() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<h1>Title</h1>
</body></html>"#;
        let converter = HtmlToRtfConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let rtf = String::from_utf8(result).unwrap();
        assert!(rtf.contains("Title"), "missing 'Title' in: {:?}", rtf);
        assert!(
            rtf.contains("\\fs"),
            "heading should have font size in: {:?}",
            rtf
        );
    }

    // ── ODT roundtrip ──────────────────────────────────────────────

    #[test]
    fn test_odt_to_html_to_txt_roundtrip() {
        let odt = make_minimal_odt();
        let odt_to_html = OdtToHtmlConverter;
        let html_to_txt = HtmlToTxtConverter;

        let html_bytes = odt_to_html.convert(&odt).unwrap();
        let txt_bytes = html_to_txt.convert(&html_bytes).unwrap();
        let text = String::from_utf8(txt_bytes).unwrap();
        assert!(
            text.contains("First paragraph"),
            "roundtrip lost content: {:?}",
            text
        );
    }

    // ── EpubToTxt ─────────────────────────────────────────────────────

    #[test]
    fn test_epub_to_txt_parse_error() {
        let converter = EpubToTxtConverter;
        let result = converter.convert(b"not an epub file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── EpubToHtml ────────────────────────────────────────────────────

    #[test]
    fn test_epub_to_html_parse_error() {
        let converter = EpubToHtmlConverter;
        let result = converter.convert(b"not an epub file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── Fb2ToTxt ──────────────────────────────────────────────────────

    #[test]
    fn test_fb2_to_txt_parse_error() {
        let converter = Fb2ToTxtConverter;
        let result = converter.convert(b"not an fb2 file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── HwpToTxt ──────────────────────────────────────────────────────

    #[test]
    fn test_hwp_to_txt_parse_error() {
        let converter = HwpToTxtConverter;
        let result = converter.convert(b"not an hwp file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── New converter format strings ──────────────────────────────────

    #[test]
    fn test_new_converter_format_strings() {
        let epub_txt = EpubToTxtConverter;
        assert_eq!(epub_txt.source_format(), "epub");
        assert_eq!(epub_txt.target_format(), "txt");

        let epub_html = EpubToHtmlConverter;
        assert_eq!(epub_html.source_format(), "epub");
        assert_eq!(epub_html.target_format(), "html");

        let fb2_txt = Fb2ToTxtConverter;
        assert_eq!(fb2_txt.source_format(), "fb2");
        assert_eq!(fb2_txt.target_format(), "txt");

        let hwp_txt = HwpToTxtConverter;
        assert_eq!(hwp_txt.source_format(), "hwp");
        assert_eq!(hwp_txt.target_format(), "txt");
    }

    // ── TxtToDocx ─────────────────────────────────────────────────────

    #[test]
    fn test_txt_to_docx_basic() {
        let txt = b"Hello World\n";
        let converter = TxtToDocxConverter;
        let result = converter.convert(txt).unwrap();
        // Verify valid ZIP (PK header)
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50);
        assert_eq!(result[1], 0x4B);
    }

    #[test]
    fn test_txt_to_docx_multiple_lines() {
        let txt = b"Line 1\nLine 2\nLine 3";
        let converter = TxtToDocxConverter;
        let result = converter.convert(txt).unwrap();
        assert_eq!(result[0], 0x50); // PK header
                                     // Verify content in ZIP
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("Line 1"), "missing 'Line 1'");
        assert!(content.contains("Line 2"), "missing 'Line 2'");
        assert!(content.contains("Line 3"), "missing 'Line 3'");
    }

    // ── HtmlToDocx ────────────────────────────────────────────────────

    #[test]
    fn test_html_to_docx_basic() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p>Hello</p>
</body></html>"#;
        let converter = HtmlToDocxConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        // Verify valid ZIP (PK header)
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50);
        assert_eq!(result[1], 0x4B);
    }

    #[test]
    fn test_html_to_docx_heading() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<h1>Title</h1>
<p>Body</p>
</body></html>"#;
        let converter = HtmlToDocxConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("Title"), "missing 'Title'");
        assert!(content.contains("<w:b/>"), "heading should be bold");
    }

    #[test]
    fn test_html_to_docx_bold() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p>Hello <strong>World</strong></p>
</body></html>"#;
        let converter = HtmlToDocxConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("World"), "missing 'World'");
        assert!(content.contains("<w:b/>"), "missing bold marker");
    }

    // ── TxtToOdt ──────────────────────────────────────────────────────

    #[test]
    fn test_txt_to_odt_basic() {
        let txt = b"Hello World\n";
        let converter = TxtToOdtConverter;
        let result = converter.convert(txt).unwrap();
        // Verify valid ZIP (PK header)
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50);
        assert_eq!(result[1], 0x4B);
    }

    #[test]
    fn test_txt_to_odt_multiple_lines() {
        let txt = b"Line 1\nLine 2\nLine 3";
        let converter = TxtToOdtConverter;
        let result = converter.convert(txt).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut content_file = archive.by_name("content.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut content_file, &mut content).unwrap();
        assert!(content.contains("Line 1"), "missing 'Line 1'");
        assert!(content.contains("Line 2"), "missing 'Line 2'");
        assert!(content.contains("Line 3"), "missing 'Line 3'");
    }

    // ── HtmlToOdt ─────────────────────────────────────────────────────

    #[test]
    fn test_html_to_odt_basic() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<p>Hello</p>
</body></html>"#;
        let converter = HtmlToOdtConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        // Verify valid ZIP (PK header)
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50);
        assert_eq!(result[1], 0x4B);
    }

    #[test]
    fn test_html_to_odt_heading() {
        let html = r#"<?xml version="1.0"?>
<html><head></head><body>
<h1>Title</h1>
<p>Body</p>
</body></html>"#;
        let converter = HtmlToOdtConverter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut content_file = archive.by_name("content.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut content_file, &mut content).unwrap();
        assert!(content.contains("Title"), "missing 'Title'");
        assert!(
            content.contains("text:outline-level=\"1\""),
            "missing heading level"
        );
    }

    // ── TO converter format strings ──────────────────────────────────

    #[test]
    fn test_to_converter_format_strings() {
        let txt_docx = TxtToDocxConverter;
        assert_eq!(txt_docx.source_format(), "txt");
        assert_eq!(txt_docx.target_format(), "docx");

        let html_docx = HtmlToDocxConverter;
        assert_eq!(html_docx.source_format(), "html");
        assert_eq!(html_docx.target_format(), "docx");

        let txt_odt = TxtToOdtConverter;
        assert_eq!(txt_odt.source_format(), "txt");
        assert_eq!(txt_odt.target_format(), "odt");

        let html_odt = HtmlToOdtConverter;
        assert_eq!(html_odt.source_format(), "html");
        assert_eq!(html_odt.target_format(), "odt");
    }

    // ── DOCX output valid ZIP ─────────────────────────────────────────

    #[test]
    fn test_docx_output_valid_zip() {
        let converter = TxtToDocxConverter;
        let result = converter.convert(b"test").unwrap();
        assert_eq!(result[0], 0x50); // P
        assert_eq!(result[1], 0x4B); // K
                                     // Verify it can be opened as ZIP
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        assert!(archive.by_name("[Content_Types].xml").is_ok());
        assert!(archive.by_name("word/document.xml").is_ok());
    }

    // ── ODT output valid ZIP ─────────────────────────────────────────

    #[test]
    fn test_odt_output_valid_zip() {
        let converter = TxtToOdtConverter;
        let result = converter.convert(b"test").unwrap();
        assert_eq!(result[0], 0x50); // P
        assert_eq!(result[1], 0x4B); // K
                                     // Verify it can be opened as ZIP
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        assert!(archive.by_name("content.xml").is_ok());
        assert!(archive.by_name("META-INF/manifest.xml").is_ok());
    }

    // ── XpsToTxt ──────────────────────────────────────────────────────

    #[test]
    fn test_xps_to_txt_parse_error() {
        let converter = XpsToTxtConverter;
        let result = converter.convert(b"not an xps file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── XpsToHtml ─────────────────────────────────────────────────────

    #[test]
    fn test_xps_to_html_parse_error() {
        let converter = XpsToHtmlConverter;
        let result = converter.convert(b"not an xps file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── OfdToTxt ──────────────────────────────────────────────────────

    #[test]
    fn test_ofd_to_txt_parse_error() {
        let converter = OfdToTxtConverter;
        let result = converter.convert(b"not an ofd file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── OfdToHtml ─────────────────────────────────────────────────────

    #[test]
    fn test_ofd_to_html_parse_error() {
        let converter = OfdToHtmlConverter;
        let result = converter.convert(b"not an ofd file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── DjvuToTxt ─────────────────────────────────────────────────────

    #[test]
    fn test_djvu_to_txt_parse_error() {
        let converter = DjvuToTxtConverter;
        let result = converter.convert(b"not a djvu file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    // ── New converter format strings (XPS, OFD, DJVU) ─────────────────

    #[test]
    fn test_xps_ofd_djvu_converter_format_strings() {
        let xps_txt = XpsToTxtConverter;
        assert_eq!(xps_txt.source_format(), "xps");
        assert_eq!(xps_txt.target_format(), "txt");

        let xps_html = XpsToHtmlConverter;
        assert_eq!(xps_html.source_format(), "xps");
        assert_eq!(xps_html.target_format(), "html");

        let ofd_txt = OfdToTxtConverter;
        assert_eq!(ofd_txt.source_format(), "ofd");
        assert_eq!(ofd_txt.target_format(), "txt");

        let ofd_html = OfdToHtmlConverter;
        assert_eq!(ofd_html.source_format(), "ofd");
        assert_eq!(ofd_html.target_format(), "html");

        let djvu_txt = DjvuToTxtConverter;
        assert_eq!(djvu_txt.source_format(), "djvu");
        assert_eq!(djvu_txt.target_format(), "txt");
    }

    // ── TxtToEpub ─────────────────────────────────────────────────────

    #[test]
    fn test_txt_to_epub_basic() {
        let txt = b"Hello World\nThis is a test.";
        let converter = TxtToEpubConverter;
        let result = converter.convert(txt).unwrap();

        // Output must be a valid EPUB (ZIP with mimetype)
        assert!(is_epub_file(&result), "output should be valid EPUB");
        assert!(result.len() > 58, "EPUB file too small");

        // Can parse it back
        let parsed = EpubParser::new().parse(&result).unwrap();
        assert_eq!(parsed.version, "3.0");
        assert_eq!(
            parsed.metadata.title.as_deref(),
            Some("Hello World"),
            "first line should become title"
        );
        assert!(
            !parsed.chapters.is_empty(),
            "should have at least one chapter"
        );
    }

    #[test]
    fn test_txt_to_epub_roundtrip() {
        let original_text = "First line\nSecond line\nThird line";
        let converter = TxtToEpubConverter;
        let epub_bytes = converter.convert(original_text.as_bytes()).unwrap();

        // Parse back
        let parsed = EpubParser::new().parse(&epub_bytes).unwrap();
        assert_eq!(parsed.chapters.len(), 1, "should be single chapter");

        let chapter_text = strip_html_tags(&parsed.chapters[0].content);
        assert!(
            chapter_text.contains("First line"),
            "roundtrip lost 'First line': {:?}",
            chapter_text
        );
        assert!(
            chapter_text.contains("Second line"),
            "roundtrip lost 'Second line': {:?}",
            chapter_text
        );
        assert!(
            chapter_text.contains("Third line"),
            "roundtrip lost 'Third line': {:?}",
            chapter_text
        );
    }

    #[test]
    fn test_txt_to_epub_with_headings() {
        let txt = b"Intro text\n\n## Chapter One\nContent one\n\n## Chapter Two\nContent two";
        let converter = TxtToEpubConverter;
        let epub_bytes = converter.convert(txt).unwrap();

        let parsed = EpubParser::new().parse(&epub_bytes).unwrap();
        assert_eq!(
            parsed.chapters.len(),
            3,
            "should have 3 chapters (intro + 2 headings), got {}",
            parsed.chapters.len()
        );
    }

    #[test]
    fn test_txt_to_epub_empty_input() {
        let converter = TxtToEpubConverter;
        let result = converter.convert(b"").unwrap();
        assert!(
            is_epub_file(&result),
            "empty input should still produce valid EPUB"
        );

        let parsed = EpubParser::new().parse(&result).unwrap();
        assert_eq!(parsed.metadata.title.as_deref(), Some("Untitled"));
    }

    // ── HtmlToEpub ────────────────────────────────────────────────────

    #[test]
    fn test_html_to_epub_basic() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>My Book</title></head><body>
<p>Hello World</p>
</body></html>"#;
        let converter = HtmlToEpubConverter;
        let result = converter.convert(html.as_bytes()).unwrap();

        assert!(is_epub_file(&result), "output should be valid EPUB");
        assert!(result.len() > 58, "EPUB file too small");

        let parsed = EpubParser::new().parse(&result).unwrap();
        assert_eq!(parsed.version, "3.0");
        assert_eq!(
            parsed.metadata.title.as_deref(),
            Some("My Book"),
            "should use HTML title"
        );
        assert!(!parsed.chapters.is_empty());
    }

    #[test]
    fn test_html_to_epub_roundtrip() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>Test</title></head><body>
<p>First paragraph</p>
<p>Second paragraph</p>
</body></html>"#;
        let converter = HtmlToEpubConverter;
        let epub_bytes = converter.convert(html.as_bytes()).unwrap();

        let parsed = EpubParser::new().parse(&epub_bytes).unwrap();
        assert_eq!(parsed.chapters.len(), 1, "no headings → single chapter");

        let chapter_text = strip_html_tags(&parsed.chapters[0].content);
        assert!(
            chapter_text.contains("First paragraph"),
            "roundtrip lost 'First paragraph': {:?}",
            chapter_text
        );
        assert!(
            chapter_text.contains("Second paragraph"),
            "roundtrip lost 'Second paragraph': {:?}",
            chapter_text
        );
    }

    #[test]
    fn test_html_to_epub_with_headings() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>Book</title></head><body>
<p>Intro</p>
<h1>Chapter One</h1>
<p>Content one</p>
<h2>Section A</h2>
<p>Content A</p>
</body></html>"#;
        let converter = HtmlToEpubConverter;
        let epub_bytes = converter.convert(html.as_bytes()).unwrap();

        let parsed = EpubParser::new().parse(&epub_bytes).unwrap();
        // Intro paragraph becomes first chapter, h1 starts second, h2 starts third
        assert!(
            parsed.chapters.len() >= 2,
            "should have at least 2 chapters from h1/h2 headings, got {}",
            parsed.chapters.len()
        );
    }

    // ── EPUB converter format strings ─────────────────────────────────

    #[test]
    fn test_epub_converter_format_strings() {
        let txt_epub = TxtToEpubConverter;
        assert_eq!(txt_epub.source_format(), "txt");
        assert_eq!(txt_epub.target_format(), "epub");

        let html_epub = HtmlToEpubConverter;
        assert_eq!(html_epub.source_format(), "html");
        assert_eq!(html_epub.target_format(), "epub");
    }

    // ── TxtToFb2 ─────────────────────────────────────────────────────

    #[test]
    fn test_txt_to_fb2_basic() {
        let txt = b"Hello World\nLine 2\n";
        let converter = TxtToFb2Converter;
        let result = converter.convert(txt).unwrap();
        let xml = String::from_utf8(result).unwrap();
        assert!(xml.contains("<FictionBook"), "missing FictionBook root");
        assert!(xml.contains("Hello World"), "missing 'Hello World'");
        assert!(xml.contains("Line 2"), "missing 'Line 2'");
    }

    #[test]
    fn test_txt_to_fb2_roundtrip() {
        let txt = b"First paragraph\nSecond paragraph\n";
        let converter = TxtToFb2Converter;
        let fb2_bytes = converter.convert(txt).unwrap();

        let parsed = Fb2Parser::new().parse(&fb2_bytes).unwrap();
        assert!(parsed.title_info.is_some());
        let title = parsed.title_info.unwrap().book_title.unwrap();
        assert_eq!(title, "First paragraph");

        assert_eq!(parsed.bodies.len(), 1);
        let sections = &parsed.bodies[0].sections;
        assert_eq!(sections.len(), 1);
        let elements = &sections[0].elements;
        assert!(
            elements.len() >= 2,
            "expected at least 2 paragraphs, got {}",
            elements.len()
        );
    }

    #[test]
    fn test_txt_to_fb2_empty_input() {
        let converter = TxtToFb2Converter;
        let result = converter.convert(b"").unwrap();
        let xml = String::from_utf8(result).unwrap();
        assert!(xml.contains("<FictionBook"));
    }

    // ── HtmlToFb2 ────────────────────────────────────────────────────

    #[test]
    fn test_html_to_fb2_basic() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>Test</title></head><body>
<p>Hello</p>
</body></html>"#;
        let converter = HtmlToFb2Converter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let xml = String::from_utf8(result).unwrap();
        assert!(xml.contains("<FictionBook"), "missing FictionBook root");
        assert!(xml.contains("Hello"), "missing 'Hello'");
    }

    #[test]
    fn test_html_to_fb2_roundtrip() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>My Book</title></head><body>
<p>First paragraph</p>
<p>Second paragraph</p>
</body></html>"#;
        let converter = HtmlToFb2Converter;
        let fb2_bytes = converter.convert(html.as_bytes()).unwrap();

        let parsed = Fb2Parser::new().parse(&fb2_bytes).unwrap();
        assert!(parsed.title_info.is_some());
        let title = parsed.title_info.unwrap().book_title.unwrap();
        assert_eq!(title, "My Book");

        assert_eq!(parsed.bodies.len(), 1);
        let sections = &parsed.bodies[0].sections;
        assert_eq!(sections.len(), 1);
        let elements = &sections[0].elements;
        assert!(
            elements.len() >= 2,
            "expected at least 2 paragraphs, got {}",
            elements.len()
        );
    }

    #[test]
    fn test_html_to_fb2_with_styles() {
        let html = r#"<?xml version="1.0"?>
<html><head><title>Styled</title></head><body>
<p><b>Bold text</b> and <i>italic text</i></p>
<h1>Heading</h1>
</body></html>"#;
        let converter = HtmlToFb2Converter;
        let result = converter.convert(html.as_bytes()).unwrap();
        let xml = String::from_utf8(result).unwrap();
        assert!(xml.contains("Bold text"), "missing 'Bold text'");
        assert!(xml.contains("italic text"), "missing 'italic text'");
        assert!(xml.contains("Heading"), "missing 'Heading'");
    }

    // ── FB2 converter format strings ─────────────────────────────────

    #[test]
    fn test_fb2_converter_format_strings() {
        let txt_fb2 = TxtToFb2Converter;
        assert_eq!(txt_fb2.source_format(), "txt");
        assert_eq!(txt_fb2.target_format(), "fb2");

        let html_fb2 = HtmlToFb2Converter;
        assert_eq!(html_fb2.source_format(), "html");
        assert_eq!(html_fb2.target_format(), "fb2");
    }

    // ── DocxToOdt ─────────────────────────────────────────────────────

    #[test]
    fn test_docx_to_odt_basic() {
        let docx = make_minimal_docx();
        let converter = DocxToOdtConverter;
        let result = converter.convert(&docx).unwrap();
        // Verify valid ZIP (PK header)
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50);
        assert_eq!(result[1], 0x4B);
        // Verify content in ZIP
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut content_file = archive.by_name("content.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut content_file, &mut content).unwrap();
        assert!(
            content.contains("Hello World"),
            "missing 'Hello World' in ODT content"
        );
    }

    #[test]
    fn test_docx_to_odt_multiple_paragraphs() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>First</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToOdtConverter;
        let result = converter.convert(&docx).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut content_file = archive.by_name("content.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut content_file, &mut content).unwrap();
        assert!(content.contains("First"), "missing 'First'");
        assert!(content.contains("Second"), "missing 'Second'");
    }

    #[test]
    fn test_docx_to_odt_preserves_heading() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle val="Heading1"/></w:pPr>
      <w:r><w:t>Chapter One</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToOdtConverter;
        let result = converter.convert(&docx).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut content_file = archive.by_name("content.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut content_file, &mut content).unwrap();
        assert!(content.contains("Chapter One"), "missing 'Chapter One'");
        assert!(
            content.contains("text:outline-level"),
            "missing heading level attribute"
        );
    }

    #[test]
    fn test_docx_to_odt_parse_error() {
        let converter = DocxToOdtConverter;
        let result = converter.convert(b"not a zip file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_docx_to_odt_roundtrip() {
        // DOCX → ODT → TXT roundtrip to verify content preservation
        let docx = make_minimal_docx();
        let docx_to_odt = DocxToOdtConverter;
        let odt_to_txt = OdtToTxtConverter;

        let odt_bytes = docx_to_odt.convert(&docx).unwrap();
        let txt_bytes = odt_to_txt.convert(&odt_bytes).unwrap();
        let text = String::from_utf8(txt_bytes).unwrap();
        assert!(
            text.contains("Hello World"),
            "roundtrip lost content: {:?}",
            text
        );
    }

    // ── OdtToDocx ─────────────────────────────────────────────────────

    #[test]
    fn test_odt_to_docx_basic() {
        let odt = make_minimal_odt();
        let converter = OdtToDocxConverter;
        let result = converter.convert(&odt).unwrap();
        // Verify valid ZIP (PK header)
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50);
        assert_eq!(result[1], 0x4B);
        // Verify content in ZIP
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(
            content.contains("First paragraph"),
            "missing 'First paragraph' in DOCX content"
        );
    }

    #[test]
    fn test_odt_to_docx_multiple_paragraphs() {
        let odt = make_minimal_odt();
        let converter = OdtToDocxConverter;
        let result = converter.convert(&odt).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(
            content.contains("Second paragraph"),
            "missing 'Second paragraph'"
        );
    }

    #[test]
    fn test_odt_to_docx_preserves_heading() {
        let odt = make_minimal_odt();
        let converter = OdtToDocxConverter;
        let result = converter.convert(&odt).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("Chapter One"), "missing 'Chapter One'");
        assert!(content.contains("<w:b/>"), "heading should be bold");
    }

    #[test]
    fn test_odt_to_docx_parse_error() {
        let converter = OdtToDocxConverter;
        let result = converter.convert(b"not a zip file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_odt_to_docx_roundtrip() {
        // ODT → DOCX → TXT roundtrip to verify content preservation
        let odt = make_minimal_odt();
        let odt_to_docx = OdtToDocxConverter;
        let docx_to_txt = DocxToTxtConverter;

        let docx_bytes = odt_to_docx.convert(&odt).unwrap();
        let txt_bytes = docx_to_txt.convert(&docx_bytes).unwrap();
        let text = String::from_utf8(txt_bytes).unwrap();
        assert!(
            text.contains("First paragraph"),
            "roundtrip lost content: {:?}",
            text
        );
    }

    // ── RtfToDocx ─────────────────────────────────────────────────────

    #[test]
    fn test_rtf_to_docx_basic() {
        let rtf = r#"{\rtf1\ansi Hello World\par}"#;
        let converter = RtfToDocxConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        // Verify valid ZIP (PK header)
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50);
        assert_eq!(result[1], 0x4B);
        // Verify content in ZIP
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(
            content.contains("Hello World"),
            "missing 'Hello World' in DOCX content"
        );
    }

    #[test]
    fn test_rtf_to_docx_multiple_paragraphs() {
        let rtf = r#"{\rtf1\ansi First\par Second\par Third\par}"#;
        let converter = RtfToDocxConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("First"), "missing 'First'");
        assert!(content.contains("Second"), "missing 'Second'");
        assert!(content.contains("Third"), "missing 'Third'");
    }

    #[test]
    fn test_rtf_to_docx_preserves_bold() {
        let rtf = r#"{\rtf1\ansi normal \b bold\b0 rest\par}"#;
        let converter = RtfToDocxConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("<w:b/>"), "missing bold marker");
        assert!(content.contains("bold"), "missing 'bold' text");
    }

    #[test]
    fn test_rtf_to_docx_preserves_italic() {
        let rtf = r#"{\rtf1\ansi normal \i italic\i0 rest\par}"#;
        let converter = RtfToDocxConverter;
        let result = converter.convert(rtf.as_bytes()).unwrap();
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("<w:i/>"), "missing italic marker");
        assert!(content.contains("italic"), "missing 'italic' text");
    }

    #[test]
    fn test_rtf_to_docx_parse_error() {
        let converter = RtfToDocxConverter;
        let result = converter.convert(b"not rtf at all");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_rtf_to_docx_roundtrip() {
        // RTF → DOCX → TXT roundtrip to verify content preservation
        let rtf = r#"{\rtf1\ansi Roundtrip test\par}"#;
        let rtf_to_docx = RtfToDocxConverter;
        let docx_to_txt = DocxToTxtConverter;

        let docx_bytes = rtf_to_docx.convert(rtf.as_bytes()).unwrap();
        let txt_bytes = docx_to_txt.convert(&docx_bytes).unwrap();
        let text = String::from_utf8(txt_bytes).unwrap();
        assert!(
            text.contains("Roundtrip test"),
            "roundtrip lost content: {:?}",
            text
        );
    }

    // ── Cross-format converter format strings ──────────────────────────

    #[test]
    fn test_cross_format_converter_format_strings() {
        let docx_odt = DocxToOdtConverter;
        assert_eq!(docx_odt.source_format(), "docx");
        assert_eq!(docx_odt.target_format(), "odt");

        let odt_docx = OdtToDocxConverter;
        assert_eq!(odt_docx.source_format(), "odt");
        assert_eq!(odt_docx.target_format(), "docx");

        let rtf_docx = RtfToDocxConverter;
        assert_eq!(rtf_docx.source_format(), "rtf");
        assert_eq!(rtf_docx.target_format(), "docx");
    }

    // ── EpubToDocx ─────────────────────────────────────────────────────

    #[test]
    fn test_epub_to_docx_parse_error() {
        let converter = EpubToDocxConverter;
        let result = converter.convert(b"not an epub file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_epub_to_docx_format_strings() {
        let converter = EpubToDocxConverter;
        assert_eq!(converter.source_format(), "epub");
        assert_eq!(converter.target_format(), "docx");
    }

    #[test]
    fn test_epub_to_docx_basic() {
        // Create a minimal EPUB, convert it to DOCX, verify output
        let txt = b"Test Book\nSome content here.";
        let epub_bytes = TxtToEpubConverter
            .convert(txt)
            .expect("TXT→EPUB should succeed");

        let converter = EpubToDocxConverter;
        let result = converter.convert(&epub_bytes).unwrap();

        // Must be valid ZIP
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50); // P
        assert_eq!(result[1], 0x4B); // K

        // Verify content in DOCX
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("Test Book"), "missing title 'Test Book'");
        assert!(
            content.contains("Some content here"),
            "missing chapter content"
        );
    }

    // ── Fb2ToDocx ──────────────────────────────────────────────────────

    #[test]
    fn test_fb2_to_docx_parse_error() {
        let converter = Fb2ToDocxConverter;
        let result = converter.convert(b"not an fb2 file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_fb2_to_docx_format_strings() {
        let converter = Fb2ToDocxConverter;
        assert_eq!(converter.source_format(), "fb2");
        assert_eq!(converter.target_format(), "docx");
    }

    #[test]
    fn test_fb2_to_docx_basic() {
        let fb2 = r#"<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>fiction</genre>
      <author><first-name>Test</first-name><last-name>Author</last-name></author>
      <book-title>FB2 to DOCX Test</book-title>
      <lang>en</lang>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>Chapter One</p></title>
      <p>First paragraph of the book.</p>
      <p>Second paragraph of the book.</p>
    </section>
  </body>
</FictionBook>"#;
        let converter = Fb2ToDocxConverter;
        let result = converter.convert(fb2.as_bytes()).unwrap();

        // Must be valid ZIP
        assert!(result.len() > 4);
        assert_eq!(result[0], 0x50);
        assert_eq!(result[1], 0x4B);

        // Verify content in DOCX
        let cursor = std::io::Cursor::new(&result);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(content.contains("FB2 to DOCX Test"), "missing book title");
        assert!(content.contains("Chapter One"), "missing section title");
        assert!(
            content.contains("First paragraph of the book"),
            "missing first paragraph"
        );
        assert!(
            content.contains("Second paragraph of the book"),
            "missing second paragraph"
        );
    }

    // ── DocxToEpub ─────────────────────────────────────────────────────

    #[test]
    fn test_docx_to_epub_parse_error() {
        let converter = DocxToEpubConverter;
        let result = converter.convert(b"not a docx file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_docx_to_epub_format_strings() {
        let converter = DocxToEpubConverter;
        assert_eq!(converter.source_format(), "docx");
        assert_eq!(converter.target_format(), "epub");
    }

    #[test]
    fn test_docx_to_epub_basic() {
        let docx = make_minimal_docx();
        let converter = DocxToEpubConverter;
        let result = converter.convert(&docx).unwrap();

        assert!(is_epub_file(&result), "output should be valid EPUB");

        let parsed = EpubParser::new().parse(&result).unwrap();
        assert_eq!(parsed.version, "3.0");
        assert!(
            !parsed.chapters.is_empty(),
            "should have at least one chapter"
        );
    }

    #[test]
    fn test_docx_to_epub_preserves_content() {
        let docx = make_minimal_docx();
        let converter = DocxToEpubConverter;
        let epub_bytes = converter.convert(&docx).unwrap();

        let parsed = EpubParser::new().parse(&epub_bytes).unwrap();
        let chapter_text = strip_html_tags(&parsed.chapters[0].content);
        assert!(
            chapter_text.contains("Hello World"),
            "missing 'Hello World' in EPUB output: {:?}",
            chapter_text
        );
    }

    #[test]
    fn test_docx_to_epub_with_headings() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
    <w:p><w:r><w:t>Content of chapter one.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle val="Heading1"/></w:pPr><w:r><w:t>Chapter Two</w:t></w:r></w:p>
    <w:p><w:r><w:t>Content of chapter two.</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToEpubConverter;
        let epub_bytes = converter.convert(&docx).unwrap();

        let parsed = EpubParser::new().parse(&epub_bytes).unwrap();
        assert!(
            parsed.chapters.len() >= 2,
            "should have at least 2 chapters from headings, got {}",
            parsed.chapters.len()
        );
    }

    // ── Cross-format converter format strings (new converters) ─────────

    #[test]
    fn test_new_cross_format_converter_format_strings() {
        let epub_docx = EpubToDocxConverter;
        assert_eq!(epub_docx.source_format(), "epub");
        assert_eq!(epub_docx.target_format(), "docx");

        let fb2_docx = Fb2ToDocxConverter;
        assert_eq!(fb2_docx.source_format(), "fb2");
        assert_eq!(fb2_docx.target_format(), "docx");

        let docx_epub = DocxToEpubConverter;
        assert_eq!(docx_epub.source_format(), "docx");
        assert_eq!(docx_epub.target_format(), "epub");
    }

    // ── XpsToDocx ──────────────────────────────────────────────────────

    #[test]
    fn test_xps_to_docx_format_strings() {
        let converter = XpsToDocxConverter;
        assert_eq!(converter.source_format(), "xps");
        assert_eq!(converter.target_format(), "docx");
    }

    #[test]
    fn test_xps_to_docx_parse_error() {
        let converter = XpsToDocxConverter;
        let result = converter.convert(b"not an xps file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_xps_to_docx_roundtrip() {
        // Create a minimal XPS, convert to DOCX, verify content
        let xps_doc = wo_xps::model::XpsDocument {
            page_count: 1,
            pages: vec![wo_xps::model::XpsPage {
                index: 0,
                width: 612.0,
                height: 792.0,
                content: wo_xps::model::XpsPageContent {
                    glyphs: vec![wo_xps::model::XpsGlyphs {
                        text: "Hello XPS to DOCX".to_string(),
                        font_uri: "/Fonts/A.ttf".to_string(),
                        font_size: 12.0,
                        origin_x: 72.0,
                        origin_y: 72.0,
                        fill: None,
                        is_unicode: true,
                    }],
                    paths: vec![],
                },
            }],
            fonts: vec![],
            images: vec![],
            relationships: vec![],
            metadata: wo_xps::model::XpsMetadata::default(),
        };
        let xps_bytes = XpsSerializer::new().serialize(&xps_doc).unwrap();

        let converter = XpsToDocxConverter;
        let docx_bytes = converter.convert(&xps_bytes).unwrap();

        // Verify valid DOCX ZIP
        assert!(docx_bytes.len() > 4);
        assert_eq!(docx_bytes[0], 0x50);
        assert_eq!(docx_bytes[1], 0x4B);

        // Verify content
        let cursor = std::io::Cursor::new(&docx_bytes);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(
            content.contains("Hello XPS to DOCX"),
            "missing 'Hello XPS to DOCX' in DOCX content"
        );
    }

    // ── OfdToDocx ──────────────────────────────────────────────────────

    #[test]
    fn test_ofd_to_docx_format_strings() {
        let converter = OfdToDocxConverter;
        assert_eq!(converter.source_format(), "ofd");
        assert_eq!(converter.target_format(), "docx");
    }

    #[test]
    fn test_ofd_to_docx_parse_error() {
        let converter = OfdToDocxConverter;
        let result = converter.convert(b"not an ofd file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_ofd_to_docx_roundtrip() {
        // Create a minimal OFD, convert to DOCX, verify content
        let ofd_doc = wo_ofd::model::OfdDocument {
            version: Some("1.0".to_string()),
            doc_body: Some(wo_ofd::model::OfdDocBody {
                title: Some("OFD Test".to_string()),
                author: Some("Test Author".to_string()),
                ..Default::default()
            }),
            page_count: 1,
            pages: vec![wo_ofd::model::OfdPage {
                id: Some("1".to_string()),
                index: 0,
                width: 210.0,
                height: 297.0,
                base_loc: None,
                text_content: vec![wo_ofd::model::OfdTextObject {
                    boundary: Some((10.0, 10.0, 100.0, 20.0)),
                    text: "Hello OFD to DOCX".to_string(),
                    font_id: None,
                    font_size: Some(12.0),
                    bold: false,
                    italic: false,
                }],
                image_refs: vec![],
            }],
            resources: vec![],
        };
        let ofd_bytes = wo_ofd::OfdSerializer::new().serialize(&ofd_doc).unwrap();

        let converter = OfdToDocxConverter;
        let docx_bytes = converter.convert(&ofd_bytes).unwrap();

        // Verify valid DOCX ZIP
        assert!(docx_bytes.len() > 4);
        assert_eq!(docx_bytes[0], 0x50);
        assert_eq!(docx_bytes[1], 0x4B);

        // Verify content
        let cursor = std::io::Cursor::new(&docx_bytes);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(
            content.contains("Hello OFD to DOCX"),
            "missing 'Hello OFD to DOCX' in DOCX content"
        );
    }

    // ── HwpToDocx ──────────────────────────────────────────────────────

    #[test]
    fn test_hwp_to_docx_format_strings() {
        let converter = HwpToDocxConverter;
        assert_eq!(converter.source_format(), "hwp");
        assert_eq!(converter.target_format(), "docx");
    }

    #[test]
    fn test_hwp_to_docx_parse_error() {
        let converter = HwpToDocxConverter;
        let result = converter.convert(b"not an hwp file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_hwp_to_docx_roundtrip() {
        // Create a minimal HWP, convert to DOCX, verify content
        let hwp_doc = wo_hwp::model::HwpDocument {
            version: wo_hwp::model::HwpVersion::V5,
            signature_type: wo_hwp::model::HwpSignatureType::OleCompound,
            metadata: wo_hwp::model::HwpMetadata::default(),
            header: None,
            doc_info: Some(wo_hwp::model::HwpDocInfo {
                title: Some("HWP Test".to_string()),
                author: Some("Test Author".to_string()),
                ..Default::default()
            }),
            paragraphs: vec![wo_hwp::model::HwpParagraph {
                text: "Hello HWP to DOCX".to_string(),
                bold: true,
                italic: false,
                underline: false,
                font_name: Some("Batang".to_string()),
                font_size: Some(12.0),
                ..Default::default()
            }],
            page_count: 1,
            paragraph_count: 1,
            compressed: false,
            encrypted: false,
        };
        let hwp_bytes = wo_hwp::HwpSerializer::new().serialize(&hwp_doc).unwrap();

        let converter = HwpToDocxConverter;
        let docx_bytes = converter.convert(&hwp_bytes).unwrap();

        // Verify valid DOCX ZIP
        assert!(docx_bytes.len() > 4);
        assert_eq!(docx_bytes[0], 0x50);
        assert_eq!(docx_bytes[1], 0x4B);

        // Verify content
        let cursor = std::io::Cursor::new(&docx_bytes);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(
            content.contains("HWP Test"),
            "missing title 'HWP Test' in DOCX content"
        );
        assert!(
            content.contains("Hello HWP to DOCX"),
            "missing 'Hello HWP to DOCX' in DOCX content"
        );
    }

    // ── DjvuToDocx ─────────────────────────────────────────────────────

    #[test]
    fn test_djvu_to_docx_format_strings() {
        let converter = DjvuToDocxConverter;
        assert_eq!(converter.source_format(), "djvu");
        assert_eq!(converter.target_format(), "docx");
    }

    #[test]
    fn test_djvu_to_docx_parse_error() {
        let converter = DjvuToDocxConverter;
        let result = converter.convert(b"not a djvu file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_djvu_to_docx_roundtrip() {
        // Create a minimal DjVu, convert to DOCX, verify content
        let djvu_doc = wo_djvu::model::DjvuDocument {
            subtype: "DJVU".to_string(),
            page_count: 3,
            title: Some("DjVu Test Document".to_string()),
            width: 640,
            height: 480,
            version: "0.27".to_string(),
            chunks: vec![],
        };
        let djvu_bytes = wo_djvu::DjvuSerializer::new().serialize(&djvu_doc).unwrap();

        let converter = DjvuToDocxConverter;
        let docx_bytes = converter.convert(&djvu_bytes).unwrap();

        // Verify valid DOCX ZIP
        assert!(docx_bytes.len() > 4);
        assert_eq!(docx_bytes[0], 0x50);
        assert_eq!(docx_bytes[1], 0x4B);

        // Verify content
        let cursor = std::io::Cursor::new(&docx_bytes);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut content).unwrap();
        assert!(
            content.contains("DjVu Document"),
            "missing 'DjVu Document' in DOCX content"
        );
    }

    // ── DocxToXps ──────────────────────────────────────────────────────

    #[test]
    fn test_docx_to_xps_format_strings() {
        let converter = DocxToXpsConverter;
        assert_eq!(converter.source_format(), "docx");
        assert_eq!(converter.target_format(), "xps");
    }

    #[test]
    fn test_docx_to_xps_parse_error() {
        let converter = DocxToXpsConverter;
        let result = converter.convert(b"not a docx file");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("parse error"),
            "expected parse error, got: {}",
            err
        );
    }

    #[test]
    fn test_docx_to_xps_roundtrip() {
        // Create a minimal DOCX, convert to XPS, verify content
        let docx = make_minimal_docx();
        let converter = DocxToXpsConverter;
        let xps_bytes = converter.convert(&docx).unwrap();

        // Verify valid XPS (ZIP)
        assert!(
            wo_xps::is_xps_file(&xps_bytes),
            "output should be valid XPS"
        );

        // Parse back and verify content
        let parsed = XpsParser::new().parse(&xps_bytes).unwrap();
        assert!(parsed.page_count >= 1, "should have at least 1 page");
        let mut found_text = false;
        for page in &parsed.pages {
            for glyph in &page.content.glyphs {
                if glyph.text.contains("Hello World") {
                    found_text = true;
                    break;
                }
            }
        }
        assert!(found_text, "missing 'Hello World' in XPS output");
    }

    #[test]
    fn test_docx_to_xps_multiple_pages() {
        // Create a DOCX with many paragraphs to trigger page splitting
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Line 1</w:t></w:r></w:p>
    <w:p><w:r><w:t>Line 2</w:t></w:r></w:p>
    <w:p><w:r><w:t>Line 3</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
        );
        let converter = DocxToXpsConverter;
        let xps_bytes = converter.convert(&docx).unwrap();

        let parsed = XpsParser::new().parse(&xps_bytes).unwrap();
        assert!(parsed.page_count >= 1, "should have at least 1 page");

        // Collect all glyph text
        let mut all_text: String = String::new();
        for page in &parsed.pages {
            for glyph in &page.content.glyphs {
                all_text.push_str(&glyph.text);
                all_text.push(' ');
            }
        }
        assert!(all_text.contains("Line 1"), "missing 'Line 1'");
        assert!(all_text.contains("Line 2"), "missing 'Line 2'");
        assert!(all_text.contains("Line 3"), "missing 'Line 3'");
    }

    // ── Niche format converter format strings ─────────────────────────

    #[test]
    fn test_niche_converter_format_strings() {
        let xps_docx = XpsToDocxConverter;
        assert_eq!(xps_docx.source_format(), "xps");
        assert_eq!(xps_docx.target_format(), "docx");

        let ofd_docx = OfdToDocxConverter;
        assert_eq!(ofd_docx.source_format(), "ofd");
        assert_eq!(ofd_docx.target_format(), "docx");

        let hwp_docx = HwpToDocxConverter;
        assert_eq!(hwp_docx.source_format(), "hwp");
        assert_eq!(hwp_docx.target_format(), "docx");

        let djvu_docx = DjvuToDocxConverter;
        assert_eq!(djvu_docx.source_format(), "djvu");
        assert_eq!(djvu_docx.target_format(), "docx");

        let docx_xps = DocxToXpsConverter;
        assert_eq!(docx_xps.source_format(), "docx");
        assert_eq!(docx_xps.target_format(), "xps");
    }

    #[test]
    fn test_presentation_converter_format_strings() {
        let wo_pptx = WoPresentationToPptxConverter;
        assert_eq!(wo_pptx.source_format(), "wo-presentation");
        assert_eq!(wo_pptx.target_format(), "pptx");

        let pptx_wo = PptxToWoPresentationConverter;
        assert_eq!(pptx_wo.source_format(), "pptx");
        assert_eq!(pptx_wo.target_format(), "wo-presentation");
    }
}
