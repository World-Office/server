//! Paragraph operations for DOCX document mutation

use super::ops::{DocModel, DocOp, DocOpError};
use wo_ooxml::model::{DocxBlock, DocxParagraph, DocxParagraphProperties};

impl<'a> DocModel<'a> {
    /// Apply InsertParagraph operation.
    /// Inserts a new paragraph after the specified paragraph index.
    pub fn apply_insert_paragraph(
        &mut self,
        after: usize,
        para: DocxParagraph,
    ) -> Result<DocOp, DocOpError> {
        if after >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!("after index {}", after)));
        }

        // Insert after the specified block
        let insert_pos = after + 1;
        self.body
            .blocks
            .insert(insert_pos, DocxBlock::Paragraph(para));

        // Return inverse: DeleteParagraph
        Ok(DocOp::DeleteParagraph { para: insert_pos })
    }

    /// Apply DeleteParagraph operation.
    /// Deletes the paragraph at the specified index.
    pub fn apply_delete_paragraph(&mut self, para: usize) -> Result<DocOp, DocOpError> {
        if para >= self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!(
                "paragraph {} (body has {} blocks)",
                para,
                self.body.blocks.len()
            )));
        }

        // Cannot delete the last paragraph
        if self.body.blocks.len() == 1 {
            return Err(DocOpError::EmptyBody);
        }

        let block = &self.body.blocks[para];
        let deleted_para = match block {
            DocxBlock::Paragraph(p) => p.clone(),
            DocxBlock::Table(_) => {
                return Err(DocOpError::Invalid(
                    "Cannot delete a table as a paragraph".to_string(),
                ))
            }
            DocxBlock::Image(_) => {
                return Err(DocOpError::Invalid(
                    "Cannot operate on an image block".to_string(),
                ))
            }
        };

        // Remove the paragraph
        self.body.blocks.remove(para);

        // Return inverse: InsertParagraph
        let after = if para > 0 { para - 1 } else { 0 };
        Ok(DocOp::InsertParagraph {
            after,
            para: deleted_para,
        })
    }

    /// Apply SetParagraphProps operation.
    /// Sets the properties of the specified paragraph.
    pub fn apply_set_paragraph_props(
        &mut self,
        para: usize,
        props: DocxParagraphProperties,
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

        // Get old properties for inverse
        let old_props = std::mem::replace(&mut paragraph.properties, props);

        // Return inverse: SetParagraphProps with old properties
        Ok(DocOp::SetParagraphProps {
            para,
            props: old_props,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wo_ooxml::model::{DocxParagraphProperties, DocxRun};

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

    // ========================================================================
    // InsertParagraph tests
    // ========================================================================

    #[test]
    fn test_insert_paragraph_after_first() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));

        let mut model = DocModel { body: &mut body };

        let new_para = create_test_paragraph("New");
        let op = DocOp::InsertParagraph {
            after: 0,
            para: new_para,
        };
        let inverse = model.apply(&op).unwrap();

        assert_eq!(body.blocks.len(), 3);

        match (&body.blocks[0], &body.blocks[1], &body.blocks[2]) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2), DocxBlock::Paragraph(p3)) => {
                assert_eq!(p1.runs[0].text, "First");
                assert_eq!(p2.runs[0].text, "New");
                assert_eq!(p3.runs[0].text, "Second");
            }
            _ => panic!("Expected three paragraphs"),
        }

        // Check inverse
        if let DocOp::DeleteParagraph { para: p } = inverse {
            assert_eq!(p, 1);
        } else {
            panic!("Expected DeleteParagraph inverse");
        }
    }

    #[test]
    fn test_insert_paragraph_at_end() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));

        let mut model = DocModel { body: &mut body };

        let new_para = create_test_paragraph("Last");
        let op = DocOp::InsertParagraph {
            after: 0,
            para: new_para,
        };
        let _inverse = model.apply(&op).unwrap();

        assert_eq!(body.blocks.len(), 2);

        match (&body.blocks[0], &body.blocks[1]) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                assert_eq!(p1.runs[0].text, "First");
                assert_eq!(p2.runs[0].text, "Last");
            }
            _ => panic!("Expected two paragraphs"),
        }
    }

    // ========================================================================
    // DeleteParagraph tests
    // ========================================================================

    #[test]
    fn test_delete_paragraph_middle() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));
        body.push_paragraph(create_test_paragraph("Third"));

        let mut model = DocModel { body: &mut body };

        let op = DocOp::DeleteParagraph { para: 1 };
        let inverse = model.apply(&op).unwrap();

        assert_eq!(body.blocks.len(), 2);

        match (&body.blocks[0], &body.blocks[1]) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                assert_eq!(p1.runs[0].text, "First");
                assert_eq!(p2.runs[0].text, "Third");
            }
            _ => panic!("Expected two paragraphs"),
        }

        // Check inverse
        if let DocOp::InsertParagraph { after, para: p } = inverse {
            assert_eq!(after, 0);
            assert_eq!(p.runs[0].text, "Second");
        } else {
            panic!("Expected InsertParagraph inverse");
        }
    }

    #[test]
    fn test_delete_paragraph_last() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));

        let mut model = DocModel { body: &mut body };

        let op = DocOp::DeleteParagraph { para: 1 };
        let _inverse = model.apply(&op).unwrap();

        assert_eq!(body.blocks.len(), 1);

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "First");
            }
            _ => panic!("Expected one paragraph"),
        }
    }

    #[test]
    fn test_delete_paragraph_last_of_one() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("Only"));

        let mut model = DocModel { body: &mut body };

        let op = DocOp::DeleteParagraph { para: 0 };
        let result = model.apply(&op);

        assert!(result.is_err());
        assert_eq!(body.blocks.len(), 1); // Body unchanged
    }

    #[test]
    fn test_delete_paragraph_first() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));

        let mut model = DocModel { body: &mut body };

        let op = DocOp::DeleteParagraph { para: 0 };
        let inverse = model.apply(&op).unwrap();

        assert_eq!(body.blocks.len(), 1);

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Second");
            }
            _ => panic!("Expected one paragraph"),
        }

        // Check inverse
        if let DocOp::InsertParagraph { after, para: p } = inverse {
            assert_eq!(after, 0);
            assert_eq!(p.runs[0].text, "First");
        } else {
            panic!("Expected InsertParagraph inverse");
        }
    }

    // ========================================================================
    // SetParagraphProps tests
    // ========================================================================

    #[test]
    fn test_set_paragraph_props() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("Test"));

        let mut model = DocModel { body: &mut body };

        let mut new_props = DocxParagraphProperties::default();
        new_props.alignment = Some(wo_ooxml::model::TextAlignment::Center);

        let op = DocOp::SetParagraphProps {
            para: 0,
            props: new_props.clone(),
        };
        let inverse = model.apply(&op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(
                    p.properties.alignment,
                    Some(wo_ooxml::model::TextAlignment::Center)
                );
            }
            _ => panic!("Expected paragraph"),
        }

        // Check inverse restores old props
        if let DocOp::SetParagraphProps {
            para: p,
            props: old_props,
        } = inverse
        {
            assert_eq!(p, 0);
            assert_eq!(old_props.alignment, None);
        } else {
            panic!("Expected SetParagraphProps inverse");
        }
    }

    // ========================================================================
    // Round-trip tests
    // ========================================================================

    #[test]
    fn test_insert_delete_paragraph_roundtrip() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));

        let mut model = DocModel { body: &mut body };

        // Insert a paragraph
        let new_para = create_test_paragraph("New");
        let insert_op = DocOp::InsertParagraph {
            after: 0,
            para: new_para,
        };
        let _inverse = model.apply(&insert_op).unwrap();

        // Delete it
        let delete_op = DocOp::DeleteParagraph { para: 1 };
        let _inverse2 = model.apply(&delete_op).unwrap();

        assert_eq!(body.blocks.len(), 2);

        match (&body.blocks[0], &body.blocks[1]) {
            (DocxBlock::Paragraph(p1), DocxBlock::Paragraph(p2)) => {
                assert_eq!(p1.runs[0].text, "First");
                assert_eq!(p2.runs[0].text, "Second");
            }
            _ => panic!("Expected two original paragraphs"),
        }
    }

    #[test]
    fn test_set_paragraph_props_roundtrip() {
        let mut body = wo_ooxml::model::DocxBody::new();
        body.push_paragraph(create_test_paragraph("Test"));

        let mut model = DocModel { body: &mut body };

        let mut new_props = DocxParagraphProperties::default();
        new_props.alignment = Some(wo_ooxml::model::TextAlignment::Right);

        let set_op = DocOp::SetParagraphProps {
            para: 0,
            props: new_props,
        };
        let _inverse = model.apply(&set_op).unwrap();

        // Set back to default
        let default_props = DocxParagraphProperties::default();
        let restore_op = DocOp::SetParagraphProps {
            para: 0,
            props: default_props,
        };
        let _inverse2 = model.apply(&restore_op).unwrap();

        match &body.blocks[0] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.properties.alignment, None);
            }
            _ => panic!("Expected paragraph with default props"),
        }
    }
}
