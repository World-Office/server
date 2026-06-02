//! Font library wrapping fontdb for font metrics access.
//!
//! Provides a `FontLibrary` struct that wraps a `fontdb::Database` and
//! exposes character advance widths, ascent, and descent from real font data.
//! Falls back to reasonable defaults when no font is available.

use std::fmt;

use fontdb::{Family, Query};
use wo_fonts::FontLoader;

/// Fallback character advance when no font is available (50% of em).
const FALLBACK_CHAR_FACTOR: f32 = 0.5;
/// Fallback ascent when no font is available (80% of em).
const FALLBACK_ASCENT_FACTOR: f32 = 0.8;
/// Fallback descent when no font is available (20% of em).
const FALLBACK_DESCENT_FACTOR: f32 = 0.2;

/// Font library backed by a fontdb database.
///
/// Provides real glyph metrics from loaded fonts, with fallback defaults
/// when no font data is available (e.g. in test environments with an empty library).
pub struct FontLibrary {
    db: fontdb::Database,
}

impl fmt::Debug for FontLibrary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("FontLibrary")
            .field("faces", &self.db.len())
            .finish()
    }
}

impl Default for FontLibrary {
    fn default() -> Self {
        Self::new()
    }
}

impl FontLibrary {
    /// Create a new font library with system fonts loaded.
    ///
    /// Scans standard system font directories. On systems with no fonts,
    /// behaves identically to [`FontLibrary::empty`].
    pub fn new() -> Self {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        Self { db }
    }

    /// Create an empty font library with no fonts loaded.
    ///
    /// Useful for testing — all metrics will use fallback defaults.
    pub fn empty() -> Self {
        Self {
            db: fontdb::Database::new(),
        }
    }

    /// Load a custom font from raw font data (TTF, OTF, WOFF, WOFF2).
    ///
    /// The font becomes available for metrics queries.
    pub fn load_font(&mut self, data: &[u8]) {
        self.db.load_font_data(data.to_vec());
    }

    /// Get the number of loaded font faces.
    pub fn face_count(&self) -> usize {
        self.db.len()
    }

    /// Find the best available face ID for general use.
    ///
    /// Tries sans-serif first, then falls back to any face in the database.
    fn best_face_id(&self) -> Option<fontdb::ID> {
        // Try sans-serif as the default
        let query = Query {
            families: &[Family::SansSerif],
            ..Self::default_query()
        };
        if let Some(id) = self.db.query(&query) {
            return Some(id);
        }

        // Fall back to the first available face
        self.db.faces().next().map(|info| info.id)
    }

