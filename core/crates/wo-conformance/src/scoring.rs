//! Fidelity scoring.
//!
//! The heart of the harness. Given an engine's [`NormalizedRender`] and a
//! ground-truth render, produce a [`ConformanceReport`] that is decomposable —
//! a composite score plus a breakdown that says *what kind* of wrong, so a low
//! score always points at a cause (layout vs. content vs. style vs. fonts).
//!
//! See strategy doc §4 for the weighting rationale.

use serde::{Deserialize, Serialize};

use crate::model::{GlyphRun, NormalizedRender, Page, GEOMETRY_TOLERANCE_PT};

/// Weights for the composite fidelity score. Must sum to 1.0.
pub const W_GEOMETRY: f64 = 0.30;
pub const W_TEXT: f64 = 0.30;
pub const W_STYLE: f64 = 0.25;
pub const W_FONT_COVERAGE: f64 = 0.15;

/// A computed fidelity breakdown for one case.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FidelityBreakdown {
    /// Fraction of ground-truth boxes whose position+size match within tolerance.
    pub geometry: f64,
    /// Fraction of matched boxes whose concatenated run text matches.
    pub text: f64,
    /// Fraction of runs in matched boxes whose style matches.
    pub style: f64,
    /// Fraction of the document's requested fonts the engine satisfied without substitution.
    pub font_coverage: f64,
}

impl FidelityBreakdown {
    /// Weighted composite in `[0.0, 1.0]`.
    pub fn composite(&self) -> f64 {
        self.geometry * W_GEOMETRY
            + self.text * W_TEXT
            + self.style * W_STYLE
            + self.font_coverage * W_FONT_COVERAGE
    }
}

/// Report for a single conformance case.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseReport {
    pub case_name: String,
    pub engine: String,
    pub engine_version: String,
    pub truth_source: String,
    pub page_count_engine: usize,
    pub page_count_truth: usize,
    pub boxes_total: usize,
    pub boxes_matched: usize,
    pub text_matches: usize,
    pub text_total: usize,
    pub style_matches: usize,
    pub style_total: usize,
    pub font_substitutions: usize,
    /// Requested fonts the engine substituted or could not find.
    pub missing_fonts: Vec<String>,
    /// Composite fidelity in `[0.0, 1.0]`.
    pub fidelity: f64,
    pub breakdown: FidelityBreakdown,
    pub notes: Vec<String>,
    /// Which scoring mode produced this report.
    #[serde(default)]
    pub scoring_mode: ScoringMode,
}

/// Aggregate report over a corpus run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConformanceReport {
    pub engine: String,
    pub engine_version: String,
    pub truth_source: String,
    pub case_count: usize,
    /// Arithmetic mean of per-case fidelity.
    pub mean_fidelity: f64,
    /// Lowest per-case fidelity (the worst regression).
    pub min_fidelity: f64,
    pub cases: Vec<CaseReport>,
}

impl ConformanceReport {
    /// Build an aggregate report from per-case reports.
    pub fn from_cases(cases: Vec<CaseReport>) -> Self {
        let case_count = cases.len();
        let (mean_fidelity, min_fidelity) = if case_count == 0 {
            (0.0, 0.0)
        } else {
            let fids: Vec<f64> = cases.iter().map(|c| c.fidelity).collect();
            (
                fids.iter().sum::<f64>() / case_count as f64,
                fids.iter().cloned().fold(f64::INFINITY, f64::min),
            )
        };
        let (engine, engine_version, truth_source) = cases
            .first()
            .map(|c| {
                (
                    c.engine.clone(),
                    c.engine_version.clone(),
                    c.truth_source.clone(),
                )
            })
            .unwrap_or_default();
        Self {
            engine,
            engine_version,
            truth_source,
            case_count,
            mean_fidelity,
            min_fidelity,
            cases,
        }
    }
}

/// Compare an engine render against ground truth and produce a case report.
/// Uses box-level matching (greedy nearest-neighbor).
pub fn compute_fidelity(
    case_name: &str,
    engine_render: &NormalizedRender,
    truth: &NormalizedRender,
) -> CaseReport {
    let breakdown = score_box_level(engine_render, truth);
    let notes = breakdown_notes(engine_render, truth, &breakdown);
    build_report(
        case_name,
        engine_render,
        truth,
        breakdown,
        notes,
        ScoringMode::Box,
    )
}

