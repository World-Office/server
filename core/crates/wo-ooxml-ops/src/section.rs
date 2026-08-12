//! Section operations for DOCX document mutation

use super::ops::{DocOp, DocOpError, DocModel};
use wo_ooxml::model::{DocxBlock, DocxParagraph, SectionProperties};

impl<'a> DocModel<'a> {
    /// Apply InsertSectionBreak operation.
    /// Inserts a section break after the specified paragraph by setting section properties
    /// on the next paragraph. If there is no next paragraph, creates a new empty one.
    /// The `cols` parameter specifies the number of columns for the new section.
    pub fn section_apply_insert_break(&mut self, after_para: usize, cols: u8) -> Result<DocOp, DocOpError> {
        if after_para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("after_para {}", after_para)));
        }

        // Check if we're inserting at the end (need to create a new paragraph)
        if after_para + 1 == self.body.blocks.len() {
            // Create a new paragraph with the section properties
            let section_props = SectionProperties {
                header_first: None,
                header_even: None,
                header: None,
                footer_first: None,
                footer_even: None,
                footer: None,
                cols: Some(cols),
            };

            let new_para = DocxParagraph {
                style_id: None,
                properties: Default::default(),
                runs: vec![],
                section_properties: Some(section_props),
            };

            self.body.blocks.push(DocxBlock::Paragraph(new_para));

            // Return inverse: DeleteParagraph for the newly created paragraph
            Ok(DocOp::DeleteParagraph { para: after_para + 1 })
        } else {
            // Insert section properties on the next block (if it's a paragraph)
            let next_block = &mut self.body.blocks[after_para + 1];
            
            let section_props = match next_block {
                DocxBlock::Paragraph(p) => {
                    // Get existing section properties for inverse
                    let old_section_props = std::mem::replace(&mut p.section_properties, Some(SectionProperties {
                        header_first: None,
                        header_even: None,
                        header: None,
                        footer_first: None,
                        footer_even: None,
                        footer: None,
                        cols: Some(cols),
                    }));
                    old_section_props
                }
                DocxBlock::Table(_) => {
                    // Cannot insert section break before a table
                    return Err(DocOpError::Invalid("Cannot insert section break before a table. Insert after the table instead.".to_string()));
                }
                DocxBlock::Image(_) => {
                    // Cannot insert section break before an image
                    return Err(DocOpError::Invalid("Cannot insert section break before an image. Insert after the image instead.".to_string()));
                }
            };

            // Return inverse: Set section properties back to old value
            // For now, we return a simplified inverse
            Ok(DocOp::InsertSectionBreak { after_para, cols: section_props.and_then(|s| s.cols).unwrap_or(1) })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wo_ooxml::model::{DocxBody, DocxParagraph, DocxRun, DocxParagraphProperties};

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
            section_properties: None,
        }
    }

    #[test]
    fn test_insert_section_break_at_end() {
        let mut body = DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));

        let mut model = DocModel { body: &mut body };

        let result = model.section_apply_insert_break(1, 2);
        assert!(result.is_ok());
        
        let inverse = result.unwrap();
        match inverse {
            DocOp::DeleteParagraph { para: 2 } => {}
            _ => panic!("Expected DeleteParagraph as inverse"),
        }

        // Check that a new paragraph was added with section properties
        assert_eq!(body.blocks.len(), 3);
        match &body.blocks[2] {
            DocxBlock::Paragraph(p) => {
                assert!(p.section_properties.is_some());
                assert_eq!(p.section_properties.as_ref().unwrap().cols, Some(2));
            }
            _ => panic!("Expected Paragraph block"),
        }
    }

    #[test]
    fn test_insert_section_break_in_middle() {
        let mut body = DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));
        body.push_paragraph(create_test_paragraph("Third"));

        let mut model = DocModel { body: &mut body };

        let result = model.section_apply_insert_break(0, 3);
        assert!(result.is_ok());

        // Check that the second paragraph now has section properties
        match &body.blocks[1] {
            DocxBlock::Paragraph(p) => {
                assert!(p.section_properties.is_some());
                assert_eq!(p.section_properties.as_ref().unwrap().cols, Some(3));
            }
            _ => panic!("Expected Paragraph block"),
        }
    }
}
