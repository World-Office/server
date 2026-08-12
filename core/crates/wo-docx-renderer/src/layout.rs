//! DOCX layout engine.
//!
//! Converts a parsed `DocxBody` into a list of `LayoutPage` structs,
//! computing text flow, line wrapping, paragraph spacing, page breaks,
//! and basic table layout.

use wo_ooxml::model::*;

use crate::model::RenderConfig;

/// Default font size in points (reserved for future use).
#[allow(dead_code)]
const DEFAULT_FONT_SIZE_PT: f32 = 12.0;

/// Default line height multiplier when no explicit spacing_line is set.
const DEFAULT_LINE_HEIGHT_FACTOR: f32 = 1.2;

/// Approximate character width as a fraction of font size.
const CHAR_WIDTH_FACTOR: f32 = 0.5;

/// Layout engine that converts DOCX body into paged layout.
#[allow(dead_code)]
pub struct LayoutEngine {
    page_width: f32,
    page_height: f32,
    margin_top: f32,
    margin_right: f32,
    margin_bottom: f32,
    margin_left: f32,
    content_width: f32,
    content_height: f32,
}

impl LayoutEngine {
    pub fn new(config: &RenderConfig) -> Self {
        let margin_left = config.margins.left;
        let margin_right = config.margins.right;
        let margin_top = config.margins.top;
        let margin_bottom = config.margins.bottom;
        let content_width = config.page_width - margin_left - margin_right;
        let content_height = config.page_height - margin_top - margin_bottom;

        Self {
            page_width: config.page_width,
            page_height: config.page_height,
            margin_top,
            margin_right,
            margin_bottom,
            margin_left,
            content_width,
            content_height,
        }
    }

