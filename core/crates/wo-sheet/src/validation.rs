//! Data validation for the Spreadsheet (SS) engine.
//!
//! Implements Excel-compatible data validation rules that can be attached to
//! cell ranges. Each validation rule specifies a type (whole number, decimal,
//! list, date, time, text length, or custom formula), a comparison operator,
//! and one or two operand values. Rules are evaluated by the `validate_cell`
//! function against the cell's current value.
//!
//! # Architecture
//!
//! [`DataValidation`] bundles a rule type, operator, formulas, and UI hints
//! (input message, error alert). A `Vec<DataValidation>` can be stored on
//! a [`Sheet`] (or separately) to enforce per-range constraints.
//!
//! # SS-6 Contract
//!
//! - 7 validation rule types matching Excel's built-in types.
//! - 8 comparison operators covering all Excel operators.
//! - `validate_cell` returns a [`ValidationResult`] indicating pass/fail plus
//!   the first rule that was violated (if any).
//! - All types are serde-serializable for persistence and WOPI transport.

use serde::{Deserialize, Serialize};

use super::model::{Cell, Range2d};

// ============================================================================
// Data Validation Types
// ============================================================================

/// The type of data validation rule.
///
/// Corresponds to Excel's `xlValidate*` constants:
/// - `WholeNumber`: integer value comparison
/// - `Decimal`: floating-point comparison
/// - `List`: comma-separated values or range reference
/// - `Date`: date value comparison
/// - `Time`: time value comparison
/// - `TextLength`: character-length comparison
/// - `Custom`: formula-based validation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationType {
    /// Whole number validation
    WholeNumber,
    /// Decimal number validation
    Decimal,
    /// List of accepted values
    List,
    /// Date validation
    Date,
    /// Time validation
    Time,
    /// Text length validation
    TextLength,
    /// Custom formula-based validation
    Custom,
}

/// Comparison operator for numeric/date/time/text-length validation.
///
/// Corresponds to Excel's `xlBetween`, `xlEqual`, etc.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationOperator {
    /// Value must be between Formula1 and Formula2 (inclusive)
    Between,
    /// Value must NOT be between Formula1 and Formula2 (inclusive)
    NotBetween,
    /// Value must equal Formula1
    EqualTo,
    /// Value must NOT equal Formula1
    NotEqualTo,
    /// Value must be greater than Formula1
    GreaterThan,
    /// Value must be less than Formula1
    LessThan,
    /// Value must be greater than or equal to Formula1
    GreaterThanOrEqual,
    /// Value must be less than or equal to Formula1
    LessThanOrEqual,
}

/// Error style for alert dialogs.
///
/// Corresponds to Excel's `xlValidAlert*` constants.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationErrorStyle {
    /// Stop: prevents entry (default)
    Stop,
    /// Warning: asks user to confirm
    Warning,
    /// Information: just informs user
    Information,
}

impl Default for ValidationErrorStyle {
    fn default() -> Self {
        Self::Stop
    }
}

/// A single data validation rule attached to a range of cells.
///
/// Mirrors Excel's data validation dialog with type, operator, formulas,
/// and UI configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DataValidation {
    /// The cell range this validation applies to
    pub range: Range2d,

    /// The type of validation
    pub validation_type: ValidationType,

    /// Comparison operator (ignored for List and Custom types)
    pub operator: ValidationOperator,

    /// First operand (value, list items, or formula).
    /// - For numeric/date/time: a string that can be parsed as f64.
    /// - For List: comma-separated values.
    /// - For Custom: a formula string.
    pub formula1: String,

    /// Second operand (for Between/NotBetween operators).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula2: Option<String>,

    /// Whether blank values are allowed (default true)
    #[serde(default = "default_allow_blank")]
    pub allow_blank: bool,

    /// Show input message when cell is selected
    #[serde(default)]
    pub show_input_message: bool,

    /// Title for the input message popup
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_title: Option<String>,

    /// Body text for the input message popup
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_message: Option<String>,

    /// Show error alert when invalid data is entered
    #[serde(default = "default_show_error")]
    pub show_error_alert: bool,

    /// Style of the error alert
    #[serde(default)]
    pub error_style: ValidationErrorStyle,

    /// Title for the error alert dialog
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_title: Option<String>,

    /// Body text for the error alert dialog
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,

    /// Show in-cell dropdown (List validation only)
    #[serde(default = "default_in_cell_dropdown")]
    pub in_cell_dropdown: bool,
}

