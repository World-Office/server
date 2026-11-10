//! Text layout engine.
//!
//! Provides text shaping, line breaking, and paragraph layout for the rendering engine.
//! Uses real font metrics from `FontLibrary` (backed by fontdb) when available,
//! with fallback defaults when no fonts are loaded.
//!
//! Phase B: when the library yields a usable face, line breaking runs on
//! *shaped runs* ([`crate::shaping::Shaper`] + [`crate::textlayout`])
//! instead of the legacy per-character `char_advance` estimate. The
//! per-character path is kept only as the no-font fallback.

use std::f32;

use crate::fonts::FontLibrary;
use crate::shaping::{ShapedRun, Shaper};
use crate::textlayout;

/// A single glyph with positioning information.
#[derive(Debug, Clone, PartialEq)]
pub struct GlyphInfo {
    /// Glyph ID (from font).
    pub glyph_id: u16,
    /// X offset from the glyph origin.
    pub x_offset: f32,
    /// Y offset from the glyph origin.
    pub y_offset: f32,
    /// Advance width (distance to next glyph).
    pub advance: f32,
}

/// A sequence of glyphs from a single font with positions.
#[derive(Debug, Clone, PartialEq)]
pub struct GlyphRun {
    /// Font size in points.
    pub font_size: f32,
    /// Glyphs in the run.
    pub glyphs: Vec<GlyphInfo>,
}

impl GlyphRun {
    /// Create a new glyph run.
    pub fn new(font_size: f32) -> Self {
        Self {
            font_size,
            glyphs: Vec::new(),
        }
    }

    /// Add a glyph to the run.
    pub fn add_glyph(&mut self, glyph_id: u16, x_offset: f32, y_offset: f32, advance: f32) {
        self.glyphs.push(GlyphInfo {
            glyph_id,
            x_offset,
            y_offset,
            advance,
        });
    }

    /// Get the total width of the run.
    pub fn width(&self) -> f32 {
        self.glyphs.iter().map(|g| g.advance).sum()
    }
}

/// A laid-out line of text with baseline information.
#[derive(Debug, Clone, PartialEq)]
pub struct TextLine {
    /// Glyphs in this line.
    pub glyphs: GlyphRun,
    /// Width of the line.
    pub width: f32,
    /// Ascent (distance from baseline to top of glyphs).
    pub ascent: f32,
    /// Descent (distance from baseline to bottom of glyphs).
    pub descent: f32,
    /// Baseline position (Y coordinate).
    pub baseline: f32,
}

impl TextLine {
    /// Create a new text line.
    pub fn new(glyphs: GlyphRun, width: f32, ascent: f32, descent: f32, baseline: f32) -> Self {
        Self {
            glyphs,
            width,
            ascent,
            descent,
            baseline,
        }
    }

    /// Get the line height (ascent + descent).
    pub fn height(&self) -> f32 {
        self.ascent + self.descent
    }
}

/// Full paragraph layout with multiple lines.
#[derive(Debug, Clone, PartialEq)]
pub struct TextLayout {
    /// Lines in the paragraph.
    pub lines: Vec<TextLine>,
    /// Total width of the layout (max line width).
    pub total_width: f32,
    /// Total height of the layout.
    pub total_height: f32,
}

impl TextLayout {
    /// Create a new text layout.
    pub fn new(lines: Vec<TextLine>) -> Self {
        let total_width = lines.iter().map(|l| l.width).fold(0.0f32, f32::max);
        let total_height = if lines.is_empty() {
            0.0
        } else {
            let first_baseline = lines.first().map(|l| l.baseline).unwrap_or(0.0);
            let last_bottom = lines.last().map(|l| l.baseline + l.descent).unwrap_or(0.0);
            last_bottom - first_baseline + lines.first().map(|l| l.ascent).unwrap_or(0.0)
        };
        Self {
            lines,
            total_width,
            total_height,
        }
    }
}

/// Default line height multiplier (1.2× font size).
const DEFAULT_LINE_HEIGHT_FACTOR: f32 = 1.2;

/// Text layout engine.
///
/// Provides text shaping, line breaking, and paragraph layout capabilities.
/// Uses `FontLibrary` for real glyph metrics from fontdb.
#[derive(Debug, Clone, Default)]
pub struct TextLayoutEngine;

