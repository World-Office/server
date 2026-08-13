//! Text / string functions.
//!
//! Excel-compatible implementations for LEN, TRIM, UPPER, LOWER, PROPER,
//! LEFT, RIGHT, MID, FIND, SEARCH, REPLACE, SUBSTITUTE, REPT, CONCATENATE,
//! TEXTJOIN, T, TEXT, VALUE, NUMBERVALUE, CHAR, CODE, UNICHAR, UNICODE,
//! EXACT, DOLLAR, FIXED, CLEAN, ARABIC, ROMAN, and their B-suffixed variants.

use crate::ast::{CellErr, CellValue, Expr, FormulaError};
use crate::eval::{eval, Sheet};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn eval_arg(expr: &Expr, sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    eval(expr, sheet)
}

fn single_val(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.is_empty() {
        return Err(FormulaError::WrongArgCount {
            func: "?".to_string(),
            expected: 1,
            actual: 0,
        });
    }
    eval_arg(&args[0], sheet)
}

fn single_text(args: &[Expr], sheet: &impl Sheet) -> Result<String, FormulaError> {
    let val = single_val(args, sheet)?;
    match val {
        CellValue::Text(s) => Ok(s),
        CellValue::Num(n) => Ok(n.to_string()),
        CellValue::Bool(b) => Ok(b.to_string()),
        CellValue::Empty => Ok(String::new()),
        CellValue::Date(d) => Ok(d.format("%Y-%m-%d").to_string()),
        CellValue::Err(e) => Err(FormulaError::TypeMismatch(e.to_string())),
    }
}

fn collect_texts(args: &[Expr], sheet: &impl Sheet) -> Result<Vec<String>, FormulaError> {
    let mut result = Vec::new();
    for arg in args {
        let val = eval_arg(arg, sheet)?;
        match val {
            CellValue::Text(s) => result.push(s),
            CellValue::Num(n) => result.push(n.to_string()),
            CellValue::Bool(b) => result.push(b.to_string()),
            CellValue::Empty => {}
            CellValue::Date(d) => result.push(d.format("%Y-%m-%d").to_string()),
            CellValue::Err(e) => return Err(FormulaError::TypeMismatch(e.to_string())),
        }
    }
    Ok(result)
}

fn collect_nums(args: &[Expr], sheet: &impl Sheet) -> Result<Vec<f64>, FormulaError> {
    let mut nums = Vec::new();
    for arg in args {
        let val = eval_arg(arg, sheet)?;
        if let CellValue::Num(n) = val {
            nums.push(n);
        }
    }
    Ok(nums)
}

fn single_num(args: &[Expr], sheet: &impl Sheet) -> Result<f64, FormulaError> {
    let val = single_val(args, sheet)?;
    match val {
        CellValue::Num(n) => Ok(n),
        CellValue::Bool(true) => Ok(1.0),
        CellValue::Bool(false) => Ok(0.0),
        CellValue::Text(s) => s.parse::<f64>().map_err(|_| FormulaError::ValueError),
        CellValue::Empty => Ok(0.0),
        CellValue::Date(d) => Ok(serial_date(d)),
        CellValue::Err(e) => Err(FormulaError::TypeMismatch(e.to_string())),
    }
}

/// Convert a NaiveDateTime to Excel serial date number.
fn serial_date(d: chrono::NaiveDateTime) -> f64 {
    let epoch = chrono::NaiveDate::from_ymd_opt(1899, 12, 30).unwrap();
    let days = (d.date() - epoch).num_days() as f64;
    let secs = d.and_hms_opt(0, 0, 0).unwrap();
    let time_fraction =
        (d.signed_duration_since(secs).num_seconds() as f64) / 86400.0;
    days + time_fraction
}

// ---------------------------------------------------------------------------
// LEN / LENB — returns the number of characters (LENB behaves same for
// single-byte languages)
// ---------------------------------------------------------------------------

pub fn fn_len(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    Ok(CellValue::Num(s.chars().count() as f64))
}