fn default_allow_blank() -> bool {
    true
}

fn default_show_error() -> bool {
    true
}

fn default_in_cell_dropdown() -> bool {
    true
}

impl DataValidation {
    /// Create a new data validation rule for the given range and type.
    pub fn new(range: Range2d, validation_type: ValidationType) -> Self {
        Self {
            range,
            validation_type,
            operator: ValidationOperator::Between,
            formula1: String::new(),
            formula2: None,
            allow_blank: true,
            show_input_message: false,
            input_title: None,
            input_message: None,
            show_error_alert: true,
            error_style: ValidationErrorStyle::Stop,
            error_title: None,
            error_message: None,
            in_cell_dropdown: true,
        }
    }

    /// Create a whole-number validation with the given operator and bounds.
    pub fn whole_number(
        range: Range2d,
        operator: ValidationOperator,
        formula1: impl Into<String>,
        formula2: Option<impl Into<String>>,
    ) -> Self {
        let r = range.clone();
        Self {
            range,
            validation_type: ValidationType::WholeNumber,
            operator,
            formula1: formula1.into(),
            formula2: formula2.map(Into::into),
            ..Self::new(r, ValidationType::WholeNumber)
        }
    }

    /// Create a decimal-number validation with the given operator and bounds.
    pub fn decimal(
        range: Range2d,
        operator: ValidationOperator,
        formula1: impl Into<String>,
        formula2: Option<impl Into<String>>,
    ) -> Self {
        let r = range.clone();
        Self {
            range,
            validation_type: ValidationType::Decimal,
            operator,
            formula1: formula1.into(),
            formula2: formula2.map(Into::into),
            ..Self::new(r, ValidationType::Decimal)
        }
    }

    /// Create a list validation with comma-separated acceptable values.
    pub fn list(range: Range2d, values: impl Into<String>) -> Self {
        let r = range.clone();
        Self {
            range,
            validation_type: ValidationType::List,
            operator: ValidationOperator::Between,
            formula1: values.into(),
            formula2: None,
            ..Self::new(r, ValidationType::List)
        }
    }

    /// Create a date validation with the given operator and bounds.
    pub fn date(
        range: Range2d,
        operator: ValidationOperator,
        formula1: impl Into<String>,
        formula2: Option<impl Into<String>>,
    ) -> Self {
        let r = range.clone();
        Self {
            range,
            validation_type: ValidationType::Date,
            operator,
            formula1: formula1.into(),
            formula2: formula2.map(Into::into),
            ..Self::new(r, ValidationType::Date)
        }
    }

    /// Create a time validation with the given operator and bounds.
    pub fn time(
        range: Range2d,
        operator: ValidationOperator,
        formula1: impl Into<String>,
        formula2: Option<impl Into<String>>,
    ) -> Self {
        let r = range.clone();
        Self {
            range,
            validation_type: ValidationType::Time,
            operator,
            formula1: formula1.into(),
            formula2: formula2.map(Into::into),
            ..Self::new(r, ValidationType::Time)
        }
    }

    /// Create a text-length validation with the given operator and bounds.
    pub fn text_length(
        range: Range2d,
        operator: ValidationOperator,
        formula1: impl Into<String>,
        formula2: Option<impl Into<String>>,
    ) -> Self {
        let r = range.clone();
        Self {
            range,
            validation_type: ValidationType::TextLength,
            operator,
            formula1: formula1.into(),
            formula2: formula2.map(Into::into),
            ..Self::new(r, ValidationType::TextLength)
        }
    }

