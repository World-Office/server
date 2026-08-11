//! Document layout engine — connects wo-ooxml model to wo-renderer canvas.
//!
//! Uses proper font metrics (via `FontLibrary::char_advance`) for line breaking,
//! page layout from section properties, and renders to the canvas.
//!
//! This is the "C++ layout engine" equivalent in ONLYOFFICE's architecture.

use wo_ooxml::model::{DocxBody, DocxParagraph};
use wo_renderer::canvas::Canvas;
use wo_renderer::color::Color;
use wo_renderer::fonts::FontLibrary;

/// Page dimensions for common paper sizes (in points).
const PAGE_SIZES_PT: &[(&str, f32, f32)] = &[
    ("A4", 595.0, 842.0),
    ("A3", 842.0, 1191.0),
    ("Letter", 612.0, 792.0),
    ("Legal", 612.0, 1008.0),
];

/// DPI for pixel conversion.
const PT_TO_PX: f32 = 96.0 / 72.0;

/// Default line height multiplier.
const LINE_HEIGHT_FACTOR: f32 = 1.2;

// ── Data structures ──────────────────────────────────────────────────

/// A single laid-out character with position and formatting.
#[derive(Debug, Clone)]
pub struct LaidOutChar {
    pub ch: char,
    pub x: f32,
    pub y: f32,
    pub font_size_pt: f32,
    pub color: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
}

/// A laid-out line containing characters.
#[derive(Debug, Clone)]
pub struct LaidOutLine {
    pub chars: Vec<LaidOutChar>,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// A laid-out paragraph.
#[derive(Debug, Clone)]
pub struct LaidOutParagraph {
    pub lines: Vec<LaidOutLine>,
    pub y: f32,
    pub height: f32,
    pub style_id: Option<String>,
}

/// Page layout information.
#[derive(Debug, Clone)]
pub struct PageLayout {
    pub width_px: u32,
    pub height_px: u32,
    pub margin_px: f32,
    pub content_x: f32,
    pub content_y: f32,
    pub content_width: f32,
    pub content_height: f32,
}

/// A fully laid-out page.
#[derive(Debug, Clone)]
pub struct LaidOutPage {
    pub layout: PageLayout,
    pub paragraphs: Vec<LaidOutParagraph>,
}

// ── Layout Engine ────────────────────────────────────────────────────

/// Layout engine that produces precise page layouts from OOXML document bodies.
pub struct LayoutEngine {
    font_library: FontLibrary,
    // Cache: (text, font_size_pt*100, bold, italic) → width in pt
    width_cache: std::collections::HashMap<(String, u32, bool, bool), f32>,
}

impl Default for LayoutEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl LayoutEngine {
    pub fn new() -> Self {
        Self {
            font_library: FontLibrary::new(),
            width_cache: std::collections::HashMap::new(),
        }
    }

    pub fn load_font(&mut self, font_data: &[u8]) {
        self.font_library.load_font(font_data);
    }

    /// Measure text width in points using real font metrics.
    pub fn measure_text_width_pt(
        &mut self,
        text: &str,
        font_size_pt: f32,
        _bold: bool,
        _italic: bool,
    ) -> f32 {
        if text.is_empty() {
            return 0.0;
        }
        let key = (
            text.to_string(),
            (font_size_pt * 100.0).round() as u32,
            _bold,
            _italic,
        );
        if let Some(&w) = self.width_cache.get(&key) {
            return w;
        }
        let width: f32 = text
            .chars()
            .map(|c| self.font_library.char_advance(c, font_size_pt))
            .sum();
        self.width_cache.insert(key, width);
        width
    }

    /// Measure a space width in points.
    pub fn space_width_pt(&self, font_size_pt: f32) -> f32 {
        self.font_library.space_advance(font_size_pt)
    }

    /// Get line height in points for a given font size.
    pub fn line_height_pt(&self, font_size_pt: f32) -> f32 {
        font_size_pt * LINE_HEIGHT_FACTOR
    }

    // ── Document layout ──────────────────────────────────────────────

