//! Fidelity scoring.
//!
//! The heart of the harness. Given an engine's [`NormalizedRender`] and a
//! ground-truth render, produce a [`ConformanceReport`] that is decomposable —
//! a composite score plus a breakdown that says *what kind* of wrong, so a low
//! score always points at a cause (layout vs. content vs. style vs. fonts).
//!
//! See strategy doc §4 for the weighting rationale.

use serde::{Deserialize, Serialize};

use crate::model::{GlyphRun, LayoutBox, NormalizedRender, Page, GEOMETRY_TOLERANCE_PT};

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

/// One actionable, coordinate-bearing difference between engine and truth.
/// This is what makes a fidelity number diagnosable — see the strategy doc's
/// requirement that reports read like `page 2, table 1: expected y=312.4pt, got 311.8pt`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BoxMismatch {
    /// Zero-based page index.
    pub page: usize,
    /// Lower-cased truth box kind (`paragraph`, `table`, ...).
    pub kind: String,
    /// Human-readable description with expected/got coordinates.
    pub detail: String,
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
    /// Actionable per-box differences (capped; box mode only).
    #[serde(default)]
    pub mismatches: Vec<BoxMismatch>,
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
    let mut mismatches = Vec::new();
    let breakdown = score_box_level(engine_render, truth, &mut mismatches);
    let notes = breakdown_notes(engine_render, truth, &breakdown);
    build_report(
        case_name,
        engine_render,
        truth,
        breakdown,
        notes,
        mismatches,
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
        Vec::new(),
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
fn score_box_level(
    engine_render: &NormalizedRender,
    truth: &NormalizedRender,
    mismatches: &mut Vec<BoxMismatch>,
) -> ScoreBreakdown {
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
        let (bt, bm, txt_m, txt_t, st_m, st_t) = score_page_boxes(i, e_page, t_page, mismatches);
        boxes_total += bt;
        boxes_matched += bm;
        text_matches += txt_m;
        text_total += txt_t;
        style_matches += st_m;
        style_total += st_t;
    }

    // Truth boxes on pages the engine didn't produce at all count as unmatched.
    for (i, page) in truth.pages.iter().enumerate().skip(comparable_pages) {
        boxes_total += page.boxes.len();
        for tbox in &page.boxes {
            mismatches.push(BoxMismatch {
                page: i,
                kind: format!("{:?}", tbox.kind).to_lowercase(),
                detail: "missing: engine did not produce this page".into(),
            });
        }
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

/// Run-level scoring: token-level cross-engine comparison.
///
/// Engines disagree on run segmentation (poppler emits one run per word,
/// PyMuPDF merges a line) and on page setup (A4 vs Letter defaults, margins,
/// baseline-vs-bbox y anchors). This mode therefore compares *relative*
/// layout: whitespace-split text tokens matched greedily left-to-right,
/// geometry judged against the reference page dimensions, style unknown-aware
/// (a projection that cannot see fonts must not be penalized). Absolute
/// geometry fidelity is the box mode's job — within a single projection.
fn score_run_level(engine_render: &NormalizedRender, truth: &NormalizedRender) -> ScoreBreakdown {
    /// Fraction of the reference page dimension a token may move and still count.
    const REL_GEOMETRY_TOL: f64 = 0.05;
    /// poppler reports line height (~1.5–1.9x the font size, font-dependent),
    /// so cross-engine size comparison is a gross-error detector only; the
    /// precise size gate is box mode within a single projection.
    const CROSS_SIZE_TOL_PT: f64 = 1.2;

    struct Token<'a> {
        text: &'a str,
        x_pt: f64,
        y_pt: f64,
        run: &'a GlyphRun,
    }

    /// Split a box's runs into tokens; token origins are distributed
    /// proportionally across the box width (accurate for both poppler word
    /// boxes and PyMuPDF line boxes).
    fn box_tokens<'a>(boxk: &'a LayoutBox) -> Vec<Token<'a>> {
        let total_chars: usize = boxk.runs.iter().map(|r| r.text.chars().count()).sum();
        let mut tokens = Vec::new();
        for run in &boxk.runs {
            // char-width estimate for words beyond the first (poppler emits
            // one word per run with a real origin, so the first word is exact;
            // PyMuPDF-style line runs get proportional positions).
            let char_w = if total_chars > 0 {
                boxk.size.width_pt / total_chars as f64
            } else {
                0.0
            };
            let mut char_offset = 0usize;
            for (k, word) in run.text.split_whitespace().enumerate() {
                let start = run.text[char_offset..]
                    .find(word)
                    .map(|byte_idx| {
                        char_offset + run.text[char_offset..][..byte_idx].chars().count()
                    })
                    .unwrap_or(char_offset);
                tokens.push(Token {
                    text: word,
                    x_pt: if k == 0 {
                        run.origin.x_pt
                    } else {
                        run.origin.x_pt + start as f64 * char_w
                    },
                    y_pt: run.origin.y_pt,
                    run,
                });
                char_offset = start + word.chars().count();
            }
        }
        tokens
    }

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

        let e_toks: Vec<Token> = e_page.boxes.iter().flat_map(box_tokens).collect();
        let t_toks: Vec<Token> = t_page.boxes.iter().flat_map(box_tokens).collect();

        let mut used = vec![false; e_toks.len()];
        for tt in &t_toks {
            text_total += 1;
            geo_total += 1;

            // Greedy left-to-right exact-token match.
            let best = (0..e_toks.len()).find(|&j| !used[j] && e_toks[j].text == tt.text);
            let Some(j) = best else { continue };
            used[j] = true;
            text_matches += 1;
            style_total += 1;
            if style_match_cross(e_toks[j].run, tt.run, CROSS_SIZE_TOL_PT) {
                style_matches += 1;
            }
            // Geometry relative to the reference page dimensions.
            let dx = (e_toks[j].x_pt - tt.x_pt).abs() / t_page.size.width_pt.max(1.0);
            let dy = (e_toks[j].y_pt - tt.y_pt).abs() / t_page.size.height_pt.max(1.0);
            if dx <= REL_GEOMETRY_TOL && dy <= REL_GEOMETRY_TOL {
                geo_matches += 1;
            }
        }
    }

    // Unmatched truth pages: count tokens as failures for text/geometry.
    for page in truth.pages.iter().skip(comparable_pages) {
        for b in &page.boxes {
            let n: usize = b
                .runs
                .iter()
                .map(|r| r.text.split_whitespace().count())
                .sum();
            text_total += n;
            geo_total += n;
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

/// Cross-engine style comparison: unknown-aware. An empty font family means
/// the projection could not observe typography at all — then only the size is
/// comparable (poppler reports line height ~1.5–1.7x the font size, so the
/// tolerance is relative to the reference size). The PyMuPDF-based reference
/// truths systematically report weight 700; comparing weight would be noise.
fn style_match_cross(a: &GlyphRun, b: &GlyphRun, size_tol_factor: f64) -> bool {
    let size_ok = a.size_pt <= 0.0
        || b.size_pt <= 0.0
        || (a.size_pt - b.size_pt).abs() <= size_tol_factor * b.size_pt;
    if a.font.is_empty() || b.font.is_empty() {
        return size_ok;
    }
    size_ok && a.font == b.font && a.weight == b.weight && a.italic == b.italic
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
    mut mismatches: Vec<BoxMismatch>,
    scoring_mode: ScoringMode,
) -> CaseReport {
    const MAX_MISMATCHES: usize = 100;
    let mut notes = notes;
    if mismatches.len() > MAX_MISMATCHES {
        notes.push(format!(
            "…and {} more mismatched boxes (showing first {MAX_MISMATCHES})",
            mismatches.len() - MAX_MISMATCHES
        ));
        mismatches.truncate(MAX_MISMATCHES);
    }
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
        mismatches,
        scoring_mode,
    }
}

impl std::fmt::Display for CaseReport {
    /// Renders the summary plus actionable diffs, e.g.
    /// `page 0, paragraph: expected (72.0, 63.4) 100.0x14.0pt, got (72.0, 68.4) ... (Δy=5.0pt > 2pt)`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "[{}] {} {} vs truth({}): fidelity {:.3} (geometry {:.3}, text {:.3}, style {:.3}, fonts {:.3}), boxes {}/{}, pages {}/{}",
            format!("{:?}", self.scoring_mode).to_lowercase(),
            self.engine,
            self.engine_version,
            self.truth_source,
            self.fidelity,
            self.breakdown.geometry,
            self.breakdown.text,
            self.breakdown.style,
            self.breakdown.font_coverage,
            self.boxes_matched,
            self.boxes_total,
            self.page_count_engine,
            self.page_count_truth,
        )?;
        for m in &self.mismatches {
            write!(f, "\n  page {}, {}: {}", m.page, m.kind, m.detail)?;
        }
        for n in &self.notes {
            write!(f, "\n  note: {n}")?;
        }
        Ok(())
    }
}

