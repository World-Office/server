//! PDF → [`NormalizedRender`] projection.
//!
//! The oracle adapters (OnlyOffice, LibreOffice) produce PDF; this module turns
//! PDF geometry into the normalized box tree so engines become comparable.
//!
//! Projection policy:
//! - `pdftotext -bbox-layout` (poppler) is the geometry source: machine-generated
//!   XHTML with `page` → `flow` → `block` → `line` → `word`, coordinates in
//!   points, **top-left origin, y down** — matching Word-like layout conventions.
//! - `line` becomes one [`LayoutBox`] with `BoxKind::Paragraph`; `word`s become
//!   its [`GlyphRun`]s.
//! - poppler's bbox mode does not report fonts; `GlyphRun.font` is empty and
//!   `size_pt` is the line height. [`crate::model::ResolvedFonts`] stays empty
//!   (treated as full coverage) — font attribution must come from the engine
//!   itself, not the projection.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::model::{
    BoxKind, ConformanceError, GlyphRun, LayoutBox, NormalizedRender, Page, PageSize, Point,
    RenderMetadata,
};

/// A source that extracts layout geometry from PDF bytes.
pub trait PdfGeometrySource {
    fn extract(&self, pdf: &[u8]) -> Result<NormalizedRender, ConformanceError>;
}

/// Geometry source backed by `pdftotext -bbox-layout` (poppler-utils).
pub struct PopplerSource {
    pdftotext: PathBuf,
}

impl PopplerSource {
    /// Uses `pdftotext` from `PATH`.
    pub fn new() -> Result<Self, ConformanceError> {
        Self::at(Path::new("pdftotext"))
    }

    pub fn at(pdftotext: &Path) -> Result<Self, ConformanceError> {
        Ok(Self {
            pdftotext: pdftotext.to_path_buf(),
        })
    }
}

impl Default for PopplerSource {
    fn default() -> Self {
        Self::new().expect("pdftotext not found in PATH")
    }
}

impl PdfGeometrySource for PopplerSource {
    fn extract(&self, pdf: &[u8]) -> Result<NormalizedRender, ConformanceError> {
        let xml = run_pdftotext(&self.pdftotext, pdf)?;
        // pdftotext emits an XHTML DOCTYPE; roxmltree needs allow_dtd to accept it.
        let doc = roxmltree::Document::parse_with_options(
            &xml,
            roxmltree::ParsingOptions {
                allow_dtd: true,
                ..roxmltree::ParsingOptions::default()
            },
        )
        .map_err(|e| {
            ConformanceError::RenderFailed(format!("pdftotext bbox output is not valid XML: {e}"))
        })?;
        project(&doc)
    }
}

fn run_pdftotext(bin: &Path, pdf: &[u8]) -> Result<String, ConformanceError> {
    use std::io::Write;
    let mut child = Command::new(bin)
        .args(["-bbox-layout", "-", "-"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            ConformanceError::RenderFailed(format!(
                "failed to launch {}: {e} (is poppler-utils installed?)",
                bin.display()
            ))
        })?;
    child
        .stdin
        .as_mut()
        .expect("piped stdin")
        .write_all(pdf)
        .map_err(ConformanceError::InputIo)?;
    let out = child
        .wait_with_output()
        .map_err(ConformanceError::InputIo)?;
    if !out.status.success() {
        return Err(ConformanceError::RenderFailed(format!(
            "pdftotext exited with {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Project the parsed bbox XHTML into a [`NormalizedRender`].
fn project(doc: &roxmltree::Document) -> Result<NormalizedRender, ConformanceError> {
    let mut pages = Vec::new();
    for page in doc.descendants().filter(|n| n.has_tag_name("page")) {
        let size = PageSize {
            width_pt: attr_f64(page, "width")?,
            height_pt: attr_f64(page, "height")?,
        };
        let mut boxes = Vec::new();
        for line in page.descendants().filter(|n| n.has_tag_name("line")) {
            let origin = Point {
                x_pt: attr_f64(line, "xMin")?,
                y_pt: attr_f64(line, "yMin")?,
            };
            let size = PageSize {
                width_pt: attr_f64(line, "xMax")? - origin.x_pt,
                height_pt: attr_f64(line, "yMax")? - origin.y_pt,
            };
            let mut runs: Vec<GlyphRun> = Vec::new();
            for w in line.descendants().filter(|n| n.has_tag_name("word")) {
                runs.push(GlyphRun {
                    text: w.text().unwrap_or_default().trim().to_string(),
                    font: String::new(),
                    size_pt: size.height_pt,
                    weight: 400,
                    italic: false,
                    // Run origin approximates the text BASELINE (bbox top +
                    // ~0.78 line height), matching how PyMuPDF-based reference
                    // truths report runs. Box origins stay bbox top-left.
                    origin: Point {
                        x_pt: attr_f64(w, "xMin")?,
                        y_pt: attr_f64(w, "yMin")? + 0.78 * size.height_pt,
                    },
                });
            }
            if runs.is_empty() {
                continue;
            }
            boxes.push(LayoutBox {
                kind: BoxKind::Paragraph,
                origin,
                size,
                runs,
            });
        }
        pages.push(Page {
            index: pages.len(),
            size,
            boxes,
        });
    }

    Ok(NormalizedRender {
        pages,
        resolved_fonts: Default::default(),
        metadata: RenderMetadata {
            engine: "pdf-projection".into(),
            engine_version: "poppler-bbox".into(),
            captured_at: String::new(),
            environment: String::new(),
        },
    })
}

fn attr_f64(node: roxmltree::Node<'_, '_>, name: &str) -> Result<f64, ConformanceError> {
    node.attribute(name)
        .and_then(|v| v.parse::<f64>().ok())
        .ok_or_else(|| {
            ConformanceError::RenderFailed(format!(
                "pdftotext bbox output: <{}> missing/invalid @{name}",
                node.tag_name().name()
            ))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The projection must not invent boxes for whitespace-only lines.
    #[test]
    fn empty_word_list_is_skipped() {
        let xml = r#"<html xmlns="http://www.w3.org/1999/xhtml"><doc>
            <page width="612.0" height="792.0"><flow>
              <block xMin="1" yMin="2" xMax="3" yMax="4"><line xMin="1" yMin="2" xMax="3" yMax="4"></line></block>
              <block xMin="5" yMin="6" xMax="7" yMax="8"><line xMin="5" yMin="6" xMax="7" yMax="8">
                <word xMin="5" yMin="6" xMax="7" yMax="8">hi</word>
              </line></block>
            </flow></page></doc></html>"#;
        let render = project(&roxmltree::Document::parse(xml).unwrap()).unwrap();
        assert_eq!(render.pages.len(), 1);
        assert_eq!(render.pages[0].boxes.len(), 1);
        assert_eq!(render.pages[0].boxes[0].runs[0].text, "hi");
    }
}
