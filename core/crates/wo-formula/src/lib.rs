//! World-Office Formula Engine
//!
//! A pure Rust implementation of Excel-style formula parsing and evaluation.

pub mod ast;
pub mod lexer;
pub mod parser;

pub use ast::{
    a1_to_col, CellErr, CellRef, CellRefCoord, CellValue, Expr, FormulaError, RangeRef, RefStyle,
};
pub use lexer::{Lexer, Token};
pub use parser::parse;

/// Sheet trait for formula evaluation.
pub trait Sheet {
    fn cell(&self, row: u32, col: u32) -> Option<&CellValue>;
    fn cell_mut(&mut self, row: u32, col: u32) -> Option<&mut CellValue>;
    fn range(&self, start_row: u32, start_col: u32, end_row: u32, end_col: u32) -> Vec<&CellValue>;
}

/// Evaluate an expression against a sheet.
pub fn eval(expr: &Expr, sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    eval_expr(expr, sheet)
}

fn eval_expr(expr: &Expr, sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    match expr {
        Expr::Empty => Ok(CellValue::Empty),
        Expr::Bool(b) => Ok(CellValue::Bool(*b)),
        Expr::Num(n) => Ok(CellValue::Num(*n)),
        Expr::Text(s) => Ok(CellValue::Text(s.clone())),
        Expr::Error(e) => Ok(CellValue::Err(e.clone())),
        Expr::Date(d) => Ok(CellValue::Date(*d)),

        Expr::CellRef(cell_ref) => {
            let (row, col) = cell_ref.resolve(0, 0);
            sheet.cell(row, col)
                .cloned()
                .ok_or(FormulaError::RefError)
        }
        Expr::RangeRef(range_ref) => {
            let (start_row, start_col) = range_ref.start.resolve(0, 0);
            let (end_row, end_col) = range_ref.end.resolve(0, 0);
            let cells = sheet.range(start_row, start_col, end_row, end_col);
            if cells.is_empty() {
                Ok(CellValue::Empty)
            } else {
                Ok(cells[0].clone())
            }
        }
        Expr::NamedRange(name) => Err(FormulaError::NameError),

        Expr::Unary { op, operand } => {
            let value = eval_expr(operand, sheet)?;
            match (op, value) {
                (crate::ast::UnaryOp::Plus, CellValue::Num(n)) => Ok(CellValue::Num(n)),
                (crate::ast::UnaryOp::Plus, CellValue::Text(s)) => Ok(CellValue::Text(s)),
                (crate::ast::UnaryOp::Minus, CellValue::Num(n)) => Ok(CellValue::Num(-n)),
                (crate::ast::UnaryOp::Not, CellValue::Bool(b)) => Ok(CellValue::Bool(!b)),
                (crate::ast::UnaryOp::Not, CellValue::Num(n)) => Ok(CellValue::Bool(n == 0.0)),
                (crate::ast::UnaryOp::Percent, CellValue::Num(n)) => Ok(CellValue::Num(n / 100.0)),
                _ => Err(FormulaError::TypeMismatch("Unary operator type mismatch".to_string())),
            }
        }

        Expr::Binary { op, lhs, rhs } => {
            let left = eval_expr(lhs, sheet)?;
            let right = eval_expr(rhs, sheet)?;

            match (op, left, right) {
                (crate::ast::BinaryOp::Add, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Num(a + b)),
                (crate::ast::BinaryOp::Subtract, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Num(a - b)),
                (crate::ast::BinaryOp::Multiply, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Num(a * b)),
                (crate::ast::BinaryOp::Divide, CellValue::Num(a), CellValue::Num(b)) => {
                    if b == 0.0 {
                        Ok(CellValue::Err(CellErr::DivByZero))
                    } else {
                        Ok(CellValue::Num(a / b))
                    }
                }
                (crate::ast::BinaryOp::Power, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Num(a.powf(b))),
                (crate::ast::BinaryOp::Concatenate, CellValue::Text(a), CellValue::Text(b)) => {
                    Ok(CellValue::Text(a + &b))
                }
                (crate::ast::BinaryOp::Concatenate, CellValue::Text(a), CellValue::Num(b)) => {
                    Ok(CellValue::Text(a + &b.to_string()))
                }
                (crate::ast::BinaryOp::Concatenate, CellValue::Num(a), CellValue::Text(b)) => {
                    Ok(CellValue::Text(a.to_string() + &b))
                }
                (crate::ast::BinaryOp::Equal, a, b) => Ok(CellValue::Bool(a == b)),
                (crate::ast::BinaryOp::NotEqual, a, b) => Ok(CellValue::Bool(a != b)),
                (crate::ast::BinaryOp::LessThan, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Bool(a < b)),
                (crate::ast::BinaryOp::LessThanOrEqual, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Bool(a <= b)),
                (crate::ast::BinaryOp::GreaterThan, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Bool(a > b)),
                (crate::ast::BinaryOp::GreaterThanOrEqual, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Bool(a >= b)),
                (crate::ast::BinaryOp::Range, _, _) => Ok(CellValue::Empty),
                _ => Err(FormulaError::TypeMismatch("Binary operator type mismatch".to_string())),
            }
        }
        Expr::Func { name, args } => eval_function(name, args, sheet),
        Expr::Array(_) => Err(FormulaError::InvalidToken("Array evaluation not yet implemented".to_string())),
    }
}