    /// Layout a document body onto pages.
    pub fn layout_document(
        &mut self,
        body: &DocxBody,
        page_size: &str,
        orientation: &str,
        margin_pt: f32,
    ) -> Vec<LaidOutPage> {
        let (page_w_pt, page_h_pt) = self.page_dimensions_pt(page_size, orientation);
        let margin_px = margin_pt * PT_TO_PX;
        let content_w_px = (page_w_pt - 2.0 * margin_pt) * PT_TO_PX;
        let content_h_px = (page_h_pt - 2.0 * margin_pt) * PT_TO_PX;

        let pl = PageLayout {
            width_px: (page_w_pt * PT_TO_PX).round() as u32,
            height_px: (page_h_pt * PT_TO_PX).round() as u32,
            margin_px,
            content_x: margin_px,
            content_y: margin_px,
            content_width: content_w_px.max(100.0),
            content_height: content_h_px.max(100.0),
        };

        let max_content_y = pl.content_y + pl.content_height;
        let mut pages: Vec<LaidOutPage> = Vec::new();
        let mut page = LaidOutPage {
            layout: pl.clone(),
            paragraphs: Vec::new(),
        };
        let mut cursor_y = pl.content_y;

        for para in &body.paragraphs {
            // Page break
            if para.properties.page_break_before && cursor_y > pl.content_y + 5.0 {
                pages.push(LaidOutPage {
                    layout: pl.clone(),
                    paragraphs: std::mem::take(&mut page.paragraphs),
                });
                cursor_y = pl.content_y;
            }

            // Spacing before
            cursor_y += para
                .properties
                .spacing_before
                .map(|v| v as f32 * PT_TO_PX / 20.0)
                .unwrap_or(0.0);

            let indent_left = para
                .properties
                .indent_left
                .map(|v| v as f32 * PT_TO_PX / 20.0)
                .unwrap_or(0.0);
            let indent_first = para
                .properties
                .indent_first_line
                .map(|v| v as f32 * PT_TO_PX / 20.0);

            let default_fs = para
                .runs
                .first()
                .and_then(|r| r.font_size)
                .map(|s| s as f32 / 2.0)
                .unwrap_or(12.0)
                .max(6.0);
            let spacing_line_factor = para
                .properties
                .spacing_line
                .map(|v| v as f32 / 240.0)
                .unwrap_or(1.15);
            let line_h_pt = default_fs * spacing_line_factor;

            // Layout the paragraph
            let max_row_w = pl.content_width - indent_left * PT_TO_PX;
            let (laid_paras, para_h) = self.layout_paragraph(
                para,
                cursor_y,
                indent_left * PT_TO_PX,
                indent_first.unwrap_or(0.0) * PT_TO_PX,
                max_row_w,
                max_content_y,
                default_fs,
                line_h_pt,
            );

            // Check if paragraph fits on current page
            if cursor_y + para_h > max_content_y && cursor_y > pl.content_y + 5.0 {
                pages.push(LaidOutPage {
                    layout: pl.clone(),
                    paragraphs: std::mem::take(&mut page.paragraphs),
                });
                cursor_y = pl.content_y;
                let (relaid, _) = self.layout_paragraph(
                    para,
                    cursor_y,
                    indent_left * PT_TO_PX,
                    indent_first.unwrap_or(0.0) * PT_TO_PX,
                    max_row_w,
                    max_content_y,
                    default_fs,
                    line_h_pt,
                );
                if let Some(p) = relaid.first() {
                    cursor_y = p.y + p.height;
                }
                page.paragraphs.extend(relaid);
            } else {
                if let Some(p) = laid_paras.first() {
                    cursor_y = p.y + p.height;
                } else {
                    cursor_y += line_h_pt * PT_TO_PX;
                }
                page.paragraphs.extend(laid_paras);
            }

            cursor_y += para
                .properties
                .spacing_after
                .map(|v| v as f32 * PT_TO_PX / 20.0)
                .unwrap_or(0.0);
            cursor_y += default_fs * PT_TO_PX * 0.3;
        }

        // Layout tables
        for table in &body.tables {
            if cursor_y > max_content_y - 20.0 {
                pages.push(LaidOutPage {
                    layout: pl.clone(),
                    paragraphs: std::mem::take(&mut page.paragraphs),
                });
                cursor_y = pl.content_y;
            }

            let table_w = table
                .properties
                .width
                .map(|w| w as f32 * PT_TO_PX / 20.0)
                .unwrap_or(pl.content_width);
            let col_count = table
                .rows
                .first()
                .map(|r| r.cells.len())
                .unwrap_or(1)
                .max(1);
            let col_w = table_w / col_count as f32;
            let table_indent = table
                .properties
                .indent
                .map(|i| i as f32 * PT_TO_PX / 20.0)
                .unwrap_or(0.0)
                + pl.content_x;

            for row in &table.rows {
                let row_h_pt = row.height.map(|h| h as f32).unwrap_or(24.0);
                let row_h_px = row_h_pt * PT_TO_PX;

                if cursor_y + row_h_px > max_content_y {
                    pages.push(LaidOutPage {
                        layout: pl.clone(),
                        paragraphs: std::mem::take(&mut page.paragraphs),
                    });
                    cursor_y = pl.content_y;
                }

                for (ci, cell) in row.cells.iter().enumerate() {
                    let cell_x = table_indent + ci as f32 * col_w;
                    for cp in &cell.paragraphs {
                        let cf = cp
                            .runs
                            .first()
                            .and_then(|r| r.font_size)
                            .map(|s| s as f32 / 2.0)
                            .unwrap_or(11.0);
                        let cell_max_w = col_w - 8.0;
                        let (cl, _) = self.layout_paragraph(
                            cp,
                            cursor_y,
                            cell_x,
                            0.0,
                            cell_max_w,
                            cursor_y + row_h_px,
                            cf,
                            cf * 1.15,
                        );
                        page.paragraphs.extend(cl);
                    }
                }
                cursor_y += row_h_px;
            }
            cursor_y += 12.0 * PT_TO_PX;
        }

        pages.push(page);
        pages
    }

