//! Paragraph operations for DOCX document mutation

use super::ops::{DocOp, DocOpError, DocModel};
use wo_ooxml::model::{DocxParagraph, DocxParagraphProperties};

impl<'a> DocModel<'a> {
    pub fn para_apply_insert(&mut self, _after: usize, _para: DocxParagraph) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
    
    pub fn para_apply_delete(&mut self, _para: usize) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
    
    pub fn para_apply_set_props(&mut self, _para: usize, _props: DocxParagraphProperties) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
}
