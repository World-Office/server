//! VSDX serializer.
//!
//! Serializes a `VisioDocument` into a valid VSDX file (ZIP of XML files).
//! Produces Office-compatible Visio 2013+ VSDX with proper content types
//! and namespace declarations.

use std::io::{Cursor, Write};

use crate::model::*;

/// VSDX serializer — converts a `VisioDocument` into valid VSDX ZIP bytes.
pub struct VisioSerializer;

impl Default for VisioSerializer {
    fn default() -> Self {
        Self::new()
    }
}

impl VisioSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize a `VisioDocument` to VSDX bytes (ZIP archive).
    pub fn serialize(&self, doc: &VisioDocument) -> Result<Vec<u8>, anyhow::Error> {
        let buf = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(buf);

        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // 1. [Content_Types].xml
        let content_types = self.build_content_types(doc);
        zip.start_file("[Content_Types].xml", options)?;
        zip.write_all(content_types.as_bytes())?;

        // 2. _rels/.rels
        let root_rels = self.build_root_rels();
        zip.start_file("_rels/.rels", options)?;
        zip.write_all(root_rels.as_bytes())?;

        // 3. docProps/core.xml
        let core_xml = self.build_core_properties(doc);
        zip.start_file("docProps/core.xml", options)?;
        zip.write_all(core_xml.as_bytes())?;

        // 4. visio/pages/pages.xml
        let pages_xml = self.build_pages_xml(doc);
        zip.start_file("visio/pages/pages.xml", options)?;
        zip.write_all(pages_xml.as_bytes())?;

        // 5. visio/_rels/pages.xml.rels
        let pages_rels = self.build_pages_rels(doc);
        zip.start_file("visio/_rels/pages.xml.rels", options)?;
        zip.write_all(pages_rels.as_bytes())?;

        // 6. Each page XML
        for (i, page) in doc.pages.iter().enumerate() {
            let page_file = format!("visio/pages/page{}.xml", i);
            let page_xml = self.build_page_xml(page);
            zip.start_file(&page_file, options)?;
            zip.write_all(page_xml.as_bytes())?;
        }

        // 7. visio/masters/masters.xml (if any)
        if !doc.masters.is_empty() {
            let masters_xml = self.build_masters_xml(doc);
            zip.start_file("visio/masters/masters.xml", options)?;
            zip.write_all(masters_xml.as_bytes())?;

            let masters_rels = self.build_masters_rels(doc);
            zip.start_file("visio/_rels/masters.xml.rels", options)?;
            zip.write_all(masters_rels.as_bytes())?;

            for (i, master) in doc.masters.iter().enumerate() {
                let master_file = format!("visio/masters/master{}.xml", i);
                let master_xml = self.build_master_xml(master);
                zip.start_file(&master_file, options)?;
                zip.write_all(master_xml.as_bytes())?;
            }
        }

        // 8. visio/colors.xml (if theme colors present)
        if !doc.theme_colors.is_empty() {
            let colors_xml = self.build_colors_xml(doc);
            zip.start_file("visio/colors.xml", options)?;
            zip.write_all(colors_xml.as_bytes())?;
        }

        // 9. visio/settings.xml
        let settings_xml = self.build_settings_xml();
        zip.start_file("visio/settings.xml", options)?;
        zip.write_all(settings_xml.as_bytes())?;

        let result = zip.finish()?;
        Ok(result.into_inner())
    }

    // ── Content Types ─────────────────────────────────────────

    fn build_content_types(&self, doc: &VisioDocument) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>
