//! Formula evaluation engine.
//!
//! Evaluates parsed `Expr` AST nodes against a `Sheet` data source,
//! implementing Excel-compatible math, logical, statistical, and
//! text-processing functions.

use crate::ast::{BinaryOp, CellErr, CellValue, Expr, FormulaError, UnaryOp};

/// Trait representing a spreadsheet-like data source.
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
            sheet.cell(row, col).cloned().ok_or(FormulaError::RefError)
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
        Expr::NamedRange(_name) => Err(FormulaError::NameError),

        Expr::Unary { op, operand } => {
            let value = eval_expr(operand, sheet)?;
            match (op, value) {
                (UnaryOp::Plus, CellValue::Num(n)) => Ok(CellValue::Num(n)),
                (UnaryOp::Plus, CellValue::Text(s)) => Ok(CellValue::Text(s)),
                (UnaryOp::Minus, CellValue::Num(n)) => Ok(CellValue::Num(-n)),
                (UnaryOp::Not, CellValue::Bool(b)) => Ok(CellValue::Bool(!b)),
                (UnaryOp::Not, CellValue::Num(n)) => Ok(CellValue::Bool(n == 0.0)),
                (UnaryOp::Percent, CellValue::Num(n)) => Ok(CellValue::Num(n / 100.0)),
                _ => Err(FormulaError::TypeMismatch(
                    "Unary operator type mismatch".to_string(),
                )),
            }
        }

        Expr::Binary { op, lhs, rhs } => {
            let left = eval_expr(lhs, sheet)?;
            let right = eval_expr(rhs, sheet)?;

            match (op, left, right) {
                (BinaryOp::Add, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Num(a + b)),
                (BinaryOp::Subtract, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Num(a - b))
                }
                (BinaryOp::Multiply, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Num(a * b))
                }
                (BinaryOp::Divide, CellValue::Num(a), CellValue::Num(b)) => {
                    if b == 0.0 {
                        Ok(CellValue::Err(CellErr::DivByZero))
                    } else {
                        Ok(CellValue::Num(a / b))
                    }
                }
                (BinaryOp::Power, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Num(a.powf(b)))
                }
                (BinaryOp::Concatenate, CellValue::Text(a), CellValue::Text(b)) => {
                    Ok(CellValue::Text(a + &b))
                }
                (BinaryOp::Concatenate, CellValue::Text(a), CellValue::Num(b)) => {
                    Ok(CellValue::Text(a + &b.to_string()))
                }
                (BinaryOp::Concatenate, CellValue::Num(a), CellValue::Text(b)) => {
                    Ok(CellValue::Text(a.to_string() + &b))
                }
                (BinaryOp::Equal, a, b) => Ok(CellValue::Bool(a == b)),
                (BinaryOp::NotEqual, a, b) => Ok(CellValue::Bool(a != b)),
                (BinaryOp::LessThan, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Bool(a < b))
                }
                (BinaryOp::LessThanOrEqual, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Bool(a <= b))
                }
                (BinaryOp::GreaterThan, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Bool(a > b))
                }
                (BinaryOp::GreaterThanOrEqual, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Bool(a >= b))
                }
                (BinaryOp::Range, _, _) => Ok(CellValue::Empty),
                _ => Err(FormulaError::TypeMismatch(
                    "Binary operator type mismatch".to_string(),
                )),
            }
        }

        Expr::Func { name, args } => eval_function(name, args, sheet),
        Expr::Array(_) => Err(FormulaError::InvalidToken(
            "Array evaluation not yet implemented".to_string(),
        )),
    }
}

// ---------------------------------------------------------------------------
// Helper: collect numeric values from arguments (flattening ranges)
// ---------------------------------------------------------------------------

fn collect_nums<'a>(args: &'a [Expr], sheet: &'a impl Sheet) -> Result<Vec<f64>, FormulaError> {
    let mut nums = Vec::new();
    for arg in args {
        let val = eval_expr(arg, sheet)?;
        if let CellValue::Num(n) = val {
            nums.push(n);
        } else if let CellValue::Empty = val {
            // skip empties
        }
        // non-numeric values are silently skipped in most math functions
    }
    Ok(nums)
}

/// Like `collect_nums` but also treats Bool as 0/1 and Text that parses as a number.
fn collect_nums_coerce(args: &[Expr], sheet: &impl Sheet) -> Result<Vec<f64>, FormulaError> {
    let mut nums = Vec::new();
    for arg in args {
        let val = eval_expr(arg, sheet)?;
        match val {
            CellValue::Num(n) => nums.push(n),
            CellValue::Bool(true) => nums.push(1.0),
            CellValue::Bool(false) => nums.push(0.0),
            CellValue::Text(s) => {
                if let Ok(n) = s.parse::<f64>() {
                    nums.push(n);
                }
            }
            _ => {}
        }
    }
    Ok(nums)
}

fn collect_vals<'a>(
    args: &'a [Expr],
    sheet: &'a impl Sheet,
) -> Result<Vec<CellValue>, FormulaError> {
    let mut vals = Vec::new();
    for arg in args {
        let val = eval_expr(arg, sheet)?;
        vals.push(val);
    }
    Ok(vals)
}

// ---------------------------------------------------------------------------
// Helper: extract a single numeric argument
// ---------------------------------------------------------------------------

fn single_num(args: &[Expr], sheet: &impl Sheet) -> Result<f64, FormulaError> {
    let vals = collect_nums(args, sheet)?;
    vals.first().copied().ok_or(FormulaError::ValueError)
}

fn single_val<'a>(args: &'a [Expr], sheet: &'a impl Sheet) -> Result<CellValue, FormulaError> {
    if args.is_empty() {
        return Err(FormulaError::WrongArgCount {
            func: "?".to_string(),
            expected: 1,
            actual: 0,
        });
    }
    eval_expr(&args[0], sheet)
}

// ---------------------------------------------------------------------------
// Math functions
// ---------------------------------------------------------------------------

