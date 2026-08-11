//! Bézier smoothing for connector waypoints.
//!
//! Converts a sequence of raw waypoints (e.g. from Manhattan or orthogonal
//! routing) into smooth cubic Bézier curves. Uses a Catmull-Rom → cubic
//! Bézier conversion so the resulting curve passes through (or very near)
//! each original waypoint, with tangent continuity at each junction.
//!
//! **Typical usage:**
//! ```ignore
//! let segments = smooth_bezier(&waypoints, 0.3);
//! let dense = flatten_bezier(&segments, 2.0);
//! ```

use crate::{Point, Rect};

// ---------------------------------------------------------------------------
// Cubic Bézier segment
// ---------------------------------------------------------------------------

/// A cubic Bézier curve defined by four control points.
///
/// The curve starts at `p0`, ends at `p3`, and is pulled toward `p1` and `p2`.
/// Parameterised by `t ∈ [0, 1]` via [`cubic_bezier_eval`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CubicBezier {
    /// Start point (on the curve).
    pub p0: Point,
    /// First control point (near start, determines tangent at `p0`).
    pub p1: Point,
    /// Second control point (near end, determines tangent at `p3`).
    pub p2: Point,
    /// End point (on the curve).
    pub p3: Point,
}

impl CubicBezier {
    /// Create a new cubic Bézier segment from four control points.
    pub const fn new(p0: Point, p1: Point, p2: Point, p3: Point) -> Self {
        Self { p0, p1, p2, p3 }
    }

