//! Abstract Syntax Tree for spreadsheet formulas.

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Error type for formula parsing and evaluation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[serde(tag = "error", rename_all = "snake_case")]
pub enum FormulaError {
    #[error("Syntax error at position {pos}: {message}")]
    Syntax { pos: usize, message: String },
    #[error("Unexpected end of input")]
    UnexpectedEof,
    #[error("Invalid token: {0}")]
    InvalidToken(String),
    #[error("Invalid cell reference: {0}")]
    InvalidReference(String),
    #[error("Circular reference detected")]
    CircularReference,
    #[error("Division by zero")]
    DivByZero,
    #[error("Invalid number: {0}")]
    InvalidNumber(String),
    #[error("Function not found: {0}")]
    FunctionNotFound(String),
    #[error("Wrong number of arguments for {func}: expected {expected}, got {actual}")]
    WrongArgCount {
        func: String,
        expected: usize,
        actual: usize,
    },
    #[error("Type mismatch: {0}")]
    TypeMismatch(String),
    #[error("#VALUE!")]
    ValueError,
    #[error("#REF!")]
    RefError,
    #[error("#NAME?")]
    NameError,
    #[error("#NULL!")]
    NullError,
    #[error("#NUM!")]
    NumError,
    #[error("#N/A")]
    NotAvailable,
}

/// Cell error values (similar to Excel error types)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CellErr {
    Null,
    DivByZero,
    Value,
    Ref,
    Name,
    Num,
    NA,
}

impl fmt::Display for CellErr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CellErr::Null => write!(f, "#NULL!"),
            CellErr::DivByZero => write!(f, "#DIV/0!"),
            CellErr::Value => write!(f, "#VALUE!"),
            CellErr::Ref => write!(f, "#REF!"),
            CellErr::Name => write!(f, "#NAME?"),
            CellErr::Num => write!(f, "#NUM!"),
            CellErr::NA => write!(f, "#N/A"),
        }
    }
}

/// Cell value types
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CellValue {
    Empty,
    Num(f64),
    Text(String),
    Bool(bool),
    Err(CellErr),
    Date(NaiveDateTime),
}

impl fmt::Display for CellValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CellValue::Empty => write!(f, ""),
            CellValue::Num(n) => {
                if n.fract() == 0.0 {
                    write!(f, "{}", *n as i64)
                } else {
                    write!(f, "{n}")
                }
            }
            CellValue::Text(s) => write!(f, "{s}"),
            CellValue::Bool(b) => write!(f, "{b}"),
            CellValue::Err(e) => write!(f, "{e}"),
            CellValue::Date(d) => write!(f, "{d}"),
        }
    }
}

/// Reference style for cell addresses
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RefStyle {
    A1,
    R1C1,
}

/// Coordinate that can be relative (offset) or absolute
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CellRefCoord {
    Absolute(u32),
    Relative(i32),
}

/// Cell reference - can be relative or absolute
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CellRef {
    pub sheet: Option<String>,
    pub row: CellRefCoord,
    pub col: CellRefCoord,
    pub style: RefStyle,
}

impl CellRef {
    pub fn new(
        sheet: Option<String>,
        row: CellRefCoord,
        col: CellRefCoord,
        style: RefStyle,
    ) -> Self {
        Self {
            sheet,
            row,
            col,
            style,
        }
    }

    pub fn a1(sheet: Option<String>, row: u32, col: u32) -> Self {
        Self {
            sheet,
            row: CellRefCoord::Absolute(row),
            col: CellRefCoord::Absolute(col),
            style: RefStyle::A1,
        }
    }

    pub fn resolve(&self, base_row: u32, base_col: u32) -> (u32, u32) {
        let row = match self.row {
            CellRefCoord::Absolute(r) => r,
            CellRefCoord::Relative(offset) => (base_row as i32 + offset) as u32,
        };
        let col = match self.col {
            CellRefCoord::Absolute(c) => c,
            CellRefCoord::Relative(offset) => (base_col as i32 + offset) as u32,
        };
        (row, col)
    }
}

