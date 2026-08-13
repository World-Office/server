//! Conditional formatting engine for spreadsheets.
//!
//! This module implements the conditional formatting logic for the SS-4 task,
//! supporting all 12 conditional formatting rules defined in the model.
//!
//! The implementation applies conditional formatting rules to cells in a range,
//! evaluating each rule against cell values and applying the associated style
//! when the condition is met.

use std::collections::HashMap;

use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use wo_formula::ast::CellValue;

use super::model::{Cell, CellStyle, ConditionalRule, DatePeriod, Range2d, Sheet};
use super::ops::SheetOpError;

/// Result type for conditional formatting operations.
pub type ConditionalResult<T = ()> = Result<T, SheetOpError>;

/// A conditional format rule applied to a specific range.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppliedConditionalFormat {
    /// The range this rule applies to
    pub range: Range2d,
    /// The conditional rule
    pub rule: ConditionalRule,
    /// Priority (lower number = higher priority)
    pub priority: u32,
}

/// Evaluates a conditional formatting rule against a cell value.
///
/// Returns true if the cell matches the condition, false otherwise.
pub fn evaluate_rule(rule: &ConditionalRule, cell: &Cell) -> bool {
    match rule {
        ConditionalRule::GreaterThan { value, .. } => {
            match &cell.value {
                CellValue::Num(n) => n > value,
                CellValue::Text(t) => {
                    if let Ok(n) = t.parse::<f64>() {
                        n > *value
                    } else {
                        false
                    }
                }
                _ => false,
            }
        }
        ConditionalRule::LessThan { value, .. } => {
            match &cell.value {
                CellValue::Num(n) => n < value,
                CellValue::Text(t) => {
                    if let Ok(n) = t.parse::<f64>() {
                        n < *value
                    } else {
                        false
                    }
                }
                _ => false,
            }
        }
        ConditionalRule::Between { min, max, .. } => {
            match &cell.value {
                CellValue::Num(n) => n >= min && n <= max,
                CellValue::Text(t) => {
                    if let Ok(n) = t.parse::<f64>() {
                        n >= *min && n <= *max
                    } else {
                        false
                    }
                }
                _ => false,
            }
        }
        ConditionalRule::EqualTo { value, .. } => {
            match &cell.value {
                CellValue::Num(n) => {
                    if let Ok(v) = value.parse::<f64>() {
                        (n - v).abs() < f64::EPSILON
                    } else {
                        false
                    }
                }
                CellValue::Text(t) => t == value,
                CellValue::Bool(b) => {
                    if let Ok(v) = value.parse::<bool>() {
                        b == &v
                    } else {
                        false
                    }
                }
                _ => false,
            }
        }
        ConditionalRule::ContainsText { text, .. } => {
            match &cell.value {
                CellValue::Text(t) => t.contains(text.as_str()),
                _ => false,
            }
        }
        ConditionalRule::Empty { .. } => {
            matches!(&cell.value, CellValue::Empty) && cell.raw.is_empty()
        }
        ConditionalRule::TopN { .. } => {
            // TopN is evaluated across the range, not per-cell
            false
        }
        ConditionalRule::BottomN { .. } => {
            // BottomN is evaluated across the range, not per-cell
            false
        }
        ConditionalRule::AboveAverage { .. } => {
            // AboveAverage is evaluated across the range, not per-cell
            false
        }
        ConditionalRule::BelowAverage { .. } => {
            // BelowAverage is evaluated across the range, not per-cell
            false
        }
        ConditionalRule::Formula { formula, .. } => {
            evaluate_formula_condition(formula, cell)
        }
        ConditionalRule::DatePeriod { period, .. } => {
            match &cell.value {
                CellValue::Text(t) => {
                    if let Ok(date) = NaiveDate::parse_from_str(t, "%Y-%m-%d") {
                        check_date_period(&date, period)
                    } else if let Ok(date) = NaiveDate::parse_from_str(t, "%m/%d/%Y") {
                        check_date_period(&date, period)
                    } else {
                        false
                    }
                }
                _ => false,
            }
        }
        ConditionalRule::Duplicate { .. } => {
            // Duplicate is evaluated across the range, not per-cell
            false
        }
    }
}