    /// Layout a single paragraph into lines with character-level positioning.
    #[allow(clippy::too_many_arguments)]
    fn layout_paragraph(
        &mut self,
        para: &DocxParagraph,
        start_y: f32,
        indent_px: f32,
        first_indent_px: f32,
        max_width_px: f32,
        max_y: f32,
        default_fs_pt: f32,
        line_h_pt: f32,
    ) -> (Vec<LaidOutParagraph>, f32) {
        let base_lh_px = line_h_pt * PT_TO_PX;
        let mut lines: Vec<LaidOutLine> = Vec::new();
        let mut cursor_y = start_y;
        let mut line_num = 0u32;

        // Collect formatted runs
        struct FormattedChunk<'a> {
            text: &'a str,
            font_size_pt: f32,
            color: String,
            bold: bool,
            italic: bool,
            underline: bool,
        }

        let chunks: Vec<FormattedChunk> = para
            .runs
            .iter()
            .filter(|r| !r.text.is_empty())
            .map(|r| {
                let fs = r
                    .font_size
                    .map(|s| s as f32 / 2.0)
                    .unwrap_or(default_fs_pt)
                    .max(6.0);
                let c = r
                    .color
                    .as_ref()
                    .map(|c| {
                        if c.starts_with('#') {
                            c.clone()
                        } else {
                            format!("#{}", c)
                        }
                    })
                    .unwrap_or_else(|| "#000000".into());
                FormattedChunk {
                    text: &r.text,
                    font_size_pt: fs,
                    color: c,
                    bold: r.bold,
                    italic: r.italic,
                    underline: r.underline.is_some(),
                }
            })
            .collect();

        if chunks.is_empty() {
            let empty_line = LaidOutLine {
                chars: vec![],
                x: 0.0,
                y: cursor_y + base_lh_px * 0.8,
                width: 0.0,
                height: base_lh_px,
            };
            return (
                vec![LaidOutParagraph {
                    lines: vec![empty_line],
                    y: start_y,
                    height: base_lh_px,
                    style_id: para.style_id.clone(),
                }],
                base_lh_px,
            );
        }

        let mut current_line_chars: Vec<LaidOutChar> = Vec::new();
        let mut cur_x = indent_px + if line_num == 0 { first_indent_px } else { 0.0 };

