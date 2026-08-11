//! VSDX format parser.
//!
//! Parses Visio 2013+ VSDX files (ZIP-based OPC packages) by reading:
//! - XML parts for pages, masters, shapes, and geometry
//! - ShapeSheet cells (PinX, PinY, Width, Height, Angle, Fill, Line, Shadow, etc.)
//! - Theme colors and document settings

use std::io::{Cursor, Read};

use quick_xml::Reader;
use quick_xml::events::Event;
use uuid::Uuid;

use crate::model::*;

/// Error type for Visio parsing.
#[derive(Debug, thiserror::Error)]
pub enum VisioError {
    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("XML parse error: {0}")]
    Xml(String),
    #[error("Missing entry: {0}")]
    MissingEntry(String),
    #[error("Invalid cell value: {0}")]
    CellValue(String),
}

/// VSDX parser — reads ZIP archives and produces a `VisioDocument`.
pub struct VisioParser;

impl Default for VisioParser {
    fn default() -> Self {
        Self::new()
    }
}

impl VisioParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse VSDX bytes into a `VisioDocument`.
    pub fn parse(&self, data: &[u8]) -> Result<VisioDocument, VisioError> {
        let cursor = Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor)?;

        // Read core properties if available
        let properties = self.parse_core_properties(&mut archive);

        // Parse page references from visio/pages/pages.xml
        let pages = self.parse_all_pages(&mut archive)?;

        // Parse master references
        let masters = self.parse_all_masters(&mut archive)?;

        // Parse theme colors
        let theme_colors = self.parse_theme_colors(&mut archive);

        Ok(VisioDocument {
            version: "16.0".to_string(),
            properties,
            pages,
            masters,
            theme_colors,
        })
    }

    // ── helpers ──────────────────────────────────────────────

    fn read_zip_entry(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
        path: &str,
    ) -> Result<String, VisioError> {
        let mut file = archive
            .by_name(path)
            .map_err(|_| VisioError::MissingEntry(path.to_string()))?;
        let mut buf = String::new();
        file.read_to_string(&mut buf)?;
        Ok(buf)
    }

    /// Try to read a zip entry, returning None if missing.
    fn try_read_zip_entry(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
        path: &str,
    ) -> Option<String> {
        self.read_zip_entry(archive, path).ok()
    }

    fn parse_core_properties(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> VisioProperties {
        let xml = match self.try_read_zip_entry(archive, "docProps/core.xml") {
            Some(x) => x,
            None => return VisioProperties::default(),
        };

        let mut props = VisioProperties::default();
        let mut reader = Reader::from_str(&xml);
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let raw_tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    // Strip namespace prefix (e.g., "dc:title" -> "title")
                    let tag = raw_tag.rsplit(':').next().unwrap_or(&raw_tag).to_string();
                    if let Ok(Event::Text(ref t)) = reader.read_event_into(&mut Vec::new()) {
                        let val = t.unescape().unwrap_or_default().trim().to_string();
                        if val.is_empty() {
                            continue;
                        }
                        match tag.as_str() {
                            "title" => props.title = Some(val),
                            "creator" => props.creator = Some(val),
                            "subject" => props.subject = Some(val),
                            "description" => props.description = Some(val),
                            _ => {}
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    eprintln!("Warning: core.xml parse error: {}", e);
                    break;
                }
                _ => {}
            }
            buf.clear();
        }

        props
    }

    // ── Pages ────────────────────────────────────────────────

    fn parse_all_pages(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<Vec<VisioPage>, VisioError> {
        // Read page list from visio/pages/pages.xml
        let pages_xml = match self.try_read_zip_entry(archive, "visio/pages/pages.xml") {
            Some(x) => x,
            None => return Ok(Vec::new()),
        };

        let page_refs = self.parse_page_references(&pages_xml);
        let mut pages = Vec::new();

        for (id, name, bg_id) in &page_refs {
            let page_file = format!("visio/pages/page{}.xml", id);
            if let Some(xml) = self.try_read_zip_entry(archive, &page_file) {
                let page = self.parse_page_xml(&xml, id, name, bg_id);
                pages.push(page);
            } else {
                // Page file not found — skip it rather than pushing an empty stub.
                // This avoids showing blank pages in the editor when the VSDX
                // archive is incomplete or corrupted.
                eprintln!(
                    "Warning: VSDX page {} ({}) not found in archive, skipping",
                    id, name
                );
            }
        }

        Ok(pages)
    }

    /// Parse <Pages><Page ID="0" Name="Page-1" .../>
    fn parse_page_references(&self, xml: &str) -> Vec<(String, String, Option<String>)> {
        let mut refs = Vec::new();
        let mut reader = Reader::from_str(xml);
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "Page" {
                        let id = Self::attr(e, "ID").unwrap_or_default();
                        let name = Self::attr(e, "Name").unwrap_or_else(|| id.clone());
                        let bg = Self::attr(e, "Background").or_else(|| Self::attr(e, "Backgound"));
                        let bg_id = if bg.as_deref() == Some("true") || bg.as_deref() == Some("1") {
                            // Background pages are referenced by other pages
                            None
                        } else {
                            Self::attr(e, "BackgroundPageID")
                        };
                        refs.push((id, name, bg_id));
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        refs
    }

    fn parse_page_xml(
        &self,
        xml: &str,
        page_id: &str,
        page_name: &str,
        bg_id: &Option<String>,
    ) -> VisioPage {
        let (shapes, connectors) = self.parse_shapes_and_connectors(xml);
        let (width, height) = self.parse_page_dimensions(xml);

        VisioPage {
            id: page_id.to_string(),
            name: page_name.to_string(),
            width,
            height,
            shapes,
            connectors,
            background_page_id: bg_id.clone(),
        }
    }

    fn parse_page_dimensions(&self, xml: &str) -> (f64, f64) {
        let mut reader = Reader::from_str(xml);
        let mut buf = Vec::new();
        let mut in_page_sheet = false;
        let mut width = 8.5;
        let mut height = 11.0;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "PageSheet" || tag == "Page" {
                        in_page_sheet = true;
                    }
                    if in_page_sheet && tag == "Cell" {
                        let n = Self::attr(e, "N").unwrap_or_default();
                        let v = Self::attr(e, "V").unwrap_or_default();
                        match n.as_str() {
                            "PageWidth" => width = v.parse().unwrap_or(width),
                            "PageHeight" => height = v.parse().unwrap_or(height),
                            _ => {}
                        }
                    }
                }
                Ok(Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "PageSheet" || tag == "Page" {
                        in_page_sheet = false;
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        (width, height)
    }

    // ── Shapes & Connectors ──────────────────────────────────

    fn parse_shapes_and_connectors(&self, xml: &str) -> (Vec<VisioShape>, Vec<VisioConnector>) {
        let mut shapes = Vec::new();
        let mut connectors = Vec::new();

        // Collect all shape tag ranges upfront using a character-based approach
        // This is more reliable than buffer_position which has encoding-dependent offsets
        let shape_ranges = self.find_shape_ranges(xml);
        for (start, end) in shape_ranges {
            let fragment = &xml[start..end];
            if self.is_connector_shape(fragment) {
                if let Some(conn) = self.parse_connector_from_xml(fragment) {
                    connectors.push(conn);
                }
            } else {
                let shape = self.parse_shape_from_xml(fragment, false);
                shapes.push(shape);
            }
        }

        (shapes, connectors)
    }

    /// Find byte ranges of all top-level `<Shape>...</Shape>` elements.
    fn find_shape_ranges(&self, xml: &str) -> Vec<(usize, usize)> {
        let mut ranges = Vec::new();
        let mut depth = 0u32;
        let mut start_pos = None;
        let bytes = xml.as_bytes();

        for (i, _) in bytes.iter().enumerate() {
            // Look for <Shape (with any casing — Visio uses exactly "Shape")
            if bytes[i..].starts_with(b"<Shape") && !bytes[i..].starts_with(b"<Shapes") {
                let after_tag = &bytes[i..];
                // Find end of this open tag
                let close = after_tag.iter().position(|&b| b == b'>');
                if let Some(close) = close {
                    if close > 0 && after_tag[close - 1] == b'/' {
                        // Self-closing <Shape ... />
                        continue;
                    }
                    if depth == 0 {
                        start_pos = Some(i);
                    }
                    depth += 1;
                }
            } else if bytes[i..].starts_with(b"</Shape>") {
                let end = i + 9; // "</Shape>" length
                if let Some(start) = start_pos
                    && depth == 1
                {
                    ranges.push((start, end));
                    start_pos = None;
                }
                depth = depth.saturating_sub(1);
            }
        }
        ranges
    }

    fn is_connector_shape(&self, xml: &str) -> bool {
        // Connectors (dynamic glue) have a OneD cell set to 1
        xml.contains("N=\"OneD\"") && (xml.contains("V=\"1\"") || xml.contains("V=\"1\""))
    }

    fn parse_shape_from_xml(&self, xml: &str, _is_sub_shape: bool) -> VisioShape {
        // First pass: extract attributes from <Shape> tag
        let id = self
            .extract_attr_from_xml(xml, "Shape", "ID")
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let name = self
            .extract_attr_from_xml(xml, "Shape", "NameU")
            .or_else(|| self.extract_attr_from_xml(xml, "Shape", "Name"));
        let unique_id = self.extract_attr_from_xml(xml, "Shape", "UniqueID");
        let master_id = self.extract_attr_from_xml(xml, "Shape", "Master");

        // Extract cell values
        let pin_x = self.parse_cell_f64(xml, "PinX").unwrap_or(0.0);
        let pin_y = self.parse_cell_f64(xml, "PinY").unwrap_or(0.0);
        let width = self.parse_cell_f64(xml, "Width").unwrap_or(0.0);
        let height = self.parse_cell_f64(xml, "Height").unwrap_or(0.0);
        let angle_deg = self
            .parse_cell_f64(xml, "Angle")
            .unwrap_or(0.0)
            .to_degrees();

        let loc_pin_x = self.parse_cell_f64(xml, "LocPinX").unwrap_or(width / 2.0);
        let loc_pin_y = self.parse_cell_f64(xml, "LocPinY").unwrap_or(height / 2.0);

        // Actual position: PinX - LocPinX, PinY - LocPinY
        let x = pin_x - loc_pin_x;
        let y = pin_y - loc_pin_y;

        let text = self.extract_shape_text(xml);

        let fill_color = self.parse_fill_color(xml);
        let fill_foreground = self
            .parse_cell_string(xml, "FillForegnd")
            .or_else(|| self.parse_cell_string_from_section(xml, "Fill", "FillForegnd"));
        let fill_background = self
            .parse_cell_string(xml, "FillBkgnd")
            .or_else(|| self.parse_cell_string_from_section(xml, "Fill", "FillBkgnd"));
        let stroke_color = self
            .parse_cell_string(xml, "LineColor")
            .or_else(|| self.parse_cell_string_from_section(xml, "Line", "LineColor"));
        let stroke_width = self
            .parse_cell_f64(xml, "LineWeight")
            .or_else(|| self.parse_cell_f64_from_section(xml, "Line", "LineWeight"));
        let stroke_pattern = self
            .parse_cell_u32(xml, "LinePattern")
            .or_else(|| self.parse_cell_u32_from_section(xml, "Line", "LinePattern"));
        let shadow_color = self
            .parse_cell_string(xml, "ShdwColor")
            .or_else(|| self.parse_cell_string_from_section(xml, "Shadow", "ShdwColor"));
        let shadow_offset_x = self
            .parse_cell_f64(xml, "ShdwOffsetX")
            .or_else(|| self.parse_cell_f64_from_section(xml, "Shadow", "ShdwOffsetX"));
        let shadow_offset_y = self
            .parse_cell_f64(xml, "ShdwOffsetY")
            .or_else(|| self.parse_cell_f64_from_section(xml, "Shadow", "ShdwOffsetY"));
        let layer_member = self.parse_cell_string(xml, "LayerMember");
        let style = self
            .parse_cell_string(xml, "LineStyle")
            .or_else(|| self.parse_cell_string(xml, "FillStyle"))
            .or_else(|| self.parse_cell_string(xml, "TextStyle"));

        let geometry = self.parse_geometry(xml, width, height);
        let formatting = self.parse_formatting(xml);

        // Parse sub-shapes
        let sub_shapes = self.parse_sub_shapes(xml);

        VisioShape {
            id,
            name,
            unique_id,
            master_id,
            x,
            y,
            width,
            height,
            rotation: angle_deg,
            text,
            fill_color,
            fill_foreground,
            fill_background,
            stroke_color,
            stroke_width,
            stroke_pattern,
            shadow_color,
            shadow_offset_x,
            shadow_offset_y,
            layer_member,
            geometry,
            sub_shapes,
            style,
            formatting,
        }
    }

    fn extract_shape_text(&self, xml: &str) -> Option<String> {
        // Find <Text>...</Text> content
        let mut reader = Reader::from_str(xml);
        let mut buf = Vec::new();
        let mut in_text = false;
        let mut text_parts = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "Text" {
                        in_text = true;
                    }
                    // Skip sub-shapes and sections within text
                    if tag == "Shapes" || tag == "Section" || tag == "Row" {
                        // We'll handle this by checking depth
                    }
                }
                Ok(Event::Text(ref t)) => {
                    if in_text && let Ok(escaped) = t.unescape() {
                        text_parts.push(escaped.to_string());
                    }
                }
                Ok(Event::CData(ref c)) => {
                    if in_text && let Ok(text) = String::from_utf8(c.to_vec()) {
                        text_parts.push(text);
                    }
                }
                Ok(Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "Text" {
                        break;
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        let text: String = text_parts.join("");
        if text.trim().is_empty() {
            None
        } else {
            Some(text.trim().to_string())
        }
    }

    fn parse_sub_shapes(&self, xml: &str) -> Vec<VisioShape> {
        let mut shapes = Vec::new();

        // Find <Shapes> section and then find sub-shapes within it using byte scanning
        let bytes = xml.as_bytes();
        let mut in_shapes_section = false;
        let mut depth = 0u32;
        let mut start_pos = None;

        for (i, _) in bytes.iter().enumerate() {
            if bytes[i..].starts_with(b"<Shapes>") || bytes[i..].starts_with(b"<Shapes ") {
                in_shapes_section = true;
                // Skip this byte so <Shapes> isn't also matched by the <Shape check below
                continue;
            } else if bytes[i..].starts_with(b"</Shapes>") {
                in_shapes_section = false;
                continue;
            }

            if in_shapes_section {
                if bytes[i..].starts_with(b"<Shape") {
                    let after = &bytes[i..];
                    let close = after.iter().position(|&b| b == b'>').unwrap_or(0);
                    if close > 0 && after[close - 1] == b'/' {
                        continue;
                    }
                    if depth == 0 {
                        start_pos = Some(i);
                    }
                    depth += 1;
                } else if bytes[i..].starts_with(b"</Shape>") {
                    if depth == 1 && start_pos.is_some() {
                        if let Some(s) = start_pos {
                            let fragment = &xml[s..i + 9];
                            let shape = self.parse_shape_from_xml(fragment, true);
                            shapes.push(shape);
                        }
                        start_pos = None;
                    }
                    depth = depth.saturating_sub(1);
                }
            }
        }

        shapes
    }

    // ── Geometry parsing ─────────────────────────────────────

    fn parse_geometry(&self, xml: &str, width: f64, height: f64) -> Option<VisioGeometry> {
        let segments = self.parse_geometry_segments(xml);
        if segments.is_empty() {
            None
        } else {
            Some(VisioGeometry {
                width,
                height,
                segments,
            })
        }
    }

    fn parse_geometry_segments(&self, xml: &str) -> Vec<GeoSegment> {
        let mut segments = Vec::new();
        let mut reader = Reader::from_str(xml);
        let mut buf = Vec::new();
        let mut in_geometry = false;
        let mut in_row = false;
        let mut row_type = String::new();
        let mut cells: Vec<(String, f64)> = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    match tag.as_str() {
                        "Section" => {
                            let n = Self::attr(e, "N").unwrap_or_default();
                            if n.starts_with("Geometry") {
                                in_geometry = true;
                            }
                        }
                        "Row" if in_geometry => {
                            if !cells.is_empty()
                                && !row_type.is_empty()
                                && let Some(seg) = self.build_segment(&row_type, &cells)
                            {
                                segments.push(seg);
                            }
                            cells.clear();
                            row_type = Self::attr(e, "T").unwrap_or_default();
                            in_row = true;
                        }
                        "Cell" if in_row => {
                            let n = Self::attr(e, "N").unwrap_or_default();
                            let v: f64 = Self::attr(e, "V")
                                .and_then(|s| s.parse().ok())
                                .unwrap_or(0.0);
                            cells.push((n, v));
                        }
                        _ => {}
                    }
                }
                Ok(Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    match tag.as_str() {
                        "Row" if in_row => {
                            if !row_type.is_empty()
                                && let Some(seg) = self.build_segment(&row_type, &cells)
                            {
                                segments.push(seg);
                            }
                            cells.clear();
                            row_type.clear();
                            in_row = false;
                        }
                        "Section" => {
                            in_geometry = false;
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        segments
    }

    fn build_segment(&self, row_type: &str, cells: &[(String, f64)]) -> Option<GeoSegment> {
        let get = |name: &str| -> f64 {
            cells
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, v)| *v)
                .unwrap_or(0.0)
        };

        match row_type {
            "MoveTo" => Some(GeoSegment::MoveTo {
                x: get("X"),
                y: get("Y"),
            }),
            "LineTo" => Some(GeoSegment::LineTo {
                x: get("X"),
                y: get("Y"),
            }),
            "ArcTo" => Some(GeoSegment::ArcTo {
                x: get("X"),
                y: get("Y"),
                a: get("A"),
                b: get("B"),
                c: get("C"),
            }),
            "EllipticalArcTo" => Some(GeoSegment::EllipticalArcTo {
                x: get("X"),
                y: get("Y"),
                a: get("A"),
                b: get("B"),
                c: get("C"),
                d: get("D"),
            }),
            "NURBSTo" => {
                // NURBS stores knot and weight sequences in the K and W cells as formulas
                let knots = vec![get("A"), get("B"), get("C")];
                let weights = vec![1.0, 1.0, 1.0];
                Some(GeoSegment::NURBSTo {
                    x: get("X"),
                    y: get("Y"),
                    knots,
                    weights,
                })
            }
            "PolylineTo" => {
                // Polyline stores point data in the X and Y cells
                Some(GeoSegment::PolylineTo {
                    x: get("X"),
                    y: get("Y"),
                    points: vec![(get("A"), get("B"))],
                })
            }
            "BezierTo" => Some(GeoSegment::BezierTo {
                x: get("X"),
                y: get("Y"),
                a: get("A"),
                b: get("B"),
                c: get("C"),
                d: get("D"),
            }),
            "SplineStart" => {
                let knots = vec![get("A"), get("B"), get("C")];
                Some(GeoSegment::SplineStart {
                    x: get("X"),
                    y: get("Y"),
                    degree: get("D") as u32,
                    knots,
                })
            }
            "InfiniteLine" => Some(GeoSegment::InfiniteLine {
                x1: get("X1"),
                y1: get("Y1"),
                x2: get("X2"),
                y2: get("Y2"),
            }),
            "Ellipse" => Some(GeoSegment::Ellipse {
                x: get("X"),
                y: get("Y"),
                cx: get("CX"),
                cy: get("CY"),
            }),
            _ => None,
        }
    }

    // ── Formatting ───────────────────────────────────────────

    fn parse_formatting(&self, xml: &str) -> Option<VisioFormatting> {
        let font = self
            .parse_cell_string(xml, "Char.Font")
            .or_else(|| self.parse_cell_string_from_section(xml, "Character", "Font"));
        let font_size = self
            .parse_cell_f64(xml, "Char.Size")
            .or_else(|| self.parse_cell_f64_from_section(xml, "Character", "Size"));
        let font_color = self
            .parse_cell_string(xml, "Char.Color")
            .or_else(|| self.parse_cell_string_from_section(xml, "Character", "Color"));
        let italic = self
            .parse_cell_bool(xml, "Char.Italic")
            .or_else(|| self.parse_cell_bool_from_section(xml, "Character", "Italic"));
        let bold = self
            .parse_cell_bool(xml, "Char.Bold")
            .or_else(|| self.parse_cell_bool_from_section(xml, "Character", "Bold"));
        let underline = self
            .parse_cell_bool(xml, "Char.Underline")
            .or_else(|| self.parse_cell_bool_from_section(xml, "Character", "Underline"));
        let align_horizontal = self
            .parse_cell_string(xml, "Para.HorizontalAlign")
            .or_else(|| self.parse_cell_string_from_section(xml, "Paragraph", "HorizontalAlign"))
            .map(|v| match v.as_str() {
                "1" => "Center".to_string(),
                "2" => "Right".to_string(),
                _ => "Left".to_string(),
            });
        let align_vertical = self
            .parse_cell_string(xml, "Char.VerticalAlign")
            .or_else(|| self.parse_cell_string_from_section(xml, "Paragraph", "VerticalAlign"))
            .map(|v| match v.as_str() {
                "1" => "Middle".to_string(),
                "2" => "Bottom".to_string(),
                _ => "Top".to_string(),
            });

        if font.is_none()
            && font_size.is_none()
            && font_color.is_none()
            && italic.is_none()
            && bold.is_none()
            && underline.is_none()
        {
            None
        } else {
            Some(VisioFormatting {
                font,
                font_size,
                font_color,
                italic,
                bold,
                underline,
                align_horizontal,
                align_vertical,
                tlbr: None,
            })
        }
    }

    // ── Connector parsing ────────────────────────────────────

    fn parse_connector_from_xml(&self, xml: &str) -> Option<VisioConnector> {
        let id = self
            .extract_attr_from_xml(xml, "Shape", "ID")
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let name = self
            .extract_attr_from_xml(xml, "Shape", "NameU")
            .or_else(|| self.extract_attr_from_xml(xml, "Shape", "Name"));
        let text = self.extract_shape_text(xml);

        // Connectors link shapes via BeginShape/EndShape cells
        let from_shape_id = self.parse_cell_string(xml, "BeginShape");
        let to_shape_id = self.parse_cell_string(xml, "EndShape");
        let from_connection = self.parse_cell_string(xml, "BeginX");
        let to_connection = self.parse_cell_string(xml, "EndX");
        let routing_style = self.parse_cell_u32(xml, "RoutingStyle");
        let geometry = None; // Connector geometry from LineTo/MoveTo rows

        Some(VisioConnector {
            id,
            name,
            from_shape_id,
            to_shape_id,
            from_connection,
            to_connection,
            arrow_type: None,
            routing_style,
            geometry,
            text,
        })
    }

    // ── Cell value extraction (generic helpers) ──────────────

    /// Extract attribute value from the opening tag in raw XML.
    fn extract_attr_from_xml(&self, xml: &str, tag: &str, attr: &str) -> Option<String> {
        let pattern = format!("<{} ", tag);
        if let Some(start) = xml.find(&pattern) {
            let rest = &xml[start + pattern.len() - 1..];
            let search = format!(" {}=\"", attr);
            if let Some(astart) = rest.find(&search) {
                let val_start = astart + search.len();
                if let Some(close) = rest[val_start..].find('"') {
                    return Some(rest[val_start..val_start + close].to_string());
                }
            }
        }
        None
    }

    /// Find a <Cell N="..." V="..."/> directly in the XML.
    fn parse_raw_cell(&self, xml: &str, cell_name: &str) -> Option<String> {
        let mut reader = Reader::from_str(xml);
        let mut buf = Vec::new();
        let mut in_section = false;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    match tag.as_str() {
                        "Section" => {
                            in_section = true;
                        }
                        "Cell" if !in_section => {
                            let n = Self::attr(e, "N")?;
                            if n == cell_name
                                && let Some(v) = Self::attr(e, "V")
                            {
                                return Some(v);
                            }
                            // Check for <Cell N="...">text</Cell>
                        }
                        _ => {}
                    }
                }
                Ok(Event::Text(ref _t)) => {}
                Ok(Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "Section" {
                        in_section = false;
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        None
    }

    /// Parse cell value from a <Cell N="PinX" V="2.0" /> (not inside a Section/Row).
    fn parse_cell_f64(&self, xml: &str, name: &str) -> Option<f64> {
        let val = self.parse_raw_cell(xml, name)?;
        // Strip formula prefix (=) and parse
        let clean = val.trim_start_matches('=');
        clean.parse::<f64>().ok()
    }

    fn parse_cell_u32(&self, xml: &str, name: &str) -> Option<u32> {
        let val = self.parse_raw_cell(xml, name)?;
        let clean = val.trim_start_matches('=');
        clean.parse::<u32>().ok()
    }

    fn parse_cell_string(&self, xml: &str, name: &str) -> Option<String> {
        let val = self.parse_raw_cell(xml, name)?;
        let clean = val.trim_start_matches('=').to_string();
        if clean.is_empty() { None } else { Some(clean) }
    }

    fn parse_cell_bool(&self, xml: &str, name: &str) -> Option<bool> {
        let val = self.parse_raw_cell(xml, name)?;
        let clean = val.trim_start_matches('=');
        match clean {
            "1" | "true" | "True" | "TRUE" => Some(true),
            "0" | "false" | "False" | "FALSE" => Some(false),
            _ => None,
        }
    }

    /// Parse a cell value from within a specific Section/Row (for formatting sections).
    fn parse_cell_f64_from_section(
        &self,
        xml: &str,
        section_name: &str,
        cell_name: &str,
    ) -> Option<f64> {
        let val = self.parse_cell_from_section(xml, section_name, cell_name)?;
        let clean = val.trim_start_matches('=');
        clean.parse::<f64>().ok()
    }

    fn parse_cell_u32_from_section(
        &self,
        xml: &str,
        section_name: &str,
        cell_name: &str,
    ) -> Option<u32> {
        let val = self.parse_cell_from_section(xml, section_name, cell_name)?;
        let clean = val.trim_start_matches('=');
        clean.parse::<u32>().ok()
    }

    fn parse_cell_bool_from_section(
        &self,
        xml: &str,
        section_name: &str,
        cell_name: &str,
    ) -> Option<bool> {
        let val = self.parse_cell_from_section(xml, section_name, cell_name)?;
        let clean = val.trim_start_matches('=');
        match clean {
            "1" | "true" => Some(true),
            "0" | "false" => Some(false),
            _ => None,
        }
    }

    fn parse_cell_string_from_section(
        &self,
        xml: &str,
        section_name: &str,
        cell_name: &str,
    ) -> Option<String> {
        let val = self.parse_cell_from_section(xml, section_name, cell_name)?;
        let clean = val.trim_start_matches('=').to_string();
        if clean.is_empty() { None } else { Some(clean) }
    }

    /// Parse a cell from a specific section (Character/Paragraph/Fill/etc.)
    fn parse_cell_from_section(
        &self,
        xml: &str,
        section_name: &str,
        cell_name: &str,
    ) -> Option<String> {
        let mut reader = Reader::from_str(xml);
        let mut buf = Vec::new();
        let mut in_section = false;
        let mut section_depth = 0u32;
        let mut in_row = false;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    match tag.as_str() {
                        "Section" => {
                            let n = Self::attr(e, "N").unwrap_or_default();
                            if n == section_name {
                                in_section = true;
                            }
                            if in_section {
                                section_depth += 1;
                            }
                        }
                        "Row" if in_section => {
                            in_row = true;
                        }
                        "Cell" if in_row => {
                            let n = Self::attr(e, "N").unwrap_or_default();
                            if n == cell_name
                                && let Some(v) = Self::attr(e, "V")
                            {
                                return Some(v);
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    match tag.as_str() {
                        "Row" => in_row = false,
                        "Section" if in_section => {
                            section_depth = section_depth.saturating_sub(1);
                            if section_depth == 0 {
                                in_section = false;
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        None
    }

    /// Parse fill color from the Fill section.
    fn parse_fill_color(&self, xml: &str) -> Option<String> {
        // Try raw cell first (inside Shape, not inside Section)
        if let Some(raw) = self.parse_cell_string(xml, "FillForegnd") {
            return Some(self.normalize_color(&raw));
        }
        // Fallback: inside <Section N="Fill"><Row><Cell N="FillForegnd"...
        self.parse_cell_string_from_section(xml, "Fill", "FillForegnd")
            .map(|v| self.normalize_color(&v))
    }

    fn normalize_color(&self, raw: &str) -> String {
        let raw = raw.trim();
        // Handle rgb(r,g,b) format
        if raw.starts_with("rgb(") && raw.ends_with(')') {
            let inner = &raw[4..raw.len() - 1];
            let parts: Vec<f64> = inner
                .split(',')
                .filter_map(|s| s.trim().parse::<f64>().ok())
                .collect();
            if parts.len() == 3 {
                let r = parts[0].round() as u8;
                let g = parts[1].round() as u8;
                let b = parts[2].round() as u8;
                return format!("#{:02X}{:02X}{:02X}", r, g, b);
            }
        }
        // Theme color reference like "theme(0)" or "#RRGGBB"
        if raw.starts_with("theme(") || raw.starts_with(';') {
            return "#000000".to_string();
        }
        if !raw.starts_with('#') && raw.len() == 6 && raw.chars().all(|c| c.is_ascii_hexdigit()) {
            return format!("#{}", raw.to_uppercase());
        }
        if raw.starts_with('#') {
            return raw.to_uppercase();
        }
        raw.to_string()
    }

    // ── Masters ──────────────────────────────────────────────

    fn parse_all_masters(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<Vec<VisioMaster>, VisioError> {
        let masters_xml = match self.try_read_zip_entry(archive, "visio/masters/masters.xml") {
            Some(x) => x,
            None => return Ok(Vec::new()),
        };

        let master_refs = self.parse_master_references(&masters_xml);
        let mut masters = Vec::new();

        for (id, name, unique_id) in &master_refs {
            let master_file = format!("visio/masters/master{}.xml", id);
            if let Some(xml) = self.try_read_zip_entry(archive, &master_file) {
                let (shapes, connectors) = self.parse_shapes_and_connectors(&xml);
                masters.push(VisioMaster {
                    id: id.clone(),
                    name: name.clone(),
                    unique_id: unique_id.clone(),
                    shapes,
                    connectors,
                    icon: None,
                });
            } else {
                masters.push(VisioMaster {
                    id: id.clone(),
                    name: name.clone(),
                    unique_id: unique_id.clone(),
                    shapes: vec![],
                    connectors: vec![],
                    icon: None,
                });
            }
        }

        Ok(masters)
    }

    fn parse_master_references(&self, xml: &str) -> Vec<(String, String, Option<String>)> {
        let mut refs = Vec::new();
        let mut reader = Reader::from_str(xml);
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "Master" {
                        let id = Self::attr(e, "ID").unwrap_or_default();
                        let name = Self::attr(e, "Name").unwrap_or_default();
                        let unique_id = Self::attr(e, "UniqueID");
                        refs.push((id, name, unique_id));
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        refs
    }

    // ── Theme Colors ─────────────────────────────────────────

    fn parse_theme_colors(&self, archive: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Vec<ThemeColor> {
        let xml = match self.try_read_zip_entry(archive, "visio/colors.xml") {
            Some(x) => x,
            None => return Vec::new(),
        };

        let mut colors = Vec::new();
        let mut reader = Reader::from_str(&xml);
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if tag == "Color" || tag == "Clr" {
                        let index: u32 = Self::attr(e, "IX")
                            .or_else(|| Self::attr(e, "Index"))
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0);
                        let rgb = Self::attr(e, "RGB")
                            .or_else(|| Self::attr(e, "Color"))
                            .unwrap_or_default();
                        let name = Self::attr(e, "Name");
                        colors.push(ThemeColor {
                            index,
                            rgb: format!("#{}", rgb.trim_start_matches('#')),
                            name,
                        });
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        colors
    }

    // ── XML attribute helper ─────────────────────────────────

    fn attr(e: &quick_xml::events::BytesStart, name: &str) -> Option<String> {
        e.attributes()
            .filter_map(|a| a.ok())
            .find(|a| {
                let key = String::from_utf8_lossy(a.key.as_ref());
                key == name
            })
            .map(|a| String::from_utf8_lossy(&a.value).to_string())
    }
}