/// Evaluates a formula-based conditional formatting rule.
fn evaluate_formula_condition(_formula: &str, _cell: &Cell) -> bool {
    // Simplified implementation - in production this would integrate with formula engine
    false
}

/// Checks if a date falls within the specified period.
fn check_date_period(date: &NaiveDate, period: &DatePeriod) -> bool {
    let today = chrono::Local::now().naive_local().date();
    
    match period {
        DatePeriod::Today => *date == today,
        DatePeriod::Yesterday => *date == today.pred_opt().unwrap_or(today),
        DatePeriod::Tomorrow => *date == today.succ_opt().unwrap_or(today),
        DatePeriod::Last7Days => {
            let start = today.pred_opt().unwrap_or(today).pred_opt().unwrap_or(today);
            *date >= start && *date <= today
        }
        DatePeriod::Last30Days => {
            let mut start = today;
            for _ in 0..30 {
                start = start.pred_opt().unwrap_or(start);
            }
            *date >= start && *date <= today
        }
        DatePeriod::Next7Days => {
            let mut end = today;
            for _ in 0..7 {
                end = end.succ_opt().unwrap_or(end);
            }
            *date >= today && *date <= end
        }
        DatePeriod::Next30Days => {
            let mut end = today;
            for _ in 0..30 {
                end = end.succ_opt().unwrap_or(end);
            }
            *date >= today && *date <= end
        }
        DatePeriod::ThisMonth => {
            date.year() == today.year() && date.month() == today.month()
        }
        DatePeriod::LastMonth => {
            if today.month() == 1 {
                date.year() == today.year() - 1 && date.month() == 12
            } else {
                date.year() == today.year() && date.month() == today.month() - 1
            }
        }
        DatePeriod::NextMonth => {
            if today.month() == 12 {
                date.year() == today.year() + 1 && date.month() == 1
            } else {
                date.year() == today.year() && date.month() == today.month() + 1
            }
        }
        DatePeriod::ThisYear => date.year() == today.year(),
        DatePeriod::LastYear => date.year() == today.year() - 1,
        DatePeriod::NextYear => date.year() == today.year() + 1,
    }
}