    /// Bounding box of this Bézier segment (exact for axis-aligned extremes;
    /// conservative otherwise).
    pub fn bounding_box(&self) -> Rect {
        let xs = [self.p0.x, self.p1.x, self.p2.x, self.p3.x];
        let ys = [self.p0.y, self.p1.y, self.p2.y, self.p3.y];
        let min_x = xs.into_iter().reduce(f32::min).unwrap_or(0.0);
        let max_x = xs.into_iter().reduce(f32::max).unwrap_or(0.0);
        let min_y = ys.into_iter().reduce(f32::min).unwrap_or(0.0);
        let max_y = ys.into_iter().reduce(f32::max).unwrap_or(0.0);
        Rect::new(min_x, min_y, max_x - min_x, max_y - min_y)
    }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/// Evaluate a cubic Bézier curve at parameter `t ∈ [0, 1]`.
///
/// Uses the explicit polynomial form:
/// ```text
/// B(t) = (1-t)³·P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³·P3
/// ```
///
/// **Panics** if `t < 0.0` or `t > 1.0`.
pub fn cubic_bezier_eval(bezier: &CubicBezier, t: f32) -> Point {
    assert!(
        (0.0..=1.0).contains(&t),
        "t must be in [0, 1], got {t}"
    );
    let u = 1.0 - t;
    let tt = t * t;
    let uu = u * u;
    let uuu = uu * u;
    let ttt = tt * t;

    Point::new(
        uuu * bezier.p0.x
            + 3.0 * uu * t * bezier.p1.x
            + 3.0 * u * tt * bezier.p2.x
            + ttt * bezier.p3.x,
        uuu * bezier.p0.y
            + 3.0 * uu * t * bezier.p1.y
            + 3.0 * u * tt * bezier.p2.y
            + ttt * bezier.p3.y,
    )
}

// ---------------------------------------------------------------------------
// Tangent
// ---------------------------------------------------------------------------

/// Tangent (derivative) of a cubic Bézier at parameter `t ∈ [0, 1]`.
///
/// Returns the direction vector (not normalised).
///
/// ```text
/// B'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
/// ```
pub fn cubic_bezier_tangent(bezier: &CubicBezier, t: f32) -> Point {
    assert!(
        (0.0..=1.0).contains(&t),
        "t must be in [0, 1], got {t}"
    );
    let u = 1.0 - t;
    Point::new(
        3.0 * u * u * (bezier.p1.x - bezier.p0.x)
            + 6.0 * u * t * (bezier.p2.x - bezier.p1.x)
            + 3.0 * t * t * (bezier.p3.x - bezier.p2.x),
        3.0 * u * u * (bezier.p1.y - bezier.p0.y)
            + 6.0 * u * t * (bezier.p2.y - bezier.p1.y)
            + 3.0 * t * t * (bezier.p3.y - bezier.p2.y),
    )
}

// ---------------------------------------------------------------------------
// Smoothing — waypoints → cubic Bézier segments
// ---------------------------------------------------------------------------

/// Default smoothness factor (controls how far control points spread).
pub const DEFAULT_SMOOTHNESS: f32 = 0.3;

/// Convert a sequence of waypoints into smooth cubic Bézier segments.
///
/// Uses a Catmull-Rom–style approach: for each interior waypoint the tangent
/// is estimated from its neighbours (`P_{i+1} − P_{i−1}`), and control points
/// are placed at `smoothness / 3` of that tangent distance. This gives
/// C¹-continuous curves that pass through each waypoint.
///
/// # Arguments
/// * `waypoints` — Ordered path from source to target (≥ 2 points).
///   The first and last points are passed through exactly; interior points
///   may be passed through approximately depending on the `smoothness`.
/// * `smoothness` — Controls curve tightness. `0.0` → straight line segments,
///   `1.0` → maximum curvature. Typical values: `0.2..0.4`. Use
///   [`DEFAULT_SMOOTHNESS`] for a sensible default.
///
/// # Returns
/// One [`CubicBezier`] per consecutive pair of waypoints (`n − 1` segments).
///
/// # Panics
/// Panics if `waypoints` has fewer than 2 points.
pub fn smooth_bezier(waypoints: &[Point], smoothness: f32) -> Vec<CubicBezier> {
    assert!(waypoints.len() >= 2, "need at least 2 waypoints");
    let n = waypoints.len();
    let mut segments = Vec::with_capacity(n - 1);

    for i in 0..n - 1 {
        let p0 = waypoints[i];
        let p3 = waypoints[i + 1];

        // Tangent at p0: direction from predecessor to successor.
        let tan0 = if i == 0 {
            // No predecessor → use forward difference.
            Point::new(p3.x - p0.x, p3.y - p0.y)
        } else {
            let prev = waypoints[i - 1];
            Point::new(p3.x - prev.x, p3.y - prev.y)
        };

        // Tangent at p3: direction from predecessor to successor.
        let tan3 = if i + 2 >= n {
            // No successor → use backward difference.
            Point::new(p3.x - p0.x, p3.y - p0.y)
        } else {
            let next = waypoints[i + 2];
            Point::new(next.x - p0.x, next.y - p0.y)
        };

        let scale = smoothness / 3.0;
        let p1 = Point::new(p0.x + scale * tan0.x, p0.y + scale * tan0.y);
        let p2 = Point::new(p3.x - scale * tan3.x, p3.y - scale * tan3.y);

        segments.push(CubicBezier::new(p0, p1, p2, p3));
    }

    segments
}

/// Convenience wrapper: smooth with [`DEFAULT_SMOOTHNESS`].
pub fn smooth_bezier_default(waypoints: &[Point]) -> Vec<CubicBezier> {
    smooth_bezier(waypoints, DEFAULT_SMOOTHNESS)
}

// ---------------------------------------------------------------------------
// Flattening — Bézier segments → dense point sequence
// ---------------------------------------------------------------------------

/// Flatten a sequence of cubic Bézier segments into a dense list of points
/// suitable for rendering.
///
/// Each segment is sampled at uniform `t` steps such that consecutive
/// samples are no more than `flatness` apart (Manhattan distance heuristic).
/// The minimum number of samples per segment is 4 (including endpoints).
///
/// The first point of the output is always `segments[0].p0` and the last
/// is always `segments.last().p3`. Intermediate points are sampled from
/// the curves.
pub fn flatten_bezier(segments: &[CubicBezier], flatness: f32) -> Vec<Point> {
    if segments.is_empty() {
        return Vec::new();
    }
    assert!(flatness > 0.0, "flatness must be positive");

    let mut points = Vec::new();
    for seg in segments {
        // Crude arc-length estimate (control polygon perimeter).
        let seg_len = (seg.p1.x - seg.p0.x).abs()
            + (seg.p1.y - seg.p0.y).abs()
            + (seg.p2.x - seg.p1.x).abs()
            + (seg.p2.y - seg.p1.y).abs()
            + (seg.p3.x - seg.p2.x).abs()
            + (seg.p3.y - seg.p2.y).abs();
        let subdivisions = ((seg_len / flatness).ceil().max(4.0) as usize).min(256);

        let start_t = if points.is_empty() { 0 } else { 1 };
        for j in start_t..=subdivisions {
            let t = j as f32 / subdivisions as f32;
            points.push(cubic_bezier_eval(seg, t));
        }
    }

    points
}

/// End-to-end convenience: smooth waypoints and return a dense point list.
///
/// Equivalent to `flatten_bezier(&smooth_bezier(waypoints, smoothness), flatness)`.
pub fn smooth_and_flatten(
    waypoints: &[Point],
    smoothness: f32,
    flatness: f32,
) -> Vec<Point> {
    let segments = smooth_bezier(waypoints, smoothness);
    flatten_bezier(&segments, flatness)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Helper to construct a point concisely.
    fn pt(x: f32, y: f32) -> Point {
        Point::new(x, y)
    }

    // Helper: create a Rect concisely (kept for symmetry with pt).
    #[allow(dead_code)]
    fn _rect(x: f32, y: f32, w: f32, h: f32) -> Rect {
        Rect::new(x, y, w, h)
    }

    // =========================================================================
    //  cubic_bezier_eval tests
    // =========================================================================

    #[test]
    fn eval_at_start_returns_p0() {
        let b = CubicBezier::new(pt(0.0, 0.0), pt(10.0, 20.0), pt(30.0, 20.0), pt(40.0, 0.0));
        let p = cubic_bezier_eval(&b, 0.0);
        assert_eq!(p, pt(0.0, 0.0));
    }

    #[test]
    fn eval_at_end_returns_p3() {
        let b = CubicBezier::new(pt(0.0, 0.0), pt(10.0, 20.0), pt(30.0, 20.0), pt(40.0, 0.0));
        let p = cubic_bezier_eval(&b, 1.0);
        assert_eq!(p, pt(40.0, 0.0));
    }

    #[test]
    fn eval_straight_line_is_linear() {
        // Degenerate case: all 4 control points form a straight line.
        let b =
            CubicBezier::new(pt(0.0, 0.0), pt(10.0, 0.0), pt(20.0, 0.0), pt(30.0, 0.0));
        for t_i in 0..=10 {
            let t = t_i as f32 / 10.0;
            let p = cubic_bezier_eval(&b, t);
            assert!(
                (p.y).abs() < 1e-4,
                "y should be 0 at t={t}, got {}",
                p.y
            );
            let expected_x = t * 30.0;
            assert!(
                (p.x - expected_x).abs() < 1e-4,
                "x should be {expected_x} at t={t}, got {}",
                p.x
            );
        }
    }

    #[test]
    fn eval_midpoint_symmetric_arc() {
        // Symmetric arc: midpoint should be at the peak.
        let b = CubicBezier::new(pt(0.0, 0.0), pt(10.0, 20.0), pt(30.0, 20.0), pt(40.0, 0.0));
        let p = cubic_bezier_eval(&b, 0.5);
        // At t=0.5 for symmetric curve: x should be 20.0, y > 0.
        assert!(
            (p.x - 20.0).abs() < 1e-4,
            "midpoint x should be 20.0, got {}",
            p.x
        );
        assert!(
            p.y > 0.0,
            "midpoint y should be positive for a symmetric arc"
        );
    }

    #[test]
    fn eval_out_of_range_panics_low() {
        let b =
            CubicBezier::new(pt(0.0, 0.0), pt(1.0, 1.0), pt(2.0, 2.0), pt(3.0, 3.0));
        let result = std::panic::catch_unwind(|| cubic_bezier_eval(&b, -0.1));
        assert!(result.is_err());
    }

    #[test]
    fn eval_out_of_range_panics_high() {
        let b =
            CubicBezier::new(pt(0.0, 0.0), pt(1.0, 1.0), pt(2.0, 2.0), pt(3.0, 3.0));
        let result = std::panic::catch_unwind(|| cubic_bezier_eval(&b, 1.1));
        assert!(result.is_err());
    }

    // =========================================================================
    //  cubic_bezier_tangent tests
    // =========================================================================

    #[test]
    fn tangent_at_start_points_toward_p1() {
        let b = CubicBezier::new(pt(0.0, 0.0), pt(10.0, 20.0), pt(30.0, 20.0), pt(40.0, 0.0));
        let tan = cubic_bezier_tangent(&b, 0.0);
        // B'(0) = 3(P1 - P0) = 3*(10,20) = (30,60)
        assert!((tan.x - 30.0).abs() < 1e-4);
        assert!((tan.y - 60.0).abs() < 1e-4);
    }

    #[test]
    fn tangent_at_end_points_from_p2_to_p3() {
        let b = CubicBezier::new(pt(0.0, 0.0), pt(10.0, 20.0), pt(30.0, 20.0), pt(40.0, 0.0));
        let tan = cubic_bezier_tangent(&b, 1.0);
        // B'(1) = 3(P3 - P2) = 3*(10,-20) = (30,-60)
        assert!((tan.x - 30.0).abs() < 1e-4);
        assert!((tan.y - (-60.0)).abs() < 1e-4);
    }

    #[test]
    fn tangent_straight_line_is_constant_direction() {
        let b =
            CubicBezier::new(pt(0.0, 0.0), pt(10.0, 0.0), pt(20.0, 0.0), pt(30.0, 0.0));
        for t_i in 0..=10 {
            let t = t_i as f32 / 10.0;
            let tan = cubic_bezier_tangent(&b, t);
            assert!(
                (tan.y).abs() < 1e-4,
                "tangent y should be 0 for horizontal line at t={t}"
            );
        }
    }

    // =========================================================================
    //  CubicBezier::bounding_box tests
    // =========================================================================

    #[test]
    fn bounding_box_covers_all_control_points() {
        let b =
            CubicBezier::new(pt(-10.0, -5.0), pt(5.0, 10.0), pt(15.0, 8.0), pt(20.0, -2.0));
        let bb = b.bounding_box();
        assert!(
            bb.x <= -10.0 && bb.x + bb.width >= 20.0,
            "x range should cover -10..20"
        );
        assert!(
            bb.y <= -5.0 && bb.y + bb.height >= 10.0,
            "y range should cover -5..10"
        );
    }

    // =========================================================================
    //  smooth_bezier tests
    // =========================================================================

    #[test]
    fn smooth_two_points_yields_one_segment() {
        let waypoints = [pt(0.0, 0.0), pt(100.0, 100.0)];
        let segs = smooth_bezier(&waypoints, DEFAULT_SMOOTHNESS);
        assert_eq!(segs.len(), 1);
        assert_eq!(segs[0].p0, pt(0.0, 0.0));
        assert_eq!(segs[0].p3, pt(100.0, 100.0));
    }

    #[test]
    fn smooth_two_points_with_zero_smoothness_is_linear() {
        let waypoints = [pt(0.0, 0.0), pt(100.0, 100.0)];
        let segs = smooth_bezier(&waypoints, 0.0);
        assert_eq!(segs.len(), 1);
        // Control points should equal endpoints → straight line.
        assert!(
            (segs[0].p1.x - segs[0].p0.x).abs() < 1e-6
                && (segs[0].p1.y - segs[0].p0.y).abs() < 1e-6,
            "p1 should equal p0 when smoothness=0"
        );
        assert!(
            (segs[0].p2.x - segs[0].p3.x).abs() < 1e-6
                && (segs[0].p2.y - segs[0].p3.y).abs() < 1e-6,
            "p2 should equal p3 when smoothness=0"
        );
    }

    #[test]
    fn smooth_l_shape_has_smooth_corners() {
        // L-shaped Manhattan path: right then up.
        let waypoints = [pt(0.0, 50.0), pt(50.0, 50.0), pt(50.0, 0.0)];
        let segs = smooth_bezier(&waypoints, DEFAULT_SMOOTHNESS);
        assert_eq!(segs.len(), 2);

        // First segment: starts at (0,50), ends at (50,50).
        assert_eq!(segs[0].p0, pt(0.0, 50.0));
        assert_eq!(segs[0].p3, pt(50.0, 50.0));

        // Second segment: starts at (50,50), ends at (50,0).
        assert_eq!(segs[1].p0, pt(50.0, 50.0));
        assert_eq!(segs[1].p3, pt(50.0, 0.0));

        // Control points should deviate from the straight line to smooth the corner.
        assert!(
            segs[0].p1.x > 0.0,
            "p1.x should deviate from start to smooth corner"
        );
        assert!(
            segs[1].p2.y > 0.0,
            "p2.y should deviate from end to smooth corner"
        );
    }

    #[test]
    fn smooth_z_shape_has_three_segments() {
        let waypoints = [pt(0.0, 0.0), pt(50.0, 0.0), pt(50.0, 50.0), pt(100.0, 50.0)];
        let segs = smooth_bezier(&waypoints, DEFAULT_SMOOTHNESS);
        assert_eq!(segs.len(), 3);
    }

    #[test]
    fn smooth_manhattan_path_rounds_corners() {
        // A typical Manhattan route with multiple turns.
        let waypoints = [
            pt(0.0, 0.0),
            pt(100.0, 0.0),
            pt(100.0, 80.0),
            pt(200.0, 80.0),
        ];
        let segs = smooth_bezier(&waypoints, 0.3);
        assert_eq!(segs.len(), 3);

        // All segments should share endpoints consecutively.
        for i in 0..segs.len() - 1 {
            assert_eq!(
                segs[i].p3,
                segs[i + 1].p0,
                "segments must connect at waypoint {}",
                i + 1
            );
        }

        // Flatten and check that the curve stays near the original path.
        let flat = flatten_bezier(&segs, 1.0);
        assert!(flat.len() > 4, "flattened curve should have many points");
        assert_eq!(flat.first().unwrap(), &pt(0.0, 0.0));
        assert_eq!(flat.last().unwrap(), &pt(200.0, 80.0));
    }

    #[test]
    fn smooth_high_smoothness_increases_deviation() {
        let waypoints = [pt(0.0, 0.0), pt(50.0, 0.0), pt(50.0, 50.0)];

        let segs_low = smooth_bezier(&waypoints, 0.1);
        let segs_high = smooth_bezier(&waypoints, 0.8);

        // Higher smoothness → control points further from endpoints → more deviation.
        assert!(
            segs_low[0].p1.x < segs_high[0].p1.x,
            "higher smoothness should push control point further"
        );
    }

    #[test]
    fn smooth_single_point_panics() {
        let waypoints = [pt(50.0, 50.0)];
        let result = std::panic::catch_unwind(|| smooth_bezier(&waypoints, 0.3));
        assert!(result.is_err());
    }

    #[test]
    fn smooth_empty_panics() {
        let waypoints: [Point; 0] = [];
        let result = std::panic::catch_unwind(|| smooth_bezier(&waypoints, 0.3));
        assert!(result.is_err());
    }

    #[test]
    fn smooth_default_wrapper() {
        let waypoints = [pt(0.0, 0.0), pt(100.0, 100.0)];
        let segs_default = smooth_bezier_default(&waypoints);
        let segs_explicit = smooth_bezier(&waypoints, DEFAULT_SMOOTHNESS);
        assert_eq!(segs_default.len(), segs_explicit.len());
        for (a, b) in segs_default.iter().zip(segs_explicit.iter()) {
            assert_eq!(a, b);
        }
    }

    // =========================================================================
    //  flatten_bezier tests
    // =========================================================================

    #[test]
    fn flatten_single_segment_returns_connected_points() {
        let b = CubicBezier::new(pt(0.0, 0.0), pt(10.0, 20.0), pt(30.0, 20.0), pt(40.0, 0.0));
        let pts = flatten_bezier(&[b], 2.0);
        assert!(pts.len() >= 2);
        assert_eq!(pts.first().unwrap(), &pt(0.0, 0.0));
        assert_eq!(pts.last().unwrap(), &pt(40.0, 0.0));
    }

    #[test]
    fn flatten_empty_segments_returns_empty() {
        let pts = flatten_bezier(&[], 1.0);
        assert!(pts.is_empty());
    }

    #[test]
    fn flatten_zero_flatness_panics() {
        let b =
            CubicBezier::new(pt(0.0, 0.0), pt(1.0, 1.0), pt(2.0, 2.0), pt(3.0, 3.0));
        let result = std::panic::catch_unwind(|| flatten_bezier(&[b], 0.0));
        assert!(result.is_err());
    }

    #[test]
    fn flatten_straight_line_preserves_linearity() {
        let b =
            CubicBezier::new(pt(0.0, 0.0), pt(10.0, 0.0), pt(20.0, 0.0), pt(30.0, 0.0));
        let pts = flatten_bezier(&[b], 2.0);
        for p in &pts {
            assert!(
                p.y.abs() < 1e-4,
                "flattened straight line should have y≈0, got {}",
                p.y
            );
        }
    }

    #[test]
    fn flatten_tight_flatness_produces_many_points() {
        let b = CubicBezier::new(pt(0.0, 0.0), pt(10.0, 20.0), pt(30.0, 20.0), pt(40.0, 0.0));
        let pts_loose = flatten_bezier(&[b], 20.0);
        let pts_tight = flatten_bezier(&[b], 0.5);
        assert!(
            pts_tight.len() > pts_loose.len(),
            "tighter flatness should produce more points: tight={}, loose={}",
            pts_tight.len(),
            pts_loose.len()
        );
    }

    #[test]
    fn flatten_multiple_segments_connected() {
        let b1 = CubicBezier::new(pt(0.0, 0.0), pt(5.0, 10.0), pt(15.0, 10.0), pt(20.0, 0.0));
        let b2 =
            CubicBezier::new(pt(20.0, 0.0), pt(25.0, 10.0), pt(35.0, 10.0), pt(40.0, 0.0));
        let pts = flatten_bezier(&[b1, b2], 2.0);
        assert_eq!(pts.first().unwrap(), &pt(0.0, 0.0));
        assert_eq!(pts.last().unwrap(), &pt(40.0, 0.0));
        // b1.p3 == b2.p0, so there should be no duplicate in the output.
        let junction_count = pts.iter().filter(|&&p| p == pt(20.0, 0.0)).count();
        assert_eq!(junction_count, 1, "junction should appear exactly once");
    }

    // =========================================================================
    //  smooth_and_flatten end-to-end tests
    // =========================================================================

    #[test]
    fn smooth_and_flatten_roundtrip() {
        let waypoints = [pt(0.0, 0.0), pt(50.0, 0.0), pt(50.0, 50.0), pt(100.0, 50.0)];
        let pts = smooth_and_flatten(&waypoints, 0.3, 2.0);
        assert!(
            pts.len() > 4,
            "should have many points from flattening"
        );
        assert_eq!(pts.first().unwrap(), &pt(0.0, 0.0));
        assert_eq!(pts.last().unwrap(), &pt(100.0, 50.0));
    }

    #[test]
    fn smooth_and_flatten_preserves_direction() {
        // Diagonal: curve should generally go from (0,0) toward (100,100).
        let waypoints = [pt(0.0, 0.0), pt(100.0, 100.0)];
        let pts = smooth_and_flatten(&waypoints, 0.3, 1.0);
        assert!(pts.len() >= 2);
        // x and y should be monotonically increasing (or equal) for a straight line.
        for i in 1..pts.len() {
            assert!(
                pts[i].x >= pts[i - 1].x - 1e-4,
                "x should not decrease: {} < {}",
                pts[i].x,
                pts[i - 1].x
            );
            assert!(
                pts[i].y >= pts[i - 1].y - 1e-4,
                "y should not decrease: {} < {}",
                pts[i].y,
                pts[i - 1].y
            );
        }
    }

    // =========================================================================
    //  Corner-specific tests (connector routing focus)
    // =========================================================================

    #[test]
    fn smooth_u_turn_respects_control_point_placement() {
        // U-turn path: right, down, left.
        let waypoints = [pt(0.0, 0.0), pt(50.0, 0.0), pt(50.0, 50.0), pt(0.0, 50.0)];
        let segs = smooth_bezier(&waypoints, 0.3);
        assert_eq!(segs.len(), 3);

        // Check continuity: each segment's end = next segment's start.
        for i in 0..segs.len() - 1 {
            assert_eq!(segs[i].p3, segs[i + 1].p0);
        }

        // First segment tangent at start should point right (toward first corner).
        let tan_start = cubic_bezier_tangent(&segs[0], 0.0);
        assert!(tan_start.x > 0.0, "start tangent should point right");
        assert!(
            tan_start.y.abs() < tan_start.x,
            "start tangent should be primarily horizontal"
        );

        // Last segment tangent at end should point left (from last corner).
        let tan_end = cubic_bezier_tangent(&segs[2], 1.0);
        assert!(tan_end.x < 0.0, "end tangent should point left");
    }

    #[test]
    fn smooth_zigzag_path_no_duplicate_consecutive_points() {
        // Zigzag path.
        let waypoints = [
            pt(0.0, 0.0),
            pt(50.0, 0.0),
            pt(50.0, 50.0),
            pt(0.0, 50.0),
            pt(0.0, 100.0),
            pt(50.0, 100.0),
        ];
        let segs = smooth_bezier(&waypoints, 0.2);
        let flat = flatten_bezier(&segs, 1.0);

        // Check no duplicate consecutive points.
        for i in 1..flat.len() {
            let dist = flat[i].distance_to(flat[i - 1]);
            assert!(
                dist > 0.0,
                "consecutive flattened points should not coincide"
            );
        }

        // Path should start and end correctly.
        assert_eq!(flat.first().unwrap(), &pt(0.0, 0.0));
        assert_eq!(flat.last().unwrap(), &pt(50.0, 100.0));
    }

    #[test]
    fn smooth_vertical_then_horizontal() {
        // Path: up then right (vertical-first turn).
        let waypoints = [pt(50.0, 100.0), pt(50.0, 50.0), pt(100.0, 50.0)];
        let segs = smooth_bezier(&waypoints, 0.3);
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].p0, pt(50.0, 100.0));
        assert_eq!(segs[1].p3, pt(100.0, 50.0));

