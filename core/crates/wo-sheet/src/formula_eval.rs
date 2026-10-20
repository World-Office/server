//! Formula evaluation with named range support for wo-sheet.
//!
//! This module extends wo-formula's evaluation to support defined names
//! (named ranges) with cross-sheet references and proper OO reference semantics.

use crate::model::{DefinedName, Sheet as WoSheet, Workbook};
use wo_formula::ast::{CellErr, CellRef, CellRefCoord, CellValue, Expr, FormulaError, RangeRef, RefStyle};
use wo_formula::eval::{eval as base_eval, Sheet as FormulaSheet};
use wo_formula::parser::parse as parse_formula;

/// Parse a reference string (e.g., "Sheet1!A1", "$A$1:$B$2", "A:A", "1:1") into an Expr.
pub fn parse_reference_string(refs: &str) -> Result<Expr, FormulaError> {
    if refs.contains(':') {
        let (sheet, ref_part) = if let Some(pos) = refs.find('!') {
            (Some(refs[..pos].to_string()), &refs[pos + 1..])
        } else {
            (None, refs)
        };

        let parts: Vec<&str> = ref_part.split(':').collect();
        if parts.len() == 2 {
            let start = parts[0].trim();
            let end = parts[1].trim();

            // Whole column (letter:letter)
            if start.chars().all(|c| c.is_ascii_alphabetic()) &&
               end.chars().all(|c| c.is_ascii_alphabetic()) {
                let start_col = a1_to_col(start)?;
                let end_col = a1_to_col(end)?;
                return Ok(Expr::RangeRef(RangeRef {
                    sheet: sheet.clone(),
                    start: CellRef::a1(sheet.clone(), 0, start_col),
                    end: CellRef::a1(sheet.clone(), u32::MAX, end_col),
                }));
            }

            // Whole row (number:number)
            if start.chars().all(|c| c.is_ascii_digit()) &&
               end.chars().all(|c| c.is_ascii_digit()) {
                let start_row = start.parse::<u32>().map_err(|_| {
                    FormulaError::InvalidReference(format!("Invalid row: {}", start))
                })? - 1;
                let end_row = end.parse::<u32>().map_err(|_| {
                    FormulaError::InvalidReference(format!("Invalid row: {}", end))
                })? - 1;
                return Ok(Expr::RangeRef(RangeRef {
                    sheet: sheet.clone(),
                    start: CellRef::a1(sheet.clone(), start_row, 0),
                    end: CellRef::a1(sheet.clone(), end_row, u32::MAX),
                }));
            }

            // Normal range
            let start_expr = parse_single_reference(sheet.as_deref(), start)?;
            let end_expr = parse_single_reference(sheet.as_deref(), end)?;
            if let (Expr::CellRef(start_ref), Expr::CellRef(end_ref)) = (start_expr, end_expr) {
                return Ok(Expr::RangeRef(RangeRef {
                    sheet: sheet.clone(),
                    start: start_ref,
                    end: end_ref,
                }));
            }
        }
    }
    parse_single_reference(None, refs)
}

