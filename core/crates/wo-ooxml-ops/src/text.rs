//! Text operations for DOCX document mutation

use super::ops::{DocOp, DocOpError, DocModel};

impl<'a> DocModel<'a> {
    pub fn text_apply_insert(&mut self, _para: usize, _char: usize, _text: String) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
    
    pub fn text_apply_delete(&mut self, _para: usize, _start_char: usize, _end_char: usize) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
    
    pub fn text_apply_split_paragraph(&mut self, _para: usize, _char: usize) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
    
    pub fn text_apply_merge_with_previous(&mut self, _para: usize) -> Result<DocOp, DocOpError> {
        unimplemented!()
    }
}