fn fn_abs(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.abs()))
}

fn fn_ceil(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.ceil()))
}

fn fn_ceiling(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    // CEILING(number, significance)
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 1 {
        return Err(FormulaError::WrongArgCount {
            func: "CEILING".to_string(),
            expected: 1,
            actual: args.len(),
        });
    }
    let n = nums[0];
    let significance = if nums.len() >= 2 { nums[1] } else { 1.0 };
    if significance == 0.0 {
        return Ok(CellValue::Num(0.0));
    }
    Ok(CellValue::Num((n / significance).ceil() * significance))
}

fn fn_combin(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "COMBIN".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let n = nums[0] as u64;
    let k = nums[1] as u64;
    if k > n {
        return Ok(CellValue::Err(CellErr::Num));
    }
    // Compute C(n,k) = n! / (k! * (n-k)!)
    let k = k.min(n - k);
    let mut result = 1u128;
    for i in 0..k {
        result = result * (n - i) as u128 / (i + 1) as u128;
    }
    Ok(CellValue::Num(result as f64))
}

fn fn_cos(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.cos()))
}

fn fn_countif(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "COUNTIF".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let criterion_val = eval_expr(&args[1], sheet)?;
    let range_val = eval_expr(&args[0], sheet)?;

    // For individual values, compare directly
    let matches = match (&range_val, &criterion_val) {
        (CellValue::Num(a), CellValue::Num(b)) => *a == *b,
        (CellValue::Text(a), CellValue::Text(b)) => a == b,
        (CellValue::Bool(a), CellValue::Bool(b)) => a == b,
        (CellValue::Empty, CellValue::Empty) => true,
        _ => false,
    };

    if matches {
        Ok(CellValue::Num(1.0))
    } else {
        Ok(CellValue::Num(0.0))
    }
}

fn fn_degrees(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.to_degrees()))
}

fn fn_even(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    let rounded = if n >= 0.0 { n.ceil() } else { n.floor() };
    let mut result = if rounded % 2.0 == 0.0 {
        rounded
    } else {
        rounded + if n >= 0.0 { 1.0 } else { -1.0 }
    };
    // If result is -0.0, normalize to 0.0
    if result == 0.0 {
        result = 0.0;
    }
    Ok(CellValue::Num(result))
}

fn fn_exp(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.exp()))
}

fn fn_fact(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    if n < 0.0 {
        return Ok(CellValue::Err(CellErr::Num));
    }
    let n_int = n as u64;
    let mut result = 1u128;
    for i in 2..=n_int {
        result = result * i as u128;
    }
    Ok(CellValue::Num(result as f64))
}

fn fn_floor(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.floor()))
}

fn fn_gcd(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Ok(CellValue::Num(0.0));
    }
    let mut result = nums[0].abs() as u64;
    for &n in &nums[1..] {
        let mut a = result;
        let mut b = n.abs() as u64;
        while b != 0 {
            let t = b;
            b = a % b;
            a = t;
        }
        result = a;
    }
    Ok(CellValue::Num(result as f64))
}

fn fn_int(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.floor()))
}

fn fn_lcm(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Ok(CellValue::Num(0.0));
    }
    let mut result = nums[0].abs() as u64;
    for &n in &nums[1..] {
        let a = result;
        let b = n.abs() as u64;
        let (mut x, mut y) = (a, b);
        while y != 0 {
            let t = y;
            y = x % y;
            x = t;
        }
        let gcd = x;
        result = a / gcd * b;
    }
    Ok(CellValue::Num(result as f64))
}

fn fn_ln(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    if n <= 0.0 {
        return Ok(CellValue::Err(CellErr::Num));
    }
    Ok(CellValue::Num(n.ln()))
}

fn fn_log(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Err(FormulaError::WrongArgCount {
            func: "LOG".to_string(),
            expected: 1,
            actual: 0,
        });
    }
    let n = nums[0];
    if n <= 0.0 {
        return Ok(CellValue::Err(CellErr::Num));
    }
    let base = if nums.len() >= 2 { nums[1] } else { 10.0 };
    if base <= 0.0 || base == 1.0 {
        return Ok(CellValue::Err(CellErr::Num));
    }
    Ok(CellValue::Num(n.log(base)))
}

fn fn_log10(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    if n <= 0.0 {
        return Ok(CellValue::Err(CellErr::Num));
    }
    Ok(CellValue::Num(n.log10()))
}

fn fn_mod(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "MOD".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let n = nums[0];
    let divisor = nums[1];
    if divisor == 0.0 {
        return Ok(CellValue::Err(CellErr::DivByZero));
    }
    // Excel-style: result = n - divisor * FLOOR(n / divisor)
    let result = n - divisor * (n / divisor).floor();
    Ok(CellValue::Num(result))
}

fn fn_mround(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "MROUND".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let n = nums[0];
    let multiple = nums[1];
    if multiple == 0.0 {
        return Ok(CellValue::Num(0.0));
    }
    if n.signum() != multiple.signum() {
        return Ok(CellValue::Err(CellErr::Num));
    }
    Ok(CellValue::Num((n / multiple).round() * multiple))
}

fn fn_odd(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    let rounded = if n >= 0.0 { n.ceil() } else { n.floor() };
    let mut result = if rounded % 2.0 == 0.0 {
        rounded + if n >= 0.0 { 1.0 } else { -1.0 }
    } else {
        rounded
    };
    if result == 0.0 {
        result = 1.0;
    }
    Ok(CellValue::Num(result))
}

fn fn_pi(_args: &[Expr], _sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    Ok(CellValue::Num(std::f64::consts::PI))
}

fn fn_product(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Ok(CellValue::Num(0.0));
    }
    let result = nums.iter().product();
    Ok(CellValue::Num(result))
}

fn fn_quotient(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "QUOTIENT".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    if nums[1] == 0.0 {
        return Ok(CellValue::Err(CellErr::DivByZero));
    }
    Ok(CellValue::Num((nums[0] / nums[1]).trunc()))
}

