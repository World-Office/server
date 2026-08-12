//! Image operations for DOCX document mutation

use super::ops::{DocOp, DocOpError, DocModel, WrapMode};

impl<'a> DocModel<'a> {
    pub fn image_apply_insert(&mut self, _after_para: usize, _bytes: Vec<u8>, _width_emu: u32, _height_emu: u32, _wrap: WrapMode) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
}