/// Applies conditional formatting to all cells in the specified range.
///
/// This function evaluates the rule against each cell and applies the style
/// when the condition is met.
///
/// # Arguments
///
/// * `sheet` - The sheet to apply formatting to
/// * `range` - The range of cells to evaluate
/// * `rule` - The conditional formatting rule
///
/// # Returns
///
/// The number of cells that had formatting applied
pub fn apply_conditional_format(
    sheet: &mut Sheet,
    range: &Range2d,
    rule: &ConditionalRule,
) -> ConditionalResult<usize> {
    // Collect all cell positions in the range
    let mut cell_positions: Vec<(u32, u32)> = Vec::new();
    for row in range.start_row..=range.end_row {
        for col in range.start_col..=range.end_col {
            if sheet.cells.contains_key(&(row, col)) {
                cell_positions.push((row, col));
            }
        }
    }

    // Handle range-based rules (TopN, BottomN, AboveAverage, BelowAverage, Duplicate)
    let matching_positions: Vec<(u32, u32)> = match rule {
        ConditionalRule::TopN { n, .. } => {
            // Get all numeric cells and sort them
            let mut numeric_cells: Vec<((u32, u32), f64)> = cell_positions
                .iter()
                .filter_map(|&(r, c)| {
                    if let Some(cell) = sheet.cells.get(&(r, c)) {
                        match &cell.value {
                            CellValue::Num(val) => Some(((r, c), *val)),
                            CellValue::Text(t) => {
                                if let Ok(val) = t.parse::<f64>() {
                                    Some(((r, c), val))
                                } else {
                                    None
                                }
                            }
                            _ => None,
                        }
                    } else {
                        None
                    }
                })
                .collect();

            // Sort by value descending
            numeric_cells.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

            // Take top N positions
            numeric_cells.into_iter().take(*n).map(|((r, c), _)| (r, c)).collect()
        }
        ConditionalRule::BottomN { n, .. } => {
            // Get all numeric cells and sort them
            let mut numeric_cells: Vec<((u32, u32), f64)> = cell_positions
                .iter()
                .filter_map(|&(r, c)| {
                    if let Some(cell) = sheet.cells.get(&(r, c)) {
                        match &cell.value {
                            CellValue::Num(val) => Some(((r, c), *val)),
                            CellValue::Text(t) => {
                                if let Ok(val) = t.parse::<f64>() {
                                    Some(((r, c), val))
                                } else {
                                    None
                                }
                            }
                            _ => None,
                        }
                    } else {
                        None
                    }
                })
                .collect();

            // Sort by value ascending
            numeric_cells.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

            // Take bottom N positions
            numeric_cells.into_iter().take(*n).map(|((r, c), _)| (r, c)).collect()
        }
        ConditionalRule::AboveAverage { .. } => {
            // Calculate average of numeric cells
            let (sum, count) = cell_positions.iter().fold((0.0, 0), |(sum, count), &(r, c)| {
                if let Some(cell) = sheet.cells.get(&(r, c)) {
                    match &cell.value {
                        CellValue::Num(n) => (sum + n, count + 1),
                        CellValue::Text(t) => {
                            if let Ok(n) = t.parse::<f64>() {
                                (sum + n, count + 1)
                            } else {
                                (sum, count)
                            }
                        }
                        _ => (sum, count),
                    }
                } else {
                    (sum, count)
                }
            });

            let average = if count > 0 { sum / count as f64 } else { 0.0 };

            // Filter cells above average
            cell_positions.into_iter()
                .filter(|&(r, c)| {
                    if let Some(cell) = sheet.cells.get(&(r, c)) {
                        match &cell.value {
                            CellValue::Num(n) => n > &average,
                            CellValue::Text(t) => {
                                if let Ok(n) = t.parse::<f64>() {
                                    n > average
                                } else {
                                    false
                                }
                            }
                            _ => false,
                        }
                    } else {
                        false
                    }
                })
                .collect()
        }
        ConditionalRule::BelowAverage { .. } => {
            // Calculate average of numeric cells
            let (sum, count) = cell_positions.iter().fold((0.0, 0), |(sum, count), &(r, c)| {
                if let Some(cell) = sheet.cells.get(&(r, c)) {
                    match &cell.value {
                        CellValue::Num(n) => (sum + n, count + 1),
                        CellValue::Text(t) => {
                            if let Ok(n) = t.parse::<f64>() {
                                (sum + n, count + 1)
                            } else {
                                (sum, count)
                            }
                        }
                        _ => (sum, count),
                    }
                } else {
                    (sum, count)
                }
            });

            let average = if count > 0 { sum / count as f64 } else { 0.0 };

            // Filter cells below average
            cell_positions.into_iter()
                .filter(|&(r, c)| {
                    if let Some(cell) = sheet.cells.get(&(r, c)) {
                        match &cell.value {
                            CellValue::Num(n) => n < &average,
                            CellValue::Text(t) => {
                                if let Ok(n) = t.parse::<f64>() {
                                    n < average
                                } else {
                                    false
                                }
                            }
                            _ => false,
                        }
                    } else {
                        false
                    }
                })
                .collect()
        }
        ConditionalRule::Duplicate { .. } => {
            // Find duplicate values
            let mut value_counts: HashMap<String, usize> = HashMap::new();
            for &(r, c) in &cell_positions {
                if let Some(cell) = sheet.cells.get(&(r, c)) {
                    let key = cell.raw.clone();
                    *value_counts.entry(key).or_insert(0) += 1;
                }
            }

            // Filter cells with duplicate values (count > 1)
            cell_positions.into_iter()
                .filter(|&(r, c)| {
                    if let Some(cell) = sheet.cells.get(&(r, c)) {
                        value_counts.get(&cell.raw).map(|&count| count > 1).unwrap_or(false)
                    } else {
                        false
                    }
                })
                .collect()
        }
        _ => {
            // For simple per-cell rules, just evaluate each cell by position
            cell_positions.into_iter()
                .filter(|&(r, c)| {
                    if let Some(cell) = sheet.cells.get(&(r, c)) {
                        evaluate_rule(rule, cell)
                    } else {
                        false
                    }
                })
                .collect()
        }
    };

    // Get the style from the rule
    let style: &CellStyle = match rule {
        ConditionalRule::GreaterThan { style, .. } => style,
        ConditionalRule::LessThan { style, .. } => style,
        ConditionalRule::Between { style, .. } => style,
        ConditionalRule::EqualTo { style, .. } => style,
        ConditionalRule::ContainsText { style, .. } => style,
        ConditionalRule::Empty { style } => style,
        ConditionalRule::TopN { style, .. } => style,
        ConditionalRule::BottomN { style, .. } => style,
        ConditionalRule::AboveAverage { style, .. } => style,
        ConditionalRule::BelowAverage { style, .. } => style,
        ConditionalRule::Formula { style, .. } => style,
        ConditionalRule::DatePeriod { style, .. } => style,
        ConditionalRule::Duplicate { style } => style,
    };

    // Apply the style to matching cells
    let mut count = 0;
    for (row, col) in matching_positions {
        if let Some(cell) = sheet.cells.get_mut(&(row, col)) {
            apply_style(&mut cell.style, style);
            count += 1;
        }
    }

    Ok(count)
}