    /// A default query with normal weight, stretch, and style.
    fn default_query() -> Query<'static> {
        Query {
            families: &[],
            weight: fontdb::Weight::NORMAL,
            stretch: fontdb::Stretch::Normal,
            style: fontdb::Style::Normal,
        }
    }

    /// Execute a callback with the raw font data and face index for the best face.
    ///
    /// Returns `None` if no face is available or the data cannot be read.
    fn with_best_face_data<T>(&self, f: impl FnOnce(&[u8], u32) -> T) -> Option<T> {
        let id = self.best_face_id()?;
        self.db.with_face_data(id, f)
    }

    /// Get the advance width for a character at the given font size.
    ///
    /// Queries the best available font face for the glyph advance width.
    /// Falls back to `font_size * 0.5` when no font is available or the
    /// character is not present in the font.
    pub fn char_advance(&self, ch: char, font_size: f32) -> f32 {
        self.with_best_face_data(|data, _index| {
            FontLoader::char_width(data, ch, font_size).unwrap_or(font_size * FALLBACK_CHAR_FACTOR)
        })
        .unwrap_or(font_size * FALLBACK_CHAR_FACTOR)
    }

    /// Get the glyph ID for a character.
    ///
    /// Falls back to a synthetic glyph ID derived from the codepoint.
    pub fn glyph_id(&self, ch: char) -> u16 {
        self.with_best_face_data(|data, _index| {
            FontLoader::codepoint_to_glyph(data, ch).unwrap_or((ch as u32 % 65536) as u16)
        })
        .unwrap_or((ch as u32 % 65536) as u16)
    }

    /// Get the scaled ascent for the given font size.
    ///
    /// Falls back to `font_size * 0.8` when no font is available.
    pub fn ascent(&self, font_size: f32) -> f32 {
        self.with_best_face_data(|data, _index| match FontLoader::load_font(data) {
            Ok(info) => {
                let scale = font_size / info.units_per_em as f32;
                info.ascender as f32 * scale
            }
            Err(_) => font_size * FALLBACK_ASCENT_FACTOR,
        })
        .unwrap_or(font_size * FALLBACK_ASCENT_FACTOR)
    }

    /// Get the scaled descent for the given font size.
    ///
    /// Returns a positive value (distance below baseline).
    /// Falls back to `font_size * 0.2` when no font is available.
    pub fn descent(&self, font_size: f32) -> f32 {
        self.with_best_face_data(|data, _index| match FontLoader::load_font(data) {
            Ok(info) => {
                let scale = font_size / info.units_per_em as f32;
                (-info.descender) as f32 * scale
            }
            Err(_) => font_size * FALLBACK_DESCENT_FACTOR,
        })
        .unwrap_or(font_size * FALLBACK_DESCENT_FACTOR)
    }

    /// Get the space character advance width at the given font size.
    pub fn space_advance(&self, font_size: f32) -> f32 {
        self.char_advance(' ', font_size)
    }

    /// Get the raw font data and face index for the best available face.
    ///
    /// Returns a cloned copy of the font data and the face index within
    /// the font file (for TrueType collections). Returns `None` if no
    /// face is available.
    pub fn query_face(&self) -> Option<(Vec<u8>, u32)> {
        self.with_best_face_data(|data, index| (data.to_vec(), index))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_library_fallbacks() {
        let lib = FontLibrary::empty();
        assert_eq!(lib.face_count(), 0);

        // All metrics should return fallback defaults
        assert_eq!(lib.char_advance('A', 12.0), 6.0); // 12.0 * 0.5
        assert_eq!(lib.char_advance(' ', 12.0), 6.0);
        assert_eq!(lib.ascent(12.0), 9.6); // 12.0 * 0.8
        assert_eq!(lib.descent(12.0), 2.4); // 12.0 * 0.2
        assert_eq!(lib.space_advance(12.0), 6.0);
    }

    #[test]
    fn test_empty_library_glyph_id_fallback() {
        let lib = FontLibrary::empty();
        // Should return synthetic glyph IDs
        assert_eq!(lib.glyph_id('A'), 65); // 'A' as u32 % 65536
        assert_eq!(lib.glyph_id('世'), 19990);
    }

    #[test]
    fn test_empty_library_debug() {
        let lib = FontLibrary::empty();
        let debug_str = format!("{:?}", lib);
        assert!(debug_str.contains("FontLibrary"));
        assert!(debug_str.contains("faces"));
    }

    #[test]
    fn test_load_invalid_font_data() {
        let mut lib = FontLibrary::empty();
        // Loading invalid data shouldn't panic
        lib.load_font(&[0xFF, 0xFF, 0xFF, 0xFF]);
        // face_count may or may not increase depending on fontdb validation
    }

    #[test]
    fn test_fallback_scales_with_font_size() {
        let lib = FontLibrary::empty();

        let w10 = lib.char_advance('A', 10.0);
        let w20 = lib.char_advance('A', 20.0);
        assert!((w20 - 2.0 * w10).abs() < 0.001);

        let a10 = lib.ascent(10.0);
        let a20 = lib.ascent(20.0);
        assert!((a20 - 2.0 * a10).abs() < 0.001);
    }
}
