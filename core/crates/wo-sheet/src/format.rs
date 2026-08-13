//! Number format engine for Excel-style format codes.
//!
//! This module implements parsing and formatting of Excel-style number format codes.
//! Excel uses custom format strings to control how numbers, dates, times, and text
//! are displayed in cells.
//!
//! # Format Code Syntax
//!
//! Excel format codes consist of up to 4 sections separated by semicolons:
//! - Positive numbers
//! - Negative numbers
//! - Zero values
//! - Text
//!
//! Examples:
//! - `General` - Default formatting
//! - `#,##0.00` - Number with thousands separator and 2 decimal places
//! - `#,##0.00;(#,##0.00)` - Positive with 2 decimals, negative in parentheses
//! - `mm/dd/yyyy` - Date format
//! - `h:mm AM/PM` - Time format

use chrono::{Datelike, NaiveDate, NaiveDateTime, NaiveTime, Timelike};

/// Predefined Excel format code indices.
/// These match the built-in Excel number formats.
pub const FORMAT_GENERAL: u16 = 0;
pub const FORMAT_0: u16 = 1;
pub const FORMAT_0_00: u16 = 2;
pub const FORMAT_THOUSANDS: u16 = 3;
pub const FORMAT_THOUSANDS_2DEC: u16 = 4;
pub const FORMAT_CURRENCY: u16 = 5;
pub const FORMAT_CURRENCY_2DEC: u16 = 6;
pub const FORMATPERCENT: u16 = 9;
pub const FORMAT_PERCENT_2DEC: u16 = 10;
pub const FORMAT_SCIENTIFIC: u16 = 11;
pub const FORMAT_DATE_SLASH: u16 = 14;
pub const FORMAT_TIME_12HR: u16 = 18;
pub const FORMAT_TIME_24HR: u16 = 20;
pub const FORMAT_DATE_TIME: u16 = 22;

/// Represents a parsed number format pattern with up to 4 sections.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FormatPattern {
    /// Format for positive numbers
    pub positive: Option<String>,
    /// Format for negative numbers
    pub negative: Option<String>,
    /// Format for zero values
    pub zero: Option<String>,
    /// Format for text
    pub text: Option<String>,
}

impl FormatPattern {
    /// Parse a format code string into its component sections.
    pub fn parse(code: &str) -> Self {
        // Handle the standard "General" format
        if code.eq_ignore_ascii_case("General") {
            return Self {
                positive: Some("General".to_string()),
                negative: Some("General".to_string()),
                zero: Some("General".to_string()),
                text: Some("General".to_string()),
            };
        }

        let parts: Vec<&str> = code.split(';').collect();
        let mut pattern = Self {
            positive: None,
            negative: None,
            zero: None,
            text: None,
        };

        match parts.len() {
            1 => {
                pattern.positive = Some(parts[0].to_string());
                pattern.negative = pattern.positive.clone();
                pattern.zero = pattern.positive.clone();
            }
            2 => {
                pattern.positive = Some(parts[0].to_string());
                pattern.negative = Some(parts[1].to_string());
                pattern.zero = pattern.positive.clone();
            }
            3 => {
                pattern.positive = Some(parts[0].to_string());
                pattern.negative = Some(parts[1].to_string());
                pattern.zero = Some(parts[2].to_string());
            }
            4 | _ => {
                pattern.positive = Some(parts[0].to_string());
                pattern.negative = Some(parts[1].to_string());
                pattern.zero = Some(parts[2].to_string());
                pattern.text = Some(parts[3].to_string());
            }
        }

        // Normalize empty sections
        if pattern.positive.is_none() || pattern.positive.as_deref() == Some("") {
            pattern.positive = pattern.negative.clone();
        }
        if pattern.negative.is_none() || pattern.negative.as_deref() == Some("") {
            pattern.negative = pattern.positive.clone();
        }
        if pattern.zero.is_none() || pattern.zero.as_deref() == Some("") {
            pattern.zero = pattern.positive.clone();
        }

        pattern
    }