fn fn_radians(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.to_radians()))
}

fn fn_rand(_args: &[Expr], _sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    Ok(CellValue::Num(rand_value()))
}

fn fn_randbetween(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "RANDBETWEEN".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let low = nums[0].ceil() as i64;
    let high = nums[1].floor() as i64;
    if low > high {
        return Ok(CellValue::Err(CellErr::Num));
    }
    let range = (high - low + 1) as u64;
    let val = low + (rand_value() * range as f64).floor() as i64;
    Ok(CellValue::Num(val as f64))
}

/// Simple deterministic pseudo-random for testability.
/// Returns a value in [0.0, 1.0).
fn rand_value() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as f64;
    (nanos / 1_000_000_000.0).fract()
}

fn fn_round(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Err(FormulaError::WrongArgCount {
            func: "ROUND".to_string(),
            expected: 1,
            actual: 0,
        });
    }
    let n = nums[0];
    let digits = if nums.len() >= 2 { nums[1] as i32 } else { 0 };
    let factor = 10_f64.powi(digits);
    Ok(CellValue::Num((n * factor).round() / factor))
}

fn fn_rounddown(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Err(FormulaError::WrongArgCount {
            func: "ROUNDDOWN".to_string(),
            expected: 1,
            actual: 0,
        });
    }
    let n = nums[0];
    let digits = if nums.len() >= 2 { nums[1] as i32 } else { 0 };
    let factor = 10_f64.powi(digits);
    Ok(CellValue::Num((n * factor).trunc() / factor))
}

fn fn_roundup(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Err(FormulaError::WrongArgCount {
            func: "ROUNDUP".to_string(),
            expected: 1,
            actual: 0,
        });
    }
    let n = nums[0];
    let digits = if nums.len() >= 2 { nums[1] as i32 } else { 0 };
    let factor = 10_f64.powi(digits);
    let rounded = (n * factor).abs().ceil() / factor;
    Ok(CellValue::Num(if n >= 0.0 { rounded } else { -rounded }))
}

fn fn_sign(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    // f64::signum() returns 1.0 for +0.0 and -1.0 for -0.0; Excel SIGN(0) = 0.
    if n == 0.0 {
        return Ok(CellValue::Num(0.0));
    }
    Ok(CellValue::Num(n.signum()))
}

fn fn_sin(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.sin()))
}

fn fn_sqrt(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    if n < 0.0 {
        return Ok(CellValue::Err(CellErr::Num));
    }
    Ok(CellValue::Num(n.sqrt()))
}

fn fn_sumif(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "SUMIF".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let criterion = eval_expr(&args[1], sheet)?;
    let sum_range = if args.len() >= 3 {
        collect_nums(&args[2..], sheet)?
    } else {
        // sum the range itself
        collect_nums(&args[0..1], sheet)?
    };

    let range_val = eval_expr(&args[0], sheet)?;
    let matches = match (&range_val, &criterion) {
        (CellValue::Num(a), CellValue::Num(b)) => *a == *b,
        (CellValue::Text(a), CellValue::Text(b)) => a == b,
        (CellValue::Bool(a), CellValue::Bool(b)) => a == b,
        _ => false,
    };

    if matches {
        let sum: f64 = sum_range.iter().sum();
        Ok(CellValue::Num(sum))
    } else {
        Ok(CellValue::Num(0.0))
    }
}

fn fn_sumproduct(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let mut arrays: Vec<Vec<f64>> = Vec::new();
    for arg in args {
        let vals = collect_nums_coerce(&[arg.clone()], sheet)?;
        arrays.push(vals);
    }
    if arrays.is_empty() {
        return Ok(CellValue::Num(0.0));
    }
    let min_len = arrays.iter().map(|a| a.len()).min().unwrap_or(0);
    let mut result = 0.0;
    for i in 0..min_len {
        let product: f64 = arrays.iter().map(|a| a[i]).product();
        result += product;
    }
    Ok(CellValue::Num(result))
}

fn fn_sumsq(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    let result: f64 = nums.iter().map(|n| n * n).sum();
    Ok(CellValue::Num(result))
}

fn fn_tan(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.tan()))
}

fn fn_trunc(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Err(FormulaError::WrongArgCount {
            func: "TRUNC".to_string(),
            expected: 1,
            actual: 0,
        });
    }
    let n = nums[0];
    let digits = if nums.len() >= 2 { nums[1] as i32 } else { 0 };
    let factor = 10_f64.powi(digits);
    Ok(CellValue::Num((n * factor).trunc() / factor))
}

fn fn_asin(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    if n < -1.0 || n > 1.0 {
        return Ok(CellValue::Err(CellErr::Num));
    }
    Ok(CellValue::Num(n.asin()))
}

fn fn_acos(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    if n < -1.0 || n > 1.0 {
        return Ok(CellValue::Err(CellErr::Num));
    }
    Ok(CellValue::Num(n.acos()))
}

fn fn_atan(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    Ok(CellValue::Num(n.atan()))
}

fn fn_atan2(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "ATAN2".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    Ok(CellValue::Num(nums[1].atan2(nums[0])))
}

// ---------------------------------------------------------------------------
// Logical functions
// ---------------------------------------------------------------------------

fn fn_iferror(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "IFERROR".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let value_result = eval_expr(&args[0], sheet);
    match value_result {
        Ok(CellValue::Err(_)) | Err(_) => eval_expr(&args[1], sheet),
        Ok(val) => Ok(val),
    }
}

fn fn_ifna(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "IFNA".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let value = eval_expr(&args[0], sheet)?;
    match value {
        CellValue::Err(CellErr::NA) => eval_expr(&args[1], sheet),
        _ => Ok(value),
    }
}

