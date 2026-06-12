//! ODF serializer — writes an `OdfDocument` to a valid ODT ZIP file.

use std::fmt::Write;

use zip::CompressionMethod;

use wo_office_utils::ArchiveWriter;

use crate::model::*;

/// Serializes an [`OdfDocument`] into ODT bytes (ZIP archive).
pub struct OdfSerializer;

impl OdfSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize the document to ODT bytes.
    pub fn serialize(&self, doc: &OdfDocument) -> Result<Vec<u8>, anyhow::Error> {
        let mut writer = ArchiveWriter::new()?;

        // 1. mimetype — MUST be first entry, MUST be uncompressed (ODF spec)
        let mimetype = doc_mimetype(&doc.doc_type);
        writer.add_file_with_compression(
            "mimetype",
            mimetype.as_bytes(),
            CompressionMethod::Stored,
        )?;

        // 2. META-INF/manifest.xml
        let manifest_xml = build_manifest(doc);
        writer.add_file("META-INF/manifest.xml", manifest_xml.as_bytes())?;

        // 3. content.xml
        let content_xml = build_content_xml(doc);
        writer.add_file("content.xml", content_xml.as_bytes())?;

        // 4. Image files (ODP) — write embedded images to Pictures/
        if let OdfContent::Presentation { slides } = &doc.content {
            for slide in slides {
                for shape in &slide.shapes {
                    if let Some(img) = &shape.image_ref {
                        let image_path = if img.href.starts_with("Pictures/") {
                            img.href.clone()
                        } else if img.href.starts_with('/') {
                            format!("Pictures/{}", &img.href[1..])
                        } else {
                            format!("Pictures/{}", img.href)
                        };
                        if let Some(data) = &img.data {
                            writer.add_file(&image_path, data)?;
                        }
                    }
                }
            }
        }

        // 5. styles.xml (empty but valid)
        let styles_xml = build_styles_xml(doc);
        writer.add_file("styles.xml", styles_xml.as_bytes())?;

        // 5. meta.xml
        let meta_xml = build_meta_xml(doc);
        writer.add_file("meta.xml", meta_xml.as_bytes())?;

        let bytes = writer.finish()?;
        Ok(bytes)
    }
}

impl Default for OdfSerializer {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn doc_mimetype(doc_type: &OdfType) -> &'static str {
    match doc_type {
        OdfType::Text => "application/vnd.oasis.opendocument.text",
        OdfType::Spreadsheet => "application/vnd.oasis.opendocument.spreadsheet",
        OdfType::Presentation => "application/vnd.oasis.opendocument.presentation",
        OdfType::Drawing => "application/vnd.oasis.opendocument.graphics",
        OdfType::Chart => "application/vnd.oasis.opendocument.chart",
        OdfType::Formula => "application/vnd.oasis.opendocument.formula",
        OdfType::Unknown => "application/vnd.oasis.opendocument.text",
    }
}