        for chunk in &chunks {
            let _line_h_chunk_px = chunk.font_size_pt * LINE_HEIGHT_FACTOR * PT_TO_PX;
            let _space_w = self.space_width_pt(chunk.font_size_pt) * PT_TO_PX;
            let chars: Vec<char> = chunk.text.chars().collect();
            let mut ci = 0;

            while ci < chars.len() {
                if cursor_y > max_y {
                    break;
                }

                let ch = chars[ci];

                if ch == '\n' {
                    // Force line break
                    let line_w =
                        cur_x - (indent_px + if line_num == 0 { first_indent_px } else { 0.0 });
                    if !current_line_chars.is_empty() {
                        lines.push(LaidOutLine {
                            chars: std::mem::take(&mut current_line_chars),
                            x: indent_px + if line_num == 0 { first_indent_px } else { 0.0 },
                            y: cursor_y,
                            width: line_w.max(0.0),
                            height: base_lh_px,
                        });
                        cursor_y += base_lh_px;
                        line_num += 1;
                        cur_x = indent_px;
                    }
                    ci += 1;
                    continue;
                }

                let ch_w = self.font_library.char_advance(ch, chunk.font_size_pt) * PT_TO_PX;

                // Check if we need to wrap (for space characters)
                if ch == ' ' && !current_line_chars.is_empty() && cur_x + ch_w > max_width_px {
                    // Wrap at this space
                    if !current_line_chars.is_empty() {
                        lines.push(LaidOutLine {
                            chars: std::mem::take(&mut current_line_chars),
                            x: indent_px + if line_num == 0 { first_indent_px } else { 0.0 },
                            y: cursor_y,
                            width: cur_x
                                - (indent_px + if line_num == 0 { first_indent_px } else { 0.0 }),
                            height: base_lh_px,
                        });
                        cursor_y += base_lh_px;
                        line_num += 1;
                        cur_x = indent_px;
                    }
                    ci += 1;
                    continue;
                }

                // For non-space: check if word exceeds line width
                if ch != ' ' && cur_x + ch_w > max_width_px && !current_line_chars.is_empty() {
                    // Check if this char starts a new word (preceded by space)
                    let starts_new_word = current_line_chars
                        .last()
                        .map(|lc| lc.ch == ' ')
                        .unwrap_or(true);

                    if starts_new_word && current_line_chars.len() == 1 {
                        // Single space on line — add the word anyway (it's wider than the line)
                    } else if !starts_new_word {
                        // We're mid-word — wrap before this word
                        // Find where the word starts (after the last space)
                        let word_start = current_line_chars.iter().rposition(|lc| lc.ch == ' ');

                        if let Some(ws) = word_start {
                            // Split: first part (up to and including space) stays, rest goes to next line
                            let (keep, rest) = if ws + 1 < current_line_chars.len() {
                                let mut k = current_line_chars[..=ws].to_vec();
                                let r = current_line_chars[ws + 1..].to_vec();
                                k.pop(); // remove the trailing space
                                (k, r)
                            } else {
                                (current_line_chars.clone(), vec![])
                            };

                            if !keep.is_empty() {
                                let line_w: f32 = keep
                                    .iter()
                                    .map(|lc| {
                                        self.font_library.char_advance(lc.ch, lc.font_size_pt)
                                            * PT_TO_PX
                                    })
                                    .sum();
                                lines.push(LaidOutLine {
                                    chars: keep,
                                    x: indent_px
                                        + if line_num == 0 { first_indent_px } else { 0.0 },
                                    y: cursor_y,
                                    width: line_w,
                                    height: base_lh_px,
                                });
                            }
                            cursor_y += base_lh_px;
                            line_num += 1;
                            current_line_chars = rest;
                            cur_x = indent_px
                                + current_line_chars
                                    .iter()
                                    .map(|lc| {
                                        self.font_library.char_advance(lc.ch, lc.font_size_pt)
                                            * PT_TO_PX
                                    })
                                    .sum::<f32>();
                            // Don't advance ci — re-process this char in new line context
                            continue;
                        } else {
                            // No space in current line — line is full, start new one
                            if !current_line_chars.is_empty() {
                                let line_w: f32 = current_line_chars
                                    .iter()
                                    .map(|lc| {
                                        self.font_library.char_advance(lc.ch, lc.font_size_pt)
                                            * PT_TO_PX
                                    })
                                    .sum();
                                lines.push(LaidOutLine {
                                    chars: std::mem::take(&mut current_line_chars),
                                    x: indent_px
                                        + if line_num == 0 { first_indent_px } else { 0.0 },
                                    y: cursor_y,
                                    width: line_w,
                                    height: base_lh_px,
                                });
                                cursor_y += base_lh_px;
                                line_num += 1;
                                cur_x = indent_px;
                            }
                        }
                    }
                }

                // Add character to current line
                let color = chunk.color.clone();
                current_line_chars.push(LaidOutChar {
                    ch,
                    x: cur_x,
                    y: cursor_y,
                    font_size_pt: chunk.font_size_pt,
                    color,
                    bold: chunk.bold,
                    italic: chunk.italic,
                    underline: chunk.underline,
                });
                cur_x += ch_w;

                ci += 1;
            }

            if cursor_y > max_y {
                break;
            }
        }