impl TextLayoutEngine {
    /// Create a new text layout engine.
    pub fn new() -> Self {
        Self
    }

    /// Layout text with simple greedy word-wrap.
    ///
    /// # Arguments
    /// * `text` - The text to layout
    /// * `font_size` - Font size in points
    /// * `max_width` - Maximum width for the text
    /// * `fonts` - Font library for glyph metrics
    ///
    /// # Returns
    /// A `TextLayout` containing the laid-out lines
    pub fn layout_text(
        &self,
        text: &str,
        font_size: f32,
        max_width: f32,
        fonts: &FontLibrary,
    ) -> TextLayout {
        let line_height = font_size * DEFAULT_LINE_HEIGHT_FACTOR;
        self.layout_paragraph(text, font_size, max_width, line_height, fonts)
    }

    /// Layout a paragraph with explicit line height.
    ///
    /// # Arguments
    /// * `text` - The text to layout
    /// * `font_size` - Font size in points
    /// * `max_width` - Maximum width for the text
    /// * `line_height` - Line height in pixels (absolute, not a multiplier)
    /// * `fonts` - Font library for glyph metrics
    ///
    /// # Returns
    /// A `TextLayout` containing the laid-out lines
    ///
    /// When `fonts` yields a usable face, the text is shaped with
    /// [`Shaper`] and lines are broken on the shaped run
    /// ([`crate::textlayout::break_lines`]); otherwise the legacy
    /// per-character metrics are used as the no-font fallback.
    pub fn layout_paragraph(
        &self,
        text: &str,
        font_size: f32,
        max_width: f32,
        line_height: f32,
        fonts: &FontLibrary,
    ) -> TextLayout {
        if text.is_empty() {
            return TextLayout {
                lines: Vec::new(),
                total_width: 0.0,
                total_height: 0.0,
            };
        }

        let ascent = fonts.ascent(font_size);
        let descent = fonts.descent(font_size);

        if let Some(shaper) = Shaper::from_library(fonts, false) {
            let shaped =
                textlayout::layout_paragraph(&shaper, text, font_size, max_width, line_height);
            let lines = shaped
                .into_iter()
                .map(|line| {
                    TextLine::new(
                        glyph_run_from_shaped(&line.run),
                        line.width,
                        ascent,
                        descent,
                        line.y + ascent,
                    )
                })
                .collect();
            return TextLayout::new(lines);
        }

        self.layout_paragraph_fallback(text, font_size, max_width, line_height, fonts)
    }

    /// Legacy per-character line breaking (no-font fallback).
    ///
    /// Kept for libraries with no usable face (e.g. `FontLibrary::empty()`
    /// in unit tests). New code paths should prefer the shaped-run layout.
    #[allow(clippy::too_many_arguments)] // mirrors layout_paragraph
    fn layout_paragraph_fallback(
        &self,
        text: &str,
        font_size: f32,
        max_width: f32,
        line_height: f32,
        fonts: &FontLibrary,
    ) -> TextLayout {
        if text.is_empty() {
            return TextLayout {
                lines: Vec::new(),
                total_width: 0.0,
                total_height: 0.0,
            };
        }

        let ascent = fonts.ascent(font_size);
        let descent = fonts.descent(font_size);

        let mut lines = Vec::new();
        let mut current_x = 0.0;
        let mut current_y = 0.0;
        let mut line_glyphs = GlyphRun::new(font_size);
        let mut line_has_content = false;

        // Split text into lines based on explicit newlines
        for line_text in text.split('\n') {
            // Process each word in the line
            for word in line_text.split_whitespace() {
                // Compute real word width from font metrics
                let word_width: f32 = word.chars().map(|c| fonts.char_advance(c, font_size)).sum();

                // Check if word fits on current line
                if current_x + word_width <= max_width || !line_has_content {
                    // Word fits on current line
                    if line_has_content {
                        // Add space before word (if not at start of line)
                        let space_glyph_id = fonts.glyph_id(' ');
                        let space_adv = fonts.space_advance(font_size);
                        line_glyphs.add_glyph(space_glyph_id, 0.0, 0.0, space_adv);
                        current_x += space_adv;
                    }

                    // Add word glyphs with real metrics
                    for ch in word.chars() {
                        let glyph_id = fonts.glyph_id(ch);
                        let advance = fonts.char_advance(ch, font_size);
                        line_glyphs.add_glyph(glyph_id, 0.0, 0.0, advance);
                    }
                    current_x += word_width;
                    line_has_content = true;
                } else {
                    // Word doesn't fit - finalize current line and start new one
                    if !line_glyphs.glyphs.is_empty() {
                        let text_line = TextLine::new(
                            line_glyphs,
                            current_x,
                            ascent,
                            descent,
                            current_y + ascent,
                        );
                        lines.push(text_line);

                        // Start new line
                        current_y += line_height;
                        line_glyphs = GlyphRun::new(font_size);
                    }

                    // Add word to new line
                    for ch in word.chars() {
                        let glyph_id = fonts.glyph_id(ch);
                        let advance = fonts.char_advance(ch, font_size);
                        line_glyphs.add_glyph(glyph_id, 0.0, 0.0, advance);
                    }
                    current_x = word_width;
                    line_has_content = true;
                }
            }

            // Finalize line after processing all words in this line
            if !line_glyphs.glyphs.is_empty() {
                let text_line =
                    TextLine::new(line_glyphs, current_x, ascent, descent, current_y + ascent);
                lines.push(text_line);

                // Start new line
                current_y += line_height;
                current_x = 0.0;
                line_glyphs = GlyphRun::new(font_size);
                line_has_content = false;
            }
        }

        TextLayout::new(lines)
    }
}