/// Parse a single cell reference string into a CellRef.
fn parse_single_reference(sheet: Option<&str>, refs: &str) -> Result<Expr, FormulaError> {
    let (final_sheet, ref_part) = if let Some(pos) = refs.find('!') {
        (Some(refs[..pos].to_string()), &refs[pos + 1..])
    } else {
        (sheet.map(|s| s.to_string()), refs)
    };

    let mut chars = ref_part.chars().peekable();
    let mut col_dollar = false;
    let mut col_name = String::new();
    let mut row_dollar = false;
    let mut row_num = 0;
    let mut row_started = false;

    // Read column
    while let Some(c) = chars.peek() {
        if *c == '$' {
            if col_name.is_empty() {
                col_dollar = true;
                chars.next();
            } else {
                row_dollar = true;
                chars.next();
                row_started = true;
                break;
            }
        } else if c.is_ascii_alphabetic() {
            col_name.push(c.to_ascii_uppercase());
            chars.next();
        } else {
            break;
        }
    }

    if col_name.is_empty() {
        return Err(FormulaError::InvalidReference(refs.to_string()));
    }

    let col = a1_to_col(&col_name)?;

    // Read row
    while let Some(c) = chars.peek() {
        if *c == '$' {
            row_dollar = true;
            chars.next();
        } else if c.is_ascii_digit() {
            row_num = row_num * 10 + ((*c as u8) as u32 - ('0' as u8 as u32));
            row_started = true;
            chars.next();
        } else {
            break;
        }
    }

    if !row_started {
        return Err(FormulaError::InvalidReference(refs.to_string()));
    }

    let row = row_num - 1;

    Ok(Expr::CellRef(CellRef {
        sheet: final_sheet.clone(),
        row: if row_dollar {
            CellRefCoord::Absolute(row)
        } else {
            CellRefCoord::Relative(row as i32)
        },
        col: if col_dollar {
            CellRefCoord::Absolute(col)
        } else {
            CellRefCoord::Relative(col as i32)
        },
        style: RefStyle::A1,
    }))
}

/// Convert A1 column notation to 0-based index.
pub fn a1_to_col(s: &str) -> Result<u32, FormulaError> {
    let s = s.to_uppercase();
    if s.is_empty() || s.len() > 3 {
        return Err(FormulaError::InvalidReference(format!("Invalid column: {}", s)));
    }
    let mut col = 0;
    for c in s.chars() {
        if !c.is_ascii_alphabetic() {
            return Err(FormulaError::InvalidReference(format!("Invalid column: {}", s)));
        }
        col = col * 26 + ((c as u8) as u32 - ('A' as u8 as u32) + 1);
    }
    Ok(col - 1)
}

/// Helper to get a sheet by name from a workbook.
pub fn get_sheet_by_name<'a>(wb: &'a Workbook, name: &str) -> Option<&'a WoSheet> {
    wb.sheets.iter().find(|s| s.name == name)
}

/// Resolve a named range reference to an Expr.
pub fn resolve_named_range(wb: &Workbook, name: &str, current_sheet: Option<&str>) -> Option<Expr> {
    // First, try to find a workbook-scoped name
    for defined_name in &wb.defined_names {
        if defined_name.name == name && defined_name.scope.is_none() {
            return parse_reference_string(&defined_name.refs).ok();
        }
    }

    // If we have a current sheet, try to find a sheet-scoped name
    if let Some(current_sheet) = current_sheet {
        for defined_name in &wb.defined_names {
            if defined_name.name == name {
                if let Some(scope) = &defined_name.scope {
                    if scope == current_sheet {
                        return parse_reference_string(&defined_name.refs).ok();
                    }
                }
            }
        }
    }

    None
}

/// A wrapper around a workbook that implements the Sheet trait for formula evaluation.
pub struct WorkbookEvalContext<'a> {
    wb: &'a Workbook,
    current_sheet_name: Option<&'a str>,
}

impl<'a> WorkbookEvalContext<'a> {
    pub fn new(wb: &'a Workbook) -> Self {
        Self {
            wb,
            current_sheet_name: None,
        }
    }

    pub fn with_sheet(wb: &'a Workbook, sheet_name: &'a str) -> Self {
        Self {
            wb,
            current_sheet_name: Some(sheet_name),
        }
    }

    fn current_sheet(&self) -> Option<&WoSheet> {
        self.current_sheet_name
            .and_then(|name| get_sheet_by_name(self.wb, name))
            .or_else(|| self.wb.sheets.first())
    }

    fn get_sheet_by_ref(&self, sheet_name: Option<&str>) -> Option<&WoSheet> {
        sheet_name
            .and_then(|name| get_sheet_by_name(self.wb, name))
            .or_else(|| self.current_sheet())
    }
}

