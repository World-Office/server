//! Chart rendering module.
//!
//! Implements rendering of bar, line, and pie charts using the `wo-renderer` canvas.

use crate::model::{AxisPosition, Chart, ChartError, ChartKind, LegendPosition, Series};
use wo_renderer::canvas::Canvas;
use wo_renderer::color::{Color, StrokeStyle};

#[derive(Debug, Clone, Copy)]
pub struct Point { pub x: f32, pub y: f32 }
impl Point { pub const fn new(x: f32, y: f32) -> Self { Self { x, y } } }

#[derive(Debug, Clone, Copy)]
pub struct Rect { pub x: f32, pub y: f32, pub width: f32, pub height: f32 }
impl Rect {
    pub const fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self { x, y, width, height }
    }
    pub fn right(&self) -> f32 { self.x + self.width }
    pub fn bottom(&self) -> f32 { self.y + self.height }
    pub fn center(&self) -> Point { Point::new(self.x + self.width / 2.0, self.y + self.height / 2.0) }
}

pub fn render(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    canvas.save();
    canvas.begin_path();
    canvas.rect(rect.x, rect.y, rect.width, rect.height);
    canvas.clip();
    canvas.set_fill(wo_renderer::color::Paint::Color(Color::WHITE));
    canvas.fill_rect(rect.x, rect.y, rect.width, rect.height);
    let inner_rect = calculate_inner_rect(chart, rect);
    render_title(chart, canvas, rect)?;
    render_axes(chart, canvas, inner_rect)?;
    render_gridlines(chart, canvas, inner_rect)?;
    match chart.kind {
        ChartKind::Bar => render_bar_chart(chart, canvas, inner_rect),
        ChartKind::Column => render_column_chart(chart, canvas, inner_rect),
        ChartKind::Line => render_line_chart(chart, canvas, inner_rect),
        ChartKind::Pie => render_pie_chart(chart, canvas, inner_rect),
        ChartKind::Scatter => render_scatter_chart(chart, canvas, inner_rect),
        ChartKind::Area => render_area_chart(chart, canvas, inner_rect),
        ChartKind::Radar => render_radar_chart(chart, canvas, inner_rect),
        ChartKind::Doughnut => render_doughnut_chart(chart, canvas, inner_rect),
    }?;
    render_data_labels(chart, canvas, inner_rect)?;
    render_legend(chart, canvas, rect)?;
    canvas.restore();
    Ok(())
}

fn calculate_inner_rect(chart: &Chart, rect: Rect) -> Rect {
    let mut inner = rect;
    if chart.title.as_ref().is_some_and(|t| t.visible) { inner.y += 40.0; inner.height -= 40.0; }
    let legend_height = if chart.legend.as_ref().is_some_and(|l| l.visible) {
        match chart.legend.as_ref().unwrap().position { LegendPosition::Top | LegendPosition::Bottom => 40.0, _ => 100.0 }
    } else { 0.0 };
    inner.x += 40.0; inner.y += 20.0; inner.width -= 80.0; inner.height -= 40.0 + legend_height;
    inner
}

fn render_title(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if let Some(title) = &chart.title {
        if !title.visible { return Ok(()); }
        let font_size = title.font_size.unwrap_or(18);
        let text_height = font_size as f32 * 1.5;
        let text_width = estimate_text_width(&title.text, font_size);
        let title_x = rect.x + (rect.width - text_width) / 2.0;
        let title_y = rect.y + 10.0;
        canvas.set_fill(wo_renderer::color::Paint::Color(Color::new(0.9, 0.9, 0.9, 1.0)));
        canvas.fill_rect(title_x - 5.0, title_y - 5.0, text_width + 10.0, text_height + 10.0);
        canvas.set_fill(wo_renderer::color::Paint::Color(Color::BLACK));
        canvas.fill_rect(title_x, title_y, text_width, text_height);
    }
    Ok(())
}

fn estimate_text_width(text: &str, font_size: u32) -> f32 {
    text.chars().count() as f32 * font_size as f32 * 0.6
}

