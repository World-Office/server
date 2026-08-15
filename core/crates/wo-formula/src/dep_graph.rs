//! Dependency graph for spreadsheet formulas.
//!
//! Tracks cell formula dependencies for recalculation order and cycle detection.
//! A cell that contains `=A1+B1` depends on cells A1 and B1. The dependency
//! graph builds forward edges (cell → its dependencies) and reverse edges
//! (cell → its dependents), enabling topological sorting and cycle detection.
//!
//! # Cycle detection
//!
//! If `A1 = B1+1` and `B1 = A1+1`, the graph contains a cycle. `detect_cycle()`
//! finds the first cycle using DFS and returns `#REF!` to the caller.

use crate::ast::Expr;
use std::collections::{HashMap, HashSet, VecDeque};

/// A dependency graph for spreadsheet cell formulas.
///
/// Maintains two adjacency structures:
/// - `forward`: cell → cells it references (its dependencies)
/// - `reverse`: cell → cells that reference it (its dependents)
///
/// Both are stored as `(row, col)` pairs with 0-based indexing.
#[derive(Debug, Clone)]
pub struct DepGraph {
    /// Forward edges: cell → set of cells it directly depends on
    forward: HashMap<(u32, u32), HashSet<(u32, u32)>>,
    /// Reverse edges: cell → set of cells that directly depend on it
    reverse: HashMap<(u32, u32), HashSet<(u32, u32)>>,
}

impl DepGraph {
    /// Create an empty dependency graph.
    pub fn new() -> Self {
        Self {
            forward: HashMap::new(),
            reverse: HashMap::new(),
        }
    }

    /// Register formula dependencies for `cell`.
    ///
    /// Extracts every cell reference from `expr` and records them as forward
    /// edges. Previous edges for this cell (from a prior formula) are removed
    /// first, so this is safe to call on re-edit.
    pub fn add_formula(&mut self, cell: (u32, u32), expr: &Expr) {
        // Remove old edges first
        self.remove_formula(cell);

        let deps = extract_cell_refs(expr, cell);
        if deps.is_empty() {
            return;
        }

        self.forward.insert(cell, deps.clone());

        for dep in &deps {
            self.reverse.entry(*dep).or_default().insert(cell);
        }
    }

    /// Remove all dependency edges for `cell`.
    ///
    /// Called when a formula is deleted or changed.
    pub fn remove_formula(&mut self, cell: (u32, u32)) {
        if let Some(old_deps) = self.forward.remove(&cell) {
            for dep in &old_deps {
                if let Some(dependents) = self.reverse.get_mut(dep) {
                    dependents.remove(&cell);
                    if dependents.is_empty() {
                        self.reverse.remove(dep);
                    }
                }
            }
        }
    }

    /// Return the set of cells that `cell` directly depends on.
    pub fn dependencies_of(&self, cell: &(u32, u32)) -> HashSet<(u32, u32)> {
        self.forward.get(cell).cloned().unwrap_or_default()
    }

    /// Return the set of cells that directly depend on `cell`.
    pub fn dependents_of(&self, cell: &(u32, u32)) -> HashSet<(u32, u32)> {
        self.reverse.get(cell).cloned().unwrap_or_default()
    }

    /// Check whether the entire graph currently contains a cycle.
    ///
    /// Returns `None` if the graph is acyclic. Returns `Some(cycle)` with the
    /// first cycle found (a list of cells in the cycle) otherwise.
    pub fn detect_cycle(&self) -> Option<Vec<(u32, u32)>> {
        // DFS with three colours: White (unvisited), Gray (in-progress), Black (done)
        enum Color {
            White,
            Gray,
            Black,
        }

        let all_nodes: HashSet<(u32, u32)> = self
            .forward
            .keys()
            .chain(self.reverse.keys())
            .copied()
            .collect();

        let mut colour: HashMap<(u32, u32), Color> =
            all_nodes.iter().map(|n| (*n, Color::White)).collect();
        // parent tracking for cycle reconstruction
        let mut parent: HashMap<(u32, u32), (u32, u32)> = HashMap::new();

        fn dfs(
            node: (u32, u32),
            graph: &HashMap<(u32, u32), HashSet<(u32, u32)>>,
            colour: &mut HashMap<(u32, u32), Color>,
            parent: &mut HashMap<(u32, u32), (u32, u32)>,
            cycle: &mut Vec<(u32, u32)>,
        ) -> bool {
            colour.insert(node, Color::Gray);

            if let Some(neighbours) = graph.get(&node) {
                for &next in neighbours {
                    match colour.get(&next) {
                        Some(Color::Gray) => {
                            // Found a cycle — reconstruct it
                            // Walk back from `node` through parents to `next`
                            let mut cur = node;
                            while cur != next {
                                cycle.push(cur);
                                cur = *parent.get(&cur).unwrap_or(&next);
                            }
                            cycle.push(next);
                            cycle.reverse();
                            return true;
                        }
                        Some(Color::White) => {
                            parent.insert(next, node);
                            if dfs(next, graph, colour, parent, cycle) {
                                return true;
                            }
                        }
                        Some(Color::Black) => {}
                        None => {}
                    }
                }
            }

            colour.insert(node, Color::Black);
            false
        }

        let mut cycle = Vec::new();
        for node in all_nodes {
            if matches!(colour.get(&node), Some(Color::White)) {
                if dfs(node, &self.forward, &mut colour, &mut parent, &mut cycle) {
                    return Some(cycle);
                }
            }
        }

        None
    }