/// Cross-engine comparison using run-level text matching.
///
/// Different engines produce different box segmentations (e.g. LibreOffice
/// merges paragraphs into single blocks while the renderer keeps them separate).
/// Run-level matching flattens all runs per page and matches by text content,
/// avoiding the geometry mismatch that box-level matching would penalize.
pub fn compute_fidelity_cross_engine(
    case_name: &str,
    engine_render: &NormalizedRender,
    truth: &NormalizedRender,
) -> CaseReport {
    let breakdown = score_run_level(engine_render, truth);
    let notes = breakdown_notes(engine_render, truth, &breakdown);
    build_report(
        case_name,
        engine_render,
        truth,
        breakdown,
        notes,
        ScoringMode::Run,
    )
}

/// Which scoring mode was used.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum ScoringMode {
    #[default]
    Box,
    Run,
}

/// Internal breakdown with optional notes.
struct ScoreBreakdown {
    geometry: f64,
    text: f64,
    style: f64,
    font_coverage: f64,
    matched: usize,
    total: usize,
    text_matches: usize,
    text_total: usize,
    style_matches: usize,
    style_total: usize,
    font_substitutions: usize,
    missing_fonts: Vec<String>,
}

/// Box-level scoring: greedy nearest-neighbor by origin.
fn score_box_level(engine_render: &NormalizedRender, truth: &NormalizedRender) -> ScoreBreakdown {
    let comparable_pages = engine_render.pages.len().min(truth.pages.len());
    let mut boxes_total = 0usize;
    let mut boxes_matched = 0usize;
    let mut text_matches = 0usize;
    let mut text_total = 0usize;
    let mut style_matches = 0usize;
    let mut style_total = 0usize;

    for i in 0..comparable_pages {
        let e_page = &engine_render.pages[i];
        let t_page = &truth.pages[i];
        let (bt, bm, txt_m, txt_t, st_m, st_t) = score_page_boxes(e_page, t_page);
        boxes_total += bt;
        boxes_matched += bm;
        text_matches += txt_m;
        text_total += txt_t;
        style_matches += st_m;
        style_total += st_t;
    }

    // Truth boxes on pages the engine didn't produce at all count as unmatched.
    for page in truth.pages.iter().skip(comparable_pages) {
        boxes_total += page.boxes.len();
    }

    let geometry = ratio(boxes_matched, boxes_total);
    let text = ratio(text_matches, text_total);
    let style = ratio(style_matches, style_total);

    let (font_substitutions, missing_fonts, font_coverage) =
        score_font_coverage(engine_render, truth);

    ScoreBreakdown {
        geometry,
        text,
        style,
        font_coverage,
        matched: boxes_matched,
        total: boxes_total,
        text_matches,
        text_total,
        style_matches,
        style_total,
        font_substitutions,
        missing_fonts,
    }
}