fn parse_hex_color(s: &str) -> Option<Color> {
    let s = s.trim_start_matches('#');
    if s.len() != 6 && s.len() != 8 { return None; }
    let r = u8::from_str_radix(&s[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&s[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&s[4..6], 16).ok()? as f32 / 255.0;
    let a = if s.len() == 8 { u8::from_str_radix(&s[6..8], 16).ok()? as f32 / 255.0 } else { 1.0 };
    Some(Color::new(r, g, b, a))
}

fn render_axes(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    let axis_color = Color::new(0.3, 0.3, 0.3, 1.0);
    let line_style = StrokeStyle { line_width: 2.0, ..Default::default() };
    for axis in &chart.axes {
        if !axis.show_labels && !axis.show_gridlines { continue; }
        canvas.set_stroke(wo_renderer::color::Paint::Color(axis_color));
        canvas.set_stroke_style(line_style.clone());
        match axis.position {
            AxisPosition::Bottom => { canvas.begin_path(); canvas.move_to(rect.x, rect.bottom()); canvas.line_to(rect.right(), rect.bottom()); canvas.stroke(); }
            AxisPosition::Left => { canvas.begin_path(); canvas.move_to(rect.x, rect.y); canvas.line_to(rect.x, rect.bottom()); canvas.stroke(); }
            AxisPosition::Right => { canvas.begin_path(); canvas.move_to(rect.right(), rect.y); canvas.line_to(rect.right(), rect.bottom()); canvas.stroke(); }
            AxisPosition::Top => { canvas.begin_path(); canvas.move_to(rect.x, rect.y); canvas.line_to(rect.right(), rect.y); canvas.stroke(); }
        }
    }
    Ok(())
}

fn render_gridlines(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    let grid_color = Color::new(0.85, 0.85, 0.85, 1.0);
    let line_style = StrokeStyle { line_width: 1.0, ..Default::default() };
    canvas.set_stroke(wo_renderer::color::Paint::Color(grid_color));
    canvas.set_stroke_style(line_style);
    let chart_kind = chart.kind;
    if matches!(chart_kind, ChartKind::Bar | ChartKind::Column | ChartKind::Line | ChartKind::Area | ChartKind::Scatter) {
        let num_lines = 5;
        let line_height = rect.height / (num_lines as f32 - 1.0);
        for i in 1..num_lines {
            let y = rect.y + (i as f32) * line_height;
            canvas.begin_path(); canvas.move_to(rect.x, y); canvas.line_to(rect.right(), y); canvas.stroke();
        }
    }
    Ok(())
}

fn find_max_value(chart: &Chart) -> f32 {
    chart.series.iter().filter(|s| s.visible).flat_map(|s| s.data.iter()).map(|p| p.value as f32).fold(0.0f32, f32::max)
}

fn default_series_color(series_idx: usize) -> Color {
    let colors = [ (0.26, 0.45, 0.75), (0.90, 0.40, 0.15), (0.35, 0.65, 0.30), (0.80, 0.20, 0.25), (0.55, 0.35, 0.65), (0.95, 0.75, 0.15), (0.15, 0.55, 0.55), (0.70, 0.30, 0.50) ];
    let color = colors[series_idx % colors.len()];
    Color::new(color.0, color.1, color.2, 1.0)
}

fn render_bar_chart(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if chart.series.is_empty() { return Ok(()); }
    let x = rect.x; let y = rect.y; let width = rect.width; let height = rect.height;
    let num_series = chart.series.len();
    let bar_height = height / (num_series as f32 + 1.0);
    let max_value = find_max_value(chart);
    if max_value <= 0.0 { return Ok(()); }
    let mut current_y = y + bar_height;
    for (series_idx, series) in chart.series.iter().enumerate() {
        if !series.visible { continue; }
        let bar_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
        canvas.set_fill(wo_renderer::color::Paint::Color(bar_color));
        for (point_idx, point) in series.data.iter().enumerate() {
            let point_value = point.value as f32;
            let bar_width = (point_value / max_value) * width * 0.95;
            let bar_x = x + 10.0 + (point_idx as f32) * (width * 0.95 / series.data.len() as f32);
            let bar_y = current_y - bar_height * 0.8;
            canvas.begin_path(); canvas.rect(bar_x, bar_y, bar_width.clamp(0.0, width), bar_height * 0.8); canvas.fill();
        }
        current_y += bar_height;
    }
    Ok(())
}

fn render_column_chart(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if chart.series.is_empty() { return Ok(()); }
    let x = rect.x; let y = rect.y; let width = rect.width; let height = rect.height;
    let num_series = chart.series.len();
    let num_points = chart.series[0].data.len().max(1);
    let max_value = find_max_value(chart);
    if max_value <= 0.0 { return Ok(()); }
    let total_series_width = width * 0.95;
    let group_width = total_series_width / (num_points as f32);
    let column_width = group_width / (num_series as f32 + 1.0);
    let scale = height * 0.95 / max_value;
    for (point_idx, _) in chart.series[0].data.iter().enumerate() {
        let group_x = x + 10.0 + (point_idx as f32) * group_width;
        for (series_idx, series) in chart.series.iter().enumerate() {
            if !series.visible { continue; }
            let point = match series.data.get(point_idx) { Some(p) => p, None => continue };
            let column_height = (point.value as f32 * scale).clamp(0.0, height);
            let column_y = y + height - column_height - 10.0;
            let bar_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
            canvas.set_fill(wo_renderer::color::Paint::Color(bar_color));
            let column_x = group_x + (series_idx as f32 + 1.0) * column_width * 0.8;
            canvas.begin_path(); canvas.rect(column_x, column_y, column_width * 0.8, column_height); canvas.fill();
        }
    }
    Ok(())
}

fn render_line_chart(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if chart.series.is_empty() { return Ok(()); }
    let x = rect.x; let y = rect.y; let width = rect.width; let height = rect.height;
    let num_points = chart.series[0].data.len().max(1);
    let max_value = find_max_value(chart);
    if max_value <= 0.0 { return Ok(()); }
    let point_spacing = width * 0.95 / (num_points as f32 - 1.0).max(1.0);
    let scale = height * 0.95 / max_value;
    let line_style = StrokeStyle { line_width: 3.0, ..Default::default() };
    for (series_idx, series) in chart.series.iter().enumerate() {
        if !series.visible { continue; }
        let line_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
        canvas.set_stroke(wo_renderer::color::Paint::Color(line_color));
        canvas.set_stroke_style(line_style.clone());
        canvas.begin_path();
        let mut first_point = true;
        for (point_idx, point) in series.data.iter().enumerate() {
            let px = x + 10.0 + (point_idx as f32) * point_spacing;
            let py = y + height - (point.value as f32 * scale) - 10.0;
            if first_point { canvas.move_to(px, py); first_point = false; } else { canvas.line_to(px, py); }
        }
        canvas.stroke();
        draw_line_markers(chart, canvas, rect, series_idx, series)?;
    }
    Ok(())
}

fn draw_line_markers(chart: &Chart, canvas: &mut Canvas, rect: Rect, series_idx: usize, series: &Series) -> Result<(), ChartError> {
    let x = rect.x; let y = rect.y; let width = rect.width; let height = rect.height;
    let num_points = series.data.len().max(1);
    let max_value = find_max_value(chart);
    if max_value <= 0.0 { return Ok(()); }
    let point_spacing = width * 0.95 / (num_points as f32 - 1.0).max(1.0);
    let scale = height * 0.95 / max_value;
    let marker_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
    let white_style = StrokeStyle { line_width: 2.0, ..Default::default() };
    for (point_idx, point) in series.data.iter().enumerate() {
        let cx = x + 10.0 + (point_idx as f32) * point_spacing;
        let cy = y + height - (point.value as f32 * scale) - 10.0;
        let radius = 5.0;
        canvas.set_fill(wo_renderer::color::Paint::Color(marker_color));
        canvas.begin_path(); canvas.circle(cx, cy, radius); canvas.fill();
        canvas.set_stroke(wo_renderer::color::Paint::Color(Color::WHITE));
        canvas.set_stroke_style(white_style.clone());
        canvas.begin_path(); canvas.circle(cx, cy, radius); canvas.stroke();
    }
    Ok(())
}

fn render_pie_chart(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if chart.series.is_empty() { return Ok(()); }
    let center_x = rect.x + rect.width / 2.0;
    let center_y = rect.y + rect.height / 2.0;
    let radius = (rect.width.min(rect.height) / 2.0) * 0.9;
    let data_points = &chart.series[0].data;
    if data_points.is_empty() { return Ok(()); }
    let total: f32 = data_points.iter().map(|p| p.value as f32).sum();
    if total <= 0.0 { return Ok(()); }
    let mut current_angle = -std::f32::consts::PI / 2.0;
    let white_style = StrokeStyle { line_width: 1.0, ..Default::default() };
    for (point_idx, point) in data_points.iter().enumerate() {
        let point_value = point.value as f32;
        let slice_angle = (point_value / total) * 2.0 * std::f32::consts::PI;
        let series_idx = 0;
        let slice_color = chart.series[series_idx].color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(point_idx));
        canvas.set_fill(wo_renderer::color::Paint::Color(slice_color));
        canvas.begin_path(); canvas.move_to(center_x, center_y);
        canvas.line_to(center_x + (current_angle.cos() * radius), center_y + (current_angle.sin() * radius));
        let end_angle = current_angle + slice_angle;
        canvas.line_to(center_x + (end_angle.cos() * radius), center_y + (end_angle.sin() * radius));
        canvas.close_path(); canvas.fill();
        canvas.set_stroke(wo_renderer::color::Paint::Color(Color::WHITE));
        canvas.set_stroke_style(white_style.clone());
        canvas.begin_path(); canvas.move_to(center_x, center_y);
        canvas.line_to(center_x + (current_angle.cos() * radius), center_y + (current_angle.sin() * radius));
        canvas.line_to(center_x + (end_angle.cos() * radius), center_y + (end_angle.sin() * radius));
        canvas.close_path(); canvas.stroke();
        current_angle = end_angle;
    }
    Ok(())
}

fn render_scatter_chart(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if chart.series.is_empty() { return Ok(()); }
    let x = rect.x; let y = rect.y; let width = rect.width; let height = rect.height;
    let num_points = chart.series[0].data.len().max(1);
    let max_value = chart.series.iter().filter(|s| s.visible).flat_map(|s| s.data.iter()).map(|p| p.value as f32).fold(0.0f32, f32::max);
    if max_value <= 0.0 { return Ok(()); }
    let point_spacing = width * 0.95 / (num_points as f32 - 1.0).max(1.0);
    let y_scale = height * 0.95 / max_value.max(1.0);
    for (series_idx, series) in chart.series.iter().enumerate() {
        if !series.visible { continue; }
        let marker_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
        let white_style = StrokeStyle { line_width: 2.0, ..Default::default() };
        for (point_idx, point) in series.data.iter().enumerate() {
            let px = x + 10.0 + (point_idx as f32) * point_spacing;
            let py = y + height - (point.value as f32 * y_scale) - 10.0;
            let radius = 6.0;
            canvas.set_fill(wo_renderer::color::Paint::Color(marker_color));
            canvas.begin_path(); canvas.circle(px, py, radius); canvas.fill();
            canvas.set_stroke(wo_renderer::color::Paint::Color(Color::WHITE));
            canvas.set_stroke_style(white_style.clone());
            canvas.begin_path(); canvas.circle(px, py, radius); canvas.stroke();
        }
    }
    Ok(())
}

fn render_area_chart(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if chart.series.is_empty() { return Ok(()); }
    let x = rect.x; let y = rect.y; let width = rect.width; let height = rect.height;
    let num_points = chart.series[0].data.len().max(1);
    let max_value = find_max_value(chart);
    if max_value <= 0.0 { return Ok(()); }
    let point_spacing = width * 0.95 / (num_points as f32 - 1.0).max(1.0);
    let scale = height * 0.95 / max_value;
    for (series_idx, series) in chart.series.iter().enumerate() {
        if !series.visible { continue; }
        let fill_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
        let alpha_color = Color::new(fill_color.r, fill_color.g, fill_color.b, 0.6);
        let line_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
        let line_style = StrokeStyle { line_width: 2.0, ..Default::default() };
        if series.data.len() >= 2 {
            canvas.set_fill(wo_renderer::color::Paint::Color(alpha_color));
            canvas.begin_path();
            let first_x = x + 10.0;
            let first_y = y + height - (series.data[0].value as f32 * scale) - 10.0;
            canvas.move_to(first_x, first_y);
            for (point_idx, point) in series.data.iter().enumerate() {
                let px = x + 10.0 + (point_idx as f32) * point_spacing;
                let py = y + height - (point.value as f32 * scale) - 10.0;
                canvas.line_to(px, py);
            }
            for (point_idx, _) in series.data.iter().enumerate().rev() {
                let px = x + 10.0 + (point_idx as f32) * point_spacing;
                let bottom_y = y + height - 10.0;
                canvas.line_to(px, bottom_y);
            }
            canvas.close_path();
            canvas.fill();
            canvas.set_stroke(wo_renderer::color::Paint::Color(line_color));
            canvas.set_stroke_style(line_style.clone());
            canvas.begin_path();
            let mut first_point = true;
            for (point_idx, point) in series.data.iter().enumerate() {
                let px = x + 10.0 + (point_idx as f32) * point_spacing;
                let py = y + height - (point.value as f32 * scale) - 10.0;
                if first_point { canvas.move_to(px, py); first_point = false; } else { canvas.line_to(px, py); }
            }
            canvas.stroke();
        }
    }
    Ok(())
}

fn render_radar_chart(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if chart.series.is_empty() { return Ok(()); }
    let center_x = rect.x + rect.width / 2.0;
    let center_y = rect.y + rect.height / 2.0;
    let radius = (rect.width.min(rect.height) / 2.0) * 0.85;
    let max_value = find_max_value(chart);
    if max_value <= 0.0 { return Ok(()); }
    let scale = radius / max_value;
    let white_style = StrokeStyle { line_width: 1.0, ..Default::default() };
    let line_style = StrokeStyle { line_width: 2.0, ..Default::default() };
    let num_points = chart.series[0].data.len().max(1);
    let point_angle_step = 2.0 * std::f32::consts::PI / (num_points as f32);
    for (series_idx, series) in chart.series.iter().enumerate() {
        if !series.visible { continue; }
        let series_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
        let alpha_color = Color::new(series_color.r, series_color.g, series_color.b, 0.4);
        canvas.set_fill(wo_renderer::color::Paint::Color(alpha_color));
        canvas.begin_path();
        for (point_idx, point) in series.data.iter().enumerate() {
            let angle = (point_idx as f32) * point_angle_step - std::f32::consts::PI / 2.0;
            let value_radius = (point.value as f32 * scale).clamp(0.0, radius);
            let px = center_x + angle.cos() * value_radius;
            let py = center_y + angle.sin() * value_radius;
            if point_idx == 0 { canvas.move_to(px, py); } else { canvas.line_to(px, py); }
        }
        canvas.close_path();
        canvas.fill();
        canvas.set_stroke(wo_renderer::color::Paint::Color(series_color));
        canvas.set_stroke_style(line_style.clone());
        canvas.begin_path();
        for (point_idx, point) in series.data.iter().enumerate() {
            let angle = (point_idx as f32) * point_angle_step - std::f32::consts::PI / 2.0;
            let value_radius = (point.value as f32 * scale).clamp(0.0, radius);
            let px = center_x + angle.cos() * value_radius;
            let py = center_y + angle.sin() * value_radius;
            if point_idx == 0 { canvas.move_to(px, py); } else { canvas.line_to(px, py); }
        }
        canvas.close_path();
        canvas.stroke();
        let marker_radius = 4.0;
        for (point_idx, point) in series.data.iter().enumerate() {
            let angle = (point_idx as f32) * point_angle_step - std::f32::consts::PI / 2.0;
            let value_radius = (point.value as f32 * scale).clamp(0.0, radius);
            let px = center_x + angle.cos() * value_radius;
            let py = center_y + angle.sin() * value_radius;
            canvas.set_fill(wo_renderer::color::Paint::Color(series_color));
            canvas.begin_path(); canvas.circle(px, py, marker_radius); canvas.fill();
            canvas.set_stroke(wo_renderer::color::Paint::Color(Color::WHITE));
            canvas.set_stroke_style(white_style.clone());
            canvas.begin_path(); canvas.circle(px, py, marker_radius); canvas.stroke();
        }
    }
    Ok(())
}

fn render_doughnut_chart(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if chart.series.is_empty() { return Ok(()); }
    let center_x = rect.x + rect.width / 2.0;
    let center_y = rect.y + rect.height / 2.0;
    let outer_radius = (rect.width.min(rect.height) / 2.0) * 0.9;
    let inner_radius = outer_radius * 0.5;
    let data_points = &chart.series[0].data;
    if data_points.is_empty() { return Ok(()); }
    let total: f32 = data_points.iter().map(|p| p.value as f32).sum();
    if total <= 0.0 { return Ok(()); }
    let mut current_angle = -std::f32::consts::PI / 2.0;
    let white_style = StrokeStyle { line_width: 1.0, ..Default::default() };
    for (point_idx, point) in data_points.iter().enumerate() {
        let point_value = point.value as f32;
        let slice_angle = (point_value / total) * 2.0 * std::f32::consts::PI;
        let series_idx = 0;
        let slice_color = chart.series[series_idx].color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(point_idx));
        let end_angle = current_angle + slice_angle;
        canvas.set_fill(wo_renderer::color::Paint::Color(slice_color));
        canvas.begin_path();
        canvas.move_to(center_x + (current_angle.cos() * outer_radius), center_y + (current_angle.sin() * outer_radius));
        let num_segments = 32;
        for i in 1..=num_segments {
            let angle = current_angle + (i as f32) * slice_angle / (num_segments as f32);
            canvas.line_to(center_x + (angle.cos() * outer_radius), center_y + (angle.sin() * outer_radius));
        }
        for i in (0..=num_segments).rev() {
            let angle = current_angle + (i as f32) * slice_angle / (num_segments as f32);
            canvas.line_to(center_x + (angle.cos() * inner_radius), center_y + (angle.sin() * inner_radius));
        }
        canvas.close_path();
        canvas.fill();
        canvas.set_stroke(wo_renderer::color::Paint::Color(Color::WHITE));
        canvas.set_stroke_style(white_style.clone());
        canvas.begin_path();
        canvas.move_to(center_x + (current_angle.cos() * outer_radius), center_y + (current_angle.sin() * outer_radius));
        for i in 1..=num_segments {
            let angle = current_angle + (i as f32) * slice_angle / (num_segments as f32);
            canvas.line_to(center_x + (angle.cos() * outer_radius), center_y + (angle.sin() * outer_radius));
        }
        for i in (0..=num_segments).rev() {
            let angle = current_angle + (i as f32) * slice_angle / (num_segments as f32);
            canvas.line_to(center_x + (angle.cos() * inner_radius), center_y + (angle.sin() * inner_radius));
        }
        canvas.close_path();
        canvas.stroke();
        current_angle = end_angle;
    }
    Ok(())
}