impl<'a> FormulaSheet for WorkbookEvalContext<'a> {
    fn cell(&self, row: u32, col: u32) -> Option<&CellValue> {
        if let Some(sheet) = self.current_sheet() {
            if let Some(cell) = sheet.get_cell(row, col) {
                return Some(&cell.value);
            }
        }
        for sheet in &self.wb.sheets {
            if let Some(cell) = sheet.get_cell(row, col) {
                return Some(&cell.value);
            }
        }
        None
    }

    fn cell_mut(&mut self, _row: u32, _col: u32) -> Option<&mut CellValue> {
        None
    }

    fn range(&self, start_row: u32, start_col: u32, end_row: u32, end_col: u32) -> Vec<&CellValue> {
        let mut result = Vec::new();
        if let Some(sheet) = self.current_sheet() {
            for row in start_row..=end_row {
                for col in start_col..=end_col {
                    if let Some(cell) = sheet.get_cell(row, col) {
                        result.push(&cell.value);
                    }
                }
            }
        }
        result
    }
}

/// Custom evaluation function that handles sheet-qualified references in WorkbookEvalContext.
/// This is needed because the base eval function doesn't handle sheet names in CellRef.
pub fn eval_with_context(expr: &Expr, ctx: &WorkbookEvalContext) -> Result<CellValue, FormulaError> {
    match expr {
        Expr::Empty => Ok(CellValue::Empty),
        Expr::Bool(b) => Ok(CellValue::Bool(*b)),
        Expr::Num(n) => Ok(CellValue::Num(*n)),
        Expr::Text(s) => Ok(CellValue::Text(s.clone())),
        Expr::Error(e) => Ok(CellValue::Err(e.clone())),
        Expr::Date(d) => Ok(CellValue::Date(*d)),

        Expr::CellRef(cell_ref) => {
            // Get the sheet for this reference
            let sheet = ctx.get_sheet_by_ref(cell_ref.sheet.as_deref());
            let (row, col) = cell_ref.resolve(0, 0);
            sheet
                .and_then(|s| s.get_cell(row, col))
                .map(|cell| cell.value.clone())
                .ok_or(FormulaError::RefError)
        }
        Expr::RangeRef(range_ref) => {
            // Get the sheet for this range reference
            let sheet = ctx.get_sheet_by_ref(range_ref.sheet.as_deref());
            let (start_row, start_col) = range_ref.start.resolve(0, 0);
            let (end_row, end_col) = range_ref.end.resolve(0, 0);
            
            if let Some(sheet) = sheet {
                // For whole-column (A:A) or whole-row (1:1) references, we need to limit the range
                // to avoid iterating over all possible rows/columns
                let actual_end_row = if end_row == u32::MAX {
                    // Whole column - limit to a reasonable number of rows
                    // or use the sheet's actual data extent
                    sheet.max_row()
                } else {
                    end_row
                };
                
                let actual_end_col = if end_col == u32::MAX {
                    // Whole row - limit to a reasonable number of columns
                    sheet.max_col()
                } else {
                    end_col
                };
                
                let mut cells = Vec::new();
                for row in start_row..=actual_end_row {
                    for col in start_col..=actual_end_col {
                        if let Some(cell) = sheet.get_cell(row, col) {
                            cells.push(cell.value.clone());
                        }
                    }
                }
                if cells.is_empty() {
                    Ok(CellValue::Empty)
                } else {
                    // For now, return the first cell's value (matching wo-formula behavior)
                    Ok(cells[0].clone())
                }
            } else {
                Err(FormulaError::RefError)
            }
        }
        Expr::NamedRange(name) => {
            // This should have been resolved before we get here
            Err(FormulaError::NameError)
        }

        Expr::Unary { op, operand } => {
            let value = eval_with_context(operand, ctx)?;
            match (op, value) {
                (wo_formula::ast::UnaryOp::Plus, CellValue::Num(n)) => Ok(CellValue::Num(n)),
                (wo_formula::ast::UnaryOp::Plus, CellValue::Text(s)) => Ok(CellValue::Text(s)),
                (wo_formula::ast::UnaryOp::Minus, CellValue::Num(n)) => Ok(CellValue::Num(-n)),
                (wo_formula::ast::UnaryOp::Not, CellValue::Bool(b)) => Ok(CellValue::Bool(!b)),
                (wo_formula::ast::UnaryOp::Not, CellValue::Num(n)) => Ok(CellValue::Bool(n == 0.0)),
                (wo_formula::ast::UnaryOp::Percent, CellValue::Num(n)) => Ok(CellValue::Num(n / 100.0)),
                _ => Err(FormulaError::TypeMismatch(
                    "Unary operator type mismatch".to_string(),
                )),
            }
        }

        Expr::Binary { op, lhs, rhs } => {
            let left = eval_with_context(lhs, ctx)?;
            let right = eval_with_context(rhs, ctx)?;

            match (op, left, right) {
                (wo_formula::ast::BinaryOp::Add, CellValue::Num(a), CellValue::Num(b)) => Ok(CellValue::Num(a + b)),
                (wo_formula::ast::BinaryOp::Subtract, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Num(a - b))
                }
                (wo_formula::ast::BinaryOp::Multiply, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Num(a * b))
                }
                (wo_formula::ast::BinaryOp::Divide, CellValue::Num(a), CellValue::Num(b)) => {
                    if b == 0.0 {
                        Ok(CellValue::Err(CellErr::DivByZero))
                    } else {
                        Ok(CellValue::Num(a / b))
                    }
                }
                (wo_formula::ast::BinaryOp::Power, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Num(a.powf(b)))
                }
                (wo_formula::ast::BinaryOp::Concatenate, CellValue::Text(a), CellValue::Text(b)) => {
                    Ok(CellValue::Text(a + &b))
                }
                (wo_formula::ast::BinaryOp::Concatenate, CellValue::Text(a), CellValue::Num(b)) => {
                    Ok(CellValue::Text(a + &b.to_string()))
                }
                (wo_formula::ast::BinaryOp::Concatenate, CellValue::Num(a), CellValue::Text(b)) => {
                    Ok(CellValue::Text(a.to_string() + &b))
                }
                (wo_formula::ast::BinaryOp::Equal, a, b) => Ok(CellValue::Bool(a == b)),
                (wo_formula::ast::BinaryOp::NotEqual, a, b) => Ok(CellValue::Bool(a != b)),
                (wo_formula::ast::BinaryOp::LessThan, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Bool(a < b))
                }
                (wo_formula::ast::BinaryOp::LessThanOrEqual, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Bool(a <= b))
                }
                (wo_formula::ast::BinaryOp::GreaterThan, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Bool(a > b))
                }
                (wo_formula::ast::BinaryOp::GreaterThanOrEqual, CellValue::Num(a), CellValue::Num(b)) => {
                    Ok(CellValue::Bool(a >= b))
                }
                (wo_formula::ast::BinaryOp::Range, _, _) => Ok(CellValue::Empty),
                _ => Err(FormulaError::TypeMismatch(
                    "Binary operator type mismatch".to_string(),
                )),
            }
        }

        Expr::Func { name, args } => {
            // For functions, we need to evaluate each argument with our custom evaluator
            // and then call the function. But the functions in wo-formula require &impl Sheet.
            // Since WorkbookEvalContext implements FormulaSheet, we can use base_eval directly.
            // However, we need to make sure sheet-qualified references in args are handled.
            // We'll evaluate args using our custom evaluator first.
            let evaluated_args: Vec<CellValue> = args
                .iter()
                .map(|arg| eval_with_context(arg, ctx))
                .collect::<Result<Vec<_>, _>>()?;
            
            // Now we need to call the function with these evaluated args
            // Since we can't easily call wo-formula's functions, we'll delegate to base_eval
            // but we need to handle the Sized issue. For now, let's just return an error.
            Err(FormulaError::InvalidToken("Function evaluation with cross-sheet references not yet implemented".to_string()))
        }
        Expr::Array(_) => Err(FormulaError::InvalidToken(
            "Array evaluation not yet implemented".to_string(),
        )),
    }
}

