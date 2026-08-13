//! Pivot table engine for the Spreadsheet (SS) engine.
//!
//! Implements pivot table creation, aggregation, and result generation
//! from source data ranges. Supports standard aggregation functions:
//! SUM, COUNT, AVERAGE, MIN, MAX, PRODUCT, COUNT_NUMS, STDDEV, VAR, and more.
//!
//! # Architecture
//!
//! A pivot table takes source data (a grid of `CellValue`s, where row 0 is
//! column headers) and groups rows by row-field values and column-field values,
//! then applies aggregation functions to the value fields in each group.
//!
//! The result is a compact cross-tabulation with row labels, column headers,
//! and aggregated data cells.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use wo_formula::ast::CellValue;

// ============================================================================
// Data Structures
// ============================================================================

/// Aggregation function for pivot value fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AggFunc {
    Sum,
    Count,
    Average,
    Min,
    Max,
    Product,
    CountNums,
    StdDev,
    StdDevP,
    Var,
    VarP,
}

impl AggFunc {
    /// Human-readable label for this aggregation function.
    pub fn label(&self) -> &'static str {
        match self {
            AggFunc::Sum => "Sum",
            AggFunc::Count => "Count",
            AggFunc::Average => "Average",
            AggFunc::Min => "Min",
            AggFunc::Max => "Max",
            AggFunc::Product => "Product",
            AggFunc::CountNums => "Count Numbers",
            AggFunc::StdDev => "StdDev",
            AggFunc::StdDevP => "StdDevP",
            AggFunc::Var => "Var",
            AggFunc::VarP => "VarP",
        }
    }
}

/// A field reference in a pivot table, identified by source column index.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PivotField {
    /// Display name (usually the source column header).
    pub name: String,
    /// Zero-based index into the source data columns.
    pub source_index: usize,
}

impl PivotField {
    /// Create a new pivot field.
    pub fn new(name: impl Into<String>, source_index: usize) -> Self {
        Self {
            name: name.into(),
            source_index,
        }
    }
}

/// A value field in a pivot table, combining a source field with an aggregation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PivotValueField {
    /// The source field to aggregate.
    pub field: PivotField,
    /// Aggregation function to apply.
    pub agg_func: AggFunc,
    /// Optional custom display name (defaults to `"{func} of {field}"`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

impl PivotValueField {
    /// Create a new pivot value field.
    pub fn new(field: PivotField, agg_func: AggFunc) -> Self {
        Self {
            field,
            agg_func,
            display_name: None,
        }
    }

    /// Get the display name for this value field.
    pub fn display_name(&self) -> String {
        self.display_name
            .clone()
            .unwrap_or_else(|| format!("{} of {}", self.agg_func.label(), self.field.name))
    }
}

/// Configuration for a pivot table computation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PivotTableConfig {
    /// Fields placed on the row axis (become row labels).
    pub row_fields: Vec<PivotField>,
    /// Fields placed on the column axis (become column headers).
    pub col_fields: Vec<PivotField>,
    /// Fields to aggregate in the data area.
    pub value_fields: Vec<PivotValueField>,
    /// Fields to filter the entire pivot by (pre-grouping filter).
    pub filter_fields: Vec<PivotField>,
    /// Whether to show grand totals for rows.
    #[serde(default = "default_true")]
    pub show_row_grand_totals: bool,
    /// Whether to show grand totals for columns.
    #[serde(default = "default_true")]
    pub show_col_grand_totals: bool,
}

fn default_true() -> bool {
    true
}

impl PivotTableConfig {
    /// Create a new pivot table configuration with the given row fields, column fields, and value fields.
    pub fn new(
        row_fields: Vec<PivotField>,
        col_fields: Vec<PivotField>,
        value_fields: Vec<PivotValueField>,
    ) -> Self {
        Self {
            row_fields,
            col_fields,
            value_fields,
            filter_fields: Vec::new(),
            show_row_grand_totals: true,
            show_col_grand_totals: true,
        }
    }
}

/// A single cell in the pivot result grid.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PivotCell {
    /// The aggregated value.
    pub value: CellValue,
    /// Whether this cell is a header/label rather than a data cell.
    pub is_header: bool,
}

/// The complete result of a pivot table computation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PivotResult {
    /// Column header rows (one row per column-field level plus one for value-field labels).
    pub column_headers: Vec<Vec<String>>,
    /// Row header values (one per pivot row, one entry per row-field level).
    pub row_headers: Vec<Vec<String>>,
    /// Data grid: rows × columns of aggregated values.
    pub data: Vec<Vec<CellValue>>,
    /// Grand total values for each data column.
    pub col_grand_totals: Vec<CellValue>,
    /// Grand total values for each data row.
    pub row_grand_totals: Vec<CellValue>,
    /// Grand total of all data (intersection of row and col grand totals).
    pub grand_total: CellValue,
    /// Number of source rows processed (excluding the header row).
    pub source_row_count: usize,
}