// ---------------------------------------------------------------------------
// TRIM — removes leading/trailing spaces, collapses internal whitespace
// ---------------------------------------------------------------------------

pub fn fn_trim(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    let trimmed = s
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    Ok(CellValue::Text(trimmed))
}

// ---------------------------------------------------------------------------
// UPPER — uppercase
// ---------------------------------------------------------------------------

pub fn fn_upper(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    Ok(CellValue::Text(s.to_uppercase()))
}

// ---------------------------------------------------------------------------
// LOWER — lowercase
// ---------------------------------------------------------------------------

pub fn fn_lower(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    Ok(CellValue::Text(s.to_lowercase()))
}

// ---------------------------------------------------------------------------
// PROPER — capitalizes first letter of each word
// ---------------------------------------------------------------------------

pub fn fn_proper(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    let mut result = String::with_capacity(s.len());
    let mut prev_is_letter = false;
    for c in s.chars() {
        if c.is_alphabetic() {
            if prev_is_letter {
                result.extend(c.to_lowercase());
            } else {
                result.extend(c.to_uppercase());
            }
            prev_is_letter = true;
        } else {
            result.push(c);
            prev_is_letter = false;
        }
    }
    Ok(CellValue::Text(result))
}

// ---------------------------------------------------------------------------
// LEFT / LEFTB — returns leftmost n characters
// ---------------------------------------------------------------------------

pub fn fn_left(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    let n = if args.len() >= 2 {
        let val = eval_arg(&args[1], sheet)?;
        match val {
            CellValue::Num(n) => n as usize,
            CellValue::Empty => 1,
            _ => 1,
        }
    } else {
        1
    };
    let result: String = s.chars().take(n).collect();
    Ok(CellValue::Text(result))
}

// ---------------------------------------------------------------------------
// RIGHT / RIGHTB — returns rightmost n characters
// ---------------------------------------------------------------------------

pub fn fn_right(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    let n = if args.len() >= 2 {
        let val = eval_arg(&args[1], sheet)?;
        match val {
            CellValue::Num(n) => n as usize,
            CellValue::Empty => 1,
            _ => 1,
        }
    } else {
        1
    };
    let chars: Vec<char> = s.chars().collect();
    let start = if n >= chars.len() { 0 } else { chars.len() - n };
    let result: String = chars[start..].iter().collect();
    Ok(CellValue::Text(result))
}

// ---------------------------------------------------------------------------
// MID / MIDB — returns substring starting at position for n chars
// ---------------------------------------------------------------------------

pub fn fn_mid(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    if args.len() < 3 {
        return Err(FormulaError::WrongArgCount {
            func: "MID".to_string(),
            expected: 3,
            actual: args.len(),
        });
    }
    let start_num = match eval_arg(&args[1], sheet)? {
        CellValue::Num(n) => n as usize,
        _ => return Err(FormulaError::ValueError),
    };
    let num_chars = match eval_arg(&args[2], sheet)? {
        CellValue::Num(n) => n as usize,
        _ => return Err(FormulaError::ValueError),
    };
    if start_num == 0 {
        return Ok(CellValue::Text(String::new()));
    }
    let start = start_num - 1; // Excel is 1-indexed
    let chars: Vec<char> = s.chars().collect();
    if start >= chars.len() {
        return Ok(CellValue::Text(String::new()));
    }
    let end = (start + num_chars).min(chars.len());
    let result: String = chars[start..end].iter().collect();
    Ok(CellValue::Text(result))
}

// ---------------------------------------------------------------------------
// FIND / FINDB — case-sensitive position (1-indexed)
// ---------------------------------------------------------------------------