impl fmt::Display for CellRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(sheet) = &self.sheet {
            write!(f, "{}!", sheet)?;
        }
        match self.style {
            RefStyle::A1 => {
                let col = match self.col {
                    CellRefCoord::Absolute(c) => c,
                    CellRefCoord::Relative(c) => {
                        if c >= 0 {
                            c as u32
                        } else {
                            0
                        }
                    }
                };
                let row = match self.row {
                    CellRefCoord::Absolute(r) => r,
                    CellRefCoord::Relative(r) => {
                        if r >= 0 {
                            r as u32
                        } else {
                            0
                        }
                    }
                };
                write!(f, "{}{}", col_to_a1(col), row + 1)
            }
            RefStyle::R1C1 => {
                match self.row {
                    CellRefCoord::Absolute(r) => write!(f, "R{}", r + 1)?,
                    CellRefCoord::Relative(r) => write!(f, "R[{}]", r)?,
                }
                match self.col {
                    CellRefCoord::Absolute(c) => write!(f, "C{}", c + 1)?,
                    CellRefCoord::Relative(c) => write!(f, "C[{}]", c)?,
                }
                Ok(())
            }
        }
    }
}

/// Range reference (e.g., A1:B2 or Sheet1!A1:B2)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RangeRef {
    pub sheet: Option<String>,
    pub start: CellRef,
    pub end: CellRef,
}

impl RangeRef {
    pub fn new(sheet: Option<String>, start: CellRef, end: CellRef) -> Self {
        Self { sheet, start, end }
    }
}

impl fmt::Display for RangeRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(sheet) = &self.sheet {
            write!(f, "{}!", sheet)?;
        }
        write!(f, "{}:{}", self.start, self.end)
    }
}

/// Binary operators
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BinaryOp {
    Add,
    Subtract,
    Multiply,
    Divide,
    Power,
    Equal,
    NotEqual,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
    Concatenate,
    Range,
}

impl fmt::Display for BinaryOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BinaryOp::Add => write!(f, "+"),
            BinaryOp::Subtract => write!(f, "-"),
            BinaryOp::Multiply => write!(f, "*"),
            BinaryOp::Divide => write!(f, "/"),
            BinaryOp::Power => write!(f, "^"),
            BinaryOp::Equal => write!(f, "="),
            BinaryOp::NotEqual => write!(f, "<>"),
            BinaryOp::LessThan => write!(f, "<"),
            BinaryOp::LessThanOrEqual => write!(f, "<="),
            BinaryOp::GreaterThan => write!(f, ">"),
            BinaryOp::GreaterThanOrEqual => write!(f, ">="),
            BinaryOp::Concatenate => write!(f, "&"),
            BinaryOp::Range => write!(f, ":"),
        }
    }
}

/// Unary operators
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnaryOp {
    Plus,
    Minus,
    Not,
    Percent,
}

impl fmt::Display for UnaryOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UnaryOp::Plus => write!(f, "+"),
            UnaryOp::Minus => write!(f, "-"),
            UnaryOp::Not => write!(f, "NOT"),
            UnaryOp::Percent => write!(f, "%"),
        }
    }
}

/// Expression types for the formula AST
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Expr {
    Empty,
    Bool(bool),
    Num(f64),
    Text(String),
    Date(NaiveDateTime),
    CellRef(CellRef),
    RangeRef(RangeRef),
    NamedRange(String),
    Binary {
        op: BinaryOp,
        lhs: Box<Expr>,
        rhs: Box<Expr>,
    },
    Unary {
        op: UnaryOp,
        operand: Box<Expr>,
    },
    Func {
        name: String,
        args: Vec<Expr>,
    },
    Array(Vec<Vec<Expr>>),
    Error(CellErr),
}