// ============================================================================
// Aggregation helpers
// ============================================================================

/// Accumulator state for a single aggregation group.
#[derive(Debug, Clone)]
struct AggAccumulator {
    func: AggFunc,
    /// Count of all values (including non-numeric)
    total_count: usize,
    /// Count of numeric values
    num_count: usize,
    /// Running sum
    sum: f64,
    /// Running sum of squares (for variance/stddev)
    sum_sq: f64,
    /// Current min
    min: f64,
    /// Current max: f64,
    max: f64,
    /// Running product
    product: f64,
}

impl AggAccumulator {
    fn new(func: AggFunc) -> Self {
        Self {
            func,
            total_count: 0,
            num_count: 0,
            sum: 0.0,
            sum_sq: 0.0,
            min: f64::MAX,
            max: f64::MIN,
            product: 1.0,
        }
    }

    /// Feed a value into the accumulator.
    fn feed(&mut self, value: &CellValue) {
        self.total_count += 1;
        match value {
            CellValue::Num(n) => {
                self.num_count += 1;
                self.sum += n;
                self.sum_sq += n * n;
                if *n < self.min {
                    self.min = *n;
                }
                if *n > self.max {
                    self.max = *n;
                }
                self.product *= *n;
            }
            CellValue::Empty | CellValue::Text(_) | CellValue::Bool(_) | CellValue::Err(_) | CellValue::Date(_) => {
                // For COUNT, we count every non-empty value regardless of type
            }
        }
    }

    /// Compute the final aggregated value.
    fn result(&self) -> CellValue {
        match self.func {
            AggFunc::Sum => CellValue::Num(self.sum),
            AggFunc::Count => CellValue::Num(self.total_count as f64),
            AggFunc::Average => {
                if self.num_count == 0 {
                    CellValue::Err(wo_formula::ast::CellErr::DivByZero)
                } else {
                    CellValue::Num(self.sum / self.num_count as f64)
                }
            }
            AggFunc::Min => {
                if self.num_count == 0 {
                    CellValue::Empty
                } else {
                    CellValue::Num(self.min)
                }
            }
            AggFunc::Max => {
                if self.num_count == 0 {
                    CellValue::Empty
                } else {
                    CellValue::Num(self.max)
                }
            }
            AggFunc::Product => {
                if self.num_count == 0 {
                    CellValue::Empty
                } else {
                    CellValue::Num(self.product)
                }
            }
            AggFunc::CountNums => CellValue::Num(self.num_count as f64),
            AggFunc::StdDev => {
                if self.num_count < 2 {
                    CellValue::Err(wo_formula::ast::CellErr::DivByZero)
                } else {
                    let mean = self.sum / self.num_count as f64;
                    let variance = (self.sum_sq / self.num_count as f64) - (mean * mean);
                    CellValue::Num(variance.sqrt())
                }
            }
            AggFunc::StdDevP => {
                if self.num_count == 0 {
                    CellValue::Err(wo_formula::ast::CellErr::DivByZero)
                } else {
                    let mean = self.sum / self.num_count as f64;
                    let variance = (self.sum_sq / self.num_count as f64) - (mean * mean);
                    CellValue::Num(variance.sqrt())
                }
            }
            AggFunc::Var => {
                if self.num_count < 2 {
                    CellValue::Err(wo_formula::ast::CellErr::DivByZero)
                } else {
                    let mean = self.sum / self.num_count as f64;
                    CellValue::Num((self.sum_sq / self.num_count as f64) - (mean * mean))
                }
            }
            AggFunc::VarP => {
                if self.num_count == 0 {
                    CellValue::Err(wo_formula::ast::CellErr::DivByZero)
                } else {
                    let mean = self.sum / self.num_count as f64;
                    CellValue::Num((self.sum_sq / self.num_count as f64) - (mean * mean))
                }
            }
        }
    }
}

// ============================================================================
// Pivot Engine
// ============================================================================

/// The pivot table engine. Processes source data according to a configuration
/// and produces a `PivotResult`.
pub struct PivotEngine {
    /// Pivot table configuration.
    config: PivotTableConfig,
}

impl PivotEngine {
    /// Create a new pivot engine with the given configuration.
    pub fn new(config: PivotTableConfig) -> Self {
        Self { config }
    }

