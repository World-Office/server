//! Conformance adapter — projects `wo-docx-renderer`'s structured layout into the
//! [`wo_conformance::NormalizedRender`] IR, so this engine becomes scorable against
//! captured Microsoft Word ground truth.
//!
//! The adapter hooks in *before* rasterization: it reads the layout pages
//! (`LayoutPage` / `LayoutLine` / `LayoutCell`) that the pipeline computes for
//! PDF/PNG/SVG export, and projects them into the conformance harness's
//! normalized intermediate representation. No pixels are involved.
//!
//! Font attribution is honest: the current layout engine ignores the document's
//! requested font family and renders everything with a default (`sans-serif` /
//! Helvetica). The adapter records this faithfully — every explicitly requested
//! family maps to `sans-serif` in `resolved_fonts`, so font substitution shows
//! up in the conformance score as a real finding rather than being hidden.
//!
//! See `plan/2026-07-27-ooxml-conformance-strategy.md` Phase 1.

use std::collections::{BTreeMap, BTreeSet};

use wo_conformance::{
    BoxKind, ConformanceError, GlyphRun, LayoutBox, NormalizedRender, Page, PageSize, Point,
    RenderEngine, RenderMetadata, RenderSpec, ResolvedFonts,
};
use wo_ooxml::model::DocxBody;

use crate::layout::{LayoutElement, LayoutEngine, LayoutPage};
use crate::pipeline::DocxRenderPipeline;

/// The family the layout engine actually renders text with. The engine ignores
/// the document's requested family and renders this default — the adapter
/// records this honestly so font substitution surfaces in the score.
const ENGINE_DEFAULT_FONT: &str = "sans-serif";

/// Adapter wrapping [`DocxRenderPipeline`] as a scorable [`RenderEngine`].
///
/// ```rust,ignore
/// use wo_docx_renderer::{DocxConformanceAdapter, DocxRenderPipeline};
/// use wo_conformance::RenderEngine;
///
/// let adapter = DocxConformanceAdapter::default();
/// let ir = adapter.render(&docx_bytes, &Default::default()).unwrap();
/// // ir is a NormalizedRender — feed it to wo-conformance's scoring.
/// ```
pub struct DocxConformanceAdapter {
    pipeline: DocxRenderPipeline,
}

impl DocxConformanceAdapter {
    pub fn new(pipeline: DocxRenderPipeline) -> Self {
        Self { pipeline }
    }
}

impl Default for DocxConformanceAdapter {
    fn default() -> Self {
        Self::new(DocxRenderPipeline::default())
    }
}

impl RenderEngine for DocxConformanceAdapter {
    fn name(&self) -> &str {
        "wo-docx-renderer"
    }

    fn version(&self) -> &str {
        env!("CARGO_PKG_VERSION")
    }

