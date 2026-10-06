//! Gradient types for canvas fills.
//!
//! Provides linear and radial gradient definitions with color stops,
//! supporting position-based color interpolation.

use crate::color::Color;

/// Type of gradient.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GradientType {
    /// Linear gradient from (start_x, start_y) to (end_x, end_y).
    Linear {
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
    },
    /// Radial gradient centered at (center_x, center_y) with given radius.
    Radial {
        center_x: f32,
        center_y: f32,
        radius: f32,
    },
}

/// A color stop along the gradient.
#[derive(Debug, Clone, PartialEq)]
pub struct GradientStop {
    /// Position along the gradient (0.0 to 1.0).
    pub offset: f32,
    /// Color at this position.
    pub color: Color,
}

impl GradientStop {
    /// Create a new gradient stop.
    pub fn new(offset: f32, color: Color) -> Self {
        Self { offset, color }
    }
}

/// A gradient definition with type and color stops.
#[derive(Debug, Clone, PartialEq)]
pub struct Gradient {
    /// The type of gradient (linear or radial).
    pub gradient_type: GradientType,
    /// Color stops defining the gradient.
    pub stops: Vec<GradientStop>,
}

impl Gradient {
    /// Create a linear gradient with the given line and stops.
    ///
    /// # Arguments
    ///
    /// * `start_x` - Starting x coordinate
    /// * `start_y` - Starting y coordinate
    /// * `end_x` - Ending x coordinate
    /// * `end_y` - Ending y coordinate
    /// * `stops` - Color stops (will be sorted by offset)
    pub fn linear(
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
        stops: Vec<GradientStop>,
    ) -> Self {
        let mut gradient = Self {
            gradient_type: GradientType::Linear {
                start_x,
                start_y,
                end_x,
                end_y,
            },
            stops,
        };
        gradient.sort_stops();
        gradient
    }

    /// Create a radial gradient with the given center and radius.
    ///
    /// # Arguments
    ///
    /// * `center_x` - Center x coordinate
    /// * `center_y` - Center y coordinate
    /// * `radius` - Radius of the gradient
    /// * `stops` - Color stops (will be sorted by offset)
    pub fn radial(center_x: f32, center_y: f32, radius: f32, stops: Vec<GradientStop>) -> Self {
        let mut gradient = Self {
            gradient_type: GradientType::Radial {
                center_x,
                center_y,
                radius,
            },
            stops,
        };
        gradient.sort_stops();
        gradient
    }

    /// Get the color at a given position t (0.0 to 1.0) along the gradient.
    ///
    /// Values outside [0.0, 1.0] are clamped.
    pub fn color_at(&self, t: f32) -> Color {
        let t = t.clamp(0.0, 1.0);

        if self.stops.is_empty() {
            return Color::TRANSPARENT;
        }

        // Single stop: return that color
        if self.stops.len() == 1 {
            return self.stops[0].color;
        }

        // Find the two stops surrounding t
        let mut start_idx = 0;
        for (i, stop) in self.stops.iter().enumerate().skip(1) {
            if stop.offset <= t {
                start_idx = i;
            } else {
                break;
            }
        }

        let start = &self.stops[start_idx];
        let end_idx = (start_idx + 1).min(self.stops.len() - 1);
        let end = &self.stops[end_idx];

        // Exact match on a stop
        if (t - start.offset).abs() < 1e-10 {
            return start.color;
        }

        // Interpolate between stops
        let range = end.offset - start.offset;
        let local_t = if range > 0.0 {
            (t - start.offset) / range
        } else {
            0.0
        };

        Color {
            r: start.color.r + (end.color.r - start.color.r) * local_t,
            g: start.color.g + (end.color.g - start.color.g) * local_t,
            b: start.color.b + (end.color.b - start.color.b) * local_t,
            a: start.color.a + (end.color.a - start.color.a) * local_t,
        }
    }

