//! Tests for the Phase B shaping + shaped-run line breaking.
//!
//! The `break_lines` / `ShapedRun` tests build runs by hand and are fully
//! deterministic. The `Shaper`/paragraph tests need a real font face and
//! follow the `canvas.rs` environment-skip idiom: they bail out early
//! when no system fonts (or no rasterizable face) are available.

use crate::fonts::FontLibrary;
use crate::shaping::{ShapedGlyph, ShapedRun, Shaper};
use crate::text::TextLayoutEngine;
use crate::textlayout::{self, break_lines};

/// Build a glyph with zero offsets and the given advance/space flag.
fn glyph(id: u16, advance: f32, is_space: bool) -> ShapedGlyph {
    ShapedGlyph {
        glyph_id: id,
        x_offset: 0.0,
        y_offset: 0.0,
        x_advance: advance,
        y_advance: 0.0,
        is_space,
    }
}

/// Build a run from (advance, is_space) pairs, ids assigned 1..n.
fn run_from(pairs: &[(f32, bool)]) -> ShapedRun {
    let glyphs = pairs
        .iter()
        .enumerate()
        .map(|(i, &(adv, space))| glyph((i + 1) as u16, adv, space))
        .collect();
    ShapedRun {
        font_size: 12.0,
        glyphs,
    }
}

/// Shaper over system fonts, or `None` when the environment has no
/// usable face (CI containers without fonts) — callers skip.
fn test_shaper() -> Option<Shaper> {
    let lib = FontLibrary::new();
    if lib.face_count() == 0 {
        eprintln!("skip: no system fonts available");
        return None;
    }
    match Shaper::from_library(&lib, false) {
        Some(shaper) => Some(shaper),
        None => {
            eprintln!(
                "skip: fontdb listed {} faces but none shaped",
                lib.face_count()
            );
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Shaper construction
// ---------------------------------------------------------------------------

#[test]
fn test_shaper_rejects_invalid_font_data() {
    assert!(Shaper::from_font_data(vec![0xFF; 16], 0).is_none());
    assert!(Shaper::from_font_data(Vec::new(), 0).is_none());
}

#[test]
fn test_shaper_from_empty_library() {
    let lib = FontLibrary::empty();
    assert!(Shaper::from_library(&lib, false).is_none());
    assert!(Shaper::from_library(&lib, true).is_none());
}

#[test]
fn test_shaper_face_accessors() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    assert!(!shaper.font_data().is_empty());
    assert!(shaper.units_per_em() > 0.0);
    assert!(format!("{:?}", shaper).contains("Shaper"));
}

// ---------------------------------------------------------------------------
// Shaper::shape
// ---------------------------------------------------------------------------

#[test]
fn test_shaper_shape_ascii() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    let run = shaper.shape("Hello", 12.0);
    assert_eq!(run.font_size, 12.0);
    assert_eq!(run.glyphs.len(), 5, "plain ASCII is 1:1 in Latin v1");
    assert!(!run.is_empty());
    assert!(run.width() > 0.0);
    for g in &run.glyphs {
        assert!(g.x_advance > 0.0, "ASCII glyph advance should be positive");
        assert!(!g.is_space);
    }
}

#[test]
fn test_shaper_shape_space_detection() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    let run = shaper.shape("a b", 12.0);
    assert_eq!(run.glyphs.len(), 3);
    assert!(!run.glyphs[0].is_space);
    assert!(run.glyphs[1].is_space, "middle glyph is the space");
    assert!(!run.glyphs[2].is_space);
}

#[test]
fn test_shaper_shape_empty_string() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    let run = shaper.shape("", 12.0);
    assert!(run.is_empty());
    assert_eq!(run.width(), 0.0);
}

#[test]
fn test_shaper_advance_scales_with_font_size() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    let w12 = shaper.advance("Hello", 12.0);
    let w24 = shaper.advance("Hello", 24.0);
    assert!(w12 > 0.0);
    assert!(
        (w24 - 2.0 * w12).abs() < 2.0 * w12 * 0.01,
        "doubling the font size should double the advance ({} vs {})",
        w12,
        w24
    );
}

#[test]
fn test_shaper_advance_positive() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    assert!(shaper.advance("The quick brown fox", 14.0) > 0.0);
}

// ---------------------------------------------------------------------------
// ShapedRun helpers
// ---------------------------------------------------------------------------

#[test]
fn test_shaped_run_width_and_position() {
    let run = run_from(&[(10.0, false), (4.0, true), (7.0, false)]);
    assert_eq!(run.width(), 21.0);
    assert_eq!(run.position_at(0), 0.0);
    assert_eq!(run.position_at(1), 10.0);
    assert_eq!(run.position_at(2), 14.0);
}