pub fn fn_find(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "FIND".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let find_text = single_text(&args[0..1], sheet)?;
    let within_text = single_text(&args[1..2], sheet)?;
    let start_num = if args.len() >= 3 {
        match eval_arg(&args[2], sheet)? {
            CellValue::Num(n) => n as usize,
            _ => 1,
        }
    } else {
        1
    };

    if start_num < 1 {
        return Err(FormulaError::ValueError);
    }

    let chars: Vec<char> = within_text.chars().collect();
    let start_idx = (start_num - 1).min(chars.len());
    let search_in: String = chars[start_idx..].iter().collect();

    match search_in.find(&find_text) {
        Some(pos) => Ok(CellValue::Num((start_idx + pos + 1) as f64)),
        None => Ok(CellValue::Err(CellErr::Value)),
    }
}

// ---------------------------------------------------------------------------
// SEARCH / SEARCHB — case-insensitive position (1-indexed)
// ---------------------------------------------------------------------------

pub fn fn_search(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "SEARCH".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let find_text = single_text(&args[0..1], sheet)?;
    let within_text = single_text(&args[1..2], sheet)?;
    let start_num = if args.len() >= 3 {
        match eval_arg(&args[2], sheet)? {
            CellValue::Num(n) => n as usize,
            _ => 1,
        }
    } else {
        1
    };

    if start_num < 1 {
        return Err(FormulaError::ValueError);
    }

    let lower_find = find_text.to_lowercase();
    let lower_within = within_text.to_lowercase();
    let chars: Vec<char> = lower_within.chars().collect();
    let start_idx = (start_num - 1).min(chars.len());
    let search_in: String = chars[start_idx..].iter().collect();

    match search_in.find(&lower_find) {
        Some(pos) => Ok(CellValue::Num((start_idx + pos + 1) as f64)),
        None => Ok(CellValue::Err(CellErr::Value)),
    }
}

// ---------------------------------------------------------------------------
// REPLACE / REPLICEB — replaces characters at a position
// ---------------------------------------------------------------------------

pub fn fn_replace(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 4 {
        return Err(FormulaError::WrongArgCount {
            func: "REPLACE".to_string(),
            expected: 4,
            actual: args.len(),
        });
    }
    let old_text = single_text(&args[0..1], sheet)?;
    let start_num = match eval_arg(&args[1], sheet)? {
        CellValue::Num(n) => n as usize,
        _ => return Err(FormulaError::ValueError),
    };
    let num_chars = match eval_arg(&args[2], sheet)? {
        CellValue::Num(n) => n as usize,
        _ => return Err(FormulaError::ValueError),
    };
    let new_text = single_text(&args[3..4], sheet)?;

    if start_num < 1 {
        return Err(FormulaError::ValueError);
    }

    let chars: Vec<char> = old_text.chars().collect();
    let start = (start_num - 1).min(chars.len());
    let end = (start + num_chars).min(chars.len());

    let result: String = chars[..start].iter().chain(new_text.chars()).collect::<String>()
        + &chars[end..].iter().collect::<String>();
    Ok(CellValue::Text(result))
}

// ---------------------------------------------------------------------------
// SUBSTITUTE — replaces occurrences of old_text with new_text
// ---------------------------------------------------------------------------

pub fn fn_substitute(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 3 {
        return Err(FormulaError::WrongArgCount {
            func: "SUBSTITUTE".to_string(),
            expected: 3,
            actual: args.len(),
        });
    }
    let text = single_text(&args[0..1], sheet)?;
    let old_text = single_text(&args[1..2], sheet)?;
    let new_text = single_text(&args[2..3], sheet)?;
    let instance_num = if args.len() >= 4 {
        match eval_arg(&args[3], sheet)? {
            CellValue::Num(n) => Some(n as usize),
            _ => None,
        }
    } else {
        None
    };

    if old_text.is_empty() {
        return Ok(CellValue::Text(text));
    }

    match instance_num {
        Some(n) => {
            let mut count = 0;
            let mut result = text.clone();
            let mut pos = 0;
            while let Some(found) = result[pos..].find(&old_text) {
                count += 1;
                if count == n {
                    let start = pos + found;
                    let end = start + old_text.len();
                    result.replace_range(start..end, &new_text);
                    break;
                }
                pos += found + old_text.len();
            }
            Ok(CellValue::Text(result))
        }
        None => Ok(CellValue::Text(text.replace(&old_text, &new_text))),
    }
}