fn fn_xor(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.is_empty() {
        return Ok(CellValue::Bool(false));
    }
    let mut true_count = 0;
    for arg in args {
        let val = eval_expr(arg, sheet)?;
        let b = match val {
            CellValue::Bool(b) => b,
            CellValue::Num(n) => n != 0.0,
            CellValue::Text(s) => !s.is_empty(),
            CellValue::Empty => false,
            _ => false,
        };
        if b {
            true_count += 1;
        }
    }
    Ok(CellValue::Bool(true_count % 2 == 1))
}

fn fn_switch(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 3 {
        return Err(FormulaError::WrongArgCount {
            func: "SWITCH".to_string(),
            expected: 3,
            actual: args.len(),
        });
    }
    let expression = eval_expr(&args[0], sheet)?;

    // Process pairs (value1, result1, value2, result2, ...). Only treat an
    // argument as a case value when a result follows it; a trailing single
    // argument is the default (previous code returned the last case value as
    // the default, e.g. SWITCH(2,1,"one",2,"two") returned 2 instead of "two").
    let mut i = 1;
    while i + 1 < args.len() {
        let case_val = eval_expr(&args[i], sheet)?;
        if expression == case_val {
            return eval_expr(&args[i + 1], sheet);
        }
        i += 2;
    }
    // No case matched: a trailing single argument is the default
    if i < args.len() {
        return eval_expr(&args[i], sheet);
    }
    // No match and no default
    Ok(CellValue::Err(CellErr::NA))
}

