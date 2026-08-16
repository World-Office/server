//! Image operations for DOCX document mutation

use super::ops::{DocModel, DocOp, DocOpError, WrapMode};
use wo_ooxml::model::{DocxBlock, DocxImage};

impl<'a> DocModel<'a> {
    pub fn image_apply_insert(
        &mut self,
        after_para: usize,
        bytes: Vec<u8>,
        width_emu: u32,
        height_emu: u32,
        wrap: WrapMode,
    ) -> Result<DocOp, DocOpError> {
        if after_para > self.body.blocks.len() {
            return Err(DocOpError::OutOfRange(format!(
                "after_para {} exceeds body length {}",
                after_para,
                self.body.blocks.len()
            )));
        }

        let wrap_mode_str = match wrap {
            WrapMode::Inline => "inline",
            WrapMode::Square => "square",
            WrapMode::Tight => "tight",
            WrapMode::Through => "through",
            WrapMode::TopBottom => "topBottom",
            WrapMode::Behind => "behind",
            WrapMode::InFront => "inFront",
        }
        .to_string();

        let image = DocxImage {
            bytes,
            width_emu,
            height_emu,
            wrap_mode: wrap_mode_str,
        };

        if after_para == self.body.blocks.len() {
            self.body.blocks.push(DocxBlock::Image(image));
        } else {
            let insert_at = after_para + 1;
            self.body.blocks.insert(insert_at, DocxBlock::Image(image));
        }

        Ok(DocOp::DeleteParagraph {
            para: after_para + 1,
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
    fn test_insert_image_at_end() {
        let mut body = DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));

        let mut model = DocModel { body: &mut body };

        let image_bytes = vec![1, 2, 3, 4, 5];
        let result = model.image_apply_insert(1, image_bytes.clone(), 1000, 2000, WrapMode::Inline);

        assert!(result.is_ok());
        let inverse = result.unwrap();

        match inverse {
            DocOp::DeleteParagraph { para } => assert_eq!(para, 2),
            _ => panic!("Expected DeleteParagraph as inverse"),
        }

        assert_eq!(body.blocks.len(), 3);

        match &body.blocks[2] {
            DocxBlock::Image(img) => {
                assert_eq!(img.bytes, image_bytes);
                assert_eq!(img.width_emu, 1000);
                assert_eq!(img.height_emu, 2000);
                assert_eq!(img.wrap_mode, "inline");
            }
            _ => panic!("Expected Image block at position 2"),
        }
    }

    #[test]
    fn test_insert_image_in_middle() {
        let mut body = DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));
        body.push_paragraph(create_test_paragraph("Second"));
        body.push_paragraph(create_test_paragraph("Third"));

        let mut model = DocModel { body: &mut body };

        let image_bytes = vec![10, 20, 30];
        let result = model.image_apply_insert(1, image_bytes.clone(), 500, 600, WrapMode::Square);

        assert!(result.is_ok());
        let inverse = result.unwrap();

        match inverse {
            DocOp::DeleteParagraph { para } => assert_eq!(para, 2),
            _ => panic!("Expected DeleteParagraph as inverse"),
        }

        assert_eq!(body.blocks.len(), 4);

        match &body.blocks[2] {
            DocxBlock::Image(img) => {
                assert_eq!(img.bytes, image_bytes);
                assert_eq!(img.width_emu, 500);
                assert_eq!(img.height_emu, 600);
                assert_eq!(img.wrap_mode, "square");
            }
            _ => panic!("Expected Image block at position 2"),
        }

        match &body.blocks[3] {
            DocxBlock::Paragraph(p) => {
                assert_eq!(p.runs[0].text, "Third");
            }
            _ => panic!("Expected Paragraph block at position 3"),
        }
    }

    #[test]
    fn test_insert_image_out_of_range() {
        let mut body = DocxBody::new();
        body.push_paragraph(create_test_paragraph("First"));

        let mut model = DocModel { body: &mut body };

        let result = model.image_apply_insert(5, vec![1, 2, 3], 100, 100, WrapMode::Inline);

        assert!(result.is_err());
        match result.unwrap_err() {
            DocOpError::OutOfRange(_) => {}
            _ => panic!("Expected OutOfRange error"),
        }
    }
}