    /// Compute the gradient position t for a pixel at (x, y).
    ///
    /// Returns a value in [0.0, 1.0] for the given pixel position.
    pub fn position_at(&self, x: f32, y: f32) -> f32 {
        match self.gradient_type {
            GradientType::Linear {
                start_x,
                start_y,
                end_x,
                end_y,
            } => {
                let dx = end_x - start_x;
                let dy = end_y - start_y;
                let len_sq = dx * dx + dy * dy;

                if len_sq < 1e-10 {
                    // Degenerate gradient: return 0.0
                    return 0.0;
                }

                // Project point onto line
                let px = x - start_x;
                let py = y - start_y;
                (px * dx + py * dy) / len_sq
            }
            GradientType::Radial {
                center_x,
                center_y,
                radius,
            } => {
                if radius <= 0.0 {
                    return 0.0;
                }
                let dx = x - center_x;
                let dy = y - center_y;
                let dist = (dx * dx + dy * dy).sqrt();
                dist / radius
            }
        }
    }

    /// Sort stops by offset (ascending).
    fn sort_stops(&mut self) {
        self.stops
            .sort_by(|a, b| a.offset.partial_cmp(&b.offset).unwrap());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gradient_stop_creation() {
        let stop = GradientStop::new(0.5, Color::RED);
        assert!((stop.offset - 0.5).abs() < 0.001);
        assert_eq!(stop.color, Color::RED);
    }

    #[test]
    fn test_gradient_linear_creation() {
        let stops = vec![
            GradientStop::new(0.0, Color::RED),
            GradientStop::new(1.0, Color::BLUE),
        ];
        let grad = Gradient::linear(0.0, 0.0, 100.0, 100.0, stops);

        assert!(matches!(grad.gradient_type, GradientType::Linear { .. }));

        match grad.gradient_type {
            GradientType::Linear {
                start_x,
                start_y,
                end_x,
                end_y,
            } => {
                assert_eq!(start_x, 0.0);
                assert_eq!(start_y, 0.0);
                assert_eq!(end_x, 100.0);
                assert_eq!(end_y, 100.0);
            }
            _ => panic!("Expected linear gradient"),
        }
    }

    #[test]
    fn test_gradient_radial_creation() {
        let stops = vec![
            GradientStop::new(0.0, Color::WHITE),
            GradientStop::new(1.0, Color::BLACK),
        ];
        let grad = Gradient::radial(50.0, 50.0, 25.0, stops);

        assert!(matches!(grad.gradient_type, GradientType::Radial { .. }));

        match grad.gradient_type {
            GradientType::Radial {
                center_x,
                center_y,
                radius,
            } => {
                assert_eq!(center_x, 50.0);
                assert_eq!(center_y, 50.0);
                assert_eq!(radius, 25.0);
            }
            _ => panic!("Expected radial gradient"),
        }
    }

    #[test]
    fn test_color_at_single_stop() {
        let stops = vec![GradientStop::new(0.5, Color::RED)];
        let grad = Gradient::linear(0.0, 0.0, 100.0, 0.0, stops);

        let color = grad.color_at(0.0);
        assert_eq!(color, Color::RED);

        let color = grad.color_at(1.0);
        assert_eq!(color, Color::RED);
    }

    #[test]
    fn test_color_at_two_stops() {
        let stops = vec![
            GradientStop::new(0.0, Color::BLACK),
            GradientStop::new(1.0, Color::WHITE),
        ];
        let grad = Gradient::linear(0.0, 0.0, 100.0, 0.0, stops);

        // At t=0.0, should be black
        let color = grad.color_at(0.0);
        assert_eq!(color, Color::BLACK);

        // At t=0.5, should be gray
        let color = grad.color_at(0.5);
        assert!((color.r - 0.5).abs() < 0.001);
        assert!((color.g - 0.5).abs() < 0.001);
        assert!((color.b - 0.5).abs() < 0.001);

        // At t=1.0, should be white
        let color = grad.color_at(1.0);
        assert_eq!(color, Color::WHITE);
    }

    #[test]
    fn test_color_at_multiple_stops() {
        let stops = vec![
            GradientStop::new(0.0, Color::RED),
            GradientStop::new(0.5, Color::GREEN),
            GradientStop::new(1.0, Color::BLUE),
        ];
        let grad = Gradient::linear(0.0, 0.0, 100.0, 0.0, stops);

        // At t=0.25, should be between red and green
        let color = grad.color_at(0.25);
        assert!(color.r > 0.0 && color.r < 1.0);
        assert!(color.g > 0.0 && color.g < 1.0);

        // At t=0.75, should be between green and blue
        let color = grad.color_at(0.75);
        assert!(color.r == 0.0 || color.r < color.g); // Should have less red than green
        assert!(color.b > 0.0 && color.b < 1.0);
    }

    #[test]
    fn test_color_at_out_of_range_clamps() {
        let stops = vec![
            GradientStop::new(0.0, Color::BLACK),
            GradientStop::new(1.0, Color::WHITE),
        ];
        let grad = Gradient::linear(0.0, 0.0, 100.0, 0.0, stops);

        // Below range should clamp to first stop
        let color = grad.color_at(-0.5);
        assert_eq!(color, Color::BLACK);

        // Above range should clamp to last stop
        let color = grad.color_at(1.5);
        assert_eq!(color, Color::WHITE);
    }

    #[test]
    fn test_color_at_exact_stop_position() {
        let stops = vec![
            GradientStop::new(0.0, Color::RED),
            GradientStop::new(0.5, Color::GREEN),
            GradientStop::new(1.0, Color::BLUE),
        ];
        let grad = Gradient::linear(0.0, 0.0, 100.0, 0.0, stops);

        // At exact stop positions
        assert_eq!(grad.color_at(0.0), Color::RED);
        assert_eq!(grad.color_at(0.5), Color::GREEN);
        assert_eq!(grad.color_at(1.0), Color::BLUE);
    }

    #[test]
    fn test_gradient_equality() {
        let stops1 = vec![
            GradientStop::new(0.0, Color::RED),
            GradientStop::new(1.0, Color::BLUE),
        ];
        let stops2 = vec![
            GradientStop::new(0.0, Color::RED),
            GradientStop::new(1.0, Color::BLUE),
        ];

        let grad1 = Gradient::linear(0.0, 0.0, 100.0, 100.0, stops1);
        let grad2 = Gradient::linear(0.0, 0.0, 100.0, 100.0, stops2);

        assert_eq!(grad1, grad2);
    }

    #[test]
    fn test_linear_gradient_type() {
        let stops = vec![
            GradientStop::new(0.0, Color::RED),
            GradientStop::new(1.0, Color::BLUE),
        ];
        let grad = Gradient::linear(10.0, 20.0, 30.0, 40.0, stops);

        assert_eq!(
            grad.gradient_type,
            GradientType::Linear {
                start_x: 10.0,
                start_y: 20.0,
                end_x: 30.0,
                end_y: 40.0
            }
        );
    }

    #[test]
    fn test_radial_gradient_type() {
        let stops = vec![
            GradientStop::new(0.0, Color::RED),
            GradientStop::new(1.0, Color::BLUE),
        ];
        let grad = Gradient::radial(50.0, 60.0, 70.0, stops);

        assert_eq!(
            grad.gradient_type,
            GradientType::Radial {
                center_x: 50.0,
                center_y: 60.0,
                radius: 70.0
            }
        );
    }

    #[test]
    fn test_empty_gradient() {
        let stops: Vec<GradientStop> = vec![];
        let grad = Gradient::linear(0.0, 0.0, 100.0, 0.0, stops);

        // Empty gradient should return transparent
        let color = grad.color_at(0.5);
        assert_eq!(color, Color::TRANSPARENT);
    }
}
