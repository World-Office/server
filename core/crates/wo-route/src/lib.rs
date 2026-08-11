// wo-route — World-Office connector routing engine
//!
//! Pure Rust connector routing for diagram/Visio-style editors. Computes
//! optimal paths between shapes while avoiding obstacles. Supports straight,
//! orthogonal, Manhattan, and Bézier routing modes.
//!
//! This crate builds on the `wo-renderer` canvas for final path rendering
//! but owns all geometric computation internally.

pub mod anchor;
pub mod astar;
pub mod bezier;

// Re-export foundational geometry types used throughout the routing engine.
pub use anchor::{Anchor, AnchorId, Point, Rect, Side};

/// Routing algorithm to use when connecting two anchor points.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RouteMode {
    /// Direct line from source to target, no obstacle avoidance.
    Straight,
    /// Right-angle turns only (horizontal/vertical segments).
    Orthogonal,
    /// Manhattan distance routing with obstacle grid.
    Manhattan,
    /// Smooth Bézier curve through computed waypoints.
    Bezier,
}

/// The main connector router. Accumulates obstacles (shape bounding boxes)
/// and routes paths between anchor points.
pub struct Router {
    obstacles: Vec<Rect>,
    grid_size: f32,
}

impl Router {
    /// Create a new router with the given obstacle-grid resolution.
    /// `grid_size` controls the granularity of the A* search grid (Manhattan mode).
    pub fn new(grid_size: f32) -> Self {
        Self {
            obstacles: Vec::new(),
            grid_size,
        }
    }

    /// Register an obstacle (typically a shape's bounding rectangle).
    pub fn add_obstacle(&mut self, r: Rect) {
        self.obstacles.push(r);
    }

    /// Route a connector between two points using the specified mode.
    /// Returns an ordered list of waypoints (at least the source and target).
    pub fn route(&self, from: Point, to: Point, mode: RouteMode) -> Vec<Point> {
        match mode {
            RouteMode::Straight => vec![from, to],
            RouteMode::Manhattan => {
                astar::astar_manhattan(from, to, &self.obstacles, self.grid_size)
            }
            RouteMode::Bezier => {
                let waypoints = astar::astar_manhattan(from, to, &self.obstacles, self.grid_size);
                if waypoints.len() < 2 {
                    waypoints
                } else {
                    let segs = bezier::smooth_bezier(&waypoints, bezier::DEFAULT_SMOOTHNESS);
                    bezier::flatten_bezier(&segs, 2.0)
                }
            }
            // Orthogonal will be implemented in RT-2.
            _ => vec![from, to],
        }
    }

    /// Return the list of registered obstacles (read-only access).
    pub fn obstacles(&self) -> &[Rect] {
        &self.obstacles
    }

    /// Grid size accessor.
    pub fn grid_size(&self) -> f32 {
        self.grid_size
    }
}