    /// Layout a DocxBody into pages.
    pub fn layout(&self, body: &DocxBody) -> Vec<LayoutPage> {
        let mut pages = Vec::new();
        let mut current_page = LayoutPage {
            elements: Vec::new(),
            width: self.page_width,
            height: self.page_height,
        };
        let mut cursor_y = self.margin_top;

        // Build a flattened event stream from blocks preserving document order
        let mut body_items: Vec<BodyItem> = Vec::new();
        for block in &body.blocks {
            match block {
                DocxBlock::Paragraph(p) => {
                    body_items.push(BodyItem::Paragraph(p));
                }
                DocxBlock::Table(t) => {
                    body_items.push(BodyItem::Table(t));
                }
            }
        }

        for item in body_items {
            match item {
                BodyItem::Paragraph(para) => {
                    // Handle page_break_before
                    if para.properties.page_break_before && !current_page.elements.is_empty() {
                        pages.push(current_page);
                        current_page = LayoutPage {
                            elements: Vec::new(),
                            width: self.page_width,
                            height: self.page_height,
                        };
                        cursor_y = self.margin_top;
                    }

                    // Spacing before (twips → points: divide by 20)
                    let spacing_before_pt =
                        para.properties.spacing_before.unwrap_or(0) as f32 / 20.0;
                    cursor_y += spacing_before_pt;

                    let alignment = para.properties.alignment.unwrap_or(TextAlignment::Left);

                    // Indentation in twips → points
                    let indent_left = para.properties.indent_left.unwrap_or(0) as f32 / 20.0;
                    let indent_first_line =
                        para.properties.indent_first_line.unwrap_or(0) as f32 / 20.0;

                    let x_start = self.margin_left + indent_left + indent_first_line.max(0.0);
                    let effective_width =
                        self.content_width - indent_left - indent_first_line.abs();

                    // Determine font size for this paragraph (from first run with font_size, or default)
                    let font_size =
                        para.runs.iter().find_map(|r| r.font_size).unwrap_or(24) as f32 / 2.0; // half-points → points

                    // Determine line height
                    let line_height = if let Some(spacing_line) = para.properties.spacing_line {
                        let rule = para
                            .properties
                            .spacing_line_rule
                            .unwrap_or(LineSpacingRule::Auto);
                        match rule {
                            LineSpacingRule::Auto => spacing_line as f32 / 240.0 * font_size,
                            LineSpacingRule::Exact | LineSpacingRule::AtLeast => {
                                spacing_line as f32 / 20.0
                            }
                        }
                    } else {
                        font_size * DEFAULT_LINE_HEIGHT_FACTOR
                    };

                    // Split paragraph runs into lines by wrapping at effective_width
                    let lines = self.wrap_paragraph_into_lines(
                        para,
                        effective_width,
                        font_size,
                        line_height,
                        x_start,
                        cursor_y,
                        alignment,
                    );

                    let total_height = if lines.is_empty() {
                        line_height
                    } else {
                        lines.last().unwrap().height // the y+height of the last line
                            + (lines.last().unwrap().y - cursor_y)
                    };

                    // Check page overflow
                    if cursor_y + total_height > self.page_height - self.margin_bottom
                        && !current_page.elements.is_empty()
                    {
                        pages.push(current_page);
                        current_page = LayoutPage {
                            elements: Vec::new(),
                            width: self.page_width,
                            height: self.page_height,
                        };
                        cursor_y = self.margin_top + spacing_before_pt;
                        // Re-compute lines for new page y offset
                        let lines = self.wrap_paragraph_into_lines(
                            para,
                            effective_width,
                            font_size,
                            line_height,
                            x_start,
                            cursor_y,
                            alignment,
                        );
                        current_page
                            .elements
                            .push(LayoutElement::Paragraph { lines, alignment });
                        // Update cursor_y: advance by actual line content height
                        if let Some(LayoutElement::Paragraph { lines: ref ls, .. }) =
                            current_page.elements.last()
                        {
                            if !ls.is_empty() {
                                cursor_y = ls.last().unwrap().y + ls.last().unwrap().height;
                            } else {
                                cursor_y += line_height;
                            }
                        }
                    } else {
                        current_page.elements.push(LayoutElement::Paragraph {
                            lines: lines.clone(),
                            alignment,
                        });
                        // Update cursor
                        if !lines.is_empty() {
                            cursor_y = lines.last().unwrap().y + lines.last().unwrap().height;
                        } else {
                            cursor_y += line_height;
                        }
                    }

                    // Spacing after (twips → points)
                    let spacing_after_pt = para.properties.spacing_after.unwrap_or(0) as f32 / 20.0;
                    cursor_y += spacing_after_pt;
                }
                BodyItem::Table(table) => {
                    let layout_table = self.layout_table(table, cursor_y);

                    let table_height = layout_table.height;

                    // Check page overflow
                    if cursor_y + table_height > self.page_height - self.margin_bottom
                        && !current_page.elements.is_empty()
                    {
                        pages.push(current_page);
                        current_page = LayoutPage {
                            elements: Vec::new(),
                            width: self.page_width,
                            height: self.page_height,
                        };
                        cursor_y = self.margin_top;
                        let layout_table = self.layout_table(table, cursor_y);
                        current_page.elements.push(LayoutElement::Table {
                            cells: layout_table.cells,
                            row_heights: layout_table.row_heights,
                            x: layout_table.x,
                            y: layout_table.y,
                            width: layout_table.width,
                        });
                        cursor_y += layout_table.height;
                    } else {
                        current_page.elements.push(LayoutElement::Table {
                            cells: layout_table.cells,
                            row_heights: layout_table.row_heights.clone(),
                            x: layout_table.x,
                            y: layout_table.y,
                            width: layout_table.width,
                        });
                        cursor_y += table_height;
                    }
                }
            }
        }

        // Push last page if it has content
        if !current_page.elements.is_empty() {
            pages.push(current_page);
        }

        if pages.is_empty() {
            // At least one empty page
            pages.push(LayoutPage {
                elements: Vec::new(),
                width: self.page_width,
                height: self.page_height,
            });
        }

        pages
    }

