//! Section operations for DOCX document mutation

use super::ops::{DocOp, DocOpError, DocModel};

impl<'a> DocModel<'a> {
    pub fn section_apply_insert_break(&mut self, _after_para: usize, _cols: u8) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
}