/// Score box matching for a single page.
///
/// Greedy nearest-neighbour: each truth box is paired with the closest
/// still-unmatched engine box by origin. A pair counts as a geometry match
/// only if origin + size are both within tolerance. For matched pairs we then
/// score concatenated text equality and per-run style.
fn score_page_boxes(
    page_index: usize,
    engine_page: &Page,
    truth_page: &Page,
    mismatches: &mut Vec<BoxMismatch>,
) -> (usize, usize, usize, usize, usize, usize) {
    // (boxes_total, boxes_matched, text_matches, text_total, style_matches, style_total)
    let boxes_total = truth_page.boxes.len();
    if engine_page.boxes.is_empty() {
        for tbox in &truth_page.boxes {
            mismatches.push(BoxMismatch {
                page: page_index,
                kind: format!("{:?}", tbox.kind).to_lowercase(),
                detail: "missing: engine produced no boxes on this page".into(),
            });
        }
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

        let Some(j) = best else {
            mismatches.push(BoxMismatch {
                page: page_index,
                kind: format!("{:?}", tbox.kind).to_lowercase(),
                detail: format!(
                    "missing: no engine box near ({:.1}, {:.1}); expected {:.1}x{:.1}pt",
                    tbox.origin.x_pt, tbox.origin.y_pt, tbox.size.width_pt, tbox.size.height_pt
                ),
            });
            continue;
        };
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
            } else {
                mismatches.push(BoxMismatch {
                    page: page_index,
                    kind: format!("{:?}", tbox.kind).to_lowercase(),
                    detail: format!("text: expected {t_text:?}, got {e_text:?}"),
                });
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
        } else {
            let dx = (ebox.origin.x_pt - tbox.origin.x_pt).abs();
            let dy = (ebox.origin.y_pt - tbox.origin.y_pt).abs();
            let axis = if dy >= dx { "y" } else { "x" };
            let (delta, expected, got) = if dy >= dx {
                (
                    dy,
                    (tbox.origin.x_pt, tbox.origin.y_pt),
                    (ebox.origin.x_pt, ebox.origin.y_pt),
                )
            } else {
                (
                    dx,
                    (tbox.origin.x_pt, tbox.origin.y_pt),
                    (ebox.origin.x_pt, ebox.origin.y_pt),
                )
            };
            mismatches.push(BoxMismatch {
                page: page_index,
                kind: format!("{:?}", tbox.kind).to_lowercase(),
                detail: format!(
                    "expected ({:.1}, {:.1}) {:.1}x{:.1}pt, got ({:.1}, {:.1}) {:.1}x{:.1}pt (Δ{axis}={delta:.1}pt > {GEOMETRY_TOLERANCE_PT}pt)",
                    expected.0,
                    expected.1,
                    tbox.size.width_pt,
                    tbox.size.height_pt,
                    got.0,
                    got.1,
                    ebox.size.width_pt,
                    ebox.size.height_pt,
                ),
            });
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