    #[allow(clippy::too_many_arguments)]
    /// Wrap paragraph text into lines using character-level width estimation.
    fn wrap_paragraph_into_lines(
        &self,
        para: &DocxParagraph,
        available_width: f32,
        default_font_size: f32,
        line_height: f32,
        x_start: f32,
        y_start: f32,
        alignment: TextAlignment,
    ) -> Vec<LayoutLine> {
        let mut lines = Vec::new();
        let mut _line_texts: Vec<String> = Vec::new(); // (text, font_size, bold, italic, color)
        let mut line_runs: Vec<LineRunInfo> = Vec::new();
        let mut current_line_width = 0.0;

        for run in &para.runs {
            if run.text.is_empty() {
                continue;
            }

            let font_size = run.font_size.unwrap_or(24) as f32 / 2.0;
            let color = run.color.clone().unwrap_or_else(|| "000000".to_string());

            // Process each character; for simplicity treat non-space sequences as words
            let text = &run.text;
            let mut word_start = 0;

            for (i, ch) in text.char_indices() {
                if ch == '\n' {
                    // Hard line break
                    let word = &text[word_start..i];
                    if !word.is_empty() {
                        let word_width = self.measure_text_width(word, font_size);
                        if current_line_width == 0.0
                            || current_line_width + word_width <= available_width
                        {
                            current_line_width += word_width;
                            line_runs.push(LineRunInfo {
                                text: word.to_string(),
                                font_size,
                                bold: run.bold,
                                italic: run.italic,
                                color: color.clone(),
                            });
                        } else {
                            // Flush current line
                            self.flush_line(
                                &mut lines,
                                &mut line_runs,
                                current_line_width,
                                available_width,
                                x_start,
                                y_start,
                                line_height,
                                alignment,
                            );
                            current_line_width = word_width;
                            line_runs.push(LineRunInfo {
                                text: word.to_string(),
                                font_size,
                                bold: run.bold,
                                italic: run.italic,
                                color: color.clone(),
                            });
                        }
                    }
                    // Flush the line
                    self.flush_line(
                        &mut lines,
                        &mut line_runs,
                        current_line_width,
                        available_width,
                        x_start,
                        y_start,
                        line_height,
                        alignment,
                    );
                    current_line_width = 0.0;
                    word_start = i + ch.len_utf8();
                } else if ch == ' ' {
                    let word = &text[word_start..=i]; // include the space
                    let word_width = self.measure_text_width(word, font_size);
                    if current_line_width == 0.0
                        || current_line_width + word_width <= available_width
                    {
                        current_line_width += word_width;
                        line_runs.push(LineRunInfo {
                            text: word.to_string(),
                            font_size,
                            bold: run.bold,
                            italic: run.italic,
                            color: color.clone(),
                        });
                    } else {
                        // Flush current line, start new line with word
                        self.flush_line(
                            &mut lines,
                            &mut line_runs,
                            current_line_width,
                            available_width,
                            x_start,
                            y_start,
                            line_height,
                            alignment,
                        );
                        current_line_width = word_width;
                        line_runs.push(LineRunInfo {
                            text: word.to_string(),
                            font_size,
                            bold: run.bold,
                            italic: run.italic,
                            color: color.clone(),
                        });
                    }
                    word_start = i + ch.len_utf8();
                }
            }

            // Remaining text after the last space/newline
            let remaining = &text[word_start..];
            if !remaining.is_empty() {
                let word_width = self.measure_text_width(remaining, font_size);
                if current_line_width == 0.0 || current_line_width + word_width <= available_width {
                    current_line_width += word_width;
                    line_runs.push(LineRunInfo {
                        text: remaining.to_string(),
                        font_size,
                        bold: run.bold,
                        italic: run.italic,
                        color: color.clone(),
                    });
                } else {
                    // Flush and start new line
                    self.flush_line(
                        &mut lines,
                        &mut line_runs,
                        current_line_width,
                        available_width,
                        x_start,
                        y_start,
                        line_height,
                        alignment,
                    );
                    current_line_width = word_width;
                    line_runs.push(LineRunInfo {
                        text: remaining.to_string(),
                        font_size,
                        bold: run.bold,
                        italic: run.italic,
                        color: color.clone(),
                    });
                }
            }
        }

        // Flush remaining
        if !line_runs.is_empty() {
            self.flush_line(
                &mut lines,
                &mut line_runs,
                current_line_width,
                available_width,
                x_start,
                y_start,
                line_height,
                alignment,
            );
        }

        // If paragraph was empty, create at least one blank line
        if lines.is_empty() {
            lines.push(LayoutLine {
                text: String::new(),
                x: x_start,
                y: y_start,
                width: 0.0,
                height: line_height,
                font_size: default_font_size,
                bold: false,
                italic: false,
                color: "000000".to_string(),
            });
        }

        // Adjust y positions: each line starts after the previous one
        let mut y = y_start;
        for line in &mut lines {
            line.y = y;
            y += line.height;
        }

        lines
    }