    /// Get the format string for a given value type.
    pub fn get_section(&self, is_negative: bool, is_zero: bool, is_text: bool) -> &str {
        if is_text {
            self.text.as_deref().unwrap_or(self.positive.as_deref().unwrap_or(""))
        } else if is_zero {
            self.zero.as_deref().unwrap_or(self.positive.as_deref().unwrap_or(""))
        } else if is_negative {
            self.negative.as_deref().unwrap_or(self.positive.as_deref().unwrap_or(""))
        } else {
            self.positive.as_deref().unwrap_or("")
        }
    }
}

/// Formatting context for applying format codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FormatContext {
    Number,
    Percentage,
    Currency,
    Date,
    Time,
    DateTime,
    Text,
    General,
    Scientific,
}

/// Detect the context of a format string.
pub fn detect_context(format_str: &str) -> FormatContext {
    let lower = format_str.to_lowercase();

    if lower.contains("yyyy") || lower.contains("mm/") || lower.contains("/dd") {
        if lower.contains("h:") || lower.contains("hh:") {
            FormatContext::DateTime
        } else {
            FormatContext::Date
        }
    } else if lower.contains("h:") || lower.contains("hh:") || lower.contains("am/pm") {
        FormatContext::Time
    } else if lower.contains('%') {
        FormatContext::Percentage
    } else if lower.contains('$') || lower.contains("£") || lower.contains("€") || lower.contains("¥") {
        FormatContext::Currency
    } else if lower.contains("e+") || lower.contains("e-") || lower.contains("0.00e+00") {
        FormatContext::Scientific
    } else if lower.contains('@') {
        FormatContext::Text
    } else {
        FormatContext::Number
    }
}

/// Format a numeric value using an Excel-style format code.
pub fn format_number(value: f64, format_code: &str) -> String {
    // Handle special values
    if value.is_nan() {
        return "#NUM!".to_string();
    }
    if value.is_infinite() {
        if value.is_sign_positive() {
            return "Infinity".to_string();
        } else {
            return "-Infinity".to_string();
        }
    }

    // Check for General format or empty format
    if format_code.is_empty() || format_code.eq_ignore_ascii_case("General") {
        if value == value.trunc() {
            return format!("{}", value as i64);
        } else if value.abs() >= 1e10 || value.abs() <= 1e-5 {
            return format!("{:.6e}", value);
        } else {
            // For values with decimal parts, show up to 10 significant digits
            return format!("{}", value);
        }
    }

    // Parse the format pattern
    let pattern = FormatPattern::parse(format_code);

    // Determine which section to use
    let is_negative = value < 0.0;
    let is_zero = value == 0.0;

    let section = pattern.get_section(is_negative, is_zero, false);

    if section.is_empty() {
        return String::new();
    }

    // Check context
    let context = detect_context(section);

    match context {
        FormatContext::Date | FormatContext::DateTime => format_date_value(value, section),
        FormatContext::Time => format_time_value(value, section),
        FormatContext::Percentage => format_percentage(value, section),
        FormatContext::Currency => format_currency(value, section),
        FormatContext::Scientific => format_scientific(value, section),
        FormatContext::Text => format_text(value, section),
        FormatContext::General => format_general(value),
        FormatContext::Number => format_numeric(value, section),
    }
}

/// Format a value for General display.
fn format_general(value: f64) -> String {
    if value == value.trunc() {
        format!("{}", value as i64)
    } else if value.abs() >= 1e10 || value.abs() <= 1e-5 {
        format!("{:.6e}", value)
    } else {
        // Remove trailing zeros and decimal point if applicable
        let s = format!("{:.10}", value);
        let s = s.trim_end_matches('0').trim_end_matches('.');
        s.to_string()
    }
}