/// Evaluate a formula expression with named range support.
pub fn eval_with_names(expr: &Expr, wb: &Workbook, current_sheet: Option<&str>) -> Result<CellValue, FormulaError> {
    let resolved_expr = resolve_named_ranges_in_expr(expr, wb, current_sheet)?;
    let ctx = WorkbookEvalContext::with_sheet(wb, current_sheet.unwrap_or(""));
    eval_with_context(&resolved_expr, &ctx)
}

/// Recursively resolve named ranges in an expression tree.
fn resolve_named_ranges_in_expr(expr: &Expr, wb: &Workbook, current_sheet: Option<&str>) -> Result<Expr, FormulaError> {
    match expr {
        Expr::NamedRange(name) => {
            if let Some(resolved) = resolve_named_range(wb, name, current_sheet) {
                resolve_named_ranges_in_expr(&resolved, wb, current_sheet)
            } else {
                Err(FormulaError::NameError)
            }
        }
        Expr::CellRef(cell_ref) => {
            if let Some(sheet_name) = &cell_ref.sheet {
                if get_sheet_by_name(wb, sheet_name).is_none() {
                    return Err(FormulaError::RefError);
                }
            }
            Ok(Expr::CellRef(cell_ref.clone()))
        }
        Expr::RangeRef(range_ref) => {
            if let Some(sheet_name) = &range_ref.sheet {
                if get_sheet_by_name(wb, sheet_name).is_none() {
                    return Err(FormulaError::RefError);
                }
            }
            let start = resolve_named_ranges_in_expr(&Expr::CellRef(range_ref.start.clone()), wb, current_sheet)?;
            let end = resolve_named_ranges_in_expr(&Expr::CellRef(range_ref.end.clone()), wb, current_sheet)?;
            if let (Expr::CellRef(start_ref), Expr::CellRef(end_ref)) = (start, end) {
                Ok(Expr::RangeRef(RangeRef {
                    sheet: range_ref.sheet.clone(),
                    start: start_ref,
                    end: end_ref,
                }))
            } else {
                Err(FormulaError::RefError)
            }
        }
        Expr::Binary { op, lhs, rhs } => {
            let lhs_resolved = resolve_named_ranges_in_expr(lhs, wb, current_sheet)?;
            let rhs_resolved = resolve_named_ranges_in_expr(rhs, wb, current_sheet)?;
            Ok(Expr::Binary {
                op: *op,
                lhs: Box::new(lhs_resolved),
                rhs: Box::new(rhs_resolved),
            })
        }
        Expr::Unary { op, operand } => {
            let operand_resolved = resolve_named_ranges_in_expr(operand, wb, current_sheet)?;
            Ok(Expr::Unary {
                op: *op,
                operand: Box::new(operand_resolved),
            })
        }
        Expr::Func { name, args } => {
            let resolved_args: Result<Vec<Expr>, FormulaError> = args
                .iter()
                .map(|arg| resolve_named_ranges_in_expr(arg, wb, current_sheet))
                .collect();
            Ok(Expr::Func {
                name: name.clone(),
                args: resolved_args?,
            })
        }
        Expr::Array(rows) => {
            let resolved_rows: Result<Vec<Vec<Expr>>, FormulaError> = rows
                .iter()
                .map(|row| {
                    row.iter()
                        .map(|expr| resolve_named_ranges_in_expr(expr, wb, current_sheet))
                        .collect()
                })
                .collect();
            Ok(Expr::Array(resolved_rows?))
        }
        Expr::Empty => Ok(Expr::Empty),
        Expr::Bool(b) => Ok(Expr::Bool(*b)),
        Expr::Num(n) => Ok(Expr::Num(*n)),
        Expr::Text(s) => Ok(Expr::Text(s.clone())),
        Expr::Date(d) => Ok(Expr::Date(*d)),
        Expr::Error(e) => Ok(Expr::Error(e.clone())),
    }
}