    #[allow(clippy::too_many_arguments)]
    fn flush_line(
        &self,
        lines: &mut Vec<LayoutLine>,
        line_runs: &mut Vec<LineRunInfo>,
        line_width: f32,
        available_width: f32,
        x_start: f32,
        y: f32,
        line_height: f32,
        alignment: TextAlignment,
    ) {
        if line_runs.is_empty() {
            return;
        }

        // Merge all runs into text; use first run's formatting for the line level
        let text: String = line_runs.iter().map(|r| r.text.as_str()).collect();
        let first = &line_runs[0];

        // Compute x offset based on alignment
        let x = match alignment {
            TextAlignment::Left => x_start,
            TextAlignment::Center => x_start + (available_width - line_width) / 2.0,
            TextAlignment::Right => x_start + available_width - line_width,
            TextAlignment::Both => x_start, // Justified: we'd need word spacing; for now left-align
        };

        lines.push(LayoutLine {
            text,
            x,
            y, // Will be adjusted later
            width: line_width,
            height: line_height,
            font_size: first.font_size,
            bold: first.bold,
            italic: first.italic,
            color: first.color.clone(),
        });

        line_runs.clear();
    }

    fn measure_text_width(&self, text: &str, font_size_pt: f32) -> f32 {
        text.chars().count() as f32 * font_size_pt * CHAR_WIDTH_FACTOR
    }

    /// Layout a table into a positioned table element.
    fn layout_table(&self, table: &DocxTable, cursor_y: f32) -> LayoutTable {
        let num_rows = table.rows.len();
        if num_rows == 0 {
            return LayoutTable {
                cells: Vec::new(),
                row_heights: Vec::new(),
                x: self.margin_left,
                y: cursor_y,
                width: 0.0,
                height: 0.0,
            };
        }

        // Determine column count from the first row
        let num_cols = table.rows.first().map(|r| r.cells.len()).unwrap_or(0);

        if num_cols == 0 {
            return LayoutTable {
                cells: Vec::new(),
                row_heights: Vec::new(),
                x: self.content_width,
                y: cursor_y,
                width: self.content_width,
                height: 0.0,
            };
        }

        let col_width = self.content_width / num_cols as f32;

        // Compute row heights
        let mut row_heights: Vec<f32> = Vec::with_capacity(num_rows);
        let mut total_height = 0.0;
        let default_row_height = 20.0; // points

        for row in &table.rows {
            // Try to use specified height (twips → points)
            let h = row
                .height
                .map(|h| h as f32 / 20.0)
                .unwrap_or(default_row_height)
                .max(default_row_height);

            // If row has paragraphs, estimate height from text
            let max_para_height = row
                .cells
                .iter()
                .flat_map(|c| c.paragraphs.iter())
                .map(|p| {
                    let font_size =
                        p.runs.iter().find_map(|r| r.font_size).unwrap_or(24) as f32 / 2.0;
                    let run_count = p.runs.len().max(1);
                    let total_text: String = p.runs.iter().map(|r| r.text.as_str()).collect();
                    let num_lines = ((self.measure_text_width(&total_text, font_size) / col_width)
                        .ceil() as usize)
                        .max(run_count)
                        .max(1);
                    num_lines as f32 * font_size * DEFAULT_LINE_HEIGHT_FACTOR * 2.0
                })
                .fold(0.0_f32, |a, b| a.max(b));

            let row_h = h.max(max_para_height + 8.0); // 8pt cell padding
            row_heights.push(row_h);
            total_height += row_h;
        }

        // Build cell layout items
        let mut cells = Vec::new();
        let mut y = cursor_y;
        for (row_idx, row) in table.rows.iter().enumerate() {
            let mut x = self.margin_left;
            let row_h = row_heights[row_idx];
            for cell in row.cells.iter() {
                let cell_w = cell.width.map(|w| w as f32 / 20.0).unwrap_or(col_width);
                cells.push(LayoutCell {
                    paragraphs: cell.paragraphs.clone(),
                    column_span: cell.column_span,
                    row_span: cell.row_span,
                    x,
                    y,
                    width: cell_w,
                    height: row_h,
                });
                x += cell_w;
            }
            y += row_h;
        }

        LayoutTable {
            cells,
            row_heights,
            x: self.margin_left,
            y: cursor_y,
            width: self.content_width,
            height: total_height,
        }
    }
}