// ---------------------------------------------------------------------------
// REPT — repeats text n times
// ---------------------------------------------------------------------------

pub fn fn_rept(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "REPT".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let text = single_text(&args[0..1], sheet)?;
    let n = match eval_arg(&args[1], sheet)? {
        CellValue::Num(n) => n as usize,
        _ => return Err(FormulaError::ValueError),
    };
    Ok(CellValue::Text(text.repeat(n)))
}

// ---------------------------------------------------------------------------
// CONCATENATE / CONCAT — joins text values
// ---------------------------------------------------------------------------

pub fn fn_concatenate(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let texts = collect_texts(args, sheet)?;
    Ok(CellValue::Text(texts.concat()))
}

// ---------------------------------------------------------------------------
// TEXTJOIN — joins with delimiter, skipping empties
// ---------------------------------------------------------------------------

pub fn fn_textjoin(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 3 {
        return Err(FormulaError::WrongArgCount {
            func: "TEXTJOIN".to_string(),
            expected: 3,
            actual: args.len(),
        });
    }
    let delimiter = single_text(&args[0..1], sheet)?;
    let skip_empty = match eval_arg(&args[1], sheet)? {
        CellValue::Bool(b) => b,
        CellValue::Num(n) => n != 0.0,
        _ => true,
    };
    let mut parts = Vec::new();
    for arg in &args[2..] {
        let val = eval_arg(arg, sheet)?;
        match val {
            CellValue::Text(s) => {
                if !skip_empty || !s.is_empty() {
                    parts.push(s);
                }
            }
            CellValue::Num(n) => parts.push(n.to_string()),
            CellValue::Bool(b) => parts.push(b.to_string()),
            CellValue::Date(d) => parts.push(d.format("%Y-%m-%d").to_string()),
            CellValue::Empty => {}
            CellValue::Err(_) => {}
        }
    }
    Ok(CellValue::Text(parts.join(&delimiter)))
}

// ---------------------------------------------------------------------------
// T — returns the text content or empty
// ---------------------------------------------------------------------------

pub fn fn_t(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    match val {
        CellValue::Text(s) => Ok(CellValue::Text(s)),
        _ => Ok(CellValue::Text(String::new())),
    }
}

// ---------------------------------------------------------------------------
// TEXT — formats a number using a format string (basic support)
// ---------------------------------------------------------------------------

pub fn fn_text(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "TEXT".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let value = single_val(&args[0..1], sheet)?;
    let fmt = single_text(&args[1..2], sheet)?;

    let result = match value {
        CellValue::Num(n) => format_number(n, &fmt),
        CellValue::Date(d) => format_date(d, &fmt),
        CellValue::Text(s) => s,
        CellValue::Bool(b) => b.to_string(),
        CellValue::Empty => String::new(),
        CellValue::Err(_) => return Ok(value),
    };
    Ok(CellValue::Text(result))
}

fn format_number(n: f64, fmt: &str) -> String {
    // Basic format support: "0", "0.00", "#,##0", etc.
    if fmt.contains("0.00") {
        format!("{:.2}", n)
    } else if fmt.contains("0.0") {
        format!("{:.1}", n)
    } else if fmt == "0" || fmt == "#,##0" {
        format!("{}", n as i64)
    } else if fmt.contains('%') {
        format!("{:.0}%", n * 100.0)
    } else if fmt.contains("/") {
        // date-like format, fallback
        n.to_string()
    } else {
        n.to_string()
    }
}

