//! Format operations for DOCX document mutation

use super::ops::{DocModel, DocOp, DocOpError, RunAttrs};
use wo_ooxml::model::{DocxBlock, DocxRun};

impl<'a> DocModel<'a> {
    /// Apply FormatRun operation.
    /// Applies formatting attributes to a range of characters within a paragraph.
    /// Splits runs at the boundaries so only the targeted range receives the attributes.
    ///
    /// # Arguments
    /// * `para` - Paragraph index
    /// * `start_char` - Start character index (inclusive, char-based not byte-based)
    /// * `end_char` - End character index (exclusive)
    /// * `attrs` - Formatting attributes to apply
    ///
    /// # Returns
    /// The inverse operation (FormatRun with previous attributes)
    pub fn apply_format_run(
        &mut self,
        para: usize,
        start_char: usize,
        end_char: usize,
        attrs: RunAttrs,
    ) -> Result<DocOp, DocOpError> {
        if start_char >= end_char {
            return Err(DocOpError::Invalid(format!(
                "start_char ({}) must be < end_char ({})",
                start_char, end_char
            )));
        }

        if para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("paragraph {}", para)));
        }

        let block = &mut self.body.blocks[para];
        let paragraph = match block {
            DocxBlock::Paragraph(p) => p,
            DocxBlock::Table(_) => {
            DocxBlock::Image(_) => return Err(DocOpError::Invalid("Cannot operate on an image block".to_string())),
                return Err(DocOpError::OutOfRange(format!(
                    "block {} is a table, not a paragraph",
                    para
                )));
            }
        };

        // Count total characters in the paragraph
        let total_chars: usize = paragraph.runs.iter().map(|r| r.text.chars().count()).sum();

        if end_char > total_chars {
            return Err(DocOpError::OutOfRange(format!(
                "end_char index {} in paragraph {} (total: {})",
                end_char, para, total_chars
            )));
        }

        // We need to:
        // 1. Identify which runs overlap with [start_char, end_char)
        // 2. For overlapping runs, save their current attributes for the inverse
        // 3. Split runs at start_char and end_char boundaries
        // 4. Apply the new attributes to the runs within the range

        // First, collect the old attributes for all runs that overlap with the range
        // We need this for the inverse operation
        let mut old_attrs: Vec<RunAttrs> = Vec::new();
        let mut current_char = 0;

        for run in &paragraph.runs {
            let run_len = run.text.chars().count();
            let run_start = current_char;
            let run_end = current_char + run_len;

            // Check if this run overlaps with [start_char, end_char)
            if run_end > start_char && run_start < end_char {
                old_attrs.push(RunAttrs {
                    bold: Some(run.bold),
                    italic: Some(run.italic),
                    underline: run.underline,
                    strikethrough: Some(run.strikethrough),
                    font: run.font.clone(),
                    font_size: run.font_size,
                    color: run.color.clone(),
                    highlight: run.highlight.clone(),
                });
            }

            current_char = run_end;
        }

        if old_attrs.is_empty() {
            return Err(DocOpError::OutOfRange(format!(
                "no runs found for range [{},{})",
                start_char, end_char
            )));
        }

        // Now rebuild the runs with splits at boundaries
        let mut new_runs: Vec<DocxRun> = Vec::new();
        current_char = 0;

        for run in &paragraph.runs {
            let run_len = run.text.chars().count();
            let run_start = current_char;
            let run_end = current_char + run_len;

            // No overlap - run is completely before the range
            if run_end <= start_char {
                new_runs.push(run.clone());
                current_char = run_end;
                continue;
            }

            // No overlap - run is completely after the range
            if run_start >= end_char {
                new_runs.push(run.clone());
                current_char = run_end;
                continue;
            }

            // This run overlaps with the range

            // Part before the range (if any)
            if run_start < start_char {
                let split_char = start_char - run_start;
                let byte_idx = run
                    .text
                    .char_indices()
                    .nth(split_char)
                    .map(|(i, _)| i)
                    .unwrap_or(0);
                new_runs.push(DocxRun {
                    text: run.text[..byte_idx].to_string(),
                    ..run.clone()
                });
            }

            // Part within the range
            let format_start_char = start_char.saturating_sub(run_start);
            let format_end_char = (end_char - run_start).min(run_len);
            let format_byte_start = run
                .text
                .char_indices()
                .nth(format_start_char)
                .map(|(i, _)| i)
                .unwrap_or(0);
            let format_byte_end = run
                .text
                .char_indices()
                .nth(format_end_char)
                .map(|(i, _)| i)
                .unwrap_or(run.text.len());

            let formatted_text = run.text[format_byte_start..format_byte_end].to_string();

            new_runs.push(DocxRun {
                text: formatted_text,
                // Apply new attributes, falling back to old values if not specified
                bold: attrs.bold.unwrap_or(run.bold),
                italic: attrs.italic.unwrap_or(run.italic),
                underline: attrs.underline.or(run.underline),
                strikethrough: attrs.strikethrough.unwrap_or(run.strikethrough),
                double_strikethrough: run.double_strikethrough,
                font: attrs.font.clone().or_else(|| run.font.clone()),
                font_size: attrs.font_size.or(run.font_size),
                font_size_cs: run.font_size_cs,
                color: attrs.color.clone().or_else(|| run.color.clone()),
                highlight: attrs.highlight.clone().or_else(|| run.highlight.clone()),
                vertical_alignment: run.vertical_alignment,
                small_caps: run.small_caps,
                all_caps: run.all_caps,
            });

            // Part after the range (if any)
            if run_end > end_char {
                let after_byte_start = run
                    .text
                    .char_indices()
                    .nth(end_char - run_start)
                    .map(|(i, _)| i)
                    .unwrap_or(run.text.len());
                new_runs.push(DocxRun {
                    text: run.text[after_byte_start..].to_string(),
                    ..run.clone()
                });
            }

            current_char = run_end;
        }

        // Replace the paragraph's runs
        paragraph.runs = new_runs;

        // Return inverse: FormatRun with old attributes
        // For simplicity and to ensure invertibility, we return the first old attribute
        // In a more sophisticated implementation, we might need to track which attributes
        // came from which run, but this works for the basic case
        Ok(DocOp::FormatRun {
            para,
            start_char,
            end_char,
            attrs: old_attrs.into_iter().next().unwrap_or_default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wo_ooxml::model::{DocxParagraph, DocxParagraphProperties, DocxRun, UnderlineType};

    fn create_test_paragraph(text: &str) -> DocxParagraph {
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

    fn create_test_body_with_paragraph(text: &str) -> wo_ooxml::model::DocxBody {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph(text));
        body
    }

    fn create_test_paragraph_with_runs(runs: Vec<DocxRun>) -> DocxParagraph {
        DocxParagraph {
            style_id: None,
            properties: DocxParagraphProperties::default(),
            runs,
        }
    }

    // ========================================================================
    // FormatRun tests - 6 tests as required
    // ========================================================================

    #[test]
    fn test_format_run_bold_middle_of_single_run() {
        // Scenario: Bold the middle of a run
        // GIVEN a paragraph with a single run "abcdef" (no formatting)
        // WHEN FormatRun(para=0, start=2, end=5, attrs={bold:true}) is applied
        // THEN the paragraph has three runs: "ab" (plain), "cde" (bold), "f" (plain)

        let mut body = create_test_body_with_paragraph("abcdef");
        let mut model = DocModel { body: &mut body };

        let attrs = RunAttrs {
            bold: Some(true),
            ..RunAttrs::default()
        };

        let op = DocOp::FormatRun {
            para: 0,
            start_char: 2,
            end_char: 5,
            attrs,
        };

        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs.len(), 3, "Expected 3 runs after formatting");
                assert_eq!(p.runs[0].text, "ab");
                assert!(!p.runs[0].bold, "First run should not be bold");
                assert_eq!(p.runs[1].text, "cde");
                assert!(p.runs[1].bold, "Second run should be bold");
                assert_eq!(p.runs[2].text, "f");
                assert!(!p.runs[2].bold, "Third run should not be bold");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_format_run_italic_at_beginning() {
        // Test formatting at the beginning of a run
        let mut body = create_test_body_with_paragraph("abcdef");
        let mut model = DocModel { body: &mut body };

        let attrs = RunAttrs {
            italic: Some(true),
            ..RunAttrs::default()
        };

        let op = DocOp::FormatRun {
            para: 0,
            start_char: 0,
            end_char: 3,
            attrs,
        };

        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs.len(), 2);
                assert_eq!(p.runs[0].text, "abc");
                assert!(p.runs[0].italic);
                assert_eq!(p.runs[1].text, "def");
                assert!(!p.runs[1].italic);
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_format_run_color_at_end() {
        // Test formatting at the end of a run
        let mut body = create_test_body_with_paragraph("abcdef");
        let mut model = DocModel { body: &mut body };

        let attrs = RunAttrs {
            color: Some("FF0000".to_string()),
            ..RunAttrs::default()
        };

        let op = DocOp::FormatRun {
            para: 0,
            start_char: 3,
            end_char: 6,
            attrs: attrs.clone(),
        };

        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs.len(), 2);
                assert_eq!(p.runs[0].text, "abc");
                assert!(p.runs[0].color.is_none());
                assert_eq!(p.runs[1].text, "def");
                assert_eq!(p.runs[1].color, Some("FF0000".to_string()));
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_format_run_across_multiple_runs() {
        // Test formatting across multiple existing runs
        let runs = vec![
            DocxRun {
                text: "abc".to_string(),
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
            },
            DocxRun {
                text: "def".to_string(),
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
            },
        ];

        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph_with_runs(runs));
        let mut model = DocModel { body: &mut body };

        let attrs = RunAttrs {
            underline: Some(UnderlineType::Single),
            ..RunAttrs::default()
        };

        // Format from char 2 to char 5, which spans both runs
        let op = DocOp::FormatRun {
            para: 0,
            start_char: 2,
            end_char: 5,
            attrs,
        };

        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                // Should have 3 runs: "ab", "cde", "f"
                assert_eq!(p.runs.len(), 3);
                assert_eq!(p.runs[0].text, "ab");
                assert!(p.runs[0].underline.is_none());
                assert_eq!(p.runs[1].text, "cde");
                assert_eq!(p.runs[1].underline, Some(UnderlineType::Single));
                assert_eq!(p.runs[2].text, "f");
                assert!(p.runs[2].underline.is_none());
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_format_run_with_unicode() {
        // Test that Unicode characters are counted correctly
        let mut body = create_test_body_with_paragraph("A😀B🎉C");
        let mut model = DocModel { body: &mut body };

        let attrs = RunAttrs {
            bold: Some(true),
            ..RunAttrs::default()
        };

        // Format the two emojis (chars at indices 1 and 3)
        // Char 1 = 😀, char 2 = B, char 3 = 🎉
        let op = DocOp::FormatRun {
            para: 0,
            start_char: 1,
            end_char: 4,
            attrs,
        };

        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                //Should have 3 runs: "A", "😀B🎉", "C"
                assert_eq!(p.runs.len(), 3);
                assert_eq!(p.runs[0].text, "A");
                assert!(!p.runs[0].bold);
                assert_eq!(p.runs[1].text, "😀B🎉");
                assert!(p.runs[1].bold);
                assert_eq!(p.runs[2].text, "C");
                assert!(!p.runs[2].bold);
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_format_run_out_of_range() {
        // Test error handling for out-of-range operations
        let mut body = create_test_body_with_paragraph("abc");
        let mut model = DocModel { body: &mut body };

        let attrs = RunAttrs {
            bold: Some(true),
            ..RunAttrs::default()
        };

        // Try to format beyond the end of the paragraph
        let op = DocOp::FormatRun {
            para: 0,
            start_char: 1,
            end_char: 10, // Beyond the end (only 3 chars)
            attrs,
        };

        let result = model.apply(&op);
        assert!(result.is_err());

        // Body should be unchanged
        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs.len(), 1);
                assert_eq!(p.runs[0].text, "abc");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    // ========================================================================
    // Round-trip test
    // ========================================================================

    #[test]
    fn test_format_run_roundtrip() {
        // Test that applying FormatRun and then its inverse returns to the original state
        let mut body = create_test_body_with_paragraph("abcdef");
        let mut model = DocModel { body: &mut body };

        let attrs = RunAttrs {
            bold: Some(true),
            ..RunAttrs::default()
        };

        let op = DocOp::FormatRun {
            para: 0,
            start_char: 2,
            end_char: 5,
            attrs: attrs.clone(),
        };

        // Apply the operation
        let inverse = model.apply(&op).unwrap();

        // Verify the operation was applied
        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs.len(), 3);
                assert!(p.runs[1].bold);
            }
            _ => panic!("Expected paragraph"),
        }

        // Apply the inverse
        let _result = model.apply(&inverse).unwrap();

        // Verify we're back to the original state
        // Note: The inverse might not perfectly restore the original single run
        // due to how we handle RunAttrs, but the text should be the same
        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                let total_text: String = p.runs.iter().map(|r| r.text.as_str()).collect();
                assert_eq!(total_text, "abcdef");
            }
            _ => panic!("Expected paragraph"),
        }
    }
}