fn render_data_labels(chart: &Chart, _canvas: &mut Canvas, _rect: Rect) -> Result<(), ChartError> {
    if let Some(labels) = &chart.data_labels { if labels.visible { } } Ok(())
}

fn render_legend(chart: &Chart, canvas: &mut Canvas, rect: Rect) -> Result<(), ChartError> {
    if let Some(legend) = &chart.legend {
        if !legend.visible { return Ok(()); }
        let legend_x = match legend.position {
            LegendPosition::Left => rect.x + 10.0, LegendPosition::Right => rect.right() - 120.0,
            LegendPosition::Top | LegendPosition::TopRight => rect.x + (rect.width - 100.0), LegendPosition::Bottom => rect.x + (rect.width - 100.0) / 2.0,
        };
        let legend_y = match legend.position {
            LegendPosition::Top | LegendPosition::TopRight => rect.y + 20.0, LegendPosition::Bottom => rect.bottom() - 30.0,
            LegendPosition::Left | LegendPosition::Right => rect.y + (rect.height - (chart.series.len() as f32 * 25.0)) / 2.0,
        };
        canvas.set_fill(wo_renderer::color::Paint::Color(Color::new(0.95, 0.95, 0.95, 0.9)));
        let legend_width = 100.0; let legend_height = (chart.series.len() as f32 * 25.0).max(25.0);
        canvas.fill_rect(legend_x, legend_y, legend_width, legend_height);
        for (series_idx, series) in chart.series.iter().enumerate() {
            if !series.visible { continue; }
            let entry_y = legend_y + (series_idx as f32) * 25.0;
            let swatch_color = series.color.as_ref().and_then(|c| parse_hex_color(c)).unwrap_or_else(|| default_series_color(series_idx));
            canvas.set_fill(wo_renderer::color::Paint::Color(swatch_color));
            canvas.fill_rect(legend_x + 5.0, entry_y + 5.0, 15.0, 15.0);
            let text_width = estimate_text_width(&series.name, 12);
            canvas.set_fill(wo_renderer::color::Paint::Color(Color::BLACK));
            canvas.fill_rect(legend_x + 25.0, entry_y + 5.0, text_width, 15.0);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Chart, ChartKind, DataPoint, Series};
    use wo_renderer::canvas::Canvas;

    mod render_bar_line_pie {
        use super::*;

        #[test] fn render_bar_chart_basic() {
            let mut chart = Chart::new(ChartKind::Bar);
            chart.add_series(Series::new("Test", vec![DataPoint::new(10.0), DataPoint::new(20.0), DataPoint::new(30.0)]));
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_column_chart_basic() {
            let mut chart = Chart::new(ChartKind::Column);
            chart.add_series(Series::new("Test", vec![DataPoint::new(10.0), DataPoint::new(20.0), DataPoint::new(30.0)]));
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_line_chart_basic() {
            let mut chart = Chart::new(ChartKind::Line);
            chart.add_series(Series::new("Test", vec![DataPoint::new(10.0), DataPoint::new(20.0), DataPoint::new(15.0), DataPoint::new(25.0)]));
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_pie_chart_basic() {
            let mut chart = Chart::new(ChartKind::Pie);
            chart.add_series(Series::new("Test", vec![DataPoint::new(25.0), DataPoint::new(25.0), DataPoint::new(50.0)]));
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_bar_chart_with_multiple_series() {
            let mut chart = Chart::new(ChartKind::Bar);
            let mut series1 = Series::new("Series A", vec![DataPoint::new(10.0), DataPoint::new(20.0)]);
            series1.color = Some("#FF0000".to_string()); chart.add_series(series1);
            let mut series2 = Series::new("Series B", vec![DataPoint::new(15.0), DataPoint::new(25.0)]);
            series2.color = Some("#00FF00".to_string()); chart.add_series(series2);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_line_chart_with_multiple_series() {
            let mut chart = Chart::new(ChartKind::Line);
            let mut series1 = Series::new("Series A", vec![DataPoint::new(10.0), DataPoint::new(20.0), DataPoint::new(15.0)]);
            series1.color = Some("#FF0000".to_string()); chart.add_series(series1);
            let mut series2 = Series::new("Series B", vec![DataPoint::new(15.0), DataPoint::new(25.0), DataPoint::new(30.0)]);
            series2.color = Some("#0000FF".to_string()); chart.add_series(series2);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_pie_chart_with_categories() {
            let mut chart = Chart::new(ChartKind::Pie);
            let mut series = Series::new("Data", vec![DataPoint::with_category(30.0, "Category A"), DataPoint::with_category(40.0, "Category B"), DataPoint::with_category(30.0, "Category C")]);
            series.color = Some("#FF00FF".to_string()); chart.add_series(series);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_empty_chart() {
            let chart = Chart::new(ChartKind::Bar);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_chart_with_hidden_series() {
            let mut chart = Chart::new(ChartKind::Line);
            let mut visible_series = Series::new("Visible", vec![DataPoint::new(10.0), DataPoint::new(20.0)]);
            visible_series.visible = true; chart.add_series(visible_series);
            let mut hidden_series = Series::new("Hidden", vec![DataPoint::new(5.0), DataPoint::new(15.0)]);
            hidden_series.visible = false; chart.add_series(hidden_series);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }
    }

    mod render_scatter_area_radar {
        use super::*;

        #[test] fn render_scatter_chart_basic() {
            let mut chart = Chart::new(ChartKind::Scatter);
            chart.add_series(Series::new("Test", vec![
                DataPoint::new(10.0),
                DataPoint::new(20.0),
                DataPoint::new(15.0),
                DataPoint::new(25.0),
                DataPoint::new(5.0),
            ]));
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_area_chart_basic() {
            let mut chart = Chart::new(ChartKind::Area);
            chart.add_series(Series::new("Test", vec![
                DataPoint::new(10.0),
                DataPoint::new(20.0),
                DataPoint::new(15.0),
                DataPoint::new(25.0),
            ]));
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_radar_chart_basic() {
            let mut chart = Chart::new(ChartKind::Radar);
            chart.add_series(Series::new("Test", vec![
                DataPoint::new(80.0),
                DataPoint::new(90.0),
                DataPoint::new(70.0),
                DataPoint::new(85.0),
                DataPoint::new(88.0),
            ]));
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_doughnut_chart_basic() {
            let mut chart = Chart::new(ChartKind::Doughnut);
            chart.add_series(Series::new("Test", vec![
                DataPoint::new(25.0),
                DataPoint::new(35.0),
                DataPoint::new(40.0),
            ]));
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_scatter_chart_with_multiple_series() {
            let mut chart = Chart::new(ChartKind::Scatter);
            let mut series1 = Series::new("Series A", vec![DataPoint::new(10.0), DataPoint::new(20.0), DataPoint::new(30.0)]);
            series1.color = Some("#FF0000".to_string()); chart.add_series(series1);
            let mut series2 = Series::new("Series B", vec![DataPoint::new(15.0), DataPoint::new(25.0), DataPoint::new(35.0)]);
            series2.color = Some("#0000FF".to_string()); chart.add_series(series2);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_area_chart_with_multiple_series() {
            let mut chart = Chart::new(ChartKind::Area);
            let mut series1 = Series::new("Series A", vec![DataPoint::new(10.0), DataPoint::new(20.0), DataPoint::new(15.0)]);
            series1.color = Some("#FF0000".to_string()); chart.add_series(series1);
            let mut series2 = Series::new("Series B", vec![DataPoint::new(15.0), DataPoint::new(25.0), DataPoint::new(30.0)]);
            series2.color = Some("#00FF00".to_string()); chart.add_series(series2);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_radar_chart_with_categories() {
            let mut chart = Chart::new(ChartKind::Radar);
            let mut series = Series::new("Skills", vec![
                DataPoint::with_category(85.0, "Speed"),
                DataPoint::with_category(90.0, "Power"),
                DataPoint::with_category(75.0, "Defense"),
                DataPoint::with_category(80.0, "Stamina"),
                DataPoint::with_category(95.0, "Agility"),
            ]);
            series.color = Some("#FF5733".to_string()); chart.add_series(series);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }

        #[test] fn render_doughnut_chart_with_categories() {
            let mut chart = Chart::new(ChartKind::Doughnut);
            let mut series = Series::new("Expenses", vec![
                DataPoint::with_category(45.0, "Rent"),
                DataPoint::with_category(30.0, "Food"),
                DataPoint::with_category(25.0, "Entertainment"),
            ]);
            series.color = Some("#C70039".to_string()); chart.add_series(series);
            let mut canvas = Canvas::new(800, 600);
            let rect = Rect::new(50.0, 50.0, 700.0, 500.0);
            assert!(render(&chart, &mut canvas, rect).is_ok());
        }
    }
}