fn format_date(d: chrono::NaiveDateTime, fmt: &str) -> String {
    match fmt.to_uppercase().as_str() {
        "YYYY-MM-DD" | "YYYY-MM-DD HH:MM:SS" | "YYYY-MM-DD HH:MM" => {
            d.format(fmt).to_string()
        }
        "MM/DD/YYYY" | "M/D/YYYY" => d.format("%m/%d/%Y").to_string(),
        "DD/MM/YYYY" | "D/M/YYYY" => d.format("%d/%m/%Y").to_string(),
        "MMMM D, YYYY" => d.format("%B %-d, %Y").to_string(),
        "MMM D, YYYY" => d.format("%b %-d, %Y").to_string(),
        "HH:MM:SS" => d.format("%H:%M:%S").to_string(),
        "HH:MM" => d.format("%H:%M").to_string(),
        _ => d.format("%Y-%m-%d").to_string(),
    }
}

// ---------------------------------------------------------------------------
// VALUE — converts text to number
// ---------------------------------------------------------------------------

pub fn fn_value(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    let trimmed = s.trim();
    // Handle percentages
    if trimmed.ends_with('%') {
        let num: f64 = trimmed[..trimmed.len() - 1].trim().parse()
            .map_err(|_| FormulaError::ValueError)?;
        return Ok(CellValue::Num(num / 100.0));
    }
    // Handle dates (simple ISO format)
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S") {
        return Ok(CellValue::Num(serial_date(dt)));
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        let dt = d.and_hms_opt(0, 0, 0).unwrap();
        return Ok(CellValue::Num(serial_date(dt)));
    }
    // Try as number
    let n: f64 = trimmed.parse().map_err(|_| FormulaError::ValueError)?;
    Ok(CellValue::Num(n))
}

// ---------------------------------------------------------------------------
// NUMBERVALUE — converts text to number locale-independently
// ---------------------------------------------------------------------------

pub fn fn_numbervalue(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 1 {
        return Err(FormulaError::WrongArgCount {
            func: "NUMBERVALUE".to_string(),
            expected: 1,
            actual: 0,
        });
    }
    let s = single_text(&args[0..1], sheet)?;
    let trimmed = s.trim();
    // Remove thousands separators (commas or periods depending)
    let cleaned: String = trimmed.chars().filter(|&c| c != ',' && c != ' ').collect();
    let n: f64 = cleaned.parse().map_err(|_| FormulaError::ValueError)?;
    Ok(CellValue::Num(n))
}

// ---------------------------------------------------------------------------
// CHAR — returns character for ASCII code
// ---------------------------------------------------------------------------

pub fn fn_char(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    let c = n as u32;
    if c == 0 || c > 0x10FFFF {
        return Ok(CellValue::Err(CellErr::Value));
    }
    match char::from_u32(c) {
        Some(ch) => Ok(CellValue::Text(ch.to_string())),
        None => Ok(CellValue::Err(CellErr::Value)),
    }
}

// ---------------------------------------------------------------------------
// CODE / UNICODE — returns Unicode code point of first character
// ---------------------------------------------------------------------------

pub fn fn_code(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    let ch = s.chars().next().ok_or(FormulaError::ValueError)?;
    Ok(CellValue::Num(ch as u32 as f64))
}

// ---------------------------------------------------------------------------
// UNICHAR — returns Unicode character
// ---------------------------------------------------------------------------

pub fn fn_unichar(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    let c = n as u32;
    match char::from_u32(c) {
        Some(ch) => Ok(CellValue::Text(ch.to_string())),
        None => Ok(CellValue::Err(CellErr::Value)),
    }
}

// ---------------------------------------------------------------------------
// EXACT — compares two text values (case-sensitive)
// ---------------------------------------------------------------------------

pub fn fn_exact(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "EXACT".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let a = single_text(&args[0..1], sheet)?;
    let b = single_text(&args[1..2], sheet)?;
    Ok(CellValue::Bool(a == b))
}

// ---------------------------------------------------------------------------
// DOLLAR — formats number as currency string
// ---------------------------------------------------------------------------

pub fn fn_dollar(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    let decimals = if args.len() >= 2 {
        match eval_arg(&args[1], sheet)? {
            CellValue::Num(n) => n as usize,
            _ => 2,
        }
    } else {
        2
    };
    let formatted = format!("${:.1$}", n, decimals);
    Ok(CellValue::Text(formatted))
}

