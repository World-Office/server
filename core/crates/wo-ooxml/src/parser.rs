//! OOXML format parser.
//!
//! Parses OOXML ZIP archives (DOCX, XLSX, PPTX) by reading:
//! - `[Content_Types].xml` — content type registry
//! - `_rels/.rels` — relationships
//! - `docProps/core.xml` — metadata
//! - Main document part

use std::io::{Cursor, Read};

use roxmltree::Document as XmlDoc;
use wo_common::{CoreError, Document, DocumentMetadata, Result};

use crate::detector::detect_ooxml_format;
use crate::model::*;

/// OOXML parser.
pub struct OoxmlParser;

impl OoxmlParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse OOXML data (ZIP bytes) into an OoxmlDocument.
    pub fn parse(&self, data: &[u8]) -> Result<OoxmlDocument> {
        let cursor = Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid ZIP: {}", e),
        })?;

        // Read [Content_Types].xml
        let ct_xml = self.read_zip_entry(&mut archive, "[Content_Types].xml")?;
        let ct_doc = XmlDoc::parse(&ct_xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid [Content_Types].xml: {}", e),
        })?;

        let format = detect_ooxml_format(&ct_xml);

        // Parse content types
        let content_types = self.parse_content_types(&ct_doc);

        // Detect main part
        let main_part = match format {
            OoxmlFormat::Docx => Some("word/document.xml".to_string()),
            OoxmlFormat::Xlsx => Some("xl/workbook.xml".to_string()),
            OoxmlFormat::Pptx => Some("ppt/presentation.xml".to_string()),
            OoxmlFormat::Unknown => None,
        };

        // Read core properties
        let core_properties = if archive.by_name("docProps/core.xml").is_ok() {
            let core_xml = self.read_zip_entry(&mut archive, "docProps/core.xml")?;
            self.parse_core_properties(&core_xml)?
        } else {
            CoreProperties::default()
        };

        // Count parts
        let (part_count, shared_strings) = match format {
            OoxmlFormat::Xlsx => {
                let count = self.count_worksheets(&mut archive)?;
                let strings = self.extract_shared_strings(&mut archive)?;
                (count, strings)
            }
            OoxmlFormat::Pptx => {
                let count = self.count_slides(&mut archive)?;
                (count, Vec::new())
            }
            _ => (1, Vec::new()),
        };

        // Read relationships
        let relationships = if archive.by_name("_rels/.rels").is_ok() {
            let rels_xml = self.read_zip_entry(&mut archive, "_rels/.rels")?;
            self.parse_relationships(&rels_xml)?
        } else {
            Vec::new()
        };

        // Parse format-specific content
        let docx_body = match format {
            OoxmlFormat::Docx => self.parse_docx_body(&mut archive)?,
            _ => None,
        };

        let xlsx_workbook = match format {
            OoxmlFormat::Xlsx => Some(self.parse_xlsx(&mut archive)?),
            _ => None,
        };

        Ok(OoxmlDocument {
            format,
            version: "1.0".to_string(),
            content_types,
            main_part,
            shared_strings,
            part_count,
            core_properties,
            relationships,
            docx_body,
            xlsx_workbook,
        })
    }

    /// Parse OOXML and convert to a generic Document.
    pub fn parse_to_document(&self, data: &[u8]) -> Result<Document> {
        let ooxml = self.parse(data)?;

        let word_count = match ooxml.format {
            OoxmlFormat::Docx => {
                // Rough estimate: shared strings + 1 word per 6 chars
                let total_chars: usize = ooxml.shared_strings.iter().map(|s| s.len()).sum();
                total_chars / 6
            }
            _ => 0,
        };

        Ok(Document {
            content: data.to_vec(),
            format: ooxml.format.to_string(),
            metadata: DocumentMetadata {
                title: ooxml.core_properties.title.clone(),
                author: ooxml.core_properties.creator.clone(),
                word_count: Some(word_count as u32),
                ..Default::default()
            },
        })
    }

    fn read_zip_entry(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
        path: &str,
    ) -> Result<String> {
        let mut file = archive.by_name(path).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Missing {}: {}", path, e),
        })?;
        let mut buf = String::new();
        Read::read_to_string(&mut file, &mut buf).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Cannot read {}: {}", path, e),
        })?;
        Ok(buf)
    }

    fn parse_content_types(&self, doc: &XmlDoc) -> Vec<ContentTypeEntry> {
        let mut entries = Vec::new();
        for node in doc.descendants() {
            if node.has_tag_name("Override") {
                let part_name = node.attribute("PartName").unwrap_or("").to_string();
                let ct = node.attribute("ContentType").unwrap_or("").to_string();
                if !ct.is_empty() {
                    entries.push(ContentTypeEntry {
                        extension: part_name,
                        content_type: ct,
                    });
                }
            } else if node.has_tag_name("Default") {
                let ext = node.attribute("Extension").unwrap_or("").to_string();
                let ct = node.attribute("ContentType").unwrap_or("").to_string();
                if !ext.is_empty() && !ct.is_empty() {
                    entries.push(ContentTypeEntry {
                        extension: ext,
                        content_type: ct,
                    });
                }
            }
        }
        entries
    }

    fn parse_core_properties(&self, xml: &str) -> Result<CoreProperties> {
        let doc = XmlDoc::parse(xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid core.xml: {}", e),
        })?;

        let mut props = CoreProperties::default();
        for node in doc.descendants() {
            if !node.is_element() {
                continue;
            }
            let tag = node.tag_name().name();
            if let Some(text) = node.text() {
                let val = text.trim().to_string();
                if val.is_empty() {
                    continue;
                }
                match tag {
                    "title" => props.title = Some(val),
                    "creator" => props.creator = Some(val),
                    "subject" => props.subject = Some(val),
                    "description" => props.description = Some(val),
                    "keywords" => props.keywords = Some(val),
                    "language" => props.language = Some(val),
                    "lastModifiedBy" => props.last_modified_by = Some(val),
                    "created" => props.created = Some(val),
                    "modified" => props.modified = Some(val),
                    "category" => props.category = Some(val),
                    "revision" => props.revision = Some(val),
                    _ => {}
                }
            }
        }
        Ok(props)
    }

    fn parse_relationships(&self, xml: &str) -> Result<Vec<Relationship>> {
        let doc = XmlDoc::parse(xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid .rels: {}", e),
        })?;

        let mut rels = Vec::new();
        for node in doc.descendants() {
            if node.has_tag_name("Relationship") {
                let id = node.attribute("Id").unwrap_or("").to_string();
                let rel_type = node.attribute("Type").unwrap_or("").to_string();
                let target = node.attribute("Target").unwrap_or("").to_string();
                let target_mode = node.attribute("TargetMode").map(|s| s.to_string());
                if !id.is_empty() && !rel_type.is_empty() {
                    rels.push(Relationship {
                        id,
                        rel_type,
                        target,
                        target_mode,
                    });
                }
            }
        }
        Ok(rels)
    }

    fn count_worksheets(&self, archive: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Result<u32> {
        let mut count = 0u32;
        for i in 0..archive.len() {
            if let Ok(name) = archive.by_index(i).map(|f| f.name().to_string()) {
                if name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml") {
                    count += 1;
                }
            }
        }
        Ok(count)
    }

    fn count_slides(&self, archive: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Result<u32> {
        let mut count = 0u32;
        for i in 0..archive.len() {
            if let Ok(name) = archive.by_index(i).map(|f| f.name().to_string()) {
                if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                    count += 1;
                }
            }
        }
        Ok(count)
    }

    fn extract_shared_strings(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<Vec<String>> {
        if archive.by_name("xl/sharedStrings.xml").is_err() {
            return Ok(Vec::new());
        }
        let xml = self.read_zip_entry(archive, "xl/sharedStrings.xml")?;
        let doc = XmlDoc::parse(&xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid sharedStrings.xml: {}", e),
        })?;

        let mut strings = Vec::new();
        for node in doc.descendants() {
            if node.has_tag_name("si") || node.has_tag_name("t") {
                if let Some(text) = node.text() {
                    let val = text.trim().to_string();
                    if !val.is_empty() {
                        strings.push(val);
                    }
                }
            }
        }
        Ok(strings)
    }

    // --- DOCX body parsing ---

    const W_NS: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    // --- PPTX namespaces ---

    const P_NS: &str = "http://schemas.openxmlformats.org/presentationml/2006/main";
    const A_NS: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
    #[allow(dead_code)]
    const R_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    // --- XLSX namespaces ---

    const S_NS: &str = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const S_R_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    /// Parse PPTX presentation from ppt/presentation.xml.
    pub fn parse_pptx(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<Option<PptxPresentation>> {
        if archive.by_name("ppt/presentation.xml").is_err() {
            return Ok(None);
        }
        let xml = self.read_zip_entry(archive, "ppt/presentation.xml")?;
        let doc = XmlDoc::parse(&xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid presentation.xml: {}", e),
        })?;

        let pres_elem = doc.descendants().find(|n| {
            n.has_tag_name("presentation") && n.tag_name().namespace() == Some(Self::P_NS)
        });
        let Some(pres_elem) = pres_elem else {
            return Ok(Some(PptxPresentation {
                slide_size: SlideSize::widescreen(),
                slides: Vec::new(),
                slide_masters: Vec::new(),
                theme: None,
                core_properties: CoreProperties::default(),
            }));
        };

        let slide_size = self.parse_slide_size(&pres_elem);

        // Build slide ID → relationship mapping from presentation.xml
        let mut slides_by_id: Vec<(u32, String)> = Vec::new();
        for sld_id in pres_elem.descendants() {
            if sld_id.has_tag_name("sldId") && sld_id.tag_name().namespace() == Some(Self::P_NS) {
                let id: u32 = sld_id
                    .attribute("id")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                let rid = sld_id.attribute("r:id").unwrap_or("");
                slides_by_id.push((id, rid.to_string()));
            }
        }

        // Read ppt/_rels/presentation.xml.rels to resolve slide paths
        let slides = self.parse_pptx_slides(archive, &slides_by_id, &[]);

        let themes = self.parse_pptx_themes(archive);
        let slide_masters = self.parse_pptx_slide_masters(archive);

        let core_xml = self
            .read_zip_entry(archive, "docProps/core.xml")
            .unwrap_or_default();
        let core_properties = self.parse_core_properties(&core_xml).unwrap_or_default();

        Ok(Some(PptxPresentation {
            slide_size,
            slides,
            slide_masters,
            theme: themes.into_iter().next(),
            core_properties,
        }))
    }

    fn parse_slide_size(&self, pres_elem: &roxmltree::Node) -> SlideSize {
        for child in pres_elem.children() {
            if child.has_tag_name("sldSz") && child.tag_name().namespace() == Some(Self::P_NS) {
                let cx: i64 = child
                    .attribute("cx")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(12192000);
                let cy: i64 = child
                    .attribute("cy")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(6858000);
                return SlideSize { cx, cy };
            }
        }
        SlideSize::widescreen()
    }

    fn parse_pptx_slides(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
        slide_ids: &[(u32, String)],
        _rels: &[(String, String)],
    ) -> Vec<Slide> {
        // Map slide index → entry name for all ppt/slides/slide*.xml entries
        let mut slide_entries: Vec<(u32, String)> = Vec::new();
        for i in 0..archive.len() {
            if let Ok(entry) = archive.by_index(i) {
                let name = entry.name().to_string();
                if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                    let idx: u32 = name
                        .trim_start_matches("ppt/slides/slide")
                        .trim_end_matches(".xml")
                        .parse()
                        .unwrap_or(0);
                    slide_entries.push((idx, name));
                }
            }
        }
        // Sort by slide index
        slide_entries.sort_by_key(|(idx, _)| *idx);

        let mut slides = Vec::new();
        for (expected_id, _) in slide_ids {
            // Find slide with matching order
            let slide_idx = slides.len();
            let entry = slide_entries.get(slide_idx);

            let (xml, slide_idx_from_name) = if let Some((_entry_idx, entry_name)) = entry {
                let Ok(x) = self.read_zip_entry(archive, entry_name) else {
                    continue;
                };
                (x, *_entry_idx)
            } else {
                // No more slides in ZIP
                break;
            };

            let Ok(slide_doc) = XmlDoc::parse(&xml) else {
                continue;
            };

            let slide_elem = slide_doc.descendants().find(|n| {
                (n.has_tag_name("sld") || n.has_tag_name("slide"))
                    && n.tag_name().namespace() == Some(Self::P_NS)
            });

            let Some(slide_elem) = slide_elem else {
                continue;
            };

            let name = slide_elem
                .attribute("name")
                .unwrap_or(&format!("Slide {}", slide_idx_from_name))
                .to_string();
            let layout_id = slide_elem.attribute("sldLayoutId").map(String::from);
            let master_id = slide_elem.attribute("sldMasterId").map(String::from);

            let shapes = self.parse_pptx_shapes(slide_elem);
            let notes = self.parse_pptx_notes(archive, *expected_id);
            let transition = self.parse_pptx_transition(slide_elem);
            let timing_raw = self.parse_pptx_timing_raw(&xml);
            let animations = self.parse_pptx_animations(slide_elem);

            slides.push(Slide {
                id: *expected_id,
                name,
                layout_id,
                master_id,
                shapes,
                notes,
                transition,
                animations,
                timing_raw,
                background: None,
            });
        }
        slides
    }

    fn parse_pptx_shapes(&self, slide_elem: roxmltree::Node) -> Vec<SlideShape> {
        let mut shapes = Vec::new();
        for sp_tree in slide_elem.descendants() {
            let is_sp_tree = sp_tree.has_tag_name("spTree")
                && sp_tree.tag_name().namespace() == Some(Self::P_NS);
            if !is_sp_tree {
                continue;
            }
            for child in sp_tree.children() {
                if !child.is_element() {
                    continue;
                }
                let local = child.tag_name().name();
                let ns = child.tag_name().namespace();
                match (ns, local) {
                    (Some(ns), "sp") if ns == Self::P_NS => {
                        if let Some(shape) = self.parse_pptx_shape_from_sp(&child) {
                            shapes.push(shape);
                        }
                    }
                    (Some(ns), "pic") if ns == Self::P_NS => {
                        if let Some(pic) = self.parse_pptx_picture(&child) {
                            shapes.push(SlideShape::Picture(pic));
                        }
                    }
                    (Some(ns), "tbl") if ns == Self::P_NS => {
                        if let Some(table) = self.parse_pptx_table(&child) {
                            shapes.push(SlideShape::Table(table));
                        }
                    }
                    (Some(ns), "cxnSp") if ns == Self::P_NS => {
                        if let Some(conn) = self.parse_pptx_connector(&child) {
                            shapes.push(SlideShape::Connector(conn));
                        }
                    }
                    _ => {}
                }
            }
        }
        shapes
    }

    fn parse_pptx_transition(&self, slide_elem: roxmltree::Node) -> Option<SlideTransition> {
        let transition = slide_elem.descendants().find(|n| {
            n.has_tag_name("transition") && n.tag_name().namespace() == Some(Self::P_NS)
        })?;
        let dur_attr = transition
            .attribute("dur")
            .and_then(|v| v.parse::<f64>().ok());
        let adv_click = transition.attribute("advClick");
        let adv_tm = transition
            .attribute("advTm")
            .and_then(|v| v.parse::<f64>().ok());

        let effect = transition
            .children()
            .find(|c| c.is_element() && c.tag_name().namespace() == Some(Self::P_NS))
            .map(|c| {
                let name = c.tag_name().name();
                match name {
                    "fade" => TransitionEffect::Fade,
                    "push" => TransitionEffect::Push,
                    "wipe" => TransitionEffect::Wipe,
                    "split" => TransitionEffect::Split,
                    "reveal" => TransitionEffect::Reveal,
                    "checker" => TransitionEffect::Checker,
                    "zoom" => TransitionEffect::Zoom,
                    "morph" => TransitionEffect::Morph,
                    "circle" => TransitionEffect::Circle,
                    "uncover" => TransitionEffect::Uncover,
                    "cover" => TransitionEffect::Cover,
                    "flash" => TransitionEffect::Flash,
                    "random" => TransitionEffect::Random,
                    "shred" => TransitionEffect::Shred,
                    "wedge" => TransitionEffect::Wedge,
                    "wheel" => TransitionEffect::Wheel,
                    "flythrough" => TransitionEffect::Flythrough,
                    "excite" => TransitionEffect::Excite,
                    "dissolve" => TransitionEffect::Dissolve,
                    "newsflash" => TransitionEffect::Newsflash,
                    "bars" => TransitionEffect::Bars,
                    "contract" => TransitionEffect::Contract,
                    "rotate" => TransitionEffect::Rotate,
                    "blast" => TransitionEffect::Blast,
                    "center" => TransitionEffect::Center,
                    "shape" => TransitionEffect::Shape,
                    "zoomIn" => TransitionEffect::ZoomIn,
                    "zoomOut" => TransitionEffect::ZoomOut,
                    "coverIn" => TransitionEffect::CoverIn,
                    "coverUp" => TransitionEffect::CoverUp,
                    "coverLeft" => TransitionEffect::CoverLeft,
                    "coverRight" => TransitionEffect::CoverRight,
                    "pullIn" => TransitionEffect::PullIn,
                    "pullUp" => TransitionEffect::PullUp,
                    "pullLeft" => TransitionEffect::PullLeft,
                    "pullRight" => TransitionEffect::PullRight,
                    _ => TransitionEffect::None,
                }
            })
            .unwrap_or(TransitionEffect::None);

        Some(SlideTransition {
            effect,
            duration: dur_attr.map(|d| d / 1000.0).unwrap_or(1.0),
            advance_mode: if adv_click == Some("1") || adv_click.is_none() {
                AdvanceMode::Manual
            } else {
                AdvanceMode::Timed
            },
            advance_timing: adv_tm.map(|d| d / 1000.0).unwrap_or(0.0),
        })
    }

    fn parse_pptx_timing_raw(&self, xml: &str) -> Option<String> {
        let doc = XmlDoc::parse(xml).ok()?;
        let node = doc
            .descendants()
            .find(|n| n.has_tag_name("timing") && n.tag_name().namespace() == Some(Self::P_NS))?;
        let range = node.range();
        Some(xml[range.start..range.end].to_string())
    }

    /// Parse `<p:timing>` into `AnimationData` entries.
    fn parse_pptx_animations(&self, slide_elem: roxmltree::Node) -> Vec<AnimationData> {
        let mut anims = Vec::new();
        let timing = slide_elem
            .descendants()
            .find(|n| n.has_tag_name("timing") && n.tag_name().namespace() == Some(Self::P_NS));
        let timing = match timing {
            Some(t) => t,
            None => return anims,
        };

        // Walk only <p:cTn> elements that directly contain <p:tLst> (actual animation data).
        // This excludes the timing root (tmRoot) and intermediate grouping cTn elements.
        for ctn in timing.descendants().filter(|n| {
            let is_c_tn = n.has_tag_name("cTn") && n.tag_name().namespace() == Some(Self::P_NS);
            if !is_c_tn {
                return false;
            }
            n.children()
                .any(|ch| ch.has_tag_name("tLst") && ch.tag_name().namespace() == Some(Self::P_NS))
        }) {
            let id = ctn.attribute("id").unwrap_or("0").to_string();
            let dur_raw = ctn.attribute("dur").unwrap_or("0");
            let dur_sec = dur_raw
                .trim_end_matches("ms")
                .parse::<f64>()
                .ok()
                .map(|v| v / 1000.0)
                .unwrap_or(0.0);

            // Determine start type from condition trigger
            //   evt="onClick" → onClick
            //   evt="onBegin" + delay=0 → withPrevious
            //   evt="onBegin" + delay>0 → afterPrevious
            //   no <p:cond> → withPrevious (default for subsequent animations)
            let (start, cond_delay_ms) = ctn
                .descendants()
                .find(|n| n.has_tag_name("cond") && n.tag_name().namespace() == Some(Self::P_NS))
                .map(|c| {
                    let evt = c.attribute("evt").unwrap_or("");
                    let delay_str = c.attribute("delay").unwrap_or("0");
                    match evt {
                        "onClick" => ("onClick", delay_str.to_string()),
                        "onBegin" => {
                            if delay_str == "0" || delay_str.is_empty() {
                                ("withPrevious", delay_str.to_string())
                            } else {
                                ("afterPrevious", delay_str.to_string())
                            }
                        }
                        _ => ("onClick", delay_str.to_string()),
                    }
                })
                .unwrap_or(("withPrevious", "0".to_string()));
            let start = start.to_string();

            // Parse delay from cond attribute (already fetched above)
            let delay_sec = cond_delay_ms
                .trim_end_matches("ms")
                .parse::<f64>()
                .ok()
                .map(|v| v / 1000.0)
                .unwrap_or(0.0);

            // Extract target and effect from <p:effect>, <p:animEffect>, etc.
            let (target, effect) = self.extract_anim_target_and_effect(&ctn);

            // Derive animation category from the effect filter name.
            //   "fadeIn", "flyIn", "zoomIn", ... → "entrance"
            //   "fadeOut", "flyOut", "zoomOut", ... → "exit"
            //   "spin", "growShrink", other → "emphasis"
            let category = {
                let e = effect.trim();
                if e.ends_with("In") {
                    "entrance"
                } else if e.ends_with("Out") {
                    "exit"
                } else {
                    "emphasis"
                }
            };

            anims.push(AnimationData {
                id,
                effect,
                category: category.to_string(),
                target,
                start,
                duration: dur_sec,
                delay: delay_sec,
            });
        }
        anims
    }

    /// Extract target shape ID and effect name from a `<p:cTn>` animation node.
    fn extract_anim_target_and_effect(&self, ctn: &roxmltree::Node) -> (String, String) {
        // Check for <p:effect ref="..." filter="...">
        if let Some(effect) = ctn
            .descendants()
            .find(|n| n.has_tag_name("effect") && n.tag_name().namespace() == Some(Self::P_NS))
        {
            let target = effect.attribute("ref").unwrap_or("").to_string();
            let filter = effect.attribute("filter").unwrap_or("").to_string();
            return (target, filter);
        }
        // Check for <p:animEffect>
        if let Some(anim_effect) = ctn
            .descendants()
            .find(|n| n.has_tag_name("animEffect") && n.tag_name().namespace() == Some(Self::P_NS))
        {
            let target = anim_effect.attribute("ref").unwrap_or("").to_string();
            let transition = anim_effect
                .attribute("transition")
                .unwrap_or("")
                .to_string();
            return (target, transition);
        }
        (String::new(), String::new())
    }

    fn parse_pptx_shape_from_sp(&self, sp: &roxmltree::Node) -> Option<SlideShape> {
        let id = sp.attribute("id").unwrap_or("0").to_string();

        // Detect shape type: ph (placeholder), sp (auto-shape/textbox)
        let is_placeholder = sp
            .descendants()
            .any(|n| n.has_tag_name("ph") && n.tag_name().namespace() == Some(Self::P_NS));

        let bounds = self.parse_pptx_bounds(sp);
        let text_body = self.parse_pptx_text_body(sp);
        let fill = self.parse_pptx_fill(sp);
        let effect = self.parse_pptx_effect_list(sp);

        if is_placeholder {
            let ph_type = sp
                .descendants()
                .find(|n| n.has_tag_name("ph"))
                .and_then(|n| n.attribute("type"))
                .unwrap_or("body")
                .to_string();
            Some(SlideShape::Placeholder(PlaceholderShape {
                id,
                bounds,
                placeholder_type: ph_type,
                text_body,
                fill,
                effect,
            }))
        } else {
            Some(SlideShape::TextBox(TextBoxShape {
                id,
                bounds,
                text_body: text_body.unwrap_or(TextBody {
                    paragraphs: Vec::new(),
                }),
                fill,
                effect,
            }))
        }
    }

    fn parse_pptx_table(&self, tbl: &roxmltree::Node) -> Option<TableShape> {
        let bounds = self.parse_pptx_bounds(tbl);

        let mut columns = Vec::new();
        let mut rows = Vec::new();

        // Parse grid columns <p:tblGrid><p:gridCol w="..."/>
        if let Some(grid) = tbl.children().find(|c| {
            c.is_element()
                && c.has_tag_name("tblGrid")
                && c.tag_name().namespace() == Some(Self::P_NS)
        }) {
            for col in grid.children() {
                if !col.is_element() {
                    continue;
                }
                if col.has_tag_name("gridCol") && col.tag_name().namespace() == Some(Self::P_NS) {
                    let width = col.attribute("w").and_then(|v| v.parse().ok()).unwrap_or(0);
                    columns.push(TableColumn { width });
                }
            }
        }

        // Parse rows <p:tr h="...">
        for tr in tbl.children() {
            if !tr.is_element() {
                continue;
            }
            if !tr.has_tag_name("tr") || tr.tag_name().namespace() != Some(Self::P_NS) {
                continue;
            }
            let height = tr.attribute("h").and_then(|v| v.parse().ok()).unwrap_or(0);
            let mut cells = Vec::new();

            for tc in tr.children() {
                if !tc.is_element() {
                    continue;
                }
                if !tc.has_tag_name("tc") || tc.tag_name().namespace() != Some(Self::P_NS) {
                    continue;
                }

                // Parse cell text body <p:txBody> (or <a:txBody>)
                let text_body = self.parse_pptx_text_body(&tc).unwrap_or(TextBody {
                    paragraphs: Vec::new(),
                });

                // Parse cell properties for row/col span
                let row_span = tc.attribute("rowSpan").and_then(|v| v.parse().ok());
                let col_span = tc.attribute("gridSpan").and_then(|v| v.parse().ok());

                // Parse fill color from tcPr -> solidFill -> srgbClr
                let fill_color = tc
                    .descendants()
                    .find(|n| {
                        n.has_tag_name("srgbClr") && n.tag_name().namespace() == Some(Self::A_NS)
                    })
                    .and_then(|n| n.attribute("val"))
                    .map(|s| s.to_string());

                cells.push(TableCell {
                    text_body,
                    row_span,
                    col_span,
                    fill_color,
                });
            }

            rows.push(TableRow { height, cells });
        }

        let id = tbl.attribute("id").unwrap_or("0").to_string();
        Some(TableShape {
            id,
            bounds,
            columns,
            rows,
        })
    }

    fn parse_pptx_bounds(&self, sp: &roxmltree::Node) -> Bounds {
        // Find <a:xfrm> or <p:xfrm> with <a:off> and <a:ext>
        let xfrm = sp
            .descendants()
            .find(|n| n.has_tag_name("xfrm") && n.tag_name().namespace() == Some(Self::A_NS))
            .or_else(|| {
                sp.descendants().find(|n| {
                    n.has_tag_name("xfrm") && n.tag_name().namespace() == Some(Self::P_NS)
                })
            });

        let Some(xfrm) = xfrm else {
            return Bounds {
                x: 0,
                y: 0,
                cx: 0,
                cy: 0,
            };
        };

        let mut off = (0i64, 0i64);
        let mut ext = (0i64, 0i64);

        for child in xfrm.children() {
            if !child.is_element() {
                continue;
            }
            let local = child.tag_name().name();
            match local {
                "off" => {
                    off = (
                        child
                            .attribute("x")
                            .and_then(|v| v.parse().ok())
                            .unwrap_or(0),
                        child
                            .attribute("y")
                            .and_then(|v| v.parse().ok())
                            .unwrap_or(0),
                    );
                }
                "ext" => {
                    ext = (
                        child
                            .attribute("cx")
                            .and_then(|v| v.parse().ok())
                            .unwrap_or(0),
                        child
                            .attribute("cy")
                            .and_then(|v| v.parse().ok())
                            .unwrap_or(0),
                    );
                }
                _ => {}
            }
        }

        Bounds {
            x: off.0,
            y: off.1,
            cx: ext.0,
            cy: ext.1,
        }
    }

    fn parse_pptx_text_body(&self, sp: &roxmltree::Node) -> Option<TextBody> {
        let tx_body = sp
            .descendants()
            .find(|n| n.has_tag_name("txBody") && n.tag_name().namespace() == Some(Self::P_NS))
            .or_else(|| {
                sp.descendants().find(|n| {
                    n.has_tag_name("txBody") && n.tag_name().namespace() == Some(Self::A_NS)
                })
            });

        let tx_body = tx_body?;

        let mut paragraphs = Vec::new();

        // Process direct child <a:p> elements
        for p_node in tx_body.children() {
            if !p_node.is_element() {
                continue;
            }
            if !(p_node.has_tag_name("p") && p_node.tag_name().namespace() == Some(Self::A_NS)) {
                continue;
            }

            let mut runs = Vec::new();
            for r_node in p_node.children() {
                if !r_node.is_element() {
                    continue;
                }
                if r_node.has_tag_name("r") && r_node.tag_name().namespace() == Some(Self::A_NS) {
                    if let Some(run) = self.parse_pptx_run(r_node) {
                        runs.push(run);
                    }
                }
            }

            // Handle <a:br> (line break) as an empty run
            for r_node in p_node.children() {
                if !r_node.is_element() {
                    continue;
                }
                if r_node.has_tag_name("br") && r_node.tag_name().namespace() == Some(Self::A_NS) {
                    if runs.iter().any(|r: &DocxRun| r.text == "\n") {
                        continue;
                    }
                    runs.push(DocxRun {
                        text: "\n".to_string(),
                        ..Default::default()
                    });
                }
            }

            paragraphs.push(DocxParagraph {
                style_id: None,
                properties: DocxParagraphProperties::default(),
                runs,
            });
        }

        if paragraphs.is_empty() {
            return None;
        }

        Some(TextBody { paragraphs })
    }

    fn parse_pptx_run(&self, r_node: roxmltree::Node) -> Option<DocxRun> {
        let mut text = String::new();
        let mut bold = false;
        let mut italic = false;
        let mut underline = None;
        let mut font_size = None;
        let mut font = None;
        let mut color = None;

        for child in r_node.children() {
            if !child.is_element() {
                if let Some(t) = child.text() {
                    text.push_str(t);
                }
                continue;
            }
            match child.tag_name().name() {
                "t" => {
                    if let Some(t) = child.text() {
                        text.push_str(t);
                    }
                }
                "rPr" => {
                    bold = child.attribute("b").map(|v| v == "1").unwrap_or(false);
                    italic = child.attribute("i").map(|v| v == "1").unwrap_or(false);
                    // sz in centipoints (hundredths of a point)
                    font_size = child
                        .attribute("sz")
                        .and_then(|v| v.parse::<u32>().ok())
                        .map(|v| v / 100);
                    font = child
                        .children()
                        .find(|n| n.is_element() && n.has_tag_name("latin"))
                        .and_then(|n| n.attribute("typeface"))
                        .map(|s| s.to_string());
                    underline = child.attribute("u").map(|_| UnderlineType::Single);
                    color = child
                        .children()
                        .find(|n| {
                            n.is_element()
                                && (n.has_tag_name("solidFill") || n.has_tag_name("srgbClr"))
                        })
                        .and_then(|n| {
                            n.descendants()
                                .find(|m| m.has_tag_name("srgbClr"))
                                .and_then(|m| m.attribute("val"))
                                .map(|s| s.to_string())
                        });
                }
                _ => {}
            }
        }

        if text.is_empty() && !r_node.descendants().any(|n| n.has_tag_name("t")) {
            // Collect text from <a:t> descendants
            for t_node in r_node.descendants() {
                if t_node.has_tag_name("t") {
                    if let Some(t) = t_node.text() {
                        text.push_str(t);
                    }
                }
            }
        }

        if text.is_empty() {
            return None;
        }

        Some(DocxRun {
            text,
            bold,
            italic,
            underline,
            font_size,
            font,
            color,
            ..Default::default()
        })
    }

    fn parse_pptx_fill(&self, sp_elem: &roxmltree::Node) -> Option<Fill> {
        let sp_pr = sp_elem
            .descendants()
            .find(|n| n.has_tag_name("spPr") && n.tag_name().namespace() == Some(Self::A_NS))?;
        if let Some(grad) = sp_pr.descendants().find(|n| n.has_tag_name("gradFill")) {
            let kind = if grad.descendants().any(|n| n.has_tag_name("lin")) {
                GradientKind::Linear
            } else {
                GradientKind::Radial
            };
            let angle = grad
                .descendants()
                .find(|n| n.has_tag_name("lin"))
                .and_then(|n| n.attribute("ang"))
                .and_then(|v| v.parse::<f64>().ok())
                .map(|v| v / 60000.0)
                .unwrap_or(0.0);
            let stops: Vec<GradientStop> = grad
                .descendants()
                .filter(|n| n.has_tag_name("gs") && n.tag_name().namespace() == Some(Self::A_NS))
                .filter_map(|gs| {
                    let pos = gs.attribute("pos")?.parse::<f64>().ok()? / 1000.0;
                    let color = gs
                        .descendants()
                        .find(|n| n.has_tag_name("srgbClr"))
                        .and_then(|n| n.attribute("val"))?
                        .to_string();
                    Some(GradientStop {
                        position: pos,
                        color,
                    })
                })
                .collect();
            if !stops.is_empty() {
                return Some(Fill::Gradient(GradientFill { kind, stops, angle }));
            }
        }
        if let Some(solid) = sp_pr.descendants().find(|n| n.has_tag_name("solidFill")) {
            if let Some(color) = solid
                .descendants()
                .find(|n| n.has_tag_name("srgbClr"))
                .and_then(|n| n.attribute("val"))
            {
                return Some(Fill::Solid(format!("#{}", color)));
            }
        }
        None
    }

    fn parse_pptx_effect_list(&self, sp_elem: &roxmltree::Node) -> Option<EffectList> {
        let sp_pr = sp_elem
            .descendants()
            .find(|n| n.has_tag_name("spPr") && n.tag_name().namespace() == Some(Self::A_NS))?;
        let shadow = sp_pr
            .descendants()
            .find(|n| n.has_tag_name("outerShdw"))
            .map(|shdw| {
                let dx = shdw
                    .attribute("dx")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                let dy = shdw
                    .attribute("dy")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                let blur_radius = shdw
                    .attribute("blurRad")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                let color = shdw
                    .descendants()
                    .find(|n| n.has_tag_name("srgbClr"))
                    .and_then(|n| n.attribute("val"))
                    .unwrap_or("000000")
                    .to_string();
                let opacity = shdw
                    .descendants()
                    .find(|n| n.has_tag_name("srgbClr"))
                    .and_then(|n| n.attribute("lastClr").or_else(|| n.attribute("alpha")))
                    .and_then(|v| v.parse::<f64>().ok())
                    .map(|a| a / 1000.0)
                    .unwrap_or(1.0);
                ShadowEffect {
                    dx,
                    dy,
                    blur_radius,
                    color,
                    opacity,
                }
            });
        let glow = sp_pr
            .descendants()
            .find(|n| n.has_tag_name("glow"))
            .map(|glow| {
                let radius = glow
                    .attribute("rad")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                let color = glow
                    .descendants()
                    .find(|n| n.has_tag_name("srgbClr"))
                    .and_then(|n| n.attribute("val"))
                    .unwrap_or("000000")
                    .to_string();
                let opacity = glow
                    .descendants()
                    .find(|n| n.has_tag_name("srgbClr"))
                    .and_then(|n| n.attribute("lastClr").or_else(|| n.attribute("alpha")))
                    .and_then(|v| v.parse::<f64>().ok())
                    .map(|a| a / 1000.0)
                    .unwrap_or(1.0);
                GlowEffect {
                    radius,
                    color,
                    opacity,
                }
            });
        let reflection = sp_pr
            .descendants()
            .find(|n| n.has_tag_name("reflection"))
            .map(|refl| {
                let blur_radius = refl
                    .attribute("blurRad")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                let start_opacity = refl
                    .attribute("stA")
                    .and_then(|v| v.parse::<f64>().ok())
                    .map(|a| a / 1000.0)
                    .unwrap_or(1.0);
                let end_pos = refl
                    .attribute("pos")
                    .and_then(|v| v.parse::<f64>().ok())
                    .map(|a| a / 1000.0)
                    .unwrap_or(0.0);
                let direction = if refl.attribute("dir") == Some("fade") {
                    ReflectionDirection::Fade
                } else {
                    ReflectionDirection::Mirror
                };
                ReflectionEffect {
                    blur_radius,
                    start_opacity,
                    end_pos,
                    direction,
                }
            });
        if shadow.is_some() || glow.is_some() || reflection.is_some() {
            Some(EffectList {
                shadow,
                glow,
                reflection,
            })
        } else {
            None
        }
    }

    fn parse_pptx_picture(&self, pic: &roxmltree::Node) -> Option<PictureShape> {
        let id = pic.attribute("id").unwrap_or("0").to_string();
        let name = pic
            .descendants()
            .find(|n| n.has_tag_name("cNvPr") && n.tag_name().namespace() == Some(Self::P_NS))
            .and_then(|n| n.attribute("name"))
            .unwrap_or("Picture")
            .to_string();

        let bounds = self.parse_pptx_bounds(pic);

        // Find image relationship reference
        let _blip_fill = pic.descendants().find(|n| {
            n.has_tag_name("blipFill")
                && (n.tag_name().namespace() == Some(Self::P_NS)
                    || n.tag_name().namespace() == Some(Self::A_NS))
        });

        let effect = self.parse_pptx_effect_list(pic);

        // Try to get image extension and data from relationship
        let (image_extension, image_data) = (String::new(), Vec::new());

        Some(PictureShape {
            id,
            bounds,
            name,
            image_extension,
            image_data,
            effect,
        })
    }

    fn parse_pptx_connector(&self, cxn: &roxmltree::Node) -> Option<ConnectorShape> {
        let bounds = self.parse_pptx_bounds(cxn);
        let id = cxn
            .descendants()
            .find(|n| n.has_tag_name("cNvPr"))?
            .attribute("id")
            .unwrap_or("0")
            .to_string();

        let prst = cxn
            .descendants()
            .find(|n| n.has_tag_name("prstGeom"))
            .and_then(|g| g.attribute("prst"))
            .unwrap_or("straightConnector1");
        let connector_type = ConnectorShapeType::from_name(prst);

        let line_width = cxn
            .descendants()
            .find(|n| n.has_tag_name("ln"))
            .and_then(|n| n.attribute("w"))
            .and_then(|v| v.parse::<i64>().ok());

        let has_end_arrow = cxn.descendants().any(|n| n.has_tag_name("headEnd"));
        let has_start_arrow = cxn.descendants().any(|n| n.has_tag_name("tailEnd"));
        let fill = self.parse_pptx_fill(cxn);
        let effect = self.parse_pptx_effect_list(cxn);

        Some(ConnectorShape {
            id,
            bounds,
            connector_type,
            line_width,
            has_start_arrow,
            has_end_arrow,
            fill,
            effect,
        })
    }

    fn parse_pptx_notes(
        &self,
        _archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
        _slide_id: u32,
    ) -> Option<String> {
        // Notes parsing is a future enhancement — return None for now
        None
    }

    /// Parse DOCX body from word/document.xml.
    pub fn parse_docx_body(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<Option<DocxBody>> {
        if archive.by_name("word/document.xml").is_err() {
            return Ok(None);
        }
        let xml = self.read_zip_entry(archive, "word/document.xml")?;
        let doc = XmlDoc::parse(&xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid document.xml: {}", e),
        })?;

        // Find w:body
        let body_node = doc
            .descendants()
            .find(|n| n.has_tag_name("body") && n.tag_name().namespace() == Some(Self::W_NS));

        let body = match body_node {
            Some(node) => self.parse_body_node(&node),
            None => DocxBody {
                paragraphs: Vec::new(),
                tables: Vec::new(),
            },
        };

        Ok(Some(body))
    }

    fn parse_body_node(&self, body: &roxmltree::Node) -> DocxBody {
        let mut paragraphs = Vec::new();
        let mut tables = Vec::new();

        for child in body.children() {
            if !child.is_element() {
                continue;
            }
            let local_name = child.tag_name().name();
            let ns = child.tag_name().namespace();

            match (ns, local_name) {
                (Some(Self::W_NS), "p") => {
                    paragraphs.push(self.parse_paragraph(&child));
                }
                (Some(Self::W_NS), "tbl") => {
                    if let Some(table) = self.parse_table(&child) {
                        tables.push(table);
                    }
                }
                (Some(Self::W_NS), "sdt") => {
                    // Structured document tag — try to parse its content
                    for inner in child.descendants() {
                        if inner.has_tag_name("p")
                            && inner.tag_name().namespace() == Some(Self::W_NS)
                        {
                            paragraphs.push(self.parse_paragraph(&inner));
                        }
                    }
                }
                _ => {}
            }
        }

        DocxBody { paragraphs, tables }
    }

    fn parse_paragraph(&self, p_node: &roxmltree::Node) -> DocxParagraph {
        let mut style_id = None;
        let mut properties = DocxParagraphProperties::default();
        let mut runs = Vec::new();

        for child in p_node.children() {
            if !child.is_element() {
                continue;
            }
            let local = child.tag_name().name();
            let ns = child.tag_name().namespace();

            match (ns, local) {
                (Some(Self::W_NS), "pPr") => {
                    // pStyle is a child element with val attribute, not an attribute on pPr
                    if let Some(pstyle) = child
                        .children()
                        .find(|n| n.is_element() && n.tag_name().name() == "pStyle")
                    {
                        style_id = pstyle.attribute("val").map(|s| s.to_string());
                    }
                    properties = self.parse_paragraph_properties(&child);
                }
                (Some(Self::W_NS), "r") => {
                    runs.push(self.parse_run(&child));
                }
                (Some(Self::W_NS), "hyperlink") => {
                    // Hyperlinks contain runs
                    for r in child.children() {
                        if r.is_element()
                            && r.tag_name().name() == "r"
                            && r.tag_name().namespace() == Some(Self::W_NS)
                        {
                            runs.push(self.parse_run(&r));
                        }
                    }
                }
                (Some(Self::W_NS), "sdt") => {
                    for r in child.descendants() {
                        if r.has_tag_name("r") && r.tag_name().namespace() == Some(Self::W_NS) {
                            runs.push(self.parse_run(&r));
                        }
                    }
                }
                _ => {}
            }
        }

        DocxParagraph {
            style_id,
            properties,
            runs,
        }
    }

    fn parse_paragraph_properties(&self, ppr: &roxmltree::Node) -> DocxParagraphProperties {
        let mut props = DocxParagraphProperties::default();

        // Look for jc (justification)
        for child in ppr.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "jc" => {
                    props.alignment = match child.attribute("val") {
                        Some("center") => Some(TextAlignment::Center),
                        Some("right") => Some(TextAlignment::Right),
                        Some("both") => Some(TextAlignment::Both),
                        _ => Some(TextAlignment::Left),
                    };
                }
                "ind" => {
                    props.indent_left = child.attribute("left").and_then(|v| v.parse().ok());
                    props.indent_right = child.attribute("right").and_then(|v| v.parse().ok());
                    props.indent_first_line =
                        child.attribute("firstLine").and_then(|v| v.parse().ok());
                    props.indent_hanging = child.attribute("hanging").and_then(|v| v.parse().ok());
                }
                "spacing" => {
                    props.spacing_before = child.attribute("before").and_then(|v| v.parse().ok());
                    props.spacing_after = child.attribute("after").and_then(|v| v.parse().ok());
                    props.spacing_line = child.attribute("line").and_then(|v| v.parse().ok());
                    props.spacing_line_rule = match child.attribute("lineRule") {
                        Some("exact") => Some(LineSpacingRule::Exact),
                        Some("atLeast") => Some(LineSpacingRule::AtLeast),
                        _ => Some(LineSpacingRule::Auto),
                    };
                }
                "keepLines" => {
                    props.keep_lines = child.attribute("val") != Some("false");
                }
                "keepNext" => {
                    props.keep_next = child.attribute("val") != Some("false");
                }
                "pageBreakBefore" => {
                    props.page_break_before = child.attribute("val") != Some("false");
                }
                "outlineLvl" => {
                    props.outline_level = child.attribute("val").and_then(|v| v.parse().ok());
                }
                _ => {}
            }
        }

        props
    }

    fn parse_run(&self, r_node: &roxmltree::Node) -> DocxRun {
        let mut run = DocxRun {
            text: String::new(),
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
        };

        for child in r_node.children() {
            if !child.is_element() {
                continue;
            }
            let local = child.tag_name().name();
            let ns = child.tag_name().namespace();

            match (ns, local) {
                (Some(Self::W_NS), "t") => {
                    // Preserve whitespace: check xml:space="preserve"
                    if let Some(text) = child.text() {
                        run.text.push_str(text);
                    }
                }
                (Some(Self::W_NS), "rPr") => {
                    self.apply_run_properties(&child, &mut run);
                }
                (Some(Self::W_NS), "br") => {
                    let br_type = child.attribute("type").unwrap_or("line");
                    if br_type == "page" {
                        run.text.push('\x0C'); // form feed for page break
                    } else {
                        run.text.push('\n');
                    }
                }
                (Some(Self::W_NS), "tab") => {
                    run.text.push('\t');
                }
                (Some(Self::W_NS), "cr") => {
                    run.text.push('\r');
                }
                _ => {}
            }
        }

        run
    }

    fn apply_run_properties(&self, rpr: &roxmltree::Node, run: &mut DocxRun) {
        for child in rpr.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "b" => {
                    run.bold = child.attribute("val") != Some("false");
                    if child.attribute("val").is_none() && !child.children().count() > 0 {
                        run.bold = true;
                    }
                }
                "i" => {
                    run.italic = child.attribute("val") != Some("false");
                    if child.attribute("val").is_none() && !child.children().count() > 0 {
                        run.italic = true;
                    }
                }
                "u" => {
                    run.underline = match child.attribute("val") {
                        Some("double") => Some(UnderlineType::Double),
                        Some("thick") => Some(UnderlineType::Thick),
                        Some("dotted") => Some(UnderlineType::Dotted),
                        Some("dashed") => Some(UnderlineType::Dashed),
                        Some("dashDot") => Some(UnderlineType::DashDot),
                        Some("wave") => Some(UnderlineType::Wave),
                        Some("none") => Some(UnderlineType::None),
                        Some("false") => None,
                        _ => Some(UnderlineType::Single),
                    };
                }
                "strike" => {
                    run.strikethrough = child.attribute("val") != Some("false");
                }
                "dstrike" => {
                    run.double_strikethrough = child.attribute("val") != Some("false");
                }
                "rFonts" => {
                    // Try ascii, hAnsi, then eastAsia, then cs
                    run.font = child
                        .attribute("ascii")
                        .or_else(|| child.attribute("hAnsi"))
                        .or_else(|| child.attribute("eastAsia"))
                        .map(|s| s.to_string());
                }
                "sz" => {
                    run.font_size = child.attribute("val").and_then(|v| v.parse().ok());
                }
                "szCs" => {
                    run.font_size_cs = child.attribute("val").and_then(|v| v.parse().ok());
                }
                "color" => {
                    run.color = child.attribute("val").map(|s| s.to_string());
                }
                "highlight" => {
                    run.highlight = child.attribute("val").map(|s| s.to_string());
                }
                "vertAlign" => {
                    run.vertical_alignment = match child.attribute("val") {
                        Some("superscript") => Some(VerticalAlignment::Superscript),
                        Some("subscript") => Some(VerticalAlignment::Subscript),
                        _ => None,
                    };
                }
                "smallCaps" => {
                    run.small_caps = child.attribute("val") != Some("false");
                }
                "caps" => {
                    run.all_caps = child.attribute("val") != Some("false");
                }
                _ => {}
            }
        }
    }

    fn parse_table(&self, tbl_node: &roxmltree::Node) -> Option<DocxTable> {
        let mut rows = Vec::new();
        let mut properties = DocxTableProperties::default();

        for child in tbl_node.children() {
            if !child.is_element() {
                continue;
            }
            let local = child.tag_name().name();

            match local {
                "tblPr" => {
                    properties = self.parse_table_properties(&child);
                }
                "tr" => {
                    rows.push(self.parse_table_row(&child));
                }
                _ => {}
            }
        }

        Some(DocxTable { rows, properties })
    }

    fn parse_table_properties(&self, tbl_pr: &roxmltree::Node) -> DocxTableProperties {
        let mut props = DocxTableProperties::default();

        for child in tbl_pr.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "tblW" => {
                    props.width = child.attribute("w").and_then(|v| v.parse().ok());
                }
                "tblInd" => {
                    props.indent = child.attribute("w").and_then(|v| v.parse().ok());
                }
                "jc" => {
                    props.alignment = match child.attribute("val") {
                        Some("center") => Some(TextAlignment::Center),
                        Some("right") => Some(TextAlignment::Right),
                        _ => Some(TextAlignment::Left),
                    };
                }
                _ => {}
            }
        }

        props
    }

    fn parse_table_row(&self, tr_node: &roxmltree::Node) -> DocxTableRow {
        let mut cells = Vec::new();
        let mut height = None;
        let mut is_header = false;

        for child in tr_node.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "trPr" => {
                    height = child.attribute("trHeight").and_then(|v| v.parse().ok());
                    // Check for tblHeader
                    for inner in child.children() {
                        if inner.has_tag_name("tblHeader") {
                            is_header = true;
                        }
                    }
                }
                "tc" => {
                    cells.push(self.parse_table_cell(&child));
                }
                _ => {}
            }
        }

        DocxTableRow {
            cells,
            height,
            is_header,
        }
    }

    fn parse_table_cell(&self, tc_node: &roxmltree::Node) -> DocxTableCell {
        let mut paragraphs = Vec::new();
        let mut column_span = 1u32;
        let mut row_span = 1u32;
        let mut width = None;
        let mut shading = None;

        for child in tc_node.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "tcPr" => {
                    column_span = child
                        .attribute("gridSpan")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(1);
                    row_span = child
                        .attribute("vMerge")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(1);
                    width = child.attribute("tcW").and_then(|v| v.parse().ok());
                    for inner in child.children() {
                        if inner.has_tag_name("shd") {
                            shading = inner.attribute("fill").map(|s| s.to_string());
                        }
                    }
                }
                "p" => {
                    paragraphs.push(self.parse_paragraph(&child));
                }
                _ => {}
            }
        }

        DocxTableCell {
            paragraphs,
            column_span,
            row_span,
            width,
            shading,
        }
    }

    /// Parse styles from word/styles.xml.
    pub fn parse_styles(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<Option<DocxStyles>> {
        if archive.by_name("word/styles.xml").is_err() {
            return Ok(None);
        }
        let xml = self.read_zip_entry(archive, "word/styles.xml")?;
        let doc = XmlDoc::parse(&xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid styles.xml: {}", e),
        })?;

        let mut paragraph_styles = Vec::new();
        let mut character_styles = Vec::new();
        let mut table_styles = Vec::new();

        for node in doc.descendants() {
            if !node.is_element() {
                continue;
            }
            let style_type = node.attribute("type").unwrap_or("");
            let style_id = node.attribute("styleId").unwrap_or("");

            if style_id.is_empty() {
                continue;
            }

            let name = node.attribute("name").map(|s| s.to_string());
            let based_on = node.attribute("basedOn").map(|s| s.to_string());

            match style_type {
                "paragraph" => {
                    let (properties, run_properties) = self.parse_style_properties(&node);
                    paragraph_styles.push(DocxParagraphStyle {
                        style_id: style_id.to_string(),
                        name,
                        based_on,
                        properties,
                        run_properties,
                    });
                }
                "character" => {
                    let run_properties = self.parse_style_run_properties(&node);
                    character_styles.push(DocxCharacterStyle {
                        style_id: style_id.to_string(),
                        name,
                        based_on,
                        properties: run_properties,
                    });
                }
                "table" => {
                    table_styles.push(DocxTableStyle {
                        style_id: style_id.to_string(),
                        name,
                    });
                }
                _ => {}
            }
        }

        Ok(Some(DocxStyles {
            paragraph_styles,
            character_styles,
            table_styles,
        }))
    }

    fn parse_style_properties(
        &self,
        style_node: &roxmltree::Node,
    ) -> (DocxParagraphProperties, DocxRunProperties) {
        let mut p_props = DocxParagraphProperties::default();
        let mut r_props = DocxRunProperties::default();

        for child in style_node.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "pPr" => {
                    p_props = self.parse_paragraph_properties(&child);
                }
                "rPr" => {
                    r_props = self.parse_style_run_properties_node(&child);
                }
                _ => {}
            }
        }

        (p_props, r_props)
    }

    fn parse_style_run_properties(&self, style_node: &roxmltree::Node) -> DocxRunProperties {
        let mut r_props = DocxRunProperties::default();

        for child in style_node.children() {
            if child.is_element() && child.has_tag_name("rPr") {
                r_props = self.parse_style_run_properties_node(&child);
                break;
            }
        }

        r_props
    }

    fn parse_style_run_properties_node(&self, rpr: &roxmltree::Node) -> DocxRunProperties {
        let mut props = DocxRunProperties::default();

        for child in rpr.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "b" => {
                    props.bold = Some(child.attribute("val") != Some("false"));
                }
                "i" => {
                    props.italic = Some(child.attribute("val") != Some("false"));
                }
                "rFonts" => {
                    props.font = child
                        .attribute("ascii")
                        .or_else(|| child.attribute("hAnsi"))
                        .map(|s| s.to_string());
                }
                "sz" => {
                    props.font_size = child.attribute("val").and_then(|v| v.parse().ok());
                }
                "color" => {
                    props.color = child.attribute("val").map(|s| s.to_string());
                }
                _ => {}
            }
        }

        props
    }

    // --- PPTX Theme Parsing ---

    /// Parse all themes from ppt/theme/theme*.xml in the archive.
    pub fn parse_pptx_themes(&self, archive: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Vec<Theme> {
        let mut themes = Vec::new();

        let theme_names: Vec<String> = (0..archive.len())
            .filter_map(|i| {
                archive.by_index(i).ok().and_then(|e| {
                    let name = e.name().to_string();
                    if name.starts_with("ppt/theme/theme") && name.ends_with(".xml") {
                        Some(name)
                    } else {
                        None
                    }
                })
            })
            .collect();

        for name in &theme_names {
            if let Ok(xml) = self.read_zip_entry(archive, name) {
                if let Some(theme) = self.parse_single_theme(&xml, name) {
                    themes.push(theme);
                }
            }
        }

        themes
    }

    fn parse_single_theme(&self, xml: &str, _path: &str) -> Option<Theme> {
        let doc = XmlDoc::parse(xml).ok()?;
        let root = doc.root_element();

        let name = root.attribute("name").unwrap_or("").to_string();

        let mut color_scheme = ColorScheme::default();
        let mut font_scheme = FontScheme::default();

        for child in root.descendants() {
            let local = child.tag_name().name();
            let ns = child.tag_name().namespace();

            match (ns, local) {
                (Some("http://schemas.openxmlformats.org/drawingml/2006/main"), "clrScheme") => {
                    color_scheme = self.parse_color_scheme(&child);
                }
                (Some("http://schemas.openxmlformats.org/drawingml/2006/main"), "fontScheme") => {
                    font_scheme = self.parse_font_scheme(&child);
                }
                _ => {}
            }
        }

        Some(Theme {
            name: if name.is_empty() {
                "Theme".to_string()
            } else {
                name
            },
            color_scheme,
            font_scheme,
            format_scheme: None,
        })
    }

    fn parse_color_scheme(&self, clr_scheme_node: &roxmltree::Node) -> ColorScheme {
        let name = clr_scheme_node.attribute("name").unwrap_or("").to_string();
        let mut colors = Vec::new();

        for child in clr_scheme_node.children() {
            if !child.is_element() {
                continue;
            }
            let local = child.tag_name().name();
            // Color slot names: dark1, light1, dark2, light2, accent1-6, hlink, folHlink
            let color = child
                .descendants()
                .find(|n| n.has_tag_name("srgbClr") || n.has_tag_name("sysClr"))
                .and_then(|n| n.attribute("val"))
                .map(|v| v.to_string())
                .unwrap_or_default();

            if !local.is_empty() && !color.is_empty() {
                colors.push(ThemeColor {
                    name: local.to_string(),
                    color,
                });
            }
        }

        ColorScheme { name, colors }
    }

    fn parse_font_scheme(&self, font_scheme_node: &roxmltree::Node) -> FontScheme {
        let name = font_scheme_node.attribute("name").unwrap_or("").to_string();
        let mut major_font = ThemeFont {
            latin: None,
            east_asian: None,
            complex_script: None,
        };
        let mut minor_font = ThemeFont {
            latin: None,
            east_asian: None,
            complex_script: None,
        };

        for child in font_scheme_node.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "majorFont" => major_font = self.parse_theme_font(&child),
                "minorFont" => minor_font = self.parse_theme_font(&child),
                _ => {}
            }
        }

        FontScheme {
            name,
            major_font,
            minor_font,
        }
    }

    fn parse_theme_font(&self, font_node: &roxmltree::Node) -> ThemeFont {
        let mut tf = ThemeFont {
            latin: None,
            east_asian: None,
            complex_script: None,
        };

        for child in font_node.children() {
            if !child.is_element() {
                continue;
            }
            match child.tag_name().name() {
                "latin" => {
                    tf.latin = child.attribute("typeface").map(|s| s.to_string());
                }
                "ea" => {
                    tf.east_asian = child.attribute("typeface").map(|s| s.to_string());
                }
                "cs" => {
                    tf.complex_script = child.attribute("typeface").map(|s| s.to_string());
                }
                _ => {}
            }
        }

        tf
    }

    // --- PPTX Slide Master / Layout Parsing ---

    /// Parse slide masters from ppt/slideMasters/slideMaster*.xml.
    pub fn parse_pptx_slide_masters(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Vec<SlideMaster> {
        let mut masters = Vec::new();

        let master_names: Vec<String> = (0..archive.len())
            .filter_map(|i| {
                archive.by_index(i).ok().and_then(|e| {
                    let name = e.name().to_string();
                    if name.starts_with("ppt/slideMasters/slideMaster") && name.ends_with(".xml") {
                        Some(name)
                    } else {
                        None
                    }
                })
            })
            .collect();

        for name in &master_names {
            if let Ok(xml) = self.read_zip_entry(archive, name) {
                if let Some(master) = self.parse_single_slide_master(&xml, name) {
                    masters.push(master);
                }
            }
        }

        masters
    }

    fn parse_single_slide_master(&self, xml: &str, _path: &str) -> Option<SlideMaster> {
        let doc = XmlDoc::parse(xml).ok()?;

        let name = doc
            .root_element()
            .attribute("name")
            .unwrap_or("Slide Master")
            .to_string();

        Some(SlideMaster {
            id: 1,
            name,
            slide_layouts: Vec::new(), // Layouts resolved via relationships
        })
    }

    // --- XLSX Parsing ---

    /// Parse XLSX workbook from xl/workbook.xml and related files.
    pub fn parse_xlsx(&self, archive: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Result<XlsxWorkbook> {
        // Parse workbook.xml to get sheet names and relationships
        let workbook_xml = self.read_zip_entry(archive, "xl/workbook.xml")?;
        let workbook_doc = XmlDoc::parse(&workbook_xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid workbook.xml: {}", e),
        })?;

        // Parse workbook relationships to map sheet IDs to file paths
        let workbook_rels_xml = self.read_zip_entry(archive, "xl/_rels/workbook.xml.rels")?;
        let workbook_rels_doc =
            XmlDoc::parse(&workbook_rels_xml).map_err(|e| CoreError::Parse {
                format: "ooxml".into(),
                message: format!("Invalid workbook.xml.rels: {}", e),
            })?;

        // Extract shared strings
        let shared_strings = self.extract_shared_strings(archive)?;

        // Parse styles
        let styles = self.parse_xlsx_styles(archive)?;

        // Parse defined names
        let defined_names = self.parse_xlsx_defined_names(archive)?;

        // Parse workbook properties
        let properties = self.parse_xlsx_workbook_properties(&workbook_doc)?;

        // Parse sheets
        let sheets = self.parse_xlsx_sheets(
            archive,
            &workbook_doc,
            &workbook_rels_doc,
            &shared_strings,
            &styles,
        )?;

        Ok(XlsxWorkbook {
            properties,
            sheets,
            shared_strings,
            styles,
            defined_names,
        })
    }

    fn parse_xlsx_workbook_properties(&self, doc: &XmlDoc) -> Result<XlsxWorkbookProperties> {
        let workbook_elem = doc
            .descendants()
            .find(|n| n.has_tag_name("workbook") && n.tag_name().namespace() == Some(Self::S_NS));

        let mut properties = XlsxWorkbookProperties::default();

        if let Some(workbook_elem) = workbook_elem {
            // Parse date1904 attribute
            if let Some(date_1904) = workbook_elem.attribute("date1904") {
                properties.date_1904 = date_1904 == "1";
            }

            // Parse workbookView
            for view_elem in workbook_elem.descendants() {
                if view_elem.has_tag_name("workbookView")
                    && view_elem.tag_name().namespace() == Some(Self::S_NS)
                {
                    if let Some(active_tab) = view_elem.attribute("activeTab") {
                        properties.active_tab = active_tab.parse().ok();
                    }
                    if let Some(first_sheet) = view_elem.attribute("firstSheet") {
                        properties.first_sheet = first_sheet.parse().ok();
                    }
                    properties.view = view_elem.attribute("view").map(|s| s.to_string());
                    break;
                }
            }
        }

        Ok(properties)
    }

    fn parse_xlsx_sheets(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
        workbook_doc: &XmlDoc,
        workbook_rels_doc: &XmlDoc,
        shared_strings: &[String],
        styles: &XlsxStyles,
    ) -> Result<Vec<XlsxSheet>> {
        let mut sheets = Vec::new();

        // Build sheet ID to relationship mapping
        let mut sheet_id_to_rels: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for rel_elem in workbook_rels_doc.descendants() {
            if rel_elem.has_tag_name("Relationship")
                && rel_elem.tag_name().namespace() == Some(Self::S_R_NS)
            {
                if let (Some(id), Some(target)) =
                    (rel_elem.attribute("Id"), rel_elem.attribute("Target"))
                {
                    if target.starts_with("worksheets/sheet") {
                        sheet_id_to_rels.insert(id.to_string(), target.to_string());
                    }
                }
            }
        }

        // Parse sheets from workbook.xml
        for sheet_elem in workbook_doc.descendants() {
            if sheet_elem.has_tag_name("sheet")
                && sheet_elem.tag_name().namespace() == Some(Self::S_NS)
            {
                let name = sheet_elem.attribute("name").unwrap_or("Sheet1").to_string();
                let sheet_id_attr = sheet_elem.attribute("sheetId").unwrap_or("1");
                let sheet_id: u32 = sheet_id_attr.parse().unwrap_or(1);
                let r_id = sheet_elem.attribute("id").unwrap_or("rId1").to_string();

                // Get sheet state
                let state = if let Some(state_attr) = sheet_elem.attribute("state") {
                    match state_attr {
                        "hidden" => SheetState::Hidden,
                        "veryHidden" => SheetState::VeryHidden,
                        _ => SheetState::Visible,
                    }
                } else {
                    SheetState::Visible
                };

                // Find the worksheet file path
                let worksheet_path = if let Some(target) = sheet_id_to_rels.get(&r_id) {
                    format!("xl/{}", target)
                } else {
                    format!("xl/worksheets/sheet{}.xml", sheet_id)
                };

                // Parse the worksheet
                let worksheet_xml = self
                    .read_zip_entry(archive, &worksheet_path)
                    .unwrap_or_default();
                let worksheet_doc =
                    XmlDoc::parse(&worksheet_xml).map_err(|e| CoreError::Parse {
                        format: "ooxml".into(),
                        message: format!("Invalid worksheet {}: {}", worksheet_path, e),
                    })?;

                let (rows, cols, merges, sheet_properties) =
                    self.parse_xlsx_worksheet(&worksheet_doc, shared_strings, styles)?;

                sheets.push(XlsxSheet {
                    name,
                    sheet_id,
                    state,
                    rows,
                    cols,
                    merges,
                    properties: sheet_properties,
                });
            }
        }

        Ok(sheets)
    }

    #[allow(clippy::type_complexity)]
    fn parse_xlsx_worksheet(
        &self,
        doc: &XmlDoc,
        shared_strings: &[String],
        _styles: &XlsxStyles,
    ) -> Result<(
        Vec<XlsxRow>,
        Vec<XlsxCol>,
        Vec<XlsxMergeCell>,
        XlsxSheetProperties,
    )> {
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut merges = Vec::new();
        let mut sheet_properties = XlsxSheetProperties::default();

        // Parse sheet properties
        let worksheet_elem = doc
            .descendants()
            .find(|n| n.has_tag_name("worksheet") && n.tag_name().namespace() == Some(Self::S_NS));

        if let Some(worksheet_elem) = worksheet_elem {
            // Parse sheet properties
            for prop_elem in worksheet_elem.descendants() {
                if prop_elem.has_tag_name("sheetPr")
                    && prop_elem.tag_name().namespace() == Some(Self::S_NS)
                {
                    if let Some(tab_color) = prop_elem.attribute("tabColor") {
                        sheet_properties.tab_color = Some(tab_color.to_string());
                    }
                } else if prop_elem.has_tag_name("sheetView")
                    && prop_elem.tag_name().namespace() == Some(Self::S_NS)
                {
                    if let Some(zoom_scale) = prop_elem.attribute("zoomScale") {
                        sheet_properties.zoom_scale = zoom_scale.parse().ok();
                    }
                    if let Some(zoom_scale_normal) = prop_elem.attribute("zoomScaleNormal") {
                        sheet_properties.zoom_scale_normal = zoom_scale_normal.parse().ok();
                    }
                    if let Some(zoom_scale_page_layout_view) =
                        prop_elem.attribute("zoomScalePageLayoutView")
                    {
                        sheet_properties.zoom_scale_page_layout_view =
                            zoom_scale_page_layout_view.parse().ok();
                    }
                    if let Some(workbook_view_id) = prop_elem.attribute("workbookViewId") {
                        sheet_properties.workbook_view_id = workbook_view_id.parse().ok();
                    }
                }
            }

            // Parse columns
            for col_elem in worksheet_elem.descendants() {
                if col_elem.has_tag_name("col")
                    && col_elem.tag_name().namespace() == Some(Self::S_NS)
                {
                    let min: u32 = col_elem
                        .attribute("min")
                        .unwrap_or("1")
                        .parse()
                        .unwrap_or(1);
                    let max: u32 = col_elem
                        .attribute("max")
                        .unwrap_or("1")
                        .parse()
                        .unwrap_or(1);
                    let width: Option<f64> =
                        col_elem.attribute("width").and_then(|w| w.parse().ok());
                    let style: Option<u32> =
                        col_elem.attribute("style").and_then(|s| s.parse().ok());
                    let hidden = col_elem.attribute("hidden") == Some("1");
                    let best_fit = col_elem.attribute("bestFit") == Some("1");
                    let custom_width = col_elem.attribute("customWidth") == Some("1");

                    cols.push(XlsxCol {
                        min,
                        max,
                        width,
                        style,
                        hidden,
                        best_fit,
                        custom_width,
                    });
                }
            }

            // Parse merge cells
            for merge_cell_elem in worksheet_elem.descendants() {
                if merge_cell_elem.has_tag_name("mergeCell")
                    && merge_cell_elem.tag_name().namespace() == Some(Self::S_NS)
                {
                    if let Some(ref_range) = merge_cell_elem.attribute("ref") {
                        merges.push(XlsxMergeCell {
                            ref_range: ref_range.to_string(),
                        });
                    }
                }
            }

            // Parse rows
            for row_elem in worksheet_elem.descendants() {
                if row_elem.has_tag_name("row")
                    && row_elem.tag_name().namespace() == Some(Self::S_NS)
                {
                    let r: u32 = row_elem.attribute("r").unwrap_or("1").parse().unwrap_or(1);
                    let ht: Option<f64> = row_elem.attribute("ht").and_then(|h| h.parse().ok());
                    let hidden = row_elem.attribute("hidden") == Some("1");
                    let s: Option<u32> = row_elem.attribute("s").and_then(|s| s.parse().ok());
                    let spans = row_elem.attribute("spans").map(|s| s.to_string());

                    let mut cells = Vec::new();
                    for cell_elem in row_elem.descendants() {
                        if cell_elem.has_tag_name("c")
                            && cell_elem.tag_name().namespace() == Some(Self::S_NS)
                        {
                            let cell = self.parse_xlsx_cell(cell_elem, shared_strings)?;
                            cells.push(cell);
                        }
                    }

                    rows.push(XlsxRow {
                        r,
                        ht,
                        hidden,
                        s,
                        cells,
                        spans,
                    });
                }
            }
        }

        Ok((rows, cols, merges, sheet_properties))
    }

    fn parse_xlsx_cell(
        &self,
        cell_elem: roxmltree::Node,
        shared_strings: &[String],
    ) -> Result<XlsxCell> {
        let r = cell_elem.attribute("r").unwrap_or("").to_string();
        let s: Option<u32> = cell_elem.attribute("s").and_then(|s| s.parse().ok());

        let t_attr = cell_elem.attribute("t");
        let cell_type = if let Some(t) = t_attr {
            match t {
                "s" => CellType::S,
                "str" => CellType::Str,
                "b" => CellType::B,
                "e" => CellType::E,
                "d" => CellType::D,
                "inlineStr" => CellType::InlineStr,
                _ => CellType::N,
            }
        } else {
            CellType::N
        };

        let mut v = String::new();
        if let Some(v_elem) = cell_elem.descendants().find(|n| n.has_tag_name("v")) {
            v = v_elem.text().unwrap_or("").to_string();
        }

        // Resolve shared string index to actual value
        if cell_type == CellType::S {
            if let Ok(idx) = v.parse::<usize>() {
                if idx < shared_strings.len() {
                    v = shared_strings[idx].clone();
                }
            }
        }

        let f = cell_elem
            .descendants()
            .find(|n| n.has_tag_name("f"))
            .and_then(|n| n.text().map(|t| t.to_string()));

        Ok(XlsxCell {
            r,
            t: cell_type,
            v,
            s,
            f,
        })
    }

    fn parse_xlsx_styles(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<XlsxStyles> {
        if archive.by_name("xl/styles.xml").is_err() {
            return Ok(XlsxStyles::default());
        }

        let xml = self.read_zip_entry(archive, "xl/styles.xml")?;
        let doc = XmlDoc::parse(&xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid styles.xml: {}", e),
        })?;

        let mut styles = XlsxStyles::default();

        // Parse number formats
        for num_fmt_elem in doc.descendants() {
            if num_fmt_elem.has_tag_name("numFmt")
                && num_fmt_elem.tag_name().namespace() == Some(Self::S_NS)
            {
                if let (Some(num_fmt_id), Some(format_code)) = (
                    num_fmt_elem.attribute("numFmtId"),
                    num_fmt_elem.attribute("formatCode"),
                ) {
                    if let Ok(num_fmt_id_parsed) = num_fmt_id.parse::<u32>() {
                        styles.num_fmts.push(XlsxNumFmt {
                            num_fmt_id: num_fmt_id_parsed,
                            format_code: format_code.to_string(),
                        });
                    }
                }
            }
        }

        // Parse fonts
        for font_elem in doc.descendants() {
            if font_elem.has_tag_name("font")
                && font_elem.tag_name().namespace() == Some(Self::S_NS)
            {
                let mut font = XlsxFont::default();

                for child in font_elem.children() {
                    if child.has_tag_name("name") {
                        font.name = child.text().map(|t| t.to_string());
                    } else if child.has_tag_name("sz") {
                        font.sz = child.text().and_then(|t| t.parse::<f64>().ok());
                    } else if child.has_tag_name("b") {
                        font.b = true;
                    } else if child.has_tag_name("i") {
                        font.i = true;
                    } else if child.has_tag_name("u") {
                        font.u = child.text().map(|t| t.to_string());
                    } else if child.has_tag_name("strike") {
                        font.strike = true;
                    } else if child.has_tag_name("color") {
                        font.color = child.attribute("rgb").map(|c| c.to_string());
                    }
                }

                styles.fonts.push(font);
            }
        }

        // Parse fills
        for fill_elem in doc.descendants() {
            if fill_elem.has_tag_name("fill")
                && fill_elem.tag_name().namespace() == Some(Self::S_NS)
            {
                let mut fill = XlsxFill::default();

                for child in fill_elem.children() {
                    if child.has_tag_name("patternFill") {
                        fill.pattern_type = child.attribute("patternType").map(|p| p.to_string());
                        if let Some(fg_color) = child.children().find(|c| c.has_tag_name("fgColor"))
                        {
                            fill.fg_color = fg_color.attribute("rgb").map(|c| c.to_string());
                        }
                        if let Some(bg_color) = child.children().find(|c| c.has_tag_name("bgColor"))
                        {
                            fill.bg_color = bg_color.attribute("rgb").map(|c| c.to_string());
                        }
                    }
                }

                styles.fills.push(fill);
            }
        }

        // Parse borders (simplified)
        for border_elem in doc.descendants() {
            if border_elem.has_tag_name("border")
                && border_elem.tag_name().namespace() == Some(Self::S_NS)
            {
                let mut border = XlsxBorder::default();

                for child in border_elem.children() {
                    if child.has_tag_name("left") {
                        border.left = Some(self.parse_xlsx_border_side(child));
                    } else if child.has_tag_name("right") {
                        border.right = Some(self.parse_xlsx_border_side(child));
                    } else if child.has_tag_name("top") {
                        border.top = Some(self.parse_xlsx_border_side(child));
                    } else if child.has_tag_name("bottom") {
                        border.bottom = Some(self.parse_xlsx_border_side(child));
                    } else if child.has_tag_name("diagonal") {
                        border.diagonal = Some(self.parse_xlsx_border_side(child));
                    }
                }

                styles.borders.push(border);
            }
        }

        // Parse cell style XFs
        for xf_elem in doc.descendants() {
            if xf_elem.has_tag_name("xf") && xf_elem.tag_name().namespace() == Some(Self::S_NS) {
                // Check if this is a cellStyleXf (has apply* attributes)
                let mut has_apply_attrs = false;
                for attr in [
                    "applyNumberFormat",
                    "applyFont",
                    "applyFill",
                    "applyBorder",
                    "applyAlignment",
                    "applyProtection",
                ] {
                    if xf_elem.attribute(attr) == Some("1") {
                        has_apply_attrs = true;
                        break;
                    }
                }

                if has_apply_attrs {
                    let mut xf = XlsxCellStyleXf::default();

                    if let Some(num_fmt_id) = xf_elem.attribute("numFmtId") {
                        xf.num_fmt_id = num_fmt_id.parse().ok();
                        xf.apply_number_format = true;
                    }
                    if let Some(font_id) = xf_elem.attribute("fontId") {
                        xf.font_id = font_id.parse().ok();
                        xf.apply_font = true;
                    }
                    if let Some(fill_id) = xf_elem.attribute("fillId") {
                        xf.fill_id = fill_id.parse().ok();
                        xf.apply_fill = true;
                    }
                    if let Some(border_id) = xf_elem.attribute("borderId") {
                        xf.border_id = border_id.parse().ok();
                        xf.apply_border = true;
                    }

                    styles.cell_style_xfs.push(xf);
                } else {
                    // This is a cellXf
                    let mut xf = XlsxCellXf::default();

                    if let Some(num_fmt_id) = xf_elem.attribute("numFmtId") {
                        xf.num_fmt_id = num_fmt_id.parse().ok();
                    }
                    if let Some(font_id) = xf_elem.attribute("fontId") {
                        xf.font_id = font_id.parse().ok();
                    }
                    if let Some(fill_id) = xf_elem.attribute("fillId") {
                        xf.fill_id = fill_id.parse().ok();
                    }
                    if let Some(border_id) = xf_elem.attribute("borderId") {
                        xf.border_id = border_id.parse().ok();
                    }

                    // Parse alignment
                    if let Some(alignment_elem) =
                        xf_elem.children().find(|c| c.has_tag_name("alignment"))
                    {
                        xf.alignment = Some(self.parse_xlsx_alignment(alignment_elem));
                    }

                    // Parse protection
                    if let Some(protection_elem) =
                        xf_elem.children().find(|c| c.has_tag_name("protection"))
                    {
                        xf.protection = Some(self.parse_xlsx_protection(protection_elem));
                    }

                    styles.cell_xfs.push(xf);
                }
            }
        }

        Ok(styles)
    }

    fn parse_xlsx_border_side(&self, elem: roxmltree::Node) -> XlsxBorderSide {
        XlsxBorderSide {
            style: elem.attribute("style").map(|s| s.to_string()),
            color: elem.children()
                .find(|c| c.has_tag_name("color"))
                .and_then(|c| c.attribute("rgb").map(|s| s.to_string())),
        }
    }

    fn parse_xlsx_alignment(&self, elem: roxmltree::Node) -> XlsxAlignment {
        XlsxAlignment {
            horizontal: elem.attribute("horizontal").map(|s| s.to_string()),
            vertical: elem.attribute("vertical").map(|s| s.to_string()),
            text_rotation: elem.attribute("textRotation").and_then(|r| r.parse().ok()),
            wrap_text: elem.attribute("wrapText") == Some("1"),
            indent: elem.attribute("indent").and_then(|i| i.parse().ok()),
            shrink_to_fit: elem.attribute("shrinkToFit") == Some("1"),
        }
    }

    fn parse_xlsx_protection(&self, elem: roxmltree::Node) -> XlsxProtection {
        XlsxProtection {
            locked: elem.attribute("locked") != Some("0"),
            hidden: elem.attribute("hidden") == Some("1"),
        }
    }

    fn parse_xlsx_defined_names(
        &self,
        archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    ) -> Result<Vec<XlsxDefinedName>> {
        if archive.by_name("xl/workbook.xml").is_err() {
            return Ok(Vec::new());
        }

        let xml = self.read_zip_entry(archive, "xl/workbook.xml")?;
        let doc = XmlDoc::parse(&xml).map_err(|e| CoreError::Parse {
            format: "ooxml".into(),
            message: format!("Invalid workbook.xml: {}", e),
        })?;

        let mut defined_names = Vec::new();

        for defined_name_elem in doc.descendants() {
            if defined_name_elem.has_tag_name("definedName")
                && defined_name_elem.tag_name().namespace() == Some(Self::S_NS)
            {
                let name = defined_name_elem
                    .attribute("name")
                    .unwrap_or("")
                    .to_string();
                let ref_range = defined_name_elem.text().unwrap_or("").to_string();
                let comment = defined_name_elem
                    .attribute("comment")
                    .map(|c| c.to_string());

                if !name.is_empty() && !ref_range.is_empty() {
                    defined_names.push(XlsxDefinedName {
                        name,
                        ref_range,
                        comment,
                    });
                }
            }
        }

        Ok(defined_names)
    }
}