        // Finalize last line
        if !current_line_chars.is_empty() {
            let line_w: f32 = current_line_chars
                .iter()
                .map(|lc| self.font_library.char_advance(lc.ch, lc.font_size_pt) * PT_TO_PX)
                .sum();
            lines.push(LaidOutLine {
                chars: std::mem::take(&mut current_line_chars),
                x: indent_px + if line_num == 0 { first_indent_px } else { 0.0 },
                y: cursor_y,
                width: line_w,
                height: base_lh_px,
            });
            cursor_y += base_lh_px;
        }

        let para_h = cursor_y - start_y;
        (
            vec![LaidOutParagraph {
                lines,
                y: start_y,
                height: para_h.max(base_lh_px),
                style_id: para.style_id.clone(),
            }],
            para_h.max(base_lh_px),
        )
    }

    /// Render a laid-out page onto a `wo_renderer::Canvas`.
    pub fn render_page_to_canvas(&self, page: &LaidOutPage, canvas: &mut Canvas) {
        // White background
        canvas.set_fill(wo_renderer::color::Paint::Color(Color::new(
            1.0, 1.0, 1.0, 1.0,
        )));
        canvas.fill_rect(
            0.0,
            0.0,
            page.layout.width_px as f32,
            page.layout.height_px as f32,
        );

        for para in &page.paragraphs {
            for line in &para.lines {
                // Draw each character
                for lc in &line.chars {
                    let color = parse_color_hex(&lc.color).unwrap_or(Color::BLACK);
                    let text = lc.ch.to_string();
                    let font_size_px = (lc.font_size_pt * PT_TO_PX) as f64;
                    let y_pos = (lc.y + lc.font_size_pt * PT_TO_PX * 0.8) as f64;
                    canvas.draw_text(&text, lc.x as f64, y_pos, font_size_px, "sans-serif", color);
                }
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    fn page_dimensions_pt(&self, page_size: &str, orientation: &str) -> (f32, f32) {
        let (w, h) = PAGE_SIZES_PT
            .iter()
            .find(|(n, _, _)| n.eq_ignore_ascii_case(page_size))
            .map(|(_, w, h)| (*w, *h))
            .unwrap_or((595.0, 842.0));
        if orientation == "landscape" {
            (h, w)
        } else {
            (w, h)
        }
    }
}

// ── Color parsing ────────────────────────────────────────────────────

fn parse_color_hex(hex: &str) -> Option<Color> {
    let hex = hex.trim_start_matches('#');
    if hex.len() == 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
        let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
        let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
        Some(Color::new(
            r as f32 / 255.0,
            g as f32 / 255.0,
            b as f32 / 255.0,
            1.0,
        ))
    } else if hex.len() == 3 {
        let r = u8::from_str_radix(&hex[0..1], 16).ok()? * 17;
        let g = u8::from_str_radix(&hex[1..2], 16).ok()? * 17;
        let b = u8::from_str_radix(&hex[2..3], 16).ok()? * 17;
        Some(Color::new(
            r as f32 / 255.0,
            g as f32 / 255.0,
            b as f32 / 255.0,
            1.0,
        ))
    } else {
        None
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_page_dimensions() {
        let engine = LayoutEngine::new();
        assert_eq!(engine.page_dimensions_pt("A4", "portrait"), (595.0, 842.0));
        assert_eq!(engine.page_dimensions_pt("A4", "landscape"), (842.0, 595.0));
        assert_eq!(
            engine.page_dimensions_pt("Letter", "portrait"),
            (612.0, 792.0)
        );
    }

    #[test]
    fn test_measure_text() {
        let mut engine = LayoutEngine::new();
        let w = engine.measure_text_width_pt("Hello", 12.0, false, false);
        assert!(w > 0.0);
    }

    #[test]
    fn test_layout_empty_body() {
        let mut engine = LayoutEngine::new();
        let body = DocxBody::default();
        let pages = engine.layout_document(&body, "A4", "portrait", 72.0);
        assert!(!pages.is_empty());
        assert!(pages[0].paragraphs.is_empty());
    }

    #[test]
    fn test_parse_color_hex() {
        let c = parse_color_hex("#FF0000").unwrap();
        assert!((c.r - 1.0).abs() < 0.01);
        let c = parse_color_hex("#00FF00").unwrap();
        assert!((c.g - 1.0).abs() < 0.01);
        assert!(parse_color_hex("invalid").is_none());
    }
}