/// A laid-out page.
#[derive(Debug, Clone)]
pub struct LayoutPage {
    pub elements: Vec<LayoutElement>,
    pub width: f32,
    pub height: f32,
}

/// A layout element on a page.
#[derive(Debug, Clone)]
pub enum LayoutElement {
    Paragraph {
        lines: Vec<LayoutLine>,
        alignment: TextAlignment,
    },
    Table {
        cells: Vec<LayoutCell>,
        row_heights: Vec<f32>,
        x: f32,
        y: f32,
        width: f32,
    },
    PageBreak,
}

/// A laid-out line of text.
#[derive(Debug, Clone)]
pub struct LayoutLine {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub font_size: f32,
    pub bold: bool,
    pub italic: bool,
    pub color: String,
}

/// A laid-out table.
#[derive(Debug, Clone)]
pub struct LayoutTable {
    pub cells: Vec<LayoutCell>,
    pub row_heights: Vec<f32>,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// A laid-out table cell.
#[derive(Debug, Clone)]
pub struct LayoutCell {
    pub paragraphs: Vec<DocxParagraph>,
    pub column_span: u32,
    pub row_span: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Internal: info about a run contributing to a line.
struct LineRunInfo {
    text: String,
    font_size: f32,
    bold: bool,
    italic: bool,
    color: String,
}

/// Internal: body item enum for preserving paragraph/table ordering.
enum BodyItem<'a> {
    Paragraph(&'a DocxParagraph),
    Table(&'a DocxTable),
}

/// A laid-out header or footer element on a page.
#[derive(Debug, Clone)]
pub struct LayoutHeaderFooter {
    pub elements: Vec<LayoutElement>,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub is_header: bool,
}

/// Layout engine implementation for header/footer
impl LayoutEngine {
    /// Layout a header or footer for a specific page and section.
    /// 
    /// The section parameter is used to identify which section's header/footer to use.
    /// The h and f parameters provide the header and footer content directly.
    /// 
    /// For page selection:
    /// - page_number: 1-indexed page number
    /// - If page is 1 and header_first exists in section_props, use it
    /// - If page is even and header_even exists, use it
    /// - Otherwise use the default header
    pub fn layout_header_footer(
        &self,
        page_number: u32,
        section_props: &SectionProperties,
    ) -> Vec<LayoutHeaderFooter> {
        let mut results = Vec::new();
        
        // Helper to layout a single header or footer
        fn layout_hf_content(
            engine: &LayoutEngine,
            hf: &HeaderFooter,
            is_header: bool,
        ) -> LayoutHeaderFooter {
            // Create a sub-engine for the header/footer content
            let hf_engine = LayoutEngine {
                page_width: engine.content_width,
                page_height: 100.0, // Arbitrary large value for header/footer
                margin_top: 0.0,
                margin_right: 0.0,
                margin_bottom: 0.0,
                margin_left: 0.0,
                content_width: engine.content_width,
                content_height: 100.0,
            };

            // Create a temporary body from the header/footer blocks
            let body = DocxBody {
                blocks: hf.blocks.clone(),
            };

            // Layout the body content
            let pages = hf_engine.layout(&body);
            
            // Take all elements from the first page
            let elements = if !pages.is_empty() {
                pages[0].elements.clone()
            } else {
                Vec::new()
            };

            // Calculate the actual height used
            let height = elements.iter().fold(0.0, |acc, elem| {
                acc + match elem {
                    LayoutElement::Paragraph { lines, .. } => {
                        lines.iter().fold(0.0, |h, line| h + line.height)
                    }
                    LayoutElement::Table { row_heights, .. } => {
                        row_heights.iter().sum::<f32>()
                    }
                    LayoutElement::PageBreak => 0.0,
                }
            });

            let (x, y) = if is_header {
                (engine.margin_left, engine.margin_top)
            } else {
                (engine.margin_left, engine.page_height - engine.margin_bottom - height)
            };

            LayoutHeaderFooter {
                elements,
                x,
                y,
                width: engine.content_width,
                height,
                is_header,
            }
        }

        // Determine which header to use
        let header = if let Some(hf) = &section_props.header_first {
            if page_number == 1 {
                Some(hf)
            } else {
                None
            }
        } else if page_number % 2 == 0 {
            section_props.header_even.as_ref()
        } else {
            section_props.header.as_ref()
        };
        
        // Determine which footer to use
        let footer = if let Some(hf) = &section_props.footer_first {
            if page_number == 1 {
                Some(hf)
            } else {
                None
            }
        } else if page_number % 2 == 0 {
            section_props.footer_even.as_ref()
        } else {
            section_props.footer.as_ref()
        };
        
        // Layout header if present
        if let Some(hf_content) = header {
            if !hf_content.is_empty() {
                results.push(layout_hf_content(self, hf_content, true));
            }
        }
        
        // Layout footer if present
        if let Some(hf_content) = footer {
            if !hf_content.is_empty() {
                results.push(layout_hf_content(self, hf_content, false));
            }
        }
        
        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::RenderConfig;

    fn default_config() -> RenderConfig {
        RenderConfig::default()
    }

    #[test]
    fn test_layout_engine_new() {
        let engine = LayoutEngine::new(&default_config());
        assert!((engine.page_width - 595.28).abs() < 0.01);
        assert!((engine.content_width - 451.28).abs() < 0.01); // 595.28 - 72 - 72
    }

    #[test]
    fn test_layout_single_paragraph() {
        let engine = LayoutEngine::new(&default_config());
        let mut body = DocxBody::new();
        body.push_paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "Hello World".to_string(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        });

        let pages = engine.layout(&body);
        assert_eq!(pages.len(), 1);
        assert!(!pages[0].elements.is_empty());
        if let LayoutElement::Paragraph { lines, .. } = &pages[0].elements[0] {
            assert!(!lines.is_empty());
            assert_eq!(lines[0].text, "Hello World");
        } else {
            panic!("Expected Paragraph element");
        }
    }

    #[test]
    fn test_layout_text_wrapping() {
        let engine = LayoutEngine::new(&default_config());
        let long_text = "AAAAAAAAAA ".repeat(50); // 500 chars with word boundaries for wrapping
        let mut body = DocxBody::new();
        body.push_paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: long_text,
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        });

        let pages = engine.layout(&body);
        assert_eq!(pages.len(), 1);
        if let LayoutElement::Paragraph { lines, .. } = &pages[0].elements[0] {
            assert!(lines.len() > 1, "Long text should wrap to multiple lines");
        }
    }