// ---------------------------------------------------------------------------
// FIXED — formats number with commas and decimals
// ---------------------------------------------------------------------------

pub fn fn_fixed(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    let decimals = if args.len() >= 2 {
        match eval_arg(&args[1], sheet)? {
            CellValue::Num(n) => n as usize,
            _ => 2,
        }
    } else {
        2
    };
    let no_commas = if args.len() >= 3 {
        match eval_arg(&args[2], sheet)? {
            CellValue::Bool(b) => b,
            CellValue::Num(n) => n != 0.0,
            _ => false,
        }
    } else {
        false
    };

    let formatted = if no_commas {
        format!("{:.1$}", n, decimals)
    } else {
        // Simple thousands separator
        let integer_part = n.trunc() as i64;
        let dec_part = (n.fract() * 10_f64.powi(decimals as i32)).abs().round() as u64;
        let int_str = integer_part.to_string();
        let mut with_commas = String::new();
        let len = int_str.len();
        let neg = integer_part < 0 || n < 0.0;
        let abs_str = if neg { &int_str[1..] } else { &int_str };
        for (i, c) in abs_str.chars().enumerate() {
            if i > 0 && (abs_str.len() - i) % 3 == 0 {
                with_commas.push(',');
            }
            with_commas.push(c);
        }
        if decimals > 0 {
            with_commas.push('.');
            with_commas.push_str(&format!("{:0>width$}", dec_part, width = decimals));
        }
        if neg {
            with_commas.insert(0, '-');
        }
        with_commas
    };
    Ok(CellValue::Text(formatted))
}

// ---------------------------------------------------------------------------
// CLEAN — removes non-printable characters (ASCII 0-31)
// ---------------------------------------------------------------------------

pub fn fn_clean(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    let cleaned: String = s.chars().filter(|&c| c as u32 >= 32 || c == '\t' || c == '\n' || c == '\r').collect();
    Ok(CellValue::Text(cleaned))
}

// ---------------------------------------------------------------------------
// ARABIC — converts Roman numeral to Arabic number
// ---------------------------------------------------------------------------

pub fn fn_arabic(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let s = single_text(args, sheet)?;
    let s = s.trim().to_uppercase();
    let values = [('I', 1), ('V', 5), ('X', 10), ('L', 50), ('C', 100), ('D', 500), ('M', 1000)];
    let mut result = 0i64;
    let mut prev = 0i64;
    for c in s.chars().rev() {
        let v = values.iter().find(|&&(ch, _)| ch == c).map(|&(_, v)| v).ok_or(FormulaError::ValueError)?;
        if v < prev {
            result -= v;
        } else {
            result += v;
        }
        prev = v;
    }
    if result <= 0 {
        return Err(FormulaError::ValueError);
    }
    Ok(CellValue::Num(result as f64))
}

// ---------------------------------------------------------------------------
// ROMAN — converts Arabic number to Roman numeral
// ---------------------------------------------------------------------------

