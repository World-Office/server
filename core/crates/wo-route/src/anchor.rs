// wo-route/src/anchor.rs — Anchor points for connector routing
//!
//! Anchor points are the attachment positions on a shape's bounding rectangle
//! where connectors (lines, arrows) connect. Every rectangle has anchors on
//! each of its four sides, evenly distributed so connectors can attach at
//! visually pleasing positions without overlapping shape content.
//!
//! **Invariant:** anchor positions are computed relative to the owning shape's
//! bounding rectangle. When a shape moves, its anchors move with it (just
//! re-compute from the new `Rect`).

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/// A 2D point in canvas coordinate space (EMU-compatible, but stored as `f32`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    /// Create a new point.
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    /// Euclidean distance to another point.
    pub fn distance_to(self, other: Point) -> f32 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }

    /// Midpoint between two points.
    pub fn midpoint(a: Point, b: Point) -> Point {
        Point::new((a.x + b.x) / 2.0, (a.y + b.y) / 2.0)
    }
}

/// An axis-aligned bounding rectangle.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rect {
    /// Create a new rectangle from top-left corner and dimensions.
    pub const fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// Center point of the rectangle.
    pub fn center(&self) -> Point {
        Point::new(self.x + self.width / 2.0, self.y + self.height / 2.0)
    }

    /// Right edge x-coordinate.
    pub fn right(&self) -> f32 {
        self.x + self.width
    }

    /// Bottom edge y-coordinate.
    pub fn bottom(&self) -> f32 {
        self.y + self.height
    }
}

// ---------------------------------------------------------------------------
// Side / Anchor types
// ---------------------------------------------------------------------------

/// Which side of a rectangle an anchor sits on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Top,
    Bottom,
    Left,
    Right,
}

/// Uniquely identifies an anchor on a shape.
///
/// `(Side, index)` pairs are stable: given the same rectangle and
/// `count_per_side`, the same `AnchorId` always maps to the same position.
/// This makes anchor references serializable for undo/redo and collaboration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AnchorId {
    pub side: Side,
    pub index: usize,
}

impl AnchorId {
    /// Create a new anchor identifier.
    pub const fn new(side: Side, index: usize) -> Self {
        Self { side, index }
    }
}

/// An anchor point on a shape's boundary: position, outward-facing normal,
/// and an identifier for stable referencing.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Anchor {
    /// Position on the rectangle boundary.
    pub point: Point,
    /// Which side the anchor belongs to.
    pub side: Side,
    /// Outward-facing unit normal (perpendicular to the side).
    pub normal: Point,
    /// Stable identifier for this anchor.
    pub id: AnchorId,
}

// ---------------------------------------------------------------------------
// Anchor computation
// ---------------------------------------------------------------------------

impl Side {
    /// Outward-facing unit normal for this side.
    pub fn normal(self) -> Point {
        match self {
            Side::Top => Point::new(0.0, -1.0),
            Side::Bottom => Point::new(0.0, 1.0),
            Side::Left => Point::new(-1.0, 0.0),
            Side::Right => Point::new(1.0, 0.0),
        }
    }
}

/// Compute a single anchor position on a rectangle boundary.
///
/// Given a rectangle, a side, and the index within `count` evenly-spaced
/// anchors on that side, returns the `(Point, normal)` pair.
///
/// # Panics
/// Panics if `index >= count` or `count == 0`.
pub fn anchor_at(rect: &Rect, side: Side, index: usize, count: usize) -> (Point, Point) {
    assert!(count > 0, "count must be > 0");
    assert!(
        index < count,
        "index {index} out of range for count {count}"
    );

    let t = if count == 1 {
        0.5 // single anchor → center of side
    } else {
        index as f32 / (count - 1) as f32
    };

    let point = match side {
        Side::Top => Point::new(rect.x + t * rect.width, rect.y),
        Side::Bottom => Point::new(rect.x + t * rect.width, rect.bottom()),
        Side::Left => Point::new(rect.x, rect.y + t * rect.height),
        Side::Right => Point::new(rect.right(), rect.y + t * rect.height),
    };

    (point, side.normal())
}

/// Compute all anchor points around a rectangle, evenly distributed.
///
/// Returns `count_per_side × 4` anchors (Top → Right → Bottom → Left).
pub fn anchor_points(rect: &Rect, count_per_side: usize) -> Vec<Anchor> {
    assert!(count_per_side > 0, "count_per_side must be > 0");
    let mut anchors = Vec::with_capacity(count_per_side * 4);

    for &side in &[Side::Top, Side::Right, Side::Bottom, Side::Left] {
        for i in 0..count_per_side {
            let (point, normal) = anchor_at(rect, side, i, count_per_side);
            anchors.push(Anchor {
                point,
                side,
                normal,
                id: AnchorId::new(side, i),
            });
        }
    }

    anchors
}