        // Flatten and verify monotonic direction changes.
        let flat = flatten_bezier(&segs, 1.0);
        // First part: y should be decreasing (going up).
        let mid = flat.len() / 2;
        let first_half = &flat[..=mid];
        let y_decreasing = first_half.windows(2).all(|w| w[1].y <= w[0].y + 1e-3);
        assert!(y_decreasing, "first half should move upward (y decreasing)");

        // Last part: x should be increasing (going right).
        let second_half = &flat[mid..];
        let x_increasing = second_half.windows(2).all(|w| w[1].x >= w[0].x - 1e-3);
        assert!(x_increasing, "second half should move right (x increasing)");
    }

    // =========================================================================
    //  C¹ continuity test
    // =========================================================================

    #[test]
    fn smooth_bezier_c1_continuity_at_waypoints() {
        // For smoothness > 0, tangents should match at each junction.
        let waypoints = [pt(0.0, 0.0), pt(50.0, 50.0), pt(100.0, 0.0)];
        let segs = smooth_bezier(&waypoints, 0.3);

        // At the junction (waypoint 1): tangent from left segment at t=1
        // should be parallel to tangent from right segment at t=0.
        let tan_left = cubic_bezier_tangent(&segs[0], 1.0);
        let tan_right = cubic_bezier_tangent(&segs[1], 0.0);

        // Cross product (2D) should be ≈ 0 for parallel vectors.
        let cross = tan_left.x * tan_right.y - tan_left.y * tan_right.x;
        assert!(
            cross.abs() < 1e-3,
            "tangents should be parallel at junction (cross product = {cross})"
        );
    }

    // =========================================================================
    //  Regression: many-waypoint path
    // =========================================================================

    #[test]
    fn smooth_long_manhattan_path() {
        // Simulate a 7-turn Manhattan path.
        let waypoints = [
            pt(0.0, 0.0),
            pt(60.0, 0.0),
            pt(60.0, 30.0),
            pt(120.0, 30.0),
            pt(120.0, 60.0),
            pt(60.0, 60.0),
            pt(60.0, 90.0),
            pt(180.0, 90.0),
        ];
        let segs = smooth_bezier(&waypoints, 0.3);
        assert_eq!(segs.len(), waypoints.len() - 1);

        // All segments connect.
        for i in 0..segs.len() - 1 {
            assert_eq!(segs[i].p3, segs[i + 1].p0);
        }

        // Flatten and check bounds.
        let flat = flatten_bezier(&segs, 2.0);
        assert_eq!(flat.first().unwrap(), &pt(0.0, 0.0));
        assert_eq!(flat.last().unwrap(), &pt(180.0, 90.0));
        assert!(
            flat.len() > 20,
            "long path should produce many flattened points"
        );
    }
}