/// Run-level scoring: flatten all boxes into runs per page, match by text content.
///
/// Uses a relaxed geometry tolerance (15pt) because different engines position
/// text differently. Text is matched by content (greedy left-to-right).
/// Unmatched truth runs penalize text and geometry but not style (no counterpart).
fn score_run_level(engine_render: &NormalizedRender, truth: &NormalizedRender) -> ScoreBreakdown {
    const CROSS_GEO_TOL: f64 = 15.0;

    let comparable_pages = engine_render.pages.len().min(truth.pages.len());
    let mut geo_matches = 0usize;
    let mut geo_total = 0usize;
    let mut text_matches = 0usize;
    let mut text_total = 0usize;
    let mut style_matches = 0usize;
    let mut style_total = 0usize;

    for i in 0..comparable_pages {
        let e_page = &engine_render.pages[i];
        let t_page = &truth.pages[i];

        // Flatten runs per page
        let e_runs: Vec<&GlyphRun> = e_page.boxes.iter().flat_map(|b| b.runs.iter()).collect();
        let t_runs: Vec<&GlyphRun> = t_page.boxes.iter().flat_map(|b| b.runs.iter()).collect();

        let mut used = vec![false; e_runs.len()];
        for tr in &t_runs {
            text_total += 1;
            geo_total += 1;

            // Greedy left-to-right text match
            let best_j =
                (0..e_runs.len()).find(|&j| !used[j] && e_runs[j].text.trim() == tr.text.trim());

            if let Some(j) = best_j {
                used[j] = true;
                text_matches += 1;
                style_total += 1;
                if style_match(e_runs[j], tr) {
                    style_matches += 1;
                }
                // Geometry: relaxed tolerance for cross-engine
                let dx = (e_runs[j].origin.x_pt - tr.origin.x_pt).abs();
                let dy = (e_runs[j].origin.y_pt - tr.origin.y_pt).abs();
                if dx <= CROSS_GEO_TOL && dy <= CROSS_GEO_TOL {
                    geo_matches += 1;
                }
            }
        }
    }

    // Unmatched truth pages: count runs as failures for text/geometry.
    for page in truth.pages.iter().skip(comparable_pages) {
        for b in &page.boxes {
            for _ in &b.runs {
                text_total += 1;
                geo_total += 1;
            }
        }
    }

    let geometry = ratio(geo_matches, geo_total);
    let text = ratio(text_matches, text_total);
    let style = ratio(style_matches, style_total);

    let (font_substitutions, missing_fonts, font_coverage) =
        score_font_coverage(engine_render, truth);

    ScoreBreakdown {
        geometry,
        text,
        style,
        font_coverage,
        matched: geo_matches,
        total: geo_total,
        text_matches,
        text_total,
        style_matches,
        style_total,
        font_substitutions,
        missing_fonts,
    }
}

/// Compute font coverage: what fraction of truth's requested fonts did the engine satisfy?
fn score_font_coverage(
    engine_render: &NormalizedRender,
    truth: &NormalizedRender,
) -> (usize, Vec<String>, f64) {
    let mut missing_fonts = Vec::new();
    for req in &truth.resolved_fonts.requested {
        let ok = engine_render
            .resolved_fonts
            .resolved
            .get(req)
            .is_some_and(|got| got == req)
            && !engine_render.resolved_fonts.unavailable.contains(req);
        if !ok {
            missing_fonts.push(req.clone());
        }
    }
    missing_fonts.sort();
    missing_fonts.dedup();
    let font_substitutions = missing_fonts.len();
    let requested = truth.resolved_fonts.requested.len();
    let font_coverage = if requested == 0 {
        1.0
    } else {
        (requested - font_substitutions) as f64 / requested as f64
    };
    (font_substitutions, missing_fonts, font_coverage)
}

/// Generate notes for a scoring breakdown.
fn breakdown_notes(
    engine_render: &NormalizedRender,
    truth: &NormalizedRender,
    breakdown: &ScoreBreakdown,
) -> Vec<String> {
    let mut notes = Vec::new();
    if engine_render.pages.len() != truth.pages.len() {
        notes.push(format!(
            "page count differs: engine={} truth={}",
            engine_render.pages.len(),
            truth.pages.len()
        ));
    }
    if breakdown.font_substitutions > 0 {
        notes.push(format!(
            "font substitution / missing: {}",
            breakdown.missing_fonts.join(", ")
        ));
    }
    notes
}

/// Build a CaseReport from a ScoreBreakdown.
fn build_report(
    case_name: &str,
    engine_render: &NormalizedRender,
    truth: &NormalizedRender,
    breakdown: ScoreBreakdown,
    notes: Vec<String>,
    scoring_mode: ScoringMode,
) -> CaseReport {
    let fb = FidelityBreakdown {
        geometry: breakdown.geometry,
        text: breakdown.text,
        style: breakdown.style,
        font_coverage: breakdown.font_coverage,
    };
    CaseReport {
        case_name: case_name.to_string(),
        engine: engine_render.metadata.engine.clone(),
        engine_version: engine_render.metadata.engine_version.clone(),
        truth_source: truth.metadata.engine.clone(),
        page_count_engine: engine_render.pages.len(),
        page_count_truth: truth.pages.len(),
        boxes_matched: breakdown.matched,
        boxes_total: breakdown.total,
        text_matches: breakdown.text_matches,
        text_total: breakdown.text_total,
        style_matches: breakdown.style_matches,
        style_total: breakdown.style_total,
        font_substitutions: breakdown.font_substitutions,
        missing_fonts: breakdown.missing_fonts,
        fidelity: fb.composite(),
        breakdown: fb,
        notes,
        scoring_mode,
    }
}

