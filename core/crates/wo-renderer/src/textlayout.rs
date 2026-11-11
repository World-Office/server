//! Shaped-run line breaking (Phase B).
//!
//! Replaces the legacy per-character `FontLibrary::char_advance` line
//! breaking: line widths now come from real shaped runs
//! (see `crate::shaping`), and lines are broken at the whitespace
//! positions *inside* the run.
//!
//! Contract (matches the legacy `TextLayoutEngine` behavior the renderer
//! is pinned to):
//! * whitespace runs collapse to single spaces and are never emitted at a
//!   line start or line end — a break consumes its separating space(s);
//! * words are kept whole: a word wider than `max_width` is not broken;
//! * an empty or all-whitespace line produces no output line and does not
//!   advance the paragraph origin.

use crate::shaping::{ShapedRun, Shaper};

/// Tolerance (pixels) when testing whether a line fits `max_width`, to
/// absorb float noise from scaled advances.
const FIT_EPSILON: f32 = 1e-3;

/// A line broken out of a shaped run.
///
/// `start..end` is a half-open range of glyph indices into the source
/// run. Whitespace at a break position is consumed: it belongs to
/// neither the line above nor the line below.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineBreak {
    /// Index of the first glyph of the line.
    pub start: usize,
    /// Index just past the last glyph of the line.
    pub end: usize,
}

impl LineBreak {
    /// Copy the line's glyphs out of `run` into a standalone run.
    pub fn slice(&self, run: &ShapedRun) -> ShapedRun {
        ShapedRun {
            font_size: run.font_size,
            glyphs: run.glyphs[self.start..self.end].to_vec(),
        }
    }

    /// Width of the line's glyphs in `run` (pixels).
    pub fn width(&self, run: &ShapedRun) -> f32 {
        run.glyphs[self.start..self.end]
            .iter()
            .map(|g| g.x_advance)
            .sum()
    }
}

/// A laid-out line of a shaped paragraph.
#[derive(Debug, Clone, PartialEq)]
pub struct ShapedLine {
    /// The line's glyphs (a slice copy of the shaped run).
    pub run: ShapedRun,
    /// Width of the line in pixels (spaces between words included,
    /// trailing break spaces excluded).
    pub width: f32,
    /// Line origin y in paragraph space (y-down): `line_index * line_height`.
    pub y: f32,
}

/// Break a shaped run into lines that fit within `max_width` (pixels).
///
/// Greedy word wrapping: words (maximal non-space spans) are kept whole
/// and a new line starts whenever the next word — together with its
/// separating whitespace — would exceed `max_width`. A word that does not
/// fit on an empty line is still placed there (never broken). Consecutive
/// spaces count as one separator. An empty run yields no lines.
///
/// Returns the lines as [`LineBreak`] index ranges; break whitespace is
/// consumed (see [`LineBreak`]).
pub fn break_lines(run: &ShapedRun, max_width: f32) -> Vec<LineBreak> {
    // Collect words: (start, end) half-open spans of non-space glyphs.
    let mut words: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    let n = run.glyphs.len();
    while i < n {
        if run.glyphs[i].is_space {
            i += 1;
            continue;
        }
        let start = i;
        while i < n && !run.glyphs[i].is_space {
            i += 1;
        }
        words.push((start, i));
    }
    if words.is_empty() {
        return Vec::new();
    }

    let mut lines = Vec::new();
    let (mut line_start, mut line_end) = words[0];
    let mut width: f32 = run.glyphs[words[0].0..words[0].1]
        .iter()
        .map(|g| g.x_advance)
        .sum();

    for &(word_start, word_end) in &words[1..] {
        let word_width: f32 = run.glyphs[word_start..word_end]
            .iter()
            .map(|g| g.x_advance)
            .sum();
        let sep_width: f32 = run.glyphs[line_end..word_start]
            .iter()
            .map(|g| g.x_advance)
            .sum();
        if width == 0.0 || width + sep_width + word_width <= max_width + FIT_EPSILON {
            // Word fits on the current line (or the line is empty).
            line_end = word_end;
            width += sep_width + word_width;
        } else {
            lines.push(LineBreak {
                start: line_start,
                end: line_end,
            });
            line_start = word_start;
            line_end = word_end;
            width = word_width;
        }
    }
    lines.push(LineBreak {
        start: line_start,
        end: line_end,
    });
    lines
}

/// Lay out a paragraph with a [`Shaper`].
///
/// Whitespace is normalized (runs collapse to single spaces; leading and
/// trailing spaces dropped); `\n` forces a line break; each physical line
/// is shaped and then broken by [`break_lines`] to fit `max_width`.
///
/// Returned lines carry `y = line_index * line_height` in paragraph
/// space — the caller adds its font ascent to get baselines.
pub fn layout_paragraph(
    shaper: &Shaper,
    text: &str,
    font_size: f32,
    max_width: f32,
    line_height: f32,
) -> Vec<ShapedLine> {
    let mut lines = Vec::new();
    let mut next_y = 0.0f32;

    for physical in text.split('\n') {
        let words: Vec<&str> = physical.split_whitespace().collect();
        if words.is_empty() {
            // Blank line: no output line, no origin advance (legacy contract).
            continue;
        }

        let run = shaper.shape(&words.join(" "), font_size);
        if run.is_empty() {
            continue;
        }
        for br in break_lines(&run, max_width) {
            lines.push(ShapedLine {
                width: br.width(&run),
                run: br.slice(&run),
                y: next_y,
            });
            next_y += line_height;
        }
    }

    lines
}
