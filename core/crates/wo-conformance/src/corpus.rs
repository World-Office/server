//! Corpus execution: render each case through an engine and score against truth.

use serde_json::Value;

use crate::engine::RenderEngine;
use crate::ground_truth::{ConformanceCase, GroundTruthFile, TRUTH_SCHEMA_VERSION};
use crate::model::{ConformanceError, NormalizedRender, RenderSpec};
use crate::scoring::{compute_fidelity, CaseReport, ConformanceReport};

/// Load a truth file, accepting either a `GroundTruthFile` wrapper
/// (`{schema_version, truth_captured_from, captured_at, render}`) or a bare
/// `NormalizedRender` (`{pages, resolved_fonts, metadata}`).
///
/// Returns the render and an optional source label.
fn load_truth(path: &std::path::Path) -> Result<(NormalizedRender, String), ConformanceError> {
    let bytes = std::fs::read(path)?;
    let v: Value = serde_json::from_slice(&bytes)?;

    if v.get("render").is_some() {
        // GroundTruthFile wrapper — validate schema version.
        let truth: GroundTruthFile = serde_json::from_value(v)?;
        if truth.schema_version > TRUTH_SCHEMA_VERSION {
            return Err(ConformanceError::SchemaVersion {
                found: truth.schema_version,
                max_supported: TRUTH_SCHEMA_VERSION,
            });
        }
        Ok((truth.render, truth.truth_captured_from))
    } else {
        // Bare NormalizedRender (e.g. from the Python capture pipeline).
        let render: NormalizedRender = serde_json::from_value(v)?;
        Ok((render, String::new()))
    }
}

/// Render one case through `engine` and score it against its ground truth.
pub fn run_case<E: RenderEngine>(
    engine: &E,
    case: &ConformanceCase,
    spec: &RenderSpec,
) -> Result<CaseReport, ConformanceError> {
    let input = std::fs::read(&case.input_path)?;
    let engine_render = engine.render(&input, spec)?;
    let (truth, _truth_src) = load_truth(&case.truth_path)?;
    Ok(compute_fidelity(&case.name, &engine_render, &truth))
}

/// Render + score every case, returning an aggregate report.
///
/// A single failing case does not abort the run; its error is recorded as a
/// zero-fidelity case with a note, so a corpus report always covers every case.
pub fn run_corpus<E: RenderEngine>(
    engine: &E,
    cases: &[ConformanceCase],
    spec: &RenderSpec,
) -> Result<ConformanceReport, ConformanceError> {
    let mut reports = Vec::with_capacity(cases.len());
    for case in cases {
        match run_case(engine, case, spec) {
            Ok(r) => reports.push(r),
            Err(e) => reports.push(CaseReport {
                case_name: case.name.clone(),
                engine: engine.name().to_string(),
                engine_version: engine.version().to_string(),
                truth_source: String::new(),
                page_count_engine: 0,
                page_count_truth: 0,
                boxes_total: 0,
                boxes_matched: 0,
                text_matches: 0,
                text_total: 0,
                style_matches: 0,
                style_total: 0,
                font_substitutions: 0,
                missing_fonts: Vec::new(),
                fidelity: 0.0,
                breakdown: crate::scoring::FidelityBreakdown {
                    geometry: 0.0,
                    text: 0.0,
                    style: 0.0,
                    font_coverage: 0.0,
                },
                notes: vec![format!("case errored: {e}")],
                scoring_mode: crate::scoring::ScoringMode::Box,
            }),
        }
    }
    Ok(ConformanceReport::from_cases(reports))
}
