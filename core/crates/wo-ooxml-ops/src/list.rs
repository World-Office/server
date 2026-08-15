//! List operations for DOCX document mutation

use super::ops::{DocModel, DocOp, DocOpError};
use wo_ooxml::model::DocxBlock;

impl<'a> DocModel<'a> {
    /// Apply SetListLevel operation.
    /// Sets the list level and numbering ID for the specified paragraph.
    pub fn list_apply_set_level(
        &mut self,
        para: usize,
        level: u8,
        num_id: u32,
    ) -> Result<DocOp, DocOpError> {
        if para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("paragraph {}", para)));
        }

        let block = &mut self.body.blocks[para];
        let paragraph = match block {
            DocxBlock::Paragraph(p) => p,
            DocxBlock::Table(_) => {
                return Err(DocOpError::OutOfRange(format!(
                    "block {} is a table, not a paragraph",
                    para
                )))
            }
            DocxBlock::Image(_) => {
                return Err(DocOpError::Invalid(
                    "Cannot operate on an image block".to_string(),
                ))
            }
        };

        // Get old values for inverse operation
        let old_num_id = paragraph.properties.num_id;
        let old_ilvl = paragraph.properties.ilvl;

        // Set new values
        paragraph.properties.num_id = Some(num_id);
        paragraph.properties.ilvl = Some(level);

        // Return inverse: SetListLevel with old values
        // If there were no old values, the inverse should clear them (use None which becomes 0)
        let inverse_num_id = old_num_id.unwrap_or(0);
        let inverse_level = old_ilvl.unwrap_or(0);
        Ok(DocOp::SetListLevel {
            para,
            level: inverse_level,
            num_id: inverse_num_id,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wo_ooxml::model::{DocxBody, DocxParagraph, DocxParagraphProperties, DocxRun};

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
    fn test_set_list_level() {
        let mut body = DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));

        let mut model = DocModel { body: &mut body };

        let result = model.list_apply_set_level(0, 1, 5);
        assert!(result.is_ok());

        let inverse = result.unwrap();
        match inverse {
            DocOp::SetListLevel {
                para: 0,
                level: 0,
                num_id: 0,
            } => {}
            _ => panic!("Expected inverse SetListLevel with level=0, num_id=0"),
        }

        // Check that the paragraph has the new list level
        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.properties.num_id, Some(5));
                assert_eq!(p.properties.ilvl, Some(1));
            }
            _ => panic!("Expected Paragraph block"),
        }
    }

    #[test]
    fn test_set_list_level_out_of_range() {
        let mut body = DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));

        let mut model = DocModel { body: &mut body };

        let result = model.list_apply_set_level(5, 1, 5);
        assert!(result.is_err());
        match result.unwrap_err() {
            DocOpError::OutOfRange(_) => {}
            _ => panic!("Expected OutOfRange error"),
        }
    }

    #[test]
    fn test_set_list_level_roundtrip() {
        let mut body = DocxBody::new();

        // Create a paragraph with existing list properties
        let mut para = create_test_paragraph("First");
        para.properties.num_id = Some(5);
        para.properties.ilvl = Some(1);
        body.push_paragraph(para);

        {
            let mut model = DocModel { body: &mut body };
            // Set list level to new values
            let op1 = model.list_apply_set_level(0, 2, 10);
            assert!(op1.is_ok());
        }

        // Verify the new values are set (model is dropped, so we can access body)
        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.properties.num_id, Some(10));
                assert_eq!(p.properties.ilvl, Some(2));
            }
            _ => panic!("Expected Paragraph block"),
        }

        // Apply inverse
        let inverse_op = DocOp::SetListLevel {
            para: 0,
            level: 1,
            num_id: 5,
        };
        {
            let mut model = DocModel { body: &mut body };
            let op2 = model.apply(&inverse_op);
            assert!(op2.is_ok());
        }

        // Check that we're back to the original state
        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.properties.num_id, Some(5));
                assert_eq!(p.properties.ilvl, Some(1));
            }
            _ => panic!("Expected Paragraph block"),
        }
    }
}
