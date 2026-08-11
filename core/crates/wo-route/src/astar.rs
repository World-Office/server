//! A* Manhattan pathfinding with obstacle grid.
//!
//! Implements A* search on a discretized grid using Manhattan distance
//! as the admissible heuristic. Grid cells overlapping with obstacle
//! rectangles (plus a clearance margin) are treated as impassable.
//! Movement is restricted to 4 cardinal directions (up, down, left, right).
//!
//! **Usage:**
//! ```ignore
//! let path = astar_manhattan(from, to, &obstacles, grid_size);
//! ```

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet, VecDeque};

use crate::{Point, Rect};

// ---------------------------------------------------------------------------
// Grid cell
// ---------------------------------------------------------------------------

/// Integer grid cell coordinate for A* search.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct Cell {
    gx: i32,
    gy: i32,
}

impl Cell {
    /// Map a continuous point to its containing grid cell.
    fn from_point(p: Point, grid_size: f32) -> Self {
        Self {
            gx: (p.x / grid_size).floor() as i32,
            gy: (p.y / grid_size).floor() as i32,
        }
    }

    /// Center of this cell in continuous coordinates.
    fn to_point(self, grid_size: f32) -> Point {
        Point::new(
            (self.gx as f32 + 0.5) * grid_size,
            (self.gy as f32 + 0.5) * grid_size,
        )
    }

    /// Manhattan distance to another cell.
    fn manhattan(self, other: Cell) -> u32 {
        (self.gx - other.gx).unsigned_abs() + (self.gy - other.gy).unsigned_abs()
    }

    /// Four cardinal neighbors (Manhattan connectivity).
    fn neighbors(self) -> [Cell; 4] {
        [
            Cell {
                gx: self.gx,
                gy: self.gy - 1,
            }, // up
            Cell {
                gx: self.gx,
                gy: self.gy + 1,
            }, // down
            Cell {
                gx: self.gx - 1,
                gy: self.gy,
            }, // left
            Cell {
                gx: self.gx + 1,
                gy: self.gy,
            }, // right
        ]
    }
}

// ---------------------------------------------------------------------------
// Obstacle grid
// ---------------------------------------------------------------------------

/// Build the set of grid cells blocked by obstacles.
///
/// Each obstacle is expanded by `margin` in all directions to provide
/// clearance for connector paths. Any grid cell whose center falls within
/// the expanded rectangle is marked as blocked.
fn build_blocked_set(obstacles: &[Rect], grid_size: f32, margin: f32) -> HashSet<Cell> {
    let mut blocked = HashSet::new();
    for rect in obstacles {
        let ex = rect.x - margin;
        let ey = rect.y - margin;
        let er = rect.x + rect.width + margin;
        let eb = rect.y + rect.height + margin;

        let min_gx = (ex / grid_size).floor() as i32;
        let max_gx = (er / grid_size).floor() as i32;
        let min_gy = (ey / grid_size).floor() as i32;
        let max_gy = (eb / grid_size).floor() as i32;

        for gx in min_gx..=max_gx {
            for gy in min_gy..=max_gy {
                blocked.insert(Cell { gx, gy });
            }
        }
    }
    blocked
}

// ---------------------------------------------------------------------------
// Nearest unblocked cell (BFS)
// ---------------------------------------------------------------------------

/// Find the nearest unblocked cell to `start` using BFS, or return `start`
/// itself if it is already unblocked.
fn nearest_unblocked(start: Cell, blocked: &HashSet<Cell>) -> Cell {
    if !blocked.contains(&start) {
        return start;
    }
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();
    queue.push_back(start);
    visited.insert(start);

    while let Some(current) = queue.pop_front() {
        for neighbor in current.neighbors() {
            if visited.insert(neighbor) {
                if !blocked.contains(&neighbor) {
                    return neighbor;
                }
                queue.push_back(neighbor);
            }
        }
    }
    start // fallback — should never happen on an unbounded grid
}

// ---------------------------------------------------------------------------
// A* core
// ---------------------------------------------------------------------------

