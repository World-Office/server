//! World-Office Formula Engine
//!
//! A pure Rust implementation of Excel-style formula parsing and evaluation.

pub mod ast;
pub mod dep_graph;
pub mod eval;
pub mod lexer;
pub mod parser;

pub use ast::{
    CellErr, CellRef, CellRefCoord, CellValue, Expr, FormulaError, RangeRef, RefStyle, a1_to_col,
};
pub use dep_graph::DepGraph;
pub use eval::{Sheet, eval, recalc_all};
pub use lexer::{Lexer, Token};
pub use parser::parse;