"#,
        );

        for i in 0..doc.pages.len() {
            xml.push_str(&format!(
                r#"  <Override PartName="/visio/pages/page{}.xml" ContentType="application/vnd.ms-visio.page+xml"/>
"#,
                i
            ));
        }

        if !doc.masters.is_empty() {
            xml.push_str(r#"  <Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>
"#);
            for i in 0..doc.masters.len() {
                xml.push_str(&format!(
                    r#"  <Override PartName="/visio/masters/master{}.xml" ContentType="application/vnd.ms-visio.master+xml"/>
"#,
                    i
                ));
            }
        }

        if !doc.theme_colors.is_empty() {
            xml.push_str(r#"  <Override PartName="/visio/colors.xml" ContentType="application/vnd.ms-visio.colors+xml"/>
"#);
        }

        xml.push_str(r#"  <Override PartName="/visio/settings.xml" ContentType="application/vnd.ms-visio.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>"#);
        xml
    }

    // ── Relationships ─────────────────────────────────────────

    fn build_root_rels(&self) -> String {
        String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="visio/pages/pages.xml"/>
  <Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/masters" Target="visio/masters/masters.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>"#,
        )
    }

    fn build_pages_rels(&self, _doc: &VisioDocument) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
        );
        xml.push_str("\n</Relationships>");
        xml
    }

    fn build_masters_rels(&self, _doc: &VisioDocument) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
        );
        xml.push_str("\n</Relationships>");
        xml
    }

    // ── Core Properties ───────────────────────────────────────

    fn build_core_properties(&self, doc: &VisioDocument) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">"#,
        );
        if let Some(ref title) = doc.properties.title {
            xml.push_str(&format!("\n  <dc:title>{}</dc:title>", escape_xml(title)));
        }
        if let Some(ref creator) = doc.properties.creator {
            xml.push_str(&format!(
                "\n  <dc:creator>{}</dc:creator>",
                escape_xml(creator)
            ));
        }
        if let Some(ref subject) = doc.properties.subject {
            xml.push_str(&format!(
                "\n  <dc:subject>{}</dc:subject>",
                escape_xml(subject)
            ));
        }
        if let Some(ref desc) = doc.properties.description {
            xml.push_str(&format!(
                "\n  <dc:description>{}</dc:description>",
                escape_xml(desc)
            ));
        }
        xml.push_str("\n</cp:coreProperties>");
        xml
    }

    // ── Pages XML ─────────────────────────────────────────────

    fn build_pages_xml(&self, doc: &VisioDocument) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#,
        );

        for (i, page) in doc.pages.iter().enumerate() {
            xml.push_str(&format!(
                r#"
  <Page ID="{}" Name="{}" ViewScale="1" ViewWidth="8.5" ViewHeight="11.0" DrawingScale="1" PageScale="1" DrawingSizeType="3" IsBackground="0" xmlns="">
    <PageSheet>
      <Cell N="PageWidth" V="{}"/>
      <Cell N="PageHeight" V="{}"/>
    </PageSheet>
  </Page>"#,
                i,
                escape_xml(&page.name),
                page.width,
                page.height,
            ));
        }

        xml.push_str("\n</Pages>");
        xml
    }

    // ── Page XML ──────────────────────────────────────────────

    fn build_page_xml(&self, page: &VisioPage) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Page xmlns="http://schemas.microsoft.com/office/visio/2012/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      ID="0" NameU="" IsCustomName="1" IsCustomNameU="1">
  <PageSheet>
    <Cell N="PageWidth" V="8.5"/>
    <Cell N="PageHeight" V="11.0"/>
  </PageSheet>"#,
        );

        if !page.shapes.is_empty() || !page.connectors.is_empty() {
            xml.push_str("\n  <Shapes>");
            for shape in &page.shapes {
                self.serialize_shape(&mut xml, shape);
            }
            for connector in &page.connectors {
                self.serialize_connector(&mut xml, connector);
            }
            xml.push_str("\n  </Shapes>");
        }

        xml.push_str("\n</Page>");
        xml
    }

    // ── Shape serialization ───────────────────────────────────

    fn serialize_shape(&self, xml: &mut String, shape: &VisioShape) {
        xml.push_str(&format!(
            r#"
    <Shape ID="{}" NameU="{}" Type="Shape">"#,
            escape_xml(&shape.id),
            escape_xml(shape.name.as_deref().unwrap_or("Shape")),
        ));

        // Position cells
        // PinX/PinY is the pivot point; we reconstruct it from x/y + LocPinX/LocPinY
        let loc_pin_x = shape.width / 2.0;
        let loc_pin_y = shape.height / 2.0;
        let pin_x = shape.x + loc_pin_x;
        let pin_y = shape.y + loc_pin_y;

        xml.push_str(&format!(
            r#"
      <Cell N="PinX" V="{}"/>
      <Cell N="PinY" V="{}"/>
      <Cell N="Width" V="{}"/>
      <Cell N="Height" V="{}"/>
      <Cell N="LocPinX" V="{}"/>
      <Cell N="LocPinY" V="{}"/>"#,
            pin_x, pin_y, shape.width, shape.height, loc_pin_x, loc_pin_y,
        ));

        if shape.rotation != 0.0 {
            xml.push_str(&format!(
                r#"
      <Cell N="Angle" V="{}"/>{}"#,
                shape.rotation.to_radians(),
                ""
            ));
        }

        // Fill section
        let has_fill = shape.fill_color.is_some()
            || shape.fill_foreground.is_some()
            || shape.fill_background.is_some();
        if has_fill {
            xml.push_str(r#"
      <Section N="Fill">
        <Row IX="0">"#);
            if let Some(ref fg) = shape.fill_foreground {
                xml.push_str(&format!(
                    r#"
          <Cell N="FillForegnd" V="{}"/>"#,
                    escape_xml(fg)
                ));
            }
            if let Some(ref bg) = shape.fill_background {
                xml.push_str(&format!(
                    r#"
          <Cell N="FillBkgnd" V="{}"/>"#,
                    escape_xml(bg)
                ));
            }
            xml.push_str(r#"
        </Row>
      </Section>"#);
        }

        // Line section
        let has_line = shape.stroke_color.is_some()
            || shape.stroke_width.is_some()
            || shape.stroke_pattern.is_some();
        if has_line {
            xml.push_str(r#"
      <Section N="Line">
        <Row IX="0">"#);
            if let Some(ref lc) = shape.stroke_color {
                xml.push_str(&format!(
                    r#"
          <Cell N="LineColor" V="{}"/>"#,
                    escape_xml(lc)
                ));
            }
            if let Some(lw) = shape.stroke_width {
                xml.push_str(&format!(
                    r#"
          <Cell N="LineWeight" V="{}"/>"#,
                    lw
                ));
            }
            if let Some(lp) = shape.stroke_pattern {
                xml.push_str(&format!(
                    r#"
          <Cell N="LinePattern" V="{}"/>"#,
                    lp
                ));
            }
            xml.push_str(r#"
        </Row>
      </Section>"#);
        }

        // Shadow section
        let has_shadow = shape.shadow_color.is_some()
            || shape.shadow_offset_x.is_some()
            || shape.shadow_offset_y.is_some();
        if has_shadow {
            xml.push_str(r#"
      <Section N="Shadow">
        <Row IX="0">"#);
            if let Some(ref sc) = shape.shadow_color {
                xml.push_str(&format!(
                    r#"
          <Cell N="ShdwColor" V="{}"/>"#,
                    escape_xml(sc)
                ));
            }
            if let Some(ox) = shape.shadow_offset_x {
                xml.push_str(&format!(
                    r#"
          <Cell N="ShdwOffsetX" V="{}"/>"#,
                    ox
                ));
            }
            if let Some(oy) = shape.shadow_offset_y {
                xml.push_str(&format!(
                    r#"
          <Cell N="ShdwOffsetY" V="{}"/>"#,
                    oy
                ));
            }
            xml.push_str(r#"
        </Row>
      </Section>"#);
        }

        // Geometry section
        if let Some(ref geom) = shape.geometry {
            self.serialize_geometry(xml, geom);
        }

        // Layer member
        if let Some(ref layer) = shape.layer_member {
            xml.push_str(&format!(
                r#"
      <Cell N="LayerMember" V="{}"/>"#,
                escape_xml(layer)
            ));
        }

        // Sub-shapes
        if !shape.sub_shapes.is_empty() {
            xml.push_str("\n      <Shapes>");
            for sub in &shape.sub_shapes {
                self.serialize_shape(xml, sub);
            }
            xml.push_str("\n      </Shapes>");
        }

        // Text
        if let Some(ref text) = shape.text {
            xml.push_str(&format!(
                r#"
      <Text>{}</Text>"#,
                escape_xml(text)
            ));
        }

        xml.push_str("\n    </Shape>");
    }

    // ── Connector serialization ───────────────────────────────

    fn serialize_connector(&self, xml: &mut String, conn: &VisioConnector) {
        xml.push_str(&format!(
            r#"
    <Shape ID="{}" NameU="{}" Type="Shape">
      <Cell N="OneD" V="1"/>"#,
            escape_xml(&conn.id),
            escape_xml(conn.name.as_deref().unwrap_or("Connector")),
        ));

        if let Some(ref from) = conn.from_shape_id {
            xml.push_str(&format!(
                r#"
      <Cell N="BeginShape" V="{}"/>"#,
                escape_xml(from)
            ));
        }
        if let Some(ref to) = conn.to_shape_id {
            xml.push_str(&format!(
                r#"
      <Cell N="EndShape" V="{}"/>"#,
                escape_xml(to)
            ));
        }
        if let Some(ref rs) = conn.routing_style {
            xml.push_str(&format!(
                r#"
      <Cell N="RoutingStyle" V="{}"/>"#,
                rs
            ));
        }

        if let Some(ref text) = conn.text {
            xml.push_str(&format!(
                r#"
      <Text>{}</Text>"#,
                escape_xml(text)
            ));
        }

        xml.push_str("\n    </Shape>");
    }

    // ── Geometry serialization ────────────────────────────────

    fn serialize_geometry(&self, xml: &mut String, geom: &VisioGeometry) {
        xml.push_str(r#"
      <Section N="Geometry" IX="0">
        <Cell N="NoFill" V="0"/>
        <Cell N="NoLine" V="0"/>
        <Cell N="NoShow" V="0"/>"#);

        // Determine the geometry width/height for the bounding box
        for seg in &geom.segments {
            self.serialize_geo_segment(xml, seg);
        }

        xml.push_str(r#"
      </Section>"#);
    }

    fn serialize_geo_segment(&self, xml: &mut String, seg: &GeoSegment) {
        match seg {
            GeoSegment::MoveTo { x, y } => {
                xml.push_str(&format!(
                    r#"
        <Row T="MoveTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
        </Row>"#,
                    x, y
                ));
            }
            GeoSegment::LineTo { x, y } => {
                xml.push_str(&format!(
                    r#"
        <Row T="LineTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
        </Row>"#,
                    x, y
                ));
            }
            GeoSegment::ArcTo { x, y, a, b, c } => {
                xml.push_str(&format!(
                    r#"
        <Row T="ArcTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
          <Cell N="A" V="{}"/>
          <Cell N="B" V="{}"/>
          <Cell N="C" V="{}"/>
        </Row>"#,
                    x, y, a, b, c
                ));
            }
            GeoSegment::EllipticalArcTo { x, y, a, b, c, d } => {
                xml.push_str(&format!(
                    r#"
        <Row T="EllipticalArcTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
          <Cell N="A" V="{}"/>
          <Cell N="B" V="{}"/>
          <Cell N="C" V="{}"/>
          <Cell N="D" V="{}"/>
        </Row>"#,
                    x, y, a, b, c, d
                ));
            }
            GeoSegment::BezierTo { x, y, a, b, c, d } => {
                xml.push_str(&format!(
                    r#"
        <Row T="BezierTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
          <Cell N="A" V="{}"/>
          <Cell N="B" V="{}"/>
          <Cell N="C" V="{}"/>
          <Cell N="D" V="{}"/>
        </Row>"#,
                    x, y, a, b, c, d
                ));
            }
            GeoSegment::NURBSTo { x, y, .. } => {
                xml.push_str(&format!(
                    r#"
        <Row T="NURBSTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
          <Cell N="A" V="0"/>
          <Cell N="B" V="0"/>
        </Row>"#,
                    x, y
                ));
            }
            GeoSegment::PolylineTo { x, y, .. } => {
                xml.push_str(&format!(
                    r#"
        <Row T="PolylineTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
        </Row>"#,
                    x, y
                ));
            }
            GeoSegment::SplineStart { x, y, degree, .. } => {
                xml.push_str(&format!(
                    r#"
        <Row T="SplineStart">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
          <Cell N="D" V="{}"/>
        </Row>"#,
                    x, y, degree
                ));
            }
            GeoSegment::InfiniteLine { x1, y1, x2, y2 } => {
                xml.push_str(&format!(
                    r#"
        <Row T="InfiniteLine">
          <Cell N="X1" V="{}"/>
          <Cell N="Y1" V="{}"/>
          <Cell N="X2" V="{}"/>
          <Cell N="Y2" V="{}"/>
        </Row>"#,
                    x1, y1, x2, y2
                ));
            }
            GeoSegment::Ellipse { x, y, cx, cy } => {
                xml.push_str(&format!(
                    r#"
        <Row T="Ellipse">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
          <Cell N="CX" V="{}"/>
          <Cell N="CY" V="{}"/>
        </Row>"#,
                    x, y, cx, cy
                ));
            }
            GeoSegment::Rectangle { w, h } => {
                // Rectangle as a closed polyline
                xml.push_str(&format!(
                    r#"
        <Row T="MoveTo">
          <Cell N="X" V="0"/>
          <Cell N="Y" V="0"/>
        </Row>
        <Row T="LineTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="0"/>
        </Row>
        <Row T="LineTo">
          <Cell N="X" V="{}"/>
          <Cell N="Y" V="{}"/>
        </Row>
        <Row T="LineTo">
          <Cell N="X" V="0"/>
          <Cell N="Y" V="{}"/>
        </Row>
        <Row T="LineTo">
          <Cell N="X" V="0"/>
          <Cell N="Y" V="0"/>
        </Row>"#,
                    w, w, h, h
                ));
            }
        }
    }

    // ── Masters XML ────────────────────────────────────────────

    fn build_masters_xml(&self, doc: &VisioDocument) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Masters xmlns="http://schemas.microsoft.com/office/visio/2012/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#,
        );

        for (i, master) in doc.masters.iter().enumerate() {
            xml.push_str(&format!(
                r#"
  <Master ID="{}" Name="{}" UniqueID="{}"/>{}"#,
                i,
                escape_xml(&master.name),
                escape_xml(master.unique_id.as_deref().unwrap_or("")),
                ""
            ));
        }

        xml.push_str("\n</Masters>");
        xml
    }

    fn build_master_xml(&self, master: &VisioMaster) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Master xmlns="http://schemas.microsoft.com/office/visio/2012/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#,
        );

        if !master.shapes.is_empty() {
            xml.push_str("\n  <Shapes>");
            for shape in &master.shapes {
                self.serialize_shape(&mut xml, shape);
            }
            xml.push_str("\n  </Shapes>");
        }

        xml.push_str("\n</Master>");
        xml
    }

    // ── Colors XML ────────────────────────────────────────────

    fn build_colors_xml(&self, doc: &VisioDocument) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Colors xmlns="http://schemas.microsoft.com/office/visio/2012/main">"#,
        );

        for color in &doc.theme_colors {
            xml.push_str(&format!(
                r#"
  <Color IX="{}" RGB="{}""#,
                color.index,
                color.rgb.trim_start_matches('#'),
            ));
            if let Some(ref name) = color.name {
                xml.push_str(&format!(r#" Name="{}""#, escape_xml(name)));
            }
            xml.push_str("/>");
        }

        xml.push_str("\n</Colors>");
        xml
    }

    // ── Settings XML ──────────────────────────────────────────

    fn build_settings_xml(&self) -> String {
        String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Settings xmlns="http://schemas.microsoft.com/office/visio/2012/main">
  <SnapSettings>17</SnapSettings>
  <GlueSettings>1</GlueSettings>
  <DynamicGridEnabled>0</DynamicGridEnabled>
  <ProtectStyles>0</ProtectStyles>
  <ProtectShapes>0</ProtectShapes>
  <ProtectMasters>0</ProtectMasters>
</Settings>"#,
        )
    }
}

/// Escape XML special characters.
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
