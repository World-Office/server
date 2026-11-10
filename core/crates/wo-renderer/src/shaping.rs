//! Text shaping (Phase B).
//!
//! The [`Shaper`] wraps rustybuzz and was extracted from
//! `Canvas::draw_text` (which used to inline the whole rustybuzz setup).
//! It produces [`ShapedRun`]s: sequences of positioned glyphs already
//! scaled to pixel space at the requested font size.
//!
//! The shaped runs feed two consumers:
//! * `crate::canvas` — rasterizes the glyphs with swash;
//! * `crate::textlayout` — breaks lines on the *shaped* run instead of the
//!   legacy per-character `FontLibrary::char_advance` estimates.
//!
//! Latin-only v1, mirroring the previous `draw_text` contract: no
//! OpenType features, no ligatures, no bidi; glyph count equals char count.

use std::fmt;

use crate::fonts::FontLibrary;

/// A single positioned glyph in pixel space (y-down, like canvas coords).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ShapedGlyph {
    /// Glyph ID in the bound font face.
    pub glyph_id: u16,
    /// X offset from the glyph origin (already scaled).
    pub x_offset: f32,
    /// Y offset from the glyph origin (already scaled).
    pub y_offset: f32,
    /// Advance width to the next glyph origin (already scaled).
    pub x_advance: f32,
    /// Vertical advance (already scaled); 0 for horizontal runs.
    pub y_advance: f32,
    /// True when this glyph was shaped from a whitespace source char —
    /// the break opportunity for [`crate::textlayout::break_lines`].
    pub is_space: bool,
}

/// A sequence of shaped glyphs produced by [`Shaper::shape`].
#[derive(Debug, Clone, PartialEq)]
pub struct ShapedRun {
    /// Font size (pixels) the run was shaped at.
    pub font_size: f32,
    /// Glyphs in the run.
    pub glyphs: Vec<ShapedGlyph>,
}

impl ShapedRun {
    /// Total width of the run (sum of advances), in pixels.
    pub fn width(&self) -> f32 {
        self.glyphs.iter().map(|g| g.x_advance).sum()
    }

    /// True when the run has no glyphs.
    pub fn is_empty(&self) -> bool {
        self.glyphs.is_empty()
    }

    /// Pen position (sum of advances) at the start of glyph `index`.
    pub fn position_at(&self, index: usize) -> f32 {
        self.glyphs.iter().take(index).map(|g| g.x_advance).sum()
    }
}

/// A text shaper bound to a single font face.
///
/// Owns the font data so it is `Clone`-free but cheap to reuse; each
/// [`Shaper::shape`] call rebuilds the rustybuzz face (same cost profile
/// as the previous inline `draw_text` path).
pub struct Shaper {
    font_data: Vec<u8>,
    face_index: u32,
    units_per_em: f32,
}

impl fmt::Debug for Shaper {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Shaper")
            .field("font_data_len", &self.font_data.len())
            .field("face_index", &self.face_index)
            .field("units_per_em", &self.units_per_em)
            .finish()
    }
}

impl Shaper {
    /// Create a shaper from raw font data (TTF/OTF/...), validating it
    /// with rustybuzz. Returns `None` when the data is not a usable face.
    pub fn from_font_data(data: Vec<u8>, face_index: u32) -> Option<Shaper> {
        let face = rustybuzz::Face::from_slice(&data, face_index)?;
        let upem = face.units_per_em();
        let units_per_em = if upem > 0 { upem as f32 } else { 1000.0 };
        Some(Self {
            font_data: data,
            face_index,
            units_per_em,
        })
    }

    /// Create a shaper from a [`FontLibrary`], selecting the best face
    /// (a heavier face when `bold` is set). Returns `None` when the
    /// library has no usable face.
    pub fn from_library(lib: &FontLibrary, bold: bool) -> Option<Shaper> {
        let (data, index) = lib.query_face_weighted(bold)?;
        Self::from_font_data(data, index)
    }

    /// Design units per em of the bound face.
    pub fn units_per_em(&self) -> f32 {
        self.units_per_em
    }

    /// Raw font data of the bound face.
    pub fn font_data(&self) -> &[u8] {
        &self.font_data
    }

    /// Face index of the bound face within the font file.
    pub fn face_index(&self) -> u32 {
        self.face_index
    }

    /// Shape `text` at `font_size` (pixels).
    ///
    /// Returns a [`ShapedRun`] whose glyph positions are already scaled
    /// to pixel space. Latin v1: no features — glyph `i` corresponds to
    /// char `i`, which is what backs `ShapedGlyph::is_space`.
    pub fn shape(&self, text: &str, font_size: f32) -> ShapedRun {
        let empty = ShapedRun {
            font_size,
            glyphs: Vec::new(),
        };
        let face = match rustybuzz::Face::from_slice(&self.font_data, self.face_index) {
            Some(face) => face,
            None => return empty,
        };

        let unit_scale = font_size / self.units_per_em;

        let mut buffer = rustybuzz::UnicodeBuffer::new();
        buffer.push_str(text);
        buffer.guess_segment_properties();
        let glyph_buffer = rustybuzz::shape(&face, &[], buffer);

        let chars: Vec<char> = text.chars().collect();
        let infos = glyph_buffer.glyph_infos();
        let positions = glyph_buffer.glyph_positions();

        let mut glyphs = Vec::with_capacity(infos.len());
        for (i, (info, pos)) in infos.iter().zip(positions.iter()).enumerate() {
            glyphs.push(ShapedGlyph {
                glyph_id: info.glyph_id as u16,
                x_offset: pos.x_offset as f32 * unit_scale,
                y_offset: pos.y_offset as f32 * unit_scale,
                x_advance: pos.x_advance as f32 * unit_scale,
                y_advance: pos.y_advance as f32 * unit_scale,
                is_space: matches!(chars.get(i), Some(c) if c.is_whitespace()),
            });
        }

        ShapedRun { font_size, glyphs }
    }

    /// Width in pixels of `text` shaped at `font_size`.
    pub fn advance(&self, text: &str, font_size: f32) -> f32 {
        self.shape(text, font_size).width()
    }
}