fn eval_function(name: &str, args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    match name.to_uppercase().as_str() {
        "SUM" => {
            let mut sum = 0.0;
            for arg in args {
                let value = eval_expr(arg, sheet)?;
                if let CellValue::Num(n) = value {
                    sum += n;
                }
            }
            Ok(CellValue::Num(sum))
        }
        "AVERAGE" | "AVG" => {
            let mut sum = 0.0;
            let mut count = 0.0;
            for arg in args {
                let value = eval_expr(arg, sheet)?;
                if let CellValue::Num(n) = value {
                    sum += n;
                    count += 1.0;
                }
            }
            if count == 0.0 {
                Ok(CellValue::Err(CellErr::DivByZero))
            } else {
                Ok(CellValue::Num(sum / count))
            }
        }
        "MIN" => {
            let mut min = f64::INFINITY;
            for arg in args {
                let value = eval_expr(arg, sheet)?;
                if let CellValue::Num(n) = value {
                    min = min.min(n);
                }
            }
            if min == f64::INFINITY {
                Ok(CellValue::Empty)
            } else {
                Ok(CellValue::Num(min))
            }
        }
        "MAX" => {
            let mut max = f64::NEG_INFINITY;
            for arg in args {
                let value = eval_expr(arg, sheet)?;
                if let CellValue::Num(n) = value {
                    max = max.max(n);
                }
            }
            if max == f64::NEG_INFINITY {
                Ok(CellValue::Empty)
            } else {
                Ok(CellValue::Num(max))
            }
        }
        "COUNT" => {
            let mut count = 0.0;
            for arg in args {
                let value = eval_expr(arg, sheet)?;
                if let CellValue::Num(_) = value {
                    count += 1.0;
                }
            }
            Ok(CellValue::Num(count))
        }
        "IF" => {
            if args.len() >= 2 {
                let condition = eval_expr(&args[0], sheet)?;
                let is_true = match condition {
                    CellValue::Bool(true) => true,
                    CellValue::Bool(false) => false,
                    CellValue::Num(0.0) => false,
                    CellValue::Text(ref s) if s.is_empty() => false,
                    _ => true,
                };
                if is_true {
                    Ok(eval_expr(&args[1], sheet)?.clone())
                } else if args.len() >= 3 {
                    Ok(eval_expr(&args[2], sheet)?.clone())
                } else {
                    Ok(CellValue::Empty)
                }
            } else {
                Err(FormulaError::WrongArgCount {
                    func: name.to_string(),
                    expected: 2,
                    actual: args.len(),
                })
            }
        }
        "AND" => {
            let mut result = true;
            for arg in args {
                let value = eval_expr(arg, sheet)?;
                let b = match value {
                    CellValue::Bool(b) => b,
                    CellValue::Num(n) => n != 0.0,
                    CellValue::Text(s) => !s.is_empty(),
                    CellValue::Empty => false,
                    CellValue::Err(_) => return Ok(CellValue::Err(CellErr::Value)),
                    _ => true,
                };
                result = result && b;
            }
            Ok(CellValue::Bool(result))
        }
        "OR" => {
            let mut result = false;
            for arg in args {
                let value = eval_expr(arg, sheet)?;
                let b = match value {
                    CellValue::Bool(b) => b,
                    CellValue::Num(n) => n != 0.0,
                    CellValue::Text(s) => !s.is_empty(),
                    CellValue::Empty => false,
                    CellValue::Err(_) => return Ok(CellValue::Err(CellErr::Value)),
                    _ => false,
                };
                result = result || b;
            }
            Ok(CellValue::Bool(result))
        }
        "NOT" => {
            if args.len() == 1 {
                let value = eval_expr(&args[0], sheet)?;
                let b = match value {
                    CellValue::Bool(b) => !b,
                    CellValue::Num(n) => n == 0.0,
                    CellValue::Text(s) => s.is_empty(),
                    CellValue::Empty => true,
                    _ => false,
                };
                Ok(CellValue::Bool(b))
            } else {
                Err(FormulaError::WrongArgCount {
                    func: name.to_string(),
                    expected: 1,
                    actual: args.len(),
                })
            }
        }
        _ => Err(FormulaError::FunctionNotFound(name.to_string())),
    }
}

/// Recalculate all formulas in a sheet.
pub fn recalc_all(_sheet: &mut impl Sheet) -> Result<(), FormulaError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestSheet {
        data: std::collections::HashMap<(u32, u32), CellValue>,
    }

    impl TestSheet {
        fn new() -> Self {
            Self {
                data: std::collections::HashMap::new(),
            }
        }
        fn set(&mut self, row: u32, col: u32, value: CellValue) {
            self.data.insert((row, col), value);
        }
    }

    impl Sheet for TestSheet {
        fn cell(&self, row: u32, col: u32) -> Option<&CellValue> {
            self.data.get(&(row, col))
        }
        fn cell_mut(&mut self, row: u32, col: u32) -> Option<&mut CellValue> {
            self.data.get_mut(&(row, col))
        }
        fn range(&self, start_row: u32, start_col: u32, end_row: u32, end_col: u32) -> Vec<&CellValue> {
            let mut result = Vec::new();
            for row in start_row..=end_row {
                for col in start_col..=end_col {
                    if let Some(value) = self.data.get(&(row, col)) {
                        result.push(value);
                    }
                }
            }
            result
        }
    }

    #[test]
    fn test_eval_number() {
        let sheet = TestSheet::new();
        let expr = parse("123").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(123.0));
    }

    #[test]
    fn test_eval_addition() {
        let sheet = TestSheet::new();
        let expr = parse("2+3").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(5.0));
    }

    #[test]
    fn test_eval_function_sum() {
        let sheet = TestSheet::new();
        let expr = parse("SUM(1,2,3)").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(6.0));
    }
}