    /// Execute the pivot table on the given source data.
    ///
    /// `source_data` is a 2D grid where:
    /// - Row 0 is the column headers (field names).
    /// - Subsequent rows are data rows.
    /// - Columns are indexed from 0.
    ///
    /// The method groups rows by the configured row and column fields, then
    /// aggregates each group's value fields using the configured functions.
    pub fn execute(&self, source_data: &[Vec<CellValue>]) -> PivotResult {
        if source_data.is_empty() || source_data.len() < 2 {
            return PivotResult {
                column_headers: Vec::new(),
                row_headers: Vec::new(),
                data: Vec::new(),
                col_grand_totals: Vec::new(),
                row_grand_totals: Vec::new(),
                grand_total: CellValue::Empty,
                source_row_count: 0,
            };
        }

        let _header_row = &source_data[0];
        let data_rows = &source_data[1..];

        // Extract column indices for quick lookup
        let row_col_indices: Vec<usize> = self
            .config
            .row_fields
            .iter()
            .map(|f| f.source_index)
            .collect();
        let col_col_indices: Vec<usize> = self
            .config
            .col_fields
            .iter()
            .map(|f| f.source_index)
            .collect();
        let val_col_indices: Vec<usize> = self
            .config
            .value_fields
            .iter()
            .map(|f| f.field.source_index)
            .collect();

        // --- 1. Determine all unique row and column keys ---
        let mut row_key_set: BTreeMap<Vec<String>, usize> = BTreeMap::new(); // key -> row_index
        let mut col_key_set: BTreeMap<Vec<String>, usize> = BTreeMap::new(); // key -> col_index
        let mut row_keys_ordered: Vec<Vec<String>> = Vec::new();
        let mut col_keys_ordered: Vec<Vec<String>> = Vec::new();

        for row in data_rows {
            let row_key: Vec<String> = row_col_indices
                .iter()
                .map(|&idx| value_to_sort_key(row.get(idx).unwrap_or(&CellValue::Empty)))
                .collect();
            let col_key: Vec<String> = col_col_indices
                .iter()
                .map(|&idx| value_to_sort_key(row.get(idx).unwrap_or(&CellValue::Empty)))
                .collect();

            if !row_key_set.contains_key(&row_key) {
                let idx = row_keys_ordered.len();
                row_key_set.insert(row_key.clone(), idx);
                row_keys_ordered.push(row_key);
            }
            if !col_key_set.contains_key(&col_key) {
                let idx = col_keys_ordered.len();
                col_key_set.insert(col_key.clone(), idx);
                col_keys_ordered.push(col_key);
            }
        }

        // If no row keys or col keys, treat all data as a single group
        if row_keys_ordered.is_empty() {
            row_keys_ordered.push(vec!["(blank)".to_string()]);
            row_key_set.insert(vec!["(blank)".to_string()], 0);
        }
        if col_keys_ordered.is_empty() {
            col_keys_ordered.push(vec!["(blank)".to_string()]);
            col_key_set.insert(vec!["(blank)".to_string()], 0);
        }

        // --- 2. Accumulate values ---
        // accumulator[row_idx][col_idx][val_field_idx]
        let num_value_fields = self.config.value_fields.len();
        let mut accumulators: Vec<Vec<Vec<AggAccumulator>>> = vec![
            vec![
                vec![AggAccumulator::new(AggFunc::Sum); num_value_fields];
                col_keys_ordered.len()
            ];
            row_keys_ordered.len()
        ];

        // Build accumulators with the correct aggregation function per value field
        for r in 0..row_keys_ordered.len() {
            for c in 0..col_keys_ordered.len() {
                for v in 0..num_value_fields {
                    accumulators[r][c][v] =
                        AggAccumulator::new(self.config.value_fields[v].agg_func);
                }
            }
        }

        // Also accumulate grand totals
        let mut row_grand_accums: Vec<Vec<AggAccumulator>> =
            vec![vec![AggAccumulator::new(AggFunc::Sum); num_value_fields]; row_keys_ordered.len()];
        let mut col_grand_accums: Vec<Vec<AggAccumulator>> =
            vec![vec![AggAccumulator::new(AggFunc::Sum); num_value_fields]; col_keys_ordered.len()];
        let mut total_grand_accums: Vec<AggAccumulator> =
            (0..num_value_fields)
                .map(|_| AggAccumulator::new(AggFunc::Sum))
                .collect();

        // Fix aggregation functions for grand accumulators
        for v in 0..num_value_fields {
            let func = self.config.value_fields[v].agg_func;
            for r in 0..row_keys_ordered.len() {
                row_grand_accums[r][v] = AggAccumulator::new(func);
            }
            for c in 0..col_keys_ordered.len() {
                col_grand_accums[c][v] = AggAccumulator::new(func);
            }
            total_grand_accums[v] = AggAccumulator::new(func);
        }

        for row in data_rows {
            let row_key: Vec<String> = row_col_indices
                .iter()
                .map(|&idx| value_to_sort_key(row.get(idx).unwrap_or(&CellValue::Empty)))
                .collect();
            let col_key: Vec<String> = col_col_indices
                .iter()
                .map(|&idx| value_to_sort_key(row.get(idx).unwrap_or(&CellValue::Empty)))
                .collect();

            let ri = *row_key_set.get(&row_key).unwrap_or(&0);
            let ci = *col_key_set.get(&col_key).unwrap_or(&0);

            for (v, &val_idx) in val_col_indices.iter().enumerate() {
                let value = row.get(val_idx).unwrap_or(&CellValue::Empty);
                accumulators[ri][ci][v].feed(value);
                row_grand_accums[ri][v].feed(value);
                col_grand_accums[ci][v].feed(value);
                total_grand_accums[v].feed(value);
            }
        }

        // --- 3. Build result grid ---
        let num_data_cols = col_keys_ordered.len() * num_value_fields;
        let num_data_rows = row_keys_ordered.len();
        let mut data: Vec<Vec<CellValue>> = Vec::with_capacity(num_data_rows);
        let mut row_totals: Vec<CellValue> = Vec::with_capacity(num_data_rows);

        for r in 0..num_data_rows {
            let mut row_data: Vec<CellValue> = Vec::with_capacity(num_data_cols);
            for c in 0..col_keys_ordered.len() {
                for v in 0..num_value_fields {
                    row_data.push(accumulators[r][c][v].result());
                }
            }
            data.push(row_data);

            // Row grand total
            let row_total = if num_value_fields == 1 {
                row_grand_accums[r][0].result()
            } else {
                // For multiple value fields, average of the row's values
                let mut sum = 0.0;
                let mut count = 0;
                for v in 0..num_value_fields {
                    if let CellValue::Num(n) = row_grand_accums[r][v].result() {
                        sum += n;
                        count += 1;
                    }
                }
                if count > 0 {
                    CellValue::Num(sum / count as f64)
                } else {
                    CellValue::Empty
                }
            };
            row_totals.push(row_total);
        }

        // Column grand totals
        let mut col_totals: Vec<CellValue> = Vec::with_capacity(num_data_cols);
        for c in 0..col_keys_ordered.len() {
            for v in 0..num_value_fields {
                col_totals.push(col_grand_accums[c][v].result());
            }
        }

        // Overall grand total
        let grand_total = if num_value_fields == 1 {
            total_grand_accums[0].result()
        } else {
            let mut sum = 0.0;
            let mut count = 0;
            for v in 0..num_value_fields {
                if let CellValue::Num(n) = total_grand_accums[v].result() {
                    sum += n;
                    count += 1;
                }
            }
            if count > 0 {
                CellValue::Num(sum / count as f64)
            } else {
                CellValue::Empty
            }
        };

        // --- 4. Build column headers ---
        let mut column_headers: Vec<Vec<String>> = Vec::new();

        if num_value_fields == 1 {
            // Single value field: headers come from column field values
            if !self.config.col_fields.is_empty() {
                let mut field_levels: Vec<Vec<String>> = Vec::new();
                for _ in 0..self.config.col_fields.len() {
                    field_levels.push(Vec::new());
                }
                for col_key in &col_keys_ordered {
                    for (level_idx, val) in col_key.iter().enumerate() {
                        if level_idx < field_levels.len() {
                            field_levels[level_idx].push(val.clone());
                        }
                    }
                }
                column_headers = field_levels;

                // Add value field label as the last row of column headers (spanning all columns)
                let value_label_row: Vec<String> = col_keys_ordered
                    .iter()
                    .map(|_| self.config.value_fields[0].display_name())
                    .collect();
                column_headers.push(value_label_row);
            } else {
                // No column fields: just the value field name
                column_headers.push(
                    col_keys_ordered
                        .iter()
                        .map(|_| self.config.value_fields[0].display_name())
                        .collect(),
                );
            }
        } else {
            // Multiple value fields: each column field group gets all value fields
            if !self.config.col_fields.is_empty() {
                let mut field_levels: Vec<Vec<String>> = Vec::new();
                // Level 0: merged column field values
                let mut header_merge: Vec<String> = Vec::new();
                for col_key in &col_keys_ordered {
                    let label = col_key.join(" ");
                    // Repeat for each value field
                    for _ in 0..num_value_fields {
                        header_merge.push(label.clone());
                    }
                }
                field_levels.push(header_merge);
                // Level 1: value field names
                let mut value_row: Vec<String> = Vec::new();
                for _ in 0..col_keys_ordered.len() {
                    for vf in &self.config.value_fields {
                        value_row.push(vf.display_name());
                    }
                }
                field_levels.push(value_row);
                column_headers = field_levels;
            } else {
                // No column fields: just value field names
                let mut names: Vec<String> = Vec::new();
                for vf in &self.config.value_fields {
                    names.push(vf.display_name());
                }
                column_headers.push(names);
            }
        }

        // --- 5. Build row headers ---
        let row_headers: Vec<Vec<String>> = row_keys_ordered.clone();

        PivotResult {
            column_headers,
            row_headers,
            data,
            col_grand_totals: col_totals,
            row_grand_totals: row_totals,
            grand_total,
            source_row_count: data_rows.len(),
        }
    }
}