    /// Check whether installing a formula `expr` at `cell` would introduce a
    /// cycle. Returns `true` if a cycle is detected.
    ///
    /// This is a "dry-run" check: it temporarily inserts the new edges, runs
    /// cycle detection on the modified graph, then restores the original
    /// edges.
    pub fn would_create_cycle(&self, cell: (u32, u32), expr: &Expr) -> bool {
        let deps = extract_cell_refs(expr, cell);
        if deps.is_empty() {
            return false;
        }

        // Build a scratch graph: clone self, add the proposed edges, check
        let mut scratch = self.clone();
        scratch.forward.insert(cell, deps.clone());
        for dep in &deps {
            scratch.reverse.entry(*dep).or_default().insert(cell);
        }

        scratch.detect_cycle().is_some()
    }

    /// Return the set of all cells that have registered formulas.
    pub fn all_cells(&self) -> HashSet<(u32, u32)> {
        self.forward.keys().copied().collect()
    }

    /// Return cells in topological order (dependencies before dependents).
    ///
    /// Uses Kahn's algorithm (BFS). If the graph contains a cycle, returns
    /// only the subset that can be topologically sorted (the acyclic prefix).
    pub fn topological_order(&self) -> Vec<(u32, u32)> {
        // In-degree count per node (how many dependencies it has)
        let all_nodes: HashSet<(u32, u32)> = self
            .forward
            .keys()
            .chain(self.reverse.keys())
            .copied()
            .collect();

        let mut in_degree: HashMap<(u32, u32), usize> = HashMap::new();
        for node in &all_nodes {
            let degree = self.forward.get(node).map(|deps| deps.len()).unwrap_or(0);
            in_degree.insert(*node, degree);
        }

        // Start with nodes that have zero in-degree
        let mut queue: VecDeque<(u32, u32)> = VecDeque::new();
        for (node, degree) in in_degree.iter() {
            if *degree == 0 {
                queue.push_back(*node);
            }
        }

        let mut result = Vec::with_capacity(all_nodes.len());

        while let Some(node) = queue.pop_front() {
            result.push(node);

            if let Some(dependents) = self.reverse.get(&node) {
                for &dep in dependents {
                    if let Some(deg) = in_degree.get_mut(&dep) {
                        *deg = deg.saturating_sub(1);
                        if *deg == 0 {
                            queue.push_back(dep);
                        }
                    }
                }
            }
        }

        result
    }

    /// Return the number of formula entries currently tracked.
    pub fn len(&self) -> usize {
        self.forward.len()
    }

    /// Returns `true` if no formulas are tracked.
    pub fn is_empty(&self) -> bool {
        self.forward.is_empty()
    }
}