    /// Create a custom formula validation. The formula should return TRUE
    /// when the cell value is valid.
    pub fn custom(range: Range2d, formula: impl Into<String>) -> Self {
        let r = range.clone();
        Self {
            range,
            validation_type: ValidationType::Custom,
            operator: ValidationOperator::Between,
            formula1: formula.into(),
            formula2: None,
            ..Self::new(r, ValidationType::Custom)
        }
    }
}

// ============================================================================
// Validation Result
// ============================================================================

/// The result of validating a cell value against the sheet's validation rules.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Whether the cell value passes all applicable validation rules
    pub valid: bool,
    /// The index of the first rule that rejected the value, if any
    pub rejected_by: Option<usize>,
    /// The error message from the rejecting rule, if any
    pub message: Option<String>,
}

impl ValidationResult {
    /// Create a passing validation result.
    pub fn pass() -> Self {
        Self {
            valid: true,
            rejected_by: None,
            message: None,
        }
    }

    /// Create a failing validation result.
    pub fn fail(index: usize, message: Option<String>) -> Self {
        Self {
            valid: false,
            rejected_by: Some(index),
            message,
        }
    }
}

// ============================================================================
// Core validation functions
// ============================================================================

/// Validate a cell value against all validation rules that apply to its range.
///
/// Returns the first failure, or [`ValidationResult::pass`] if all rules pass.
/// If the cell is empty and `allow_blank` is true for a matching rule, the
/// cell passes that rule (subject to the first applicable rule's `allow_blank`).
///
/// # Arguments
///
/// * `cell` - The cell to validate (None for empty cells)
/// * `row` - Row position of the cell
/// * `col` - Column position of the cell
/// * `rules` - All validation rules defined on the sheet
pub fn validate_cell(
    cell: Option<&Cell>,
    row: u32,
    col: u32,
    rules: &[DataValidation],
) -> ValidationResult {
    for (index, rule) in rules.iter().enumerate() {
        // Check if this rule applies to the cell's coordinates
        if !rule.range.contains(row, col) {
            continue;
        }

        // Handle blank cells
        let raw = match cell {
            Some(c) => c.raw.as_str(),
            None => "",
        };

        if raw.is_empty() && rule.allow_blank {
            continue;
        }

        // Evaluate the rule against the cell's raw value
        if !evaluate_rule(raw, rule) {
            let message = rule
                .error_message
                .clone()
                .or_else(|| Some(format!("Validation failed: {:?} {:?}", rule.validation_type, rule.operator)));
            return ValidationResult::fail(index, message);
        }
    }

    ValidationResult::pass()
}