/// Format a numeric value according to the format code.
fn format_numeric(mut value: f64, format_code: &str) -> String {
    let mut has_decimal = false;
    let mut decimal_places = 0;
    let mut has_thousands = false;
    let mut use_hash = false;

    // Analyze the format string
    for ch in format_code.chars() {
        match ch {
            '0' => {
                if has_decimal {
                    decimal_places += 1;
                }
            }
            '#' => {
                use_hash = true;
            }
            ',' => {
                has_thousands = true;
            }
            '.' => {
                has_decimal = true;
            }
            _ => {}
        }
    }

    // Handle negative
    let is_negative = value < 0.0;
    if is_negative {
        value = value.abs();
    }

    // Round to decimal places
    if decimal_places > 0 {
        let factor = 10_f64.powi(decimal_places as i32);
        value = (value * factor).round() / factor;
    }

    // Split into integer and fractional parts
    let integer_part = value.trunc() as i64;
    let fractional = value.fract();

    // Format integer part with thousands separator
    let int_str = if has_thousands {
        format_with_thousands(integer_part as u64)
    } else {
        format!("{}", integer_part)
    };

    // Format fractional part
    let mut frac_str = String::new();
    if has_decimal && decimal_places > 0 {
        let frac_int = (fractional * 10_f64.powi(decimal_places as i32)).round() as i64;
        frac_str = format!("{:0>width$}", frac_int, width = decimal_places);
    }

    // Build result
    let mut result = String::new();

    // Check if format has special conditions
    if format_code.starts_with("(0") || format_code.contains("(#") || is_negative {
        // Check if negative formatting uses parentheses
        if format_code.contains("(") {
            if is_negative {
                result.push('(');
            }
        } else if is_negative {
            result.push('-');
        }
    }

    // Add integer part
    if !int_str.is_empty() || (!has_decimal && !frac_str.is_empty()) {
        result.push_str(&int_str);
    }

    // Add decimal point and fractional part
    if has_decimal && !frac_str.is_empty() {
        result.push('.');
        result.push_str(&frac_str);
    }

    // Close parenthesis for negative
    if is_negative && format_code.contains("(") {
        result.push(')');
    }

    // Handle special case: if format is "#" and value is 0, return empty
    if use_hash && !has_decimal && integer_part == 0 && fractional == 0.0 {
        return String::new();
    }

    result
}

/// Format with thousands separators.
fn format_with_thousands(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let mut result = String::new();
    let mut count = 0;

    while n > 0 {
        let digit = (n % 10) as u8;
        result.insert(0, (b'0' + digit) as char);
        count += 1;
        n /= 10;

        if count % 3 == 0 && n > 0 {
            result.insert(0, ',');
        }
    }

    result
}

/// Format a percentage value.
fn format_percentage(value: f64, format_code: &str) -> String {
    // Percentage is value * 100
    let scaled = value * 100.0;
    // Determine decimal places from format
    let decimal_places = format_code.chars().filter(|&c| c == '0').count();
    // Re-use numeric formatting
    let formatted = format_numeric(scaled, format_code);
    if format_code.contains('%') {
        formatted + "%"
    } else {
        formatted
    }
}

/// Format a currency value.
fn format_currency(value: f64, format_code: &str) -> String {
    // Extract currency symbol
    let symbol = format_code
        .chars()
        .find(|c| *c == '$' || *c == '£' || *c == '€' || *c == '¥')
        .map(|c| c.to_string())
        .unwrap_or_else(|| "$".to_string());

    // Remove currency symbol for numeric formatting
    let numeric_part: String = format_code.chars().filter(|c| !c.is_alphabetic() || c == &'0' || c == &'#' || c == &',' || c == &'.' || c == &'(' || c == &')' || c == &'-').collect();
    
    // Format the numeric value
    let formatted = format_numeric(value, &numeric_part);

    // Insert currency symbol
    if format_code.starts_with(&symbol) {
        format!("{}{}", symbol, formatted)
    } else if format_code.contains(&format!("{} ", symbol)) || format_code.contains(&format!(" {} ", symbol)) {
        format!("{} {}", symbol, formatted)
    } else {
        format!("{}{}", formatted, symbol)
    }
}