/// Score box matching for a single page.
///
/// Greedy nearest-neighbour: each truth box is paired with the closest
/// still-unmatched engine box by origin. A pair counts as a geometry match
/// only if origin + size are both within tolerance. For matched pairs we then
/// score concatenated text equality and per-run style.
fn score_page_boxes(
    engine_page: &Page,
    truth_page: &Page,
) -> (usize, usize, usize, usize, usize, usize) {
    // (boxes_total, boxes_matched, text_matches, text_total, style_matches, style_total)
    let boxes_total = truth_page.boxes.len();
    if engine_page.boxes.is_empty() {
        return (boxes_total, 0, 0, 0, 0, 0);
    }

    let mut used = vec![false; engine_page.boxes.len()];
    let mut boxes_matched = 0usize;
    let mut text_matches = 0usize;
    let mut text_total = 0usize;
    let mut style_matches = 0usize;
    let mut style_total = 0usize;

    for tbox in &truth_page.boxes {
        // Nearest unused engine box by origin distance.
        let best = (0..engine_page.boxes.len())
            .filter(|&j| !used[j])
            .min_by(|&a, &b| {
                let da = engine_page.boxes[a].origin.distance(tbox.origin);
                let db = engine_page.boxes[b].origin.distance(tbox.origin);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        let Some(j) = best else { continue };
        let ebox = &engine_page.boxes[j];

        if ebox.approx_eq(tbox, GEOMETRY_TOLERANCE_PT) {
            boxes_matched += 1;
            used[j] = true;

            // Text score: concatenated run text equality.
            let e_text: String = ebox.runs.iter().map(|r| r.text.as_str()).collect();
            let t_text: String = tbox.runs.iter().map(|r| r.text.as_str()).collect();
            text_total += 1;
            if e_text == t_text {
                text_matches += 1;
            }

            // Style score: zip runs by index, compare style fields.
            for (er, tr) in ebox.runs.iter().zip(tbox.runs.iter()) {
                style_total += 1;
                if style_match(er, tr) {
                    style_matches += 1;
                }
            }
            // Extra truth runs (engine produced fewer) count as misses.
            if tbox.runs.len() > ebox.runs.len() {
                style_total += tbox.runs.len() - ebox.runs.len();
            }
        }
        // An unmatched truth box contributes to boxes_total but not matches;
        // its runs are not scored for style (no engine counterpart to compare).
    }

    (
        boxes_total,
        boxes_matched,
        text_matches,
        text_total,
        style_matches,
        style_total,
    )
}

/// Two runs are style-equal if family matches, size is within 0.5 pt, and
/// weight + italic match. Text content is scored separately.
fn style_match(a: &GlyphRun, b: &GlyphRun) -> bool {
    a.font == b.font
        && (a.size_pt - b.size_pt).abs() <= 0.5
        && a.weight == b.weight
        && a.italic == b.italic
}

fn ratio(num: usize, den: usize) -> f64 {
    if den == 0 {
        1.0
    } else {
        num as f64 / den as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ratio_empty_denominator_is_perfect() {
        assert_eq!(ratio(0, 0), 1.0);
        assert_eq!(ratio(5, 0), 1.0);
    }

    #[test]
    fn breakdown_composite_uses_weights() {
        let b = FidelityBreakdown {
            geometry: 1.0,
            text: 1.0,
            style: 1.0,
            font_coverage: 1.0,
        };
        assert!((b.composite() - 1.0).abs() < 1e-12);

        let b = FidelityBreakdown {
            geometry: 0.0,
            text: 0.0,
            style: 0.0,
            font_coverage: 0.0,
        };
        assert!(b.composite().abs() < 1e-12);
    }

    // ----------------------------------------------------------------
    // Phase 3: Attribution tests
    // Each test creates a known-bad scenario and verifies the score
    // attributes to the correct dimension.
    // ----------------------------------------------------------------

    fn _test_render(engine: &str, version: &str) -> NormalizedRender {
        NormalizedRender::test_default(engine, version)
    }

    /// Helper: create a simple truth with one page, one box, one run.
    fn simple_truth(
        text: &str,
        font: &str,
        size: f64,
        weight: u16,
        italic: bool,
        fonts_requested: Vec<String>,
        fonts_resolved: Vec<(String, String)>,
    ) -> NormalizedRender {
        let mut nr = NormalizedRender::test_default("truth-engine", "1.0");
        nr.pages.push(Page {
            index: 0,
            size: crate::model::PageSize {
                width_pt: 595.0,
                height_pt: 842.0,
            },
            boxes: vec![crate::model::LayoutBox {
                kind: crate::model::BoxKind::Paragraph,
                origin: crate::model::Point {
                    x_pt: 72.0,
                    y_pt: 72.0,
                },
                size: crate::model::PageSize {
                    width_pt: 100.0,
                    height_pt: 14.0,
                },
                runs: vec![GlyphRun {
                    text: text.to_string(),
                    font: font.to_string(),
                    size_pt: size,
                    weight,
                    italic,
                    origin: crate::model::Point {
                        x_pt: 72.0,
                        y_pt: 72.0,
                    },
                }],
            }],
        });
        nr.resolved_fonts.requested = fonts_requested;
        for (req, res) in fonts_resolved {
            nr.resolved_fonts.resolved.insert(req, res);
        }
        nr
    }

    /// Helper: create a simple engine render matching the truth structure.
    fn simple_engine(
        text: &str,
        font: &str,
        size: f64,
        weight: u16,
        italic: bool,
        fonts_requested: Vec<String>,
        fonts_resolved: Vec<(String, String)>,
    ) -> NormalizedRender {
        let mut nr = NormalizedRender::test_default("engine", "1.0");
        nr.pages.push(Page {
            index: 0,
            size: crate::model::PageSize {
                width_pt: 595.0,
                height_pt: 842.0,
            },
            boxes: vec![crate::model::LayoutBox {
                kind: crate::model::BoxKind::Paragraph,
                origin: crate::model::Point {
                    x_pt: 72.0,
                    y_pt: 72.0,
                },
                size: crate::model::PageSize {
                    width_pt: 100.0,
                    height_pt: 14.0,
                },
                runs: vec![GlyphRun {
                    text: text.to_string(),
                    font: font.to_string(),
                    size_pt: size,
                    weight,
                    italic,
                    origin: crate::model::Point {
                        x_pt: 72.0,
                        y_pt: 72.0,
                    },
                }],
            }],
        });
        nr.resolved_fonts.requested = fonts_requested;
        for (req, res) in fonts_resolved {
            nr.resolved_fonts.resolved.insert(req, res);
        }
        nr
    }

    /// A perfectly matching document should score 1.0 on all dimensions.
    #[test]
    fn attribution_perfect_match() {
        let truth = simple_truth(
            "Hello",
            "Calibri",
            11.0,
            400,
            false,
            vec!["Calibri".to_string()],
            vec![("Calibri".to_string(), "Calibri".to_string())],
        );
        let engine = simple_engine(
            "Hello",
            "Calibri",
            11.0,
            400,
            false,
            vec!["Calibri".to_string()],
            vec![("Calibri".to_string(), "Calibri".to_string())],
        );
        let report = compute_fidelity("perfect", &engine, &truth);
        assert_eq!(report.fidelity, 1.0);
        assert_eq!(report.breakdown.geometry, 1.0);
        assert_eq!(report.breakdown.text, 1.0);
        assert_eq!(report.breakdown.style, 1.0);
        assert_eq!(report.breakdown.font_coverage, 1.0);
        assert!(report.missing_fonts.is_empty());
    }

    /// Font substitution should ONLY affect font_coverage, not other dimensions.
    #[test]
    fn attribution_font_substitution_only() {
        let truth = simple_truth(
            "Hello",
            "Times New Roman",
            11.0,
            400,
            false,
            vec!["Times New Roman".to_string()],
            vec![("Times New Roman".to_string(), "Times New Roman".to_string())],
        );
        // Engine substitutes with sans-serif
        let engine = simple_engine(
            "Hello",
            "sans-serif",
            11.0,
            400,
            false,
            vec!["Times New Roman".to_string()],
            vec![("Times New Roman".to_string(), "sans-serif".to_string())],
        );
        let report = compute_fidelity("font-sub", &engine, &truth);
        // geometry, text, style should all be 1.0 (exact match)
        assert_eq!(report.breakdown.geometry, 1.0, "geometry should be perfect");
        assert_eq!(report.breakdown.text, 1.0, "text should be perfect");
        // Style: font doesn't match (Times vs sans-serif), so style=0.0
        // This is expected — font mismatch IS a style mismatch.
        assert_eq!(
            report.breakdown.style, 0.0,
            "style should flag font mismatch"
        );
        assert_eq!(
            report.breakdown.font_coverage, 0.0,
            "font_coverage should be 0"
        );
        assert_eq!(report.missing_fonts, vec!["Times New Roman"]);
        // Fidelity = 0.30*1.0 + 0.30*1.0 + 0.25*0.0 + 0.15*0.0 = 0.60
        assert!(
            (report.fidelity - 0.60).abs() < 1e-12,
            "fidelity should be 0.60, got {}",
            report.fidelity
        );
    }

    /// Layout shift (box position changed) should ONLY affect geometry.
    #[test]
    fn attribution_layout_shift_only() {
        let truth = simple_truth("Hello", "Calibri", 11.0, 400, false, vec![], vec![]);
        let mut engine = simple_engine("Hello", "Calibri", 11.0, 400, false, vec![], vec![]);
        // Shift the box 100pt down (way beyond 2pt tolerance)
        engine.pages[0].boxes[0].origin.y_pt = 172.0;
        engine.pages[0].boxes[0].runs[0].origin.y_pt = 172.0;
        let report = compute_fidelity("layout-shift", &engine, &truth);
        assert_eq!(report.breakdown.geometry, 0.0, "geometry should be 0");
        // Text and style are NOT scored for unmatched boxes, so they're 1.0
        // (no matched pairs → ratio(0,0)=1.0)
        assert_eq!(report.breakdown.text, 1.0);
        assert_eq!(report.breakdown.style, 1.0);
        assert_eq!(report.breakdown.font_coverage, 1.0);
        // Fidelity = 0.30*0.0 + 0.30*1.0 + 0.25*1.0 + 0.15*1.0 = 0.70
        assert!(
            (report.fidelity - 0.70).abs() < 1e-12,
            "fidelity should be 0.70, got {}",
            report.fidelity
        );
    }

    /// Content divergence (wrong text) should affect text only.
    #[test]
    fn attribution_content_divergence_only() {
        let truth = simple_truth("Hello World", "Calibri", 11.0, 400, false, vec![], vec![]);
        let engine = simple_engine("Goodbye World", "Calibri", 11.0, 400, false, vec![], vec![]);
        let report = compute_fidelity("content-div", &engine, &truth);
        assert_eq!(report.breakdown.geometry, 1.0, "geometry should be perfect");
        assert_eq!(
            report.breakdown.text, 0.0,
            "text should be 0 (wrong content)"
        );
        assert_eq!(
            report.breakdown.style, 1.0,
            "style should be perfect (font matches)"
        );
        assert_eq!(report.breakdown.font_coverage, 1.0);
        // Fidelity = 0.30*1.0 + 0.30*0.0 + 0.25*1.0 + 0.15*1.0 = 0.70
        assert!(
            (report.fidelity - 0.70).abs() < 1e-12,
            "fidelity should be 0.70, got {}",
            report.fidelity
        );
    }

    /// Style divergence (wrong weight) should affect style only.
    #[test]
    fn attribution_style_weight_only() {
        let truth = simple_truth(
            "Hello",
            "Calibri",
            11.0,
            400,
            false,
            vec!["Calibri".to_string()],
            vec![("Calibri".to_string(), "Calibri".to_string())],
        );
        let engine = simple_engine(
            "Hello",
            "Calibri",
            11.0,
            700,
            true, // bold + italic instead of normal
            vec!["Calibri".to_string()],
            vec![("Calibri".to_string(), "Calibri".to_string())],
        );
        let report = compute_fidelity("style-weight", &engine, &truth);
        assert_eq!(report.breakdown.geometry, 1.0);
        assert_eq!(report.breakdown.text, 1.0);
        assert_eq!(
            report.breakdown.style, 0.0,
            "style should be 0 (wrong weight/italic)"
        );
        assert_eq!(report.breakdown.font_coverage, 1.0);
        // Fidelity = 0.30*1.0 + 0.30*1.0 + 0.25*0.0 + 0.15*1.0 = 0.75
        assert!(
            (report.fidelity - 0.75).abs() < 1e-12,
            "fidelity should be 0.75, got {}",
            report.fidelity
        );
    }

    /// Multiple missing fonts should all be listed.
    #[test]
    fn attribution_multiple_missing_fonts() {
        let truth = simple_truth(
            "Hello",
            "Calibri",
            11.0,
            400,
            false,
            vec![
                "Arial".to_string(),
                "Courier New".to_string(),
                "Georgia".to_string(),
            ],
            vec![
                ("Arial".to_string(), "Arial".to_string()),
                ("Courier New".to_string(), "Courier New".to_string()),
                ("Georgia".to_string(), "Georgia".to_string()),
            ],
        );
        // Engine has none of these fonts
        let engine = simple_engine(
            "Hello",
            "sans-serif",
            11.0,
            400,
            false,
            vec![
                "Arial".to_string(),
                "Courier New".to_string(),
                "Georgia".to_string(),
            ],
            vec![
                ("Arial".to_string(), "sans-serif".to_string()),
                ("Courier New".to_string(), "sans-serif".to_string()),
                ("Georgia".to_string(), "sans-serif".to_string()),
            ],
        );
        let report = compute_fidelity("multi-fonts", &engine, &truth);
        assert_eq!(report.font_substitutions, 3);
        assert_eq!(
            report.missing_fonts,
            vec!["Arial", "Courier New", "Georgia"]
        );
        assert_eq!(report.breakdown.font_coverage, 0.0);
    }

    /// Extra engine pages should not affect matched-page scores.
    #[test]
    fn attribution_extra_engine_pages() {
        let truth = simple_truth("Page 1", "Calibri", 11.0, 400, false, vec![], vec![]);
        let mut engine = simple_engine("Page 1", "Calibri", 11.0, 400, false, vec![], vec![]);
        // Add an extra page
        engine.pages.push(Page {
            index: 1,
            size: crate::model::PageSize {
                width_pt: 595.0,
                height_pt: 842.0,
            },
            boxes: vec![],
        });
        let report = compute_fidelity("extra-pages", &engine, &truth);
        assert_eq!(report.page_count_engine, 2);
        assert_eq!(report.page_count_truth, 1);
        assert_eq!(
            report.breakdown.geometry, 1.0,
            "first page should match perfectly"
        );
        assert_eq!(report.breakdown.text, 1.0);
        assert!(report
            .notes
            .iter()
            .any(|n| n.contains("page count differs")));
    }

    /// Empty document (0 boxes) should score 1.0 on all dimensions.
    #[test]
    fn attribution_empty_document() {
        let truth = NormalizedRender::test_default("truth", "1.0");
        let engine = NormalizedRender::test_default("engine", "1.0");
        let report = compute_fidelity("empty", &engine, &truth);
        assert_eq!(report.fidelity, 1.0, "empty document should be perfect");
        assert_eq!(report.boxes_total, 0);
        assert_eq!(report.boxes_matched, 0);
        assert_eq!(report.text_total, 0);
        assert_eq!(report.style_total, 0);
    }

    /// Engine produces 0 boxes while truth has content → all zeros.
    #[test]
    fn attribution_engine_produces_nothing() {
        let truth = simple_truth("Hello", "Calibri", 11.0, 400, false, vec![], vec![]);
        let engine = NormalizedRender::test_default("engine", "1.0");
        let report = compute_fidelity("no-output", &engine, &truth);
        assert_eq!(report.boxes_total, 1, "truth has 1 box");
        assert_eq!(report.boxes_matched, 0, "engine has 0 boxes");
        assert_eq!(report.breakdown.geometry, 0.0);
        // text/style are 1.0 because ratio(0,0)=1.0 (no matched pairs to fail)
        assert_eq!(report.breakdown.text, 1.0);
        assert_eq!(report.breakdown.style, 1.0);
        assert_eq!(report.breakdown.font_coverage, 1.0);
        // Fidelity = 0.30*0.0 + 0.30*1.0 + 0.25*1.0 + 0.15*1.0 = 0.70
        assert!(
            (report.fidelity - 0.70).abs() < 1e-12,
            "fidelity should be 0.70, got {}",
            report.fidelity
        );
    }

    // ----------------------------------------------------------------
    // Cross-engine (run-level) scoring tests
    // ----------------------------------------------------------------

    /// Cross-engine: engine produces nothing → text=0.0 (unmatched truth runs).
    /// Differs from box-level where unmatched boxes don't penalize text.
    #[test]
    fn cross_engine_no_output_penalizes_text() {
        let truth = simple_truth("Hello", "Calibri", 11.0, 400, false, vec![], vec![]);
        let engine = NormalizedRender::test_default("engine", "1.0");
        let report = compute_fidelity_cross_engine("cross-no-output", &engine, &truth);
        assert_eq!(report.breakdown.geometry, 0.0);
        assert_eq!(
            report.breakdown.text, 0.0,
            "unmatched truth runs should penalize text"
        );
        assert_eq!(report.breakdown.style, 1.0, "no pairs to compare → 1.0");
        assert_eq!(report.scoring_mode, ScoringMode::Run);
        // Fidelity = 0.30*0.0 + 0.30*0.0 + 0.25*1.0 + 0.15*1.0 = 0.40
        assert!(
            (report.fidelity - 0.40).abs() < 1e-12,
            "fidelity should be 0.40, got {}",
            report.fidelity
        );
    }

    /// Cross-engine: perfect match still yields 1.0.
    #[test]
    fn cross_engine_perfect_match() {
        let truth = simple_truth(
            "Hello",
            "Calibri",
            11.0,
            400,
            false,
            vec!["Calibri".to_string()],
            vec![("Calibri".to_string(), "Calibri".to_string())],
        );
        let engine = simple_engine(
            "Hello",
            "Calibri",
            11.0,
            400,
            false,
            vec!["Calibri".to_string()],
            vec![("Calibri".to_string(), "Calibri".to_string())],
        );
        let report = compute_fidelity_cross_engine("cross-perfect", &engine, &truth);
        assert_eq!(report.fidelity, 1.0);
        assert_eq!(report.scoring_mode, ScoringMode::Run);
    }

    // ----------------------------------------------------------------
    // Real-world scenario: truth has font request, engine has empty resolved.
    // This is the actual situation with wo-docx-renderer (parser doesn't
    // extract w:rFonts, so engine.resolved_fonts.resolved is empty).
    // ----------------------------------------------------------------

    #[test]
    fn font_coverage_detects_missing_when_engine_resolved_empty() {
        let truth = simple_truth(
            "Hello",
            "Calibri",
            11.0,
            400,
            false,
            vec!["Arial".to_string()],
            vec![("Arial".to_string(), "Arial".to_string())],
        );
        // Engine has empty resolved (parser bug): requested=[], resolved={}
        let engine = simple_engine("Hello", "sans-serif", 11.0, 400, false, vec![], vec![]);
        let report = compute_fidelity("empty-resolved", &engine, &truth);
        assert_eq!(
            report.breakdown.font_coverage, 0.0,
            "Arial requested but engine has empty resolved → 0% coverage"
        );
        assert_eq!(report.missing_fonts, vec!["Arial"]);
        assert_eq!(report.font_substitutions, 1);
    }
}
