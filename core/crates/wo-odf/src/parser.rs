//! ODF format parser.
//!
//! Parses ODF ZIP archives (ODT, ODS, ODP) by reading:
//! - `mimetype` — document type detection
//! - `META-INF/manifest.xml` — file manifest
//! - `content.xml` — document body
//! - `styles.xml` — styles (optional)
//!
//! Uses roxmltree for XML parsing and wo-office-utils for ZIP handling.

use std::io::{Cursor, Read};

use roxmltree::Document as XmlDoc;
use wo_common::{CoreError, Document, DocumentMetadata, Result};

use crate::model::*;

const OFFICE_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const ODF_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const META_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:meta:1.0";
const TEXT_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const TABLE_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
const STYLE_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
const FO_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0";
const MANIFEST_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";
const DRAW_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0";
const SVG_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0";
const XLINK_NS: &str = "http://www.w3.org/1999/xlink";
const PRESENTATION_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0";

/// ODF parser.
pub struct OdfParser;

impl OdfParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse ODF data (ZIP bytes) into an OdfDocument.
    pub fn parse(&self, data: &[u8]) -> Result<OdfDocument> {
        let cursor = Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| CoreError::Parse {
            format: "odf".into(),
            message: format!("Invalid ZIP archive: {}", e),
        })?;

        // Detect document type from mimetype
        let doc_type = self.detect_type(&mut archive)?;
        let version = self.detect_version(&mut archive)?;

        // Parse manifest
        let manifest = self.parse_manifest(&mut archive)?;

        // Parse content.xml
        let content_xml = self.read_zip_entry(&mut archive, "content.xml")?;
        let content_doc = XmlDoc::parse(&content_xml).map_err(|e| CoreError::Parse {
            format: "odf".into(),
            message: format!("Invalid content.xml: {}", e),
        })?;

        // Parse styles.xml (optional)
        let (fonts, styles) = if archive.by_name("styles.xml").is_ok() {
            let styles_xml = self.read_zip_entry(&mut archive, "styles.xml")?;
            self.parse_styles_xml(&styles_xml)?
        } else {
            (Vec::new(), Vec::new())
        };

        // Parse metadata from meta.xml (optional)
        let metadata = if archive.by_name("meta.xml").is_ok() {
            let meta_xml = self.read_zip_entry(&mut archive, "meta.xml")?;
            self.parse_metadata(&meta_xml)?
        } else {
            // Fallback: try to extract metadata from content.xml office:meta
            self.extract_metadata_from_content(&content_doc)
        };

        // Parse document body
        let content = self.parse_content(&content_doc, &doc_type, &mut archive)?;

        Ok(OdfDocument {
            doc_type,
            version,
            metadata,
            content,
            manifest,
            fonts,
            styles,
        })
    }

    fn detect_type(&self, archive: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Result<OdfType> {
        let mut mimetype_file = match archive.by_name("mimetype") {
            Ok(f) => f,
            Err(_) => return Ok(OdfType::Unknown),
        };
        let mut buf = String::new();
        Read::read_to_string(&mut mimetype_file, &mut buf).map_err(|e| CoreError::Parse {
            format: "odf".into(),
            message: format!("Cannot read mimetype: {}", e),
        })?;

        let mime = buf.trim();
        Ok(match mime {
            "application/vnd.oasis.opendocument.text" => OdfType::Text,
            "application/vnd.oasis.opendocument.text-template" => OdfType::Text,
            "application/vnd.oasis.opendocument.spreadsheet" => OdfType::Spreadsheet,
            "application/vnd.oasis.opendocument.spreadsheet-template" => OdfType::Spreadsheet,
            "application/vnd.oasis.opendocument.presentation" => OdfType::Presentation,
            "application/vnd.oasis.opendocument.presentation-template" => OdfType::Presentation,
            "application/vnd.oasis.opendocument.graphics" => OdfType::Drawing,
            "application/vnd.oasis.opendocument.chart" => OdfType::Chart,
            "application/vnd.oasis.opendocument.formula" => OdfType::Formula,
            _ => OdfType::Unknown,
        })
    }

    fn detect_version(&self, archive: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Result<String> {
        // Try content.xml root element version attribute
        if let Ok(content_xml) = self.read_zip_entry(archive, "content.xml") {
            if let Ok(doc) = XmlDoc::parse(&content_xml) {
                let root = doc.root_element();
                if let Some(v) = root.attribute((ODF_NS, "version")) {
                    return Ok(v.to_string());
                }
                // Fallback: try without namespace
                if let Some(v) = root.attribute("version") {
                    return Ok(v.to_string());
                }
            }
        }
        Ok("1.2".to_string())
    }

    fn read_zip_entry(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
        path: &str,
    ) -> Result<String> {
        let mut file = archive.by_name(path).map_err(|e| CoreError::Parse {
            format: "odf".into(),
            message: format!("Missing {}: {}", path, e),
        })?;
        let mut buf = String::new();
        Read::read_to_string(&mut file, &mut buf).map_err(|e| CoreError::Parse {
            format: "odf".into(),
            message: format!("Cannot read {}: {}", path, e),
        })?;
        Ok(buf)
    }

    fn parse_manifest(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<Vec<OdfManifestEntry>> {
        let xml = match self.read_zip_entry(archive, "META-INF/manifest.xml") {
            Ok(x) => x,
            Err(_) => return Ok(Vec::new()),
        };

        let doc = match XmlDoc::parse(&xml) {
            Ok(d) => d,
            Err(_) => return Ok(Vec::new()),
        };

        let mut entries = Vec::new();
        for node in doc.descendants() {
            if node.has_tag_name((MANIFEST_NS, "file-entry")) {
                let path = node
                    .attribute((MANIFEST_NS, "full-path"))
                    .unwrap_or("")
                    .to_string();
                let media_type = node
                    .attribute((MANIFEST_NS, "media-type"))
                    .map(|s| s.to_string());
                let full_path = node
                    .attribute((MANIFEST_NS, "full-path"))
                    .map(|s| s.to_string());
                let version = node
                    .attribute((MANIFEST_NS, "version"))
                    .map(|s| s.to_string());

                entries.push(OdfManifestEntry {
                    path: path.clone(),
                    media_type,
                    full_path,
                    version,
                });
            }
        }

        Ok(entries)
    }

    fn parse_metadata(&self, xml: &str) -> Result<OdfMetadata> {
        let doc = XmlDoc::parse(xml).map_err(|e| CoreError::Parse {
            format: "odf".into(),
            message: format!("Invalid meta.xml: {}", e),
        })?;

        let mut meta = OdfMetadata::default();

        for node in doc.descendants() {
            if !node.is_element() {
                continue;
            }
            let tag = node.tag_name().name();
            let ns = node.tag_name().namespace().unwrap_or("");
            if ns != META_NS {
                continue;
            }

            if let Some(text) = node.text() {
                let val = text.trim().to_string();
                if val.is_empty() {
                    continue;
                }
                match tag {
                    "title" => meta.title = Some(val),
                    "creator" => meta.creator = Some(val),
                    "subject" => meta.subject = Some(val),
                    "description" => meta.description = Some(val),
                    "keyword" => meta.keywords = Some(val),
                    "language" => meta.language = Some(val),
                    "date" => meta.date = Some(val),
                    "editing-duration" => {}
                    "generator" => meta.generator = Some(val),
                    "initial-creator" => {}
                    _ => {}
                }
            }
        }

        Ok(meta)
    }

    fn extract_metadata_from_content(&self, doc: &XmlDoc) -> OdfMetadata {
        let mut meta = OdfMetadata::default();

        for node in doc.descendants() {
            if !node.has_tag_name((META_NS, "title"))
                && !node.has_tag_name((META_NS, "creator"))
                && !node.has_tag_name((META_NS, "subject"))
                && !node.has_tag_name((META_NS, "keyword"))
                && !node.has_tag_name((META_NS, "generator"))
            {
                continue;
            }

            let tag = node.tag_name().name();
            if let Some(text) = node.text() {
                let val = text.trim().to_string();
                if val.is_empty() {
                    continue;
                }
                match tag {
                    "title" => meta.title = Some(val),
                    "creator" => meta.creator = Some(val),
                    "subject" => meta.subject = Some(val),
                    "keyword" => meta.keywords = Some(val),
                    "generator" => meta.generator = Some(val),
                    _ => {}
                }
            }
        }

        meta
    }

    fn parse_content(
        &self,
        doc: &XmlDoc,
        doc_type: &OdfType,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<OdfContent> {
        match doc_type {
            OdfType::Text => self.parse_text_content(doc, archive),
            OdfType::Spreadsheet => self.parse_spreadsheet_content(doc, archive),
            OdfType::Presentation => self.parse_presentation_content(doc, archive),
            _ => Ok(OdfContent::Generic),
        }
    }

    fn parse_text_content(
        &self,
        doc: &XmlDoc,
        _archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<OdfContent> {
        let mut content = Vec::new();
        let mut sections = Vec::new();

        for node in doc.descendants() {
            if node.has_tag_name((TEXT_NS, "p")) {
                let text = Self::collect_text(node);
                let style_name = node
                    .attribute((TEXT_NS, "style-name"))
                    .map(|s| s.to_string());
                let spans = Self::collect_spans(node);
                content.push(OdfTextContent::Paragraph(TextParagraph {
                    text,
                    style_name,
                    spans,
                }));
            } else if node.has_tag_name((TEXT_NS, "h")) {
                let text = Self::collect_text(node);
                let level = node
                    .attribute((TEXT_NS, "outline-level"))
                    .and_then(|l| l.parse::<u32>().ok())
                    .unwrap_or(1);
                let style_name = node
                    .attribute((TEXT_NS, "style-name"))
                    .map(|s| s.to_string());
                content.push(OdfTextContent::Heading(TextHeading {
                    text,
                    level,
                    style_name,
                }));
            } else if node.has_tag_name((TABLE_NS, "table")) {
                content.push(OdfTextContent::Table(self.parse_table(node)));
            } else if node.has_tag_name((TEXT_NS, "list")) {
                content.push(OdfTextContent::List(self.parse_list(node)));
            } else if node.has_tag_name((DRAW_NS, "image")) {
                if let Some(img) = self.parse_image(node) {
                    content.push(OdfTextContent::Image(img));
                }
            } else if node.has_tag_name((TEXT_NS, "section")) {
                sections.push(self.parse_section(node));
            }
        }

        Ok(OdfContent::Text {
            content,
            page_layouts: vec![],
            sections,
        })
    }

    fn collect_text(node: roxmltree::Node) -> String {
        let mut parts = Vec::new();
        for desc in node.descendants() {
            if desc.is_text() {
                if let Some(t) = desc.text() {
                    parts.push(t.to_string());
                }
            }
        }
        parts.join("").trim().to_string()
    }

    fn collect_spans(node: roxmltree::Node) -> Vec<TextSpan> {
        let mut spans = Vec::new();
        for child in node.children() {
            if child.has_tag_name((TEXT_NS, "span")) {
                let text = Self::collect_text(child);
                let style_name = child
                    .attribute((TEXT_NS, "style-name"))
                    .map(|s| s.to_string());
                spans.push(TextSpan {
                    text,
                    style_name,
                    bold: false,
                    italic: false,
                    underline: false,
                });
            }
        }
        spans
    }

    fn parse_list(&self, list_node: roxmltree::Node) -> OdfList {
        let list_style_name = list_node
            .attribute((TEXT_NS, "style-name"))
            .map(|s| s.to_string());

        // Detect list type from style name or child elements
        let list_type = if let Some(style_name) = &list_style_name {
            if style_name.starts_with("L") || style_name.contains("number") {
                OdfListType::Ordered
            } else {
                OdfListType::Unordered
            }
        } else {
            OdfListType::Unordered
        };

        let continue_numbering = list_node
            .attribute((TEXT_NS, "continue-numbering"))
            .map(|s| s == "true")
            .unwrap_or(false);

        let start_value = list_node
            .attribute((TEXT_NS, "start-value"))
            .and_then(|s| s.parse::<u32>().ok());

        let mut items = Vec::new();
        for item_node in list_node.children() {
            if !item_node.has_tag_name((TEXT_NS, "list-item")) {
                continue;
            }

            let mut item_content = Vec::new();
            for child in item_node.children() {
                if child.has_tag_name((TEXT_NS, "p")) {
                    let text = Self::collect_text(child);
                    let style_name = child
                        .attribute((TEXT_NS, "style-name"))
                        .map(|s| s.to_string());
                    let spans = Self::collect_spans(child);
                    item_content.push(OdfTextContent::Paragraph(TextParagraph {
                        text,
                        style_name,
                        spans,
                    }));
                } else if child.has_tag_name((TEXT_NS, "list")) {
                    item_content.push(OdfTextContent::List(self.parse_list(child)));
                }
            }

            items.push(OdfListItem {
                content: item_content,
                nesting_level: 0,
            });
        }

        OdfList {
            list_style_name,
            items,
            list_type,
            continue_numbering,
            start_value,
        }
    }

    fn parse_image(&self, image_node: roxmltree::Node) -> Option<OdfImage> {
        let href = image_node
            .attribute((XLINK_NS, "href"))
            .map(|s| s.to_string())?;
        let name = image_node
            .attribute((DRAW_NS, "name"))
            .map(|s| s.to_string());

        // Get dimensions from parent draw:frame
        let mut width = None;
        let mut height = None;
        let mut alt_text = None;

        if let Some(parent) = image_node.parent() {
            if parent.has_tag_name((DRAW_NS, "frame")) {
                width = parent.attribute((SVG_NS, "width")).map(|s| s.to_string());
                height = parent.attribute((SVG_NS, "height")).map(|s| s.to_string());
                alt_text = parent
                    .attribute((SVG_NS, "title"))
                    .or_else(|| parent.attribute((DRAW_NS, "name")))
                    .map(|s| s.to_string());
            }
        }

        Some(OdfImage {
            href,
            name,
            alt_text,
            width,
            height,
            data: None,
            content_type: None,
        })
    }

    fn parse_section(&self, section_node: roxmltree::Node) -> OdfSection {
        let name = section_node
            .attribute((TEXT_NS, "name"))
            .map(|s| s.to_string());
        let style_name = section_node
            .attribute((TEXT_NS, "style-name"))
            .map(|s| s.to_string());
        let protected = section_node
            .attribute((TEXT_NS, "protected"))
            .map(|s| s == "true")
            .unwrap_or(false);

        let mut content = Vec::new();
        for child in section_node.children() {
            if child.has_tag_name((TEXT_NS, "p")) {
                let text = Self::collect_text(child);
                let style_name = child
                    .attribute((TEXT_NS, "style-name"))
                    .map(|s| s.to_string());
                let spans = Self::collect_spans(child);
                content.push(OdfTextContent::Paragraph(TextParagraph {
                    text,
                    style_name,
                    spans,
                }));
            } else if child.has_tag_name((TEXT_NS, "h")) {
                let text = Self::collect_text(child);
                let level = child
                    .attribute((TEXT_NS, "outline-level"))
                    .and_then(|l| l.parse::<u32>().ok())
                    .unwrap_or(1);
                let style_name = child
                    .attribute((TEXT_NS, "style-name"))
                    .map(|s| s.to_string());
                content.push(OdfTextContent::Heading(TextHeading {
                    text,
                    level,
                    style_name,
                }));
            }
        }

        OdfSection {
            name,
            style_name,
            content,
            protected,
        }
    }

    fn parse_table(&self, table_node: roxmltree::Node) -> OdfTable {
        let name = table_node
            .attribute((TABLE_NS, "name"))
            .map(|s| s.to_string());
        let mut rows = Vec::new();
        let mut max_cols = 0;

        for row_node in table_node.children() {
            if !row_node.has_tag_name((TABLE_NS, "table-row")) {
                continue;
            }
            let mut cells = Vec::new();
            for cell_node in row_node.children() {
                if !cell_node.has_tag_name((TABLE_NS, "table-cell")) {
                    continue;
                }
                let text = Self::collect_text(cell_node);
                let row_span = cell_node
                    .attribute((TABLE_NS, "number-rows-spanned"))
                    .and_then(|v| v.parse::<u32>().ok())
                    .unwrap_or(1);
                let col_span = cell_node
                    .attribute((TABLE_NS, "number-columns-spanned"))
                    .and_then(|v| v.parse::<u32>().ok())
                    .unwrap_or(1);

                // Detect cell type
                let val_attr = cell_node.attribute((OFFICE_NS, "value"));
                let val_type = cell_node.attribute((OFFICE_NS, "value-type"));
                match val_type {
                    Some("float") | Some("currency") | Some("percentage") => {
                        let value = val_attr.and_then(|v| v.parse::<f64>().ok());
                        let ct = match val_type {
                            Some("currency") => CellType::Currency,
                            Some("percentage") => CellType::Percentage,
                            _ => CellType::Number,
                        };
                        cells.push(TableCell {
                            text,
                            row_span,
                            col_span,
                            cell_type: ct,
                            value,
                        });
                        continue;
                    }
                    Some("boolean") => {
                        let value = val_attr.and_then(|v| v.parse::<f64>().ok());
                        cells.push(TableCell {
                            text,
                            row_span,
                            col_span,
                            cell_type: CellType::Boolean,
                            value,
                        });
                        continue;
                    }
                    Some("date") | Some("time") => {
                        cells.push(TableCell {
                            text,
                            row_span,
                            col_span,
                            cell_type: CellType::Date,
                            value: None,
                        });
                        continue;
                    }
                    _ => {}
                };

                cells.push(TableCell {
                    text,
                    row_span,
                    col_span,
                    cell_type: CellType::String,
                    value: None,
                });
            }
            max_cols = max_cols.max(cells.len());
            rows.push(TableRow { cells });
        }

        OdfTable {
            name,
            rows,
            num_columns: max_cols,
        }
    }

    fn parse_spreadsheet_content(
        &self,
        doc: &XmlDoc,
        _archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<OdfContent> {
        let mut sheets = Vec::new();

        for node in doc.descendants() {
            if node.has_tag_name((TABLE_NS, "table")) {
                let name = node
                    .attribute((TABLE_NS, "name"))
                    .unwrap_or("Sheet1")
                    .to_string();
                let mut rows = Vec::new();
                let mut max_col: usize = 0;
                let mut row_num = 0u32;

                for row_node in node.children() {
                    if !row_node.has_tag_name((TABLE_NS, "table-row")) {
                        continue;
                    }
                    row_num += 1;
                    let mut cells = Vec::new();
                    let mut col: u32 = 0;

                    // Handle repeated rows
                    let repeat = row_node
                        .attribute((TABLE_NS, "number-rows-repeated"))
                        .and_then(|v| v.parse::<u32>().ok())
                        .unwrap_or(1);

                    for cell_node in row_node.children() {
                        if !cell_node.has_tag_name((TABLE_NS, "table-cell")) {
                            continue;
                        }

                        let cell_repeat = cell_node
                            .attribute((TABLE_NS, "number-columns-repeated"))
                            .and_then(|v| v.parse::<u32>().ok())
                            .unwrap_or(1);

                        let text = Self::collect_text(cell_node);
                        let formula = cell_node
                            .attribute((TABLE_NS, "formula"))
                            .map(|s| s.to_string());
                        let value = cell_node
                            .attribute((OFFICE_NS_FALLBACK, "value"))
                            .and_then(|v| v.parse::<f64>().ok());

                        let cell_type =
                            match cell_node.attribute((OFFICE_NS_FALLBACK, "value-type")) {
                                Some("float") => CellType::Number,
                                Some("currency") => CellType::Currency,
                                Some("percentage") => CellType::Percentage,
                                Some("boolean") => CellType::Boolean,
                                Some("date") | Some("time") => CellType::Date,
                                _ => CellType::String,
                            };

                        for r in 0..cell_repeat {
                            cells.push(SpreadsheetCell {
                                column: col + r,
                                row: row_num,
                                text: if r == 0 { text.clone() } else { String::new() },
                                value: if r == 0 { value } else { None },
                                formula: if r == 0 { formula.clone() } else { None },
                                cell_type,
                            });
                        }
                        col += cell_repeat;
                    }

                    max_col = max_col.max(col as usize);
                    for r in 0..repeat {
                        let row_cells = if r == 0 {
                            cells.clone()
                        } else {
                            cells
                                .iter()
                                .map(|c| SpreadsheetCell {
                                    column: c.column,
                                    row: row_num + r - 1,
                                    text: String::new(),
                                    value: None,
                                    formula: None,
                                    cell_type: c.cell_type,
                                })
                                .collect()
                        };
                        rows.push(SpreadsheetRow {
                            row_num: row_num + r - 1,
                            cells: row_cells,
                        });
                    }
                }

                sheets.push(SpreadsheetSheet {
                    name,
                    rows,
                    max_column: max_col,
                });
            }
        }

        Ok(OdfContent::Spreadsheet { sheets })
    }

    fn parse_presentation_content(
        &self,
        doc: &XmlDoc,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<OdfContent> {
        let mut slides = Vec::new();

        for page_node in doc.descendants() {
            if page_node.has_tag_name((DRAW_NS, "page")) {
                let name = page_node
                    .attribute((DRAW_NS, "name"))
                    .map(|s| s.to_string());
                let shapes = self.parse_odp_shapes(page_node, archive);
                let notes = self.parse_odp_notes(page_node);
                let transition = self.parse_odp_transition(page_node);

                slides.push(PresentationSlide {
                    name,
                    text_content: Self::collect_text(page_node),
                    notes,
                    shapes,
                    transition,
                    slide_layout: page_node
                        .attribute((DRAW_NS, "presentation-page-layout-name"))
                        .map(|s| s.to_string()),
                });
            }
        }

        Ok(OdfContent::Presentation { slides })
    }

    /// Parse shapes from a draw:page element.
    fn parse_odp_shapes(
        &self,
        page_node: roxmltree::Node<'_, '_>,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Vec<OdpShape> {
        let mut shapes = Vec::new();
        for child in page_node.children() {
            if !child.is_element() {
                continue;
            }
            if let Some(shape) = self.parse_odp_shape(child, archive) {
                shapes.push(shape);
            }
        }
        shapes
    }

    /// Parse a single ODP shape element.
    fn parse_odp_shape(
        &self,
        node: roxmltree::Node<'_, '_>,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Option<OdpShape> {
        let ns = node.tag_name().namespace()?;
        if ns != DRAW_NS {
            return None;
        }

        let tag = node.tag_name().name();
        let shape_type = match tag {
            "rect" => OdpShapeType::Rect,
            "ellipse" | "circle" => OdpShapeType::Ellipse,
            "line" => OdpShapeType::Line,
            "connector" => OdpShapeType::Connector,
            "text-box" => OdpShapeType::TextBox,
            "frame" => OdpShapeType::Image,
            "custom-shape" => OdpShapeType::CustomShape,
            _ => return None,
        };

        let x = node.attribute((SVG_NS, "x")).unwrap_or("0cm").to_string();
        let y = node.attribute((SVG_NS, "y")).unwrap_or("0cm").to_string();
        let width = node
            .attribute((SVG_NS, "width"))
            .unwrap_or("0cm")
            .to_string();
        let height = node
            .attribute((SVG_NS, "height"))
            .unwrap_or("0cm")
            .to_string();

        let z_index = node
            .attribute((DRAW_NS, "z-index"))
            .and_then(|z| z.parse::<i32>().ok());
        let rotation = Self::parse_odp_transform(node);
        let style_name = node
            .attribute((DRAW_NS, "style-name"))
            .map(|s| s.to_string());
        let text_content = self.collect_odp_text(node);

        let image_ref = if shape_type == OdpShapeType::Image {
            self.parse_frame_image(node, archive)
        } else {
            None
        };

        Some(OdpShape {
            id: node
                .attribute((DRAW_NS, "id"))
                .or_else(|| node.attribute("xml:id"))
                .map(|s| s.to_string()),
            shape_type,
            x,
            y,
            width,
            height,
            z_index,
            rotation,
            fill_color: None,
            stroke_color: None,
            stroke_width: None,
            text_content,
            image_ref,
            style_name,
        })
    }

    /// Parse image reference from a draw:frame → draw:image chain.
    fn parse_frame_image(
        &self,
        frame_node: roxmltree::Node<'_, '_>,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Option<OdpImageRef> {
        for child in frame_node.children() {
            if child.has_tag_name((DRAW_NS, "image")) {
                let href = child.attribute((XLINK_NS, "href"))?;
                let data = self.read_zip_binary(archive, href);
                let name = child.attribute((DRAW_NS, "name")).map(|s| s.to_string());
                let content_type = href.rsplit('.').next().map(|ext| {
                    match ext.to_lowercase().as_str() {
                        "png" => "image/png",
                        "jpg" | "jpeg" => "image/jpeg",
                        "gif" => "image/gif",
                        "svg" => "image/svg+xml",
                        "webp" => "image/webp",
                        _ => "application/octet-stream",
                    }
                    .to_string()
                });
                return Some(OdpImageRef {
                    href: href.to_string(),
                    name,
                    data,
                    content_type,
                });
            }
        }
        None
    }

    /// Read binary data from a ZIP entry.
    fn read_zip_binary(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
        path: &str,
    ) -> Option<Vec<u8>> {
        let mut file = archive.by_name(path).ok()?;
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut file, &mut buf).ok()?;
        Some(buf)
    }

    /// Parse presentation:notes from a draw:page.
    fn parse_odp_notes(&self, page_node: roxmltree::Node<'_, '_>) -> Option<String> {
        for child in page_node.children() {
            if child.has_tag_name((PRESENTATION_NS, "notes")) {
                return Some(Self::collect_text(child));
            }
        }
        None
    }

    /// Parse presentation:transition from a draw:page.
    fn parse_odp_transition(&self, page_node: roxmltree::Node<'_, '_>) -> Option<OdpTransition> {
        for child in page_node.children() {
            if child.has_tag_name((PRESENTATION_NS, "transition")) {
                return Some(OdpTransition {
                    type_name: child
                        .attribute((PRESENTATION_NS, "type-name"))
                        .map(|s| s.to_string()),
                    duration: child
                        .attribute((PRESENTATION_NS, "duration"))
                        .map(|s| s.to_string()),
                    direction: child
                        .attribute((PRESENTATION_NS, "direction"))
                        .map(|s| s.to_string()),
                    speed: child
                        .attribute((PRESENTATION_NS, "speed"))
                        .map(|s| s.to_string()),
                });
            }
        }
        None
    }

    /// Collect text from text:p elements inside a shape node.
    fn collect_odp_text(&self, node: roxmltree::Node<'_, '_>) -> Option<String> {
        let mut texts = Vec::new();
        for child in node.descendants() {
            if child.has_tag_name((TEXT_NS, "p")) {
                if let Some(t) = child.text() {
                    let trimmed = t.trim();
                    if !trimmed.is_empty() {
                        texts.push(trimmed.to_string());
                    }
                }
            }
        }
        if texts.is_empty() {
            None
        } else {
            Some(texts.join("\n"))
        }
    }

    /// Parse SVG transform attribute for rotation.
    fn parse_odp_transform(node: roxmltree::Node<'_, '_>) -> Option<String> {
        node.attribute("transform")
            .map(|s| s.to_string())
            .or_else(|| {
                node.attribute((DRAW_NS, "transform"))
                    .map(|s| s.to_string())
            })
    }

    fn parse_styles_xml(&self, xml: &str) -> Result<(Vec<OdfFontFace>, Vec<OdfStyle>)> {
        let doc = XmlDoc::parse(xml).map_err(|e| CoreError::Parse {
            format: "odf".into(),
            message: format!("Invalid styles.xml: {}", e),
        })?;

        let mut fonts = Vec::new();
        let mut styles = Vec::new();

        for node in doc.descendants() {
            if node.has_tag_name((STYLE_NS, "font-face")) {
                let name = node.attribute((STYLE_NS, "name")).unwrap_or("").to_string();
                if !name.is_empty() {
                    fonts.push(OdfFontFace {
                        name,
                        font_family: node
                            .attribute((SVG_NS, "font-family"))
                            .map(|s| s.to_string()),
                        font_style: node.attribute((FO_NS, "font-style")).map(|s| s.to_string()),
                        font_weight: node
                            .attribute((FO_NS, "font-weight"))
                            .map(|s| s.to_string()),
                    });
                }
            } else if node.has_tag_name((STYLE_NS, "style")) {
                let style_name = node.attribute((STYLE_NS, "name")).unwrap_or("").to_string();
                if !style_name.is_empty() {
                    let family = node.attribute((STYLE_NS, "family")).map(|s| s.to_string());
                    let parent = node
                        .attribute((STYLE_NS, "parent-style-name"))
                        .map(|s| s.to_string());
                    let display_name = node
                        .attribute((STYLE_NS, "display-name"))
                        .map(|s| s.to_string());

                    let mut properties = Vec::new();
                    for child in node.children() {
                        if child.has_tag_name((STYLE_NS, "text-properties"))
                            || child.has_tag_name((STYLE_NS, "paragraph-properties"))
                        {
                            for attr in child.attributes() {
                                let key = format!("{}:{}", child.tag_name().name(), attr.name());
                                properties.push((key, attr.value().to_string()));
                            }
                        }
                    }

                    styles.push(OdfStyle {
                        name: style_name,
                        family,
                        parent,
                        display_name,
                        properties,
                    });
                }
            }
        }

        Ok((fonts, styles))
    }

    /// Parse ODF and convert to a generic Document.
    pub fn parse_to_document(&self, data: &[u8]) -> Result<Document> {
        let odf = self.parse(data)?;

        let (title, _text, word_count) = match &odf.content {
            OdfContent::Text { content, .. } => {
                let title = odf.metadata.title.clone();
                let mut parts = Vec::new();
                for item in content {
                    match item {
                        OdfTextContent::Heading(h) => {
                            parts.push(format!("{} {}", "#".repeat(h.level as usize), h.text));
                        }
                        OdfTextContent::Paragraph(p) if !p.text.trim().is_empty() => {
                            parts.push(p.text.clone());
                        }
                        _ => {}
                    }
                }
                let text = parts.join("\n");
                let word_count = text.split_whitespace().count() as u32;
                (title, text, word_count)
            }
            OdfContent::Spreadsheet { sheets } => {
                let mut parts = Vec::new();
                for sheet in sheets {
                    parts.push(format!("## {}", sheet.name));
                    for row in &sheet.rows {
                        let cells: Vec<String> = row.cells.iter().map(|c| c.text.clone()).collect();
                        parts.push(cells.join("\t"));
                    }
                }
                let text = parts.join("\n");
                let word_count = text.split_whitespace().count() as u32;
                (odf.metadata.title.clone(), text, word_count)
            }
            OdfContent::Presentation { slides } => {
                let mut parts = Vec::new();
                for (i, slide) in slides.iter().enumerate() {
                    parts.push(format!("--- Slide {} ---", i + 1));
                    parts.push(slide.text_content.clone());
                }
                let text = parts.join("\n");
                let word_count = text.split_whitespace().count() as u32;
                (odf.metadata.title.clone(), text, word_count)
            }
            OdfContent::Generic => (None, String::new(), 0),
        };

        Ok(Document {
            content: data.to_vec(),
            format: odf.doc_type.to_string(),
            metadata: DocumentMetadata {
                title,
                author: odf.metadata.creator.clone(),
                word_count: Some(word_count),
                ..Default::default()
            },
        })
    }
}

impl Default for OdfParser {
    fn default() -> Self {
        Self::new()
    }
}

// Fallback namespace constant for attribute access
const OFFICE_NS_FALLBACK: &str = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::is_odf_file;
    use std::io::Write;

    fn make_minimal_odt() -> Vec<u8> {
        // Build a minimal ODT (ZIP) with content.xml and mimetype
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            // mimetype must be first entry, stored (not compressed)
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
            zip.write_all(build_odt_content_xml().as_bytes()).unwrap();

            zip.start_file(
                "META-INF/manifest.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(build_manifest_xml().as_bytes()).unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    fn make_minimal_ods() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            zip.start_file(
                "mimetype",
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored),
            )
            .unwrap();
            zip.write_all(b"application/vnd.oasis.opendocument.spreadsheet")
                .unwrap();

            zip.start_file("content.xml", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(build_ods_content_xml().as_bytes()).unwrap();

            zip.start_file(
                "META-INF/manifest.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(build_manifest_xml().as_bytes()).unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    fn build_odt_content_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
    office:version="1.2">
  <office:body>
    <office:text>
      <text:p>First paragraph.</text:p>
      <text:h text:outline-level="1">Chapter One</text:h>
      <text:p>Second paragraph with <text:span text:style-name="bold">bold text</text:span>.</text:p>
      <text:p>Third paragraph.</text:p>
    </office:text>
  </office:body>
</office:document-content>"#
            .to_string()
    }

    fn build_ods_content_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
    office:version="1.2">
  <office:body>
    <office:spreadsheet>
      <table:table table:name="Sheet1">
        <table:table-row>
          <table:table-cell office:value-type="string">
            <text:p>Name</text:p>
          </table:table-cell>
          <table:table-cell office:value-type="string">
            <text:p>Score</text:p>
          </table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell office:value-type="string">
            <text:p>Alice</text:p>
          </table:table-cell>
          <table:table-cell office:value-type="float" office:value="95.5">
            <text:p>95.5</text:p>
          </table:table-cell>
        </table:table-row>
      </table:table>
    </office:spreadsheet>
  </office:body>
</office:document-content>"#
            .to_string()
    }

    fn build_manifest_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest
    xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>"#
            .to_string()
    }

    #[test]
    fn test_is_odf_file() {
        let odt = make_minimal_odt();
        assert!(is_odf_file(&odt));
        assert!(!is_odf_file(b"<html>not odf</html>"));
        assert!(!is_odf_file(b""));
        assert!(!is_odf_file(b"%PDF-1.4"));
    }

    #[test]
    fn test_parse_odt_type() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_odt()).unwrap();
        assert_eq!(doc.doc_type, OdfType::Text);
    }

    #[test]
    fn test_parse_odt_version() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_odt()).unwrap();
        assert_eq!(doc.version, "1.2");
    }

    #[test]
    fn test_parse_odt_paragraphs() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_odt()).unwrap();
        if let OdfContent::Text { content, .. } = &doc.content {
            let paragraphs: Vec<_> = content
                .iter()
                .filter_map(|c| match c {
                    OdfTextContent::Paragraph(p) => Some(p),
                    _ => None,
                })
                .collect();
            assert_eq!(paragraphs.len(), 3);
            assert_eq!(paragraphs[0].text, "First paragraph.");
            assert!(paragraphs[1].text.contains("bold text"));
        } else {
            panic!("Expected Text content");
        }
    }

    #[test]
    fn test_parse_odt_headings() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_odt()).unwrap();
        if let OdfContent::Text { content, .. } = &doc.content {
            let headings: Vec<_> = content
                .iter()
                .filter_map(|c| match c {
                    OdfTextContent::Heading(h) => Some(h),
                    _ => None,
                })
                .collect();
            assert_eq!(headings.len(), 1);
            assert_eq!(headings[0].text, "Chapter One");
            assert_eq!(headings[0].level, 1);
        } else {
            panic!("Expected Text content");
        }
    }

    #[test]
    fn test_parse_odt_spans() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_odt()).unwrap();
        if let OdfContent::Text { content, .. } = &doc.content {
            let paragraphs: Vec<_> = content
                .iter()
                .filter_map(|c| match c {
                    OdfTextContent::Paragraph(p) => Some(p),
                    _ => None,
                })
                .collect();
            let spans = &paragraphs[1].spans;
            assert_eq!(spans.len(), 1);
            assert_eq!(spans[0].text, "bold text");
        } else {
            panic!("Expected Text content");
        }
    }

    #[test]
    fn test_parse_manifest() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_odt()).unwrap();
        assert!(doc.manifest.len() >= 2);
        assert!(doc.manifest.iter().any(|e| e.path == "content.xml"));
    }

    #[test]
    fn test_parse_ods_type() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_ods()).unwrap();
        assert_eq!(doc.doc_type, OdfType::Spreadsheet);
    }

    #[test]
    fn test_parse_ods_sheets() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_ods()).unwrap();
        if let OdfContent::Spreadsheet { sheets } = &doc.content {
            assert_eq!(sheets.len(), 1);
            assert_eq!(sheets[0].name, "Sheet1");
            assert_eq!(sheets[0].rows.len(), 2);
        } else {
            panic!("Expected Spreadsheet content");
        }
    }

    #[test]
    fn test_parse_ods_cell_values() {
        let parser = OdfParser::new();
        let doc = parser.parse(&make_minimal_ods()).unwrap();
        if let OdfContent::Spreadsheet { sheets } = &doc.content {
            let row = &sheets[0].rows[1];
            assert_eq!(row.cells.len(), 2);
            assert_eq!(row.cells[0].text, "Alice");
            assert_eq!(row.cells[1].value, Some(95.5));
            assert_eq!(row.cells[1].cell_type, CellType::Number);
        } else {
            panic!("Expected Spreadsheet content");
        }
    }

    #[test]
    fn test_parse_to_document() {
        let parser = OdfParser::new();
        let doc = parser.parse_to_document(&make_minimal_odt()).unwrap();
        assert_eq!(doc.format, "odt");
        assert!(doc.metadata.word_count.unwrap() > 0);
    }

    #[test]
    fn test_rejects_non_odf() {
        let parser = OdfParser::new();
        let result = parser.parse(b"not a zip file at all");
        assert!(result.is_err());
    }

    #[test]
    fn test_odf_type_display() {
        assert_eq!(OdfType::Text.to_string(), "odt");
        assert_eq!(OdfType::Spreadsheet.to_string(), "ods");
        assert_eq!(OdfType::Presentation.to_string(), "odp");
    }
}