impl Default for DepGraph {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Expression reference extraction
// ---------------------------------------------------------------------------

/// Extract all cell references from an `Expr` AST node relative to `base_cell`.
///
/// This walks the expression tree and returns a `HashSet` of `(row, col)`
/// pairs that the expression references. Range references are expanded to
/// their individual cells.
fn extract_cell_refs(expr: &Expr, base_cell: (u32, u32)) -> HashSet<(u32, u32)> {
    let mut refs = HashSet::new();
    collect_refs(expr, base_cell, &mut refs);
    refs
}

fn collect_refs(expr: &Expr, base: (u32, u32), refs: &mut HashSet<(u32, u32)>) {
    match expr {
        Expr::CellRef(cell_ref) => {
            let (row, col) = cell_ref.resolve(base.0, base.1);
            refs.insert((row, col));
        }
        Expr::RangeRef(range_ref) => {
            let (start_row, start_col) = range_ref.start.resolve(base.0, base.1);
            let (end_row, end_col) = range_ref.end.resolve(base.0, base.1);

            let r1 = start_row.min(end_row);
            let r2 = start_row.max(end_row);
            let c1 = start_col.min(end_col);
            let c2 = start_col.max(end_col);

            for row in r1..=r2 {
                for col in c1..=c2 {
                    refs.insert((row, col));
                }
            }
        }
        Expr::Binary { lhs, rhs, .. } => {
            collect_refs(lhs, base, refs);
            collect_refs(rhs, base, refs);
        }
        Expr::Unary { operand, .. } => {
            collect_refs(operand, base, refs);
        }
        Expr::Func { args, .. } => {
            for arg in args {
                collect_refs(arg, base, refs);
            }
        }
        Expr::Array(rows) => {
            for row in rows {
                for cell in row {
                    collect_refs(cell, base, refs);
                }
            }
        }
        // Literals and named ranges do not produce cell references
        Expr::Empty
        | Expr::Bool(_)
        | Expr::Num(_)
        | Expr::Text(_)
        | Expr::Date(_)
        | Expr::NamedRange(_)
        | Expr::Error(_) => {}
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{BinaryOp, CellRef, Expr};

    /// Build a CellRef expression for `(row, col)` in A1 style.
    fn cell_expr(row: u32, col: u32) -> Expr {
        Expr::CellRef(CellRef::a1(None, row, col))
    }

    /// Build a binary expression: `lhs + rhs`
    fn add_expr(lhs: Expr, rhs: Expr) -> Expr {
        Expr::Binary {
            op: BinaryOp::Add,
            lhs: Box::new(lhs),
            rhs: Box::new(rhs),
        }
    }

    /// Build a binary expression: `lhs * rhs`
    fn mul_expr(lhs: Expr, rhs: Expr) -> Expr {
        Expr::Binary {
            op: BinaryOp::Multiply,
            lhs: Box::new(lhs),
            rhs: Box::new(rhs),
        }
    }

    /// Build `FUNC(arg)` expression
    fn func_expr(name: &str, args: Vec<Expr>) -> Expr {
        Expr::Func {
            name: name.to_string(),
            args,
        }
    }

    // -----------------------------------------------------------------------
    // dep_graph_new_empty (1)
    // -----------------------------------------------------------------------

    #[test]
    fn dep_graph_new_empty() {
        let g = DepGraph::new();
        assert!(g.is_empty());
        assert_eq!(g.len(), 0);
        assert!(g.detect_cycle().is_none());
        assert!(g.topological_order().is_empty());
    }

    // -----------------------------------------------------------------------
    // dep_graph_simple_add_formula (2)
    // -----------------------------------------------------------------------

    #[test]
    fn dep_graph_simple_add_formula() {
        let mut g = DepGraph::new();

        // C1 depends on A1 and B1: =A1+B1
        let e = add_expr(cell_expr(0, 0), cell_expr(0, 1));
        g.add_formula((0, 2), &e); // C1 = (row 0, col 2)

        assert_eq!(g.len(), 1);
        let deps = g.dependencies_of(&(0, 2));
        assert_eq!(deps.len(), 2);
        assert!(deps.contains(&(0, 0))); // A1
        assert!(deps.contains(&(0, 1))); // B1

        let dep_a1 = g.dependents_of(&(0, 0));
        assert!(dep_a1.contains(&(0, 2)));
        let dep_b1 = g.dependents_of(&(0, 1));
        assert!(dep_b1.contains(&(0, 2)));

        // No cycles
        assert!(g.detect_cycle().is_none());
    }

    // -----------------------------------------------------------------------
    // dep_graph_detect_cycle (3)
    // -----------------------------------------------------------------------

    #[test]
    fn dep_graph_detect_cycle() {
        let mut g = DepGraph::new();

        // A1 depends on B1: =B1
        g.add_formula((0, 0), &cell_expr(0, 1));
        // B1 depends on A1: =A1 → cycle!
        g.add_formula((0, 1), &cell_expr(0, 0));

        let cycle = g.detect_cycle();
        assert!(cycle.is_some(), "expected a cycle between A1 and B1");

        let cycle = cycle.unwrap();
        assert_eq!(cycle.len(), 2, "cycle should have 2 cells");
        assert!(cycle.contains(&(0, 0))); // A1
        assert!(cycle.contains(&(0, 1))); // B1
    }

    // -----------------------------------------------------------------------
    // dep_graph_would_create_cycle (4)
    // -----------------------------------------------------------------------

    #[test]
    fn dep_graph_would_create_cycle() {
        let mut g = DepGraph::new();

        // A1 depends on B1
        g.add_formula((0, 0), &cell_expr(0, 1));

        // Check: installing "=A1" at B1 would create a cycle
        assert!(
            g.would_create_cycle((0, 1), &cell_expr(0, 0)),
            "adding =A1 to B1 should detect a cycle"
        );

        // But a non-cycle formula is fine
        assert!(
            !g.would_create_cycle((0, 1), &cell_expr(0, 2)),
            "adding =C1 to B1 should NOT detect a cycle"
        );

        // The original graph should still be unmodified
        assert!(g.detect_cycle().is_none());
    }

    // -----------------------------------------------------------------------
    // dep_graph_topological_order (5)
    // -----------------------------------------------------------------------

    #[test]
    fn dep_graph_topological_order() {
        let mut g = DepGraph::new();

        // C1 = A1 + B1
        g.add_formula((0, 2), &add_expr(cell_expr(0, 0), cell_expr(0, 1)));
        // D1 = C1 * 2
        g.add_formula((0, 3), &mul_expr(cell_expr(0, 2), Expr::Num(2.0)));

        let order = g.topological_order();

        // A1 and B1 must come before C1; C1 must come before D1
        let pos_a1 = order.iter().position(|c| *c == (0, 0)).unwrap();
        let pos_b1 = order.iter().position(|c| *c == (0, 1)).unwrap();
        let pos_c1 = order.iter().position(|c| *c == (0, 2)).unwrap();
        let pos_d1 = order.iter().position(|c| *c == (0, 3)).unwrap();

        assert!(pos_a1 < pos_c1, "A1 should come before C1");
        assert!(pos_b1 < pos_c1, "B1 should come before C1");
        assert!(pos_c1 < pos_d1, "C1 should come before D1");
    }

    // -----------------------------------------------------------------------
    // Additional: range references expand correctly
    // -----------------------------------------------------------------------

    #[test]
    fn dep_graph_range_ref_expansion() {
        use crate::ast::RangeRef;

        let mut g = DepGraph::new();

        // A5 = SUM(A1:B2) — should depend on A1, B1, A2, B2
        let range = Expr::RangeRef(RangeRef::new(
            None,
            CellRef::a1(None, 0, 0), // A1
            CellRef::a1(None, 1, 1), // B2
        ));
        g.add_formula((4, 0), &func_expr("SUM", vec![range]));

        let deps = g.dependencies_of(&(4, 0));
        assert_eq!(deps.len(), 4);
        assert!(deps.contains(&(0, 0))); // A1
        assert!(deps.contains(&(0, 1))); // B1
        assert!(deps.contains(&(1, 0))); // A2
        assert!(deps.contains(&(1, 1))); // B2
    }

    // -----------------------------------------------------------------------
    // Additional: remove formula cleans up edges
    // -----------------------------------------------------------------------

    #[test]
    fn dep_graph_remove_formula_cleans_edges() {
        let mut g = DepGraph::new();

        g.add_formula((0, 2), &add_expr(cell_expr(0, 0), cell_expr(0, 1)));
        assert_eq!(g.len(), 1);
        assert_eq!(g.dependents_of(&(0, 0)).len(), 1);

        g.remove_formula((0, 2));
        assert!(g.is_empty());
        assert!(g.dependents_of(&(0, 0)).is_empty());
        assert!(g.dependents_of(&(0, 1)).is_empty());
    }

    // -----------------------------------------------------------------------
    // Additional: update formula removes old edges
    // -----------------------------------------------------------------------

    #[test]
    fn dep_graph_update_formula_removes_old_edges() {
        let mut g = DepGraph::new();

        // C1 = A1 + B1
        g.add_formula((0, 2), &add_expr(cell_expr(0, 0), cell_expr(0, 1)));

        // Check initial: C1 depends on A1 and B1
        let deps = g.dependencies_of(&(0, 2));
        assert_eq!(deps.len(), 2);
        assert!(g.dependents_of(&(0, 0)).contains(&(0, 2)));

        // Update C1 to = D1 + E1 (no longer references A1, B1)
        g.add_formula((0, 2), &add_expr(cell_expr(3, 0), cell_expr(3, 1)));

        // Must still have exactly 1 formula
        assert_eq!(g.len(), 1);

        // Old edges must be gone
        let deps = g.dependencies_of(&(0, 2));
        assert_eq!(deps.len(), 2);
        assert!(deps.contains(&(3, 0))); // D1
        assert!(deps.contains(&(3, 1))); // E1
        assert!(!deps.contains(&(0, 0))); // A1 — old dep must be removed
        assert!(!deps.contains(&(0, 1))); // B1 — old dep must be removed

        // Old dependents must be cleaned up
        assert!(!g.dependents_of(&(0, 0)).contains(&(0, 2)));
        assert!(!g.dependents_of(&(0, 1)).contains(&(0, 2)));
    }
}