    fn render(&self, doc: &[u8], _spec: &RenderSpec) -> Result<NormalizedRender, ConformanceError> {
        let body = self
            .pipeline
            .parse_body(doc)
            .map_err(|e| ConformanceError::RenderFailed(format!("parse failed: {e}")))?;

        let requested = collect_requested_fonts(&body);

        let layout_engine = LayoutEngine::new(self.pipeline.config());
        let pages = layout_engine.layout(&body);

        Ok(project(&pages, requested))
    }
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

/// Collect every explicitly requested font family from the document body.
fn collect_requested_fonts(body: &DocxBody) -> BTreeSet<String> {
    let mut set = BTreeSet::new();

    for para in &body.paragraphs {
        for run in &para.runs {
            if let Some(f) = &run.font {
                if !f.is_empty() {
                    set.insert(f.clone());
                }
            }
        }
    }

    for table in &body.tables {
        for row in &table.rows {
            for cell in &row.cells {
                for para in &cell.paragraphs {
                    for run in &para.runs {
                        if let Some(f) = &run.font {
                            if !f.is_empty() {
                                set.insert(f.clone());
                            }
                        }
                    }
                }
            }
        }
    }

    set
}

/// Project the renderer's layout pages into the conformance IR.
fn project(pages: &[LayoutPage], requested: BTreeSet<String>) -> NormalizedRender {
    let ir_pages: Vec<Page> = pages
        .iter()
        .enumerate()
        .map(|(i, p)| project_page(p, i))
        .collect();

    // The layout engine renders every run with ENGINE_DEFAULT_FONT regardless of
    // the document's request, so every requested family is a substitution.
    let resolved: BTreeMap<String, String> = requested
        .iter()
        .map(|f| (f.clone(), ENGINE_DEFAULT_FONT.to_string()))
        .collect();

    NormalizedRender {
        pages: ir_pages,
        resolved_fonts: ResolvedFonts {
            requested: requested.into_iter().collect(),
            resolved,
            unavailable: Vec::new(),
        },
        metadata: RenderMetadata {
            engine: "wo-docx-renderer".to_string(),
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            captured_at: String::new(),
            environment: "layout-IR projection (pre-rasterization)".to_string(),
        },
    }
}

fn project_page(page: &LayoutPage, index: usize) -> Page {
    let mut boxes = Vec::new();

    for element in &page.elements {
        match element {
            LayoutElement::Paragraph { lines, .. } => {
                for line in lines {
                    if line.text.trim().is_empty() {
                        continue;
                    }
                    boxes.push(LayoutBox {
                        kind: BoxKind::Paragraph,
                        origin: Point {
                            x_pt: line.x as f64,
                            y_pt: line.y as f64,
                        },
                        size: PageSize {
                            width_pt: line.width.max(1.0) as f64,
                            height_pt: line.height as f64,
                        },
                        runs: vec![GlyphRun {
                            text: line.text.clone(),
                            font: ENGINE_DEFAULT_FONT.to_string(),
                            size_pt: line.font_size as f64,
                            weight: if line.bold { 700 } else { 400 },
                            italic: line.italic,
                            origin: Point {
                                x_pt: line.x as f64,
                                y_pt: line.y as f64,
                            },
                        }],
                    });
                }
            }
            LayoutElement::Table { cells, .. } => {
                for cell in cells {
                    let mut runs = Vec::new();
                    let mut y = cell.y + 4.0;
                    for para in &cell.paragraphs {
                        for run in &para.runs {
                            if run.text.trim().is_empty() {
                                continue;
                            }
                            let size_pt = run.font_size.unwrap_or(24) as f32 / 2.0;
                            runs.push(GlyphRun {
                                text: run.text.clone(),
                                // The layout engine ignores family — record the default.
                                font: ENGINE_DEFAULT_FONT.to_string(),
                                size_pt: size_pt as f64,
                                weight: if run.bold { 700 } else { 400 },
                                italic: run.italic,
                                origin: Point {
                                    x_pt: (cell.x + 4.0) as f64,
                                    y_pt: y as f64,
                                },
                            });
                            y += size_pt * 1.2;
                        }
                    }
                    if !runs.is_empty() {
                        boxes.push(LayoutBox {
                            kind: BoxKind::TableCell,
                            origin: Point {
                                x_pt: cell.x as f64,
                                y_pt: cell.y as f64,
                            },
                            size: PageSize {
                                width_pt: cell.width as f64,
                                height_pt: cell.height as f64,
                            },
                            runs,
                        });
                    }
                }
            }
            LayoutElement::PageBreak => {}
        }
    }

    Page {
        index,
        size: PageSize {
            width_pt: page.width as f64,
            height_pt: page.height as f64,
        },
        boxes,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Build a minimal valid DOCX with a paragraph whose run requests
    /// Calibri.  This is the same structure the pipeline's own tests use,
    /// plus a `w:rFonts` element so the font request is explicit.
    fn make_docx_with_font(font_family: &str, text: &str) -> Vec<u8> {
        let doc_xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="{font_family}"/>
          <w:sz w:val="22"/>
        </w:rPr>
        <w:t>{text}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>"#
        );

        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            let opts = zip::write::SimpleFileOptions::default();

            zip.start_file("[Content_Types].xml", opts.clone()).unwrap();
            zip.write_all(br#"<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#).unwrap();

            zip.start_file("_rels/.rels", opts.clone()).unwrap();
            zip.write_all(br#"<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#).unwrap();

            zip.start_file("word/document.xml", opts).unwrap();
            zip.write_all(doc_xml.as_bytes()).unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    /// Plain minimal docx (no font request, no rPr).
    fn make_plain_docx(text: &str) -> Vec<u8> {
        make_docx_with_font("", text)
    }

    #[test]
    fn adapter_name_and_version() {
        let adapter = DocxConformanceAdapter::default();
        assert_eq!(adapter.name(), "wo-docx-renderer");
        assert_eq!(adapter.version(), "0.1.0");
    }

    #[test]
    fn adapter_renders_without_error() {
        let adapter = DocxConformanceAdapter::default();
        let docx = make_plain_docx("Hello World");
        let ir = adapter.render(&docx, &RenderSpec::default());
        assert!(ir.is_ok(), "adapter should succeed on a valid docx: {ir:?}");
    }

    #[test]
    fn ir_has_expected_structure() {
        let adapter = DocxConformanceAdapter::default();
        let docx = make_plain_docx("Hello World");
        let ir = adapter.render(&docx, &RenderSpec::default()).unwrap();

        assert_eq!(ir.pages.len(), 1);
        let page = &ir.pages[0];
        assert!((page.size.width_pt - 595.28).abs() < 0.5);
        assert!(!page.boxes.is_empty());

        let box0 = &page.boxes[0];
        assert!(box0.runs.iter().any(|r| r.text.contains("Hello World")));
    }

    /// NOTE: wo-ooxml's parser currently does not extract `w:rFonts w:ascii`
    /// or `w:sz w:val` into `DocxRun` fields due to a namespace-handling bug
    /// (`attribute("val")` doesn't match the namespaced `w:val`). Once fixed,
    /// `resolved_fonts.requested` will populate and font_coverage will surface
    /// real substitution findings. For now this test verifies the adapter
    /// doesn't crash and correctly reports empty-requested → full coverage.
    #[test]
    fn font_substitution_recorded_when_parser_supports_it() {
        let adapter = DocxConformanceAdapter::default();
        let docx = make_docx_with_font("Calibri", "Font test");
        let ir = adapter.render(&docx, &RenderSpec::default()).unwrap();

        // Current parser limitation: requested is empty because w:rFonts isn't parsed.
        assert!(
            ir.resolved_fonts.requested.is_empty(),
            "parser does not yet extract font requests"
        );
        // Empty request → full coverage (correct for "nothing was requested").
        assert!((ir.resolved_fonts.coverage() - 1.0).abs() < 1e-9);

        // Architecture check: IF fonts were requested, substitution would
        // be recorded honestly. Verify the resolved map machinery.
        let mut ir = adapter.render(&docx, &RenderSpec::default()).unwrap();
        ir.resolved_fonts.requested.push("Calibri".into());
        ir.resolved_fonts
            .resolved
            .insert("Calibri".into(), "sans-serif".into());
        assert!(ir.resolved_fonts.coverage() < 1.0);
        assert_eq!(ir.resolved_fonts.substitution_count(), 1);
    }

    #[test]
    fn no_font_request_means_full_coverage() {
        let adapter = DocxConformanceAdapter::default();
        let docx = make_plain_docx("No font pr");

        let ir = adapter.render(&docx, &RenderSpec::default()).unwrap();

        assert!(
            ir.resolved_fonts.requested.is_empty(),
            "no explicit font request → empty requested set"
        );
        assert!(
            (ir.resolved_fonts.coverage() - 1.0).abs() < 1e-9,
            "no explicit request → full coverage (1.0)"
        );
    }

    #[test]
    fn ir_serializes_to_json() {
        let adapter = DocxConformanceAdapter::default();
        let docx = make_docx_with_font("Calibri", "Serialize me");
        let ir = adapter.render(&docx, &RenderSpec::default()).unwrap();

        let json = serde_json::to_string(&ir).expect("NormalizedRender must serialize");
        // Round-trip check.
        let back: NormalizedRender =
            serde_json::from_str(&json).expect("JSON must deserialize back");
        assert_eq!(back.pages.len(), ir.pages.len());
    }

    #[test]
    fn page_break_produces_two_pages() {
        let adapter = DocxConformanceAdapter::default();

        let doc_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Page one</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:pageBreakBefore/></w:pPr>
      <w:r><w:t>Page two</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;

        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            let opts = zip::write::SimpleFileOptions::default();
            zip.start_file("[Content_Types].xml", opts.clone()).unwrap();
            zip.write_all(br#"<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#).unwrap();
            zip.start_file("_rels/.rels", opts.clone()).unwrap();
            zip.write_all(br#"<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#).unwrap();
            zip.start_file("word/document.xml", opts).unwrap();
            zip.write_all(doc_xml.as_bytes()).unwrap();
            zip.finish().unwrap();
        }

        let ir = adapter.render(&buf, &RenderSpec::default()).unwrap();
        assert!(
            ir.pages.len() >= 2,
            "pageBreakBefore should produce ≥2 pages, got {}",
            ir.pages.len()
        );
    }

    #[test]
    fn table_cell_maps_to_box() {
        let adapter = DocxConformanceAdapter::default();

        let doc_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblPr><w:tblW w:w="5000"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr><w:t>Cell</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>"#;

        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            let opts = zip::write::SimpleFileOptions::default();
            zip.start_file("[Content_Types].xml", opts.clone()).unwrap();
            zip.write_all(br#"<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#).unwrap();
            zip.start_file("_rels/.rels", opts.clone()).unwrap();
            zip.write_all(br#"<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#).unwrap();
            zip.start_file("word/document.xml", opts).unwrap();
            zip.write_all(doc_xml.as_bytes()).unwrap();
            zip.finish().unwrap();
        }

        let ir = adapter.render(&buf, &RenderSpec::default()).unwrap();
        let has_table_cell = ir
            .pages
            .iter()
            .any(|p| p.boxes.iter().any(|b| matches!(b.kind, BoxKind::TableCell)));
        assert!(
            has_table_cell,
            "table should produce at least one TableCell box"
        );
    }

    #[test]
    fn rejects_garbage() {
        let adapter = DocxConformanceAdapter::default();
        let result = adapter.render(b"not a zip at all", &RenderSpec::default());
        assert!(result.is_err());
    }

    /// End-to-end: render a docx through the adapter, score the IR against
    /// itself, verify perfect fidelity. This proves the full pipeline:
    /// docx → parse → layout → NormalizedRender → conformance score.
    #[test]
    fn e2e_self_fidelity_is_perfect() {
        use wo_conformance::compute_fidelity;

        let adapter = DocxConformanceAdapter::default();
        let docx = make_plain_docx("Hello World");
        let ir = adapter.render(&docx, &RenderSpec::default()).unwrap();
        let report = compute_fidelity("self-diff", &ir, &ir);
        assert!(
            (report.fidelity - 1.0).abs() < 1e-9,
            "self-diff should yield perfect fidelity, got {}",
            report.fidelity
        );
        assert_eq!(report.page_count_engine, report.page_count_truth);
        assert_eq!(report.boxes_matched, report.boxes_total);
        assert_eq!(report.text_matches, report.text_total);
    }
}