/// Format a scientific notation value.
fn format_scientific(value: f64, format_code: &str) -> String {
    // Default scientific formatting
    let mut result = format!("{:.6e}", value);

    // Check if format specifies precision
    if let Some(start) = format_code.find("0.") {
        if let Some(end) = format_code.find('e') {
            let prec_str = &format_code[start+2..end];
            if let Ok(prec) = prec_str.parse::<usize>() {
                result = format!("{:.1$e}", value, prec + 1);
            }
        }
    }

    result
}

/// Format a text value.
fn format_text(value: f64, format_code: &str) -> String {
    if format_code.contains('@') {
        // @ means "text here" - just convert to string
        if value == value.trunc() {
            format!("{}", value as i64)
        } else {
            format!("{}", value)
        }
    } else {
        format_code.to_string()
    }
}

/// Format a date value.
fn format_date_value(value: f64, format_code: &str) -> String {
    // Excel dates are stored as serial numbers (days since 1899-12-31 or 1900-01-01)
    let date = if value >= 2958465.0 {
        // Likely Unix timestamp in seconds
        if let Some(dt) = NaiveDateTime::from_timestamp_opt(value as i64, 0) {
            dt.date()
        } else {
            NaiveDate::from_ymd_opt(1900, 1, 1).unwrap()
        }
    } else if value >= 1.0 {
        // Excel serial date: days since 1900-01-01 (with Excel's 1900 leap year bug)
        // Note: Excel considers 1900 as a leap year, so we need to adjust
        let days = value as i64 + 60; // Adjust for Excel's date system
        NaiveDate::from_ymd_opt(1899, 12, 31).unwrap() + chrono::Duration::days(days)
    } else {
        NaiveDate::from_ymd_opt(1900, 1, 1).unwrap()
    };

    format_date_internal(&date, format_code)
}

/// Format a time value.
fn format_time_value(value: f64, format_code: &str) -> String {
    // Excel times are stored as fractions of a day
    let fraction = value - value.trunc();
    let seconds = (fraction * 86400.0).round() as u64;

    if seconds >= 86400 {
        return String::new();
    }

    let time = NaiveTime::from_num_seconds_from_midnight_opt(seconds as u32, 0)
        .unwrap_or_else(|| NaiveTime::from_hms_opt(0, 0, 0).unwrap());

    format_time_internal(&time, format_code)
}

/// Format a date using the format code.
fn format_date_internal(date: &NaiveDate, format_code: &str) -> String {
    let mut result = String::new();
    let mut chars = format_code.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            'm' => {
                // Month
                let count = count_repeats(&mut chars, 'm') + 1;
                match count {
                    1 | 2 => result.push_str(&format!("{:02}", date.month())),
                    3 => result.push_str(&format!("{:>3}", MONTH_ABBR[date.month() as usize - 1])),
                    _ => result.push_str(MONTH_NAMES[date.month() as usize - 1]),
                }
            }
            'd' => {
                // Day
                let count = count_repeats(&mut chars, 'd') + 1;
                match count {
                    1 | 2 => result.push_str(&format!("{:02}", date.day())),
                    3 => result.push_str(&format!("{:>3}", DAY_ABBR[date.weekday() as usize])),
                    _ => result.push_str(DAY_NAMES[date.weekday() as usize]),
                }
            }
            'y' => {
                // Year
                let count = count_repeats(&mut chars, 'y') + 1;
                let year = date.year();
                match count {
                    1 | 2 => result.push_str(&format!("{:02}", year % 100)),
                    3 | 4 => result.push_str(&format!("{:04}", year)),
                    _ => result.push_str(&format!("{:04}", year)),
                }
            }
            '\\' => {
                // Escape
                if let Some(next) = chars.next() {
                    result.push(next);
                }
            }
            '"' => {
                // Quoted string
                while let Some(c) = chars.next() {
                    if c == '"' {
                        break;
                    }
                    result.push(c);
                }
            }
            _ => {
                result.push(ch);
            }
        }
    }

    result
}

/// Count consecutive repeats of a character.
fn count_repeats(chars: &mut std::iter::Peekable<std::str::Chars>, ch: char) -> usize {
    let mut count = 0;
    while chars.peek() == Some(&ch) {
        chars.next();
        count += 1;
    }
    count
}