fn escape_xml(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// manifest.xml
// ---------------------------------------------------------------------------

fn build_manifest(doc: &OdfDocument) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\" manifest:version=\"1.2\">\n",
    );

    let mt = doc_mimetype(&doc.doc_type);
    writeln!(xml, " <manifest:file-entry manifest:full-path=\"/\" manifest:version=\"1.2\" manifest:media-type=\"{}\"/>", mt).unwrap();

    for entry in &doc.manifest {
        let path = entry.full_path.as_deref().unwrap_or(&entry.path);
        let media = entry
            .media_type
            .as_deref()
            .unwrap_or("application/octet-stream");
        let version_attr = match &entry.version {
            Some(v) => format!(" manifest:version=\"{}\"", v),
            None => String::new(),
        };
        writeln!(
            xml,
            " <manifest:file-entry manifest:full-path=\"{}\"{} manifest:media-type=\"{}\"/>",
            path, version_attr, media
        )
        .unwrap();
    }

    // Ensure the standard files are listed
    let existing_paths: Vec<&str> = doc
        .manifest
        .iter()
        .map(|e| e.full_path.as_deref().unwrap_or(&e.path))
        .collect();
    for (path, media) in [
        ("content.xml", "text/xml"),
        ("styles.xml", "text/xml"),
        ("meta.xml", "text/xml"),
    ] {
        if !existing_paths.contains(&path) {
            writeln!(
                xml,
                " <manifest:file-entry manifest:full-path=\"{}\" manifest:media-type=\"{}\"/>",
                path, media
            )
            .unwrap();
        }
    }

    // Add ODP image file entries
    if let OdfContent::Presentation { slides } = &doc.content {
        let mut seen_paths: Vec<&str> = existing_paths.clone();
        for slide in slides {
            for shape in &slide.shapes {
                if let Some(img) = &shape.image_ref {
                    let img_path = if img.href.starts_with("Pictures/") {
                        img.href.as_str()
                    } else if img.href.starts_with('/') {
                        continue;
                    } else {
                        continue;
                    };
                    if !seen_paths.contains(&img_path) {
                        let media_type = img
                            .content_type
                            .as_deref()
                            .unwrap_or("application/octet-stream");
                        writeln!(
                            xml,
                            " <manifest:file-entry manifest:full-path=\"{}\" manifest:media-type=\"{}\"/>",
                            img_path, media_type
                        )
                        .unwrap();
                        seen_paths.push(img_path);
                    }
                }
            }
        }
    }

    xml.push_str("</manifest:manifest>");
    xml
}

// ---------------------------------------------------------------------------
// content.xml
// ---------------------------------------------------------------------------

fn build_content_xml(doc: &OdfDocument) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");

    let office_element = match doc.doc_type {
        OdfType::Text => "text",
        OdfType::Spreadsheet => "spreadsheet",
        OdfType::Presentation => "presentation",
        _ => "text",
    };

    writeln!(
        xml,
        "<office:document-content \
         xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" \
         xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" \
         xmlns:table=\"urn:oasis:names:tc:opendocument:xmlns:table:1.0\" \
         xmlns:style=\"urn:oasis:names:tc:opendocument:xmlns:style:1.0\" \
         xmlns:fo=\"urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0\" \
         xmlns:svg=\"urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0\" \
         xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\" \
         xmlns:presentation=\"urn:oasis:names:tc:opendocument:xmlns:presentation:1.0\" \
         xmlns:xlink=\"http://www.w3.org/1999/xlink\" \
         office:version=\"{}\">",
        doc.version
    )
    .unwrap();

    // Automatic styles for bold/italic/underline spans
    xml.push_str(" <office:automatic-styles>\n");
    let mut style_idx = 1u32;
    if let OdfContent::Text { content, .. } = &doc.content {
        collect_auto_styles(content, &mut xml, &mut style_idx);
    }
    xml.push_str(" </office:automatic-styles>\n");

    xml.push_str(" <office:body>\n");
    writeln!(xml, "  <office:{}>", office_element).unwrap();

    match &doc.content {
        OdfContent::Text { content, .. } => {
            for item in content {
                serialize_text_content(item, &mut xml, 3);
            }
        }
        OdfContent::Presentation { slides } => {
            for slide in slides {
                serialize_odp_slide(slide, &mut xml, 3);
            }
        }
        _ => {}
    }

    writeln!(xml, "  </office:{}>", office_element).unwrap();
    xml.push_str(" </office:body>\n");
    xml.push_str("</office:document-content>");
    xml
}