/// Evaluate a single validation rule against a raw cell value.
fn evaluate_rule(raw: &str, rule: &DataValidation) -> bool {
    match rule.validation_type {
        ValidationType::WholeNumber => {
            let value = match raw.parse::<i64>() {
                Ok(v) => v as f64,
                Err(_) => return false,
            };
            let f1 = match rule.formula1.parse::<f64>() {
                Ok(v) => v,
                Err(_) => return true, // can't parse formula, pass by default
            };
            let f2 = match &rule.formula2 {
                Some(s) => match s.parse::<f64>() {
                    Ok(v) => Some(v),
                    Err(_) => return true,
                },
                None => None,
            };
            compare_value(value, f1, f2, rule.operator)
        }
        ValidationType::Decimal => {
            let value = match raw.parse::<f64>() {
                Ok(v) => v,
                Err(_) => return false,
            };
            let f1 = match rule.formula1.parse::<f64>() {
                Ok(v) => v,
                Err(_) => return true,
            };
            let f2 = match &rule.formula2 {
                Some(s) => match s.parse::<f64>() {
                    Ok(v) => Some(v),
                    Err(_) => return true,
                },
                None => None,
            };
            compare_value(value, f1, f2, rule.operator)
        }
        ValidationType::List => {
            // Split formula1 by comma (or newline) and check if raw matches any item
            let items: Vec<&str> = rule.formula1.split(|c| c == ',' || c == '\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if items.is_empty() {
                return true; // No items defined, always valid
            }
            items.iter().any(|item| *item == raw)
        }
        ValidationType::Date => {
            // Date validation: try to parse as Excel serial date number or a date string
            let value = match raw.parse::<f64>() {
                Ok(v) => v,
                Err(_) => return false,
            };
            let f1 = match rule.formula1.parse::<f64>() {
                Ok(v) => v,
                Err(_) => return true,
            };
            let f2 = match &rule.formula2 {
                Some(s) => match s.parse::<f64>() {
                    Ok(v) => Some(v),
                    Err(_) => return true,
                },
                None => None,
            };
            compare_value(value, f1, f2, rule.operator)
        }
        ValidationType::Time => {
            // Time validation: try to parse as Excel serial time number (fraction of day)
            let value = match raw.parse::<f64>() {
                Ok(v) => v,
                Err(_) => return false,
            };
            let f1 = match rule.formula1.parse::<f64>() {
                Ok(v) => v,
                Err(_) => return true,
            };
            let f2 = match &rule.formula2 {
                Some(s) => match s.parse::<f64>() {
                    Ok(v) => Some(v),
                    Err(_) => return true,
                },
                None => None,
            };
            compare_value(value, f1, f2, rule.operator)
        }
        ValidationType::TextLength => {
            let length = raw.chars().count() as f64;
            let f1 = match rule.formula1.parse::<f64>() {
                Ok(v) => v,
                Err(_) => return true,
            };
            let f2 = match &rule.formula2 {
                Some(s) => match s.parse::<f64>() {
                    Ok(v) => Some(v),
                    Err(_) => return true,
                },
                None => None,
            };
            compare_value(length, f1, f2, rule.operator)
        }
        ValidationType::Custom => {
            // Custom formula validation: in a real implementation, this would
            // evaluate the formula using the formula engine. For now, we treat
            // non-empty formula as passing (formula would need cell context).
            // A formula returning TRUE means valid; anything else means invalid.
            //
            // Since we lack formula evaluation context here, we pass custom
            // formulas by default. Real evaluation happens in the formula engine.
            !rule.formula1.is_empty()
        }
    }
}

/// Compare a value using the given operator and bounds.
fn compare_value(value: f64, formula1: f64, formula2: Option<f64>, operator: ValidationOperator) -> bool {
    match operator {
        ValidationOperator::Between => {
            match formula2 {
                Some(f2) => value >= formula1 && value <= f2,
                None => value == formula1,
            }
        }
        ValidationOperator::NotBetween => {
            match formula2 {
                Some(f2) => value < formula1 || value > f2,
                None => value != formula1,
            }
        }
        ValidationOperator::EqualTo => value == formula1,
        ValidationOperator::NotEqualTo => value != formula1,
        ValidationOperator::GreaterThan => value > formula1,
        ValidationOperator::LessThan => value < formula1,
        ValidationOperator::GreaterThanOrEqual => value >= formula1,
        ValidationOperator::LessThanOrEqual => value <= formula1,
    }
}

/// Find all validation rules that apply to a given cell position.
pub fn rules_for_cell<'a>(row: u32, col: u32, rules: &'a [DataValidation]) -> Vec<&'a DataValidation> {
    rules.iter().filter(|r| r.range.contains(row, col)).collect()
}

/// Check if a cell with the given raw value is valid according to the applicable rules.
pub fn is_valid(cell: Option<&Cell>, row: u32, col: u32, rules: &[DataValidation]) -> bool {
    validate_cell(cell, row, col, rules).valid
}

