//! OOXML DOCX serializer.
//!
//! Serializes an `OoxmlDocument` into a valid DOCX file (ZIP of XML files).

use crate::model::*;
use std::io::{Cursor, Write as IoWrite};

/// DOCX serializer — converts an `OoxmlDocument` into a valid DOCX ZIP.
pub struct OoxmlSerializer;

impl OoxmlSerializer {
    pub fn new() -> Self {
        Self
    }

    /// Serialize an `OoxmlDocument` to DOCX bytes (ZIP archive).
    pub fn serialize(&self, doc: &OoxmlDocument) -> Result<Vec<u8>, anyhow::Error> {
        let buf = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(buf);

        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // 1. [Content_Types].xml
        let content_types = self.build_content_types(doc);
        zip.start_file("[Content_Types].xml", options)?;
        zip.write_all(content_types.as_bytes())?;

        // 2. _rels/.rels
        let rels = self.build_root_rels();
        zip.start_file("_rels/.rels", options)?;
        zip.write_all(rels.as_bytes())?;

        // 3. word/document.xml
        let document_xml = self.build_document_xml(doc);
        zip.start_file("word/document.xml", options)?;
        zip.write_all(document_xml.as_bytes())?;

        // 4. word/_rels/document.xml.rels
        let doc_rels = self.build_document_rels();
        zip.start_file("word/_rels/document.xml.rels", options)?;
        zip.write_all(doc_rels.as_bytes())?;

        // 5. word/styles.xml
        let styles = self.build_styles_xml();
        zip.start_file("word/styles.xml", options)?;
        zip.write_all(styles.as_bytes())?;

        // 6. docProps/core.xml
        let core_xml = self.build_core_properties(&doc.core_properties);
        zip.start_file("docProps/core.xml", options)?;
        zip.write_all(core_xml.as_bytes())?;

        let result = zip.finish()?;
        Ok(result.into_inner())
    }

    /// Serialize an XlsxWorkbook to XLSX bytes (ZIP archive).
    pub fn serialize_xlsx(&self, wb: &XlsxWorkbook) -> Result<Vec<u8>, anyhow::Error> {
        let buf = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(buf);

        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // 1. [Content_Types].xml
        let content_types = self.build_xlsx_content_types(wb);
        zip.start_file("[Content_Types].xml", options)?;
        zip.write_all(content_types.as_bytes())?;

        // 2. _rels/.rels
        let rels = self.build_xlsx_root_rels();
        zip.start_file("_rels/.rels", options)?;
        zip.write_all(rels.as_bytes())?;

        // 3. xl/workbook.xml
        let wb_xml = self.build_xlsx_workbook_xml(wb);
        zip.start_file("xl/workbook.xml", options)?;
        zip.write_all(wb_xml.as_bytes())?;

        // 4. xl/_rels/workbook.xml.rels
        let wb_rels = self.build_xlsx_workbook_rels(wb);
        zip.start_file("xl/_rels/workbook.xml.rels", options)?;
        zip.write_all(wb_rels.as_bytes())?;

        // 5. Each worksheet
        for (i, sheet) in wb.sheets.iter().enumerate() {
            let sheet_path = format!("xl/worksheets/sheet{}.xml", i + 1);
            let sheet_xml = self.build_xlsx_sheet_xml(sheet);
            zip.start_file(&sheet_path, options)?;
            zip.write_all(sheet_xml.as_bytes())?;
        }

        // 6. xl/sharedStrings.xml
        if !wb.shared_strings.is_empty() {
            let ss_xml = self.build_xlsx_shared_strings(&wb.shared_strings);
            zip.start_file("xl/sharedStrings.xml", options)?;
            zip.write_all(ss_xml.as_bytes())?;
        }

        // 7. xl/styles.xml
        let styles_xml = self.build_xlsx_styles_xml(&wb.styles);
        zip.start_file("xl/styles.xml", options)?;
        zip.write_all(styles_xml.as_bytes())?;

        // 8. xl/theme/theme1.xml
        let theme_xml = self.build_xlsx_theme_xml();
        zip.start_file("xl/theme/theme1.xml", options)?;
        zip.write_all(theme_xml.as_bytes())?;

        // 9. docProps/core.xml
        let core_xml = self.build_core_properties(&CoreProperties::default());
        zip.start_file("docProps/core.xml", options)?;
        zip.write_all(core_xml.as_bytes())?;

        let result = zip.finish()?;
        Ok(result.into_inner())
    }

    /// Serialize a PptxPresentation to PPTX bytes (ZIP archive).
    pub fn serialize_pptx(&self, pres: &PptxPresentation) -> Result<Vec<u8>, anyhow::Error> {
        let buf = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(buf);

        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // 1. [Content_Types].xml
        let content_types = self.build_pptx_content_types(pres);
        zip.start_file("[Content_Types].xml", options)?;
        zip.write_all(content_types.as_bytes())?;

        // 2. _rels/.rels
        let rels = self.build_pptx_root_rels();
        zip.start_file("_rels/.rels", options)?;
        zip.write_all(rels.as_bytes())?;

        // 3. ppt/presentation.xml
        let pres_xml = self.build_presentation_xml(pres);
        zip.start_file("ppt/presentation.xml", options)?;
        zip.write_all(pres_xml.as_bytes())?;

        // 4. ppt/_rels/presentation.xml.rels
        let pres_rels = self.build_pptx_pres_rels(pres);
        zip.start_file("ppt/_rels/presentation.xml.rels", options)?;
        zip.write_all(pres_rels.as_bytes())?;

        // 5. Each slide
        for (i, slide) in pres.slides.iter().enumerate() {
            let slide_path = format!("ppt/slides/slide{}.xml", i + 1);
            let slide_xml = self.build_slide_xml(slide);
            zip.start_file(&slide_path, options)?;
            zip.write_all(slide_xml.as_bytes())?;
        }

        // 6. ppt/theme/theme1.xml (if theme is set)
        if let Some(ref theme) = pres.theme {
            let theme_xml = self.build_theme_xml(theme);
            zip.start_file("ppt/theme/theme1.xml", options)?;
            zip.write_all(theme_xml.as_bytes())?;
        }

        // 7. ppt/slideMasters/slideMaster*.xml
        for (i, master) in pres.slide_masters.iter().enumerate() {
            let master_xml = self.build_slide_master_xml(master);
            let path = format!("ppt/slideMasters/slideMaster{}.xml", i + 1);
            zip.start_file(&path, options)?;
            zip.write_all(master_xml.as_bytes())?;
        }

        // 8. docProps/core.xml
        let core_xml = self.build_core_properties(&pres.core_properties);
        zip.start_file("docProps/core.xml", options)?;
        zip.write_all(core_xml.as_bytes())?;

        let result = zip.finish()?;
        Ok(result.into_inner())
    }

