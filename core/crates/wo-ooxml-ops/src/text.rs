//! Text operations for DOCX document mutation

use super::ops::{DocOp, DocOpError, DocModel};
use wo_ooxml::model::{DocxBlock, DocxParagraph, DocxRun};

impl<'a> DocModel<'a> {
    /// Apply InsertText operation.
    /// Inserts text at the specified character position within a paragraph.
    /// Unicode-safe: char indices count Unicode scalar values.
    pub fn apply_insert_text(&mut self, para: usize, char: usize, text: String) -> Result<DocOp, DocOpError> {
        // Validate paragraph index
        if para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("paragraph {}", para)));
        }

        let block = &mut self.body.blocks[para];
        let paragraph = match block {
            DocxBlock::Paragraph(p) => p,
            DocxBlock::Table(_) => return Err(DocOpError::OutOfRange(format!("block {} is a table, not a paragraph", para))),
        };

        // Count total characters in the paragraph
        let total_chars: usize = paragraph.runs.iter().map(|r| r.text.chars().count()).sum();
        
        // Allow insertion at the end (char == total_chars)
        if char > total_chars {
            return Err(DocOpError::OutOfRange(format!("char index {} in paragraph {} (total: {})", char, para, total_chars)));
        }

        // Find which run the char index falls into
        // We want the first run where char < char_offset + run_len  (for existing chars)
        // or char == char_offset + run_len (for insertion at end of this run)
        let mut char_offset = 0;
        let run_idx = paragraph.runs.iter()
            .position(|r| {
                let run_len = r.text.chars().count();
                let run_end = char_offset + run_len;
                if char <= run_end {
                    true
                } else {
                    char_offset = run_end;
                    false
                }
            })
            .ok_or_else(|| DocOpError::OutOfRange(format!("char index {} in paragraph {}", char, para)))?;

        // Calculate the offset within the run
        // We need to find the actual char_offset for the matched run
        let actual_char_offset: usize = paragraph.runs[..run_idx].iter()
            .map(|r| r.text.chars().count())
            .sum();
        
        let run_char_offset = char - actual_char_offset;

        // Get the run we're inserting into
        let run = &mut paragraph.runs[run_idx];
        let run_text_len = run.text.chars().count();
        
        if run_char_offset > run_text_len {
            return Err(DocOpError::OutOfRange(format!("char index {} in run {} of paragraph {}", run_char_offset, run_idx, para)));
        }

        // Count byte index for insertion
        let byte_idx = run.text.char_indices()
            .nth(run_char_offset)
            .map(|(i, _)| i)
            .unwrap_or(run.text.len());

        // Insert the text
        run.text.insert_str(byte_idx, &text);

        // Return inverse: DeleteText over the inserted range
        Ok(DocOp::DeleteText {
            para,
            start_char: char,
            end_char: char + text.chars().count(),
        })
    }

    /// Apply DeleteText operation.
    /// Deletes text from start_char to end_char (half-open range).
    /// Unicode-safe: char indices count Unicode scalar values.
    pub fn apply_delete_text(&mut self, para: usize, start_char: usize, end_char: usize) -> Result<DocOp, DocOpError> {
        if start_char >= end_char {
            return Err(DocOpError::Invalid(format!("start_char ({}) must be < end_char ({})", start_char, end_char)));
        }

        // Validate paragraph index
        if para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("paragraph {}", para)));
        }

        let block = &mut self.body.blocks[para];
        let paragraph = match block {
            DocxBlock::Paragraph(p) => p,
            DocxBlock::Table(_) => return Err(DocOpError::OutOfRange(format!("block {} is a table, not a paragraph", para))),
        };

        // Count total characters in the paragraph
        let total_chars: usize = paragraph.runs.iter().map(|r| r.text.chars().count()).sum();
        
        if end_char > total_chars {
            return Err(DocOpError::OutOfRange(format!("end_char index {} in paragraph {} (total: {})", end_char, para, total_chars)));
        }

        // Collect the deleted text for the inverse operation
        let mut deleted_text = String::new();
        let mut current_char = 0;
        let mut ranges_to_delete: Vec<(usize, usize, usize)> = Vec::new(); // (run_idx, byte_start, byte_end)

        for (i, run) in paragraph.runs.iter().enumerate() {
            let run_len = run.text.chars().count();
            let run_start = current_char;
            let run_end = current_char + run_len;

            if run_end <= start_char {
                // This run is completely before the deletion range
                current_char = run_end;
                continue;
            }

            if run_start >= end_char {
                // This run is completely after the deletion range
                break;
            }

            // This run overlaps with the deletion range
            let del_start_char = start_char.saturating_sub(run_start);
            let del_end_char = (end_char - run_start).min(run_len);

            if del_start_char < del_end_char {
                // Need to delete from this run
                let byte_start = run.text.char_indices()
                    .nth(del_start_char)
                    .map(|(i, _)| i)
                    .unwrap_or(0);
                let byte_end = run.text.char_indices()
                    .nth(del_end_char)
                    .map(|(i, _)| i)
                    .unwrap_or(run.text.len());

                // Collect the text being deleted
                deleted_text.push_str(&run.text[byte_start..byte_end]);

                ranges_to_delete.push((i, byte_start, byte_end));
            }

            current_char = run_end;
        }

        if ranges_to_delete.is_empty() {
            return Err(DocOpError::OutOfRange(format!("deletion range [{},{}) is empty or invalid", start_char, end_char)));
        }

        // Apply deletions in reverse order to maintain indices
        for (run_idx, byte_start, byte_end) in ranges_to_delete.into_iter().rev() {
            let run = &mut paragraph.runs[run_idx];
            run.text.replace_range(byte_start..byte_end, "");
        }

        // Return inverse: InsertText with the deleted text
        Ok(DocOp::InsertText {
            para,
            char: start_char,
            text: deleted_text,
        })
    }

    /// Apply SplitParagraph operation.
    /// Splits a paragraph at the specified character position.
    /// The text after char becomes a new paragraph.
    pub fn apply_split_paragraph(&mut self, para: usize, char: usize) -> Result<DocOp, DocOpError> {
        // Validate paragraph index
        if para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("paragraph {}", para)));
        }

        let block = &mut self.body.blocks[para];
        let paragraph = match block {
            DocxBlock::Paragraph(p) => p,
            DocxBlock::Table(_) => return Err(DocOpError::OutOfRange(format!("block {} is a table, not a paragraph", para))),
        };

        // Count total characters in the paragraph
        let total_chars: usize = paragraph.runs.iter().map(|r| r.text.chars().count()).sum();
        
        if char >= total_chars && char > 0 {
            // Splitting at the end: just return identity merge
            return Err(DocOpError::Invalid("Cannot split at end of paragraph".to_string()));
        }
        
        if char == total_chars {
            // Edge case: split at end, create empty paragraph after
            // This is allowed but creates an empty paragraph
        }

        // Find which run contains the split point
        let mut char_offset = 0;
        let run_idx = paragraph.runs.iter()
            .position(|r| {
                let run_len = r.text.chars().count();
                if char_offset + run_len > char {
                    true
                } else {
                    char_offset += run_len;
                    false
                }
            })
            .ok_or_else(|| DocOpError::OutOfRange(format!("char index {} in paragraph {}", char, para)))?;

        let run_char = char - char_offset;
        let run = &paragraph.runs[run_idx];
        
        // Find byte index
        let byte_idx = run.text.char_indices()
            .nth(run_char)
            .map(|(i, _)| i)
            .unwrap_or(run.text.len());

        // Create the new paragraph from the split point onwards
        let old_paragraph = std::mem::replace(paragraph, DocxParagraph {
            style_id: paragraph.style_id.clone(),
            properties: paragraph.properties.clone(),
            runs: Vec::new(),
        });

        let mut new_runs: Vec<DocxRun> = Vec::new();
        let mut runs_before_split: Vec<DocxRun> = Vec::new();

        for (idx, run) in old_paragraph.runs.into_iter().enumerate() {
            if idx < run_idx {
                runs_before_split.push(run);
            } else if idx == run_idx {
                // Split this run
                let byte_idx_clone = byte_idx;
                let (before, after) = run.text.split_at(byte_idx_clone);
                
                // Create run for before split
                let mut before_run = run.clone();
                before_run.text = before.to_string();
                runs_before_split.push(before_run);

                // Create run for after split
                let after_run = DocxRun {
                    text: after.to_string(),
                    ..run
                };
                new_runs.push(after_run);
            } else {
                new_runs.push(run);
            }
        }

        // Reconstruct the original paragraph with content before split
        *paragraph = DocxParagraph {
            style_id: old_paragraph.style_id.clone(),
            properties: old_paragraph.properties.clone(),
            runs: runs_before_split,
        };

        // Create new paragraph with content after split
        let new_paragraph = DocxParagraph {
            style_id: old_paragraph.style_id,
            properties: old_paragraph.properties,
            runs: new_runs,
        };

        // Insert the new paragraph after the current one
        self.body.blocks.insert(para + 1, DocxBlock::Paragraph(new_paragraph));

        // Return inverse: MergeWithPrevious
        Ok(DocOp::MergeWithPrevious { para: para + 1 })
    }

    /// Apply MergeWithPrevious operation.
    /// Merges a paragraph with the one before it.
    pub fn apply_merge_with_previous(&mut self, para: usize) -> Result<DocOp, DocOpError> {
        if para == 0 {
            return Err(DocOpError::EmptyMerge);
        }

        if para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("paragraph {}", para)));
        }

        // Save the original char count of prev_para for the inverse
        // We need to get this before borrowing mutably
        let original_prev_chars: usize = if para > 0 {
            match &self.body.blocks[para - 1] {
                DocxBlock::Paragraph(p) => p.runs.iter().map(|r| r.text.chars().count()).sum(),
                DocxBlock::Table(_) => return Err(DocOpError::Invalid("Cannot merge a paragraph with a table".to_string())),
            }
        } else {
            return Err(DocOpError::EmptyMerge);
        };

        // Valid para > 0 from here
        
        // Get both paragraphs using split_at_mut to avoid borrow checker issues
        let blocks_split = self.body.blocks.split_at_mut(para);
        let prev_block = &mut blocks_split.0[para - 1];
        let curr_block = &mut blocks_split.1[0];

        let prev_para = match prev_block {
            DocxBlock::Paragraph(p) => p,
            DocxBlock::Table(_) => return Err(DocOpError::Invalid("Cannot merge a paragraph with a table".to_string())),
        };

        let curr_para = match curr_block {
            DocxBlock::Paragraph(p) => p,
            DocxBlock::Table(_) => return Err(DocOpError::Invalid("Cannot merge a table with a paragraph".to_string())),
        };

        // Take ownership of runs from current paragraph
        let curr_runs = std::mem::take(&mut curr_para.runs);
        
        // Append runs to previous paragraph
        prev_para.runs.extend(curr_runs);

        // Remove the current paragraph
        self.body.blocks.remove(para);

        // Return inverse: SplitParagraph at the position where the merge happened
        Ok(DocOp::SplitParagraph { para: para - 1, char: original_prev_chars })
    }

    /// Apply FormatRun operation.
    /// Applies formatting attributes to a range of characters within a paragraph.
    /// Splits runs at the boundaries so only the targeted range receives the attributes.
    pub fn apply_format_run(&mut self, para: usize, start_char: usize, end_char: usize, attrs: super::ops::RunAttrs) -> Result<DocOp, DocOpError> {
        if start_char >= end_char {
            return Err(DocOpError::Invalid(format!("start_char ({}) must be < end_char ({})", start_char, end_char)));
        }

        if para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("paragraph {}", para)));
        }

        let block = &mut self.body.blocks[para];
        let paragraph = match block {
            DocxBlock::Paragraph(p) => p,
            DocxBlock::Table(_) => return Err(DocOpError::OutOfRange(format!("block {} is a table, not a paragraph", para))),
        };

        // Count total characters in the paragraph
        let total_chars: usize = paragraph.runs.iter().map(|r| r.text.chars().count()).sum();
        
        if end_char > total_chars {
            return Err(DocOpError::OutOfRange(format!("end_char index {} in paragraph {} (total: {})", end_char, para, total_chars)));
        }

        // Collect old attributes for the formatted range for inverse operation
        // We need to capture the existing attributes of the runs that cover [start_char, end_char)
        let mut old_attrs_map: Vec<(usize, super::ops::RunAttrs)> = Vec::new();

        // Find the runs that overlap with [start_char, end_char)
        let mut current_char = 0;
        let mut runs_to_process: Vec<usize> = Vec::new();

        for (run_idx, run) in paragraph.runs.iter().enumerate() {
            let run_len = run.text.chars().count();
            let run_start = current_char;
            let run_end = current_char + run_len;

            if run_end <= start_char {
                // Run is before the range
                current_char = run_end;
                continue;
            }

            if run_start >= end_char {
                // Run is after the range
                break;
            }

            // This run overlaps with the range
            runs_to_process.push(run_idx);
            current_char = run_end;
        }

        if runs_to_process.is_empty() {
            return Err(DocOpError::OutOfRange(format!("no runs found for range [{},{})", start_char, end_char)));
        }

        // Save old attributes for inverse
        for &run_idx in &runs_to_process {
            let run = &paragraph.runs[run_idx];
            old_attrs_map.push((run_idx, super::ops::RunAttrs {
                bold: Some(run.bold),
                italic: Some(run.italic),
                underline: run.underline,
                strikethrough: Some(run.strikethrough),
                font: run.font.clone(),
                font_size: run.font_size,
                color: run.color.clone(),
                highlight: run.highlight.clone(),
            }));
        }

        // Now process each overlapping run
        let mut new_runs: Vec<DocxRun> = Vec::new();

        let mut current_offset = 0;
        for (_run_idx, run) in paragraph.runs.iter().enumerate() {
            let run_len = run.text.chars().count();
            let run_start = current_offset;
            let run_end = current_offset + run_len;

            if run_end <= start_char {
                // Run is completely before the range
                new_runs.push(run.clone());
                current_offset = run_end;
                continue;
            }

            if run_start >= end_char {
                // Run is completely after the range
                new_runs.push(run.clone());
                current_offset = run_end;
                continue;
            }

            // This run overlaps with the formatting range
            if run_start < start_char {
                // part before range
                let split_char = start_char - run_start;
                let byte_idx = run.text.char_indices().nth(split_char).map(|(i, _)| i).unwrap_or(0);
                let before_text = run.text[..byte_idx].to_string();
                new_runs.push(DocxRun {
                    text: before_text,
                    ..run.clone()
                });
            }

            // part within range
            let format_start_char = start_char.saturating_sub(run_start);
            let format_end_char = (end_char - run_start).min(run_len);
            let format_byte_start = run.text.char_indices().nth(format_start_char).map(|(i, _)| i).unwrap_or(0);
            let format_byte_end = run.text.char_indices().nth(format_end_char).map(|(i, _)| i).unwrap_or(run.text.len());
            let formatted_text = run.text[format_byte_start..format_byte_end].to_string();

            new_runs.push(DocxRun {
                text: formatted_text,
                bold: attrs.bold.unwrap_or(run.bold),
                italic: attrs.italic.unwrap_or(run.italic),
                underline: attrs.underline.or(run.underline),
                strikethrough: attrs.strikethrough.unwrap_or(run.strikethrough),
                double_strikethrough: run.double_strikethrough, // not in RunAttrs
                font: attrs.font.clone().or(run.font.clone()),
                font_size: attrs.font_size.or(run.font_size),
                font_size_cs: run.font_size_cs, // not in RunAttrs
                color: attrs.color.clone().or(run.color.clone()),
                highlight: attrs.highlight.clone().or(run.highlight.clone()),
                vertical_alignment: run.vertical_alignment, // not in RunAttrs
                small_caps: run.small_caps, // not in RunAttrs
                all_caps: run.all_caps, // not in RunAttrs
            });

            if run_end > end_char {
                // part after range
                let after_byte_start = run.text.char_indices().nth(end_char - run_start).map(|(i, _)| i).unwrap_or(run.text.len());
                let after_text = run.text[after_byte_start..].to_string();
                new_runs.push(DocxRun {
                    text: after_text,
                    ..run.clone()
                });
            }

            current_offset = run_end;
        }

        // Replace the paragraph's runs
        paragraph.runs = new_runs;

        // Return inverse: FormatRun with old attributes
        // For simplicity, we'll just return the old attributes of the first run
        // In a real implementation, we'd need to be more precise
        Ok(DocOp::FormatRun {
            para,
            start_char,
            end_char,
            attrs: old_attrs_map.get(0).map(|(_, attrs)| attrs.clone()).unwrap_or_default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wo_ooxml::model::{DocxParagraph, DocxParagraphProperties, DocxRun};

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

    // ========================================================================
    // InsertText tests
    // ========================================================================

    #[test]
    fn test_insert_text_at_beginning() {
        let mut body = create_test_body_with_paragraph("Hello");
        let mut model = DocModel { body: &mut body };

        let op = DocOp::InsertText { para: 0, char: 0, text: "Hi ".to_string() };
        let inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Hi Hello");
            }
            _ => panic!("Expected paragraph"),
        }

        // Check inverse
        if let DocOp::DeleteText { para: p, start_char: s, end_char: e } = inverse {
            assert_eq!(p, 0);
            assert_eq!(s, 0);
            assert_eq!(e, 3); // "Hi " is 3 chars
        } else {
            panic!("Expected DeleteText inverse");
        }
    }

    #[test]
    fn test_insert_text_in_middle() {
        let mut body = create_test_body_with_paragraph("Hello");
        let mut model = DocModel { body: &mut body };

        let op = DocOp::InsertText { para: 0, char: 5, text: " world".to_string() };
        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Hello world");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_insert_text_at_end() {
        let mut body = create_test_body_with_paragraph("Hello");
        let mut model = DocModel { body: &mut body };

        let op = DocOp::InsertText { para: 0, char: 5, text: "!" .to_string() };
        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Hello!");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_insert_text_unicode() {
        let mut body = create_test_body_with_paragraph("AB");
        let mut model = DocModel { body: &mut body };

        // Insert emoji (1 char, 4 bytes)
        let op = DocOp::InsertText { para: 0, char: 1, text: "😀".to_string() };
        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "A😀B");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    // ========================================================================
    // DeleteText tests
    // ========================================================================

    #[test]
    fn test_delete_text_from_middle() {
        let mut body = create_test_body_with_paragraph("Hello world");
        let mut model = DocModel { body: &mut body };

        // "Hello world" has 11 characters: H(0),e(1),l(2),l(3),o(4), (5),w(6),o(7),r(8),l(9),d(10)
        // Delete char at index 5 (the space)
        let op = DocOp::DeleteText { para: 0, start_char: 5, end_char: 6 };
        let inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                // After deleting the space at index 5, we get "Helloworld"
                assert_eq!(p.runs[0].text, "Helloworld");
            }
            _ => panic!("Expected paragraph"),
        }

        // Check inverse
        if let DocOp::InsertText { para: p, char: c, text: t } = inverse {
            assert_eq!(p, 0);
            assert_eq!(c, 5);
            assert_eq!(t, " ");
        } else {
            panic!("Expected InsertText inverse");
        }
    }

    #[test]
    fn test_delete_text_unicode() {
        let mut body = create_test_body_with_paragraph("A😀B");
        let mut model = DocModel { body: &mut body };

        // Delete the emoji (1 char at index 1)
        let op = DocOp::DeleteText { para: 0, start_char: 1, end_char: 2 };
        let _inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "AB");
            }
            _ => panic!("Expected paragraph"),
        }
    }

    // ========================================================================
    // SplitParagraph tests
    // ========================================================================

    #[test]
    fn test_split_paragraph_at_middle() {
        let mut body = create_test_body_with_paragraph("ABCD");
        let mut model = DocModel { body: &mut body };

        let op = DocOp::SplitParagraph { para: 0, char: 2 };
        let inverse = model.apply(&op).unwrap();

        assert_eq!(body.blocks.len(), 2);
        
        match (&body.blocks[0], &body.blocks[1]) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                assert_eq!(p1.runs[0].text, "AB");
                assert_eq!(p2.runs[0].text, "CD");
            }
            _ => panic!("Expected two paragraphs"),
        }

        // Check inverse
        if let DocOp::MergeWithPrevious { para: p } = inverse {
            assert_eq!(p, 1);
        } else {
            panic!("Expected MergeWithPrevious inverse");
        }
    }

    #[test]
    fn test_split_paragraph_at_beginning() {
        let mut body = create_test_body_with_paragraph("ABCD");
        let mut model = DocModel { body: &mut body };

        let op = DocOp::SplitParagraph { para: 0, char: 0 };
        let _inverse = model.apply(&op).unwrap();

        assert_eq!(body.blocks.len(), 2);
        
        match (&body.blocks[0], &body.blocks[1]) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                assert_eq!(p1.runs[0].text, "");
                assert_eq!(p2.runs[0].text, "ABCD");
            }
            _ => panic!("Expected two paragraphs"),
        }
    }

    // ========================================================================
    // MergeWithPrevious tests
    // ========================================================================

    #[test]
    fn test_merge_with_previous() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("AB"));
        body.push_paragraph(create_test_paragraph("CD"));

        let mut model = DocModel { body: &mut body };

        let op = DocOp::MergeWithPrevious { para: 1 };
        let inverse = model.apply(&op).unwrap();

        assert_eq!(body.blocks.len(), 1);
        
        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs.len(), 2);
                assert_eq!(p.runs[0].text, "AB");
                assert_eq!(p.runs[1].text, "CD");
            }
            _ => panic!("Expected paragraph"),
        }

        // Check inverse
        if let DocOp::SplitParagraph { para: p, char: c } = inverse {
            assert_eq!(p, 0);
            assert_eq!(c, 2); // Length of "AB"
        } else {
            panic!("Expected SplitParagraph inverse");
        }
    }

    #[test]
    fn test_merge_with_previous_cannot_merge_para_0() {
        let mut body = create_test_body_with_paragraph("AB");
        let mut model = DocModel { body: &mut body };

        let op = DocOp::MergeWithPrevious { para: 0 };
        let result = model.apply(&op);

        assert!(result.is_err());
        assert_eq!(body.blocks.len(), 1); // Body unchanged
    }

    // ========================================================================
    // Round-trip tests
    // ========================================================================

    #[test]
    fn test_insert_delete_roundtrip() {
        let mut body = create_test_body_with_paragraph("Hello");
        let mut model = DocModel { body: &mut body };

        // Apply insert
        let insert_op = DocOp::InsertText { para: 0, char: 5, text: " world".to_string() };
        let _inverse = model.apply(&insert_op).unwrap();

        // Apply inverse (delete)
        let delete_op = DocOp::DeleteText { para: 0, start_char: 5, end_char: 11 };
        let _inverse2 = model.apply(&delete_op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Hello");
            }
            _ => panic!("Expected paragraph with original text"),
        }
    }

    #[test]
    fn test_split_merge_roundtrip() {
        let mut body = create_test_body_with_paragraph("ABCD");
        let mut model = DocModel { body: &mut body };

        // Apply split
        let split_op = DocOp::SplitParagraph { para: 0, char: 2 };
        let _inverse = model.apply(&split_op).unwrap();

        // Apply merge
        let merge_op = DocOp::MergeWithPrevious { para: 1 };
        let _inverse2 = model.apply(&merge_op).unwrap();

        assert_eq!(body.blocks.len(), 1);
        
        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                // After split and merge, we should have the original text
                // But due to run splitting, we might have multiple runs
                let total_text: String = p.runs.iter().map(|r| r.text.as_str()).collect();
                assert_eq!(total_text, "ABCD");
            }
            _ => panic!("Expected paragraph"),
        }
    }
}