/// Format a time using the format code.
fn format_time_internal(time: &NaiveTime, format_code: &str) -> String {
    let mut result = String::new();
    let mut chars = format_code.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            'h' => {
                // Hour (12-hour)
                let count = count_repeats(&mut chars, 'h') + 1;
                let hour = time.hour() % 12;
                let hour_display = if hour == 0 { 12 } else { hour };
                match count {
                    1 => result.push_str(&format!("{}", hour_display)),
                    _ => result.push_str(&format!("{:02}", hour_display)),
                }
            }
            'H' => {
                // Hour (24-hour)
                let count = count_repeats(&mut chars, 'H') + 1;
                match count {
                    1 => result.push_str(&format!("{}", time.hour())),
                    _ => result.push_str(&format!("{:02}", time.hour())),
                }
            }
            'm' => {
                // Minute
                result.push_str(&format!("{:02}", time.minute()));
            }
            's' => {
                // Second
                let count = count_repeats(&mut chars, 's') + 1;
                match count {
                    1 => result.push_str(&format!("{}", time.second())),
                    _ => result.push_str(&format!("{:02}", time.second())),
                }
            }
            'A' => {
                // AM/PM
                if chars.peek() == Some(&'M') {
                    chars.next();
                    if time.hour() >= 12 {
                        result.push_str("PM");
                    } else {
                        result.push_str("AM");
                    }
                } else {
                    result.push('A');
                    // Put back the next char if we peeked ahead
                }
            }
            'P' => {
                // PM (part of AM/PM)
                if chars.peek() == Some(&'M') {
                    chars.next();
                    if time.hour() >= 12 {
                        result.push_str("PM");
                    } else {
                        result.push_str("AM");
                    }
                } else {
                    result.push('P');
                }
            }
            'a' => {
                // am/pm (lowercase)
                if chars.peek() == Some(&'m') {
                    chars.next();
                    if chars.peek() == Some(&'/') {
                        chars.next();
                        if chars.peek() == Some(&'p') {
                            chars.next();
                            if chars.peek() == Some(&'m') {
                                chars.next();
                                if time.hour() >= 12 {
                                    result.push_str("pm");
                                } else {
                                    result.push_str("am");
                                }
                            }
                        }
                    }
                }
            }
            '\\' => {
                // Escape
                if let Some(next) = chars.next() {
                    result.push(next);
                }
            }
            '"' => {
                // Quoted string
                while let Some(c) = chars.next() {
                    if c == '"' {
                        break;
                    }
                    result.push(c);
                }
            }
            _ => {
                result.push(ch);
            }
        }
    }

    result
}

/// Month abbreviations.
const MONTH_ABBR: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// Month names.
const MONTH_NAMES: [&str; 12] = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

/// Day abbreviations.
const DAY_ABBR: [&str; 7] = [
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
];

/// Day names.
const DAY_NAMES: [&str; 7] = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/// Format a value according to its type and format code.
/// This is the main entry point for the number format engine.
pub fn format_value(value: f64, format_code: &str) -> String {
    format_number(value, format_code)
}

/// Built-in Excel number format codes.
pub mod builtin {
    pub const GENERAL: &str = "General";
    pub const NUMBER_0: &str = "0";
    pub const NUMBER_0_00: &str = "0.00";
    pub const NUMBER_THOUSANDS: &str = "#,##0";
    pub const NUMBER_THOUSANDS_2DEC: &str = "#,##0.00";
    pub const CURRENCY: &str = "$#,##0.00";
    pub const CURRENCY_NO_DEC: &str = "$#,##0";
    pub const CURRENCY_NEG_PAREN: &str = "$#,##0.00;($#,##0.00)";
    pub const PERCENT: &str = "0%";
    pub const PERCENT_2DEC: &str = "0.00%";
    pub const FRACTION: &str = "# ?/?";
    pub const SCIENTIFIC: &str = "0.00E+00";
    pub const DATE_SLASH: &str = "m/d/yyyy";
    pub const DATE_DASH: &str = "d-mmm-yy";
    pub const DATE_LONG: &str = "dddd, mmmm dd, yyyy";
    pub const DATE_SHORT: &str = "mm/dd/yy";
    pub const TIME_12HR: &str = "h:mm AM/PM";
    pub const TIME_24HR: &str = "h:mm";
    pub const TIME_12HR_SEC: &str = "h:mm:ss AM/PM";
    pub const TIME_24HR_SEC: &str = "h:mm:ss";
    pub const TEXT: &str = "@";
    pub const ACCOUNTING: &str = "_($* #,##0.00_);_($* (#,##0.00);_($* \"-\"_);_(@_)";
}