/// Convert a shaped run into the legacy [`GlyphRun`] representation used
/// by [`TextLine`].
fn glyph_run_from_shaped(run: &ShapedRun) -> GlyphRun {
    let mut out = GlyphRun::new(run.font_size);
    for g in &run.glyphs {
        out.add_glyph(g.glyph_id, g.x_offset, g.y_offset, g.x_advance);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create an empty font library for tests.
    fn test_fonts() -> FontLibrary {
        FontLibrary::empty()
    }

    #[test]
    fn test_layout_empty_string() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("", 12.0, 100.0, &fonts);

        assert!(layout.lines.is_empty());
        assert_eq!(layout.total_width, 0.0);
        assert_eq!(layout.total_height, 0.0);
    }

    #[test]
    fn test_layout_single_word() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("hello", 12.0, 100.0, &fonts);

        assert_eq!(layout.lines.len(), 1);
        assert_eq!(layout.lines[0].glyphs.glyphs.len(), 5); // "hello" = 5 chars
        assert!(layout.total_width > 0.0);
        assert!(layout.total_height > 0.0);
    }

    #[test]
    fn test_layout_multiple_words() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("hello world", 12.0, 100.0, &fonts);

        assert_eq!(layout.lines.len(), 1);
        // "hello" (5) + space (1) + "world" (5) = 11 glyphs
        assert_eq!(layout.lines[0].glyphs.glyphs.len(), 11);
    }

    #[test]
    fn test_layout_word_wrapping() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        // Use narrow width to force wrapping
        let layout = engine.layout_text("hello world test", 12.0, 50.0, &fonts);

        assert!(layout.lines.len() > 1);
    }

    #[test]
    fn test_layout_long_word_no_wrap() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        // Very narrow width but single long word
        let layout = engine.layout_text("supercalifragilisticexpialidocious", 12.0, 50.0, &fonts);

        // Single long word should not wrap even if it exceeds max_width
        assert_eq!(layout.lines.len(), 1);
        assert!(layout.lines[0].width > 50.0);
    }

    #[test]
    fn test_layout_multiple_lines() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("line one\nline two\nline three", 12.0, 100.0, &fonts);

        assert_eq!(layout.lines.len(), 3);
    }

    #[test]
    fn test_layout_newline_handling() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("first\n\nthird", 12.0, 100.0, &fonts);

        // Empty line in the middle should be preserved
        assert_eq!(layout.lines.len(), 2);
    }

    #[test]
    fn test_layout_very_narrow_width() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("a b c d e", 12.0, 20.0, &fonts);

        // Each letter on its own line
        assert!(layout.lines.len() > 1);
    }

    #[test]
    fn test_layout_wide_width_no_wrap() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("hello world test", 12.0, 500.0, &fonts);

        // Wide width should prevent wrapping
        assert_eq!(layout.lines.len(), 1);
    }

    #[test]
    fn test_layout_unicode_text() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("Hello 世界", 12.0, 100.0, &fonts);

        assert_eq!(layout.lines.len(), 1);
        assert!(layout.lines[0].glyphs.glyphs.len() > 5);
    }

    #[test]
    fn test_layout_empty_lines() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("\n\n\n", 12.0, 100.0, &fonts);

        assert_eq!(layout.lines.len(), 0);
    }

    #[test]
    fn test_layout_leading_trailing_spaces() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("  hello  ", 12.0, 100.0, &fonts);

        assert_eq!(layout.lines.len(), 1);
        // Leading/trailing spaces should be stripped by split_whitespace
        assert_eq!(layout.lines[0].glyphs.glyphs.len(), 5);
    }

    #[test]
    fn test_layout_metrics() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("hello", 12.0, 100.0, &fonts);

        assert_eq!(layout.lines.len(), 1);
        let line = &layout.lines[0];

        // With empty font library, ascent/descent use fallback defaults
        assert!((line.ascent - 12.0 * 0.8).abs() < 0.01);
        assert!((line.descent - 12.0 * 0.2).abs() < 0.01);

        // With empty font library, char width fallback is font_size * 0.5
        assert!((line.width - 5.0 * 12.0 * 0.5).abs() < 0.01);
    }

    #[test]
    fn test_layout_zero_width() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_text("hello world", 12.0, 0.0, &fonts);

        // Zero width should still layout, but lines may be created
        assert!(!layout.lines.is_empty());
    }

    #[test]
    fn test_layout_paragraph_line_height() {
        let engine = TextLayoutEngine::new();
        let fonts = test_fonts();
        let layout = engine.layout_paragraph("line one\nline two", 12.0, 100.0, 24.0, &fonts);

        assert_eq!(layout.lines.len(), 2);

        // Check that baseline positions reflect the custom line height
        let baseline_diff = layout.lines[1].baseline - layout.lines[0].baseline;
        assert!((baseline_diff - 24.0).abs() < 0.01);
    }

    #[test]
    fn test_glyph_run_width() {
        let mut run = GlyphRun::new(12.0);
        run.add_glyph(1, 0.0, 0.0, 5.0);
        run.add_glyph(2, 0.0, 0.0, 7.0);
        run.add_glyph(3, 0.0, 0.0, 3.0);

        assert_eq!(run.width(), 15.0);
    }

    #[test]
    fn test_text_line_height() {
        let glyphs = GlyphRun::new(12.0);
        let line = TextLine::new(glyphs, 10.0, 9.6, 2.4, 0.0);

        assert_eq!(line.height(), 12.0);
    }

    #[test]
    fn test_layout_engine_new() {
        let engine = TextLayoutEngine::new();
        let _ = engine; // Just ensure it compiles
    }

    #[test]
    fn test_text_layout_empty() {
        let layout = TextLayout::new(Vec::new());

        assert!(layout.lines.is_empty());
        assert_eq!(layout.total_width, 0.0);
        assert_eq!(layout.total_height, 0.0);
    }

    #[test]
    fn test_text_layout_single_line() {
        let mut glyphs = GlyphRun::new(12.0);
        glyphs.add_glyph(1, 0.0, 0.0, 10.0);
        glyphs.add_glyph(2, 0.0, 0.0, 15.0);

        let line = TextLine::new(glyphs, 25.0, 10.0, 2.0, 10.0);
        let layout = TextLayout::new(vec![line]);

        assert_eq!(layout.lines.len(), 1);
        assert_eq!(layout.total_width, 25.0);
        assert!(layout.total_height > 0.0);
    }

    #[test]
    fn test_text_layout_multiple_lines_width() {
        let line1 = TextLine::new(GlyphRun::new(12.0), 50.0, 10.0, 2.0, 10.0);
        let line2 = TextLine::new(GlyphRun::new(12.0), 75.0, 10.0, 2.0, 25.0);
        let line3 = TextLine::new(GlyphRun::new(12.0), 60.0, 10.0, 2.0, 40.0);

        let layout = TextLayout::new(vec![line1, line2, line3]);

        // total_width should be the maximum line width
        assert_eq!(layout.total_width, 75.0);
    }
}