#[test]
fn test_shaped_run_empty() {
    let run = ShapedRun {
        font_size: 12.0,
        glyphs: Vec::new(),
    };
    assert!(run.is_empty());
    assert_eq!(run.width(), 0.0);
}

// ---------------------------------------------------------------------------
// break_lines (deterministic, hand-built runs)
// ---------------------------------------------------------------------------

#[test]
fn test_break_lines_empty_run() {
    let run = ShapedRun {
        font_size: 12.0,
        glyphs: Vec::new(),
    };
    assert!(break_lines(&run, 100.0).is_empty());
}

#[test]
fn test_break_lines_all_spaces() {
    let run = run_from(&[(4.0, true), (4.0, true)]);
    assert!(break_lines(&run, 100.0).is_empty());
}

#[test]
fn test_break_lines_single_word() {
    let run = run_from(&[(10.0, false), (10.0, false), (10.0, false)]);
    let lines = break_lines(&run, 100.0);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].start, 0);
    assert_eq!(lines[0].end, 3);
    assert_eq!(lines[0].width(&run), 30.0);
}

#[test]
fn test_break_lines_no_wrap_when_fits() {
    // h sp e sp l sp l sp o = 5*10 + 4*4 = 66
    let run = run_from(&[
        (10.0, false),
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (10.0, false),
    ]);
    let lines = break_lines(&run, 100.0);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].start, 0);
    assert_eq!(lines[0].end, 9);
    assert_eq!(lines[0].width(&run), 66.0);
}

#[test]
fn test_break_lines_wraps_at_space() {
    // h sp e sp l sp l sp o, max 30:
    // line 1: "h e" (24), line 2: "l l" (24), line 3: "o" (10)
    let run = run_from(&[
        (10.0, false),
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (10.0, false),
    ]);
    let lines = break_lines(&run, 30.0);
    assert_eq!(lines.len(), 3);
    assert_eq!((lines[0].start, lines[0].end), (0, 3));
    assert_eq!((lines[1].start, lines[1].end), (4, 7));
    assert_eq!((lines[2].start, lines[2].end), (8, 9));
    for line in &lines {
        assert!(line.width(&run) <= 30.0 + 1e-3);
    }
    // The two break spaces are consumed: 3+3+1 = 7 glyphs kept of 9.
    let kept: usize = lines.iter().map(|l| l.end - l.start).sum();
    assert_eq!(kept, 7);
    // Break spaces must not land at the start or end of a line.
    for line in &lines {
        assert!(!run.glyphs[line.start].is_space);
        assert!(!run.glyphs[line.end - 1].is_space);
    }
}

#[test]
fn test_break_lines_zero_width_forces_first_word() {
    // a sp b sp c, max 0: every word on its own line, first forced.
    let run = run_from(&[
        (10.0, false),
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (10.0, false),
    ]);
    let lines = break_lines(&run, 0.0);
    assert_eq!(lines.len(), 3);
    assert_eq!((lines[0].start, lines[0].end), (0, 1));
    assert_eq!((lines[1].start, lines[1].end), (2, 3));
    assert_eq!((lines[2].start, lines[2].end), (4, 5));
}

#[test]
fn test_break_lines_long_word_not_broken() {
    // Legacy contract: a word wider than max_width is not split.
    let run = run_from(&[
        (10.0, false),
        (10.0, false),
        (10.0, false),
        (10.0, false),
        (10.0, false),
        (10.0, false),
        (10.0, false),
        (10.0, false),
        (10.0, false),
        (10.0, false),
    ]);
    let lines = break_lines(&run, 50.0);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].width(&run), 100.0);
}

#[test]
fn test_break_lines_leading_trailing_spaces_dropped() {
    // sp h sp o sp
    let run = run_from(&[
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (10.0, false),
        (4.0, true),
    ]);
    let lines = break_lines(&run, 100.0);
    assert_eq!(lines.len(), 1);
    assert_eq!((lines[0].start, lines[0].end), (1, 4));
    assert_eq!(lines[0].width(&run), 24.0);
}

#[test]
fn test_break_lines_consecutive_spaces_count_as_one_separator() {
    // sp sp h sp sp o
    let run = run_from(&[
        (4.0, true),
        (4.0, true),
        (10.0, false),
        (4.0, true),
        (4.0, true),
        (10.0, false),
    ]);
    let lines = break_lines(&run, 100.0);
    assert_eq!(lines.len(), 1);
    assert_eq!((lines[0].start, lines[0].end), (2, 6));
    assert_eq!(lines[0].width(&run), 28.0);
}