/// Evaluate a formula string with named range support.
pub fn eval_str_with_names(formula: &str, wb: &Workbook, current_sheet: Option<&str>) -> Result<CellValue, FormulaError> {
    let expr = parse_formula(formula)?;
    eval_with_names(&expr, wb, current_sheet)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Cell, DefinedName, Sheet, Workbook};

    #[test]
    fn test_parse_reference_string_single_cell() {
        let expr = parse_reference_string("A1").unwrap();
        assert!(matches!(expr, Expr::CellRef(_)));
    }

    #[test]
    fn test_parse_reference_string_absolute() {
        let expr = parse_reference_string("$A$1").unwrap();
        assert!(matches!(expr, Expr::CellRef(_)));
    }

    #[test]
    fn test_parse_reference_string_with_sheet() {
        let expr = parse_reference_string("Sheet2!A1").unwrap();
        assert!(matches!(expr, Expr::CellRef(_)));
        if let Expr::CellRef(ref cell_ref) = expr {
            assert_eq!(cell_ref.sheet, Some("Sheet2".to_string()));
        }
    }

    #[test]
    fn test_parse_reference_string_range() {
        let expr = parse_reference_string("A1:B10").unwrap();
        assert!(matches!(expr, Expr::RangeRef(_)));
    }

    #[test]
    fn test_parse_reference_string_cross_sheet_range() {
        let expr = parse_reference_string("Sheet2!A1:B10").unwrap();
        assert!(matches!(expr, Expr::RangeRef(_)));
    }

    #[test]
    fn test_parse_reference_string_whole_column() {
        let expr = parse_reference_string("A:A").unwrap();
        assert!(matches!(expr, Expr::RangeRef(_)));
    }

    #[test]
    fn test_parse_reference_string_whole_row() {
        let expr = parse_reference_string("1:1").unwrap();
        assert!(matches!(expr, Expr::RangeRef(_)));
    }

    #[test]
    fn test_resolve_named_range() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        wb.add_sheet(Sheet::new("Sheet2"));
        wb.add_defined_name(DefinedName::new("MyRange", "Sheet2!A1"));
        
        let resolved = resolve_named_range(&wb, "MyRange", None);
        assert!(resolved.is_some());
        assert!(matches!(resolved.unwrap(), Expr::CellRef(_)));
    }

    #[test]
    fn test_resolve_sheet_scoped_named_range() {
        let mut wb = Workbook::new();
        wb.add_sheet(Sheet::new("Sheet1"));
        wb.add_sheet(Sheet::new("Sheet2"));
        
        let mut name = DefinedName::new("MyRange", "A1:B10");
        name.scope = Some("Sheet1".to_string());
        wb.add_defined_name(name);
        
        let resolved = resolve_named_range(&wb, "MyRange", Some("Sheet1"));
        assert!(resolved.is_some());
        
        let resolved = resolve_named_range(&wb, "MyRange", Some("Sheet2"));
        assert!(resolved.is_none());
    }

    #[test]
    fn test_eval_with_names_cross_sheet() {
        let mut wb = Workbook::new();
        
        let mut sheet1 = Sheet::new("Sheet1");
        sheet1.set_cell(0, 0, Cell::with_num(42.0));
        wb.add_sheet(sheet1);
        
        let mut sheet2 = Sheet::new("Sheet2");
        sheet2.set_cell(1, 1, Cell::with_num(100.0));
        wb.add_sheet(sheet2);
        
        wb.add_defined_name(DefinedName::new("Target", "Sheet2!B2"));
        
        let result = eval_str_with_names("=Target", &wb, Some("Sheet1"));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), CellValue::Num(100.0));
    }

    // F-205 test: Cross-sheet defined name evaluation
    #[test]
    fn test_defined_name_cross_sheet_f205() {
        let mut wb = Workbook::new();
        
        let mut sheet1 = Sheet::new("Sheet1");
        sheet1.set_cell(0, 0, Cell::with_num(0.0));
        wb.add_sheet(sheet1);
        
        let mut sheet2 = Sheet::new("Sheet2");
        sheet2.set_cell(0, 0, Cell::with_num(123.0));
        sheet2.set_cell(1, 0, Cell::with_num(456.0));
        wb.add_sheet(sheet2);
        
        // Define a workbook-scoped name pointing to Sheet2!A1
        wb.add_defined_name(DefinedName::new("Data", "Sheet2!A1"));
        
        // Evaluate a formula that uses the named range from Sheet1
        let result = eval_str_with_names("=Data", &wb, Some("Sheet1"));
        assert!(result.is_ok(), "Failed to evaluate cross-sheet named range: {:?}", result);
        let value = result.unwrap();
        assert_eq!(value, CellValue::Num(123.0));
        
        // Define another name pointing to a range with absolute references
        wb.add_defined_name(DefinedName::new("DataRange", "Sheet2!$A$1:$A$2"));
        
        // This should resolve to the range
        let result = eval_str_with_names("=DataRange", &wb, Some("Sheet1"));
        assert!(result.is_ok(), "Failed to evaluate cross-sheet named range with absolute refs: {:?}", result);
        // Range returns first cell by default
        assert_eq!(result.unwrap(), CellValue::Num(123.0));
    }

    // F-205 test: Reference semantics
    #[test]
    fn test_defined_name_reference_semantics_f205() {
        let mut wb = Workbook::new();
        let mut sheet1 = Sheet::new("Sheet1");
        
        // Set up some data
        sheet1.set_cell(0, 0, Cell::with_num(1.0));   // A1
        sheet1.set_cell(0, 1, Cell::with_num(2.0));   // B1
        sheet1.set_cell(1, 0, Cell::with_num(3.0));   // A2
        sheet1.set_cell(1, 1, Cell::with_num(4.0));   // B2
        
        wb.add_sheet(sheet1);
        
        // Test 1: Absolute reference with $
        wb.add_defined_name(DefinedName::new("AbsCell", "$A$1"));
        let result = eval_str_with_names("=AbsCell", &wb, Some("Sheet1"));
        assert!(result.is_ok(), "Failed to evaluate absolute reference");
        assert_eq!(result.unwrap(), CellValue::Num(1.0));
        
        // Test 2: Range reference
        wb.add_defined_name(DefinedName::new("Range", "A1:B2"));
        let result = eval_str_with_names("=Range", &wb, Some("Sheet1"));
        assert!(result.is_ok(), "Failed to evaluate range reference");
        // Range returns first cell by default
        assert_eq!(result.unwrap(), CellValue::Num(1.0));
        
        // Test 3: Whole column reference
        wb.add_defined_name(DefinedName::new("ColA", "A:A"));
        let result = eval_str_with_names("=ColA", &wb, Some("Sheet1"));
        assert!(result.is_ok(), "Failed to evaluate whole column reference");
        assert_eq!(result.unwrap(), CellValue::Num(1.0));
        
        // Test 4: Whole row reference
        wb.add_defined_name(DefinedName::new("Row1", "1:1"));
        let result = eval_str_with_names("=Row1", &wb, Some("Sheet1"));
        assert!(result.is_ok(), "Failed to evaluate whole row reference");
        assert_eq!(result.unwrap(), CellValue::Num(1.0));
        
        // Test 5: Sheet-scoped name (should only work on Sheet1)
        let mut name = DefinedName::new("Scoped", "A1");
        name.scope = Some("Sheet1".to_string());
        wb.add_defined_name(name);
        
        let result = eval_str_with_names("=Scoped", &wb, Some("Sheet1"));
        assert!(result.is_ok(), "Failed to evaluate sheet-scoped name");
        assert_eq!(result.unwrap(), CellValue::Num(1.0));
        
        // Test 6: Sheet-scoped name should not resolve from another sheet
        let sheet2 = Sheet::new("Sheet2");
        wb.add_sheet(sheet2);
        let result = eval_str_with_names("=Scoped", &wb, Some("Sheet2"));
        assert!(result.is_err(), "Sheet-scoped name should not resolve from another sheet");
    }
}
