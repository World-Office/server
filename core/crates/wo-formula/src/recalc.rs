//! Formula recalculation engine.
//!
//! Provides topological-order recalculation of formula cells in a sheet.
//!
//! The core entry point is [`recalc_all`], which:
//!
//! 1. Collects all formula cells from the sheet (via [`FormulaProvider`])
//! 2. Builds a [`DepGraph`] from the formula expressions
//! 3. Detects cycles and marks offending cells with `#REF!`
//! 4. Evaluates formulas in topological order (dependencies before dependents)
//! 5. Writes each result back into the sheet via [`Sheet::cell_mut`]

use std::collections::HashMap;
use crate::ast::{CellErr, CellValue, Expr, FormulaError};
use crate::dep_graph::DepGraph;
use crate::eval::{eval, Sheet};

/// Extension trait for sheets that track formula expressions alongside values.
///
/// Implementors store parsed [`Expr`] AST nodes for cells that contain
/// formulas. [`recalc_all`] uses this trait to discover which cells need
/// to be recalculated and what their formulas are.
///
/// # Implementing
///
/// A concrete sheet implementation would typically store an
/// `HashMap<(u32, u32), Expr>` alongside its value store, returning
/// references from `formula()` and iterating all keys in `formula_cells()`.
pub trait FormulaProvider {
    /// Return the parsed formula expression for the cell at `(row, col)`,
    /// or `None` if the cell does not contain a formula.
    fn formula(&self, row: u32, col: u32) -> Option<&Expr>;

    /// Return all cells that contain formulas, with their expressions.
    ///
    /// The returned vec is the complete set of cells that need
    /// recalculation. Expressions are cloned so the caller does not
    /// hold a borrow across mutation.
    fn formula_cells(&self) -> Vec<(u32, u32, Expr)>;
}

