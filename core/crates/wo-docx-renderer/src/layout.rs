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

/// Default tab stop interval in points (0.5 inch = 36 pt).
const DEFAULT_TAB_INTERVAL_PT: f32 = 36.0;

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
    /// Default tab stops for the document (used when a paragraph has no explicit tab stops).
    tab_stops: Vec<TabStop>,
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
            tab_stops: Vec::new(),
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
                DocxBlock::Image(_) => {
                    // Images are not yet supported in layout
                    // This is a placeholder for future image layout support
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
                    let num_rows = table.rows.len();
                    if num_rows == 0 {
                        continue;
                    }

                    // Determine column count from the first row
                    let num_cols = table.rows.first().map(|r| r.cells.len()).unwrap_or(0);
                    if num_cols == 0 {
                        continue;
                    }
                    let col_width = self.content_width / num_cols as f32;
                    let max_y = self.page_height - self.margin_bottom;

                    // Identify header row indices (rows with is_header == true)
                    let header_indices: Vec<usize> = table
                        .rows
                        .iter()
                        .enumerate()
                        .filter(|(_, r)| r.is_header)
                        .map(|(i, _)| i)
                        .collect();

                    let mut data_row_idx: usize = 0; // next non-header row to place
                    let mut is_first_table_page = true;

                    loop {
                        if data_row_idx >= num_rows {
                            break;
                        }

                        let layout = self.layout_table_chunk(
                            table,
                            cursor_y,
                            max_y,
                            data_row_idx,
                            &header_indices,
                            !is_first_table_page,
                            col_width,
                        );

                        current_page.elements.push(LayoutElement::Table {
                            cells: layout.cells,
                            row_heights: layout.row_heights.clone(),
                            x: layout.x,
                            y: layout.y,
                            width: layout.width,
                        });
                        cursor_y += layout.height;
                        data_row_idx += layout.placed_rows;

                        if data_row_idx < num_rows {
                            // Need a new page
                            pages.push(current_page);
                            current_page = LayoutPage {
                                elements: Vec::new(),
                                width: self.page_width,
                                height: self.page_height,
                            };
                            cursor_y = self.margin_top;
                            is_first_table_page = false;
                        }
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
    /// Set default tab stops for the engine.
    /// Used when a paragraph does not specify its own tab stops.
    pub fn set_tab_stops(&mut self, tabs: &[TabStop]) {
        self.tab_stops = tabs.to_vec();
    }

    /// Get the effective tab stops for a paragraph: paragraph-level if set,
    /// otherwise engine defaults, otherwise built-in defaults (every 0.5 inch).
    fn effective_tab_stops(&self, para: &DocxParagraph) -> Vec<TabStop> {
        if !para.properties.tab_stops.is_empty() {
            para.properties.tab_stops.clone()
        } else if !self.tab_stops.is_empty() {
            self.tab_stops.clone()
        } else {
            // Build default tab stops every 0.5 inch across the page width
            let mut defaults = Vec::new();
            let interval_twips = (DEFAULT_TAB_INTERVAL_PT * 20.0) as i32;
            let mut pos = interval_twips;
            let max_pos = (self.content_width * 20.0) as i32;
            while pos < max_pos {
                defaults.push(TabStop {
                    pos,
                    kind: TabStopKind::Left,
                    leader: None,
                });
                pos += interval_twips;
            }
            defaults
        }
    }

    /// Find the next tab stop position after `current_x_pt` (in points) from the given tab stops.
    /// Returns None if no further tab stop is found.
    fn next_tab_stop_x<'a>(&self, current_x_pt: f32, tabs: &'a [TabStop]) -> Option<(f32, &'a TabStop)> {
        let twips_per_pt = 20.0;
        let current_twips = (current_x_pt * twips_per_pt) as i32;
        tabs.iter()
            .filter(|t| t.pos > current_twips)
            .min_by_key(|t| t.pos)
            .map(|t| (t.pos as f32 / twips_per_pt, t))
    }

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
                } else if ch == '\t' {
                    // Tab character: flush current word if any, then advance to next tab stop.
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
                    } else if current_line_width == 0.0 && !line_runs.is_empty() {
                        // If we're at the start of accumulated text but not the line start,
                        // flush accumulated runs first so the tab takes effect after them.
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
                    }

                    // Advance to the next tab stop position
                    // Tab stops are relative to the paragraph's left edge (x_start).
                    // current_line_width is already relative to x_start.
                    let tabs = self.effective_tab_stops(para);
                    if let Some((tab_x, tab_stop)) = self.next_tab_stop_x(
                        current_line_width,
                        &tabs,
                    ) {
                        // Compute the distance from current position to the tab stop
                        let tab_width = tab_x - current_line_width;
                        current_line_width += tab_width;
                        // Tab stop kind stored for future rendering (left/center/right/decimal/bar)
                        let _ = tab_stop;
                    } else {
                        // No more tab stops: move to the end of the content area
                        let target_x = available_width;
                        let tab_width = target_x - current_line_width;
                        if tab_width > 0.0 {
                            current_line_width += tab_width;
                        }
                    }

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

    /// Layout a chunk of a table starting from a given row index, optionally
    /// prepending header rows. Places rows until max_y is exceeded.
    #[allow(clippy::too_many_arguments)]
    fn layout_table_chunk(
        &self,
        table: &DocxTable,
        cursor_y: f32,
        max_y: f32,
        start_row: usize,
        header_indices: &[usize],
        repeat_headers: bool,
        col_width: f32,
    ) -> LayoutTable {
        let num_rows = table.rows.len();
        if num_rows == 0 || start_row >= num_rows {
            return LayoutTable {
                cells: Vec::new(),
                row_heights: Vec::new(),
                x: self.margin_left,
                y: cursor_y,
                width: 0.0,
                height: 0.0,
                placed_rows: 0,
                has_repeated_headers: false,
            };
        }

        // Determine which rows to place: first repeated headers, then data rows
        let mut place_rows: Vec<usize> = Vec::new();

        // Prepend header rows if repeating
        if repeat_headers && !header_indices.is_empty() {
            place_rows.extend_from_slice(header_indices);
        }

        // Add data rows starting from start_row
        let mut placed_data = 0usize;
        let mut y = cursor_y;

        // First pass: compute heights for all candidate rows to determine fit
        // We compute row heights for header rows and for data rows up to what fits
        let mut chunk_row_heights: Vec<f32> = Vec::new();
        let mut chunk_source_indices: Vec<usize> = Vec::new();

        // Add header rows (if repeating) with their computed heights
        if repeat_headers {
            for &hdr_idx in header_indices {
                if hdr_idx < num_rows {
                    let rh = self.compute_row_height(&table.rows[hdr_idx], col_width);
                    if y + rh > max_y && !chunk_row_heights.is_empty() {
                        // Header rows don't fit on this page — that's OK for now,
                        // we just try to place them even if it pushes over;
                        // this is better than having no headers at all.
                    }
                    chunk_row_heights.push(rh);
                    chunk_source_indices.push(hdr_idx);
                    y += rh;
                }
            }
        }

        // Add data rows from start_row
        for i in start_row..num_rows {
            // Skip rows that are headers (they're handled above if repeating)
            if header_indices.contains(&i) && repeat_headers {
                // Header rows were already placed above; skip them as data rows
                placed_data += 1;
                continue;
            }

            let rh = self.compute_row_height(&table.rows[i], col_width);

            if y + rh > max_y && !chunk_row_heights.is_empty() {
                // Row doesn't fit — stop here
                break;
            }

            chunk_row_heights.push(rh);
            chunk_source_indices.push(i);
            y += rh;
            placed_data += 1;
        }

        // If nothing placed at all (e.g., only row doesn't fit), force-place it
        if chunk_row_heights.is_empty() && start_row < num_rows {
            let i = start_row;
            if !(header_indices.contains(&i) && repeat_headers) {
                let rh = self.compute_row_height(&table.rows[i], col_width);
                chunk_row_heights.push(rh);
                chunk_source_indices.push(i);
                placed_data += 1;
            }
        }

        // Build cells for placed rows
        let mut cells = Vec::new();
        let mut y_pos = cursor_y;
        for (chunk_idx, &row_idx) in chunk_source_indices.iter().enumerate() {
            let row = &table.rows[row_idx];
            let mut x = self.margin_left;
            let row_h = chunk_row_heights[chunk_idx];
            for cell in row.cells.iter() {
                let cell_w = cell.width.map(|w| w as f32 / 20.0).unwrap_or(col_width);
                cells.push(LayoutCell {
                    paragraphs: cell.paragraphs.clone(),
                    column_span: cell.column_span,
                    row_span: cell.row_span,
                    x,
                    y: y_pos,
                    width: cell_w,
                    height: row_h,
                });
                x += cell_w;
            }
            y_pos += row_h;
        }

        let total_height = if chunk_row_heights.is_empty() {
            0.0
        } else {
            y_pos - cursor_y
        };

        LayoutTable {
            cells,
            row_heights: chunk_row_heights,
            x: self.margin_left,
            y: cursor_y,
            width: self.content_width,
            height: total_height,
            placed_rows: placed_data,
            has_repeated_headers: repeat_headers,
        }
    }

    /// Compute the height of a single table row based on content.
    fn compute_row_height(&self, row: &DocxTableRow, col_width: f32) -> f32 {
        let default_row_height = 20.0;

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

        h.max(max_para_height + 8.0) // 8pt cell padding
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
    /// Number of rows from the original table placed in this layout.
    pub placed_rows: usize,
    /// Whether header rows have been prepended (for pages after the first).
    pub has_repeated_headers: bool,
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

/// A DOCX footnote definition (local to layout module).
/// In real DOCX files, footnotes are stored in word/footnotes.xml.
#[derive(Debug, Clone)]
pub struct DocxFootnote {
    /// Unique footnote ID (from the document).
    pub id: u32,
    /// The content paragraphs of this footnote.
    pub content: Vec<DocxParagraph>,
    /// Custom number override (None means use auto-numbering).
    pub number: Option<usize>,
    /// Numbering format (decimal, lowercaseRoman, etc.).
    pub number_format: FootnoteNumberFormat,
}

/// A DOCX endnote definition (local to layout module).
#[derive(Debug, Clone)]
pub struct DocxEndnote {
    /// Unique endnote ID (from the document).
    pub id: u32,
    /// The content paragraphs of this endnote.
    pub content: Vec<DocxParagraph>,
    /// Custom number override (None means use auto-numbering).
    pub number: Option<usize>,
    /// Numbering format.
    pub number_format: FootnoteNumberFormat,
}

/// Numbering format for footnotes and endnotes.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum FootnoteNumberFormat {
    /// Decimal numbers: 1, 2, 3, ...
    #[default]
    Decimal,
    /// Lowercase Roman numerals: i, ii, iii, ...
    LowercaseRoman,
    /// Uppercase Roman numerals: I, II, III, ...
    UppercaseRoman,
    /// Lowercase letters: a, b, c, ...
    LowercaseLetter,
    /// Uppercase letters: A, B, C, ...
    UppercaseLetter,
    /// Custom symbol (stored as string).
    Custom(String),
}