    #[test]
    fn test_layout_page_breaks() {
        let engine = LayoutEngine::new(&default_config());

        // Create a paragraph with page_break_before
        let props2 = DocxParagraphProperties {
            page_break_before: true,
            ..Default::default()
        };

        let body = DocxBody {
            blocks: vec![
                DocxBlock::Paragraph(DocxParagraph {
                    style_id: None,
                    properties: DocxParagraphProperties::default(),
                    runs: vec![DocxRun {
                        text: "Page 1".to_string(),
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: Some(24),
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    }],
                }),
                DocxBlock::Paragraph(DocxParagraph {
                    style_id: None,
                    properties: props2,
                    runs: vec![DocxRun {
                        text: "Page 2".to_string(),
                        bold: false,
                        italic: false,
                        underline: None,
                        strikethrough: false,
                        double_strikethrough: false,
                        font: None,
                        font_size: Some(24),
                        font_size_cs: None,
                        color: None,
                        highlight: None,
                        vertical_alignment: None,
                        small_caps: false,
                        all_caps: false,
                    }],
                }),
            ],
        };

        let pages = engine.layout(&body);
        assert!(
            pages.len() >= 2,
            "page_break_before should create a new page"
        );
    }

    #[test]
    fn test_layout_table() {
        let engine = LayoutEngine::new(&default_config());
        let body = DocxBody {
            blocks: vec![DocxBlock::Table(DocxTable {
                rows: vec![DocxTableRow {
                    cells: vec![
                        DocxTableCell {
                            paragraphs: vec![DocxParagraph {
                                style_id: None,
                                properties: DocxParagraphProperties::default(),
                                runs: vec![DocxRun {
                                    text: "Cell 1".to_string(),
                                    bold: false,
                                    italic: false,
                                    underline: None,
                                    strikethrough: false,
                                    double_strikethrough: false,
                                    font: None,
                                    font_size: None,
                                    font_size_cs: None,
                                    color: None,
                                    highlight: None,
                                    vertical_alignment: None,
                                    small_caps: false,
                                    all_caps: false,
                                }],
                            }],
                            column_span: 1,
                            row_span: 1,
                            width: None,
                            shading: None,
                        },
                        DocxTableCell {
                            paragraphs: vec![DocxParagraph {
                                style_id: None,
                                properties: DocxParagraphProperties::default(),
                                runs: vec![DocxRun {
                                    text: "Cell 2".to_string(),
                                    bold: false,
                                    italic: false,
                                    underline: None,
                                    strikethrough: false,
                                    double_strikethrough: false,
                                    font: None,
                                    font_size: None,
                                    font_size_cs: None,
                                    color: None,
                                    highlight: None,
                                    vertical_alignment: None,
                                    small_caps: false,
                                    all_caps: false,
                                }],
                            }],
                            column_span: 1,
                            row_span: 1,
                            width: None,
                            shading: None,
                        },
                    ],
                    height: None,
                    is_header: false,
                }],
                properties: DocxTableProperties::default(),
            })],
        };

        let pages = engine.layout(&body);
        assert_eq!(pages.len(), 1);
        if let LayoutElement::Table { cells, .. } = &pages[0].elements[0] {
            assert_eq!(cells.len(), 2);
        } else {
            panic!("Expected Table element");
        }
    }