    fn build_pptx_content_types(&self, pres: &PptxPresentation) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>"#,
        );
        for i in 1..=pres.slides.len() {
            xml.push_str(&format!(
                r#"
  <Override PartName="/ppt/slides/slide{}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>"#,
                i
            ));
        }
        if pres.theme.is_some() {
            xml.push_str(r#"
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>"#);
        }
        for i in 1..=pres.slide_masters.len() {
            xml.push_str(&format!(
                r#"
  <Override PartName="/ppt/slideMasters/slideMaster{}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>"#,
                i
            ));
        }
        xml.push_str("\n</Types>");
        xml
    }

    fn build_pptx_root_rels(&self) -> String {
        String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#,
        )
    }

    fn build_pptx_pres_rels(&self, pres: &PptxPresentation) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
        );
        let mut rel_id = 1u32;
        for i in 1..=pres.slides.len() {
            xml.push_str(&format!(
                r#"
  <Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{}.xml"/>"#,
                rel_id, i
            ));
            rel_id += 1;
        }
        if pres.theme.is_some() {
            xml.push_str(&format!(
                r#"
  <Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>"#,
                rel_id
            ));
            rel_id += 1;
        }
        for i in 1..=pres.slide_masters.len() {
            xml.push_str(&format!(
                r#"
  <Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster{}.xml"/>"#,
                rel_id, i
            ));
            rel_id += 1;
        }
        xml.push_str("\n</Relationships>");
        xml
    }

    fn build_presentation_xml(&self, pres: &PptxPresentation) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#,
        );

        // Slide size
        xml.push_str(&format!(
            r#"
  <p:sldSz cx="{}" cy="{}"/>"#,
            pres.slide_size.cx, pres.slide_size.cy
        ));

        // Slide ID list
        xml.push_str("\n  <p:sldIdLst>");
        for (i, slide) in pres.slides.iter().enumerate() {
            let mut attrs = format!(r#"id="{}" r:id="rId{}""#, slide.id, i + 1);
            if let Some(ref layout_id) = slide.layout_id {
                attrs.push_str(&format!(r#" sldLayoutId="{}""#, layout_id));
            }
            if let Some(ref master_id) = slide.master_id {
                attrs.push_str(&format!(r#" sldMasterId="{}""#, master_id));
            }
            xml.push_str(&format!(
                r#"
    <p:sldId {}/>"#,
                attrs
            ));
        }
        xml.push_str("\n  </p:sldIdLst>\n</p:presentation>");
        xml
    }

    fn build_slide_xml(&self, slide: &Slide) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main""#,
        );

        if let Some(ref layout_id) = slide.layout_id {
            xml.push_str(&format!(r#" sldLayoutId="{}""#, layout_id));
        }
        if let Some(ref master_id) = slide.master_id {
            xml.push_str(&format!(r#" sldMasterId="{}""#, master_id));
        }
        xml.push('>');

        // spTree
        xml.push_str("\n  <p:spTree>");
        xml.push_str(
            r#"
    <p:nvGrpSpPr>
      <p:cNvPr id="1" name=""/>
      <p:cNvGrpSpPr/>
      <p:nvPr/>
    </p:nvGrpSpPr>
    <p:grpSpPr/>"#,
        );

        for shape in &slide.shapes {
            match shape {
                SlideShape::TextBox(tb) => {
                    self.serialize_textbox_shape(&mut xml, tb);
                }
                SlideShape::Placeholder(ph) => {
                    self.serialize_placeholder_shape(&mut xml, ph);
                }
                SlideShape::Picture(pic) => {
                    self.serialize_picture_shape(&mut xml, pic);
                }
                SlideShape::Table(table) => {
                    self.serialize_table_shape(&mut xml, table);
                }
                SlideShape::Connector(conn) => {
                    self.serialize_connector_shape(&mut xml, conn);
                }
                SlideShape::Chart(_chart) => {
                    // STUB for future implementation
                    xml.push_str(
                        r#"
    <p:graphicFrame>
      <p:nvGraphicFramePr>
        <p:cNvPr id="chart-stub" name="Chart"/>
        <p:cNvGraphicFramePr/>
        <p:nvPr/>
      </p:nvGraphicFramePr>
      <p:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </p:xfrm>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>
        </a:graphicData>
      </a:graphic>
    </p:graphicFrame>"#,
                    );
                }
                SlideShape::SmartArt(_smartart) => {
                    // STUB for future implementation
                    xml.push_str(
                        r#"
    <p:graphicFrame>
      <p:nvGraphicFramePr>
        <p:cNvPr id="smartart-stub" name="SmartArt"/>
        <p:cNvGraphicFramePr/>
        <p:nvPr/>
      </p:nvGraphicFramePr>
      <p:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </p:xfrm>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">
          <dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>
        </a:graphicData>
      </a:graphic>
    </p:graphicFrame>"#,
                    );
                }
            }
        }

        xml.push_str("\n  </p:spTree>");

        // Transition
        if let Some(trans) = &slide.transition {
            if trans.effect != TransitionEffect::None {
                let effect_name = match trans.effect {
                    TransitionEffect::None => "",
                    TransitionEffect::Fade => "p:fade",
                    TransitionEffect::Push => "p:push",
                    TransitionEffect::Wipe => "p:wipe",
                    TransitionEffect::Split => "p:split",
                    TransitionEffect::Reveal => "p:reveal",
                    TransitionEffect::Checker => "p:checker",
                    TransitionEffect::Zoom => "p:zoom",
                    TransitionEffect::Morph => "p:morph",
                    TransitionEffect::Circle => "p:circle",
                    TransitionEffect::Uncover => "p:uncover",
                    TransitionEffect::Cover => "p:cover",
                    TransitionEffect::Flash => "p:flash",
                    TransitionEffect::Random => "p:random",
                    TransitionEffect::Shred => "p:shred",
                    TransitionEffect::Wedge => "p:wedge",
                    TransitionEffect::Wheel => "p:wheel",
                    TransitionEffect::Flythrough => "p:flyThrough",
                    TransitionEffect::Excite => "p:excite",
                    TransitionEffect::Dissolve => "p:dissolve",
                    TransitionEffect::Newsflash => "p:newsflash",
                    TransitionEffect::Bars => "p:bars",
                    TransitionEffect::Contract => "p:contract",
                    TransitionEffect::Rotate => "p:rotate",
                    TransitionEffect::Blast => "p:blast",
                    TransitionEffect::Center => "p:center",
                    TransitionEffect::Shape => "p:shape",
                    TransitionEffect::ZoomIn => "p:zoomIn",
                    TransitionEffect::ZoomOut => "p:zoomOut",
                    TransitionEffect::CoverIn => "p:coverIn",
                    TransitionEffect::CoverUp => "p:coverUp",
                    TransitionEffect::CoverLeft => "p:coverLeft",
                    TransitionEffect::CoverRight => "p:coverRight",
                    TransitionEffect::PullIn => "p:pullIn",
                    TransitionEffect::PullUp => "p:pullUp",
                    TransitionEffect::PullLeft => "p:pullLeft",
                    TransitionEffect::PullRight => "p:pullRight",
                };
                let dur_ms = (trans.duration * 1000.0) as u64;
                let adv_click = if trans.advance_mode == AdvanceMode::Manual {
                    "1"
                } else {
                    "0"
                };
                xml.push_str(&format!(
                    r#"
  <p:transition dur="{}" advClick="{}""#,
                    dur_ms, adv_click,
                ));
                if trans.advance_timing > 0.0 {
                    let adv_tm_ms = (trans.advance_timing * 1000.0) as u64;
                    xml.push_str(&format!(r#" advTm="{}""#, adv_tm_ms));
                }
                xml.push_str(&format!(
                    r#">
    <{}/>
  </p:transition>"#,
                    effect_name
                ));
            }
        }

        // Timing (animations)
        if !slide.animations.is_empty() {
            xml.push_str(
                r#"
  <p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"/>
      </p:par>
    </p:tnLst>"#,
            );
            for anim in &slide.animations {
                let anim_dur = (anim.duration * 1000.0) as u64;
                let anim_delay = (anim.delay * 1000.0) as u64;
                // Map start type to OOXML cond evt attribute
                //   "onClick" → evt="onClick", delay=0
                //   "withPrevious" → evt="onBegin", delay=0
                //   "afterPrevious" → evt="onBegin", delay=<delay_ms>
                //   default → evt="onClick", delay=0
                let evt_attr = match anim.start.as_str() {
                    "withPrevious" => "onBegin",
                    "afterPrevious" => "onBegin",
                    _ => "onClick",
                };
                let mut xml_anim = format!(
                    r#"    <p:childTnLst>
      <p:par>
        <p:cTn id="{}" dur="{}" restart="always">
          <p:stCondLst>
            <p:cond evt="{}" delay="{}"/>
          </p:stCondLst>
"#,
                    anim.id, anim_dur, evt_attr, anim_delay,
                );
                if anim.target.is_empty() && anim.effect.is_empty() {
                    xml_anim.push_str("          <p:effect/>\n");
                } else {
                    xml_anim.push_str(&format!(
                        "          <p:effect ref=\"{}\" filter=\"{}\"/>\n",
                        anim.target, anim.effect,
                    ));
                }
                xml_anim.push_str(
                    "        </p:cTn>
      </p:par>
    </p:childTnLst>",
                );
                xml.push_str(&xml_anim);
            }
            xml.push_str("\n  </p:timing>");
        } else if let Some(timing_raw) = &slide.timing_raw {
            xml.push_str(&format!("\n  {}", timing_raw));
        }

        xml.push_str("\n</p:sld>");
        xml
    }

    fn serialize_fill(&self, xml: &mut String, fill: &Option<Fill>) {
        if let Some(ref f) = fill {
            match f {
                Fill::Solid(color) => {
                    let c = color.trim_start_matches('#');
                    xml.push_str(&format!(
                        r#"
        <a:solidFill>
          <a:srgbClr val="{}"/>
        </a:solidFill>"#,
                        c
                    ));
                }
                Fill::Gradient(grad) => {
                    xml.push_str(
                        r#"
        <a:gradFill>"#,
                    );
                    if matches!(grad.kind, GradientKind::Linear) {
                        let ang = (grad.angle * 60000.0) as i64;
                        xml.push_str(&format!(
                            r#"
          <a:lin ang="{}" scaled="0"/>"#,
                            ang
                        ));
                    } else {
                        xml.push_str(
                            r#"
          <a:path path="circle">
            <a:fillToRect l="50000" t="50000" r="50000" b="50000"/>
          </a:path>"#,
                        );
                    }
                    xml.push_str(
                        r#"
          <a:gsLst>"#,
                    );
                    for stop in &grad.stops {
                        let pos = (stop.position * 1000.0) as i64;
                        let c = stop.color.trim_start_matches('#');
                        xml.push_str(&format!(
                            r#"
            <a:gs pos="{}">
              <a:srgbClr val="{}"/>
            </a:gs>"#,
                            pos, c,
                        ));
                    }
                    xml.push_str(
                        r#"
          </a:gsLst>
        </a:gradFill>"#,
                    );
                }
            }
        }
    }

    fn serialize_effect_list(&self, xml: &mut String, effect: &Option<EffectList>) {
        if let Some(ref el) = effect {
            xml.push_str("\n        <a:effectLst>");
            if let Some(ref shadow) = el.shadow {
                let c = shadow.color.trim_start_matches('#');
                let alpha = (shadow.opacity * 1000.0) as i64;
                xml.push_str(&format!(
                    r#"
		  <a:outerShdw blurRad="{}" dx="{}" dy="{}" algn="tl">
			<a:srgbClr val="{}">
			  <a:alpha val="{}"/>
			</a:srgbClr>
		  </a:outerShdw>"#,
                    shadow.blur_radius, shadow.dx, shadow.dy, c, alpha,
                ));
            }
            if let Some(ref glow) = el.glow {
                let c = glow.color.trim_start_matches('#');
                let alpha = (glow.opacity * 1000.0) as i64;
                xml.push_str(&format!(
                    r#"
		  <a:glow rad="{}">
			<a:srgbClr val="{}">
			  <a:alpha val="{}"/>
			</a:srgbClr>
		  </a:glow>"#,
                    glow.radius, c, alpha,
                ));
            }
            if let Some(ref refl) = el.reflection {
                let alpha = (refl.start_opacity * 1000.0) as i64;
                let pos = (refl.end_pos * 1000.0) as i64;
                let dir = if refl.direction == ReflectionDirection::Fade {
                    "fade"
                } else {
                    "mirror"
                };
                xml.push_str(&format!(
                    r#"
		  <a:reflection blurRad="{}" stA="{}" pos="{}" dir="{}"/>"#,
                    refl.blur_radius, alpha, pos, dir,
                ));
            }
            xml.push_str("\n        </a:effectLst>");
        }
    }

    fn serialize_textbox_shape(&self, xml: &mut String, tb: &TextBoxShape) {
        xml.push_str(&format!(
            r#"
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="{}" name="TextBox"/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="{}" y="{}"/>
          <a:ext cx="{}" cy="{}"/>
        </a:xfrm>"#,
            tb.id, tb.bounds.x, tb.bounds.y, tb.bounds.cx, tb.bounds.cy,
        ));
        self.serialize_fill(xml, &tb.fill);
        self.serialize_effect_list(xml, &tb.effect);
        xml.push_str(
            r#"
      </p:spPr>"#,
        );
        self.serialize_text_body(xml, &tb.text_body);
        xml.push_str("\n    </p:sp>");
    }

    fn serialize_placeholder_shape(&self, xml: &mut String, ph: &PlaceholderShape) {
        xml.push_str(&format!(
            r#"
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="{}" name="Placeholder"/>
        <p:nvPr>
          <p:ph type="{}"/>
        </p:nvPr>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="{}" y="{}"/>
          <a:ext cx="{}" cy="{}"/>
        </a:xfrm>"#,
            ph.id, ph.placeholder_type, ph.bounds.x, ph.bounds.y, ph.bounds.cx, ph.bounds.cy,
        ));
        self.serialize_fill(xml, &ph.fill);
        self.serialize_effect_list(xml, &ph.effect);
        xml.push_str(
            r#"
      </p:spPr>"#,
        );
        if let Some(ref tb) = ph.text_body {
            self.serialize_text_body(xml, tb);
        }
        xml.push_str("\n    </p:sp>");
    }

    fn serialize_picture_shape(&self, xml: &mut String, pic: &PictureShape) {
        xml.push_str(&format!(
            r#"
    <p:pic>
      <p:nvPicPr>
        <p:cNvPr id="{}" name="{}"/>
        <p:nvPr/>
      </p:nvPicPr>
      <p:blipFill/>
      <p:spPr>
        <a:xfrm>
          <a:off x="{}" y="{}"/>
          <a:ext cx="{}" cy="{}"/>
        </a:xfrm>"#,
            pic.id, pic.name, pic.bounds.x, pic.bounds.y, pic.bounds.cx, pic.bounds.cy,
        ));
        self.serialize_effect_list(xml, &pic.effect);
        xml.push_str(
            r#"
      </p:spPr>
    </p:pic>"#,
        );
    }

    fn serialize_table_shape(&self, xml: &mut String, table: &TableShape) {
        xml.push_str(&format!(
            r#"
    <p:tbl>
      <p:spPr>
        <a:xfrm>
          <a:off x="{}" y="{}"/>
          <a:ext cx="{}" cy="{}"/>
        </a:xfrm>
      </p:spPr>
      <p:tblGrid>"#,
            table.bounds.x, table.bounds.y, table.bounds.cx, table.bounds.cy,
        ));
        for col in &table.columns {
            xml.push_str(&format!(
                r#"
        <p:gridCol w="{}"/>"#,
                col.width,
            ));
        }
        xml.push_str(
            r#"
      </p:tblGrid>"#,
        );

        for row in &table.rows {
            xml.push_str(&format!(
                r#"
      <p:tr h="{}">"#,
                row.height,
            ));
            for cell in &row.cells {
                xml.push_str(
                    r#"
        <p:tc>"#,
                );
                // Cell text body
                xml.push_str(
                    r#"
          <p:txBody>
            <a:bodyPr/>
            <a:lstStyle/>"#,
                );
                if cell.text_body.paragraphs.is_empty() {
                    xml.push_str(
                        r#"
            <a:p/>"#,
                    );
                } else {
                    for para in &cell.text_body.paragraphs {
                        xml.push_str(
                            r#"
            <a:p>"#,
                        );
                        for run in &para.runs {
                            if run.text == "\n" {
                                xml.push_str(
                                    r#"
              <a:br/>"#,
                                );
                            } else {
                                xml.push_str(&format!(
                                    r#"
              <a:r>
                <a:t xml:space="preserve">{}</a:t>
              </a:r>"#,
                                    // Escape XML special chars
                                    run.text
                                        .replace('&', "&amp;")
                                        .replace('<', "&lt;")
                                        .replace('>', "&gt;")
                                        .replace('"', "&quot;")
                                ));
                            }
                        }
                        xml.push_str(
                            r#"
            </a:p>"#,
                        );
                    }
                }
                xml.push_str(
                    r#"
          </p:txBody>"#,
                );

                // Cell properties
                let mut cell_props = String::new();
                if let Some(ref fill) = cell.fill_color {
                    cell_props.push_str(&format!(
                        r#"
            <a:solidFill>
              <a:srgbClr val="{}"/>
            </a:solidFill>"#,
                        fill,
                    ));
                }
                if let Some(rs) = cell.row_span {
                    cell_props.push_str(&format!(r#" rowSpan="{}""#, rs));
                }
                if let Some(cs) = cell.col_span {
                    cell_props.push_str(&format!(r#" gridSpan="{}""#, cs));
                }
                if cell_props.is_empty() {
                    xml.push_str(
                        r#"
          <p:tcPr/>"#,
                    );
                } else {
                    // Determine if we have inline properties or attributes
                    if cell.row_span.is_some() || cell.col_span.is_some() {
                        if let Some(fill_color) = &cell.fill_color {
                            xml.push_str(&format!(
                                r#"
          <p:tcPr>
            <a:solidFill>
              <a:srgbClr val="{}"/>
            </a:solidFill>
          </p:tcPr>"#,
                                fill_color,
                            ));
                        } else {
                            xml.push_str(
                                r#"
          <p:tcPr/>"#,
                            );
                        }
                    } else if let Some(fill_color) = &cell.fill_color {
                        xml.push_str(&format!(
                            r#"
          <p:tcPr>
            <a:solidFill>
              <a:srgbClr val="{}"/>
            </a:solidFill>
          </p:tcPr>"#,
                            fill_color,
                        ));
                    }
                }
                xml.push_str(
                    r#"
        </p:tc>"#,
                );
            }
            xml.push_str(
                r#"
      </p:tr>"#,
            );
        }
        xml.push_str(
            r#"
    </p:tbl>"#,
        );
    }

    fn serialize_connector_shape(&self, xml: &mut String, conn: &ConnectorShape) {
        let prst = conn.connector_type.to_string();
        xml.push_str(&format!(
            r#"
    <p:cxnSp>
      <p:nvCxnSpPr>
        <p:cNvPr id="{}" name="Connector"/>
        <p:cNvCxnSpPr/>
        <p:nvPr/>
      </p:nvCxnSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="{}" y="{}"/>
          <a:ext cx="{}" cy="{}"/>
        </a:xfrm>
        <a:prstGeom prst="{}"/>
        <a:ln w="{}">"#,
            conn.id,
            conn.bounds.x,
            conn.bounds.y,
            conn.bounds.cx,
            conn.bounds.cy,
            prst,
            conn.line_width.unwrap_or(6350),
        ));
        if conn.has_start_arrow {
            xml.push_str(
                r#"
          <a:tailEnd type="triangle"/>"#,
            );
        }
        if conn.has_end_arrow {
            xml.push_str(
                r#"
          <a:headEnd type="triangle"/>"#,
            );
        }
        xml.push_str(
            r#"
        </a:ln>"#,
        );
        self.serialize_fill(xml, &conn.fill);
        self.serialize_effect_list(xml, &conn.effect);
        xml.push_str(
            r#"
      </p:spPr>
    </p:cxnSp>"#,
        );
    }

    fn serialize_text_body(&self, xml: &mut String, tb: &TextBody) {
        xml.push_str("\n      <p:txBody>");
        xml.push_str(
            r#"
        <a:bodyPr/>
        <a:lstStyle/>"#,
        );

        for para in &tb.paragraphs {
            xml.push_str("\n        <a:p>");
            for run in &para.runs {
                if run.text == "\n" {
                    xml.push_str("\n          <a:br/>");
                    continue;
                }
                xml.push_str("\n          <a:r>");
                let has_rpr = run.bold
                    || run.italic
                    || run.underline.is_some()
                    || run.font_size.is_some()
                    || run.font.is_some()
                    || run.color.is_some();
                if has_rpr {
                    xml.push_str("\n            <a:rPr");
                    if run.bold {
                        xml.push_str(" b=\"1\"");
                    }
                    if run.italic {
                        xml.push_str(" i=\"1\"");
                    }
                    if let Some(sz) = run.font_size {
                        xml.push_str(&format!(" sz=\"{}\"", sz * 100));
                    }
                    if let Some(ref u) = run.underline {
                        let val = match u {
                            UnderlineType::Single => "sng",
                            _ => "sng",
                        };
                        xml.push_str(&format!(" u=\"{}\"", val));
                    }
                    if let Some(ref f) = run.font {
                        xml.push_str(&format!(
                            "><a:latin typeface=\"{}\"/></a:rPr>",
                            escape_xml(f)
                        ));
                    } else {
                        xml.push_str("/>");
                    }
                }
                xml.push_str(&format!(
                    "\n            <a:t>{}</a:t>",
                    escape_xml(&run.text)
                ));
                xml.push_str("\n          </a:r>");
            }
            xml.push_str("\n        </a:p>");
        }
        xml.push_str("\n      </p:txBody>");
    }

    fn build_content_types(&self, _doc: &OoxmlDocument) -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#
            .to_string()
    }

    fn build_root_rels(&self) -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#
            .to_string()
    }

    fn build_document_rels(&self) -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#
            .to_string()
    }

    fn build_document_xml(&self, doc: &OoxmlDocument) -> String {
        let mut xml = String::new();
        xml.push_str(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>"#,
        );

        if let Some(ref body) = doc.docx_body {
            for block in &body.blocks {
                match block {
                    DocxBlock::Paragraph(para) => {
                        xml.push_str(&self.serialize_paragraph(para));
                    }
                    DocxBlock::Table(table) => {
                        xml.push_str(&self.serialize_table(table));
                    }
                    DocxBlock::Image(_) => {
                        // Image serialization placeholder - full implementation would require
                        // creating w:drawing elements with proper OOXML structure
                    }
                }
            }
        }

        xml.push_str("  </w:body>\n</w:document>");
        xml
    }

    fn serialize_paragraph(&self, para: &DocxParagraph) -> String {
        let mut xml = String::from("    <w:p>");

        // Paragraph properties
        let has_props = para.style_id.is_some()
            || para.properties.alignment.is_some()
            || para.properties.indent_left.is_some()
            || para.properties.indent_right.is_some()
            || para.properties.indent_first_line.is_some()
            || para.properties.indent_hanging.is_some()
            || para.properties.spacing_before.is_some()
            || para.properties.spacing_after.is_some()
            || para.properties.spacing_line.is_some()
            || para.properties.keep_lines
            || para.properties.keep_next
            || para.properties.page_break_before;

        if has_props {
            xml.push_str("<w:pPr>");
            if let Some(ref style) = para.style_id {
                xml.push_str("<w:pStyle w:val=\"");
                xml.push_str(&escape_xml(style));
                xml.push_str("\"/>");
            }
            if let Some(align) = para.properties.alignment {
                let val = match align {
                    TextAlignment::Left => "left",
                    TextAlignment::Center => "center",
                    TextAlignment::Right => "right",
                    TextAlignment::Both => "both",
                };
                xml.push_str("<w:jc w:val=\"");
                xml.push_str(val);
                xml.push_str("\"/>");
            }
            if let Some(il) = para.properties.indent_left {
                xml.push_str(&format!("<w:ind w:left=\"{}\"", il));
                if let Some(ir) = para.properties.indent_right {
                    xml.push_str(&format!(" w:right=\"{}\"", ir));
                }
                if let Some(fi) = para.properties.indent_first_line {
                    xml.push_str(&format!(" w:firstLine=\"{}\"", fi));
                }
                if let Some(ih) = para.properties.indent_hanging {
                    xml.push_str(&format!(" w:hanging=\"{}\"", ih));
                }
                xml.push_str("/>");
            } else {
                // Write individual indent properties if only some are set
                let mut ind_parts = Vec::new();
                if let Some(ir) = para.properties.indent_right {
                    ind_parts.push(format!("w:right=\"{}\"", ir));
                }
                if let Some(fi) = para.properties.indent_first_line {
                    ind_parts.push(format!("w:firstLine=\"{}\"", fi));
                }
                if let Some(ih) = para.properties.indent_hanging {
                    ind_parts.push(format!("w:hanging=\"{}\"", ih));
                }
                if !ind_parts.is_empty() {
                    xml.push_str("<w:ind ");
                    xml.push_str(&ind_parts.join(" "));
                    xml.push_str("/>");
                }
            }
            if let Some(sb) = para.properties.spacing_before {
                xml.push_str(&format!("<w:spacing w:before=\"{}\"", sb));
                if let Some(sa) = para.properties.spacing_after {
                    xml.push_str(&format!(" w:after=\"{}\"", sa));
                }
                if let Some(sl) = para.properties.spacing_line {
                    xml.push_str(&format!(" w:line=\"{}\"", sl));
                    if let Some(rule) = para.properties.spacing_line_rule {
                        let rule_str = match rule {
                            LineSpacingRule::Auto => "auto",
                            LineSpacingRule::Exact => "exact",
                            LineSpacingRule::AtLeast => "atLeast",
                        };
                        xml.push_str(&format!(" w:lineRule=\"{}\"", rule_str));
                    }
                }
                xml.push_str("/>");
            } else {
                let mut sp_parts = Vec::new();
                if let Some(sa) = para.properties.spacing_after {
                    sp_parts.push(format!("w:after=\"{}\"", sa));
                }
                if let Some(sl) = para.properties.spacing_line {
                    sp_parts.push(format!("w:line=\"{}\"", sl));
                    if let Some(rule) = para.properties.spacing_line_rule {
                        let rule_str = match rule {
                            LineSpacingRule::Auto => "auto",
                            LineSpacingRule::Exact => "exact",
                            LineSpacingRule::AtLeast => "atLeast",
                        };
                        sp_parts.push(format!("w:lineRule=\"{}\"", rule_str));
                    }
                }
                if !sp_parts.is_empty() {
                    xml.push_str("<w:spacing ");
                    xml.push_str(&sp_parts.join(" "));
                    xml.push_str("/>");
                }
            }
            if para.properties.keep_lines {
                xml.push_str("<w:keepLines/>");
            }
            if para.properties.keep_next {
                xml.push_str("<w:keepNext/>");
            }
            if para.properties.page_break_before {
                xml.push_str("<w:pageBreakBefore/>");
            }
            xml.push_str("</w:pPr>");
        }

        for run in &para.runs {
            xml.push_str(&self.serialize_run(run));
        }

        xml.push_str("</w:p>\n");
        xml
    }

    fn serialize_run(&self, run: &DocxRun) -> String {
        let mut xml = String::from("<w:r>");

        let has_rpr = run.bold
            || run.italic
            || run.underline.is_some()
            || run.strikethrough
            || run.double_strikethrough
            || run.font.is_some()
            || run.font_size.is_some()
            || run.font_size_cs.is_some()
            || run.color.is_some()
            || run.highlight.is_some()
            || run.vertical_alignment.is_some()
            || run.small_caps
            || run.all_caps;

        if has_rpr {
            xml.push_str("<w:rPr>");
            if run.bold {
                xml.push_str("<w:b/>");
            }
            if run.italic {
                xml.push_str("<w:i/>");
            }
            if let Some(ul) = run.underline {
                let val = match ul {
                    UnderlineType::Single => "single",
                    UnderlineType::Double => "double",
                    UnderlineType::Thick => "thick",
                    UnderlineType::Dotted => "dotted",
                    UnderlineType::Dashed => "dashed",
                    UnderlineType::DashDot => "dashDot",
                    UnderlineType::Wave => "wave",
                    UnderlineType::None => "none",
                };
                xml.push_str(&format!("<w:u w:val=\"{}\"/>", val));
            }
            if run.strikethrough {
                xml.push_str("<w:strike/>");
            }
            if run.double_strikethrough {
                xml.push_str("<w:dstrike/>");
            }
            if let Some(ref font) = run.font {
                xml.push_str("<w:rFonts w:ascii=\"");
                xml.push_str(&escape_xml(font));
                xml.push_str("\" w:hAnsi=\"");
                xml.push_str(&escape_xml(font));
                xml.push_str("\"/>");
            }
            if let Some(size) = run.font_size {
                xml.push_str(&format!("<w:sz w:val=\"{}\"/>", size));
            }
            if let Some(size_cs) = run.font_size_cs {
                xml.push_str(&format!("<w:szCs w:val=\"{}\"/>", size_cs));
            }
            if let Some(ref color) = run.color {
                xml.push_str("<w:color w:val=\"");
                xml.push_str(color);
                xml.push_str("\"/>");
            }
            if let Some(ref highlight) = run.highlight {
                xml.push_str("<w:highlight w:val=\"");
                xml.push_str(highlight);
                xml.push_str("\"/>");
            }
            if let Some(va) = run.vertical_alignment {
                let val = match va {
                    VerticalAlignment::Baseline => "baseline",
                    VerticalAlignment::Superscript => "superscript",
                    VerticalAlignment::Subscript => "subscript",
                };
                xml.push_str(&format!("<w:vertAlign w:val=\"{}\"/>", val));
            }
            if run.small_caps {
                xml.push_str("<w:smallCaps/>");
            }
            if run.all_caps {
                xml.push_str("<w:caps/>");
            }
            xml.push_str("</w:rPr>");
        }

        if !run.text.is_empty() {
            xml.push_str("<w:t xml:space=\"preserve\">");
            xml.push_str(&escape_xml(&run.text));
            xml.push_str("</w:t>");
        }

        xml.push_str("</w:r>");
        xml
    }

    fn serialize_table(&self, table: &DocxTable) -> String {
        let mut xml = String::from("    <w:tbl>");

        // Table properties
        let has_props = table.properties.width.is_some()
            || table.properties.indent.is_some()
            || table.properties.alignment.is_some()
            || table.properties.borders.is_some();

        if has_props {
            xml.push_str("<w:tblPr>");
            if let Some(width) = table.properties.width {
                xml.push_str(&format!("<w:tblW w:w=\"{}\" w:type=\"dxa\"/>", width));
            }
            if let Some(indent) = table.properties.indent {
                xml.push_str(&format!("<w:tblInd w:w=\"{}\" w:type=\"dxa\"/>", indent));
            }
            if let Some(align) = table.properties.alignment {
                let val = match align {
                    TextAlignment::Left => "left",
                    TextAlignment::Center => "center",
                    TextAlignment::Right => "right",
                    TextAlignment::Both => "both",
                };
                xml.push_str(&format!("<w:jc w:val=\"{}\"/>", val));
            }
            if let Some(ref borders) = table.properties.borders {
                xml.push_str("<w:tblBorders>");
                if let Some(ref b) = borders.top {
                    xml.push_str(&self.serialize_border("top", b));
                }
                if let Some(ref b) = borders.left {
                    xml.push_str(&self.serialize_border("left", b));
                }
                if let Some(ref b) = borders.bottom {
                    xml.push_str(&self.serialize_border("bottom", b));
                }
                if let Some(ref b) = borders.right {
                    xml.push_str(&self.serialize_border("right", b));
                }
                if let Some(ref b) = borders.inside_h {
                    xml.push_str(&self.serialize_border("insideH", b));
                }
                if let Some(ref b) = borders.inside_v {
                    xml.push_str(&self.serialize_border("insideV", b));
                }
                xml.push_str("</w:tblBorders>");
            }
            xml.push_str("</w:tblPr>");
        }

        for row in &table.rows {
            xml.push_str(&self.serialize_table_row(row));
        }

        xml.push_str("</w:tbl>\n");
        xml
    }

    fn serialize_table_row(&self, row: &DocxTableRow) -> String {
        let mut xml = String::from("      <w:tr>");
        if let Some(height) = row.height {
            xml.push_str(&format!(
                "<w:trPr><w:trHeight w:val=\"{}\" w:hRule=\"atLeast\"/></w:trPr>",
                height
            ));
        }
        for cell in &row.cells {
            xml.push_str(&self.serialize_table_cell(cell));
        }
        xml.push_str("</w:tr>\n");
        xml
    }

    fn serialize_table_cell(&self, cell: &DocxTableCell) -> String {
        let mut xml = String::from("        <w:tc>");
        // Cell properties
        let has_props = cell.column_span != 1
            || cell.row_span != 1
            || cell.width.is_some()
            || cell.shading.is_some();
        if has_props {
            xml.push_str("<w:tcPr>");
            if cell.column_span != 1 {
                xml.push_str(&format!("<w:gridSpan w:val=\"{}\"/>", cell.column_span));
            }
            if cell.row_span != 1 {
                xml.push_str(&format!(
                    "<w:vMerge w:val=\"restart\" w:rowSpan=\"{}\"/>",
                    cell.row_span
                ));
            }
            if let Some(width) = cell.width {
                xml.push_str(&format!("<w:tcW w:w=\"{}\" w:type=\"dxa\"/>", width));
            }
            if let Some(ref shading) = cell.shading {
                xml.push_str(&format!("<w:shd w:fill=\"{}\"/>", shading));
            }
            xml.push_str("</w:tcPr>");
        }
        for para in &cell.paragraphs {
            xml.push_str(&self.serialize_paragraph(para));
        }
        xml.push_str("</w:tc>");
        xml
    }

    fn serialize_border(&self, name: &str, border: &DocxBorder) -> String {
        let mut xml = format!("<w:{} w:val=\"{}\"", name, border.style);
        if let Some(size) = border.size {
            xml.push_str(&format!(" w:sz=\"{}\"", size));
        }
        if let Some(ref color) = border.color {
            xml.push_str(&format!(" w:color=\"{}\"", color));
        }
        if let Some(space) = border.space {
            xml.push_str(&format!(" w:space=\"{}\"", space));
        }
        xml.push_str("/>");
        xml
    }

    fn build_styles_xml(&self) -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="SimSun" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="200" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="SimSun" w:cs="Times New Roman"/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="480" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="36"/>
    </w:rPr>
  </w:style>
</w:styles>"#
            .to_string()
    }

    fn build_core_properties(&self, props: &CoreProperties) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:dcmitype="http://purl.org/dc/dcmitype/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">"#,
        );

        if let Some(ref title) = props.title {
            xml.push_str("<dc:title>");
            xml.push_str(&escape_xml(title));
            xml.push_str("</dc:title>");
        }
        if let Some(ref creator) = props.creator {
            xml.push_str("<dc:creator>");
            xml.push_str(&escape_xml(creator));
            xml.push_str("</dc:creator>");
        }
        if let Some(ref subject) = props.subject {
            xml.push_str("<dc:subject>");
            xml.push_str(&escape_xml(subject));
            xml.push_str("</dc:subject>");
        }
        if let Some(ref desc) = props.description {
            xml.push_str("<dc:description>");
            xml.push_str(&escape_xml(desc));
            xml.push_str("</dc:description>");
        }
        if let Some(ref keywords) = props.keywords {
            xml.push_str("<cp:keywords>");
            xml.push_str(&escape_xml(keywords));
            xml.push_str("</cp:keywords>");
        }
        if let Some(ref lang) = props.language {
            xml.push_str("<dc:language>");
            xml.push_str(&escape_xml(lang));
            xml.push_str("</dc:language>");
        }
        if let Some(ref last_mod) = props.last_modified_by {
            xml.push_str("<cp:lastModifiedBy>");
            xml.push_str(&escape_xml(last_mod));
            xml.push_str("</cp:lastModifiedBy>");
        }
        if let Some(ref created) = props.created {
            xml.push_str("<dcterms:created xsi:type=\"dcterms:W3CDTF\">");
            xml.push_str(&escape_xml(created));
            xml.push_str("</dcterms:created>");
        }
        if let Some(ref modified) = props.modified {
            xml.push_str("<dcterms:modified xsi:type=\"dcterms:W3CDTF\">");
            xml.push_str(&escape_xml(modified));
            xml.push_str("</dcterms:modified>");
        }
        if let Some(ref category) = props.category {
            xml.push_str("<cp:category>");
            xml.push_str(&escape_xml(category));
            xml.push_str("</cp:category>");
        }
        if let Some(ref revision) = props.revision {
            xml.push_str("<cp:revision>");
            xml.push_str(&escape_xml(revision));
            xml.push_str("</cp:revision>");
        }

        xml.push_str("</cp:coreProperties>");
        xml
    }

    fn build_theme_xml(&self, theme: &Theme) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         name=""#,
        );
        xml.push_str(&escape_xml(&theme.name));
        xml.push_str("\">\n  <a:themeElements>");

        xml.push_str(&format!(
            r#"
    <a:clrScheme name="{}">"#,
            escape_xml(&theme.color_scheme.name)
        ));
        for tc in &theme.color_scheme.colors {
            xml.push_str(&format!(
                r#"
      <a:{}><a:srgbClr val="{}"/></a:{}>"#,
                escape_xml(&tc.name),
                escape_xml(&tc.color),
                escape_xml(&tc.name),
            ));
        }
        xml.push_str("\n    </a:clrScheme>");

        // Font scheme
        xml.push_str(&format!(
            r#"
    <a:fontScheme name="{}">"#,
            escape_xml(&theme.font_scheme.name)
        ));
        xml.push_str(&self.build_theme_font_xml("majorFont", &theme.font_scheme.major_font));
        xml.push_str(&self.build_theme_font_xml("minorFont", &theme.font_scheme.minor_font));
        xml.push_str("\n    </a:fontScheme>");

        // Format scheme (placeholder)
        xml.push_str(
            r#"
    <a:fmtScheme name="none">
      <a:fillStyleLst>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>"#,
        );

        xml.push_str("\n  </a:themeElements>\n</a:theme>");
        xml
    }

    fn build_theme_font_xml(&self, slot: &str, font: &ThemeFont) -> String {
        let mut xml = String::new();
        xml.push_str(&format!("\n      <a:{}>", slot));
        if let Some(ref latin) = font.latin {
            xml.push_str(&format!(
                r#"
        <a:latin typeface="{}"/>"#,
                escape_xml(latin)
            ));
        }
        if let Some(ref ea) = font.east_asian {
            xml.push_str(&format!(
                r#"
        <a:ea typeface="{}"/>"#,
                escape_xml(ea)
            ));
        }
        if let Some(ref cs) = font.complex_script {
            xml.push_str(&format!(
                r#"
        <a:cs typeface="{}"/>"#,
                escape_xml(cs)
            ));
        }
        xml.push_str(&format!("\n      </a:{}>", slot));
        xml
    }

    fn build_slide_master_xml(&self, _master: &SlideMaster) -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sldMaster>"#
            .to_string()
    }

    // --- XLSX helpers ---

    fn build_xlsx_content_types(&self, wb: &XlsxWorkbook) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>"#,
        );
        for i in 1..=wb.sheets.len() {
            xml.push_str(&format!(
                r#"
  <Override PartName="/xl/worksheets/sheet{}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#,
                i
            ));
        }
        if !wb.shared_strings.is_empty() {
            xml.push_str(r#"
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>"#);
        }
        xml.push_str("\n</Types>");
        xml
    }

    fn build_xlsx_root_rels(&self) -> String {
        String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#,
        )
    }

    fn build_xlsx_workbook_xml(&self, wb: &XlsxWorkbook) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#,
        );

        // workbookPr
        xml.push_str(
            r#"
  <workbookPr date1904=""#,
        );
        xml.push_str(if wb.properties.date_1904 { "1" } else { "0" });
        xml.push_str("\"/>");

        // bookViews
        xml.push_str(
            r#"
  <bookViews>
    <workbookView "#,
        );
        if let Some(ref view) = wb.properties.view {
            xml.push_str(&format!(r#"view="{}" "#, escape_xml(view)));
        }
        if let Some(tab) = wb.properties.active_tab {
            xml.push_str(&format!(r#"activeTab="{}" "#, tab));
        }
        xml.push_str(
            r#"xWindow="0" yWindow="0" windowWidth="19200" windowHeight="12480"/>
    </workbookView>
  </bookViews>"#,
        );

        // sheets
        xml.push_str(
            r#"
  <sheets>"#,
        );
        for (i, sheet) in wb.sheets.iter().enumerate() {
            let state_attr = match sheet.state {
                SheetState::Visible => String::new(),
                SheetState::Hidden => r#" state="hidden""#.to_string(),
                SheetState::VeryHidden => r#" state="veryHidden""#.to_string(),
            };
            xml.push_str(&format!(
                r#"
    <sheet name="{}" sheetId="{}" r:id="rId{}"{} />"#,
                escape_xml(&sheet.name),
                sheet.sheet_id,
                i + 1,
                state_attr,
            ));
        }
        xml.push_str(
            r#"
  </sheets>"#,
        );

        // definedNames
        if !wb.defined_names.is_empty() {
            xml.push_str(
                r#"
  <definedNames>"#,
            );
            for dn in &wb.defined_names {
                xml.push_str(&format!(
                    r#"
    <definedName name="{}""#,
                    escape_xml(&dn.name),
                ));
                if let Some(ref comment) = dn.comment {
                    xml.push_str(&format!(r#" comment="{}""#, escape_xml(comment)));
                }
                xml.push_str(&format!(r#">{}</definedName>"#, escape_xml(&dn.ref_range)));
            }
            xml.push_str(
                r#"
  </definedNames>"#,
            );
        }

        xml.push_str("\n</workbook>");
        xml
    }

    fn build_xlsx_workbook_rels(&self, wb: &XlsxWorkbook) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
        );
        let mut rel_id = 1u32;
        for i in 1..=wb.sheets.len() {
            xml.push_str(&format!(
                r#"
  <Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{}.xml"/>"#,
                rel_id, i,
            ));
            rel_id += 1;
        }
        if !wb.shared_strings.is_empty() {
            xml.push_str(&format!(
                r#"
  <Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>"#,
                rel_id,
            ));
            rel_id += 1;
        }
        xml.push_str(&format!(
            r#"
  <Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>"#,
            rel_id,
        ));
        rel_id += 1;
        xml.push_str(&format!(
            r#"
  <Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>"#,
            rel_id,
        ));
        xml.push_str("\n</Relationships>");
        xml
    }

    fn build_xlsx_sheet_xml(&self, sheet: &XlsxSheet) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#,
        );

        // sheetPr
        let has_sheet_pr = sheet.properties.tab_color.is_some()
            || sheet.properties.outline_level.is_some()
            || sheet.properties.zoom_scale.is_some()
            || sheet.properties.zoom_scale_normal.is_some()
            || sheet.properties.zoom_scale_page_layout_view.is_some()
            || sheet.properties.workbook_view_id.is_some();
        if has_sheet_pr {
            xml.push_str(
                r#"
  <sheetPr>"#,
            );
            if let Some(ref color) = sheet.properties.tab_color {
                xml.push_str(&format!(r#"<tabColor rgb="{}"/>"#, escape_xml(color)));
            }
            if let Some(level) = sheet.properties.outline_level {
                xml.push_str(&format!(r#"<outlinePr summaryBelow="{}"/>"#, level));
            }
            // pageSetUpPr / zoom is expressed via sheetViews, handle via sheetViews below
            xml.push_str(
                r#"
  </sheetPr>"#,
            );
        }

        // sheetViews
        xml.push_str(
            r#"
  <sheetViews>
    <sheetView workbookViewId="0""#,
        );
        if let Some(zoom) = sheet.properties.zoom_scale {
            xml.push_str(&format!(r#" zoomScale="{}""#, zoom));
        }
        if let Some(zoom_normal) = sheet.properties.zoom_scale_normal {
            xml.push_str(&format!(r#" zoomScaleNormal="{}""#, zoom_normal));
        }
        if let Some(zoom_page) = sheet.properties.zoom_scale_page_layout_view {
            xml.push_str(&format!(r#" zoomScalePageLayoutView="{}""#, zoom_page));
        }
        xml.push_str(
            r#" tabSelected="0">
    </sheetView>
  </sheetViews>"#,
        );

        // cols
        if !sheet.cols.is_empty() {
            xml.push_str(
                r#"
  <cols>"#,
            );
            for col in &sheet.cols {
                xml.push_str(&format!(
                    r#"
    <col min="{}" max="{}""#,
                    col.min, col.max,
                ));
                if let Some(w) = col.width {
                    xml.push_str(&format!(r#" width="{}""#, w));
                }
                if col.custom_width {
                    xml.push_str(r#" customWidth="1""#);
                }
                if col.hidden {
                    xml.push_str(r#" hidden="1""#);
                }
                if col.best_fit {
                    xml.push_str(r#" bestFit="1""#);
                }
                if let Some(s) = col.style {
                    xml.push_str(&format!(r#" style="{}""#, s));
                }
                xml.push_str("/>");
            }
            xml.push_str(
                r#"
  </cols>"#,
            );
        }

        // sheetData
        xml.push_str(
            r#"
  <sheetData>"#,
        );
        for row in &sheet.rows {
            xml.push_str(&format!(
                r#"
    <row r="{}""#,
                row.r,
            ));
            if let Some(ht) = row.ht {
                xml.push_str(&format!(r#" ht="{}" customHeight="1""#, ht));
            }
            if row.hidden {
                xml.push_str(r#" hidden="1""#);
            }
            if let Some(span) = &row.spans {
                xml.push_str(&format!(r#" spans="{}""#, span));
            }
            if let Some(s) = row.s {
                xml.push_str(&format!(r#" s="{}" customFormat="1""#, s));
            }
            xml.push('>');
            for cell in &row.cells {
                xml.push_str(&format!(
                    r#"
      <c r="{}""#,
                    cell.r,
                ));
                // Cell type attribute
                let type_attr = match cell.t {
                    CellType::S => "t=\"s\"",
                    CellType::Str => "t=\"str\"",
                    CellType::B => "t=\"b\"",
                    CellType::E => "t=\"e\"",
                    CellType::D => "t=\"d\"",
                    CellType::InlineStr => "t=\"inlineStr\"",
                    CellType::N => "",
                };
                if !type_attr.is_empty() {
                    xml.push_str(&format!(" {}", type_attr));
                }
                if let Some(s) = cell.s {
                    xml.push_str(&format!(r#" s="{}""#, s));
                }

                // Formula
                if let Some(ref f) = cell.f {
                    xml.push_str(&format!(
                        r#">
        <f>{}</f>"#,
                        escape_xml(f)
                    ));
                } else {
                    xml.push('>');
                }

                // Value
                match cell.t {
                    CellType::InlineStr => {
                        xml.push_str(&format!(
                            r#"
        <is><t xml:space="preserve">{}</t></is>"#,
                            escape_xml(&cell.v)
                        ));
                    }
                    _ => {
                        xml.push_str(&format!(
                            r#"
        <v>{}</v>"#,
                            escape_xml(&cell.v)
                        ));
                    }
                }

                xml.push_str(
                    r#"
      </c>"#,
                );
            }
            xml.push_str(
                r#"
    </row>"#,
            );
        }
        xml.push_str(
            r#"
  </sheetData>"#,
        );

        // mergeCells
        if !sheet.merges.is_empty() {
            xml.push_str(&format!(
                r#"
  <mergeCells count="{}">"#,
                sheet.merges.len(),
            ));
            for m in &sheet.merges {
                xml.push_str(&format!(
                    r#"
    <mergeCell ref="{}"/>"#,
                    escape_xml(&m.ref_range),
                ));
            }
            xml.push_str(
                r#"
  </mergeCells>"#,
            );
        }

        xml.push_str("\n</worksheet>");
        xml
    }

    fn build_xlsx_shared_strings(&self, strings: &[String]) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
     count=""#,
        );
        xml.push_str(&strings.len().to_string());
        xml.push_str("\" uniqueCount=\"");
        xml.push_str(&strings.len().to_string());
        xml.push_str("\">");

        for s in strings {
            xml.push_str(&format!(
                r#"
  <si>
    <t xml:space="preserve">{}</t>
  </si>"#,
                escape_xml(s),
            ));
        }

        xml.push_str("\n</sst>");
        xml
    }

    fn build_xlsx_styles_xml(&self, styles: &XlsxStyles) -> String {
        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">"#,
        );

        // numFmts
        if !styles.num_fmts.is_empty() {
            xml.push_str(&format!(
                r#"
  <numFmts count="{}">"#,
                styles.num_fmts.len(),
            ));
            for nf in &styles.num_fmts {
                xml.push_str(&format!(
                    r#"
    <numFmt numFmtId="{}" formatCode="{}"/>"#,
                    nf.num_fmt_id,
                    escape_xml(&nf.format_code),
                ));
            }
            xml.push_str(
                r#"
  </numFmts>"#,
            );
        }

        // fonts
        if !styles.fonts.is_empty() {
            xml.push_str(&format!(
                r#"
  <fonts count="{}">"#,
                styles.fonts.len(),
            ));
            for font in &styles.fonts {
                xml.push_str(
                    r#"
    <font>"#,
                );
                if let Some(ref name) = font.name {
                    xml.push_str(&format!(
                        r#"
      <name val="{}"/>"#,
                        escape_xml(name)
                    ));
                }
                if let Some(sz) = font.sz {
                    xml.push_str(&format!(
                        r#"
      <sz val="{}"/>"#,
                        sz
                    ));
                }
                if font.b {
                    xml.push_str(
                        r#"
      <b/>"#,
                    );
                }
                if font.i {
                    xml.push_str(
                        r#"
      <i/>"#,
                    );
                }
                if font.strike {
                    xml.push_str(
                        r#"
      <strike/>"#,
                    );
                }
                if let Some(ref u) = font.u {
                    xml.push_str(&format!(
                        r#"
      <u val="{}"/>"#,
                        escape_xml(u)
                    ));
                }
                if let Some(ref color) = font.color {
                    xml.push_str(&format!(
                        r#"
      <color rgb="{}"/>"#,
                        escape_xml(color)
                    ));
                }
                xml.push_str(
                    r#"
    </font>"#,
                );
            }
            xml.push_str(
                r#"
  </fonts>"#,
            );
        } else {
            // Default font (always required)
            xml.push_str(
                r#"
  <fonts count="1">
    <font>
      <sz val="11"/>
      <name val="Calibri"/>
    </font>
  </fonts>"#,
            );
        }

        // fills
        if !styles.fills.is_empty() {
            xml.push_str(&format!(
                r#"
  <fills count="{}">"#,
                styles.fills.len(),
            ));
            for fill in &styles.fills {
                xml.push_str(
                    r#"
    <fill>"#,
                );
                if let Some(ref pt) = fill.pattern_type {
                    xml.push_str(&format!(
                        r#"
      <patternFill patternType="{}""#,
                        escape_xml(pt)
                    ));
                    if let Some(ref fg) = fill.fg_color {
                        xml.push_str(&format!(r#" fgColor="{}""#, escape_xml(fg)));
                    }
                    if let Some(ref bg) = fill.bg_color {
                        xml.push_str(&format!(r#" bgColor="{}""#, escape_xml(bg)));
                    }
                    xml.push_str(r#"/>"#);
                } else {
                    xml.push_str(
                        r#"
      <patternFill patternType="none"/>"#,
                    );
                }
                xml.push_str(
                    r#"
    </fill>"#,
                );
            }
            xml.push_str(
                r#"
  </fills>"#,
            );
        } else {
            // Default fills (always required - gray125 and none)
            xml.push_str(
                r#"
  <fills count="2">
    <fill>
      <patternFill patternType="none"/>
    </fill>
    <fill>
      <patternFill patternType="gray125"/>
    </fill>
  </fills>"#,
            );
        }

        // borders
        if !styles.borders.is_empty() {
            xml.push_str(&format!(
                r#"
  <borders count="{}">"#,
                styles.borders.len(),
            ));
            for border in &styles.borders {
                xml.push_str(
                    r#"
    <border>"#,
                );
                self.push_border_side(&mut xml, "left", &border.left);
                self.push_border_side(&mut xml, "right", &border.right);
                self.push_border_side(&mut xml, "top", &border.top);
                self.push_border_side(&mut xml, "bottom", &border.bottom);
                self.push_border_side(&mut xml, "diagonal", &border.diagonal);
                xml.push_str(
                    r#"
    </border>"#,
                );
            }
            xml.push_str(
                r#"
  </borders>"#,
            );
        } else {
            // Default border (always required)
            xml.push_str(
                r#"
  <borders count="1">
    <border>
      <left/>
      <right/>
      <top/>
      <bottom/>
      <diagonal/>
    </border>
  </borders>"#,
            );
        }

        // cellStyleXfs
        if !styles.cell_style_xfs.is_empty() {
            xml.push_str(&format!(
                r#"
  <cellStyleXfs count="{}">"#,
                styles.cell_style_xfs.len(),
            ));
            for xf in &styles.cell_style_xfs {
                xml.push_str(
                    r#"
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0""#,
                );
                if xf.apply_number_format {
                    xml.push_str(r#" applyNumberFormat="1""#);
                }
                if xf.apply_font {
                    xml.push_str(r#" applyFont="1""#);
                }
                if xf.apply_fill {
                    xml.push_str(r#" applyFill="1""#);
                }
                if xf.apply_border {
                    xml.push_str(r#" applyBorder="1""#);
                }
                if xf.apply_alignment {
                    xml.push_str(r#" applyAlignment="1""#);
                }
                if xf.apply_protection {
                    xml.push_str(r#" applyProtection="1""#);
                }
                xml.push_str(r#"/>"#);
            }
            xml.push_str(
                r#"
  </cellStyleXfs>"#,
            );
        }

        // cellXfs
        if !styles.cell_xfs.is_empty() {
            xml.push_str(&format!(
                r#"
  <cellXfs count="{}">"#,
                styles.cell_xfs.len(),
            ));
            for xf in &styles.cell_xfs {
                xml.push_str(&format!(
                    r#"
    <xf numFmtId="{}" fontId="{}" fillId="{}" borderId="{}""#,
                    xf.num_fmt_id.unwrap_or(0),
                    xf.font_id.unwrap_or(0),
                    xf.fill_id.unwrap_or(0),
                    xf.border_id.unwrap_or(0),
                ));
                if xf.num_fmt_id.is_some() {
                    xml.push_str(r#" applyNumberFormat="1""#);
                }
                if xf.font_id.is_some() {
                    xml.push_str(r#" applyFont="1""#);
                }
                if xf.fill_id.is_some() {
                    xml.push_str(r#" applyFill="1""#);
                }
                if xf.border_id.is_some() {
                    xml.push_str(r#" applyBorder="1""#);
                }
                if xf.alignment.is_some() {
                    xml.push_str(r#" applyAlignment="1""#);
                }
                if xf.protection.is_some() {
                    xml.push_str(r#" applyProtection="1""#);
                }
                xml.push('>');

                // Alignment
                if let Some(ref align) = xf.alignment {
                    xml.push_str(
                        r#"
      <alignment"#,
                    );
                    if let Some(ref h) = align.horizontal {
                        xml.push_str(&format!(r#" horizontal="{}""#, escape_xml(h)));
                    }
                    if let Some(ref v) = align.vertical {
                        xml.push_str(&format!(r#" vertical="{}""#, escape_xml(v)));
                    }
                    if let Some(rot) = align.text_rotation {
                        xml.push_str(&format!(r#" textRotation="{}""#, rot));
                    }
                    if align.wrap_text {
                        xml.push_str(r#" wrapText="1""#);
                    }
                    if let Some(ind) = align.indent {
                        xml.push_str(&format!(r#" indent="{}""#, ind));
                    }
                    if align.shrink_to_fit {
                        xml.push_str(r#" shrinkToFit="1""#);
                    }
                    xml.push_str(r#"/>"#);
                }

                // Protection
                if let Some(ref prot) = xf.protection {
                    xml.push_str(&format!(
                        r#"
      <protection locked="{}" hidden="{}"/>"#,
                        if prot.locked { "1" } else { "0" },
                        if prot.hidden { "1" } else { "0" },
                    ));
                }

                xml.push_str(
                    r#"
    </xf>"#,
                );
            }
            xml.push_str(
                r#"
  </cellXfs>"#,
            );
        }

        xml.push_str("\n</styleSheet>");
        xml
    }

    fn push_border_side(&self, xml: &mut String, name: &str, side: &Option<XlsxBorderSide>) {
        if let Some(ref s) = side {
            xml.push_str(&format!(
                r#"
      <{} style="{}""#,
                name,
                s.style.as_deref().unwrap_or("none"),
            ));
            if let Some(ref color) = s.color {
                xml.push_str(&format!(r#" color="{}""#, escape_xml(color)));
            }
            xml.push_str("/>");
        } else {
            xml.push_str(&format!(
                r#"
      <{}/>"#,
                name,
            ));
        }
    }

    fn build_xlsx_theme_xml(&self) -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>"#
            .to_string()
    }
}

impl Default for OoxmlSerializer {
    fn default() -> Self {
        Self::new()
    }
}

/// Escape special characters for XML text content.
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_minimal_doc() -> OoxmlDocument {
        OoxmlDocument {
            format: OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: vec![],
            main_part: Some("word/document.xml".to_string()),
            shared_strings: vec![],
            part_count: 1,
            core_properties: CoreProperties::default(),
            relationships: vec![],
            xlsx_workbook: None,
            docx_body: Some(DocxBody {
                blocks: vec![DocxBlock::Paragraph(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text: "Hello World".to_string(),
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
                })],
            }),
        }
    }

    fn zip_entry_names(data: &[u8]) -> Vec<String> {
        let cursor = std::io::Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        (0..archive.len())
            .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
            .collect()
    }

    fn read_zip_entry(data: &[u8], name: &str) -> String {
        let cursor = std::io::Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut file = archive.by_name(name).unwrap();
        let mut contents = String::new();
        std::io::Read::read_to_string(&mut file, &mut contents).unwrap();
        contents
    }

    #[test]
    fn test_serialize_minimal_document() {
        let doc = make_minimal_doc();
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();

        // Verify it's a valid ZIP
        assert!(bytes.len() > 4);
        assert_eq!(bytes[0], 0x50); // PK header
        assert_eq!(bytes[1], 0x4B);

        // Check required entries
        let entries = zip_entry_names(&bytes);
        assert!(entries.contains(&"[Content_Types].xml".to_string()));
        assert!(entries.contains(&"_rels/.rels".to_string()));
        assert!(entries.contains(&"word/document.xml".to_string()));
        assert!(entries.contains(&"word/_rels/document.xml.rels".to_string()));
        assert!(entries.contains(&"word/styles.xml".to_string()));
        assert!(entries.contains(&"docProps/core.xml".to_string()));

        // Verify document content
        let doc_xml = read_zip_entry(&bytes, "word/document.xml");
        assert!(doc_xml.contains("Hello World"));
        assert!(doc_xml.contains("<w:p>"));
        assert!(doc_xml.contains("<w:r>"));
        assert!(doc_xml.contains("<w:t"));
    }

    #[test]
    fn test_serialize_formatted_paragraph() {
        let doc = OoxmlDocument {
            format: OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: vec![],
            main_part: Some("word/document.xml".to_string()),
            shared_strings: vec![],
            part_count: 1,
            core_properties: CoreProperties::default(),
            relationships: vec![],
            xlsx_workbook: None,
            docx_body: Some(DocxBody {
                blocks: vec![DocxBlock::Paragraph(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![
                        DocxRun {
                            text: "Bold".to_string(),
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
                        },
                        DocxRun {
                            text: "Italic".to_string(),
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
                        },
                        DocxRun {
                            text: "Underline".to_string(),
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
                        },
                    ],
                })],
            }),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();
        let doc_xml = read_zip_entry(&bytes, "word/document.xml");

        assert!(doc_xml.contains("<w:b/>"));
        assert!(doc_xml.contains("<w:i/>"));
        assert!(doc_xml.contains("<w:u w:val=\"single\"/>"));
        assert!(doc_xml.contains("Bold"));
        assert!(doc_xml.contains("Italic"));
        assert!(doc_xml.contains("Underline"));
    }

    #[test]
    fn test_serialize_multiple_paragraphs() {
        let doc = OoxmlDocument {
            format: OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: vec![],
            main_part: Some("word/document.xml".to_string()),
            shared_strings: vec![],
            part_count: 1,
            core_properties: CoreProperties::default(),
            relationships: vec![],
            xlsx_workbook: None,
            docx_body: Some(DocxBody {
                blocks: vec![
                    DocxBlock::Paragraph(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties::default(),
                        runs: vec![DocxRun {
                            text: "First".to_string(),
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
                    }),
                    DocxBlock::Paragraph(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties {
                            alignment: Some(TextAlignment::Center),
                            ..Default::default()
                        },
                        runs: vec![DocxRun {
                            text: "Second".to_string(),
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
                    }),
                    DocxBlock::Paragraph(DocxParagraph {
                        style_id: None,
                        properties: DocxParagraphProperties {
                            alignment: Some(TextAlignment::Right),
                            ..Default::default()
                        },
                        runs: vec![DocxRun {
                            text: "Third".to_string(),
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
                    }),
                ],
            }),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();
        let doc_xml = read_zip_entry(&bytes, "word/document.xml");

        assert!(doc_xml.contains("First"));
        assert!(doc_xml.contains("Second"));
        assert!(doc_xml.contains("Third"));
        assert!(doc_xml.contains("w:val=\"center\""));
        assert!(doc_xml.contains("w:val=\"right\""));
        // Should have 3 <w:p> elements
        assert_eq!(doc_xml.matches("<w:p>").count(), 3);
    }

    #[test]
    fn test_serialize_with_table() {
        let doc = OoxmlDocument {
            format: OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: vec![],
            main_part: Some("word/document.xml".to_string()),
            shared_strings: vec![],
            part_count: 1,
            core_properties: CoreProperties::default(),
            relationships: vec![],
            xlsx_workbook: None,
            docx_body: Some(DocxBody {
                blocks: vec![DocxBlock::Table(DocxTable {
                    rows: vec![
                        DocxTableRow {
                            cells: vec![
                                DocxTableCell {
                                    paragraphs: vec![DocxParagraph {
                                        style_id: None,
                                        properties: DocxParagraphProperties::default(),
                                        runs: vec![DocxRun {
                                            text: "A1".to_string(),
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
                                    }],
                                    column_span: 1,
                                    row_span: 1,
                                    width: None,
                                    shading: None,
                                },
                                DocxTableCell {
                                    paragraphs: vec![DocxParagraph {
                                        style_id: None,
                                        properties: DocxParagraphProperties::default(),
                                        runs: vec![DocxRun {
                                            text: "B1".to_string(),
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
                                    }],
                                    column_span: 1,
                                    row_span: 1,
                                    width: None,
                                    shading: None,
                                },
                            ],
                            height: None,
                            is_header: true,
                        },
                        DocxTableRow {
                            cells: vec![
                                DocxTableCell {
                                    paragraphs: vec![DocxParagraph {
                                        style_id: None,
                                        properties: DocxParagraphProperties::default(),
                                        runs: vec![DocxRun {
                                            text: "A2".to_string(),
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
                                    column_span: 1,
                                    row_span: 1,
                                    width: None,
                                    shading: None,
                                },
                                DocxTableCell {
                                    paragraphs: vec![DocxParagraph {
                                        style_id: None,
                                        properties: DocxParagraphProperties::default(),
                                        runs: vec![DocxRun {
                                            text: "B2".to_string(),
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
                                    column_span: 1,
                                    row_span: 1,
                                    width: None,
                                    shading: None,
                                },
                            ],
                            height: None,
                            is_header: false,
                        },
                    ],
                    properties: DocxTableProperties::default(),
                })],
            }),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();
        let doc_xml = read_zip_entry(&bytes, "word/document.xml");

        assert!(doc_xml.contains("<w:tbl>"));
        assert!(doc_xml.contains("<w:tr>"));
        assert!(doc_xml.contains("<w:tc>"));
        assert!(doc_xml.contains("A1"));
        assert!(doc_xml.contains("B1"));
        assert!(doc_xml.contains("A2"));
        assert!(doc_xml.contains("B2"));
    }

    #[test]
    fn test_serialize_empty_document() {
        let doc = OoxmlDocument {
            format: OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: vec![],
            main_part: Some("word/document.xml".to_string()),
            shared_strings: vec![],
            part_count: 1,
            core_properties: CoreProperties::default(),
            relationships: vec![],
            docx_body: None,
            xlsx_workbook: None,
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();

        // Should still be a valid ZIP with all required parts
        assert_eq!(bytes[0], 0x50);
        assert_eq!(bytes[1], 0x4B);

        let entries = zip_entry_names(&bytes);
        assert!(entries.contains(&"[Content_Types].xml".to_string()));
        assert!(entries.contains(&"word/document.xml".to_string()));

        // Document should have an empty body
        let doc_xml = read_zip_entry(&bytes, "word/document.xml");
        assert!(doc_xml.contains("<w:body>"));
        assert!(doc_xml.contains("<w:document"));
    }

    #[test]
    fn test_roundtrip_through_zip() {
        let doc = make_minimal_doc();
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();

        // Verify the output can be read back as a ZIP and parsed by OoxmlParser
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        assert!(archive.by_name("[Content_Types].xml").is_ok());
        assert!(archive.by_name("word/document.xml").is_ok());

        // Read document.xml and verify it's valid XML with expected content
        let mut doc_file = archive.by_name("word/document.xml").unwrap();
        let mut doc_content = String::new();
        std::io::Read::read_to_string(&mut doc_file, &mut doc_content).unwrap();
        assert!(doc_content.contains("Hello World"));
        assert!(doc_content.contains("xmlns:w="));
    }

    #[test]
    fn test_content_types_present() {
        let doc = make_minimal_doc();
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();

        let ct = read_zip_entry(&bytes, "[Content_Types].xml");
        assert!(ct.contains("application/vnd.openxmlformats-package.relationships+xml"));
        assert!(ct.contains("application/xml"));
        assert!(ct.contains("wordprocessingml.document.main+xml"));
        assert!(ct.contains("wordprocessingml.styles+xml"));
    }

    #[test]
    fn test_rels_present() {
        let doc = make_minimal_doc();
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();

        let rels = read_zip_entry(&bytes, "_rels/.rels");
        assert!(rels.contains("officeDocument"));
        assert!(rels.contains("word/document.xml"));

        let doc_rels = read_zip_entry(&bytes, "word/_rels/document.xml.rels");
        assert!(doc_rels.contains("styles"));
    }

    #[test]
    fn test_escape_xml() {
        assert_eq!(escape_xml("a&b"), "a&amp;b");
        assert_eq!(escape_xml("a<b"), "a&lt;b");
        assert_eq!(escape_xml("a>b"), "a&gt;b");
        assert_eq!(escape_xml("a\"b"), "a&quot;b");
        assert_eq!(escape_xml("a'b"), "a&apos;b");
        assert_eq!(escape_xml("plain"), "plain");
    }

    // --- PPTX serializer tests ---

    fn make_single_slide_presentation() -> PptxPresentation {
        PptxPresentation {
            slide_size: SlideSize::standard(),
            slides: vec![Slide {
                id: 256,
                name: "Slide1".to_string(),
                notes: None,
                layout_id: None,
                master_id: None,
                background: None,
                transition: None,
                animations: vec![],
                timing_raw: None,
                shapes: vec![SlideShape::TextBox(TextBoxShape {
                    id: "2".to_string(),
                    bounds: Bounds {
                        x: 100,
                        y: 100,
                        cx: 5000000,
                        cy: 500000,
                    },
                    text_body: TextBody {
                        paragraphs: vec![DocxParagraph {
                            style_id: None,
                            properties: DocxParagraphProperties::default(),
                            runs: vec![DocxRun {
                                text: "Hello PPTX".to_string(),
                                ..DocxRun::default()
                            }],
                        }],
                    },
                    fill: None,
                    effect: None,
                })],
            }],
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties::default(),
        }
    }

    #[test]
    fn test_serialize_minimal_pptx() {
        let pres = make_single_slide_presentation();
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();

        assert!(bytes.len() > 4);
        assert_eq!(bytes[0], 0x50);
        assert_eq!(bytes[1], 0x4B);

        let entries = zip_entry_names(&bytes);
        assert!(entries.contains(&"[Content_Types].xml".to_string()));
        assert!(entries.contains(&"_rels/.rels".to_string()));
        assert!(entries.contains(&"ppt/presentation.xml".to_string()));
        assert!(entries.contains(&"ppt/_rels/presentation.xml.rels".to_string()));
        assert!(entries.contains(&"ppt/slides/slide1.xml".to_string()));
        assert!(entries.contains(&"docProps/core.xml".to_string()));

        let slide_xml = read_zip_entry(&bytes, "ppt/slides/slide1.xml");
        assert!(slide_xml.contains("Hello PPTX"));
        assert!(slide_xml.contains("<p:sp>"));
        assert!(slide_xml.contains("<p:txBody>"));
        assert!(slide_xml.contains("<a:t>"));
        assert!(slide_xml.contains("<p:sld"));
    }

    #[test]
    fn test_serialize_pptx_multiple_slides() {
        let pres = PptxPresentation {
            slide_size: SlideSize::widescreen(),
            slides: vec![
                Slide {
                    id: 256,
                    name: "Slide1".to_string(),
                    layout_id: None,
                    master_id: None,
                    notes: None,
                    background: None,
                    transition: None,
                    animations: vec![],
                    timing_raw: None,
                    shapes: vec![SlideShape::TextBox(TextBoxShape {
                        id: "2".to_string(),
                        bounds: Bounds {
                            x: 0,
                            y: 0,
                            cx: 9144000,
                            cy: 6858000,
                        },
                        text_body: TextBody {
                            paragraphs: vec![DocxParagraph {
                                style_id: None,
                                properties: DocxParagraphProperties::default(),
                                runs: vec![DocxRun {
                                    text: "Slide One".to_string(),
                                    ..DocxRun::default()
                                }],
                            }],
                        },
                        fill: None,
                        effect: None,
                    })],
                },
                Slide {
                    id: 257,
                    name: "Slide2".to_string(),
                    layout_id: None,
                    master_id: None,
                    notes: None,
                    background: None,
                    transition: None,
                    animations: vec![],
                    timing_raw: None,
                    shapes: vec![SlideShape::TextBox(TextBoxShape {
                        id: "3".to_string(),
                        bounds: Bounds {
                            x: 0,
                            y: 0,
                            cx: 9144000,
                            cy: 6858000,
                        },
                        text_body: TextBody {
                            paragraphs: vec![DocxParagraph {
                                style_id: None,
                                properties: DocxParagraphProperties::default(),
                                runs: vec![DocxRun {
                                    text: "Slide Two".to_string(),
                                    ..DocxRun::default()
                                }],
                            }],
                        },
                        fill: None,
                        effect: None,
                    })],
                },
            ],
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties::default(),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();

        let entries = zip_entry_names(&bytes);
        assert!(entries.contains(&"ppt/slides/slide1.xml".to_string()));
        assert!(entries.contains(&"ppt/slides/slide2.xml".to_string()));

        let slide1 = read_zip_entry(&bytes, "ppt/slides/slide1.xml");
        let slide2 = read_zip_entry(&bytes, "ppt/slides/slide2.xml");
        assert!(slide1.contains("Slide One"));
        assert!(slide2.contains("Slide Two"));

        let pres_xml = read_zip_entry(&bytes, "ppt/presentation.xml");
        assert!(pres_xml.contains("rId1"));
        assert!(pres_xml.contains("rId2"));

        let pres_rels = read_zip_entry(&bytes, "ppt/_rels/presentation.xml.rels");
        assert!(pres_rels.contains("slides/slide1.xml"));
        assert!(pres_rels.contains("slides/slide2.xml"));
    }

    #[test]
    fn test_serialize_pptx_slide_size() {
        // Standard 4:3
        let pres = PptxPresentation {
            slide_size: SlideSize::standard(),
            ..PptxPresentation {
                slides: vec![Slide {
                    id: 256,
                    name: "S1".to_string(),
                    layout_id: None,
                    master_id: None,
                    notes: None,
                    background: None,
                    transition: None,
                    animations: vec![],
                    timing_raw: None,
                    shapes: vec![],
                }],
                slide_masters: Vec::new(),
                theme: None,
                core_properties: CoreProperties::default(),
                slide_size: SlideSize::standard(),
            }
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();
        let pres_xml = read_zip_entry(&bytes, "ppt/presentation.xml");
        assert!(pres_xml.contains("cx=\"9144000\""));
        assert!(pres_xml.contains("cy=\"6858000\""));

        // Widescreen 16:9
        let pres_ws = PptxPresentation {
            slide_size: SlideSize::widescreen(),
            ..PptxPresentation {
                slides: vec![Slide {
                    id: 256,
                    name: "S1".to_string(),
                    layout_id: None,
                    master_id: None,
                    notes: None,
                    background: None,
                    transition: None,
                    animations: vec![],
                    timing_raw: None,
                    shapes: vec![],
                }],
                slide_masters: Vec::new(),
                theme: None,
                core_properties: CoreProperties::default(),
                slide_size: SlideSize::widescreen(),
            }
        };
        let bytes = ser.serialize_pptx(&pres_ws).unwrap();
        let pres_xml = read_zip_entry(&bytes, "ppt/presentation.xml");
        assert!(pres_xml.contains("cx=\"12192000\""));
        assert!(pres_xml.contains("cy=\"6858000\""));
    }

    #[test]
    fn test_serialize_pptx_placeholder() {
        let pres = PptxPresentation {
            slide_size: SlideSize::standard(),
            slides: vec![Slide {
                id: 256,
                name: "Slide1".to_string(),
                notes: None,
                layout_id: None,
                master_id: None,
                background: None,
                transition: None,
                animations: vec![],
                timing_raw: None,
                shapes: vec![SlideShape::Placeholder(PlaceholderShape {
                    id: "3".to_string(),
                    bounds: Bounds {
                        x: 100,
                        y: 100,
                        cx: 5000000,
                        cy: 500000,
                    },
                    placeholder_type: "title".to_string(),
                    text_body: Some(TextBody {
                        paragraphs: vec![DocxParagraph {
                            style_id: None,
                            properties: DocxParagraphProperties::default(),
                            runs: vec![DocxRun {
                                text: "Title Placeholder".to_string(),
                                ..DocxRun::default()
                            }],
                        }],
                    }),
                    fill: None,
                    effect: None,
                })],
            }],
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties::default(),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();
        let slide_xml = read_zip_entry(&bytes, "ppt/slides/slide1.xml");

        assert!(slide_xml.contains("<p:ph type=\"title\"/>"));
        assert!(slide_xml.contains("Title Placeholder"));
        assert!(slide_xml.contains("<a:t>"));
    }

    #[test]
    fn test_serialize_pptx_picture() {
        let pres = PptxPresentation {
            slide_size: SlideSize::standard(),
            slides: vec![Slide {
                id: 256,
                name: "Slide1".to_string(),
                notes: None,
                layout_id: None,
                master_id: None,
                background: None,
                transition: None,
                animations: vec![],
                timing_raw: None,
                shapes: vec![SlideShape::Picture(PictureShape {
                    id: "4".to_string(),
                    bounds: Bounds {
                        x: 500000,
                        y: 500000,
                        cx: 2000000,
                        cy: 1500000,
                    },
                    name: "Photo.png".to_string(),
                    image_extension: "png".to_string(),
                    image_data: vec![],
                    effect: None,
                })],
            }],
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties::default(),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();
        let slide_xml = read_zip_entry(&bytes, "ppt/slides/slide1.xml");

        assert!(slide_xml.contains("<p:pic>"));
        assert!(slide_xml.contains("Photo.png"));
        assert!(slide_xml.contains("<p:blipFill/>"));
    }

    #[test]
    fn test_serialize_pptx_formatted_text() {
        let pres = PptxPresentation {
            slide_size: SlideSize::standard(),
            slides: vec![Slide {
                id: 256,
                name: "Slide1".to_string(),
                notes: None,
                layout_id: None,
                master_id: None,
                background: None,
                transition: None,
                animations: vec![],
                timing_raw: None,
                shapes: vec![SlideShape::TextBox(TextBoxShape {
                    id: "2".to_string(),
                    bounds: Bounds {
                        x: 100,
                        y: 100,
                        cx: 5000000,
                        cy: 500000,
                    },
                    text_body: TextBody {
                        paragraphs: vec![DocxParagraph {
                            style_id: None,
                            properties: DocxParagraphProperties::default(),
                            runs: vec![
                                DocxRun {
                                    text: "Bold ".to_string(),
                                    bold: true,
                                    italic: false,
                                    underline: None,
                                    strikethrough: false,
                                    double_strikethrough: false,
                                    font: Some("Arial".to_string()),
                                    font_size: Some(24),
                                    font_size_cs: None,
                                    color: Some("FF0000".to_string()),
                                    highlight: None,
                                    vertical_alignment: None,
                                    small_caps: false,
                                    all_caps: false,
                                },
                                DocxRun {
                                    text: "Italic".to_string(),
                                    bold: false,
                                    italic: true,
                                    underline: Some(UnderlineType::Single),
                                    ..DocxRun::default()
                                },
                                DocxRun {
                                    text: "Underline ".to_string(),
                                    bold: false,
                                    italic: false,
                                    underline: Some(UnderlineType::Single),
                                    ..DocxRun::default()
                                },
                                DocxRun {
                                    text: "Strikethrough".to_string(),
                                    bold: false,
                                    italic: false,
                                    underline: None,
                                    strikethrough: true,
                                    ..DocxRun::default()
                                },
                                DocxRun {
                                    text: "\n".to_string(),
                                    ..DocxRun::default()
                                },
                                DocxRun {
                                    text: "New line".to_string(),
                                    ..DocxRun::default()
                                },
                            ],
                        }],
                    },
                    fill: None,
                    effect: None,
                })],
            }],
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties::default(),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();
        let slide_xml = read_zip_entry(&bytes, "ppt/slides/slide1.xml");

        assert!(slide_xml.contains("b=\"1\""));
        assert!(slide_xml.contains("i=\"1\""));
        assert!(slide_xml.contains("u=\"sng\""));
        assert!(slide_xml.contains("Arial"));
        assert!(slide_xml.contains("<a:br/>"));
        assert!(slide_xml.contains("Bold"));
        assert!(slide_xml.contains("Italic"));
        assert!(slide_xml.contains("New line"));
    }

    #[test]
    fn test_serialize_pptx_core_properties() {
        let pres = PptxPresentation {
            slide_size: SlideSize::standard(),
            slides: vec![Slide {
                id: 256,
                name: "Slide1".to_string(),
                notes: None,
                layout_id: None,
                master_id: None,
                background: None,
                transition: None,
                animations: vec![],
                timing_raw: None,
                shapes: vec![],
            }],
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties {
                title: Some("PPTX Test".to_string()),
                creator: Some("Author".to_string()),
                subject: Some("Test".to_string()),
                ..CoreProperties::default()
            },
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();
        let core = read_zip_entry(&bytes, "docProps/core.xml");

        assert!(core.contains("PPTX Test"));
        assert!(core.contains("Author"));
        assert!(core.contains("Test"));
    }

    #[test]
    fn test_serialize_pptx_content_types() {
        let pres = make_single_slide_presentation();
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();

        let ct = read_zip_entry(&bytes, "[Content_Types].xml");
        assert!(ct.contains("presentationml.presentation.main+xml"));
        assert!(ct.contains("presentationml.slide+xml"));
        assert!(ct.contains("/ppt/presentation.xml"));
        assert!(ct.contains("/ppt/slides/slide1.xml"));
    }

    #[test]
    fn test_serialize_pptx_transition_and_animation() {
        let pres = PptxPresentation {
            slide_size: SlideSize::standard(),
            slides: vec![Slide {
                id: 256,
                name: "Animated".to_string(),
                layout_id: None,
                master_id: None,
                notes: None,
                background: None,
                transition: Some(SlideTransition {
                    effect: TransitionEffect::Fade,
                    duration: 0.5,
                    advance_mode: AdvanceMode::Timed,
                    advance_timing: 3.0,
                }),
                animations: vec![
                    AnimationData {
                        id: "1".to_string(),
                        effect: "fadeIn".to_string(),
                        category: "entrance".to_string(),
                        target: "2".to_string(),
                        start: "onClick".to_string(),
                        duration: 0.5,
                        delay: 0.0,
                    },
                    AnimationData {
                        id: "2".to_string(),
                        effect: "flyOut".to_string(),
                        category: "exit".to_string(),
                        target: "2".to_string(),
                        start: "afterPrevious".to_string(),
                        duration: 0.3,
                        delay: 1.0,
                    },
                ],
                timing_raw: None,
                shapes: vec![SlideShape::TextBox(TextBoxShape {
                    id: "2".to_string(),
                    bounds: Bounds {
                        x: 100,
                        y: 100,
                        cx: 5000000,
                        cy: 500000,
                    },
                    text_body: TextBody {
                        paragraphs: vec![DocxParagraph {
                            style_id: None,
                            properties: DocxParagraphProperties::default(),
                            runs: vec![DocxRun {
                                text: "Animated".to_string(),
                                ..DocxRun::default()
                            }],
                        }],
                    },
                    fill: None,
                    effect: None,
                })],
            }],
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties::default(),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();

        let slide_xml = read_zip_entry(&bytes, "ppt/slides/slide1.xml");
        // Must contain transition with fade effect, dur, advClick, advTm
        assert!(slide_xml.contains("<p:transition"));
        assert!(slide_xml.contains("dur=\"500\""));
        // advClick="0" because advance_mode is Timed
        assert!(slide_xml.contains("advClick=\"0\""));
        assert!(slide_xml.contains("advTm=\"3000\""));
        assert!(slide_xml.contains("<p:fade/>"));

        // Must contain timing with two animations
        assert!(slide_xml.contains("<p:timing>"));
        // First anim: onClick
        assert!(slide_xml.contains(r#"<p:cond evt="onClick" delay="0"/>"#));
        // Second anim: afterPrevious → evt="onBegin" with delay
        assert!(slide_xml.contains(r#"<p:cond evt="onBegin" delay="1000"/>"#));
        assert!(slide_xml.contains(r#"<p:effect ref="2" filter="fadeIn"/>"#));
        assert!(slide_xml.contains(r#"<p:effect ref="2" filter="flyOut"/>"#));
    }

    #[test]
    fn test_serialize_pptx_empty_slide() {
        let pres = PptxPresentation {
            slide_size: SlideSize::standard(),
            slides: vec![Slide {
                id: 256,
                name: "Empty".to_string(),
                notes: None,
                layout_id: None,
                master_id: None,
                background: None,
                transition: None,
                animations: vec![],
                timing_raw: None,
                shapes: vec![],
            }],
            slide_masters: Vec::new(),
            theme: None,
            core_properties: CoreProperties::default(),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();

        let slide_xml = read_zip_entry(&bytes, "ppt/slides/slide1.xml");
        assert!(slide_xml.contains("<p:spTree>"));
        assert!(slide_xml.contains("</p:spTree>"));
        assert!(slide_xml.contains("<p:sld"));
        assert!(slide_xml.contains("</p:sld>"));
    }

    #[test]
    fn test_serialize_pptx_with_theme() {
        let theme = Theme {
            name: "Office Theme".to_string(),
            color_scheme: ColorScheme {
                name: "Default".to_string(),
                colors: vec![
                    ThemeColor {
                        name: "dark1".to_string(),
                        color: "000000".to_string(),
                    },
                    ThemeColor {
                        name: "light1".to_string(),
                        color: "FFFFFF".to_string(),
                    },
                    ThemeColor {
                        name: "dark2".to_string(),
                        color: "44546A".to_string(),
                    },
                    ThemeColor {
                        name: "light2".to_string(),
                        color: "E7E6E6".to_string(),
                    },
                    ThemeColor {
                        name: "accent1".to_string(),
                        color: "4472C4".to_string(),
                    },
                    ThemeColor {
                        name: "accent2".to_string(),
                        color: "ED7D31".to_string(),
                    },
                    ThemeColor {
                        name: "accent3".to_string(),
                        color: "A5A5A5".to_string(),
                    },
                    ThemeColor {
                        name: "accent4".to_string(),
                        color: "FFC000".to_string(),
                    },
                    ThemeColor {
                        name: "accent5".to_string(),
                        color: "5B9BD5".to_string(),
                    },
                    ThemeColor {
                        name: "accent6".to_string(),
                        color: "70AD47".to_string(),
                    },
                    ThemeColor {
                        name: "hlink".to_string(),
                        color: "0563C1".to_string(),
                    },
                    ThemeColor {
                        name: "folHlink".to_string(),
                        color: "954F72".to_string(),
                    },
                ],
            },
            font_scheme: FontScheme {
                name: "Default".to_string(),
                major_font: ThemeFont {
                    latin: Some("Calibri Light".to_string()),
                    east_asian: None,
                    complex_script: None,
                },
                minor_font: ThemeFont {
                    latin: Some("Calibri".to_string()),
                    east_asian: None,
                    complex_script: None,
                },
            },
            format_scheme: None,
        };
        let pres = PptxPresentation {
            slide_size: SlideSize::widescreen(),
            slides: vec![Slide {
                id: 256,
                name: "Slide 1".to_string(),
                transition: None,
                animations: vec![],
                timing_raw: None,
                background: None,
                shapes: vec![],
                layout_id: None,
                master_id: None,
                notes: None,
            }],
            slide_masters: Vec::new(),
            theme: Some(theme),
            core_properties: CoreProperties::default(),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize_pptx(&pres).unwrap();

        let entries = zip_entry_names(&bytes);
        assert!(entries.contains(&"ppt/theme/theme1.xml".to_string()));
        let theme_xml = read_zip_entry(&bytes, "ppt/theme/theme1.xml");
        assert!(theme_xml.contains("Office Theme"));
        assert!(theme_xml.contains("clrScheme"));
        assert!(theme_xml.contains("fontScheme"));
        assert!(theme_xml.contains("a:accent1"));
        assert!(theme_xml.contains("4472C4"));
        assert!(theme_xml.contains("Calibri Light"));
    }

    #[test]
    fn test_serialize_with_core_properties() {
        let doc = OoxmlDocument {
            format: OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: vec![],
            main_part: Some("word/document.xml".to_string()),
            shared_strings: vec![],
            part_count: 1,
            core_properties: CoreProperties {
                title: Some("Test Document".to_string()),
                creator: Some("Test Author".to_string()),
                subject: Some("Testing".to_string()),
                description: Some("A test document".to_string()),
                keywords: Some("test docx".to_string()),
                language: Some("en-US".to_string()),
                last_modified_by: Some("Another Author".to_string()),
                created: Some("2026-04-16T00:00:00Z".to_string()),
                modified: Some("2026-04-16T12:00:00Z".to_string()),
                category: Some("test".to_string()),
                revision: Some("1".to_string()),
            },
            relationships: vec![],
            xlsx_workbook: None,
            docx_body: Some(DocxBody {
                blocks: vec![DocxBlock::Paragraph(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text: "Content".to_string(),
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
                })],
            }),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();

        let core = read_zip_entry(&bytes, "docProps/core.xml");
        assert!(core.contains("Test Document"));
        assert!(core.contains("Test Author"));
        assert!(core.contains("Testing"));
        assert!(core.contains("A test document"));
        assert!(core.contains("test docx"));
        assert!(core.contains("en-US"));
        assert!(core.contains("Another Author"));
        assert!(core.contains("2026-04-16"));
        assert!(core.contains("test"));
    }

    #[test]
    fn test_serialize_empty_body() {
        let doc = OoxmlDocument {
            format: OoxmlFormat::Docx,
            version: "1.0".to_string(),
            content_types: vec![],
            main_part: Some("word/document.xml".to_string()),
            shared_strings: vec![],
            part_count: 1,
            core_properties: CoreProperties::default(),
            relationships: vec![],
            xlsx_workbook: None,
            docx_body: Some(DocxBody {
                blocks: vec![],
            }),
        };
        let ser = OoxmlSerializer::new();
        let bytes = ser.serialize(&doc).unwrap();

        let doc_xml = read_zip_entry(&bytes, "word/document.xml");
        assert!(doc_xml.contains("<w:body>"));
        assert!(!doc_xml.contains("<w:p>"));
        assert!(!doc_xml.contains("<w:tbl>"));
    }
}