impl fmt::Display for Expr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Expr::Empty => write!(f, ""),
            Expr::Bool(b) => write!(f, "{b}"),
            Expr::Num(n) => {
                if n.fract() == 0.0 {
                    write!(f, "{}", *n as i64)
                } else {
                    write!(f, "{n}")
                }
            }
            Expr::Text(s) => write!(f, "\"{s}\""),
            Expr::Date(d) => write!(f, "{d}"),
            Expr::CellRef(cell) => write!(f, "{cell}"),
            Expr::RangeRef(range) => write!(f, "{range}"),
            Expr::NamedRange(name) => write!(f, "{name}"),
            Expr::Binary { op, lhs, rhs } => {
                write!(f, "{lhs} {op} {rhs}")
            }
            Expr::Unary { op, operand } => match op {
                UnaryOp::Not => write!(f, "NOT {operand}"),
                UnaryOp::Percent => write!(f, "{operand}%"),
                _ => write!(f, "{op}{operand}"),
            },
            Expr::Func { name, args } => {
                write!(f, "{name}(")?;
                for (i, arg) in args.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "{arg}")?;
                }
                write!(f, ")")
            }
            Expr::Array(rows) => {
                write!(f, "{{")?;
                for (i, row) in rows.iter().enumerate() {
                    if i > 0 {
                        write!(f, "; ")?;
                    }
                    for (j, expr) in row.iter().enumerate() {
                        if j > 0 {
                            write!(f, ", ")?;
                        }
                        write!(f, "{expr}")?;
                    }
                }
                write!(f, "}}")
            }
            Expr::Error(e) => write!(f, "{e}"),
        }
    }
}

/// Convert a column index (0-based) to A1 notation (1-based)
pub fn col_to_a1(col: u32) -> String {
    let mut col_index = col + 1;
    let mut result = String::new();

    while col_index > 0 {
        col_index -= 1;
        let c = (col_index % 26) as u8 + b'A';
        result.insert(0, c as char);
        col_index /= 26;
    }

    result
}

/// Convert A1 column notation to index (0-based)
pub fn a1_to_col(s: &str) -> Result<u32, FormulaError> {
    // Excel columns are at most 3 letters (A..XFD = 1..16383). Reject longer
    // runs so names like ATAN2 are not misread as a column "ATAN" + row 2.
    if s.len() > 3 {
        return Err(FormulaError::InvalidReference(format!(
            "Invalid column: {s}"
        )));
    }
    let mut col = 0;

    for c in s.chars() {
        if !c.is_ascii_alphabetic() || !c.is_ascii_uppercase() {
            return Err(FormulaError::InvalidReference(format!(
                "Invalid column: {s}"
            )));
        }
        col = col * 26 + (c as u32 - 'A' as u32 + 1);
    }

    Ok(col - 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_col_to_a1() {
        assert_eq!(col_to_a1(0), "A");
        assert_eq!(col_to_a1(25), "Z");
        assert_eq!(col_to_a1(26), "AA");
        assert_eq!(col_to_a1(27), "AB");
        assert_eq!(col_to_a1(51), "AZ");
        assert_eq!(col_to_a1(52), "BA");
    }

    #[test]
    fn test_a1_to_col() {
        assert_eq!(a1_to_col("A").unwrap(), 0);
        assert_eq!(a1_to_col("Z").unwrap(), 25);
        assert_eq!(a1_to_col("AA").unwrap(), 26);
        assert_eq!(a1_to_col("AB").unwrap(), 27);
        assert_eq!(a1_to_col("AZ").unwrap(), 51);
        assert_eq!(a1_to_col("BA").unwrap(), 52);
    }

    #[test]
    fn test_cell_ref_display() {
        let ref_a1 = CellRef::a1(None, 0, 0);
        assert_eq!(format!("{}", ref_a1), "A1");

        let ref_sheet = CellRef::a1(Some("Sheet1".to_string()), 0, 0);
        assert_eq!(format!("{}", ref_sheet), "Sheet1!A1");
    }
}
