//! World-Office Formula Engine
//!
//! A pure Rust implementation of Excel-style formula parsing and evaluation.

pub mod ast;
pub mod eval;
pub mod lexer;
pub mod parser;

pub use ast::{
    a1_to_col, CellErr, CellRef, CellRefCoord, CellValue, Expr, FormulaError, RangeRef, RefStyle,
};
pub use eval::{eval, recalc_all, Sheet};
pub use lexer::{Lexer, Token};
pub use parser::parse;