/// Convert a CellValue to a string key suitable for grouping/sorting.
fn value_to_sort_key(value: &CellValue) -> String {
    match value {
        CellValue::Empty => String::new(),
        CellValue::Num(n) => {
            if n.fract() == 0.0 {
                format!("{}", *n as i64)
            } else {
                format!("{:.10}", n)
                    .trim_end_matches('0')
                    .trim_end_matches('.')
                    .to_string()
            }
        }
        CellValue::Text(s) => s.clone(),
        CellValue::Bool(b) => format!("{b}"),
        CellValue::Err(e) => format!("{e}"),
        CellValue::Date(d) => format!("{d}"),
    }
}

// ============================================================================
// Convenience function
// ============================================================================

/// Create a pivot table from the given source data and configuration.
///
/// This is a convenience wrapper around `PivotEngine`.
pub fn create_pivot(
    config: &PivotTableConfig,
    source_data: &[Vec<CellValue>],
) -> PivotResult {
    let engine = PivotEngine::new(config.clone());
    engine.execute(source_data)
}

// ============================================================================
// Tests (SS-5: 3 end-to-end pivots)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to create a CellValue::Num from f64.
    fn n(v: f64) -> CellValue {
        CellValue::Num(v)
    }

    /// Helper to create a CellValue::Text from &str.
    fn t(s: &str) -> CellValue {
        CellValue::Text(s.to_string())
    }

    /// Helper to create a CellValue::Empty.
    #[allow(dead_code)]
    fn e() -> CellValue {
        CellValue::Empty
    }

    // ---------------------------------------------------------------
    // Test 1: Simple single-row-field, single-value-field pivot
    //   Source: Sales data with Region, Product, Amount
    //   Pivot:  Region (rows) | Sum of Amount (values)
    //   Expect: 1 row per region with summed amounts
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_simple_sum_by_region() {
        // Source data: [Region, Product, Amount]
        let source = vec![
            vec![t("Region"), t("Product"), t("Amount")],
            vec![t("North"), t("Apples"), n(100.0)],
            vec![t("North"), t("Bananas"), n(50.0)],
            vec![t("South"), t("Apples"), n(75.0)],
            vec![t("South"), t("Bananas"), n(125.0)],
            vec![t("East"), t("Apples"), n(200.0)],
            vec![t("North"), t("Cherries"), n(30.0)],
        ];

        let config = PivotTableConfig::new(
            vec![PivotField::new("Region", 0)],           // row: Region (col 0)
            vec![],                                        // no column fields
            vec![PivotValueField::new(
                PivotField::new("Amount", 2),              // value: Amount (col 2)
                AggFunc::Sum,
            )],
        );

        let result = create_pivot(&config, &source);

        // Verify structure
        assert_eq!(result.source_row_count, 6, "should have 6 data rows");
        assert_eq!(result.row_headers.len(), 3, "should have 3 regions");
        assert_eq!(result.data.len(), 3, "should have 3 data rows");
        assert_eq!(result.data[0].len(), 1, "should have 1 value column");

        // Collect region -> total
        let mut totals: HashMap<String, f64> = HashMap::new();
        for (i, row_key) in result.row_headers.iter().enumerate() {
            let region = row_key[0].clone();
            if let CellValue::Num(val) = result.data[i][0] {
                totals.insert(region, val);
            }
        }

        assert_eq!(totals.get("North"), Some(&180.0), "North sum = 100+50+30");
        assert_eq!(totals.get("South"), Some(&200.0), "South sum = 75+125");
        assert_eq!(totals.get("East"), Some(&200.0), "East sum = 200");

        // Column grand total should be total of all
        assert_eq!(result.col_grand_totals.len(), 1, "1 value field");
        if let CellValue::Num(total) = result.col_grand_totals[0] {
            assert!((total - 580.0).abs() < 0.001, "Grand total should be 580");
        } else {
            panic!("Expected Num grand total");
        }

        // Row grand totals
        assert_eq!(result.row_grand_totals.len(), 3);
    }

    // ---------------------------------------------------------------
    // Test 2: Row + column fields with Count aggregation
    //   Source: Employee data with Department, Gender, Name
    //   Pivot:  Department (rows) | Gender (columns) | Count of Name
    //   Expect: cross-tabulation of employees per dept × gender
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_count_by_dept_and_gender() {
        // Source: [Department, Gender, Name]
        let source = vec![
            vec![t("Dept"), t("Gender"), t("Name")],
            vec![t("Engineering"), t("M"), t("Alice")],
            vec![t("Engineering"), t("M"), t("Bob")],
            vec![t("Engineering"), t("F"), t("Carol")],
            vec![t("Sales"), t("F"), t("Diana")],
            vec![t("Sales"), t("M"), t("Eve")],
            vec![t("Engineering"), t("M"), t("Frank")],
            vec![t("Sales"), t("F"), t("Grace")],
            vec![t("HR"), t("F"), t("Heidi")],
            vec![t("HR"), t("M"), t("Ivan")],
        ];

        let config = PivotTableConfig::new(
            vec![PivotField::new("Dept", 0)],             // row: Department (col 0)
            vec![PivotField::new("Gender", 1)],           // column: Gender (col 1)
            vec![PivotValueField::new(
                PivotField::new("Name", 2),                // value: Name (col 2)
                AggFunc::Count,
            )],
        );

        let result = create_pivot(&config, &source);

        assert_eq!(result.source_row_count, 9, "9 data rows");

        // Row headers should have 3 depts
        assert_eq!(result.row_headers.len(), 3, "3 departments");
        let dept_names: Vec<String> = result.row_headers.iter().map(|r| r[0].clone()).collect();
        assert!(dept_names.contains(&"Engineering".to_string()));
        assert!(dept_names.contains(&"Sales".to_string()));
        assert!(dept_names.contains(&"HR".to_string()));

        // Column headers should have Gender values as one of their levels
        // Find the Engineering row
        let eng_idx = dept_names.iter().position(|d| d == "Engineering").unwrap();
        let _sales_idx = dept_names.iter().position(|d| d == "Sales").unwrap();
        let _hr_idx = dept_names.iter().position(|d| d == "HR").unwrap();

        // Column count = unique genders = 2
        assert_eq!(
            result.data[0].len(),
            2,
            "should have 2 columns (M, F)"
        );

        // Collect values per dept per gender
        let get_val = |row: usize, col: usize| -> f64 {
            match result.data[row][col] {
                CellValue::Num(n) => n,
                _ => 0.0,
            }
        };

        // Engineering: M=3, F=1
        assert!(
            (get_val(eng_idx, 0) - 3.0).abs() < 0.001
                || (get_val(eng_idx, 1) - 3.0).abs() < 0.001,
            "Engineering M should be 3"
        );
        // Sales: M=1, F=2
        // HR: M=1, F=1

        // Verify column grand totals exist
        assert_eq!(result.col_grand_totals.len(), 2);
        // Verify row grand totals exist
        assert_eq!(result.row_grand_totals.len(), 3);
    }

    // ---------------------------------------------------------------
    // Test 3: Multiple row fields with Average aggregation
    //   Source: Sales data with Region, Category, Salesperson, Revenue
    //   Pivot:  Region + Category (rows) | Average of Revenue (values)
    //   Expect: average revenue for each region-category combination
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_average_by_region_and_category() {
        // Source: [Region, Category, Salesperson, Revenue]
        let source = vec![
            vec![t("Region"), t("Category"), t("Salesperson"), t("Revenue")],
            vec![t("North"), t("Electronics"), t("Alice"), n(1000.0)],
            vec![t("North"), t("Electronics"), t("Bob"), n(1500.0)],
            vec![t("North"), t("Furniture"), t("Carol"), n(800.0)],
            vec![t("South"), t("Electronics"), t("Diana"), n(2000.0)],
            vec![t("South"), t("Furniture"), t("Eve"), n(1200.0)],
            vec![t("South"), t("Furniture"), t("Frank"), n(900.0)],
            vec![t("North"), t("Furniture"), t("Grace"), n(1100.0)],
            vec![t("East"), t("Electronics"), t("Heidi"), n(3000.0)],
            vec![t("East"), t("Electronics"), t("Ivan"), n(2500.0)],
        ];

        let config = PivotTableConfig::new(
            vec![
                PivotField::new("Region", 0),       // row level 1
                PivotField::new("Category", 1),     // row level 2
            ],
            vec![],                                  // no column fields
            vec![PivotValueField::new(
                PivotField::new("Revenue", 3),       // value: Revenue (col 3)
                AggFunc::Average,
            )],
        );

        let result = create_pivot(&config, &source);

        assert_eq!(result.source_row_count, 9, "9 data rows");

        // We should have unique region+category combinations
        // North+Electronics, North+Furniture, South+Electronics,
        // South+Furniture, East+Electronics = 5 combos
        assert_eq!(result.row_headers.len(), 5, "5 region-category combos");

        // Build lookup: (region, category) -> average revenue
        let mut averages: HashMap<(String, String), f64> = HashMap::new();
        for (i, headers) in result.row_headers.iter().enumerate() {
            if headers.len() >= 2 {
                let region = headers[0].clone();
                let category = headers[1].clone();
                if let CellValue::Num(val) = result.data[i][0] {
                    averages.insert((region, category), val);
                }
            }
        }

        // North+Electronics avg = (1000+1500)/2 = 1250
        assert!(
            (averages
                .get(&("North".to_string(), "Electronics".to_string()))
                .unwrap_or(&0.0)
                - 1250.0)
                .abs()
                < 0.001
        );

        // North+Furniture avg = (800+1100)/2 = 950
        assert!(
            (averages
                .get(&("North".to_string(), "Furniture".to_string()))
                .unwrap_or(&0.0)
                - 950.0)
                .abs()
                < 0.001
        );

        // South+Electronics = 2000/1 = 2000
        assert!(
            (averages
                .get(&("South".to_string(), "Electronics".to_string()))
                .unwrap_or(&0.0)
                - 2000.0)
                .abs()
                < 0.001
        );

        // South+Furniture = (1200+900)/2 = 1050
        assert!(
            (averages
                .get(&("South".to_string(), "Furniture".to_string()))
                .unwrap_or(&0.0)
                - 1050.0)
                .abs()
                < 0.001
        );

        // East+Electronics = (3000+2500)/2 = 2750
        assert!(
            (averages
                .get(&("East".to_string(), "Electronics".to_string()))
                .unwrap_or(&0.0)
                - 2750.0)
                .abs()
                < 0.001
        );
    }

    // ---------------------------------------------------------------
    // Test 4: Empty source data
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_empty_source() {
        let source: Vec<Vec<CellValue>> = vec![vec![t("A"), t("B")]]; // header only, no data

        let config = PivotTableConfig::new(
            vec![PivotField::new("A", 0)],
            vec![],
            vec![PivotValueField::new(PivotField::new("B", 1), AggFunc::Sum)],
        );

        let result = create_pivot(&config, &source);
        assert_eq!(result.source_row_count, 0);
        assert!(result.row_headers.is_empty());
        assert!(result.data.is_empty());
    }

    // ---------------------------------------------------------------
    // Test 5: Max aggregation
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_max_aggregation() {
        let source = vec![
            vec![t("Group"), t("Value")],
            vec![t("A"), n(10.0)],
            vec![t("A"), n(20.0)],
            vec![t("A"), n(15.0)],
            vec![t("B"), n(5.0)],
            vec![t("B"), n(30.0)],
        ];

        let config = PivotTableConfig::new(
            vec![PivotField::new("Group", 0)],
            vec![],
            vec![PivotValueField::new(PivotField::new("Value", 1), AggFunc::Max)],
        );

        let result = create_pivot(&config, &source);

        let mut maxes: HashMap<String, f64> = HashMap::new();
        for (i, headers) in result.row_headers.iter().enumerate() {
            if let CellValue::Num(val) = result.data[i][0] {
                maxes.insert(headers[0].clone(), val);
            }
        }

        assert_eq!(maxes.get("A"), Some(&20.0), "A max = 20");
        assert_eq!(maxes.get("B"), Some(&30.0), "B max = 30");
    }

    // ---------------------------------------------------------------
    // Test 6: Min aggregation
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_min_aggregation() {
        let source = vec![
            vec![t("Item"), t("Score")],
            vec![t("X"), n(85.0)],
            vec![t("X"), n(92.0)],
            vec![t("X"), n(78.0)],
            vec![t("Y"), n(95.0)],
            vec![t("Y"), n(88.0)],
        ];

        let config = PivotTableConfig::new(
            vec![PivotField::new("Item", 0)],
            vec![],
            vec![PivotValueField::new(PivotField::new("Score", 1), AggFunc::Min)],
        );

        let result = create_pivot(&config, &source);

        let mut mins: HashMap<String, f64> = HashMap::new();
        for (i, headers) in result.row_headers.iter().enumerate() {
            if let CellValue::Num(val) = result.data[i][0] {
                mins.insert(headers[0].clone(), val);
            }
        }

        assert_eq!(mins.get("X"), Some(&78.0), "X min = 78");
        assert_eq!(mins.get("Y"), Some(&88.0), "Y min = 88");
    }

    // ---------------------------------------------------------------
    // Test 7: PivotField and PivotValueField creation
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_field_creation() {
        let field = PivotField::new("Sales", 2);
        assert_eq!(field.name, "Sales");
        assert_eq!(field.source_index, 2);

        let value_field = PivotValueField::new(
            PivotField::new("Revenue", 3),
            AggFunc::Sum,
        );
        assert_eq!(value_field.field.name, "Revenue");
        assert_eq!(value_field.agg_func, AggFunc::Sum);
        assert_eq!(value_field.display_name(), "Sum of Revenue");
    }

    // ---------------------------------------------------------------
    // Test 8: AggFunc labels
    // ---------------------------------------------------------------
    #[test]
    fn test_agg_func_labels() {
        assert_eq!(AggFunc::Sum.label(), "Sum");
        assert_eq!(AggFunc::Average.label(), "Average");
        assert_eq!(AggFunc::Count.label(), "Count");
        assert_eq!(AggFunc::Min.label(), "Min");
        assert_eq!(AggFunc::Max.label(), "Max");
        assert_eq!(AggFunc::Product.label(), "Product");
        assert_eq!(AggFunc::StdDev.label(), "StdDev");
    }

    // ---------------------------------------------------------------
    // Test 9: Serde round-trip for config
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_config_serde() {
        let config = PivotTableConfig::new(
            vec![PivotField::new("Region", 0)],
            vec![PivotField::new("Year", 1)],
            vec![PivotValueField::new(
                PivotField::new("Sales", 2),
                AggFunc::Sum,
            )],
        );

        let json = serde_json::to_string(&config).unwrap();
        let back: PivotTableConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(back.row_fields.len(), 1);
        assert_eq!(back.row_fields[0].name, "Region");
        assert_eq!(back.col_fields.len(), 1);
        assert_eq!(back.col_fields[0].name, "Year");
        assert_eq!(back.value_fields.len(), 1);
        assert_eq!(back.value_fields[0].field.name, "Sales");
        assert_eq!(back.value_fields[0].agg_func, AggFunc::Sum);
    }

    // ---------------------------------------------------------------
    // Test 10: PivotResult serde round-trip
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_result_serde() {
        let result = PivotResult {
            column_headers: vec![vec!["Sum of Value".to_string()]],
            row_headers: vec![vec!["A".to_string()], vec!["B".to_string()]],
            data: vec![vec![n(100.0)], vec![n(200.0)]],
            col_grand_totals: vec![n(300.0)],
            row_grand_totals: vec![n(100.0), n(200.0)],
            grand_total: n(300.0),
            source_row_count: 4,
        };

        let json = serde_json::to_string(&result).unwrap();
        let back: PivotResult = serde_json::from_str(&json).unwrap();

        assert_eq!(back.row_headers.len(), 2);
        assert_eq!(back.data.len(), 2);
        if let CellValue::Num(total) = back.grand_total {
            assert!((total - 300.0).abs() < 0.001);
        } else {
            panic!("Expected Num grand total");
        }
    }

    // ---------------------------------------------------------------
    // Test 11: Multiple value fields
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_multiple_value_fields() {
        let source = vec![
            vec![t("Region"), t("Revenue"), t("Cost")],
            vec![t("North"), n(1000.0), n(600.0)],
            vec![t("North"), n(1500.0), n(900.0)],
            vec![t("South"), n(2000.0), n(1200.0)],
        ];

        let config = PivotTableConfig::new(
            vec![PivotField::new("Region", 0)],
            vec![],
            vec![
                PivotValueField::new(PivotField::new("Revenue", 1), AggFunc::Sum),
                PivotValueField::new(PivotField::new("Cost", 2), AggFunc::Sum),
            ],
        );

        let result = create_pivot(&config, &source);

        assert_eq!(result.source_row_count, 3);
        assert_eq!(result.row_headers.len(), 2); // North, South
        assert_eq!(result.data[0].len(), 2); // 2 value fields per region

        let north_idx = result
            .row_headers
            .iter()
            .position(|h| h[0] == "North")
            .unwrap();

        // North: Revenue sum = 2500, Cost sum = 1500
        if let CellValue::Num(rev) = result.data[north_idx][0] {
            assert!((rev - 2500.0).abs() < 0.001, "North Revenue = 2500");
        } else {
            panic!("Expected Num");
        }
        if let CellValue::Num(cost) = result.data[north_idx][1] {
            assert!((cost - 1500.0).abs() < 0.001, "North Cost = 1500");
        } else {
            panic!("Expected Num");
        }
    }

    // ---------------------------------------------------------------
    // Test 12: Pivot with column fields (cross-tabulation)
    // ---------------------------------------------------------------
    #[test]
    fn test_pivot_with_column_fields() {
        let source = vec![
            vec![t("Product"), t("Quarter"), t("Sales")],
            vec![t("Widget"), t("Q1"), n(100.0)],
            vec![t("Widget"), t("Q2"), n(150.0)],
            vec![t("Gadget"), t("Q1"), n(200.0)],
            vec![t("Gadget"), t("Q2"), n(250.0)],
            vec![t("Widget"), t("Q1"), n(50.0)],
        ];

        let config = PivotTableConfig::new(
            vec![PivotField::new("Product", 0)],
            vec![PivotField::new("Quarter", 1)],
            vec![PivotValueField::new(PivotField::new("Sales", 2), AggFunc::Sum)],
        );

        let result = create_pivot(&config, &source);

        assert_eq!(result.source_row_count, 5);
        assert_eq!(result.row_headers.len(), 2); // Widget, Gadget
        assert_eq!(result.data[0].len(), 2); // Q1, Q2

        // Widget: Q1=150, Q2=150
        // Gadget: Q1=200, Q2=250
        let widget_idx = result.row_headers.iter().position(|h| h[0] == "Widget").unwrap();
        let gadget_idx = result.row_headers.iter().position(|h| h[0] == "Gadget").unwrap();

        // Note: column ordering is by BTreeMap (lexicographic), so Q1=col0, Q2=col1
        if let CellValue::Num(v) = result.data[widget_idx][0] {
            assert!((v - 150.0).abs() < 0.001, "Widget Q1 = 150 (100+50)");
        }
        if let CellValue::Num(v) = result.data[widget_idx][1] {
            assert!((v - 150.0).abs() < 0.001, "Widget Q2 = 150");
        }
        if let CellValue::Num(v) = result.data[gadget_idx][0] {
            assert!((v - 200.0).abs() < 0.001, "Gadget Q1 = 200");
        }
        if let CellValue::Num(v) = result.data[gadget_idx][1] {
            assert!((v - 250.0).abs() < 0.001, "Gadget Q2 = 250");
        }
    }
}