impl Default for OoxmlParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::is_ooxml_file;
    use std::io::Write;

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
  <dc:subject>OOXML Parser Test</dc:subject>
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

    #[test]
    fn test_is_ooxml_file() {
        let docx = make_minimal_docx();
        assert!(is_ooxml_file(&docx));
        assert!(!is_ooxml_file(b"<html>not ooxml</html>"));
        assert!(!is_ooxml_file(b""));
    }

    #[test]
    fn test_parse_docx() {
        let parser = OoxmlParser::new();
        let doc = parser.parse(&make_minimal_docx()).unwrap();
        assert_eq!(doc.format, OoxmlFormat::Docx);
        assert_eq!(doc.main_part.as_deref(), Some("word/document.xml"));
        assert_eq!(doc.core_properties.title.as_deref(), Some("Test Document"));
        assert_eq!(doc.core_properties.creator.as_deref(), Some("World Office"));
    }

    #[test]
    fn test_detect_format() {
        let docx_ct = r#"<Types><Override PartName='/word/document.xml' ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/></Types>"#;
        assert_eq!(detect_ooxml_format(docx_ct), OoxmlFormat::Docx);

        let xlsx_ct = r#"<Types><Override PartName='/xl/workbook.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'/></Types>"#;
        assert_eq!(detect_ooxml_format(xlsx_ct), OoxmlFormat::Xlsx);

        let pptx_ct = r#"<Types><Override PartName='/ppt/presentation.xml' ContentType='application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'/></Types>"#;
        assert_eq!(detect_ooxml_format(pptx_ct), OoxmlFormat::Pptx);
    }

    #[test]
    fn test_rejects_non_ooxml() {
        let parser = OoxmlParser::new();
        let result = parser.parse(b"not a zip file");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_to_document() {
        let parser = OoxmlParser::new();
        let doc = parser.parse_to_document(&make_minimal_docx()).unwrap();
        assert_eq!(doc.format, "docx");
        assert_eq!(doc.metadata.title.as_deref(), Some("Test Document"));
    }

    #[test]
    fn test_format_display() {
        assert_eq!(OoxmlFormat::Docx.to_string(), "docx");
        assert_eq!(OoxmlFormat::Xlsx.to_string(), "xlsx");
        assert_eq!(OoxmlFormat::Pptx.to_string(), "pptx");
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

    #[test]
    fn test_parse_body_paragraphs() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>First paragraph</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
        );
        let parser = OoxmlParser::new();
        let doc = parser.parse(&docx).unwrap();
        let body = doc.docx_body.unwrap();
        assert_eq!(body.paragraphs.len(), 2);
        assert_eq!(body.paragraphs[0].runs[0].text, "First paragraph");
        assert_eq!(body.paragraphs[1].runs[0].text, "Second paragraph");
    }

    #[test]
    fn test_parse_run_formatting() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:b/><w:i/><w:sz val="28"/><w:rFonts ascii="Arial"/></w:rPr>
        <w:t>Bold Italic</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:u val="dotted"/><w:color val="FF0000"/></w:rPr>
        <w:t>Red Underline</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>"#,
        );
        let parser = OoxmlParser::new();
        let doc = parser.parse(&docx).unwrap();
        let body = doc.docx_body.unwrap();
        assert_eq!(body.paragraphs.len(), 1);

        let r1 = &body.paragraphs[0].runs[0];
        assert!(r1.bold);
        assert!(r1.italic);
        assert_eq!(r1.font_size, Some(28));
        assert_eq!(r1.font.as_deref(), Some("Arial"));

        let r2 = &body.paragraphs[0].runs[1];
        assert_eq!(r2.underline, Some(UnderlineType::Dotted));
        assert_eq!(r2.color.as_deref(), Some("FF0000"));
    }

    #[test]
    fn test_parse_paragraph_properties() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc val="center"/><w:spacing after="200" before="100"/></w:pPr>
      <w:r><w:t>Centered text</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc val="right"/><w:ind left="720" firstLine="360"/></w:pPr>
      <w:r><w:t>Indented right</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        );
        let parser = OoxmlParser::new();
        let doc = parser.parse(&docx).unwrap();
        let body = doc.docx_body.unwrap();

        assert_eq!(
            body.paragraphs[0].properties.alignment,
            Some(TextAlignment::Center)
        );
        assert_eq!(body.paragraphs[0].properties.spacing_after, Some(200));
        assert_eq!(body.paragraphs[0].properties.spacing_before, Some(100));

        assert_eq!(
            body.paragraphs[1].properties.alignment,
            Some(TextAlignment::Right)
        );
        assert_eq!(body.paragraphs[1].properties.indent_left, Some(720));
        assert_eq!(body.paragraphs[1].properties.indent_first_line, Some(360));
    }

    #[test]
    fn test_parse_table() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblPr><w:tblW w="5000"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Cell 1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Cell 2</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Cell 3</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Cell 4</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>"#,
        );
        let parser = OoxmlParser::new();
        let doc = parser.parse(&docx).unwrap();
        let body = doc.docx_body.unwrap();

        assert_eq!(body.tables.len(), 1);
        assert_eq!(body.tables[0].rows.len(), 2);
        assert_eq!(body.tables[0].rows[0].cells.len(), 2);
        assert_eq!(
            body.tables[0].rows[0].cells[0].paragraphs[0].runs[0].text,
            "Cell 1"
        );
        assert_eq!(
            body.tables[0].rows[1].cells[1].paragraphs[0].runs[0].text,
            "Cell 4"
        );
        assert_eq!(body.tables[0].properties.width, Some(5000));
    }

    #[test]
    fn test_parse_empty_paragraphs() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p/>
    <w:p><w:r><w:t>Not empty</w:t></w:r></w:p>
    <w:p/>
  </w:body>