#[test]
fn test_line_break_slice() {
    let run = run_from(&[(10.0, false), (4.0, true), (7.0, false)]);
    let br = crate::textlayout::LineBreak { start: 0, end: 2 };
    let sliced = br.slice(&run);
    assert_eq!(sliced.glyphs.len(), 2);
    assert_eq!(sliced.glyphs[0].glyph_id, 1);
    assert_eq!(sliced.glyphs[1].glyph_id, 2);
    assert_eq!(sliced.width(), 14.0);
    assert_eq!(sliced.font_size, 12.0);
}

// ---------------------------------------------------------------------------
// textlayout::layout_paragraph (needs a real face)
// ---------------------------------------------------------------------------

#[test]
fn test_layout_paragraph_shaped_wraps() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    let full = shaper.advance("hello world test", 12.0);
    let half = full / 2.0;
    let lines = textlayout::layout_paragraph(&shaper, "hello world test", 12.0, half, 14.4);
    assert!(lines.len() > 1, "half width should force a wrap");
    for (i, line) in lines.iter().enumerate() {
        assert!(
            (line.y - i as f32 * 14.4).abs() < 1e-3,
            "line origins step by line_height"
        );
        assert!(line.width > 0.0);
        // Short words: every produced line must fit.
        assert!(line.width <= half + 1e-3);
    }
}

#[test]
fn test_layout_paragraph_shaped_newlines_and_blank_lines() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    // Blank line: no output line and no origin advance (legacy contract).
    let lines = textlayout::layout_paragraph(&shaper, "first\n\nthird", 12.0, 1000.0, 14.4);
    assert_eq!(lines.len(), 2);
    assert!((lines[0].y).abs() < 1e-3);
    assert!((lines[1].y - 14.4).abs() < 1e-3);

    let lines = textlayout::layout_paragraph(&shaper, "\n\n\n", 12.0, 1000.0, 14.4);
    assert!(lines.is_empty());
}

#[test]
fn test_layout_paragraph_shaped_normalizes_whitespace() {
    let Some(shaper) = test_shaper() else {
        return;
    };
    let lines = textlayout::layout_paragraph(&shaper, "  hello   world  ", 12.0, 1000.0, 14.4);
    assert_eq!(lines.len(), 1);
    // "hello world" → 11 glyphs 1:1 (5 + space + 5).
    assert_eq!(lines[0].run.glyphs.len(), 11);
    assert_eq!(lines[0].width, shaper.advance("hello world", 12.0));
}

// ---------------------------------------------------------------------------
// TextLayoutEngine end-to-end on the shaped path (needs a real face)
// ---------------------------------------------------------------------------

#[test]
fn test_text_layout_engine_shaped_path() {
    let lib = FontLibrary::new();
    if lib.face_count() == 0 {
        eprintln!("skip: no system fonts available");
        return;
    }
    let engine = TextLayoutEngine::new();

    // Single line, wide box: line width must equal the shaped advance.
    let layout = engine.layout_text("hello world", 12.0, 500.0, &lib);
    assert_eq!(layout.lines.len(), 1);
    let shaper = Shaper::from_library(&lib, false).expect("face available");
    let expected = shaper.advance("hello world", 12.0);
    assert!(
        (layout.lines[0].width - expected).abs() < 0.01,
        "line width should come from the shaped run ({} vs {})",
        layout.lines[0].width,
        expected
    );

    // Narrow box: wraps, and every line fits.
    let layout = engine.layout_text("hello world", 12.0, expected / 2.0, &lib);
    assert!(layout.lines.len() > 1);
    for line in &layout.lines {
        assert!(line.width <= expected / 2.0 + 1e-3);
    }

    // Baseline stepping uses the default line height (1.2 * font_size).
    let layout = engine.layout_text("one two three four", 12.0, expected / 2.0, &lib);
    if layout.lines.len() > 1 {
        let diff = layout.lines[1].baseline - layout.lines[0].baseline;
        assert!((diff - 14.4).abs() < 0.01);
    }
}

#[test]
fn test_text_layout_engine_shaped_fallback_equivalence() {
    // Empty library: shaped path unavailable, fallback keeps legacy
    // fallback metrics (width = n * 0.5 * font_size).
    let engine = TextLayoutEngine::new();
    let fonts = FontLibrary::empty();
    let layout = engine.layout_text("hello", 12.0, 100.0, &fonts);
    assert_eq!(layout.lines.len(), 1);
    assert!((layout.lines[0].width - 5.0 * 12.0 * 0.5).abs() < 0.01);
}
