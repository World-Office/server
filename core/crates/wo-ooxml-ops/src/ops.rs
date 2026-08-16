//! Document operations and model for OOXML mutation

use serde::{Deserialize, Serialize};
use wo_ooxml::model::{DocxBody, DocxParagraph, DocxParagraphProperties};

/// Wrap mode for images
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WrapMode {
    Inline,
    Square,
    Tight,
    Through,
    TopBottom,
    Behind,
    InFront,
}

/// Run formatting attributes
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunAttrs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub underline: Option<wo_ooxml::model::UnderlineType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strikethrough: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight: Option<String>,
}

/// Document operation types
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DocOp {
    // Text operations
    InsertText {
        para: usize,
        char: usize,
        text: String,
    },
    DeleteText {
        para: usize,
        start_char: usize,
        end_char: usize,
    },
    SplitParagraph {
        para: usize,
        char: usize,
    },
    MergeWithPrevious {
        para: usize,
    },

    // Paragraph operations
    InsertParagraph {
        after: usize,
        para: DocxParagraph,
    },
    DeleteParagraph {
        para: usize,
    },
    SetParagraphProps {
        para: usize,
        props: DocxParagraphProperties,
    },
    FormatRun {
        para: usize,
        start_char: usize,
        end_char: usize,
        attrs: RunAttrs,
    },

    // Table operations
    InsertTableRow {
        table: usize,
        after_row: usize,
    },
    DeleteTableRow {
        table: usize,
        row: usize,
    },
    InsertTableColumn {
        table: usize,
        after_col: usize,
    },
    DeleteTableColumn {
        table: usize,
        col: usize,
    },
    MergeCells {
        table: usize,
        r1: usize,
        c1: usize,
        r2: usize,
        c2: usize,
    },
    SplitCell {
        table: usize,
        row: usize,
        col: usize,
        horizontal: bool,
    },
    SetCellShading {
        table: usize,
        row: usize,
        col: usize,
        hex: String,
    },

    // Image operations
    InsertImage {
        after_para: usize,
        bytes: Vec<u8>,
        width_emu: u32,
        height_emu: u32,
        wrap: WrapMode,
    },

    // List and section operations
    SetListLevel {
        para: usize,
        level: u8,
        num_id: u32,
    },
    InsertSectionBreak {
        after_para: usize,
        cols: u8,
    },
}

/// Error type for document operations
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DocOpError {
    #[error("path out of range: {0}")]
    OutOfRange(String),
    #[error("invalid op: {0}")]
    Invalid(String),
    #[error("cannot merge paragraph 0")]
    EmptyMerge,
    #[error("cannot delete the last paragraph")]
    EmptyBody,
    #[error("index out of range: table {0}, row {1}, col {2}")]
    TableIndexOutOfRange(usize, usize, usize),
    #[error("cannot merge non-adjacent cells")]
    NonAdjacentMerge,
    #[error("cannot split unmerged cell")]
    UnmergedCellSplit,
}

/// Document model for applying operations
pub struct DocModel<'a> {
    pub body: &'a mut DocxBody,
}

impl<'a> DocModel<'a> {
    /// Apply an operation and return the inverse operation for undo
    pub fn apply(&mut self, op: &DocOp) -> Result<DocOp, DocOpError> {
        match op {
            DocOp::InsertText { para, char, text } => {
                self.apply_insert_text(*para, *char, text.clone())
            }
            DocOp::DeleteText {
                para,
                start_char,
                end_char,
            } => self.apply_delete_text(*para, *start_char, *end_char),
            DocOp::SplitParagraph { para, char } => self.apply_split_paragraph(*para, *char),
            DocOp::MergeWithPrevious { para } => self.apply_merge_with_previous(*para),
            DocOp::InsertParagraph { after, para } => {
                self.apply_insert_paragraph(*after, para.clone())
            }
            DocOp::DeleteParagraph { para } => self.apply_delete_paragraph(*para),
            DocOp::SetParagraphProps { para, props } => {
                self.apply_set_paragraph_props(*para, props.clone())
            }
            DocOp::FormatRun {
                para,
                start_char,
                end_char,
                attrs,
            } => self.apply_format_run(*para, *start_char, *end_char, attrs.clone()),
            DocOp::InsertTableRow { table, after_row } => {
                self.table_apply_insert_row(*table, *after_row)
            }
            DocOp::DeleteTableRow { table, row } => self.table_apply_delete_row(*table, *row),
            DocOp::InsertTableColumn { table, after_col } => {
                self.table_apply_insert_column(*table, *after_col)
            }
            DocOp::DeleteTableColumn { table, col } => self.table_apply_delete_column(*table, *col),
            DocOp::MergeCells {
                table,
                r1,
                c1,
                r2,
                c2,
            } => self.table_apply_merge_cells(*table, *r1, *c1, *r2, *c2),
            DocOp::SplitCell {
                table,
                row,
                col,
                horizontal,
            } => self.table_apply_split_cell(*table, *row, *col, *horizontal),
            DocOp::SetCellShading {
                table,
                row,
                col,
                hex,
            } => self.table_apply_set_cell_shading(*table, *row, *col, hex.clone()),
            DocOp::InsertImage {
                after_para,
                bytes,
                width_emu,
                height_emu,
                wrap,
            } => {
                self.image_apply_insert(*after_para, bytes.clone(), *width_emu, *height_emu, *wrap)
            }
            DocOp::SetListLevel {
                para,
                level,
                num_id,
            } => self.list_apply_set_level(*para, *level, *num_id),
            DocOp::InsertSectionBreak { after_para, cols } => {
                self.section_apply_insert_break(*after_para, *cols)
            }
        }
    }
}