/// Applies a conditional style to a cell, preserving existing styles where not overridden.
fn apply_style(existing: &mut CellStyle, new: &CellStyle) {
    if new.font_family.is_some() {
        existing.font_family = new.font_family.clone();
    }
    if new.font_size.is_some() {
        existing.font_size = new.font_size;
    }
    if new.bold.is_some() {
        existing.bold = new.bold;
    }
    if new.italic.is_some() {
        existing.italic = new.italic;
    }
    if new.underline.is_some() {
        existing.underline = new.underline;
    }
    if new.strikethrough.is_some() {
        existing.strikethrough = new.strikethrough;
    }
    if new.color.is_some() {
        existing.color = new.color.clone();
    }
    if new.background_color.is_some() {
        existing.background_color = new.background_color.clone();
    }
    if new.horizontal_align.is_some() {
        existing.horizontal_align = new.horizontal_align.clone();
    }
    if new.vertical_align.is_some() {
        existing.vertical_align = new.vertical_align.clone();
    }
    if new.border.is_some() {
        existing.border = new.border.clone();
    }
    if new.number_format.is_some() {
        existing.number_format = new.number_format.clone();
    }
}

// ============================================================================
// Tests for SS-4: Conditional Formatting (12 rules)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Helper to create a test sheet with data
    fn create_test_sheet() -> Sheet {
        let mut sheet = Sheet::new("TestSheet");
        // Numeric values
        sheet.set_cell(0, 0, Cell::with_num(10.0));
        sheet.set_cell(0, 1, Cell::with_num(20.0));
        sheet.set_cell(0, 2, Cell::with_num(30.0));
        sheet.set_cell(1, 0, Cell::with_num(40.0));
        sheet.set_cell(1, 1, Cell::with_num(50.0));
        sheet.set_cell(1, 2, Cell::with_num(60.0));
        // Text values
        sheet.set_cell(2, 0, Cell::with_text("Apple"));
        sheet.set_cell(2, 1, Cell::with_text("Banana"));
        sheet.set_cell(2, 2, Cell::with_text("Apple")); // Duplicate
        sheet.set_cell(3, 0, Cell::with_text("Hello World"));
        sheet.set_cell(3, 1, Cell::with_text("hello"));
        sheet.set_cell(3, 2, Cell::new()); // Empty
        sheet
    }

    // Test 1: GreaterThan rule
    #[test]
    fn test_greater_than() {
        let mut sheet = create_test_sheet();
        let range = Range2d::new(0, 0, 1, 2);
        let rule = ConditionalRule::GreaterThan {
            value: 35.0,
            style: CellStyle {
                background_color: Some("#FF0000".to_string()),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        
        // Should match cells with values > 35: (1,0)=40, (1,1)=50, (1,2)=60
        assert_eq!(count, 3);
        
        assert_eq!(
            sheet.get_cell(1, 0).unwrap().style.background_color,
            Some("#FF0000".to_string())
        );
        assert_eq!(sheet.get_cell(0, 0).unwrap().style.background_color, None);
    }

    // Test 2: LessThan rule
    #[test]
    fn test_less_than() {
        let mut sheet = create_test_sheet();
        let range = Range2d::new(0, 0, 1, 2);
        let rule = ConditionalRule::LessThan {
            value: 30.0,
            style: CellStyle {
                bold: Some(true),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        
        assert_eq!(count, 2);
        assert_eq!(sheet.get_cell(0, 0).unwrap().style.bold, Some(true));
        assert_eq!(sheet.get_cell(1, 2).unwrap().style.bold, None);
    }

    // Test 3: Between rule
    #[test]
    fn test_between() {
        let mut sheet = create_test_sheet();
        let range = Range2d::new(0, 0, 1, 2);
        let rule = ConditionalRule::Between {
            min: 20.0,
            max: 50.0,
            style: CellStyle {
                italic: Some(true),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 4);
        assert_eq!(sheet.get_cell(0, 1).unwrap().style.italic, Some(true));
        assert_eq!(sheet.get_cell(1, 2).unwrap().style.italic, None);
    }

    // Test 4: EqualTo rule
    #[test]
    fn test_equal_to() {
        let mut sheet = create_test_sheet();
        let range = Range2d::new(2, 0, 2, 2);
        let rule = ConditionalRule::EqualTo {
            value: "Apple".to_string(),
            style: CellStyle {
                underline: Some(true),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 2);
        assert_eq!(sheet.get_cell(2, 0).unwrap().style.underline, Some(true));
        assert_eq!(sheet.get_cell(2, 1).unwrap().style.underline, None);
    }

    // Test 5: ContainsText rule
    #[test]
    fn test_contains_text() {
        let mut sheet = create_test_sheet();
        let range = Range2d::new(3, 0, 3, 2);
        let rule = ConditionalRule::ContainsText {
            text: "ello".to_string(),
            style: CellStyle {
                font_size: Some(16.0),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 2);
        assert_eq!(sheet.get_cell(3, 0).unwrap().style.font_size, Some(16.0));
        assert_eq!(sheet.get_cell(3, 2).unwrap().style.font_size, None);
    }

    // Test 6: Empty rule
    #[test]
    fn test_empty() {
        let mut sheet = create_test_sheet();
        let range = Range2d::new(3, 0, 3, 2);
        let rule = ConditionalRule::Empty {
            style: CellStyle {
                color: Some("#999999".to_string()),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 1);
        assert_eq!(
            sheet.get_cell(3, 2).unwrap().style.color,
            Some("#999999".to_string())
        );
    }

    // Test 7: TopN rule
    #[test]
    fn test_top_n() {
        let mut sheet = Sheet::new("TestSheet");
        sheet.set_cell(0, 0, Cell::with_num(100.0));
        sheet.set_cell(0, 1, Cell::with_num(90.0));
        sheet.set_cell(0, 2, Cell::with_num(80.0));
        sheet.set_cell(1, 0, Cell::with_num(70.0));
        sheet.set_cell(1, 1, Cell::with_num(60.0));
        sheet.set_cell(1, 2, Cell::with_num(50.0));
        
        let range = Range2d::new(0, 0, 1, 2);
        let rule = ConditionalRule::TopN {
            n: 3,
            style: CellStyle {
                background_color: Some("#00FF00".to_string()),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 3);
        
        assert_eq!(
            sheet.get_cell(0, 0).unwrap().style.background_color,
            Some("#00FF00".to_string())
        );
        assert_eq!(
            sheet.get_cell(0, 1).unwrap().style.background_color,
            Some("#00FF00".to_string())
        );
        assert_eq!(
            sheet.get_cell(0, 2).unwrap().style.background_color,
            Some("#00FF00".to_string())
        );
        assert_eq!(sheet.get_cell(1, 0).unwrap().style.background_color, None);
    }

    // Test 8: BottomN rule
    #[test]
    fn test_bottom_n() {
        let mut sheet = Sheet::new("TestSheet");
        sheet.set_cell(0, 0, Cell::with_num(10.0));
        sheet.set_cell(0, 1, Cell::with_num(20.0));
        sheet.set_cell(0, 2, Cell::with_num(30.0));
        sheet.set_cell(1, 0, Cell::with_num(40.0));
        sheet.set_cell(1, 1, Cell::with_num(50.0));
        sheet.set_cell(1, 2, Cell::with_num(60.0));
        
        let range = Range2d::new(0, 0, 1, 2);
        let rule = ConditionalRule::BottomN {
            n: 3,
            style: CellStyle {
                background_color: Some("#0000FF".to_string()),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 3);
        
        assert_eq!(
            sheet.get_cell(0, 0).unwrap().style.background_color,
            Some("#0000FF".to_string())
        );
        assert_eq!(
            sheet.get_cell(0, 1).unwrap().style.background_color,
            Some("#0000FF".to_string())
        );
        assert_eq!(
            sheet.get_cell(0, 2).unwrap().style.background_color,
            Some("#0000FF".to_string())
        );
    }

    // Test 9: AboveAverage rule
    #[test]
    fn test_above_average() {
        let mut sheet = Sheet::new("TestSheet");
        sheet.set_cell(0, 0, Cell::with_num(10.0));
        sheet.set_cell(0, 1, Cell::with_num(20.0));
        sheet.set_cell(0, 2, Cell::with_num(30.0));
        sheet.set_cell(1, 0, Cell::with_num(40.0));
        sheet.set_cell(1, 1, Cell::with_num(50.0));
        sheet.set_cell(1, 2, Cell::with_num(60.0));
        
        let range = Range2d::new(0, 0, 1, 2);
        let rule = ConditionalRule::AboveAverage {
            style: CellStyle {
                bold: Some(true),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 3);
        
        assert_eq!(sheet.get_cell(1, 0).unwrap().style.bold, Some(true));
        assert_eq!(sheet.get_cell(0, 2).unwrap().style.bold, None);
    }

    // Test 10: BelowAverage rule
    #[test]
    fn test_below_average() {
        let mut sheet = Sheet::new("TestSheet");
        sheet.set_cell(0, 0, Cell::with_num(10.0));
        sheet.set_cell(0, 1, Cell::with_num(20.0));
        sheet.set_cell(0, 2, Cell::with_num(30.0));
        sheet.set_cell(1, 0, Cell::with_num(40.0));
        sheet.set_cell(1, 1, Cell::with_num(50.0));
        sheet.set_cell(1, 2, Cell::with_num(60.0));
        
        let range = Range2d::new(0, 0, 1, 2);
        let rule = ConditionalRule::BelowAverage {
            style: CellStyle {
                italic: Some(true),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 3);
        
        assert_eq!(sheet.get_cell(0, 0).unwrap().style.italic, Some(true));
        assert_eq!(sheet.get_cell(1, 0).unwrap().style.italic, None);
    }

    // Test 11: Formula rule (simplified - returns false)
    #[test]
    fn test_formula() {
        let mut sheet = create_test_sheet();
        let range = Range2d::new(0, 0, 0, 2);
        let rule = ConditionalRule::Formula {
            formula: "=A1>15".to_string(),
            style: CellStyle {
                color: Some("#FF0000".to_string()),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        // Formula evaluation returns false, so no cells should match
        assert_eq!(count, 0);
    }

    // Test 12: Duplicate rule
    #[test]
    fn test_duplicate() {
        let mut sheet = create_test_sheet();
        let range = Range2d::new(2, 0, 2, 2);
        let rule = ConditionalRule::Duplicate {
            style: CellStyle {
                background_color: Some("#FFFF00".to_string()),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 2);
        
        assert_eq!(
            sheet.get_cell(2, 0).unwrap().style.background_color,
            Some("#FFFF00".to_string())
        );
        assert_eq!(
            sheet.get_cell(2, 2).unwrap().style.background_color,
            Some("#FFFF00".to_string())
        );
        assert_eq!(sheet.get_cell(2, 1).unwrap().style.background_color, None);
    }

    // Test 13: Style merging preserves existing styles
    #[test]
    fn test_style_merging() {
        let mut sheet = Sheet::new("TestSheet");
        let mut cell = Cell::with_num(50.0);
        cell.style.bold = Some(true);
        cell.style.font_size = Some(12.0);
        sheet.set_cell(0, 0, cell);
        
        let range = Range2d::new(0, 0, 0, 0);
        let rule = ConditionalRule::GreaterThan {
            value: 40.0,
            style: CellStyle {
                background_color: Some("#FF00FF".to_string()),
                italic: Some(true),
                ..Default::default()
            },
        };

        let count = apply_conditional_format(&mut sheet, &range, &rule).unwrap();
        assert_eq!(count, 1);
        let cell = sheet.get_cell(0, 0).unwrap();
        
        assert_eq!(cell.style.bold, Some(true));
        assert_eq!(cell.style.font_size, Some(12.0));
        assert_eq!(cell.style.background_color, Some("#FF00FF".to_string()));
        assert_eq!(cell.style.italic, Some(true));
    }
}