/// Convert a footnote number to its formatted string representation.
fn format_footnote_number(num: usize, format: FootnoteNumberFormat) -> String {
    match format {
        FootnoteNumberFormat::Decimal => num.to_string(),
        FootnoteNumberFormat::LowercaseRoman => {
            let roman_digits = [
                (1000, "m"), (900, "cm"), (500, "d"), (400, "cd"),
                (100, "c"), (90, "xc"), (50, "l"), (40, "xl"),
                (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
            ];
            let mut n = num;
            let mut result = String::new();
            for &(value, symbol) in &roman_digits {
                while n >= value {
                    result.push_str(symbol);
                    n -= value;
                }
            }
            result
        }
        FootnoteNumberFormat::UppercaseRoman => {
            format_footnote_number(num, FootnoteNumberFormat::LowercaseRoman).to_uppercase()
        }
        FootnoteNumberFormat::LowercaseLetter => {
            let mut n = num;
            let mut result = String::new();
            loop {
                n -= 1;
                let remainder = n % 26;
                result.insert(0, (b'a' + remainder as u8) as char);
                n /= 26;
                if n == 0 {
                    break;
                }
            }
            result
        }
        FootnoteNumberFormat::UppercaseLetter => {
            format_footnote_number(num, FootnoteNumberFormat::LowercaseLetter).to_uppercase()
        }
        FootnoteNumberFormat::Custom(symbol) => symbol.clone(),
    }
}

/// Footnote renumbering state.
/// Tracks the current footnote number for automatic renumbering.
#[derive(Debug, Clone)]
pub struct FootnoteRenumberState {
    pub current_number: usize,
    pub format: FootnoteNumberFormat,
    pub start_number: usize,
}

impl Default for FootnoteRenumberState {
    fn default() -> Self {
        Self {
            current_number: 1,
            format: FootnoteNumberFormat::Decimal,
            start_number: 1,
        }
    }
}

impl FootnoteRenumberState {
    /// Create a new renumbering state with specified start number and format.
    pub fn new(start_number: usize, format: FootnoteNumberFormat) -> Self {
        Self {
            current_number: start_number,
            format,
            start_number,
        }
    }

    /// Get the next footnote number and advance the counter.
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> usize {
        let num = self.current_number;
        self.current_number += 1;
        num
    }

    /// Format the current footnote number.
    pub fn format_current(&self) -> String {
        format_footnote_number(self.current_number, self.format.clone())
    }

    /// Reset to the start number.
    pub fn reset(&mut self) {
        self.current_number = self.start_number;
    }
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

/// Layout engine implementation for footnotes and endnotes
impl LayoutEngine {
    /// Renumber footnotes sequentially.
    /// This is used when footnotes are added, removed, or reordered.
    /// The renumbering follows the specified format and starting number.
    /// 
    /// # Arguments
    /// * `footnotes` - The footnotes to renumber
    /// * `start_number` - The starting number (default: 1)
    /// * `format` - The numbering format
    /// 
    /// # Returns
    /// A vector of footnotes with updated numbers
    pub fn renumber_footnotes(
        &self,
        footnotes: &[DocxFootnote],
        start_number: usize,
        format: FootnoteNumberFormat,
    ) -> Vec<DocxFootnote> {
        footnotes
            .iter()
            .enumerate()
            .map(|(idx, fn_)| {
                let mut new_fn = fn_.clone();
                new_fn.number = Some(idx + start_number);
                new_fn.number_format = format.clone();
                new_fn
            })
            .collect()
    }

    /// Renumber endnotes sequentially.
    /// 
    /// # Arguments
    /// * `endnotes` - The endnotes to renumber
    /// * `start_number` - The starting number (default: 1)
    /// * `format` - The numbering format
    /// 
    /// # Returns
    /// A vector of endnotes with updated numbers
    pub fn renumber_endnotes(
        &self,
        endnotes: &[DocxEndnote],
        start_number: usize,
        format: FootnoteNumberFormat,
    ) -> Vec<DocxEndnote> {
        endnotes
            .iter()
            .enumerate()
            .map(|(idx, en)| {
                let mut new_en = en.clone();
                new_en.number = Some(idx + start_number);
                new_en.number_format = format.clone();
                new_en
            })
            .collect()
    }
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
                tab_stops: Vec::new(),
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

    // --- Tab stop tests ---

    #[test]
    fn tab_stop_set_tab_stops_stores_tabs() {
        let mut engine = LayoutEngine::new(&default_config());
        let tabs = vec![
            TabStop { pos: 1440, kind: TabStopKind::Left, leader: None },
            TabStop { pos: 2880, kind: TabStopKind::Center, leader: None },
            TabStop { pos: 4320, kind: TabStopKind::Right, leader: None },
        ];
        engine.set_tab_stops(&tabs);
        assert_eq!(engine.tab_stops.len(), 3);
        assert_eq!(engine.tab_stops[0].pos, 1440);
        assert_eq!(engine.tab_stops[1].kind, TabStopKind::Center);
        assert_eq!(engine.tab_stops[2].kind, TabStopKind::Right);
    }

    #[test]
    fn tab_stop_advances_position() {
        let mut engine = LayoutEngine::new(&default_config());
        // Set a tab stop at 2 inches (2880 twips = 144 pt)
        let tabs = vec![
            TabStop { pos: 2880, kind: TabStopKind::Left, leader: None },
        ];
        engine.set_tab_stops(&tabs);

        // Text: "A\tB" — tab should advance past "A" to the tab stop at 144pt
        let mut body = DocxBody::new();
        body.push_paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "A\tB".to_string(),
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
            assert_eq!(lines.len(), 1);
            // Tab should not appear in the output text
            assert_eq!(lines[0].text, "AB");
            // The line width should be greater than just "AB" width because tab adds space
            let ab_width = engine.measure_text_width("AB", 12.0);
            assert!(
                lines[0].width > ab_width,
                "Line width {} should exceed {} when tab advances position",
                lines[0].width,
                ab_width
            );
        } else {
            panic!("Expected Paragraph element");
        }
    }

    #[test]
    fn tab_stop_uses_paragraph_tabs() {
        let engine = LayoutEngine::new(&default_config());
        // Paragraph with its OWN tab stops (should override engine defaults)
        let mut props = DocxParagraphProperties::default();
        props.tab_stops.push(TabStop {
            pos: 1440, // 1 inch = 72 pt
            kind: TabStopKind::Left,
            leader: None,
        });

        let mut body = DocxBody::new();
        body.push_paragraph(DocxParagraph {
            style_id: None,
            properties: props,
            runs: vec![DocxRun {
                text: "X\tY".to_string(),
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
            assert_eq!(lines.len(), 1);
            // Tab should not appear in text
            assert_eq!(lines[0].text, "XY");
            // Width should include the tab advance (to 72pt from ~9pt for "X")
            let _x_width = engine.measure_text_width("X", 12.0);
            assert!(
                lines[0].width > 72.0,
                "Line width {} should exceed 72pt (1-inch tab stop)",
                lines[0].width
            );
        } else {
            panic!("Expected Paragraph element");
        }
    }

    #[test]
    fn tab_stop_tab_at_start_of_line() {
        let mut engine = LayoutEngine::new(&default_config());
        // Set tab stop at 1 inch (1440 twips)
        let tabs = vec![
            TabStop { pos: 1440, kind: TabStopKind::Left, leader: None },
        ];
        engine.set_tab_stops(&tabs);

        // Text starting with tab: "\tHello"
        let mut body = DocxBody::new();
        body.push_paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "\tHello".to_string(),
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
            assert_eq!(lines.len(), 1);
            assert_eq!(lines[0].text, "Hello");
            // Width should exceed just "Hello"
            let hello_width = engine.measure_text_width("Hello", 12.0);
            assert!(
                lines[0].width > hello_width,
                "Line width {} should exceed {} when tab at start",
                lines[0].width,
                hello_width
            );
        } else {
            panic!("Expected Paragraph element");
        }
    }

    #[test]
    fn tab_stop_multiple_tabs() {
        let mut engine = LayoutEngine::new(&default_config());
        // Set tab stops at 1 inch, 2 inch, 3 inch
        let tabs = vec![
            TabStop { pos: 1440, kind: TabStopKind::Left, leader: None },
            TabStop { pos: 2880, kind: TabStopKind::Left, leader: None },
            TabStop { pos: 4320, kind: TabStopKind::Left, leader: None },
        ];
        engine.set_tab_stops(&tabs);

        // Text: "A\tB\tC" — two tabs advancing to 1in then 2in
        let mut body = DocxBody::new();
        body.push_paragraph(DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: "A\tB\tC".to_string(),
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
            assert_eq!(lines.len(), 1);
            assert_eq!(lines[0].text, "ABC");
            // Width should cover the last tab stop position (144pt = 2in) plus "C"
            assert!(
                lines[0].width >= 150.0,
                "Line width {} should be >= 150pt for 2-inch tab stops",
                lines[0].width
            );
        } else {
            panic!("Expected Paragraph element");
        }
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

// ============================================================================
// Footnote and Endnote Test Module
// ============================================================================

#[cfg(test)]
mod footnote {
    use super::*;

    /// Helper to create a DocxParagraph with text
    fn para(text: &str) -> DocxParagraph {
        DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs: vec![DocxRun {
                text: text.to_string(),
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
        }
    }

    #[test]
    fn test_footnote_renumber_sequential() {
        let engine = LayoutEngine::new(&RenderConfig::default());
        
        // Create 3 footnotes without numbers (auto-numbering)
        let footnotes = vec![
            DocxFootnote {
                id: 1,
                content: vec![para("First footnote")],
                number: None,
                number_format: FootnoteNumberFormat::Decimal,
            },
            DocxFootnote {
                id: 2,
                content: vec![para("Second footnote")],
                number: None,
                number_format: FootnoteNumberFormat::Decimal,
            },
            DocxFootnote {
                id: 3,
                content: vec![para("Third footnote")],
                number: None,
                number_format: FootnoteNumberFormat::Decimal,
            },
        ];

        // Renumber them starting from 1 with decimal format
        let numbered = engine.renumber_footnotes(&footnotes, 1, FootnoteNumberFormat::Decimal);
        
        assert_eq!(numbered.len(), 3);
        assert_eq!(numbered[0].number, Some(1));
        assert_eq!(numbered[1].number, Some(2));
        assert_eq!(numbered[2].number, Some(3));
    }

    #[test]
    fn test_footnote_renumber_with_roman_numerals() {
        let engine = LayoutEngine::new(&RenderConfig::default());
        
        let footnotes = vec![
            DocxFootnote {
                id: 1,
                content: vec![para("First")],
                number: None,
                number_format: FootnoteNumberFormat::Decimal,
            },
            DocxFootnote {
                id: 2,
                content: vec![para("Second")],
                number: None,
                number_format: FootnoteNumberFormat::Decimal,
            },
            DocxFootnote {
                id: 3,
                content: vec![para("Third")],
                number: None,
                number_format: FootnoteNumberFormat::Decimal,
            },
        ];

        // Renumber with lowercase Roman numerals starting from 1
        let numbered = engine.renumber_footnotes(&footnotes, 1, FootnoteNumberFormat::LowercaseRoman);
        
        assert_eq!(numbered.len(), 3);
        assert_eq!(numbered[0].number, Some(1));
        assert_eq!(numbered[1].number, Some(2));
        assert_eq!(numbered[2].number, Some(3));
        assert_eq!(format_footnote_number(1, FootnoteNumberFormat::LowercaseRoman), "i");
        assert_eq!(format_footnote_number(2, FootnoteNumberFormat::LowercaseRoman), "ii");
        assert_eq!(format_footnote_number(3, FootnoteNumberFormat::LowercaseRoman), "iii");
    }
}