/// Collect auto-styles from spans (bold, italic, underline) and emit style elements.
/// Returns the number of styles generated.
fn collect_auto_styles(content: &[OdfTextContent], xml: &mut String, idx: &mut u32) {
    for item in content {
        match item {
            OdfTextContent::Paragraph(p) => {
                for span in &p.spans {
                    if span.bold || span.italic || span.underline {
                        emit_span_style(xml, idx, span.bold, span.italic, span.underline);
                    }
                }
            }
            OdfTextContent::List(list) => {
                for li in &list.items {
                    collect_auto_styles(&li.content, xml, idx);
                }
            }
            OdfTextContent::Table(table) => {
                for row in &table.rows {
                    for cell in &row.cells {
                        if !cell.text.is_empty() {
                            // No spans in cells currently, just text
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

fn emit_span_style(xml: &mut String, idx: &mut u32, bold: bool, italic: bool, underline: bool) {
    writeln!(
        xml,
        "  <style:style style:name=\"T{}\" style:family=\"text\">",
        idx
    )
    .unwrap();
    writeln!(
        xml,
        "   <style:text-properties{}{}{}/>",
        if bold { " fo:font-weight=\"bold\"" } else { "" },
        if italic {
            " fo:font-style=\"italic\""
        } else {
            ""
        },
        if underline {
            " style:text-underline-style=\"solid\" style:text-underline-type=\"single\""
        } else {
            ""
        },
    )
    .unwrap();
    writeln!(xml, "  </style:style>").unwrap();
    *idx += 1;
}

fn serialize_text_content(item: &OdfTextContent, xml: &mut String, indent: usize) {
    let pad = " ".repeat(indent);
    match item {
        OdfTextContent::Paragraph(p) => {
            write!(xml, "{}<text:p", pad).unwrap();
            if let Some(style) = &p.style_name {
                write!(xml, " text:style-name=\"{}\"", escape_xml(style)).unwrap();
            }
            writeln!(xml, ">").unwrap();

            if p.spans.is_empty() {
                write!(xml, "{}{}", pad, escape_xml(&p.text)).unwrap();
            } else {
                let mut idx = 1u32;
                for span in &p.spans {
                    if span.bold || span.italic || span.underline {
                        let style_name = format!("T{}", idx);
                        idx += 1;
                        write!(
                            xml,
                            "<text:span text:style-name=\"{}\">{}</text:span>",
                            style_name,
                            escape_xml(&span.text)
                        )
                        .unwrap();
                    } else {
                        write!(xml, "{}", escape_xml(&span.text)).unwrap();
                    }
                }
            }
            writeln!(xml, "</text:p>").unwrap();
        }
        OdfTextContent::Heading(h) => {
            write!(xml, "{}<text:h text:outline-level=\"{}\"", pad, h.level).unwrap();
            if let Some(style) = &h.style_name {
                write!(xml, " text:style-name=\"{}\"", escape_xml(style)).unwrap();
            }
            writeln!(xml, ">{}</text:h>", escape_xml(&h.text)).unwrap();
        }
        OdfTextContent::List(list) => {
            write!(xml, "{}<text:list", pad).unwrap();
            if let Some(style) = &list.list_style_name {
                write!(xml, " text:style-name=\"{}\"", escape_xml(style)).unwrap();
            }
            if list.continue_numbering {
                write!(xml, " text:continue-numbering=\"true\"").unwrap();
            }
            if let Some(start) = list.start_value {
                write!(xml, " text:start-value=\"{}\"", start).unwrap();
            }
            match list.list_type {
                OdfListType::Ordered => write!(xml, ">").unwrap(),
                OdfListType::Unordered => write!(xml, ">").unwrap(),
            }
            writeln!(xml).unwrap();

            for li in &list.items {
                let item_pad = " ".repeat(indent + 1);
                writeln!(xml, "{}<text:list-item>", item_pad).unwrap();
                for sub in &li.content {
                    serialize_text_content(sub, xml, indent + 2);
                }
                writeln!(xml, "{}</text:list-item>", item_pad).unwrap();
            }

            writeln!(xml, "{}</text:list>", pad).unwrap();
        }
        OdfTextContent::Table(table) => {
            write!(xml, "{}<table:table", pad).unwrap();
            if let Some(name) = &table.name {
                write!(xml, " table:name=\"{}\"", escape_xml(name)).unwrap();
            }
            writeln!(xml, ">").unwrap();

            for row in &table.rows {
                let row_pad = " ".repeat(indent + 1);
                writeln!(xml, "{}<table:table-row>", row_pad).unwrap();
                for cell in &row.cells {
                    let cell_pad = " ".repeat(indent + 2);
                    write!(xml, "{}<table:table-cell", cell_pad).unwrap();
                    if cell.row_span > 1 {
                        write!(xml, " table:number-rows-spanned=\"{}\"", cell.row_span).unwrap();
                    }
                    if cell.col_span > 1 {
                        write!(xml, " table:number-columns-spanned=\"{}\"", cell.col_span).unwrap();
                    }
                    match cell.cell_type {
                        CellType::String => write!(xml, " office:value-type=\"string\"").unwrap(),
                        CellType::Number => {
                            write!(xml, " office:value-type=\"float\"").unwrap();
                            if let Some(v) = cell.value {
                                write!(xml, " office:value=\"{}\"", v).unwrap();
                            }
                        }
                        CellType::Boolean => {
                            write!(xml, " office:value-type=\"boolean\"").unwrap();
                            if let Some(v) = cell.value {
                                write!(
                                    xml,
                                    " office:boolean-value=\"{}\"",
                                    if v > 0.5 { "true" } else { "false" }
                                )
                                .unwrap();
                            }
                        }
                        CellType::Percentage => {
                            write!(xml, " office:value-type=\"percentage\"").unwrap();
                            if let Some(v) = cell.value {
                                write!(xml, " office:value=\"{}\"", v).unwrap();
                            }
                        }
                        CellType::Currency => {
                            write!(xml, " office:value-type=\"currency\"").unwrap();
                            if let Some(v) = cell.value {
                                write!(xml, " office:value=\"{}\"", v).unwrap();
                            }
                        }
                        CellType::Date => write!(xml, " office:value-type=\"date\"").unwrap(),
                    }
                    writeln!(
                        xml,
                        "><text:p>{}</text:p></table:table-cell>",
                        escape_xml(&cell.text)
                    )
                    .unwrap();
                }
                writeln!(xml, "{}</table:table-row>", row_pad).unwrap();
            }

            writeln!(xml, "{}</table:table>", pad).unwrap();
        }
        OdfTextContent::Image(_img) => {
            // Skip images in serialization (placeholder)
            writeln!(xml, "{}<text:p>[image]</text:p>", pad).unwrap();
        }
    }
}

// ---------------------------------------------------------------------------
// ODP slide and shape serialization
// ---------------------------------------------------------------------------

fn serialize_odp_slide(slide: &PresentationSlide, xml: &mut String, indent: usize) {
    let pad = " ".repeat(indent);
    write!(xml, "{}<draw:page", pad).unwrap();
    if let Some(name) = &slide.name {
        write!(xml, " draw:name=\"{}\"", escape_xml(name)).unwrap();
    }
    if let Some(layout) = &slide.slide_layout {
        write!(
            xml,
            " draw:presentation-page-layout-name=\"{}\"",
            escape_xml(layout)
        )
        .unwrap();
    }
    writeln!(xml, ">").unwrap();

    // Shapes
    for shape in &slide.shapes {
        serialize_odp_shape(shape, xml, indent + 1);
    }

    // Transition
    if let Some(transition) = &slide.transition {
        serialize_odp_transition(transition, xml, indent + 1);
    }

    // Notes
    if let Some(notes) = &slide.notes {
        if !notes.is_empty() {
            serialize_odp_notes(notes, xml, indent + 1);
        }
    }

    writeln!(xml, "{}</draw:page>", pad).unwrap();
}

fn serialize_odp_shape(shape: &OdpShape, xml: &mut String, indent: usize) {
    let pad = " ".repeat(indent);
    let tag = match shape.shape_type {
        OdpShapeType::Rect => "draw:rect",
        OdpShapeType::Ellipse => "draw:ellipse",
        OdpShapeType::Line | OdpShapeType::Connector => "draw:line",
        OdpShapeType::TextBox => "draw:text-box",
        OdpShapeType::Image => "draw:frame",
        OdpShapeType::CustomShape => "draw:custom-shape",
    };

    write!(xml, "{}<{}", pad, tag).unwrap();
    if let Some(id) = &shape.id {
        write!(xml, " draw:id=\"{}\"", escape_xml(id)).unwrap();
    }
    write!(xml, " svg:x=\"{}\"", escape_xml(&shape.x)).unwrap();
    write!(xml, " svg:y=\"{}\"", escape_xml(&shape.y)).unwrap();
    write!(xml, " svg:width=\"{}\"", escape_xml(&shape.width)).unwrap();
    write!(xml, " svg:height=\"{}\"", escape_xml(&shape.height)).unwrap();
    if let Some(z) = shape.z_index {
        write!(xml, " draw:z-index=\"{}\"", z).unwrap();
    }
    if let Some(style) = &shape.style_name {
        write!(xml, " draw:style-name=\"{}\"", escape_xml(style)).unwrap();
    }

    // For Image shapes, we emit draw:frame with draw:image inside
    if shape.shape_type == OdpShapeType::Image {
        writeln!(xml, ">").unwrap();
        if let Some(img) = &shape.image_ref {
            let img_pad = " ".repeat(indent + 1);
            write!(xml, "{}<draw:image", img_pad).unwrap();
            if let Some(name) = &img.name {
                write!(xml, " draw:name=\"{}\"", escape_xml(name)).unwrap();
            }
            write!(xml, " xlink:href=\"{}\"", escape_xml(&img.href)).unwrap();
            if let Some(_ct) = &img.content_type {
                write!(xml, " xlink:type=\"simple\" xlink:show=\"embed\" xlink:actuate=\"onLoad\"").unwrap();
            }
            writeln!(xml, "/>").unwrap();
        }
        write!(xml, "{}</{}>", pad, tag).unwrap();
    } else if let Some(text) = &shape.text_content {
        // For shapes with text content
        writeln!(xml, ">").unwrap();
        // In ODP, text in shapes goes as text:p inside
        let text_pad = " ".repeat(indent + 1);
        writeln!(
            xml,
            "{}<text:p>{}</text:p>",
            text_pad,
            escape_xml(text)
        )
        .unwrap();
        write!(xml, "{}</{}>", pad, tag).unwrap();
    } else {
        writeln!(xml, "/>").unwrap();
        return;
    }
    writeln!(xml).unwrap();
}

fn serialize_odp_transition(transition: &OdpTransition, xml: &mut String, indent: usize) {
    let pad = " ".repeat(indent);
    write!(xml, "{}<presentation:transition", pad).unwrap();
    if let Some(t) = &transition.type_name {
        write!(xml, " presentation:type-name=\"{}\"", escape_xml(t)).unwrap();
    }
    if let Some(d) = &transition.duration {
        write!(xml, " presentation:duration=\"{}\"", escape_xml(d)).unwrap();
    }
    if let Some(dir) = &transition.direction {
        write!(xml, " presentation:direction=\"{}\"", escape_xml(dir)).unwrap();
    }
    if let Some(speed) = &transition.speed {
        write!(xml, " presentation:speed=\"{}\"", escape_xml(speed)).unwrap();
    }
    writeln!(xml, "/>").unwrap();
}

fn serialize_odp_notes(notes: &str, xml: &mut String, indent: usize) {
    let pad = " ".repeat(indent);
    writeln!(xml, "{}<presentation:notes>", pad).unwrap();
    let text_pad = " ".repeat(indent + 1);
    writeln!(
        xml,
        "{}<text:p>{}</text:p>",
        text_pad,
        escape_xml(notes)
    )
    .unwrap();
    writeln!(xml, "{}</presentation:notes>", pad).unwrap();
}

// ---------------------------------------------------------------------------
// meta.xml
// ---------------------------------------------------------------------------

fn build_meta_xml(doc: &OdfDocument) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <office:document-meta \
         xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" \
         xmlns:meta=\"urn:oasis:names:tc:opendocument:xmlns:meta:1.0\" \
         xmlns:dc=\"http://purl.org/dc/elements/1.1/\" \
         office:version=\"1.2\">\n\
         <office:meta>\n",
    );

    if let Some(v) = &doc.metadata.title {
        writeln!(xml, "  <dc:title>{}</dc:title>", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.creator {
        writeln!(xml, "  <dc:creator>{}</dc:creator>", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.date {
        writeln!(xml, "  <dc:date>{}</dc:date>", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.language {
        writeln!(xml, "  <dc:language>{}</dc:language>", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.description {
        writeln!(xml, "  <dc:description>{}</dc:description>", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.subject {
        writeln!(xml, "  <dc:subject>{}</dc:subject>", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.keywords {
        writeln!(xml, "  <meta:keyword>{}</meta:keyword>", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.modified {
        writeln!(xml, "  <meta:date>{}", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.generator {
        writeln!(xml, "  <meta:generator>{}</meta:generator>", escape_xml(v)).unwrap();
    }
    if let Some(v) = &doc.metadata.category {
        writeln!(xml, "  <meta:category>{}</meta:category>", escape_xml(v)).unwrap();
    }

    xml.push_str(" </office:meta>\n");
    xml.push_str("</office:document-meta>");
    xml
}

// ---------------------------------------------------------------------------
// styles.xml (minimal valid)
// ---------------------------------------------------------------------------

fn build_styles_xml(doc: &OdfDocument) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <office:document-styles \
         xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" \
         xmlns:style=\"urn:oasis:names:tc:opendocument:xmlns:style:1.0\" \
         xmlns:fo=\"urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0\" \
         office:version=\"1.2\">\n\
         <office:styles>\n",
    );

    // Emit named styles from doc.styles
    for style in &doc.styles {
        write!(
            xml,
            "  <style:style style:name=\"{}\"",
            escape_xml(&style.name)
        )
        .unwrap();
        if let Some(family) = &style.family {
            write!(xml, " style:family=\"{}\"", escape_xml(family)).unwrap();
        }
        if let Some(parent) = &style.parent {
            write!(xml, " style:parent-style-name=\"{}\"", escape_xml(parent)).unwrap();
        }
        if let Some(display) = &style.display_name {
            write!(xml, " style:display-name=\"{}\"", escape_xml(display)).unwrap();
        }
        writeln!(xml, ">").unwrap();
        if !style.properties.is_empty() {
            write!(xml, "   <style:text-properties").unwrap();
            for (key, val) in &style.properties {
                write!(xml, " {}=\"{}\"", escape_xml(key), escape_xml(val)).unwrap();
            }
            writeln!(xml, "/>").unwrap();
        }
        writeln!(xml, "  </style:style>").unwrap();
    }

    xml.push_str(" </office:styles>\n");
    xml.push_str("</office:document-styles>");
    xml
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read as _;
    use zip::ZipArchive;

    fn make_doc(content: Vec<OdfTextContent>) -> OdfDocument {
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

    fn zip_is_stored(data: &[u8], name: &str) -> bool {
        let cursor = std::io::Cursor::new(data);
        let mut archive = ZipArchive::new(cursor).unwrap();
        let file = archive.by_name(name).unwrap();
        file.compression() == CompressionMethod::Stored
    }

    // --- 1. Minimal document ---
    #[test]
    fn test_serialize_minimal_document() {
        let doc = make_doc(vec![OdfTextContent::Paragraph(TextParagraph {
            text: "Hello World".into(),
            style_name: None,
            spans: vec![],
        })]);

        let serializer = OdfSerializer::new();
        let bytes = serializer.serialize(&doc).unwrap();

        // Valid ZIP
        let names = zip_entry_names(&bytes);
        assert!(names.contains(&"mimetype".to_string()));
        assert!(names.contains(&"content.xml".to_string()));
        assert!(names.contains(&"META-INF/manifest.xml".to_string()));

        // Content present
        let content = zip_read(&bytes, "content.xml");
        assert!(content.contains("Hello World"));
    }

    // --- 2. Heading ---
    #[test]
    fn test_serialize_with_heading() {
        let doc = make_doc(vec![
            OdfTextContent::Heading(TextHeading {
                text: "Title".into(),
                level: 1,
                style_name: None,
            }),
            OdfTextContent::Paragraph(TextParagraph {
                text: "Body text".into(),
                style_name: None,
                spans: vec![],
            }),
        ]);

        let bytes = OdfSerializer::new().serialize(&doc).unwrap();
        let content = zip_read(&bytes, "content.xml");
        assert!(content.contains("text:outline-level=\"1\""));
        assert!(content.contains("Title"));
        assert!(content.contains("Body text"));
    }

    // --- 3. Lists ---
    #[test]
    fn test_serialize_with_list() {
        let doc = make_doc(vec![OdfTextContent::List(OdfList {
            list_style_name: Some("L1".into()),
            items: vec![
                OdfListItem {
                    content: vec![OdfTextContent::Paragraph(TextParagraph {
                        text: "Item 1".into(),
                        style_name: None,
                        spans: vec![],
                    })],
                    nesting_level: 0,
                },
                OdfListItem {
                    content: vec![OdfTextContent::Paragraph(TextParagraph {
                        text: "Item 2".into(),
                        style_name: None,
                        spans: vec![],
                    })],
                    nesting_level: 0,
                },
            ],
            list_type: OdfListType::Unordered,
            continue_numbering: false,
            start_value: None,
        })]);

        let bytes = OdfSerializer::new().serialize(&doc).unwrap();
        let content = zip_read(&bytes, "content.xml");
        assert!(content.contains("<text:list"));
        assert!(content.contains("<text:list-item>"));
        assert!(content.contains("Item 1"));
        assert!(content.contains("Item 2"));
    }

    // --- 4. Table ---
    #[test]
    fn test_serialize_with_table() {
        let doc = make_doc(vec![OdfTextContent::Table(OdfTable {
            name: Some("Table1".into()),
            rows: vec![
                TableRow {
                    cells: vec![
                        TableCell {
                            text: "A1".into(),
                            row_span: 1,
                            col_span: 1,
                            cell_type: CellType::String,
                            value: None,
                        },
                        TableCell {
                            text: "B1".into(),
                            row_span: 1,
                            col_span: 1,
                            cell_type: CellType::String,
                            value: None,
                        },
                    ],
                },
                TableRow {
                    cells: vec![TableCell {
                        text: "A2".into(),
                        row_span: 1,
                        col_span: 2,
                        cell_type: CellType::String,
                        value: None,
                    }],
                },
            ],
            num_columns: 2,
        })]);

        let bytes = OdfSerializer::new().serialize(&doc).unwrap();
        let content = zip_read(&bytes, "content.xml");
        assert!(content.contains("<table:table table:name=\"Table1\">"));
        assert!(content.contains("<table:table-row>"));
        assert!(content.contains("<table:table-cell"));
        assert!(content.contains("A1"));
        assert!(content.contains("B1"));
        assert!(content.contains("table:number-columns-spanned=\"2\""));
    }

    // --- 5. Empty document ---
    #[test]
    fn test_serialize_empty_document() {
        let doc = make_doc(vec![]);
        let bytes = OdfSerializer::new().serialize(&doc).unwrap();

        let names = zip_entry_names(&bytes);
        assert!(names.contains(&"mimetype".to_string()));
        assert!(names.contains(&"content.xml".to_string()));

        let content = zip_read(&bytes, "content.xml");
        assert!(content.contains("<office:text>"));
        assert!(content.contains("</office:text>"));
    }

    // --- 6. mimetype first and uncompressed ---
    #[test]
    fn test_mimetype_first_uncompressed() {
        let doc = make_doc(vec![OdfTextContent::Paragraph(TextParagraph {
            text: "test".into(),
            style_name: None,
            spans: vec![],
        })]);

        let bytes = OdfSerializer::new().serialize(&doc).unwrap();
        let names = zip_entry_names(&bytes);
        assert_eq!(names[0], "mimetype");
        assert!(zip_is_stored(&bytes, "mimetype"));

        let mt = zip_read(&bytes, "mimetype");
        assert_eq!(mt, "application/vnd.oasis.opendocument.text");
    }

    // --- 7. Manifest present ---
    #[test]
    fn test_manifest_present() {
        let doc = make_doc(vec![]);
        let bytes = OdfSerializer::new().serialize(&doc).unwrap();

        let manifest = zip_read(&bytes, "META-INF/manifest.xml");
        assert!(manifest.contains("manifest:manifest"));
        assert!(manifest.contains("content.xml"));
        assert!(manifest.contains("styles.xml"));
        assert!(manifest.contains("meta.xml"));
        assert!(manifest.contains("application/vnd.oasis.opendocument.text"));
    }

    // --- 8. meta.xml ---
    #[test]
    fn test_meta_xml() {
        let mut doc = make_doc(vec![]);
        doc.metadata.title = Some("My Doc".into());
        doc.metadata.creator = Some("Alice".into());
        doc.metadata.language = Some("en".into());

        let bytes = OdfSerializer::new().serialize(&doc).unwrap();
        let meta = zip_read(&bytes, "meta.xml");
        assert!(meta.contains("<dc:title>My Doc</dc:title>"));
        assert!(meta.contains("<dc:creator>Alice</dc:creator>"));
        assert!(meta.contains("<dc:language>en</dc:language>"));
        assert!(meta.contains("office:document-meta"));
    }

    // --- 9. Roundtrip serialize → parse ---
    #[test]
    fn test_roundtrip_serialize_parse() {
        let doc = make_doc(vec![
            OdfTextContent::Heading(TextHeading {
                text: "Chapter 1".into(),
                level: 1,
                style_name: None,
            }),
            OdfTextContent::Paragraph(TextParagraph {
                text: "Hello roundtrip".into(),
                style_name: None,
                spans: vec![],
            }),
        ]);

        let bytes = OdfSerializer::new().serialize(&doc).unwrap();

        // Parse back with OdfParser
        let parser = crate::parser::OdfParser::new();
        let parsed = parser.parse(&bytes).unwrap();

        assert_eq!(parsed.doc_type, OdfType::Text);
        if let OdfContent::Text { content, .. } = &parsed.content {
            assert!(content.len() >= 2);
            match &content[0] {
                OdfTextContent::Heading(h) => {
                    assert_eq!(h.text, "Chapter 1");
                    assert_eq!(h.level, 1);
                }
                other => panic!("Expected heading, got {:?}", other),
            }
            // Find paragraph in parsed content
            let has_para = content
                .iter()
                .any(|c| matches!(c, OdfTextContent::Paragraph(p) if p.text == "Hello roundtrip"));
            assert!(has_para, "Expected paragraph with 'Hello roundtrip'");
        } else {
            panic!("Expected Text content");
        }
    }

    // --- 10. XML escaping ---
    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("<>&\"'"), "&lt;&gt;&amp;&quot;&apos;");
        assert_eq!(escape_xml("normal text"), "normal text");
        assert_eq!(escape_xml(""), "");
        assert_eq!(escape_xml("a<b"), "a&lt;b");
    }

    // --- Bonus: Spans with formatting ---
    #[test]
    fn test_serialize_with_spans() {
        let doc = make_doc(vec![OdfTextContent::Paragraph(TextParagraph {
            text: String::new(), // text is ignored when spans are present
            style_name: None,
            spans: vec![
                TextSpan {
                    text: "bold ".into(),
                    style_name: None,
                    bold: true,
                    italic: false,
                    underline: false,
                },
                TextSpan {
                    text: "italic".into(),
                    style_name: None,
                    bold: false,
                    italic: true,
                    underline: false,
                },
            ],
        })]);

        let bytes = OdfSerializer::new().serialize(&doc).unwrap();
        let content = zip_read(&bytes, "content.xml");
        assert!(content.contains("<text:span text:style-name=\"T1\">bold </text:span>"));
        assert!(content.contains("<text:span text:style-name=\"T2\">italic</text:span>"));
        assert!(content.contains("fo:font-weight=\"bold\""));
        assert!(content.contains("fo:font-style=\"italic\""));
    }
}