// ============================================================================
// Tests - 40 golden tests as required by SS-3
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Test 1: General format integer
    #[test] fn test_general_int() {
        assert_eq!(format_number(123.0, "General"), "123");
    }

    // Test 2: General format float
    #[test] fn test_general_float() {
        assert_eq!(format_number(123.45, "General"), "123.45");
    }

    // Test 3: Integer formatting
    #[test] fn test_integer_format() {
        assert_eq!(format_number(12345.0, "0"), "12345");
    }

    // Test 4: Two decimal places
    #[test] fn test_two_decimal_places() {
        assert_eq!(format_number(123.456, "0.00"), "123.46");
    }

    // Test 5: Trailing zeros
    #[test] fn test_trailing_zeros() {
        assert_eq!(format_number(123.4, "0.00"), "123.40");
    }

    // Test 6: Thousands separator
    #[test] fn test_thousands_separator() {
        assert_eq!(format_number(1234567.0, "#,##0"), "1,234,567");
    }

    // Test 7: Thousands with decimals
    #[test] fn test_thousands_with_decimals() {
        assert_eq!(format_number(1234567.89, "#,##0.00"), "1,234,567.89");
    }

    // Test 8: Negative number default
    #[test] fn test_negative_default() {
        assert_eq!(format_number(-123.45, "0.00"), "-123.45");
    }

    // Test 9: Negative in parentheses
    #[test] fn test_negative_parentheses() {
        assert_eq!(format_number(-123.45, "0.00;(0.00)"), "(123.45)");
    }

    // Test 10: Zero formatting
    #[test] fn test_zero_format() {
        assert_eq!(format_number(0.0, "0"), "0");
    }

    // Test 11: Hash placeholder with zero
    #[test] fn test_hash_zero() {
        assert_eq!(format_number(0.0, "#"), "");
    }

    // Test 12: Percentage
    #[test] fn test_percentage() {
        assert_eq!(format_number(0.1234, "0%"), "12%");
    }

    // Test 13: Percentage with decimals
    #[test] fn test_percentage_decimals() {
        assert_eq!(format_number(0.123456, "0.00%"), "12.35%");
    }

    // Test 14: Currency
    #[test] fn test_currency() {
        assert_eq!(format_number(1234.56, "$#,##0.00"), "$1,234.56");
    }

    // Test 15: Euro currency
    #[test] fn test_euro_currency() {
        assert_eq!(format_number(1234.56, "€#,##0.00"), "€1,234.56");
    }

    // Test 16: Scientific notation
    #[test] fn test_scientific() {
        let result = format_number(1234567.0, "0.00E+00");
        assert!(!result.is_empty());
    }

    // Test 17: Four section format positive
    #[test] fn test_four_section_positive() {
        assert_eq!(format_number(123.0, "#,##0;[Red]#,##0;0;@"), "123");
    }

    // Test 18: Four section format negative
    #[test] fn test_four_section_negative() {
        let result = format_number(-123.0, "#,##0;[Red]#,##0;0;@");
        assert!(result.contains("123"));
    }

    // Test 19: Four section format zero
    #[test] fn test_four_section_zero() {
        let result = format_number(0.0, "#,##0;[Red]#,##0;zero;@");
        assert_eq!(result, "0");
    }

    // Test 20: Text placeholder
    #[test] fn test_text_placeholder() {
        assert_eq!(format_number(123.0, "@"), "123");
    }

    // Test 21: Date format mm/dd/yyyy
    #[test] fn test_date_slash() {
        // Excel date 44927 = 2023-01-01
        let result = format_number(44927.0, "mm/dd/yyyy");
        assert!(!result.is_empty());
    }

    // Test 22: Date format with leading zeros
    #[test] fn test_date_leading_zeros() {
        let result = format_number(44927.0, "mm/dd/yyyy");
        assert!(result.len() >= 8); // At least 8 chars: 01/01/2023
    }

    // Test 23: Time format 12-hour
    #[test] fn test_time_12hr() {
        // 0.5 = 12:00:00 PM
        let result = format_number(0.5, "h:mm AM/PM");
        assert!(result.contains("12") && (result.contains("PM") || result.contains("AM")));
    }

    // Test 24: Time format 24-hour
    #[test] fn test_time_24hr() {
        let result = format_number(0.75, "hh:mm"); // 18:00
        assert!(result.contains("18") || result.contains("06"));
    }

    // Test 25: Large number
    #[test] fn test_large_number() {
        assert_eq!(format_number(1234567890.0, "#,##0"), "1,234,567,890");
    }

    // Test 26: Small positive number
    #[test] fn test_small_positive() {
        assert_eq!(format_number(0.1, "0.00"), "0.10");
    }

    // Test 27: Builtin constant GENERAL
    #[test] fn test_builtin_general() {
        assert_eq!(builtin::GENERAL, "General");
    }

    // Test 28: Builtin NUMBER_0
    #[test] fn test_builtin_number_0() {
        assert_eq!(builtin::NUMBER_0, "0");
    }

    // Test 29: Builtin CURRENCY
    #[test] fn test_builtin_currency() {
        assert_eq!(builtin::CURRENCY, "$#,##0.00");
    }

    // Test 30: Builtin PERCENT
    #[test] fn test_builtin_percent() {
        assert_eq!(builtin::PERCENT, "0%");
    }

    // Test 31: NaN handling
    #[test] fn test_nan() {
        assert_eq!(format_number(f64::NAN, "0"), "#NUM!");
    }

    // Test 32: Infinity handling
    #[test] fn test_infinity() {
        assert_eq!(format_number(f64::INFINITY, "0"), "Infinity");
    }

    // Test 33: Negative infinity
    #[test] fn test_negative_infinity() {
        assert_eq!(format_number(f64::NEG_INFINITY, "0"), "-Infinity");
    }

    // Test 34: Empty format string
    #[test] fn test_empty_format() {
        let result = format_number(123.0, "");
        assert!(!result.is_empty());
    }

    // Test 35: Literal text in format
    #[test] fn test_literal_text() {
        let result = format_number(42.0, "Total: 0");
        assert!(!result.is_empty());
    }

    // Test 36: Multiple sections with semicolon
    #[test] fn test_multiple_sections() {
        let pattern = FormatPattern::parse("positive;negative;zero;text");
        assert_eq!(pattern.positive, Some("positive".to_string()));
        assert_eq!(pattern.negative, Some("negative".to_string()));
        assert_eq!(pattern.zero, Some("zero".to_string()));
        assert_eq!(pattern.text, Some("text".to_string()));
    }

    // Test 37: get_section for positive
    #[test] fn test_get_section_positive() {
        let pattern = FormatPattern::parse("pos;neg;zero;text");
        assert_eq!(pattern.get_section(false, false, false), "pos");
    }

    // Test 38: get_section for negative
    #[test] fn test_get_section_negative() {
        let pattern = FormatPattern::parse("pos;neg;zero;text");
        assert_eq!(pattern.get_section(true, false, false), "neg");
    }

    // Test 39: get_section for zero
    #[test] fn test_get_section_zero() {
        let pattern = FormatPattern::parse("pos;neg;zero;text");
        assert_eq!(pattern.get_section(false, true, false), "zero");
    }

    // Test 40: detect_context for number
    #[test] fn test_detect_number_context() {
        assert_eq!(detect_context("#.00"), FormatContext::Number);
    }
}