    #[test]
    fn test_layout_empty_body() {
        let engine = LayoutEngine::new(&default_config());
        let body = DocxBody {
            blocks: vec![],
        };

        let pages = engine.layout(&body);
        // Should produce exactly 1 empty page (placeholder)
        assert_eq!(pages.len(), 1);
        assert!(pages[0].elements.is_empty());
    }
}

#[cfg(test)]
mod header_footer {
    use super::*;
    use wo_ooxml::model::{DocxBlock, HeaderFooter, SectionProperties};
    use crate::model::RenderConfig;

    fn default_config() -> RenderConfig {
        RenderConfig::default()
    }

    #[test]
    fn test_layout_header_footer_default() {
        let engine = LayoutEngine::new(&default_config());
        
        // Create section properties with a default header
        let mut section_props = SectionProperties::default();
        let mut header = HeaderFooter::new();
        header.blocks.push(DocxBlock::Paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "Default Header".to_string(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        }));
        section_props.header = Some(header);
        
        // Layout header/footer for page 1 (should use default header)
        let hf_layouts = engine.layout_header_footer(1, &section_props);
        assert_eq!(hf_layouts.len(), 1); // Only header, no footer
        assert!(hf_layouts[0].is_header);
        assert_eq!(hf_layouts[0].elements.len(), 1);
    }