/// Run A* on a 4-connected grid with Manhattan heuristic.
///
/// Returns the ordered list of cells from `start` to `goal` (inclusive),
/// or `None` if no path exists within `max_steps` steps.
///
/// **Tie-breaking:** among nodes with equal f-cost, prefers higher g-cost
/// (closer to the goal), which produces straighter paths with fewer turns.
fn astar_search(
    start: Cell,
    goal: Cell,
    blocked: &HashSet<Cell>,
    max_steps: u32,
) -> Option<Vec<Cell>> {
    if start == goal {
        return Some(vec![start]);
    }

    // Min-heap keyed by (f_cost, Reverse(g_cost), Cell).
    // `Reverse(g_cost)` means: for equal f, prefer higher g (lower Reverse(g)).
    let mut open: BinaryHeap<Reverse<(u32, Reverse<u32>, Cell)>> = BinaryHeap::new();
    let h0 = start.manhattan(goal);
    open.push(Reverse((h0, Reverse(0), start)));

    let mut best_g: HashMap<Cell, u32> = HashMap::new();
    best_g.insert(start, 0);

    let mut came_from: HashMap<Cell, Cell> = HashMap::new();
    let mut closed: HashSet<Cell> = HashSet::new();

    while let Some(Reverse((_, Reverse(g), current))) = open.pop() {
        if current == goal {
            // Reconstruct path
            let mut path = Vec::new();
            let mut node = goal;
            while let Some(&parent) = came_from.get(&node) {
                path.push(node);
                node = parent;
            }
            path.push(start);
            path.reverse();
            return Some(path);
        }

        if !closed.insert(current) {
            continue; // already expanded with ≤ current cost
        }

        if g > max_steps {
            continue;
        }

        let new_g = g + 1;
        for neighbor in current.neighbors() {
            if blocked.contains(&neighbor) || closed.contains(&neighbor) {
                continue;
            }
            let prev = best_g.get(&neighbor).copied().unwrap_or(u32::MAX);
            if new_g < prev {
                best_g.insert(neighbor, new_g);
                let f = new_g + neighbor.manhattan(goal);
                came_from.insert(neighbor, current);
                open.push(Reverse((f, Reverse(new_g), neighbor)));
            }
        }
    }

    None // no path found
}

// ---------------------------------------------------------------------------
// Path simplification
// ---------------------------------------------------------------------------

