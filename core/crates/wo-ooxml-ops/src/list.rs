//! List operations for DOCX document mutation

use super::ops::{DocOp, DocOpError, DocModel};

impl<'a> DocModel<'a> {
    pub fn list_apply_set_level(&mut self, _para: usize, _level: u8, _num_id: u32) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
}