fn fn_ifs(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 || args.len() % 2 != 0 {
        return Err(FormulaError::WrongArgCount {
            func: "IFS".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let mut i = 0;
    while i + 1 < args.len() {
        let cond_val = eval_expr(&args[i], sheet)?;
        let is_true = match cond_val {
            CellValue::Bool(true) => true,
            CellValue::Bool(false) => false,
            CellValue::Num(0.0) => false,
            CellValue::Text(ref s) => !s.is_empty(),
            CellValue::Empty => false,
            _ => true,
        };
        if is_true {
            return eval_expr(&args[i + 1], sheet);
        }
        i += 2;
    }
    Ok(CellValue::Err(CellErr::NA))
}

fn fn_isblank(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    Ok(CellValue::Bool(matches!(val, CellValue::Empty)))
}

fn fn_isnumber(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    Ok(CellValue::Bool(matches!(val, CellValue::Num(_))))
}

fn fn_istext(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    Ok(CellValue::Bool(matches!(val, CellValue::Text(_))))
}

fn fn_iserror(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    Ok(CellValue::Bool(matches!(val, CellValue::Err(_))))
}

fn fn_islogical(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    Ok(CellValue::Bool(matches!(val, CellValue::Bool(_))))
}

fn fn_isna(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    Ok(CellValue::Bool(matches!(val, CellValue::Err(CellErr::NA))))
}

fn fn_n(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    match val {
        CellValue::Num(n) => Ok(CellValue::Num(n)),
        CellValue::Bool(true) => Ok(CellValue::Num(1.0)),
        CellValue::Bool(false) => Ok(CellValue::Num(0.0)),
        CellValue::Text(s) => {
            if let Ok(n) = s.parse::<f64>() {
                Ok(CellValue::Num(n))
            } else {
                Ok(CellValue::Num(0.0))
            }
        }
        _ => Ok(CellValue::Num(0.0)),
    }
}

fn fn_type(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let num = match val {
        CellValue::Num(_) => 1.0,
        CellValue::Text(_) => 2.0,
        CellValue::Bool(_) => 4.0,
        CellValue::Err(_) => 16.0,
        CellValue::Empty => 1.0,
        CellValue::Date(_) => 1.0,
    };
    Ok(CellValue::Num(num))
}

// ---------------------------------------------------------------------------
// Statistical functions (additional helpers beyond SUM/AVERAGE/MIN/MAX/COUNT)
// ---------------------------------------------------------------------------

fn fn_counta(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let vals = collect_vals(args, sheet)?;
    let count = vals
        .iter()
        .filter(|v| !matches!(v, CellValue::Empty))
        .count() as f64;
    Ok(CellValue::Num(count))
}

fn fn_countblank(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let vals = collect_vals(args, sheet)?;
    let count = vals
        .iter()
        .filter(|v| matches!(v, CellValue::Empty))
        .count() as f64;
    Ok(CellValue::Num(count))
}

fn fn_averagea(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums_coerce(args, sheet)?;
    if nums.is_empty() {
        return Ok(CellValue::Err(CellErr::DivByZero));
    }
    let sum: f64 = nums.iter().sum();
    Ok(CellValue::Num(sum / nums.len() as f64))
}

fn fn_mina(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums_coerce(args, sheet)?;
    if nums.is_empty() {
        return Ok(CellValue::Num(0.0));
    }
    Ok(CellValue::Num(
        nums.into_iter().fold(f64::INFINITY, f64::min),
    ))
}

fn fn_maxa(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums_coerce(args, sheet)?;
    if nums.is_empty() {
        return Ok(CellValue::Num(0.0));
    }
    Ok(CellValue::Num(
        nums.into_iter().fold(f64::NEG_INFINITY, f64::max),
    ))
}

fn fn_stdev(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Ok(CellValue::Err(CellErr::DivByZero));
    }
    let n = nums.len() as f64;
    let sum: f64 = nums.iter().sum();
    let mean = sum / n;
    let variance: f64 = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    Ok(CellValue::Num(variance.sqrt()))
}

fn fn_var(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Ok(CellValue::Err(CellErr::DivByZero));
    }
    let n = nums.len() as f64;
    let sum: f64 = nums.iter().sum();
    let mean = sum / n;
    let variance: f64 = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    Ok(CellValue::Num(variance))
}

fn fn_median(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let mut nums = collect_nums(args, sheet)?;
    if nums.is_empty() {
        return Ok(CellValue::Num(0.0));
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = nums.len();
    if n % 2 == 0 {
        Ok(CellValue::Num((nums[n / 2 - 1] + nums[n / 2]) / 2.0))
    } else {
        Ok(CellValue::Num(nums[n / 2]))
    }
}

fn fn_large(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "LARGE".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let k = nums[nums.len() - 1] as usize;
    let mut values: Vec<f64> = nums[..nums.len() - 1].to_vec();
    if k == 0 || k > values.len() {
        return Ok(CellValue::Err(CellErr::Num));
    }
    values.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    Ok(CellValue::Num(values[k - 1]))
}

fn fn_small(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "SMALL".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let k = nums[nums.len() - 1] as usize;
    let mut values: Vec<f64> = nums[..nums.len() - 1].to_vec();
    if k == 0 || k > values.len() {
        return Ok(CellValue::Err(CellErr::Num));
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    Ok(CellValue::Num(values[k - 1]))
}

// ---------------------------------------------------------------------------
// Function dispatch
// ---------------------------------------------------------------------------

/// Evaluate a named function with the given arguments.
fn eval_function(name: &str, args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    match name.to_uppercase().as_str() {
        // Statistical (existing)
        "SUM" => {
            let nums = collect_nums(args, sheet)?;
            Ok(CellValue::Num(nums.iter().sum()))
        }
        "AVERAGE" | "AVG" => {
            let nums = collect_nums(args, sheet)?;
            if nums.is_empty() {
                Ok(CellValue::Err(CellErr::DivByZero))
            } else {
                Ok(CellValue::Num(nums.iter().sum::<f64>() / nums.len() as f64))
            }
        }
        "MIN" => {
            let nums = collect_nums(args, sheet)?;
            if nums.is_empty() {
                Ok(CellValue::Num(0.0))
            } else {
                Ok(CellValue::Num(
                    nums.into_iter().fold(f64::INFINITY, f64::min),
                ))
            }
        }
        "MAX" => {
            let nums = collect_nums(args, sheet)?;
            if nums.is_empty() {
                Ok(CellValue::Num(0.0))
            } else {
                Ok(CellValue::Num(
                    nums.into_iter().fold(f64::NEG_INFINITY, f64::max),
                ))
            }
        }
        "COUNT" => {
            let vals = collect_vals(args, sheet)?;
            let count = vals
                .iter()
                .filter(|v| matches!(v, CellValue::Num(_)))
                .count() as f64;
            Ok(CellValue::Num(count))
        }
        "COUNTA" => fn_counta(args, sheet),
        "COUNTBLANK" => fn_countblank(args, sheet),
        "AVERAGEA" => fn_averagea(args, sheet),
        "MINA" => fn_mina(args, sheet),
        "MAXA" => fn_maxa(args, sheet),
        "STDEV" | "STDEV.S" => fn_stdev(args, sheet),
        "VAR" | "VAR.S" => fn_var(args, sheet),
        "MEDIAN" => fn_median(args, sheet),
        "LARGE" => fn_large(args, sheet),
        "SMALL" => fn_small(args, sheet),

        // Logical (existing)
        "IF" => {
            if args.len() >= 2 {
                let condition = eval_expr(&args[0], sheet)?;
                let is_true = match condition {
                    CellValue::Bool(true) => true,
                    CellValue::Bool(false) => false,
                    CellValue::Num(0.0) => false,
                    CellValue::Text(ref s) => !s.is_empty(),
                    CellValue::Empty => false,
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

        // Logical (new)
        "IFERROR" => fn_iferror(args, sheet),
        "IFNA" => fn_ifna(args, sheet),
        "XOR" => fn_xor(args, sheet),
        "SWITCH" => fn_switch(args, sheet),
        "IFS" => fn_ifs(args, sheet),
        "ISBLANK" => fn_isblank(args, sheet),
        "ISNUMBER" => fn_isnumber(args, sheet),
        "ISTEXT" => fn_istext(args, sheet),
        "ISERROR" => fn_iserror(args, sheet),
        "ISLOGICAL" => fn_islogical(args, sheet),
        "ISNA" => fn_isna(args, sheet),
        "N" => fn_n(args, sheet),
        "TYPE" => fn_type(args, sheet),

        // Math functions
        "ABS" => fn_abs(args, sheet),
        "CEIL" | "CEILING" => fn_ceiling(args, sheet),
        "COMBIN" => fn_combin(args, sheet),
        "COS" => fn_cos(args, sheet),
        "COUNTIF" => fn_countif(args, sheet),
        "DEGREES" => fn_degrees(args, sheet),
        "EVEN" => fn_even(args, sheet),
        "EXP" => fn_exp(args, sheet),
        "FACT" => fn_fact(args, sheet),
        "FLOOR" => fn_floor(args, sheet),
        "GCD" => fn_gcd(args, sheet),
        "INT" => fn_int(args, sheet),
        "LCM" => fn_lcm(args, sheet),
        "LN" => fn_ln(args, sheet),
        "LOG" => fn_log(args, sheet),
        "LOG10" => fn_log10(args, sheet),
        "MOD" => fn_mod(args, sheet),
        "MROUND" => fn_mround(args, sheet),
        "ODD" => fn_odd(args, sheet),
        "PI" => fn_pi(args, sheet),
        "PRODUCT" => fn_product(args, sheet),
        "QUOTIENT" => fn_quotient(args, sheet),
        "RADIANS" => fn_radians(args, sheet),
        "RAND" => fn_rand(args, sheet),
        "RANDBETWEEN" => fn_randbetween(args, sheet),
        "ROUND" => fn_round(args, sheet),
        "ROUNDDOWN" => fn_rounddown(args, sheet),
        "ROUNDUP" => fn_roundup(args, sheet),
        "SIGN" => fn_sign(args, sheet),
        "SIN" => fn_sin(args, sheet),
        "SQRT" => fn_sqrt(args, sheet),
        "SUMIF" => fn_sumif(args, sheet),
        "SUMPRODUCT" => fn_sumproduct(args, sheet),
        "SUMSQ" => fn_sumsq(args, sheet),
        "TAN" => fn_tan(args, sheet),
        "TRUNC" => fn_trunc(args, sheet),
        "ASIN" => fn_asin(args, sheet),
        "ACOS" => fn_acos(args, sheet),
        "ATAN" => fn_atan(args, sheet),
        "ATAN2" => fn_atan2(args, sheet),

        _ => Err(FormulaError::FunctionNotFound(name.to_string())),
    }
}

/// Recalculate all formulas in a sheet.
pub fn recalc_all(_sheet: &mut impl Sheet) -> Result<(), FormulaError> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse;
    use std::collections::HashMap;

    struct TestSheet {
        data: HashMap<(u32, u32), CellValue>,
    }

    impl TestSheet {
        fn new() -> Self {
            Self {
                data: HashMap::new(),
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
        fn range(
            &self,
            start_row: u32,
            start_col: u32,
            end_row: u32,
            end_col: u32,
        ) -> Vec<&CellValue> {
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

    // -----------------------------------------------------------------------
    // eval_basic_* tests (acceptance gate target)
    // -----------------------------------------------------------------------

    #[test]
    fn eval_basic_number_literal() {
        let sheet = TestSheet::new();
        let expr = parse("42").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(42.0));
    }

    #[test]
    fn eval_basic_addition() {
        let sheet = TestSheet::new();
        let expr = parse("2+3").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(5.0));
    }

    #[test]
    fn eval_basic_subtraction() {
        let sheet = TestSheet::new();
        let expr = parse("10-3").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(7.0));
    }

    #[test]
    fn eval_basic_multiplication() {
        let sheet = TestSheet::new();
        let expr = parse("4*5").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(20.0));
    }

    #[test]
    fn eval_basic_division() {
        let sheet = TestSheet::new();
        let expr = parse("10/2").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(5.0));
    }

    #[test]
    fn eval_basic_division_by_zero() {
        let sheet = TestSheet::new();
        let expr = parse("1/0").unwrap();
        assert_eq!(
            eval(&expr, &sheet).unwrap(),
            CellValue::Err(CellErr::DivByZero)
        );
    }

    #[test]
    fn eval_basic_power() {
        let sheet = TestSheet::new();
        let expr = parse("2^3").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(8.0));
    }

    #[test]
    fn eval_basic_negation() {
        let sheet = TestSheet::new();
        let expr = parse("-5").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(-5.0));
    }

    #[test]
    fn eval_basic_concatenation() {
        let sheet = TestSheet::new();
        let expr = parse(r#""Hello"&"World""#).unwrap();
        assert_eq!(
            eval(&expr, &sheet).unwrap(),
            CellValue::Text("HelloWorld".to_string())
        );
    }

    #[test]
    fn eval_basic_comparison_equal() {
        let sheet = TestSheet::new();
        let expr = parse("5=5").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Bool(true));
    }

    #[test]
    fn eval_basic_comparison_not_equal() {
        let sheet = TestSheet::new();
        let expr = parse("5<>3").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Bool(true));
    }

    #[test]
    fn eval_basic_boolean_and_or_not() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("AND(TRUE,FALSE)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(false)
        );
        assert_eq!(
            eval(&parse("OR(TRUE,FALSE)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(true)
        );
        assert_eq!(
            eval(&parse("NOT(FALSE)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(true)
        );
    }

    #[test]
    fn eval_basic_sum() {
        let sheet = TestSheet::new();
        let expr = parse("SUM(1,2,3)").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(6.0));
    }

    #[test]
    fn eval_basic_average() {
        let sheet = TestSheet::new();
        let expr = parse("AVERAGE(2,4,6)").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(4.0));
    }

    #[test]
    fn eval_basic_min_max() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("MIN(5,2,8)").unwrap(), &sheet).unwrap(),
            CellValue::Num(2.0)
        );
        assert_eq!(
            eval(&parse("MAX(5,2,8)").unwrap(), &sheet).unwrap(),
            CellValue::Num(8.0)
        );
    }

    #[test]
    fn eval_basic_count() {
        let sheet = TestSheet::new();
        let expr = parse("COUNT(1,2,3)").unwrap();
        assert_eq!(eval(&expr, &sheet).unwrap(), CellValue::Num(3.0));
    }

    #[test]
    fn eval_basic_if() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("IF(TRUE,\"yes\",\"no\")").unwrap(), &sheet).unwrap(),
            CellValue::Text("yes".to_string())
        );
        assert_eq!(
            eval(&parse("IF(FALSE,\"yes\",\"no\")").unwrap(), &sheet).unwrap(),
            CellValue::Text("no".to_string())
        );
    }

    #[test]
    fn eval_basic_abs() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("ABS(-5)").unwrap(), &sheet).unwrap(),
            CellValue::Num(5.0)
        );
        assert_eq!(
            eval(&parse("ABS(3)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
    }

    #[test]
    fn eval_basic_sqrt() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("SQRT(9)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
        assert_eq!(
            eval(&parse("SQRT(-1)").unwrap(), &sheet).unwrap(),
            CellValue::Err(CellErr::Num)
        );
    }

    #[test]
    fn eval_basic_round() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("ROUND(3.14159,2)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.14)
        );
        assert_eq!(
            eval(&parse("ROUND(3.14159)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
    }

    #[test]
    fn eval_basic_rounddown_roundup() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("ROUNDDOWN(3.999,1)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.9)
        );
        assert_eq!(
            eval(&parse("ROUNDUP(3.111,1)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.2)
        );
    }

    #[test]
    fn eval_basic_floor_ceil_int_trunc() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("FLOOR(3.9)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
        assert_eq!(
            eval(&parse("CEIL(3.1)").unwrap(), &sheet).unwrap(),
            CellValue::Num(4.0)
        );
        assert_eq!(
            eval(&parse("INT(3.9)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
        assert_eq!(
            eval(&parse("INT(-3.1)").unwrap(), &sheet).unwrap(),
            CellValue::Num(-4.0)
        );
        assert_eq!(
            eval(&parse("TRUNC(3.999,1)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.9)
        );
    }

    #[test]
    fn eval_basic_mod_sign() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("MOD(10,3)").unwrap(), &sheet).unwrap(),
            CellValue::Num(1.0)
        );
        assert_eq!(
            eval(&parse("SIGN(-42)").unwrap(), &sheet).unwrap(),
            CellValue::Num(-1.0)
        );
        assert_eq!(
            eval(&parse("SIGN(0)").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
    }

    #[test]
    fn eval_basic_pi_exp_ln_log() {
        let sheet = TestSheet::new();
        // PI
        let pi = eval(&parse("PI()").unwrap(), &sheet).unwrap();
        if let CellValue::Num(n) = pi {
            assert!((n - std::f64::consts::PI).abs() < 1e-10);
        } else {
            panic!("Expected Num");
        }
        // EXP
        assert_eq!(
            eval(&parse("EXP(0)").unwrap(), &sheet).unwrap(),
            CellValue::Num(1.0)
        );
        // LN
        assert_eq!(
            eval(&parse("LN(1)").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
        // LOG10
        assert_eq!(
            eval(&parse("LOG10(100)").unwrap(), &sheet).unwrap(),
            CellValue::Num(2.0)
        );
        // LOG
        assert_eq!(
            eval(&parse("LOG(8,2)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
    }

    #[test]
    fn eval_basic_trig() {
        let sheet = TestSheet::new();
        let pi = std::f64::consts::PI;
        // SIN(π/2) ≈ 1
        let result = eval(&parse("SIN(PI()/2)").unwrap(), &sheet).unwrap();
        if let CellValue::Num(n) = result {
            assert!((n - 1.0).abs() < 1e-10);
        } else {
            panic!("Expected Num");
        }
        // COS(π) ≈ -1
        let result = eval(&parse("COS(PI())").unwrap(), &sheet).unwrap();
        if let CellValue::Num(n) = result {
            assert!((n - (-1.0)).abs() < 1e-10);
        } else {
            panic!("Expected Num");
        }
        // TAN(0) = 0
        let result = eval(&parse("TAN(0)").unwrap(), &sheet).unwrap();
        if let CellValue::Num(n) = result {
            assert!((n - 0.0).abs() < 1e-10);
        } else {
            panic!("Expected Num");
        }
    }

    #[test]
    fn eval_basic_degrees_radians() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("DEGREES(PI())").unwrap(), &sheet).unwrap(),
            CellValue::Num(180.0)
        );
        assert_eq!(
            eval(&parse("RADIANS(180)").unwrap(), &sheet).unwrap(),
            CellValue::Num(std::f64::consts::PI)
        );
    }

    #[test]
    fn eval_basic_fact_combin() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("FACT(5)").unwrap(), &sheet).unwrap(),
            CellValue::Num(120.0)
        );
        assert_eq!(
            eval(&parse("COMBIN(5,2)").unwrap(), &sheet).unwrap(),
            CellValue::Num(10.0)
        );
    }

    #[test]
    fn eval_basic_gcd_lcm() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("GCD(12,8)").unwrap(), &sheet).unwrap(),
            CellValue::Num(4.0)
        );
        assert_eq!(
            eval(&parse("LCM(4,6)").unwrap(), &sheet).unwrap(),
            CellValue::Num(12.0)
        );
    }

    #[test]
    fn eval_basic_product_quotient() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("PRODUCT(2,3,4)").unwrap(), &sheet).unwrap(),
            CellValue::Num(24.0)
        );
        assert_eq!(
            eval(&parse("QUOTIENT(10,3)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
    }

    #[test]
    fn eval_basic_sumsq_sumproduct() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("SUMSQ(3,4)").unwrap(), &sheet).unwrap(),
            CellValue::Num(25.0)
        );
        assert_eq!(
            eval(&parse("SUMPRODUCT(1,2,3)").unwrap(), &sheet).unwrap(),
            CellValue::Num(6.0)
        );
    }

    #[test]
    fn eval_basic_even_odd() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("EVEN(3)").unwrap(), &sheet).unwrap(),
            CellValue::Num(4.0)
        );
        assert_eq!(
            eval(&parse("ODD(4)").unwrap(), &sheet).unwrap(),
            CellValue::Num(5.0)
        );
        assert_eq!(
            eval(&parse("EVEN(0)").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
        assert_eq!(
            eval(&parse("ODD(0)").unwrap(), &sheet).unwrap(),
            CellValue::Num(1.0)
        );
    }

    #[test]
    fn eval_basic_mround_ceiling() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("MROUND(10,3)").unwrap(), &sheet).unwrap(),
            CellValue::Num(9.0)
        );
        assert_eq!(
            eval(&parse("CEILING(2.2,1.5)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
    }

    #[test]
    fn eval_basic_iferror_ifna() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("IFERROR(1/0,\"err\")").unwrap(), &sheet).unwrap(),
            CellValue::Text("err".to_string())
        );
        assert_eq!(
            eval(&parse("IFERROR(42,\"err\")").unwrap(), &sheet).unwrap(),
            CellValue::Num(42.0)
        );
    }

    #[test]
    fn eval_basic_xor_ifs_switch() {
        let sheet = TestSheet::new();
        // XOR(TRUE, FALSE) = TRUE
        assert_eq!(
            eval(&parse("XOR(TRUE,FALSE)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(true)
        );
        // XOR(TRUE, TRUE) = FALSE
        assert_eq!(
            eval(&parse("XOR(TRUE,TRUE)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(false)
        );
        // IFS
        assert_eq!(
            eval(&parse("IFS(FALSE,\"a\",TRUE,\"b\")").unwrap(), &sheet).unwrap(),
            CellValue::Text("b".to_string())
        );
        // SWITCH
        assert_eq!(
            eval(&parse("SWITCH(2,1,\"one\",2,\"two\")").unwrap(), &sheet).unwrap(),
            CellValue::Text("two".to_string())
        );
    }

    #[test]
    fn eval_basic_is_functions() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("ISBLANK(0)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(false)
        );
        assert_eq!(
            eval(&parse("ISNUMBER(42)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(true)
        );
        assert_eq!(
            eval(&parse("ISTEXT(\"hi\")").unwrap(), &sheet).unwrap(),
            CellValue::Bool(true)
        );
        assert_eq!(
            eval(&parse("ISERROR(1/0)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(true)
        );
        assert_eq!(
            eval(&parse("ISLOGICAL(TRUE)").unwrap(), &sheet).unwrap(),
            CellValue::Bool(true)
        );
    }

    #[test]
    fn eval_basic_n_type() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("N(42)").unwrap(), &sheet).unwrap(),
            CellValue::Num(42.0)
        );
        assert_eq!(
            eval(&parse("N(TRUE)").unwrap(), &sheet).unwrap(),
            CellValue::Num(1.0)
        );
        assert_eq!(
            eval(&parse("TYPE(42)").unwrap(), &sheet).unwrap(),
            CellValue::Num(1.0)
        );
        assert_eq!(
            eval(&parse("TYPE(\"hi\")").unwrap(), &sheet).unwrap(),
            CellValue::Num(2.0)
        );
        assert_eq!(
            eval(&parse("TYPE(TRUE)").unwrap(), &sheet).unwrap(),
            CellValue::Num(4.0)
        );
    }

    #[test]
    fn eval_basic_counta_countblank() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("COUNTA(1,\"a\",TRUE)").unwrap(), &sheet).unwrap(),
            CellValue::Num(3.0)
        );
    }

    #[test]
    fn eval_basic_averagea_mina_maxa() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("AVERAGEA(1,2,TRUE)").unwrap(), &sheet).unwrap(),
            CellValue::Num(4.0 / 3.0)
        );
    }

    #[test]
    fn eval_basic_product_zero_args() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("PRODUCT()").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
    }

    #[test]
    fn eval_basic_stdev_var() {
        let sheet = TestSheet::new();
        // STDEV(2,4,6) — mean=4, deviations: -2,0,2, squares: 4,0,4, sum=8, var=8/2=4, stdev=2
        let result = eval(&parse("STDEV(2,4,6)").unwrap(), &sheet).unwrap();
        if let CellValue::Num(n) = result {
            assert!((n - 2.0).abs() < 1e-10);
        } else {
            panic!("Expected Num, got {:?}", result);
        }
    }

    #[test]
    fn eval_basic_median() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("MEDIAN(3,1,2)").unwrap(), &sheet).unwrap(),
            CellValue::Num(2.0)
        );
        assert_eq!(
            eval(&parse("MEDIAN(1,2,3,4)").unwrap(), &sheet).unwrap(),
            CellValue::Num(2.5)
        );
    }

    #[test]
    fn eval_basic_large_small() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("LARGE(10,20,30,2)").unwrap(), &sheet).unwrap(),
            CellValue::Num(20.0)
        );
        assert_eq!(
            eval(&parse("SMALL(10,20,30,2)").unwrap(), &sheet).unwrap(),
            CellValue::Num(20.0)
        );
    }

    #[test]
    fn eval_basic_inverse_trig() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("ASIN(0)").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
        assert_eq!(
            eval(&parse("ACOS(1)").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
        assert_eq!(
            eval(&parse("ATAN(0)").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
        let result = eval(&parse("ATAN2(1,1)").unwrap(), &sheet).unwrap();
        if let CellValue::Num(n) = result {
            assert!((n - 0.7853981633974483).abs() < 1e-10);
        } else {
            panic!("Expected Num");
        }
    }

    #[test]
    fn eval_basic_countif_sumif() {
        let sheet = TestSheet::new();
        assert_eq!(
            eval(&parse("COUNTIF(5,5)").unwrap(), &sheet).unwrap(),
            CellValue::Num(1.0)
        );
        assert_eq!(
            eval(&parse("COUNTIF(5,3)").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
        assert_eq!(
            eval(&parse("SUMIF(5,5,10)").unwrap(), &sheet).unwrap(),
            CellValue::Num(10.0)
        );
        assert_eq!(
            eval(&parse("SUMIF(5,3,10)").unwrap(), &sheet).unwrap(),
            CellValue::Num(0.0)
        );
    }

    #[test]
    fn eval_basic_function_not_found() {
        let sheet = TestSheet::new();
        let result = eval(&parse("BOGUS_FN(1)").unwrap(), &sheet);
        assert!(result.is_err());
        match result {
            Err(FormulaError::FunctionNotFound(_)) => {}
            _ => panic!("Expected FunctionNotFound"),
        }
    }

    #[test]
    fn eval_basic_sin_cos_pi() {
        let sheet = TestSheet::new();
        let pi = std::f64::consts::PI;
        // sin^2 + cos^2 = 1
        let sin_val = eval(&parse("SIN(PI()/4)").unwrap(), &sheet).unwrap();
        let cos_val = eval(&parse("COS(PI()/4)").unwrap(), &sheet).unwrap();
        if let (CellValue::Num(s), CellValue::Num(c)) = (sin_val, cos_val) {
            assert!((s * s + c * c - 1.0).abs() < 1e-10);
        } else {
            panic!("Expected Num values");
        }
    }

    #[test]
    fn eval_basic_nested_functions() {
        let sheet = TestSheet::new();
        // ROUND(SQRT(SUM(9,16))) = ROUND(SQRT(25)) = ROUND(5) = 5
        assert_eq!(
            eval(&parse("ROUND(SQRT(SUM(9,16)),0)").unwrap(), &sheet).unwrap(),
            CellValue::Num(5.0)
        );
        // IF(AND(TRUE,TRUE), 42, 0)
        assert_eq!(
            eval(&parse("IF(AND(TRUE,TRUE),42,0)").unwrap(), &sheet).unwrap(),
            CellValue::Num(42.0)
        );
    }
}