/// Recalculate all formula cells in a sheet using topological order.
///
/// # Algorithm
///
/// 1. **Discover** — collect every formula cell through [`FormulaProvider`].
/// 2. **Build graph** — register each formula's cell references in a
///    [`DepGraph`] using [`DepGraph::add_formula`].
/// 3. **Detect cycles** — run [`DepGraph::detect_cycle`]; if a cycle exists,
///    mark all formula cells with `#REF!` and return
///    [`FormulaError::CircularReference`].
/// 4. **Sort** — compute a topological ordering via
///    [`DepGraph::topological_order`] (Kahn's algorithm).
/// 5. **Evaluate** — for each cell in order, call [`eval`] on its formula
///    expression against the current sheet state and write the result back
///    through [`Sheet::cell_mut`].
///
/// # Performance
///
/// A chain of 1000 dependent cells should recalculate in under 50 ms on
/// modern hardware (see the `recalc_1000_cell_chain` test).
///
/// # Errors
///
/// Returns [`FormulaError::CircularReference`] if the dependency graph
/// contains a cycle. In this case all formula cells are set to `#REF!`.
pub fn recalc_all(sheet: &mut (impl Sheet + FormulaProvider)) -> Result<(), FormulaError> {
    let formulas: Vec<(u32, u32, Expr)> = sheet.formula_cells();
    if formulas.is_empty() {
        return Ok(());
    }

    // -- Phase 1: build the dependency graph --
    let mut dep_graph = DepGraph::new();
    for (row, col, expr) in &formulas {
        dep_graph.add_formula((*row, *col), expr);
    }

    // -- Phase 2: cycle detection --
    if dep_graph.detect_cycle().is_some() {
        // Mark ALL formula cells with #REF! (Excel behaviour on cycle)
        for &(row, col) in &formulas.iter().map(|(r, c, _)| (*r, *c)).collect::<Vec<_>>() {
            if let Some(cell) = sheet.cell_mut(row, col) {
                *cell = CellValue::Err(CellErr::Ref);
            }
        }
        return Err(FormulaError::CircularReference);
    }

    // -- Phase 3: topological order --
    let order = dep_graph.topological_order();

    // Build a fast lookup: cell → cloned Expr
    let formula_map: HashMap<(u32, u32), Expr> = formulas
        .into_iter()
        .map(|(r, c, e)| ((r, c), e))
        .collect();

    // -- Phase 4: evaluate in order --
    for &cell in &order {
        if let Some(expr) = formula_map.get(&cell) {
            match eval(expr, sheet) {
                Ok(value) => {
                    if let Some(c) = sheet.cell_mut(cell.0, cell.1) {
                        *c = value;
                    }
                }
                Err(_) => {
                    // Evaluation error → #VALUE! in the cell
                    if let Some(c) = sheet.cell_mut(cell.0, cell.1) {
                        *c = CellValue::Err(CellErr::Value);
                    }
                }
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{BinaryOp, CellRef, CellValue, Expr};
    use crate::parser::parse;
    use std::collections::HashMap;

    // -----------------------------------------------------------------------
    // Mock sheet that implements both Sheet and FormulaProvider
    // -----------------------------------------------------------------------

    struct MockSheet {
        /// Stored cell values (evaluated results).
        values: HashMap<(u32, u32), CellValue>,
        /// Stored formula expressions.
        formulas: HashMap<(u32, u32), Expr>,
    }

    impl MockSheet {
        fn new() -> Self {
            Self {
                values: HashMap::new(),
                formulas: HashMap::new(),
            }
        }

        /// Set a cell value directly (no formula).
        fn set_value(&mut self, row: u32, col: u32, value: CellValue) {
            self.values.insert((row, col), value);
        }

        /// Set a formula for a cell. Parses the formula string and stores
        /// both the expression and an initial value placeholder.
        fn set_formula(&mut self, row: u32, col: u32, formula: &str) {
            let expr = parse(formula).expect("valid formula");
            self.formulas.insert((row, col), expr);
            self.values.insert((row, col), CellValue::Empty);
        }
    }

    impl Sheet for MockSheet {
        fn cell(&self, row: u32, col: u32) -> Option<&CellValue> {
            self.values.get(&(row, col))
        }

        fn cell_mut(&mut self, row: u32, col: u32) -> Option<&mut CellValue> {
            self.values.get_mut(&(row, col))
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
                    if let Some(value) = self.values.get(&(row, col)) {
                        result.push(value);
                    }
                }
            }
            result
        }
    }

    impl FormulaProvider for MockSheet {
        fn formula(&self, row: u32, col: u32) -> Option<&Expr> {
            self.formulas.get(&(row, col))
        }

        fn formula_cells(&self) -> Vec<(u32, u32, Expr)> {
            self.formulas
                .iter()
                .map(|(&(r, c), e)| (r, c, e.clone()))
                .collect()
        }
    }

    // Convenience helpers for building Expr nodes in tests

    fn cell_expr(row: u32, col: u32) -> Expr {
        Expr::CellRef(CellRef::a1(None, row, col))
    }

    fn add_expr(lhs: Expr, rhs: Expr) -> Expr {
        Expr::Binary {
            op: BinaryOp::Add,
            lhs: Box::new(lhs),
            rhs: Box::new(rhs),
        }
    }

    fn mul_expr(lhs: Expr, rhs: Expr) -> Expr {
        Expr::Binary {
            op: BinaryOp::Multiply,
            lhs: Box::new(lhs),
            rhs: Box::new(rhs),
        }
    }

    // -----------------------------------------------------------------------
    // recalc_empty_sheet (1)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_empty_sheet() {
        let mut sheet = MockSheet::new();
        // No formulas — recalc_all should be a no-op
        assert!(recalc_all(&mut sheet).is_ok());
        assert!(sheet.values.is_empty());
    }

    // -----------------------------------------------------------------------
    // recalc_single_formula (2)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_single_formula() {
        let mut sheet = MockSheet::new();
        sheet.set_value(0, 0, CellValue::Num(10.0)); // A1 = 10
        sheet.set_formula(0, 2, "A1+5");             // C1 = A1+5

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Num(15.0)));
        // A1 must be unchanged
        assert_eq!(sheet.cell(0, 0), Some(&CellValue::Num(10.0)));
    }

    // -----------------------------------------------------------------------
    // recalc_dependency_chain (3)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_dependency_chain() {
        let mut sheet = MockSheet::new();
        // A1 = 1
        // B1 = A1 + 1  → 2
        // C1 = B1 + 1  → 3
        // D1 = C1 + 1  → 4
        sheet.set_value(0, 0, CellValue::Num(1.0));
        sheet.set_formula(0, 1, "A1+1");
        sheet.set_formula(0, 2, "B1+1");
        sheet.set_formula(0, 3, "C1+1");

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 1), Some(&CellValue::Num(2.0)));
        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Num(3.0)));
        assert_eq!(sheet.cell(0, 3), Some(&CellValue::Num(4.0)));
    }

    // -----------------------------------------------------------------------
    // recalc_diamond_dependency (4)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_diamond_dependency() {
        let mut sheet = MockSheet::new();
        // A1 = 10
        // B1 = A1 * 2  → 20
        // C1 = A1 * 3  → 30
        // D1 = B1 + C1  → 50
        sheet.set_value(0, 0, CellValue::Num(10.0));
        sheet.set_formula(0, 1, "A1*2");
        sheet.set_formula(0, 2, "A1*3");
        sheet.set_formula(0, 3, "B1+C1");

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 1), Some(&CellValue::Num(20.0)));
        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Num(30.0)));
        assert_eq!(sheet.cell(0, 3), Some(&CellValue::Num(50.0)));
    }

    // -----------------------------------------------------------------------
    // recalc_cycle_detected (5)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_cycle_detected() {
        let mut sheet = MockSheet::new();
        // A1 = B1 + 1
        // B1 = A1 + 1  → cycle!
        sheet.set_formula(0, 0, "B1+1");
        sheet.set_formula(0, 1, "A1+1");

        let result = recalc_all(&mut sheet);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), FormulaError::CircularReference));

        // Both cells should be marked #REF!
        assert_eq!(
            sheet.cell(0, 0),
            Some(&CellValue::Err(CellErr::Ref))
        );
        assert_eq!(
            sheet.cell(0, 1),
            Some(&CellValue::Err(CellErr::Ref))
        );
    }

    // -----------------------------------------------------------------------
    // recalc_self_cycle (6)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_self_cycle() {
        let mut sheet = MockSheet::new();
        // A1 = A1 + 1  → self-reference cycle
        sheet.set_formula(0, 0, "A1+1");

        let result = recalc_all(&mut sheet);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), FormulaError::CircularReference));

        assert_eq!(
            sheet.cell(0, 0),
            Some(&CellValue::Err(CellErr::Ref))
        );
    }

    // -----------------------------------------------------------------------
    // recalc_partial_cycle_acyclic_subset (7)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_partial_cycle_acyclic_subset() {
        let mut sheet = MockSheet::new();
        // A1 = 10  (no formula — direct value)
        // B1 = A1 + 1  → 11
        // C1 = D1 + 5  → depends on D1
        // D1 = C1 + 5  → cycle with C1
        sheet.set_value(0, 0, CellValue::Num(10.0));
        sheet.set_formula(0, 1, "A1+1");
        sheet.set_formula(0, 2, "D1+5");
        sheet.set_formula(0, 3, "C1+5");

        let result = recalc_all(&mut sheet);

        // Cycle is detected
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), FormulaError::CircularReference));

        // Cycle cells are #REF!
        assert_eq!(
            sheet.cell(0, 2),
            Some(&CellValue::Err(CellErr::Ref))
        );
        assert_eq!(
            sheet.cell(0, 3),
            Some(&CellValue::Err(CellErr::Ref))
        );

        // B1 may or may not have been evaluated depending on implementation.
        // Our current impl marks ALL formula cells #REF! on cycle, so B1 is
        // also #REF!. This is acceptable for v1.
    }

    // -----------------------------------------------------------------------
    // recalc_no_dependencies (8)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_no_dependencies() {
        let mut sheet = MockSheet::new();
        // A1 = 10  (direct value)
        // B1 = 20  (no dependencies)
        // C1 = 30  (no dependencies)
        sheet.set_value(0, 0, CellValue::Num(10.0));
        sheet.set_formula(0, 1, "20");
        sheet.set_formula(0, 2, "30");

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 1), Some(&CellValue::Num(20.0)));
        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Num(30.0)));
        // A1 is unchanged
        assert_eq!(sheet.cell(0, 0), Some(&CellValue::Num(10.0)));
    }

    // -----------------------------------------------------------------------
    // recalc_formula_referencing_unset_cell (9)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_formula_referencing_unset_cell() {
        let mut sheet = MockSheet::new();
        // A1 = B1 + 10  where B1 has no value → should get RefError
        sheet.set_formula(0, 0, "B1+10");

        recalc_all(&mut sheet).unwrap();

        // Evaluation of B1 on an empty sheet returns RefError,
        // which gets mapped to #VALUE! by our error handler
        assert_eq!(
            sheet.cell(0, 0),
            Some(&CellValue::Err(CellErr::Value))
        );
    }

    // -----------------------------------------------------------------------
    // recalc_with_functions (10)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_with_functions() {
        let mut sheet = MockSheet::new();
        sheet.set_value(0, 0, CellValue::Num(5.0));
        sheet.set_value(0, 1, CellValue::Num(3.0));
        // C1 = SUM(A1, B1) = 8
        sheet.set_formula(0, 2, "SUM(A1,B1)");
        // D1 = IF(C1>5, "big", "small")
        sheet.set_formula(0, 3, "IF(C1>5,\"big\",\"small\")");

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Num(8.0)));
        assert_eq!(
            sheet.cell(0, 3),
            Some(&CellValue::Text("big".to_string()))
        );
    }

    // -----------------------------------------------------------------------
    // recalc_four_corners (11)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_four_corners() {
        // Spreadsheet with multiple independent formula regions
        let mut sheet = MockSheet::new();

        // Top-left region: A1 = 5, B1 = A1+1
        sheet.set_value(0, 0, CellValue::Num(5.0));
        sheet.set_formula(0, 1, "A1+1");

        // Bottom-right region: Z100 = 10, AA100 = Z100+2
        sheet.set_value(99, 25, CellValue::Num(10.0)); // Z100
        sheet.set_formula(99, 26, "Z100+2");           // AA100

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 1), Some(&CellValue::Num(6.0)));
        assert_eq!(sheet.cell(99, 26), Some(&CellValue::Num(12.0)));
    }

    // -----------------------------------------------------------------------
    // recalc_update_existing (12)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_update_existing() {
        let mut sheet = MockSheet::new();
        // A1 = 10, B1 = A1 * 2
        sheet.set_value(0, 0, CellValue::Num(10.0));
        sheet.set_formula(0, 1, "A1*2");

        recalc_all(&mut sheet).unwrap();
        assert_eq!(sheet.cell(0, 1), Some(&CellValue::Num(20.0)));

        // Now change A1 to 7 (simulating user edit)
        sheet.set_value(0, 0, CellValue::Num(7.0));
        // Reset B1 (since recalc_all would have written over it)
        sheet.set_formula(0, 1, "A1*2");

        recalc_all(&mut sheet).unwrap();
        assert_eq!(sheet.cell(0, 1), Some(&CellValue::Num(14.0)));
    }

    // -----------------------------------------------------------------------
    // recalc_text_concatenation (13)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_text_concatenation() {
        let mut sheet = MockSheet::new();
        sheet.set_value(0, 0, CellValue::Text("Hello".to_string()));
        sheet.set_formula(0, 1, "A1&\" World\"");

        recalc_all(&mut sheet).unwrap();

        assert_eq!(
            sheet.cell(0, 1),
            Some(&CellValue::Text("Hello World".to_string()))
        );
    }

    // -----------------------------------------------------------------------
    // recalc_boolean_formula (14)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_boolean_formula() {
        let mut sheet = MockSheet::new();
        sheet.set_value(0, 0, CellValue::Num(5.0));
        sheet.set_value(0, 1, CellValue::Num(3.0));
        sheet.set_formula(0, 2, "A1>B1");

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Bool(true)));
    }

    // -----------------------------------------------------------------------
    // recalc_large_chain_performance (15) — 1000 cells < 50 ms
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_large_chain_performance() {
        let mut sheet = MockSheet::new();

        // A1 = 1
        sheet.set_value(0, 0, CellValue::Num(1.0));

        // B1 = A1 + 1, C1 = B1 + 1, ... up to 1000 cells in a chain
        let n: u32 = 1000;
        for i in 1..=n {
            let prev = i - 1;
            // Use a simple binary expression: cell_i = cell_{i-1} + 1
            let expr = add_expr(cell_expr(0, prev), Expr::Num(1.0));
            sheet.formulas.insert((0, i), expr);
            sheet.values.insert((0, i), CellValue::Empty);
        }

        let start = std::time::Instant::now();
        recalc_all(&mut sheet).unwrap();
        let elapsed = start.elapsed();

        let last_cell = sheet.cell(0, n).cloned().unwrap_or(CellValue::Empty);
        assert_eq!(last_cell, CellValue::Num(n as f64 + 1.0));

        assert!(
            elapsed.as_millis() < 50,
            "1000-cell chain took {} ms (expected <50 ms)",
            elapsed.as_millis()
        );
    }

    // -----------------------------------------------------------------------
    // recalc_topological_order_correctness (16)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_topological_order_correctness() {
        let mut sheet = MockSheet::new();
        // Create a situation where wrong order would give wrong results:
        // A1 = 1
        // B1 = A1 + 2  → 3
        // C1 = A1 + B1 → 1 + 3 = 4
        // D1 = C1 * 2  → 8
        sheet.set_value(0, 0, CellValue::Num(1.0));
        // Use manual Expr construction to avoid parser
        let b_expr = add_expr(cell_expr(0, 0), Expr::Num(2.0));
        sheet.formulas.insert((0, 1), b_expr);
        sheet.values.insert((0, 1), CellValue::Empty);

        let c_expr = add_expr(cell_expr(0, 0), cell_expr(0, 1));
        sheet.formulas.insert((0, 2), c_expr);
        sheet.values.insert((0, 2), CellValue::Empty);

        let d_expr = mul_expr(cell_expr(0, 2), Expr::Num(2.0));
        sheet.formulas.insert((0, 3), d_expr);
        sheet.values.insert((0, 3), CellValue::Empty);

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 1), Some(&CellValue::Num(3.0)));
        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Num(4.0)));
        assert_eq!(sheet.cell(0, 3), Some(&CellValue::Num(8.0)));
    }

    // -----------------------------------------------------------------------
    // recalc_mixed_value_and_formula (17)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_mixed_value_and_formula() {
        let mut sheet = MockSheet::new();
        // A1 = 10 (direct value, not a formula)
        // B1 = 20 (direct value)
        // C1 = A1 + B1 (formula)
        // D1 = C1 + 5 (formula)
        sheet.set_value(0, 0, CellValue::Num(10.0));
        sheet.set_value(0, 1, CellValue::Num(20.0));
        sheet.set_formula(0, 2, "A1+B1");
        sheet.set_formula(0, 3, "C1+5");

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Num(30.0)));
        assert_eq!(sheet.cell(0, 3), Some(&CellValue::Num(35.0)));
    }

    // -----------------------------------------------------------------------
    // recalc_div_by_zero (18)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_div_by_zero() {
        let mut sheet = MockSheet::new();
        // A1 = 1/0 → #DIV/0!
        sheet.set_formula(0, 0, "1/0");

        recalc_all(&mut sheet).unwrap();

        // Division by zero produces DivByZero error, which is a CellErr
        assert_eq!(
            sheet.cell(0, 0),
            Some(&CellValue::Err(CellErr::DivByZero))
        );
    }

    // -----------------------------------------------------------------------
    // recalc_noop_on_no_formulas (19)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_noop_on_no_formulas() {
        let mut sheet = MockSheet::new();
        sheet.set_value(0, 0, CellValue::Num(1.0));
        sheet.set_value(1, 0, CellValue::Text("hello".to_string()));

        // No formulas registered
        assert!(recalc_all(&mut sheet).is_ok());

        // Values unchanged
        assert_eq!(sheet.cell(0, 0), Some(&CellValue::Num(1.0)));
        assert_eq!(
            sheet.cell(1, 0),
            Some(&CellValue::Text("hello".to_string()))
        );
    }

    // -----------------------------------------------------------------------
    // recalc_mutual_independence (20)
    // -----------------------------------------------------------------------

    #[test]
    fn recalc_mutual_independence() {
        let mut sheet = MockSheet::new();
        // Independent formulas — neither depends on the other
        // A1 = 5
        // B1 = 10
        // C1 = A1 * 2
        // D1 = B1 * 3
        sheet.set_value(0, 0, CellValue::Num(5.0));
        sheet.set_value(0, 1, CellValue::Num(10.0));
        sheet.set_formula(0, 2, "A1*2");
        sheet.set_formula(0, 3, "B1*3");

        recalc_all(&mut sheet).unwrap();

        assert_eq!(sheet.cell(0, 2), Some(&CellValue::Num(10.0)));
        assert_eq!(sheet.cell(0, 3), Some(&CellValue::Num(30.0)));
    }
}
