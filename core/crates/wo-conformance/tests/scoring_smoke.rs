//! L1/L2 scoring smoke: our side of the contract with `compute_fidelity`.
//!
//! Deltas smaller than the tolerance must score clean; structural misses must
//! surface as actionable, per-box reports.

use wo_conformance::{
    compute_fidelity, compute_fidelity_cross_engine, BoxKind, GlyphRun, LayoutBox,
    NormalizedRender, Page, PageSize, Point, RenderMetadata,
};

fn render_with_box(x: f64, y: f64, text: &str) -> NormalizedRender {
    NormalizedRender {
        pages: vec![Page {
            index: 0,
            size: PageSize {
                width_pt: 612.0,
                height_pt: 792.0,
            },
            boxes: vec![LayoutBox {
                kind: BoxKind::Paragraph,
                origin: Point { x_pt: x, y_pt: y },
                size: PageSize {
                    width_pt: 100.0,
                    height_pt: 14.0,
                },
                runs: vec![GlyphRun {
                    text: text.into(),
                    font: "Liberation Serif".into(),
                    size_pt: 12.0,
                    weight: 400,
                    italic: false,
                    origin: Point { x_pt: x, y_pt: y },
                }],
            }],
        }],
        resolved_fonts: Default::default(),
        metadata: RenderMetadata {
            engine: "test".into(),
            engine_version: "0".into(),
            captured_at: String::new(),
            environment: String::new(),
        },
    }
}

#[test]
fn sub_tolerance_delta_scores_clean() {
    let truth = render_with_box(72.0, 63.384, "Hello");
    // 0.6pt shift, under GEOMETRY_TOLERANCE_PT = 2.0.
    let engine = render_with_box(72.6, 63.384, "Hello");
    let report = compute_fidelity("smoke", &engine, &truth);
    assert!(
        report.breakdown.geometry > 0.99,
        "sub-tolerance shift must not penalize geometry: {:?}",
        report.breakdown
    );
}

#[test]
fn over_tolerance_delta_is_reported_per_box() {
    let truth = render_with_box(72.0, 63.384, "Hello");
    let engine = render_with_box(72.0, 68.384, "Hello"); // 5pt vertical shift
    let report = compute_fidelity("shifted", &engine, &truth);
    assert!(
        report.breakdown.geometry < 1.0,
        "5pt shift must penalize geometry"
    );
    let rendered = format!("{report}");
    let has_detail = rendered.contains("63.4") && rendered.contains("68.4");
    assert!(
        has_detail,
        "report must carry actionable coordinates, got: {rendered}"
    );
}

#[test]
fn missing_text_is_reported() {
    let truth = render_with_box(72.0, 63.384, "Hello");
    let engine = render_with_box(72.0, 63.384, "Helli"); // wrong glyph run
    let report = compute_fidelity("typo", &engine, &truth);
    assert!(
        report.breakdown.text < 1.0,
        "text mismatch must penalize text fidelity"
    );
}

/// Real-world shapes from the first live oracle diff (case 01): the reference
/// (PyMuPDF) reports one run per line on Letter with baselines; OnlyOffice
/// (poppler projection) reports one run per word on A4 with bbox tops. The
/// cross-engine scorer must see through page setup AND segmentation.
#[test]
fn cross_engine_tolerates_page_setup_and_segmentation() {
    // Truth: Letter 612x792, single run "Hello World", baseline y=82.2.
    let mut truth = render_with_box(72.1, 82.2, "Hello World");
    truth.pages[0].size = PageSize {
        width_pt: 612.0,
        height_pt: 792.0,
    };
    truth.pages[0].boxes[0].size = PageSize {
        width_pt: 66.19,
        height_pt: 12.79,
    };
    truth.pages[0].boxes[0].runs[0].font = "DejaVuSerif".into();
    truth.pages[0].boxes[0].runs[0].size_pt = 11.0;

    // Engine: A4 595x842, two word-runs, poppler line-height size, no fonts.
    let mut engine = render_with_box(85.04, 51.83, "");
    engine.pages[0].size = PageSize {
        width_pt: 595.28,
        height_pt: 841.89,
    };
    let b = &mut engine.pages[0].boxes[0];
    b.size = PageSize {
        width_pt: 50.22,
        height_pt: 18.62,
    };
    b.runs = vec![
        GlyphRun {
            text: "Hello".into(),
            font: String::new(),
            size_pt: 18.62,
            weight: 400,
            italic: false,
            origin: Point {
                x_pt: 85.04,
                y_pt: 51.83,
            },
        },
        GlyphRun {
            text: "World".into(),
            font: String::new(),
            size_pt: 18.62,
            weight: 400,
            italic: false,
            origin: Point {
                x_pt: 109.73,
                y_pt: 51.83,
            },
        },
    ];

    let report = compute_fidelity_cross_engine("live-case-01", &engine, &truth);
    assert_eq!(
        report.breakdown.text, 1.0,
        "token matching sees through segmentation"
    );
    assert_eq!(
        report.breakdown.geometry, 1.0,
        "relative geometry absorbs A4-vs-Letter + bbox-vs-baseline"
    );
    assert_eq!(
        report.breakdown.style, 1.0,
        "unknown fonts must not be penalized"
    );

    // But a real layout break (paragraph dropped far down the page) must fail.
    let mut broken = render_with_box(85.04, 51.83, "");
    broken.pages[0] = engine.pages[0].clone();
    for r in &mut broken.pages[0].boxes[0].runs {
        r.origin.y_pt = 400.0;
    }
    let report = compute_fidelity_cross_engine("live-case-01-broken", &broken, &truth);
    assert!(
        report.breakdown.geometry < 1.0,
        "large real displacement must penalize geometry"
    );
}