// ============================================================================
// Tests — 8 tests as required by SS-6
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Cell;

    // Helper to create a sample validation rule
    fn make_range() -> Range2d {
        Range2d::new(0, 0, 10, 5)
    }

    // Test 1: WholeNumber validation — value passes Between operator
    #[test]
    fn test_whole_number_between_passes() {
        let rule = DataValidation::whole_number(
            make_range(),
            ValidationOperator::Between,
            "10",
            Some("20"),
        );
        let cell = Cell::with_num(15.0);
        let result = validate_cell(Some(&cell), 0, 0, &[rule]);
        assert!(result.valid, "15 should be between 10 and 20");
        assert!(result.rejected_by.is_none());
    }

    // Test 2: WholeNumber validation — value fails Between operator
    #[test]
    fn test_whole_number_between_fails() {
        let rule = DataValidation::whole_number(
            make_range(),
            ValidationOperator::Between,
            "10",
            Some("20"),
        );
        let cell = Cell::with_num(25.0);
        let result = validate_cell(Some(&cell), 0, 0, &[rule]);
        assert!(!result.valid, "25 should NOT be between 10 and 20");
        assert_eq!(result.rejected_by, Some(0));
    }

    // Test 3: List validation — value in list passes
    #[test]
    fn test_list_validation_passes() {
        let rule = DataValidation::list(make_range(), "Yes,No,Maybe");
        let cell = Cell::with_text("Yes");
        let result = validate_cell(Some(&cell), 0, 0, &[rule]);
        assert!(result.valid, "'Yes' should be in the list");
    }

    // Test 4: List validation — value not in list fails
    #[test]
    fn test_list_validation_fails() {
        let rule = DataValidation::list(make_range(), "Yes,No,Maybe");
        let cell = Cell::with_text("Perhaps");
        let result = validate_cell(Some(&cell), 0, 0, &[rule]);
        assert!(!result.valid, "'Perhaps' should NOT be in the list");
        assert_eq!(result.rejected_by, Some(0));
    }

    // Test 5: TextLength validation — value within length limit passes
    #[test]
    fn test_text_length_passes() {
        let rule = DataValidation::text_length(
            make_range(),
            ValidationOperator::LessThanOrEqual,
            "5",
            None::<&str>,
        );
        let cell = Cell::with_text("Hello");
        let result = validate_cell(Some(&cell), 0, 0, &[rule]);
        assert!(result.valid, "'Hello' length 5 should be <= 5");
    }

    // Test 6: TextLength validation — value exceeding length limit fails
    #[test]
    fn test_text_length_fails() {
        let rule = DataValidation::text_length(
            make_range(),
            ValidationOperator::LessThanOrEqual,
            "5",
            None::<&str>,
        );
        let cell = Cell::with_text("Hello World");
        let result = validate_cell(Some(&cell), 0, 0, &[rule]);
        assert!(
            !result.valid,
            "'Hello World' length 11 should exceed 5"
        );
        assert_eq!(result.rejected_by, Some(0));
    }

    // Test 7: Empty cell with allow_blank=true passes
    #[test]
    fn test_empty_cell_allow_blank_passes() {
        let rule = DataValidation::whole_number(
            make_range(),
            ValidationOperator::Between,
            "10",
            Some("20"),
        );
        // Allow blank is true by default
        let result = validate_cell(None, 5, 3, &[rule]);
        assert!(result.valid, "Empty cell with allow_blank=true should pass");
    }

    // Test 8: Decimal validation — EqualTo operator
    #[test]
    fn test_decimal_equal_to() {
        let rule = DataValidation::decimal(
            make_range(),
            ValidationOperator::EqualTo,
            "3.14",
            None::<&str>,
        );
        let cell = Cell::with_num(3.14);
        let result = validate_cell(Some(&cell), 0, 0, &[rule.clone()]);
        assert!(result.valid, "3.14 should equal 3.14");

        let cell2 = Cell::with_num(2.71);
        let result2 = validate_cell(Some(&cell2), 0, 0, &[rule]);
        assert!(!result2.valid, "2.71 should NOT equal 3.14");
        assert_eq!(result2.rejected_by, Some(0));
    }

    // Test 9: Rules only apply to matching range positions
    #[test]
    fn test_rule_outside_range_passes() {
        let rule = DataValidation::whole_number(
            Range2d::new(5, 5, 10, 10),
            ValidationOperator::Between,
            "10",
            Some("20"),
        );
        // Cell outside the rule's range
        let cell = Cell::with_num(999.0);
        let result = validate_cell(Some(&cell), 0, 0, &[rule]);
        assert!(result.valid, "Cell outside rule range should pass");
    }

    // Test 10: NotBetween operator works correctly
    #[test]
    fn test_not_between() {
        let rule = DataValidation::whole_number(
            make_range(),
            ValidationOperator::NotBetween,
            "10",
            Some("20"),
        );
        let cell = Cell::with_num(25.0);
        let result = validate_cell(Some(&cell), 0, 0, &[rule.clone()]);
        assert!(result.valid, "25 should satisfy NotBetween 10 and 20");

        let cell2 = Cell::with_num(15.0);
        let result2 = validate_cell(Some(&cell2), 0, 0, &[rule]);
        assert!(!result2.valid, "15 should fail NotBetween 10 and 20");
    }

    // Test 11: Serialization round-trip
    #[test]
    fn test_validation_serde_roundtrip() {
        let rule = DataValidation::whole_number(
            make_range(),
            ValidationOperator::Between,
            "0",
            Some("100"),
        );
        let json = serde_json::to_string(&rule).unwrap();
        let back: DataValidation = serde_json::from_str(&json).unwrap();
        assert_eq!(rule.validation_type, back.validation_type);
        assert_eq!(rule.operator, back.operator);
        assert_eq!(rule.formula1, back.formula1);
        assert_eq!(rule.formula2, back.formula2);
        assert_eq!(rule.range, back.range);
    }

    // Test 12: ValidationResult pass/fail
    #[test]
    fn test_validation_result() {
        assert!(ValidationResult::pass().valid);
        let fail = ValidationResult::fail(2, Some("Out of range".to_string()));
        assert!(!fail.valid);
        assert_eq!(fail.rejected_by, Some(2));
        assert_eq!(fail.message, Some("Out of range".to_string()));
    }

    // Test 13: GreaterThan operator
    #[test]
    fn test_greater_than() {
        let rule = DataValidation::decimal(
            make_range(),
            ValidationOperator::GreaterThan,
            "0",
            None::<&str>,
        );
        let cell = Cell::with_num(5.0);
        let result = validate_cell(Some(&cell), 0, 0, &[rule.clone()]);
        assert!(result.valid, "5 should be > 0");

        let cell2 = Cell::with_num(-1.0);
        let result2 = validate_cell(Some(&cell2), 0, 0, &[rule]);
        assert!(!result2.valid, "-1 should NOT be > 0");
    }

    // Test 14: LessThanOrEqual operator
    #[test]
    fn test_less_than_or_equal() {
        let rule = DataValidation::decimal(
            make_range(),
            ValidationOperator::LessThanOrEqual,
            "10",
            None::<&str>,
        );
        let cell = Cell::with_num(10.0);
        let result = validate_cell(Some(&cell), 0, 0, &[rule.clone()]);
        assert!(result.valid, "10 should be <= 10");

        let cell2 = Cell::with_num(11.0);
        let result2 = validate_cell(Some(&cell2), 0, 0, &[rule]);
        assert!(!result2.valid, "11 should NOT be <= 10");
    }

    // Test 15: Multiple rules — second rule catches invalid value
    #[test]
    fn test_multiple_rules_second_fails() {
        let rule1 = DataValidation::whole_number(
            make_range(),
            ValidationOperator::GreaterThan,
            "0",
            None::<&str>,
        );
        let rule2 = DataValidation::whole_number(
            make_range(),
            ValidationOperator::LessThanOrEqual,
            "100",
            None::<&str>,
        );

        let cell = Cell::with_num(200.0);
        let result = validate_cell(Some(&cell), 0, 0, &[rule1, rule2]);
        assert!(!result.valid, "200 should fail <= 100 rule");
        assert_eq!(result.rejected_by, Some(1));
    }

    // Test 16: Non-parseable whole number input fails
    #[test]
    fn test_whole_number_non_numeric_fails() {
        let rule = DataValidation::whole_number(
            make_range(),
            ValidationOperator::EqualTo,
            "42",
            None::<&str>,
        );
        let cell = Cell::with_text("not a number");
        let result = validate_cell(Some(&cell), 0, 0, &[rule]);
        assert!(!result.valid, "Non-numeric input should fail whole number validation");
    }
}