</w:document>"#,
        );
        let parser = OoxmlParser::new();
        let doc = parser.parse(&docx).unwrap();
        let body = doc.docx_body.unwrap();
        assert_eq!(body.paragraphs.len(), 3);
        assert!(body.paragraphs[0].runs.is_empty());
        assert_eq!(body.paragraphs[1].runs[0].text, "Not empty");
        assert!(body.paragraphs[2].runs.is_empty());
    }

    #[test]
    fn test_parse_superscript_subscript() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>E=mc</w:t></w:r>
      <w:r><w:rPr><w:vertAlign val="superscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:t>H</w:t></w:r>
      <w:r><w:rPr><w:vertAlign val="subscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:t>O</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        );
        let parser = OoxmlParser::new();
        let doc = parser.parse(&docx).unwrap();
        let body = doc.docx_body.unwrap();
        let runs = &body.paragraphs[0].runs;
        assert_eq!(runs.len(), 5);
        assert_eq!(
            runs[1].vertical_alignment,
            Some(VerticalAlignment::Superscript)
        );
        assert_eq!(
            runs[3].vertical_alignment,
            Some(VerticalAlignment::Subscript)
        );
    }

    #[test]
    fn test_parse_style_id() {
        let docx = make_docx_with_body(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle val="Heading1"/></w:pPr>
      <w:r><w:t>Heading text</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#,
        );
        let parser = OoxmlParser::new();
        let doc = parser.parse(&docx).unwrap();
        let body = doc.docx_body.unwrap();
        assert_eq!(body.paragraphs[0].style_id.as_deref(), Some("Heading1"));
    }

    // --- PPTX test helpers ---

    fn make_minimal_pptx() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            // [Content_Types].xml
            zip.start_file(
                "[Content_Types].xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>"#,
            )
            .unwrap();

            // _rels/.rels
            zip.start_file("_rels/.rels", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#,
            )
            .unwrap();

            // ppt/_rels/presentation.xml.rels
            zip.start_file(
                "ppt/_rels/presentation.xml.rels",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>"#,
            )
            .unwrap();

            // ppt/presentation.xml
            zip.start_file(
                "ppt/presentation.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>"#,
            )
            .unwrap();

            // ppt/slides/slide1.xml - with text
            zip.start_file(
                "ppt/slides/slide1.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Title Slide">
  <p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="1371600"/><a:ext cx="8229600" cy="1701800"/></a:xfrm></p:spPr>
      <p:txBody>
        <a:bodyPr/>
        <a:p>
          <a:r><a:rPr sz="4400" b="1"/><a:t>Hello World</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>
  </p:spTree>
</p:sld>"#,
            )
            .unwrap();

            // ppt/slides/slide2.xml - empty
            zip.start_file(
                "ppt/slides/slide2.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Blank Slide">
  <p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>
  </p:spTree>
</p:sld>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    fn make_minimal_pptx_with_theme() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));

            // [Content_Types].xml
            zip.start_file(
                "[Content_Types].xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>"#,
            )
            .unwrap();

            // _rels/.rels
            zip.start_file("_rels/.rels", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#,
            )
            .unwrap();

            // ppt/_rels/presentation.xml.rels
            zip.start_file(
                "ppt/_rels/presentation.xml.rels",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
</Relationships>"#,
            )
            .unwrap();

            // ppt/presentation.xml
            zip.start_file(
                "ppt/presentation.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>"#,
            )
            .unwrap();

            // ppt/theme/theme1.xml
            zip.start_file(
                "ppt/theme/theme1.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Default">
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
    <a:fontScheme name="Default">
      <a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Default"/>
  </a:themeElements>
</a:theme>"#,
            )
            .unwrap();

            // ppt/slideMasters/slideMaster1.xml
            zip.start_file(
                "ppt/slideMasters/slideMaster1.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sldMaster>"#,
            )
            .unwrap();

            // ppt/slides/slide1.xml
            zip.start_file(
                "ppt/slides/slide1.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" name="Slide 1">
  <p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>
  </p:spTree>
</p:sld>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    #[test]
    fn test_parse_pptx() {
        let pptx = make_minimal_pptx();
        let parser = OoxmlParser::new();
        let data = pptx.as_slice();
        let cursor = std::io::Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let pres = parser.parse_pptx(&mut archive).unwrap().unwrap();

        assert_eq!(pres.slides.len(), 2);
        assert_eq!(pres.slides[0].id, 256);
        assert_eq!(pres.slides[0].name, "Title Slide");
        assert_eq!(pres.slides[1].name, "Blank Slide");

        assert_eq!(pres.slide_size.cx, 12192000);
        assert_eq!(pres.slide_size.cy, 6858000);

        assert_eq!(pres.slides[0].shapes.len(), 1);

        match &pres.slides[0].shapes[0] {
            SlideShape::Placeholder(ph) => {
                assert_eq!(ph.placeholder_type, "title");
                assert!(ph.text_body.is_some());
                let tb = ph.text_body.as_ref().unwrap();
                assert_eq!(tb.paragraphs.len(), 1);
                assert_eq!(tb.paragraphs[0].runs.len(), 1);
                assert_eq!(tb.paragraphs[0].runs[0].text, "Hello World");
                assert_eq!(tb.paragraphs[0].runs[0].font_size, Some(44));
                assert!(tb.paragraphs[0].runs[0].bold);
            }
            _ => panic!("Expected placeholder shape"),
        }

        assert!(pres.slides[1].shapes.is_empty());
    }

    #[test]
    fn test_parse_pptx_count_slides() {
        let pptx = make_minimal_pptx();
        let parser = OoxmlParser::new();
        let doc = parser.parse(pptx.as_slice()).unwrap();
        assert_eq!(doc.part_count, 2);
    }

    #[test]
    fn test_pptx_detect_from_content_types() {
        let pptx = make_minimal_pptx();
        let parser = OoxmlParser::new();
        let doc = parser.parse(pptx.as_slice()).unwrap();
        assert_eq!(doc.format, OoxmlFormat::Pptx);
    }

    #[test]
    fn test_parse_pptx_slide_size_standard() {
        // We need to build a new PPTX with standard slide size
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
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>"#).unwrap();

            zip.start_file("_rels/.rels", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#).unwrap();

            zip.start_file(
                "ppt/presentation.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }

        let parser = OoxmlParser::new();
        let data2 = buf.as_slice();
        let cursor2 = std::io::Cursor::new(data2);
        let mut archive2 = zip::ZipArchive::new(cursor2).unwrap();
        let pres = parser.parse_pptx(&mut archive2).unwrap().unwrap();

        assert_eq!(pres.slide_size.cx, 9144000);
        assert_eq!(pres.slide_size.cy, 6858000);
    }

    #[test]
    fn test_parse_pptx_with_theme() {
        let pptx = make_minimal_pptx_with_theme();
        let parser = OoxmlParser::new();
        let data = pptx.as_slice();
        let cursor = std::io::Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let pres = parser.parse_pptx(&mut archive).unwrap().unwrap();

        // Theme should be parsed
        let theme = pres.theme.expect("Theme should be Some");
        assert_eq!(theme.name, "Office Theme");
        assert_eq!(theme.color_scheme.colors.len(), 12);
        assert_eq!(
            theme.font_scheme.major_font.latin.as_deref(),
            Some("Calibri Light")
        );
        assert_eq!(
            theme.font_scheme.minor_font.latin.as_deref(),
            Some("Calibri")
        );

        // Slide masters should be parsed
        assert!(
            !pres.slide_masters.is_empty(),
            "Should have at least one slide master"
        );
        assert!(pres.slides.len() == 1);
    }

    #[test]
    fn test_parse_pptx_transition_and_animations() {
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
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>"#).unwrap();

            zip.start_file("_rels/.rels", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#).unwrap();

            zip.start_file(
                "ppt/presentation.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldSz cx="9144000" cy="6858000"/>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>"#,
            )
            .unwrap();

            zip.start_file(
                "ppt/_rels/presentation.xml.rels",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>"#).unwrap();

            zip.start_file(
                "ppt/slides/slide1.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="TextBox"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="100" y="100"/>
            <a:ext cx="5000000" cy="500000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:t>Animated</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:transition dur="500" advClick="1" advTm="3000">
    <p:fade/>
  </p:transition>
  <p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"/>
      </p:par>
    </p:tnLst>
    <p:childTnLst>
      <p:par>
        <p:cTn id="2" dur="500" restart="always">
          <p:stCondLst>
            <p:cond evt="onClick" delay="0"/>
          </p:stCondLst>
          <p:childTnLst>
            <p:par>
              <p:cTn id="3" dur="500" restart="always">
                <p:stCondLst>
                  <p:cond evt="onClick" delay="0"/>
                </p:stCondLst>
                <p:childTnLst>
                  <p:par>
                    <p:cTn id="4" dur="500">
                      <p:stCondLst>
                        <p:cond evt="onBegin" delay="0"/>
                      </p:stCondLst>
                      <p:tLst>
                        <p:tL>
                          <p:effect ref="2" filter="fadeIn"/>
                        </p:tL>
                      </p:tLst>
                    </p:cTn>
                  </p:par>
                  <p:par>
                    <p:cTn id="5" dur="300">
                      <p:stCondLst>
                        <p:cond evt="onBegin" delay="1000"/>
                      </p:stCondLst>
                      <p:tLst>
                        <p:tL>
                          <p:effect ref="2" filter="flyOut"/>
                        </p:tL>
                      </p:tLst>
                    </p:cTn>
                  </p:par>
                </p:childTnLst>
              </p:cTn>
            </p:par>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:childTnLst>
  </p:timing>
</p:sld>"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }

        let parser = OoxmlParser::new();
        let data = buf.as_slice();
        let cursor = std::io::Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let pres = parser.parse_pptx(&mut archive).unwrap().unwrap();

        assert_eq!(pres.slides.len(), 1);
        let slide = &pres.slides[0];

        // Verify transition
        let trans = slide.transition.as_ref().expect("Should have transition");
        assert_eq!(trans.effect, TransitionEffect::Fade);
        assert_eq!(trans.duration, 0.5);
        assert_eq!(trans.advance_mode, AdvanceMode::Manual);
        assert_eq!(trans.advance_timing, 3.0);

        // Verify animations — only top-level <p:cTn> with <p:tLst> are counted
        assert_eq!(slide.animations.len(), 2, "Should have 2 animations");

        // First anim: fadeIn, onClick, withPrevious (evt=onBegin, delay=0)
        let a0 = &slide.animations[0];
        assert_eq!(a0.target, "2");
        assert_eq!(a0.effect, "fadeIn");
        assert_eq!(a0.category, "entrance");
        assert_eq!(a0.start, "withPrevious");
        assert_eq!(a0.duration, 0.5);
        assert_eq!(a0.delay, 0.0);

        // Second anim: flyOut, afterPrevious (evt=onBegin, delay=1000)
        let a1 = &slide.animations[1];
        assert_eq!(a1.target, "2");
        assert_eq!(a1.effect, "flyOut");
        assert_eq!(a1.category, "exit");
        assert_eq!(a1.start, "afterPrevious");
        assert_eq!(a1.duration, 0.3);
        assert_eq!(a1.delay, 1.0);
    }

    #[test]
    fn test_parse_xlsx() {
        let data = include_bytes!("../tests/simple.xlsx");
        let parser = OoxmlParser::new();
        let doc = parser.parse(data.as_slice()).expect("parse");
        assert!(doc.xlsx_workbook.is_some());
        let wb = doc.xlsx_workbook.unwrap();
        assert_eq!(wb.sheets.len(), 1);
        assert_eq!(wb.sheets[0].name, "Sheet1");
        assert_eq!(wb.sheets[0].rows.len(), 3);
        assert_eq!(wb.sheets[0].rows[0].cells.len(), 2);
        assert_eq!(wb.sheets[0].rows[0].cells[0].v, "Name");
        assert_eq!(wb.sheets[0].rows[0].cells[1].v, "Age");
        assert_eq!(wb.sheets[0].rows[1].cells[0].v, "Alice");
        assert_eq!(wb.sheets[0].rows[1].cells[1].v, "30");
        assert_eq!(wb.sheets[0].rows[2].cells[0].v, "Bob");
        assert_eq!(wb.sheets[0].rows[2].cells[1].v, "25");
    }
}