/// Remove collinear intermediate points from a Manhattan path.
///
/// Three consecutive points A → B → C are collinear in the Manhattan sense
/// when B lies on the same horizontal *or* vertical line as both A and C.
/// Such points add no turn information and are removed.
fn simplify_path(points: &mut Vec<Point>) {
    if points.len() <= 2 {
        return;
    }
    let mut out = Vec::with_capacity(points.len());
    out.push(points[0]);

    for i in 1..points.len() - 1 {
        let prev = out.last().unwrap();
        let curr = &points[i];
        let next = &points[i + 1];

        let same_h = (curr.y - prev.y).abs() < 1e-4 && (next.y - curr.y).abs() < 1e-4;
        let same_v = (curr.x - prev.x).abs() < 1e-4 && (next.x - curr.x).abs() < 1e-4;

        if !same_h && !same_v {
            out.push(*curr);
        }
    }
    out.push(*points.last().unwrap());
    *points = out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Find the shortest Manhattan-distance path between two points, avoiding obstacles.
///
/// Uses A* search on a discretized grid. Grid cells that overlap with obstacle
/// rectangles (expanded by one `grid_size` for clearance) are impassable.
/// Movement is restricted to 4 cardinal directions (Manhattan routing).
///
/// # Arguments
/// * `from` — Start point in canvas coordinates.
/// * `to` — Target point in canvas coordinates.
/// * `obstacles` — Slice of obstacle bounding rectangles (typically shape rects).
/// * `grid_size` — Resolution of the search grid. Must be > 0. Controls the
///   granularity of the path: smaller values yield smoother paths but slower
///   search.
///
/// # Returns
/// Ordered list of waypoints from `from` to `to` (always ≥ 2 when `from ≠ to`).
/// If no viable path exists around the obstacles, falls back to a direct line
/// `[from, to]`.
///
/// # Panics
/// Panics if `grid_size ≤ 0`.
pub fn astar_manhattan(from: Point, to: Point, obstacles: &[Rect], grid_size: f32) -> Vec<Point> {
    assert!(grid_size > 0.0, "grid_size must be positive");

    // Degenerate case: same point
    if (from.x - to.x).abs() < 1e-6 && (from.y - to.y).abs() < 1e-6 {
        return vec![from];
    }

    let margin = grid_size; // one grid cell of clearance around obstacles
    let blocked = build_blocked_set(obstacles, grid_size, margin);

    let start_cell = Cell::from_point(from, grid_size);
    let goal_cell = Cell::from_point(to, grid_size);

    let start = nearest_unblocked(start_cell, &blocked);
    let goal = nearest_unblocked(goal_cell, &blocked);

    // Upper bound: Manhattan distance × 10 + 1000 to handle detours
    let manhattan_dist = start.manhattan(goal);
    let max_steps = manhattan_dist.saturating_mul(10) + 1000;

    match astar_search(start, goal, &blocked, max_steps) {
        Some(cells) => {
            let mut waypoints: Vec<Point> =
                cells.iter().map(|&c| c.to_point(grid_size)).collect();

            // Simplify the grid path (all Manhattan segments) first,
            // then anchor endpoints to original coordinates.
            simplify_path(&mut waypoints);

            if let Some(first) = waypoints.first_mut() {
                *first = from;
            }
            if let Some(last) = waypoints.last_mut() {
                *last = to;
            }

            waypoints
        }
        None => vec![from, to], // fallback: direct line
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a Rect concisely.
    fn rect(x: f32, y: f32, w: f32, h: f32) -> Rect {
        Rect::new(x, y, w, h)
    }

    // =========================================================================
    //  A* search core tests
    // =========================================================================

    #[test]
    fn astar_search_finds_optimal_no_obstacles() {
        let start = Cell { gx: 0, gy: 0 };
        let goal = Cell { gx: 5, gy: 5 };
        let blocked = HashSet::new();
        let path = astar_search(start, goal, &blocked, 100).unwrap();
        assert_eq!(*path.first().unwrap(), start);
        assert_eq!(*path.last().unwrap(), goal);
        // Manhattan distance = 10, so 10 steps = 11 cells
        assert_eq!(path.len(), 11);
    }

    #[test]
    fn astar_search_start_equals_goal() {
        let cell = Cell { gx: 3, gy: 7 };
        let path = astar_search(cell, cell, &HashSet::new(), 10).unwrap();
        assert_eq!(path.len(), 1);
        assert_eq!(path[0], cell);
    }

    #[test]
    fn astar_search_blocked_goal_returns_none() {
        let start = Cell { gx: 0, gy: 0 };
        let goal = Cell { gx: 5, gy: 5 };
        // Block everything in a wide band
        let mut blocked = HashSet::new();
        for gx in -1..=6 {
            for gy in -1..=6 {
                blocked.insert(Cell { gx, gy });
            }
        }
        blocked.remove(&start); // keep start free
        // Goal is blocked; no path possible
        assert!(astar_search(start, goal, &blocked, 100).is_none());
    }

    #[test]
    fn astar_search_avoids_obstacle() {
        let start = Cell { gx: 0, gy: 5 };
        let goal = Cell { gx: 10, gy: 5 };
        // Block a wall of cells across the middle
        let mut blocked = HashSet::new();
        for gx in 3..=7 {
            blocked.insert(Cell { gx, gy: 4 });
            blocked.insert(Cell { gx, gy: 5 });
            blocked.insert(Cell { gx, gy: 6 });
        }
        let path = astar_search(start, goal, &blocked, 200).unwrap();
        assert_eq!(*path.first().unwrap(), start);
        assert_eq!(*path.last().unwrap(), goal);
        // Path must detour around the wall
        assert!(path.len() > 11); // direct would be 11 cells
    }

    // =========================================================================
    //  Cell unit tests
    // =========================================================================

    #[test]
    fn cell_manhattan_distance() {
        let a = Cell { gx: 0, gy: 0 };
        let b = Cell { gx: 3, gy: 4 };
        assert_eq!(a.manhattan(b), 7);
        assert_eq!(b.manhattan(a), 7);
    }

    #[test]
    fn cell_from_point() {
        let cell = Cell::from_point(Point::new(73.0, 41.0), 10.0);
        assert_eq!(cell.gx, 7); // floor(73/10)
        assert_eq!(cell.gy, 4); // floor(41/10)
    }

    #[test]
    fn cell_to_point_center() {
        let cell = Cell { gx: 7, gy: 4 };
        let p = cell.to_point(10.0);
        assert_eq!(p.x, 75.0); // (7 + 0.5) * 10
        assert_eq!(p.y, 45.0); // (4 + 0.5) * 10
    }

    #[test]
    fn cell_negative_coords() {
        let cell = Cell::from_point(Point::new(-5.0, -3.0), 10.0);
        assert_eq!(cell.gx, -1); // floor(-0.5) = -1
        assert_eq!(cell.gy, -1);
    }

    #[test]
    fn cell_neighbors_four_directions() {
        let cell = Cell { gx: 5, gy: 5 };
        let neighbors = cell.neighbors();
        assert_eq!(neighbors.len(), 4);
        // Check all four directions present
        assert!(neighbors.contains(&Cell { gx: 5, gy: 4 })); // up
        assert!(neighbors.contains(&Cell { gx: 5, gy: 6 })); // down
        assert!(neighbors.contains(&Cell { gx: 4, gy: 5 })); // left
        assert!(neighbors.contains(&Cell { gx: 6, gy: 5 })); // right
    }

    // =========================================================================
    //  build_blocked_set tests
    // =========================================================================

    #[test]
    fn build_blocked_set_marks_obstacle_cells() {
        let obstacles = [rect(10.0, 10.0, 20.0, 20.0)];
        let blocked = build_blocked_set(&obstacles, 10.0, 0.0);
        // Cells fully inside the obstacle should be blocked
        assert!(blocked.contains(&Cell { gx: 2, gy: 2 })); // center at (25, 25) inside
    }

    #[test]
    fn build_blocked_set_with_margin() {
        let obstacles = [rect(50.0, 50.0, 10.0, 10.0)]; // small obstacle at (50,50)-(60,60)
        let blocked = build_blocked_set(&obstacles, 10.0, 10.0); // 1-cell margin
        // Expanded rect: (40,40)-(70,70). Grid range: gx 4..=7, gy 4..=7
        assert!(blocked.contains(&Cell { gx: 5, gy: 5 })); // obstacle center cell
        assert!(blocked.contains(&Cell { gx: 4, gy: 4 })); // corner of expanded area
        assert!(blocked.contains(&Cell { gx: 7, gy: 7 })); // far corner of expanded area
        // Outside the expanded area
        assert!(!blocked.contains(&Cell { gx: 3, gy: 3 }));
        assert!(!blocked.contains(&Cell { gx: 8, gy: 8 }));
    }

    #[test]
    fn build_blocked_set_empty_obstacles() {
        let blocked = build_blocked_set(&[], 10.0, 10.0);
        assert!(blocked.is_empty());
    }

    // =========================================================================
    //  nearest_unblocked tests
    // =========================================================================

    #[test]
    fn nearest_unblocked_free_returns_self() {
        let blocked = HashSet::new();
        let cell = Cell { gx: 3, gy: 7 };
        assert_eq!(nearest_unblocked(cell, &blocked), cell);
    }

    #[test]
    fn nearest_unblocked_finds_adjacent() {
        let mut blocked = HashSet::new();
        blocked.insert(Cell { gx: 5, gy: 5 });
        let free = nearest_unblocked(Cell { gx: 5, gy: 5 }, &blocked);
        assert_ne!(free, Cell { gx: 5, gy: 5 });
        assert!(!blocked.contains(&free));
        assert_eq!(free.manhattan(Cell { gx: 5, gy: 5 }), 1);
    }

    #[test]
    fn nearest_unblocked_bfs_order() {
        // Block (0,0) and its 4 neighbors; BFS should find (1,1) or similar
        let mut blocked = HashSet::new();
        blocked.insert(Cell { gx: 0, gy: 0 });
        blocked.insert(Cell { gx: 0, gy: 1 });
        blocked.insert(Cell { gx: 0, gy: -1 });
        blocked.insert(Cell { gx: 1, gy: 0 });
        blocked.insert(Cell { gx: -1, gy: 0 });
        let free = nearest_unblocked(Cell { gx: 0, gy: 0 }, &blocked);
        assert!(!blocked.contains(&free));
        assert_eq!(free.manhattan(Cell { gx: 0, gy: 0 }), 2);
    }

    // =========================================================================
    //  simplify_path tests
    // =========================================================================

    #[test]
    fn simplify_collinear_horizontal() {
        let mut points = vec![
            Point::new(0.0, 0.0),
            Point::new(10.0, 0.0),
            Point::new(20.0, 0.0),
            Point::new(30.0, 0.0),
        ];
        simplify_path(&mut points);
        assert_eq!(points.len(), 2);
        assert_eq!(points[0], Point::new(0.0, 0.0));
        assert_eq!(points[1], Point::new(30.0, 0.0));
    }

    #[test]
    fn simplify_collinear_vertical() {
        let mut points = vec![
            Point::new(10.0, 0.0),
            Point::new(10.0, 10.0),
            Point::new(10.0, 20.0),
        ];
        simplify_path(&mut points);
        assert_eq!(points.len(), 2);
    }

    #[test]
    fn simplify_preserves_turns() {
        let mut points = vec![
            Point::new(0.0, 0.0),
            Point::new(10.0, 0.0),  // turn: horizontal → vertical
            Point::new(10.0, 10.0), // turn: vertical → horizontal
            Point::new(20.0, 10.0),
            Point::new(20.0, 20.0),
        ];
        simplify_path(&mut points);
        assert_eq!(points.len(), 5); // all are turns, nothing removed
    }

    #[test]
    fn simplify_l_shaped() {
        let mut points = vec![
            Point::new(0.0, 0.0),
            Point::new(10.0, 0.0),
            Point::new(10.0, 0.0), // duplicate turn
            Point::new(10.0, 10.0),
            Point::new(10.0, 10.0), // duplicate
            Point::new(20.0, 10.0),
        ];
        simplify_path(&mut points);
        // Duplicates are not collinear with predecessor+successor (prev→dup→next
        // has dup==prev or dup==next), so they are kept. But the first dup:
        // (0,0)→(10,0)→(10,0): same_h=true (both y=0), same_v=true (both x=10).
        // Since same_h OR same_v is true, the point is removed. Similarly for (10,10).
        assert_eq!(points.len(), 4); // start, turn1, turn2, end
    }

    #[test]
    fn simplify_two_points_unchanged() {
        let mut points = vec![Point::new(0.0, 0.0), Point::new(10.0, 10.0)];
        simplify_path(&mut points);
        assert_eq!(points.len(), 2);
    }

    #[test]
    fn simplify_single_point_unchanged() {
        let mut points = vec![Point::new(5.0, 5.0)];
        simplify_path(&mut points);
        assert_eq!(points.len(), 1);
    }

    // =========================================================================
    //  Integration: astar_manhattan public API
    // =========================================================================

    #[test]
    fn no_obstacles_returns_path() {
        let from = Point::new(0.0, 0.0);
        let to = Point::new(100.0, 100.0);
        let path = astar_manhattan(from, to, &[], 10.0);
        assert!(path.len() >= 2);
        assert_eq!(*path.first().unwrap(), from);
        assert_eq!(*path.last().unwrap(), to);
    }

    #[test]
    fn no_obstacles_short_path() {
        let from = Point::new(0.0, 0.0);
        let to = Point::new(60.0, 40.0);
        let path = astar_manhattan(from, to, &[], 10.0);
        // With no obstacles, the path should be a simple L-shape (≤ 4 waypoints)
        assert!(path.len() <= 4, "expected ≤ 4 waypoints, got {}", path.len());
    }

    #[test]
    fn no_obstacles_horizontal_line() {
        let from = Point::new(0.0, 50.0);
        let to = Point::new(200.0, 50.0);
        let path = astar_manhattan(from, to, &[], 10.0);
        assert!(path.len() <= 3, "horizontal should have ≤ 3 points, got {}", path.len());
    }

    #[test]
    fn no_obstacles_vertical_line() {
        let from = Point::new(50.0, 0.0);
        let to = Point::new(50.0, 200.0);
        let path = astar_manhattan(from, to, &[], 10.0);
        assert!(path.len() <= 3, "vertical should have ≤ 3 points, got {}", path.len());
    }

    #[test]
    fn single_obstacle_in_path() {
        let from = Point::new(0.0, 50.0);
        let to = Point::new(200.0, 50.0);
        // Obstacle directly in the middle of the path
        let obstacles = [rect(80.0, 40.0, 40.0, 20.0)];
        let path = astar_manhattan(from, to, &obstacles, 10.0);
        assert!(path.len() >= 3, "need ≥ 3 waypoints to go around");
        assert_eq!(*path.first().unwrap(), from);
        assert_eq!(*path.last().unwrap(), to);
        // Path should deviate vertically
        let deviated = path.iter().any(|p| (p.y - 50.0).abs() > 15.0);
        assert!(deviated, "path should deviate to avoid obstacle");
    }

    #[test]
    fn two_obstacles_corridor() {
        // Two obstacles with a gap between them
        let obstacles = [
            rect(80.0, 0.0, 40.0, 40.0),  // top block
            rect(80.0, 60.0, 40.0, 40.0),  // bottom block — gap at y 40–60
        ];
        let from = Point::new(0.0, 50.0);
        let to = Point::new(200.0, 50.0);
        let path = astar_manhattan(from, to, &obstacles, 10.0);
        assert!(path.len() >= 2);
        assert_eq!(*path.first().unwrap(), from);
        assert_eq!(*path.last().unwrap(), to);
    }

    #[test]
    fn start_inside_obstacle() {
        let from = Point::new(100.0, 100.0);
        let to = Point::new(300.0, 100.0);
        let obstacles = [rect(80.0, 80.0, 60.0, 60.0)]; // covers from
        let path = astar_manhattan(from, to, &obstacles, 10.0);
        assert!(path.len() >= 2);
        assert_eq!(*path.first().unwrap(), from); // still anchored to original
        assert_eq!(*path.last().unwrap(), to);
    }

    #[test]
    fn end_inside_obstacle() {
        let from = Point::new(0.0, 100.0);
        let to = Point::new(100.0, 100.0);
        let obstacles = [rect(80.0, 80.0, 60.0, 60.0)]; // covers to
        let path = astar_manhattan(from, to, &obstacles, 10.0);
        assert!(path.len() >= 2);
        assert_eq!(*path.first().unwrap(), from);
        assert_eq!(*path.last().unwrap(), to); // still anchored to original
    }

    #[test]
    fn same_point_returns_single() {
        let p = Point::new(50.0, 50.0);
        let path = astar_manhattan(p, p, &[], 10.0);
        assert_eq!(path.len(), 1);
        assert_eq!(path[0], p);
    }

    #[test]
    fn same_point_with_obstacles() {
        let p = Point::new(50.0, 50.0);
        let obstacles = [rect(40.0, 40.0, 20.0, 20.0)];
        let path = astar_manhattan(p, p, &obstacles, 10.0);
        assert_eq!(path.len(), 1);
    }

    #[test]
    fn narrow_passage_between_obstacles() {
        // Two obstacles with a narrow vertical gap (1 cell wide)
        let obstacles = [
            rect(90.0, 0.0, 20.0, 45.0),   // top block
            rect(90.0, 55.0, 20.0, 45.0),   // bottom block
        ];
        let from = Point::new(0.0, 50.0);
        let to = Point::new(200.0, 50.0);
        let path = astar_manhattan(from, to, &obstacles, 10.0);
        assert!(path.len() >= 2);
        assert_eq!(*path.first().unwrap(), from);
        assert_eq!(*path.last().unwrap(), to);
    }

    #[test]
    fn zero_grid_size_panics() {
        let from = Point::new(0.0, 0.0);
        let to = Point::new(10.0, 10.0);
        let result = std::panic::catch_unwind(|| astar_manhattan(from, to, &[], 0.0));
        assert!(result.is_err());
    }

    #[test]
    fn large_obstacle_surrounds_endpoints() {
        let from = Point::new(100.0, 100.0);
        let to = Point::new(200.0, 200.0);
        let obstacles = [rect(50.0, 50.0, 200.0, 200.0)];
        let path = astar_manhattan(from, to, &obstacles, 10.0);
        // Both endpoints inside a huge obstacle — should still return something
        assert!(path.len() >= 2);
    }

    #[test]
    fn path_avoids_corner_of_obstacle() {
        let from = Point::new(0.0, 0.0);
        let to = Point::new(100.0, 100.0);
        let obstacles = [rect(40.0, 40.0, 20.0, 20.0)];
        let path = astar_manhattan(from, to, &obstacles, 10.0);
        assert!(path.len() >= 2);
        assert_eq!(*path.first().unwrap(), from);
        assert_eq!(*path.last().unwrap(), to);
        // The path should not pass through the obstacle center
        let through_obstacle = path.iter().any(|p| {
            p.x >= 40.0 && p.x <= 60.0 && p.y >= 40.0 && p.y <= 60.0
        });
        assert!(!through_obstacle, "path should not cross obstacle interior");
    }
}