    #[test]
    fn test_layout_header_footer_first_page() {
        let engine = LayoutEngine::new(&default_config());
        
        // Create section properties with first-page-specific header
        let mut section_props = SectionProperties::default();
        let mut first_header = HeaderFooter::new();
        first_header.blocks.push(DocxBlock::Paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "First Page Header".to_string(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        }));
        section_props.header_first = Some(first_header);
        
        let mut default_header = HeaderFooter::new();
        default_header.blocks.push(DocxBlock::Paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "Default Header".to_string(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        }));
        section_props.header = Some(default_header);
        
        // Page 1 should use first page header
        let hf_layouts = engine.layout_header_footer(1, &section_props);
        assert_eq!(hf_layouts.len(), 1);
        assert!(hf_layouts[0].is_header);
        if let LayoutElement::Paragraph { lines, .. } = &hf_layouts[0].elements[0] {
            assert_eq!(lines[0].text, "First Page Header");
        } else {
            panic!("Expected Paragraph element");
        }
    }

    #[test]
    fn test_layout_header_footer_even_odd() {
        let engine = LayoutEngine::new(&default_config());
        
        // Create section properties with even and odd page headers
        let mut section_props = SectionProperties::default();
        
        let mut odd_header = HeaderFooter::new();
        odd_header.blocks.push(DocxBlock::Paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "Odd Page Header".to_string(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        }));
        section_props.header = Some(odd_header);
        
        let mut even_header = HeaderFooter::new();
        even_header.blocks.push(DocxBlock::Paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "Even Page Header".to_string(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        }));
        section_props.header_even = Some(even_header);
        
        // Page 1 (odd) should use odd header
        let hf_layouts_1 = engine.layout_header_footer(1, &section_props);
        assert_eq!(hf_layouts_1.len(), 1);
        if let LayoutElement::Paragraph { lines, .. } = &hf_layouts_1[0].elements[0] {
            assert_eq!(lines[0].text, "Odd Page Header");
        } else {
            panic!("Expected Paragraph element");
        }
        
        // Page 2 (even) should use even header
        let hf_layouts_2 = engine.layout_header_footer(2, &section_props);
        assert_eq!(hf_layouts_2.len(), 1);
        if let LayoutElement::Paragraph { lines, .. } = &hf_layouts_2[0].elements[0] {
            assert_eq!(lines[0].text, "Even Page Header");
        } else {
            panic!("Expected Paragraph element");
        }
    }

    #[test]
    fn test_layout_header_footer_with_footer() {
        let engine = LayoutEngine::new(&default_config());
        
        // Create section properties with both header and footer
        let mut section_props = SectionProperties::default();
        
        let mut header = HeaderFooter::new();
        header.blocks.push(DocxBlock::Paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "Header Text".to_string(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        }));
        section_props.header = Some(header);
        
        let mut footer = HeaderFooter::new();
        footer.blocks.push(DocxBlock::Paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "Footer Text".to_string(),
                bold: false,
                italic: false,
                underline: None,
                strikethrough: false,
                double_strikethrough: false,
                font: None,
                font_size: Some(24),
                font_size_cs: None,
                color: None,
                highlight: None,
                vertical_alignment: None,
                small_caps: false,
                all_caps: false,
            }],
        }));
        section_props.footer = Some(footer);
        
        // Layout should produce both header and footer
        let hf_layouts = engine.layout_header_footer(1, &section_props);
        assert_eq!(hf_layouts.len(), 2);
        assert!(hf_layouts[0].is_header);
        assert!(!hf_layouts[1].is_header);
        
        // Check header text
        if let LayoutElement::Paragraph { lines, .. } = &hf_layouts[0].elements[0] {
            assert_eq!(lines[0].text, "Header Text");
        } else {
            panic!("Expected Paragraph element in header");
        }
        
        // Check footer text
        if let LayoutElement::Paragraph { lines, .. } = &hf_layouts[1].elements[0] {
            assert_eq!(lines[0].text, "Footer Text");
        } else {
            panic!("Expected Paragraph element in footer");
        }
    }
}