/// Find the nearest anchor point on a rectangle to a given query position.
///
/// Uses `count_per_side` anchors per side (4 sides total). Returns the
/// closest anchor or `None` if `count_per_side` is zero.
pub fn nearest_anchor(rect: &Rect, query: Point, count_per_side: usize) -> Option<Anchor> {
    if count_per_side == 0 {
        return None;
    }
    anchor_points(rect, count_per_side)
        .into_iter()
        .min_by(|a, b| {
            a.point
                .distance_to(query)
                .partial_cmp(&b.point.distance_to(query))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
}

/// Find the nearest anchor **on a specific side** to a given query position.
pub fn nearest_anchor_on_side(
    rect: &Rect,
    query: Point,
    side: Side,
    count_per_side: usize,
) -> Option<Anchor> {
    if count_per_side == 0 {
        return None;
    }
    (0..count_per_side)
        .map(|i| {
            let (point, normal) = anchor_at(rect, side, i, count_per_side);
            Anchor {
                point,
                side,
                normal,
                id: AnchorId::new(side, i),
            }
        })
        .min_by(|a, b| {
            a.point
                .distance_to(query)
                .partial_cmp(&b.point.distance_to(query))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
}

// ---------------------------------------------------------------------------
// Tests — 4 per side = 16 total, plus auxiliary tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Helper: a unit square at origin.
    fn unit_rect() -> Rect {
        Rect::new(0.0, 0.0, 100.0, 80.0)
    }

    // --- Top side (4 tests) --------------------------------------------------

    #[test]
    fn top_center_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Top, 0, 1);
        assert_eq!(pt.x, 50.0, "center of top side x");
        assert_eq!(pt.y, 0.0, "top side y");
    }

    #[test]
    fn top_left_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Top, 0, 3);
        assert_eq!(pt.x, 0.0, "leftmost top anchor x");
        assert_eq!(pt.y, 0.0, "top side y");
    }

    #[test]
    fn top_right_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Top, 2, 3);
        assert_eq!(pt.x, 100.0, "rightmost top anchor x");
        assert_eq!(pt.y, 0.0, "top side y");
    }

    #[test]
    fn top_normal_points_up() {
        let r = unit_rect();
        let (_, normal) = anchor_at(&r, Side::Top, 0, 1);
        assert_eq!(normal, Point::new(0.0, -1.0));
    }

    // --- Bottom side (4 tests) ------------------------------------------------

    #[test]
    fn bottom_center_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Bottom, 0, 1);
        assert_eq!(pt.x, 50.0, "center of bottom side x");
        assert_eq!(pt.y, 80.0, "bottom side y");
    }

    #[test]
    fn bottom_left_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Bottom, 0, 3);
        assert_eq!(pt.x, 0.0, "leftmost bottom anchor x");
        assert_eq!(pt.y, 80.0, "bottom side y");
    }

    #[test]
    fn bottom_right_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Bottom, 2, 3);
        assert_eq!(pt.x, 100.0, "rightmost bottom anchor x");
        assert_eq!(pt.y, 80.0, "bottom side y");
    }

    #[test]
    fn bottom_normal_points_down() {
        let r = unit_rect();
        let (_, normal) = anchor_at(&r, Side::Bottom, 0, 1);
        assert_eq!(normal, Point::new(0.0, 1.0));
    }

    // --- Left side (4 tests) --------------------------------------------------

    #[test]
    fn left_center_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Left, 0, 1);
        assert_eq!(pt.x, 0.0, "left side x");
        assert_eq!(pt.y, 40.0, "center of left side y");
    }

    #[test]
    fn left_top_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Left, 0, 3);
        assert_eq!(pt.x, 0.0, "left side x");
        assert_eq!(pt.y, 0.0, "topmost left anchor y");
    }

    #[test]
    fn left_bottom_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Left, 2, 3);
        assert_eq!(pt.x, 0.0, "left side x");
        assert_eq!(pt.y, 80.0, "bottommost left anchor y");
    }

    #[test]
    fn left_normal_points_left() {
        let r = unit_rect();
        let (_, normal) = anchor_at(&r, Side::Left, 0, 1);
        assert_eq!(normal, Point::new(-1.0, 0.0));
    }

    // --- Right side (4 tests) -------------------------------------------------

    #[test]
    fn right_center_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Right, 0, 1);
        assert_eq!(pt.x, 100.0, "right side x");
        assert_eq!(pt.y, 40.0, "center of right side y");
    }

    #[test]
    fn right_top_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Right, 0, 3);
        assert_eq!(pt.x, 100.0, "right side x");
        assert_eq!(pt.y, 0.0, "topmost right anchor y");
    }

    #[test]
    fn right_bottom_anchor_position() {
        let r = unit_rect();
        let (pt, _) = anchor_at(&r, Side::Right, 2, 3);
        assert_eq!(pt.x, 100.0, "right side x");
        assert_eq!(pt.y, 80.0, "bottommost right anchor y");
    }

    #[test]
    fn right_normal_points_right() {
        let r = unit_rect();
        let (_, normal) = anchor_at(&r, Side::Right, 0, 1);
        assert_eq!(normal, Point::new(1.0, 0.0));
    }

    // --- Full-anchor-set tests ------------------------------------------------

    #[test]
    fn anchor_points_count() {
        let r = unit_rect();
        let anchors = anchor_points(&r, 3);
        assert_eq!(anchors.len(), 12, "3 per side × 4 sides");
    }

    #[test]
    fn anchor_points_ordering() {
        let r = unit_rect();
        let anchors = anchor_points(&r, 1);
        // Order: Top, Right, Bottom, Left
        assert_eq!(anchors.len(), 4);
        assert_eq!(anchors[0].side, Side::Top);
        assert_eq!(anchors[1].side, Side::Right);
        assert_eq!(anchors[2].side, Side::Bottom);
        assert_eq!(anchors[3].side, Side::Left);
    }

    #[test]
    fn nearest_anchor_picks_closest() {
        let r = unit_rect();
        // Query point near top-right corner → should pick a top anchor
        let anchor = nearest_anchor(&r, Point::new(90.0, -5.0), 3).unwrap();
        assert_eq!(anchor.side, Side::Top);
        assert_eq!(anchor.id.index, 2); // rightmost of 3
    }

    #[test]
    fn nearest_anchor_on_side_filters() {
        let r = unit_rect();
        let anchor = nearest_anchor_on_side(&r, Point::new(90.0, -5.0), Side::Bottom, 3).unwrap();
        assert_eq!(anchor.side, Side::Bottom);
        // With query at (90, -5), closest bottom anchor is index 2 (rightmost)
        assert_eq!(anchor.id.index, 2);
    }

    // --- Geometry helpers tests -----------------------------------------------

    #[test]
    fn point_distance_to() {
        let a = Point::new(0.0, 0.0);
        let b = Point::new(3.0, 4.0);
        assert!((a.distance_to(b) - 5.0).abs() < 1e-6);
    }

    #[test]
    fn point_midpoint() {
        let a = Point::new(0.0, 0.0);
        let b = Point::new(10.0, 20.0);
        let m = Point::midpoint(a, b);
        assert_eq!(m.x, 5.0);
        assert_eq!(m.y, 10.0);
    }

    #[test]
    fn rect_center() {
        let r = Rect::new(10.0, 20.0, 100.0, 80.0);
        let c = r.center();
        assert_eq!(c.x, 60.0);
        assert_eq!(c.y, 60.0);
    }

    // --- Edge / corner cases --------------------------------------------------

    #[test]
    #[should_panic(expected = "count must be > 0")]
    fn anchor_at_zero_count_panics() {
        let r = unit_rect();
        let _ = anchor_at(&r, Side::Top, 0, 0);
    }

    #[test]
    #[should_panic(expected = "index 3 out of range")]
    fn anchor_at_index_out_of_range_panics() {
        let r = unit_rect();
        let _ = anchor_at(&r, Side::Top, 3, 3);
    }

    #[test]
    fn nearest_anchor_zero_count_returns_none() {
        let r = unit_rect();
        assert!(nearest_anchor(&r, Point::new(0.0, 0.0), 0).is_none());
    }

    // --- AnchorId stability ---------------------------------------------------

    #[test]
    fn anchor_id_stability_same_rect() {
        let r = unit_rect();
        let a1 = anchor_points(&r, 2);
        let a2 = anchor_points(&r, 2);
        for (a, b) in a1.iter().zip(a2.iter()) {
            assert_eq!(a.id, b.id, "anchor IDs must be stable across calls");
            assert_eq!(a.point, b.point, "positions must be identical");
        }
    }

    // --- Rect with offset (non-origin) ----------------------------------------

    #[test]
    fn offset_rect_top_anchors() {
        let r = Rect::new(50.0, 30.0, 200.0, 100.0);
        let (left, _) = anchor_at(&r, Side::Top, 0, 2);
        assert_eq!(left.x, 50.0);
        assert_eq!(left.y, 30.0);

        let (right, _) = anchor_at(&r, Side::Top, 1, 2);
        assert_eq!(right.x, 250.0);
        assert_eq!(right.y, 30.0);
    }

    #[test]
    fn offset_rect_left_anchors() {
        let r = Rect::new(50.0, 30.0, 200.0, 100.0);
        let (top, _) = anchor_at(&r, Side::Left, 0, 2);
        assert_eq!(top.x, 50.0);
        assert_eq!(top.y, 30.0);

        let (bottom, _) = anchor_at(&r, Side::Left, 1, 2);
        assert_eq!(bottom.x, 50.0);
        assert_eq!(bottom.y, 130.0);
    }
}