pub fn fn_roman(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let n = single_num(args, sheet)?;
    if n < 1.0 || n > 3999.0 || n.fract() != 0.0 {
        return Ok(CellValue::Err(CellErr::Value));
    }
    let n = n as u64;
    let vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    let numerals = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
    let mut result = String::new();
    let mut remainder = n;
    for (i, &val) in vals.iter().enumerate() {
        while remainder >= val {
            result.push_str(numerals[i]);
            remainder -= val;
        }
    }
    Ok(CellValue::Text(result))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse;
    use crate::eval::eval;
    use crate::eval::tests::TestSheet;

    fn eval_expr(s: &str, sheet: &TestSheet) -> Result<CellValue, FormulaError> {
        let expr = parse(s).unwrap();
        eval(&expr, sheet)
    }

    fn make_sheet() -> TestSheet {
        TestSheet::new()
    }

    // -- LEN --

    #[test]
    fn functions_text_len() {
        let sheet = make_sheet();
        assert_eq!(eval_expr(r#"LEN("hello")"#, &sheet).unwrap(), CellValue::Num(5.0));
        assert_eq!(eval_expr(r#"LEN("")"#, &sheet).unwrap(), CellValue::Num(0.0));
        assert_eq!(eval_expr(r#"LEN("  ")""#, &sheet).unwrap(), CellValue::Num(2.0));
    }

    // -- TRIM --

    #[test]
    fn functions_text_trim() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"TRIM("  hello  world  ")"#, &sheet).unwrap(),
            CellValue::Text("hello world".to_string())
        );
        assert_eq!(
            eval_expr(r#"TRIM("nochange")"#, &sheet).unwrap(),
            CellValue::Text("nochange".to_string())
        );
    }

    // -- UPPER / LOWER / PROPER --

    #[test]
    fn functions_text_case() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"UPPER("Hello")"#, &sheet).unwrap(),
            CellValue::Text("HELLO".to_string())
        );
        assert_eq!(
            eval_expr(r#"LOWER("Hello")"#, &sheet).unwrap(),
            CellValue::Text("hello".to_string())
        );
        assert_eq!(
            eval_expr(r#"PROPER("hello world")"#, &sheet).unwrap(),
            CellValue::Text("Hello World".to_string())
        );
    }

    // -- LEFT / RIGHT / MID --

    #[test]
    fn functions_text_left_right_mid() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"LEFT("hello",2)"#, &sheet).unwrap(),
            CellValue::Text("he".to_string())
        );
        assert_eq!(
            eval_expr(r#"RIGHT("hello",2)"#, &sheet).unwrap(),
            CellValue::Text("lo".to_string())
        );
        assert_eq!(
            eval_expr(r#"LEFT("hello")"#, &sheet).unwrap(),
            CellValue::Text("h".to_string())
        );
        assert_eq!(
            eval_expr(r#"MID("hello",2,3)"#, &sheet).unwrap(),
            CellValue::Text("ell".to_string())
        );
        assert_eq!(
            eval_expr(r#"MID("hello",10,1)"#, &sheet).unwrap(),
            CellValue::Text("".to_string())
        );
    }

    // -- FIND / SEARCH --

    #[test]
    fn functions_text_find_search() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"FIND("l","hello")"#, &sheet).unwrap(),
            CellValue::Num(3.0)
        );
        assert_eq!(
            eval_expr(r#"FIND("L","hello")"#, &sheet).unwrap(),
            CellValue::Err(CellErr::Value)
        );
        assert_eq!(
            eval_expr(r#"SEARCH("L","hello")"#, &sheet).unwrap(),
            CellValue::Num(3.0)
        );
        assert_eq!(
            eval_expr(r#"FIND("o","hello world",4)"#, &sheet).unwrap(),
            CellValue::Num(5.0)
        );
    }

    // -- REPLACE / SUBSTITUTE --

    #[test]
    fn functions_text_replace_substitute() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"REPLACE("hello",2,3,"xx")"#, &sheet).unwrap(),
            CellValue::Text("hxxo".to_string())
        );
        assert_eq!(
            eval_expr(r#"SUBSTITUTE("hello world","o","x")"#, &sheet).unwrap(),
            CellValue::Text("hellx wxrld".to_string())
        );
        assert_eq!(
            eval_expr(r#"SUBSTITUTE("hello world","o","x",2)"#, &sheet).unwrap(),
            CellValue::Text("hello wxrld".to_string())
        );
    }

    // -- REPT --

    #[test]
    fn functions_text_rept() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"REPT("ab",3)"#, &sheet).unwrap(),
            CellValue::Text("ababab".to_string())
        );
    }

    // -- CONCATENATE / TEXTJOIN --

    #[test]
    fn functions_text_concatenate_textjoin() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"CONCATENATE("a","b","c")"#, &sheet).unwrap(),
            CellValue::Text("abc".to_string())
        );
        assert_eq!(
            eval_expr(r#"CONCAT("a","b")"#, &sheet).unwrap(),
            CellValue::Text("ab".to_string())
        );
        assert_eq!(
            eval_expr(r#"TEXTJOIN("-",TRUE,"a","b","c")"#, &sheet).unwrap(),
            CellValue::Text("a-b-c".to_string())
        );
    }

    // -- CHAR / CODE / UNICHAR / UNICODE --

    #[test]
    fn functions_text_char_code() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"CHAR(65)"#, &sheet).unwrap(),
            CellValue::Text("A".to_string())
        );
        assert_eq!(
            eval_expr(r#"CODE("A")"#, &sheet).unwrap(),
            CellValue::Num(65.0)
        );
        assert_eq!(
            eval_expr(r#"UNICHAR(8364)"#, &sheet).unwrap(),
            CellValue::Text("€".to_string())
        );
        assert_eq!(
            eval_expr(r#"UNICODE("€")"#, &sheet).unwrap(),
            CellValue::Num(8364.0)
        );
    }

    // -- EXACT --

    #[test]
    fn functions_text_exact() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"EXACT("abc","abc")"#, &sheet).unwrap(),
            CellValue::Bool(true)
        );
        assert_eq!(
            eval_expr(r#"EXACT("abc","ABC")"#, &sheet).unwrap(),
            CellValue::Bool(false)
        );
    }

    // -- T --

    #[test]
    fn functions_text_t() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"T("hello")"#, &sheet).unwrap(),
            CellValue::Text("hello".to_string())
        );
        assert_eq!(
            eval_expr(r#"T(42)"#, &sheet).unwrap(),
            CellValue::Text("".to_string())
        );
    }

    // -- VALUE / NUMBERVALUE --

    #[test]
    fn functions_text_value_numbervalue() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"VALUE("42")"#, &sheet).unwrap(),
            CellValue::Num(42.0)
        );
        assert_eq!(
            eval_expr(r#"VALUE("50%")"#, &sheet).unwrap(),
            CellValue::Num(0.5)
        );
        assert_eq!(
            eval_expr(r#"NUMBERVALUE("1,234.56")"#, &sheet).unwrap(),
            CellValue::Num(1234.56)
        );
    }

    // -- DOLLAR / FIXED --

    #[test]
    fn functions_text_dollar_fixed() {
        let sheet = make_sheet();
        let r = eval_expr(r#"DOLLAR(123.456)"#, &sheet).unwrap();
        if let CellValue::Text(s) = r {
            assert!(s.starts_with('$'));
        } else {
            panic!("Expected Text");
        }
        let r = eval_expr(r#"FIXED(1234.567,1)"#, &sheet).unwrap();
        if let CellValue::Text(s) = r {
            assert!(s.contains(','));
        } else {
            panic!("Expected Text");
        }
    }

    // -- CLEAN --

    #[test]
    fn functions_text_clean() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"CLEAN(CHAR(9)&"hello")"#, &sheet).unwrap(),
            CellValue::Text("hello".to_string())
        );
    }

    // -- ARABIC / ROMAN --

    #[test]
    fn functions_text_arabic_roman() {
        let sheet = make_sheet();
        assert_eq!(
            eval_expr(r#"ARABIC("XIV")"#, &sheet).unwrap(),
            CellValue::Num(14.0)
        );
        assert_eq!(
            eval_expr(r#"ROMAN(14)"#, &sheet).unwrap(),
            CellValue::Text("XIV".to_string())
        );
        assert_eq!(
            eval_expr(r#"ROMAN(3999)"#, &sheet).unwrap(),
            CellValue::Text("MMMCMXCIX".to_string())
        );
    }

    // -- TEXT --

    #[test]
    fn functions_text_text_format() {
        let sheet = make_sheet();
        let r = eval_expr(r#"TEXT(123.45,"0.00")"#, &sheet).unwrap();
        assert_eq!(r, CellValue::Text("123.45".to_string()));
    }
}
