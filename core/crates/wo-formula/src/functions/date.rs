//! Date & time functions.
//!
//! Excel-compatible implementations for DATE, TIME, YEAR, MONTH, DAY, HOUR,
//! MINUTE, SECOND, TODAY, NOW, DATEVALUE, TIMEVALUE, DATEDIF, DAYS, DAYS360,
//! EDATE, EOMONTH, WEEKNUM, ISOWEEKNUM, WEEKDAY, WORKDAY, WORKDAY.INTL,
//! NETWORKDAYS, NETWORKDAYS.INTL, YEARFRAC.

use crate::ast::{CellErr, CellValue, Expr, FormulaError};
use crate::eval::{eval, Sheet};
use chrono::{NaiveDate, NaiveDateTime, NaiveTime, Datelike, Timelike, Duration, Weekday};

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

fn single_num(args: &[Expr], sheet: &impl Sheet) -> Result<f64, FormulaError> {
    let val = single_val(args, sheet)?;
    match val {
        CellValue::Num(n) => Ok(n),
        CellValue::Bool(true) => Ok(1.0),
        CellValue::Bool(false) => Ok(0.0),
        CellValue::Text(s) => s.parse::<f64>().map_err(|_| FormulaError::ValueError),
        CellValue::Empty => Ok(0.0),
        CellValue::Date(d) => Ok(serial_datetime(d)),
        CellValue::Err(e) => Err(FormulaError::TypeMismatch(e.to_string())),
    }
}

fn collect_nums(args: &[Expr], sheet: &impl Sheet) -> Result<Vec<f64>, FormulaError> {
    let mut nums = Vec::new();
    for arg in args {
        let val = eval_arg(arg, sheet)?;
        if let CellValue::Num(n) = val {
            nums.push(n);
        } else if let CellValue::Bool(true) = val {
            nums.push(1.0);
        } else if let CellValue::Bool(false) = val {
            nums.push(0.0);
        }
    }
    Ok(nums)
}

/// Convert NaiveDateTime to Excel serial date number.
fn serial_datetime(d: NaiveDateTime) -> f64 {
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 30).unwrap();
    let days = (d.date() - epoch).num_days() as f64;
    let secs_from_midnight = d.num_seconds_from_midnight() as f64;
    days + secs_from_midnight / 86400.0
}

/// Convert Excel serial date number to NaiveDateTime.
fn from_serial(serial: f64) -> Option<NaiveDateTime> {
    if serial < 0.0 {
        return None;
    }
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 30)?;
    let days = serial.trunc() as i64;
    let day_fraction = serial.fract();
    let secs = (day_fraction * 86400.0).round() as u32;
    let date = epoch + Duration::try_days(days)?;
    let time = NaiveTime::from_num_seconds_from_midnight_opt(secs.min(86399), 0)?;
    Some(date.and_time(time))
}

fn extract_date(val: &CellValue) -> Result<(i32, u32, u32), FormulaError> {
    match val {
        CellValue::Num(serial) => {
            let dt = from_serial(*serial).ok_or(FormulaError::ValueError)?;
            Ok((dt.year(), dt.month(), dt.day()))
        }
        CellValue::Date(dt) => Ok((dt.year(), dt.month(), dt.day())),
        CellValue::Text(s) => {
            if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                Ok((d.year(), d.month(), d.day()))
            } else if let Ok(d) = NaiveDate::parse_from_str(s, "%m/%d/%Y") {
                Ok((d.year(), d.month(), d.day()))
            } else if let Ok(d) = NaiveDate::parse_from_str(s, "%d/%m/%Y") {
                Ok((d.year(), d.month(), d.day()))
            } else {
                // Try parsing as serial number
                if let Ok(n) = s.parse::<f64>() {
                    let dt = from_serial(n).ok_or(FormulaError::ValueError)?;
                    Ok((dt.year(), dt.month(), dt.day()))
                } else {
                    Err(FormulaError::ValueError)
                }
            }
        }
        _ => Err(FormulaError::ValueError),
    }
}

fn extract_time(val: &CellValue) -> Result<(u32, u32, u32), FormulaError> {
    match val {
        CellValue::Num(serial) => {
            let day_fraction = serial.fract().abs();
            let total_secs = (day_fraction * 86400.0).round() as u32;
            let hour = total_secs / 3600;
            let min = (total_secs % 3600) / 60;
            let sec = total_secs % 60;
            Ok((hour, min, sec))
        }
        CellValue::Date(dt) => {
            Ok((dt.hour(), dt.minute(), dt.second()))
        }
        CellValue::Text(s) => {
            if let Ok(t) = NaiveTime::parse_from_str(s, "%H:%M:%S") {
                Ok((t.hour(), t.minute(), t.second()))
            } else if let Ok(t) = NaiveTime::parse_from_str(s, "%H:%M") {
                Ok((t.hour(), t.minute(), 0))
            } else {
                Err(FormulaError::ValueError)
            }
        }
        _ => Err(FormulaError::ValueError),
    }
}

/// Check if a year is a leap year.
fn is_leap(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// Days in month (1-12).
fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => if is_leap(year) { 29 } else { 28 },
        _ => 30,
    }
}

// ---------------------------------------------------------------------------
// DATE — builds a date from year/month/day
// ---------------------------------------------------------------------------

pub fn fn_date(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 3 {
        return Err(FormulaError::WrongArgCount {
            func: "DATE".to_string(),
            expected: 3,
            actual: nums.len(),
        });
    }
    let mut year = nums[0] as i32;
    let mut month = nums[1] as i32;
    let mut day = nums[2] as i32;

    // Excel handles months > 12 and days > days_in_month by rolling over
    if month < 1 {
        year -= (12 - month) / 12 + 1;
        month = 12 + (month - 1) % 12;
        if month <= 0 { month += 12; }
    } else if month > 12 {
        year += (month - 1) / 12;
        month = (month - 1) % 12 + 1;
    }

    // Adjust for Excel's date system: years 0-29 are 2000s, 30-99 are 1900s
    if year >= 0 && year < 30 {
        year += 2000;
    } else if year >= 30 && year < 100 {
        year += 1900;
    }

    // Handle day overflow
    loop {
        let dim = days_in_month(year, month as u32) as i32;
        if day > dim {
            day -= dim;
            month += 1;
            if month > 12 {
                month = 1;
                year += 1;
            }
        } else {
            break;
        }
    }

    let date = NaiveDate::from_ymd_opt(year, month as u32, day as u32)
        .ok_or(FormulaError::ValueError)?;
    let dt = date.and_hms_opt(0, 0, 0).unwrap();
    Ok(CellValue::Num(serial_datetime(dt)))
}

// ---------------------------------------------------------------------------
// TIME — builds a time from hour/minute/second
// ---------------------------------------------------------------------------

pub fn fn_time(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let nums = collect_nums(args, sheet)?;
    if nums.len() < 3 {
        return Err(FormulaError::WrongArgCount {
            func: "TIME".to_string(),
            expected: 3,
            actual: nums.len(),
        });
    }
    let hour = nums[0] as u32;
    let minute = nums[1] as u32;
    let second = nums[2] as u32;
    let total_secs = (hour * 3600 + minute * 60 + second) % 86400;
    let fraction = total_secs as f64 / 86400.0;
    Ok(CellValue::Num(fraction))
}

// ---------------------------------------------------------------------------
// YEAR — extracts year from date
// ---------------------------------------------------------------------------

pub fn fn_year(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (year, _, _) = extract_date(&val)?;
    Ok(CellValue::Num(year as f64))
}

// ---------------------------------------------------------------------------
// MONTH — extracts month (1-12)
// ---------------------------------------------------------------------------

pub fn fn_month(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (_, month, _) = extract_date(&val)?;
    Ok(CellValue::Num(month as f64))
}

// ---------------------------------------------------------------------------
// DAY — extracts day (1-31)
// ---------------------------------------------------------------------------

pub fn fn_day(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (_, _, day) = extract_date(&val)?;
    Ok(CellValue::Num(day as f64))
}

// ---------------------------------------------------------------------------
// HOUR — extracts hour (0-23)
// ---------------------------------------------------------------------------

pub fn fn_hour(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (hour, _, _) = extract_time(&val)?;
    Ok(CellValue::Num(hour as f64))
}

// ---------------------------------------------------------------------------
// MINUTE — extracts minute (0-59)
// ---------------------------------------------------------------------------

pub fn fn_minute(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (_, min, _) = extract_time(&val)?;
    Ok(CellValue::Num(min as f64))
}

// ---------------------------------------------------------------------------
// SECOND — extracts second (0-59)
// ---------------------------------------------------------------------------

pub fn fn_second(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (_, _, sec) = extract_time(&val)?;
    Ok(CellValue::Num(sec as f64))
}

// ---------------------------------------------------------------------------
// TODAY — returns current date as serial number
// ---------------------------------------------------------------------------

pub fn fn_today(_args: &[Expr], _sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let now = chrono::Utc::now().naive_utc();
    let date = now.date();
    let midnight = date.and_hms_opt(0, 0, 0).unwrap();
    Ok(CellValue::Num(serial_datetime(midnight)))
}

// ---------------------------------------------------------------------------
// NOW — returns current date+time as serial number
// ---------------------------------------------------------------------------

pub fn fn_now(_args: &[Expr], _sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let now = chrono::Utc::now().naive_utc();
    Ok(CellValue::Num(serial_datetime(now)))
}

// ---------------------------------------------------------------------------
// DATEVALUE — converts text date to serial number
// ---------------------------------------------------------------------------

pub fn fn_datevalue(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (year, month, day) = extract_date(&val)?;
    let date = NaiveDate::from_ymd_opt(year, month, day)
        .ok_or(FormulaError::ValueError)?;
    let dt = date.and_hms_opt(0, 0, 0).unwrap();
    Ok(CellValue::Num(serial_datetime(dt)))
}

// ---------------------------------------------------------------------------
// TIMEVALUE — converts text time to fractional serial number
// ---------------------------------------------------------------------------

pub fn fn_timevalue(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (hour, min, sec) = extract_time(&val)?;
    let total_secs = hour * 3600 + min * 60 + sec;
    let fraction = total_secs as f64 / 86400.0;
    Ok(CellValue::Num(fraction))
}

// ---------------------------------------------------------------------------
// DATEDIF — difference between dates in specified units
// ---------------------------------------------------------------------------

pub fn fn_datedif(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 3 {
        return Err(FormulaError::WrongArgCount {
            func: "DATEDIF".to_string(),
            expected: 3,
            actual: args.len(),
        });
    }
    let start_val = single_val(&args[0..1], sheet)?;
    let end_val = single_val(&args[1..2], sheet)?;
    let unit = single_val(&args[2..3], sheet)?;
    let unit_str = match unit {
        CellValue::Text(ref s) => s.to_uppercase(),
        _ => return Err(FormulaError::ValueError),
    };

    let (y1, m1, d1) = extract_date(&start_val)?;
    let (y2, m2, d2) = extract_date(&end_val)?;

    let start = NaiveDate::from_ymd_opt(y1, m1, d1).ok_or(FormulaError::ValueError)?;
    let end = NaiveDate::from_ymd_opt(y2, m2, d2).ok_or(FormulaError::ValueError)?;

    if end < start {
        return Ok(CellValue::Err(CellErr::Num));
    }

    match unit_str.as_str() {
        "Y" => {
            let mut years = y2 - y1;
            if m2 < m1 || (m2 == m1 && d2 < d1) {
                years -= 1;
            }
            Ok(CellValue::Num(years as f64))
        }
        "M" => {
            let months = (y2 - y1) * 12 + (m2 as i32 - m1 as i32);
            let adj = if d2 < d1 { -1 } else { 0 };
            Ok(CellValue::Num((months + adj) as f64))
        }
        "D" => {
            let days = (end - start).num_days() as f64;
            Ok(CellValue::Num(days))
        }
        "MD" => {
            let day_diff = if d2 >= d1 {
                d2 as i64 - d1 as i64
            } else {
                let prev_month = if m1 == 1 { 12 } else { m1 - 1 };
                let prev_year = if m1 == 1 { y1 - 1 } else { y1 };
                let dim = days_in_month(prev_year, prev_month) as i64;
                dim - d1 as i64 + d2 as i64
            };
            Ok(CellValue::Num(day_diff as f64))
        }
        "YM" => {
            let mut month_diff = m2 as i32 - m1 as i32;
            if d2 < d1 {
                month_diff -= 1;
            }
            if month_diff < 0 {
                month_diff += 12;
            }
            Ok(CellValue::Num(month_diff as f64))
        }
        "YD" => {
            let start_yd = start.ordinal();
            let end_yd = end.ordinal();
            if y1 == y2 {
                Ok(CellValue::Num((end_yd - start_yd) as f64))
            } else {
                let days_in_start_year = if is_leap(y1) { 366 } else { 365 };
                Ok(CellValue::Num((days_in_start_year - start_yd + end_yd) as f64))
            }
        }
        _ => Err(FormulaError::ValueError),
    }
}

// ---------------------------------------------------------------------------
// DAYS — number of days between two dates
// ---------------------------------------------------------------------------

pub fn fn_days(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "DAYS".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let end_val = single_val(&args[0..1], sheet)?;
    let start_val = single_val(&args[1..2], sheet)?;
    let (y1, m1, d1) = extract_date(&start_val)?;
    let (y2, m2, d2) = extract_date(&end_val)?;
    let start = NaiveDate::from_ymd_opt(y1, m1, d1).ok_or(FormulaError::ValueError)?;
    let end = NaiveDate::from_ymd_opt(y2, m2, d2).ok_or(FormulaError::ValueError)?;
    Ok(CellValue::Num((end - start).num_days() as f64))
}

// ---------------------------------------------------------------------------
// DAYS360 — days between dates based on 360-day year
// ---------------------------------------------------------------------------

pub fn fn_days360(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "DAYS360".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let start_val = single_val(&args[0..1], sheet)?;
    let end_val = single_val(&args[1..2], sheet)?;
    let method = if args.len() >= 3 {
        match eval_arg(&args[2], sheet)? {
            CellValue::Bool(b) => b,
            CellValue::Num(n) => n != 0.0,
            _ => false,
        }
    } else {
        false
    };

    let (y1, m1, d1) = extract_date(&start_val)?;
    let (y2, m2, d2) = extract_date(&end_val)?;

    let (d1_360, d2_360) = if method {
        // US (NASD) method
        let d1_adj = if d1 == 31 { 30 } else { d1 };
        let d2_adj = if d2 == 31 && d1_adj == 30 { 30 } else { d2 };
        (d1_adj, d2_adj)
    } else {
        (d1.min(30), d2.min(30))
    };

    let days = (y2 - y1) as i64 * 360 + (m2 as i64 - m1 as i64) * 30 + (d2_360 as i64 - d1_360 as i64);
    Ok(CellValue::Num(days as f64))
}

// ---------------------------------------------------------------------------
// EDATE — date shifted by n months
// ---------------------------------------------------------------------------

pub fn fn_edate(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "EDATE".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let start_val = single_val(&args[0..1], sheet)?;
    let months = single_num(&args[1..2], sheet)? as i32;

    let (y, m, d) = extract_date(&start_val)?;

    let total_months = y as i32 * 12 + m as i32 + months - 1;
    let new_year = if total_months < 0 { (total_months - 11) / 12 } else { total_months / 12 };
    let new_month = ((total_months % 12) + 12) % 12 + 1;

    let dim = days_in_month(new_year, new_month);
    let new_day = d.min(dim);

    let date = NaiveDate::from_ymd_opt(new_year, new_month, new_day)
        .ok_or(FormulaError::ValueError)?;
    let dt = date.and_hms_opt(0, 0, 0).unwrap();
    Ok(CellValue::Num(serial_datetime(dt)))
}

// ---------------------------------------------------------------------------
// EOMONTH — last day of month offset by n months
// ---------------------------------------------------------------------------

pub fn fn_eomonth(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "EOMONTH".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let start_val = single_val(&args[0..1], sheet)?;
    let months = single_num(&args[1..2], sheet)? as i32;

    let (y, m, _) = extract_date(&start_val)?;

    let total_months = y as i32 * 12 + m as i32 + months - 1;
    let new_year = if total_months < 0 { (total_months - 11) / 12 } else { total_months / 12 };
    let new_month = ((total_months % 12) + 12) % 12 + 1;

    let dim = days_in_month(new_year, new_month);

    let date = NaiveDate::from_ymd_opt(new_year, new_month, dim)
        .ok_or(FormulaError::ValueError)?;
    let dt = date.and_hms_opt(0, 0, 0).unwrap();
    Ok(CellValue::Num(serial_datetime(dt)))
}

// ---------------------------------------------------------------------------
// WEEKNUM — week number of the year
// ---------------------------------------------------------------------------

pub fn fn_weeknum(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let return_type = if args.len() >= 2 {
        match eval_arg(&args[1], sheet)? {
            CellValue::Num(n) => n as i32,
            _ => 1,
        }
    } else {
        1
    };

    let (y, m, d) = extract_date(&val)?;
    let date = NaiveDate::from_ymd_opt(y, m, d).ok_or(FormulaError::ValueError)?;

    // ISO week number (Monday-based)
    let iso_week = date.iso_week();
    let week_num = match return_type {
        1 | 17 => {
            // Sunday-based: week starts on Sunday
            let jan1 = NaiveDate::from_ymd_opt(y, 1, 1).unwrap();
            let jan1_wd = jan1.weekday().num_days_from_sunday();
            let days_since = (date - jan1).num_days();
            ((days_since + jan1_wd as i64) / 7 + 1) as u32
        }
        2 | 11 => {
            // Monday-based
            iso_week.week()
        }
        21 => {
            // Monday-based (ISO 8601)
            iso_week.week()
        }
        _ => iso_week.week(),
    };
    Ok(CellValue::Num(week_num as f64))
}

// ---------------------------------------------------------------------------
// ISOWEEKNUM — ISO week number
// ---------------------------------------------------------------------------

pub fn fn_isoweeknum(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let (y, m, d) = extract_date(&val)?;
    let date = NaiveDate::from_ymd_opt(y, m, d).ok_or(FormulaError::ValueError)?;
    Ok(CellValue::Num(date.iso_week().week() as f64))
}

// ---------------------------------------------------------------------------
// WEEKDAY — day of week (1-7, configurable)
// ---------------------------------------------------------------------------

pub fn fn_weekday(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    let val = single_val(args, sheet)?;
    let return_type = if args.len() >= 2 {
        match eval_arg(&args[1], sheet)? {
            CellValue::Num(n) => n as i32,
            _ => 1,
        }
    } else {
        1
    };

    let (y, m, d) = extract_date(&val)?;
    let date = NaiveDate::from_ymd_opt(y, m, d).ok_or(FormulaError::ValueError)?;

    let dow = date.weekday().num_days_from_sunday() as i32; // 0=Sun..6=Sat
    let result = match return_type {
        1 => dow + 1,          // 1=Sun..7=Sat
        2 => (dow + 6) % 7 + 1, // 1=Mon..7=Sun
        3 => (dow + 6) % 7,     // 0=Mon..6=Sun
        11 => match dow { 0 => 6, _ => dow }, // 1=Mon..7=Sun (but 6=Sat, 7=Sun)
        12 => match dow { 5 => 6, 6 => 7, _ => dow + 1 }, // 1=Tue..7=Mon
        13 => match dow { 4 => 6, 5 => 7, 6 => 1, _ => dow + 2 }, // 1=Wed..7=Tue
        14 => match dow { 3 => 6, 4 => 7, 5 => 1, 6 => 2, _ => dow + 3 }, // 1=Thu..7=Wed
        15 => match dow { 2 => 6, 3 => 7, 4 => 1, 5 => 2, 6 => 3, _ => dow + 4 }, // 1=Fri..7=Thu
        16 => match dow { 1 => 6, 2 => 7, 3 => 1, 4 => 2, 5 => 3, 6 => 4, _ => dow + 5 }, // 1=Sat..7=Fri
        17 => match dow { 0 => 7, _ => dow }, // 1=Sat..7=Sun (0=Sat->1, ..., 6=Sun->7)
        _ => dow + 1,
    };
    Ok(CellValue::Num(result as f64))
}

// ---------------------------------------------------------------------------
// WORKDAY — returns date after n workdays
// ---------------------------------------------------------------------------

pub fn fn_workday(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "WORKDAY".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let start_val = single_val(&args[0..1], sheet)?;
    let days = single_num(&args[1..2], sheet)? as i64;

    let (y, m, d) = extract_date(&start_val)?;
    let mut date = NaiveDate::from_ymd_opt(y, m, d).ok_or(FormulaError::ValueError)?;

    let step: i64 = if days >= 0 { 1 } else { -1 };
    let mut remaining = days.abs();

    while remaining > 0 {
        date = date + Duration::try_days(step).unwrap();
        let wd = date.weekday().num_days_from_sunday();
        if wd != 0 && wd != 6 { // Skip weekends
            remaining -= 1;
        }
    }

    let dt = date.and_hms_opt(0, 0, 0).unwrap();
    Ok(CellValue::Num(serial_datetime(dt)))
}

// ---------------------------------------------------------------------------
// WORKDAY.INTL — WORKDAY with custom weekend spec
// ---------------------------------------------------------------------------

pub fn fn_workday_intl(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "WORKDAY.INTL".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let start_val = single_val(&args[0..1], sheet)?;
    let days = single_num(&args[1..2], sheet)? as i64;

    let weekend_mask = if args.len() >= 3 {
        match eval_arg(&args[2], sheet)? {
            CellValue::Num(n) => n as i32,
            CellValue::Text(s) => {
                if s.len() == 7 {
                    // Binary string: 1 = weekend, 0 = workday
                    let mut mask = 0i32;
                    for (i, c) in s.chars().enumerate() {
                        if c == '1' {
                            mask |= 1 << (6 - i);
                        }
                    }
                    mask
                } else {
                    1 // default: Sat/Sun
                }
            }
            _ => 1,
        }
    } else {
        1
    };

    let (y, m, d) = extract_date(&start_val)?;
    let mut date = NaiveDate::from_ymd_opt(y, m, d).ok_or(FormulaError::ValueError)?;

    let step: i64 = if days >= 0 { 1 } else { -1 };
    let mut remaining = days.abs();

    while remaining > 0 {
        date = date + Duration::try_days(step).unwrap();
        let wd = date.weekday().num_days_from_sunday() as usize;
        let is_weekend = (weekend_mask >> (6 - wd)) & 1 == 1;
        if !is_weekend {
            remaining -= 1;
        }
    }

    let dt = date.and_hms_opt(0, 0, 0).unwrap();
    Ok(CellValue::Num(serial_datetime(dt)))
}

// ---------------------------------------------------------------------------
// NETWORKDAYS — number of workdays between two dates
// ---------------------------------------------------------------------------

pub fn fn_networkdays(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "NETWORKDAYS".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let start_val = single_val(&args[0..1], sheet)?;
    let end_val = single_val(&args[1..2], sheet)?;

    let (y1, m1, d1) = extract_date(&start_val)?;
    let (y2, m2, d2) = extract_date(&end_val)?;

    let start = NaiveDate::from_ymd_opt(y1, m1, d1).ok_or(FormulaError::ValueError)?;
    let end = NaiveDate::from_ymd_opt(y2, m2, d2).ok_or(FormulaError::ValueError)?;

    let (from, to) = if start <= end { (start, end) } else { (end, start) };
    let mut count = 0i64;
    let mut current = from;
    while current <= to {
        let wd = current.weekday().num_days_from_sunday();
        if wd != 0 && wd != 6 {
            count += 1;
        }
        current = current + Duration::try_days(1).unwrap();
    }

    Ok(CellValue::Num(if start <= end { count as f64 } else { -(count as f64) }))
}

// ---------------------------------------------------------------------------
// NETWORKDAYS.INTL — NETWORKDAYS with custom weekend
// ---------------------------------------------------------------------------

pub fn fn_networkdays_intl(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "NETWORKDAYS.INTL".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }

    let start_val = single_val(&args[0..1], sheet)?;
    let end_val = single_val(&args[1..2], sheet)?;

    let weekend_mask = if args.len() >= 3 {
        match eval_arg(&args[2], sheet)? {
            CellValue::Num(n) => n as i32,
            CellValue::Text(s) => {
                if s.len() == 7 {
                    let mut mask = 0i32;
                    for (i, c) in s.chars().enumerate() {
                        if c == '1' {
                            mask |= 1 << (6 - i);
                        }
                    }
                    mask
                } else {
                    1
                }
            }
            _ => 1,
        }
    } else {
        1
    };

    let (y1, m1, d1) = extract_date(&start_val)?;
    let (y2, m2, d2) = extract_date(&end_val)?;

    let start = NaiveDate::from_ymd_opt(y1, m1, d1).ok_or(FormulaError::ValueError)?;
    let end = NaiveDate::from_ymd_opt(y2, m2, d2).ok_or(FormulaError::ValueError)?;

    let (from, to) = if start <= end { (start, end) } else { (end, start) };
    let mut count = 0i64;
    let mut current = from;
    while current <= to {
        let wd = current.weekday().num_days_from_sunday() as usize;
        let is_weekend = (weekend_mask >> (6 - wd)) & 1 == 1;
        if !is_weekend {
            count += 1;
        }
        current = current + Duration::try_days(1).unwrap();
    }

    Ok(CellValue::Num(if start <= end { count as f64 } else { -(count as f64) }))
}

// ---------------------------------------------------------------------------
// YEARFRAC — year fraction between two dates
// ---------------------------------------------------------------------------

pub fn fn_yearfrac(args: &[Expr], sheet: &impl Sheet) -> Result<CellValue, FormulaError> {
    if args.len() < 2 {
        return Err(FormulaError::WrongArgCount {
            func: "YEARFRAC".to_string(),
            expected: 2,
            actual: args.len(),
        });
    }
    let start_val = single_val(&args[0..1], sheet)?;
    let end_val = single_val(&args[1..2], sheet)?;
    let basis = if args.len() >= 3 {
        match eval_arg(&args[2], sheet)? {
            CellValue::Num(n) => n as i32,
            _ => 0,
        }
    } else {
        0
    };

    let (y1, m1, d1) = extract_date(&start_val)?;
    let (y2, m2, d2) = extract_date(&end_val)?;

    let start = NaiveDate::from_ymd_opt(y1, m1, d1).ok_or(FormulaError::ValueError)?;
    let end = NaiveDate::from_ymd_opt(y2, m2, d2).ok_or(FormulaError::ValueError)?;

    let days_between = (end - start).num_days() as f64;

    match basis {
        0 => {
            // US 30/360
            let d1_adj = if d1 == 31 { 30 } else { d1 };
            let d2_adj = if d2 == 31 && d1_adj == 30 { 30 } else { d2 };
            let days = (y2 - y1) as f64 * 360.0 + (m2 as f64 - m1 as f64) * 30.0 + (d2_adj as f64 - d1_adj as f64);
            Ok(CellValue::Num(days / 360.0))
        }
        1 => {
            // Actual/Actual
            let mut total_days = 0.0;
            let mut y = y1;
            let mut current_start = start;
            while y < y2 {
                let year_end = NaiveDate::from_ymd_opt(y, 12, 31).unwrap();
                let days_in_year = if is_leap(y) { 366.0 } else { 365.0 };
                let days_this_year = (year_end - current_start).num_days() as f64 + 1.0;
                total_days += days_this_year / days_in_year;
                y += 1;
                current_start = NaiveDate::from_ymd_opt(y, 1, 1).unwrap();
            }
            let days_remaining = (end - current_start).num_days() as f64 + 1.0;
            let days_in_last_year = if is_leap(y2) { 366.0 } else { 365.0 };
            total_days += days_remaining / days_in_last_year;
            Ok(CellValue::Num(total_days))
        }
        2 => {
            // Actual/360
            Ok(CellValue::Num(days_between / 360.0))
        }
        3 => {
            // Actual/365
            Ok(CellValue::Num(days_between / 365.0))
        }
        4 => {
            // European 30/360
            let d1_adj = if d1 == 31 { 30 } else { d1 };
            let d2_adj = if d2 == 31 { 30 } else { d2 };
            let days = (y2 - y1) as f64 * 360.0 + (m2 as f64 - m1 as f64) * 30.0 + (d2_adj as f64 - d1_adj as f64);
            Ok(CellValue::Num(days / 360.0))
        }
        _ => Err(FormulaError::NumError),
    }
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

    #[test]
    fn functions_date_date() {
        let sheet = make_sheet();
        // DATE(2024, 1, 15) -> serial number for 2024-01-15
        let r = eval_expr("DATE(2024,1,15)", &sheet).unwrap();
        if let CellValue::Num(n) = r {
            let dt = from_serial(n).unwrap();
            assert_eq!(dt.year(), 2024);
            assert_eq!(dt.month(), 1);
            assert_eq!(dt.day(), 15);
        } else { panic!("Expected Num"); }
    }

    #[test]
    fn functions_date_time() {
        let sheet = make_sheet();
        // TIME(14,30,0) -> 0.6041666667
        let r = eval_expr("TIME(14,30,0)", &sheet).unwrap();
        if let CellValue::Num(n) = r {
            assert!((n - 0.6041666666666666).abs() < 1e-10);
        } else { panic!("Expected Num"); }
    }

    #[test]
    fn functions_date_year_month_day() {
        let sheet = make_sheet();
        let date_val = eval_expr("DATE(2024,3,15)", &sheet).unwrap();
        // We can't directly test YEAR on a serial because Sheet doesn't store
        // but we can test via the fn directly
        let nums = [CellValue::Num(match &date_val { CellValue::Num(n) => *n, _ => 0.0 })];
        let exprs = [Expr::Num(match &date_val { CellValue::Num(n) => *n, _ => 0.0 })];
        assert_eq!(fn_year(&exprs, &sheet).unwrap(), CellValue::Num(2024.0));
        assert_eq!(fn_month(&exprs, &sheet).unwrap(), CellValue::Num(3.0));
        assert_eq!(fn_day(&exprs, &sheet).unwrap(), CellValue::Num(15.0));
    }

    #[test]
    fn functions_date_hour_minute_second() {
        let sheet = make_sheet();
        let exprs = [Expr::Num(0.6041666666666666)]; // 14:30:00
        assert_eq!(fn_hour(&exprs, &sheet).unwrap(), CellValue::Num(14.0));
        assert_eq!(fn_minute(&exprs, &sheet).unwrap(), CellValue::Num(30.0));
        assert_eq!(fn_second(&exprs, &sheet).unwrap(), CellValue::Num(0.0));
    }

    #[test]
    fn functions_date_today_now() {
        let sheet = make_sheet();
        // TODAY returns current date as serial
        let r = fn_today(&[], &sheet).unwrap();
        if let CellValue::Num(n) = r {
            let dt = from_serial(n).unwrap();
            assert!(dt.year() >= 2024);
        } else { panic!("Expected Num"); }

        // NOW returns current datetime
        let r = fn_now(&[], &sheet).unwrap();
        if let CellValue::Num(n) = r {
            let dt = from_serial(n).unwrap();
            assert!(dt.year() >= 2024);
        } else { panic!("Expected Num"); }
    }

    #[test]
    fn functions_date_datedif() {
        let sheet = make_sheet();
        // DATEDIF requires text dates
        let start = Expr::Text("2020-01-01".to_string());
        let end = Expr::Text("2024-03-15".to_string());
        let unit_y = Expr::Text("Y".to_string());
        let unit_m = Expr::Text("M".to_string());
        let unit_d = Expr::Text("D".to_string());

        assert_eq!(
            fn_datedif(&[start.clone(), end.clone(), unit_y.clone()], &sheet).unwrap(),
            CellValue::Num(4.0)
        );
        assert_eq!(
            fn_datedif(&[start.clone(), end.clone(), unit_m.clone()], &sheet).unwrap(),
            CellValue::Num(50.0)
        );
        assert_eq!(
            fn_datedif(&[start.clone(), end.clone(), unit_d.clone()], &sheet).unwrap(),
            CellValue::Num(1535.0)
        );
    }

    #[test]
    fn functions_date_days_days360() {
        let sheet = make_sheet();
        let start = Expr::Text("2024-01-01".to_string());
        let end = Expr::Text("2024-12-31".to_string());
        assert_eq!(
            fn_days(&[end.clone(), start.clone()], &sheet).unwrap(),
            CellValue::Num(365.0)
        );
        assert_eq!(
            fn_days360(&[start, end], &sheet).unwrap(),
            CellValue::Num(360.0)
        );
    }

    #[test]
    fn functions_date_edate_eomonth() {
        let sheet = make_sheet();
        let start = Expr::Text("2024-01-15".to_string());

        let r = fn_edate(&[start.clone(), Expr::Num(2.0)], &sheet).unwrap();
        if let CellValue::Num(n) = r {
            let dt = from_serial(n).unwrap();
            assert_eq!(dt.month(), 3);
            assert_eq!(dt.day(), 15);
        } else { panic!("Expected Num"); }

        let r = fn_eomonth(&[start.clone(), Expr::Num(1.0)], &sheet).unwrap();
        if let CellValue::Num(n) = r {
            let dt = from_serial(n).unwrap();
            assert_eq!(dt.month(), 2);
            assert_eq!(dt.day(), 29); // 2024 is leap year
        } else { panic!("Expected Num"); }
    }

    #[test]
    fn functions_date_weekday_weeknum() {
        let sheet = make_sheet();
        // 2024-01-01 is a Monday
        let date = Expr::Text("2024-01-01".to_string());

        // WEEKDAY with return_type 2 (Mon=1) should give 1
        assert_eq!(
            fn_weekday(&[date.clone(), Expr::Num(2.0)], &sheet).unwrap(),
            CellValue::Num(1.0) // Monday
        );
        // WEEKNUM
        assert_eq!(
            fn_weeknum(&[date.clone(), Expr::Num(2.0)], &sheet).unwrap(),
            CellValue::Num(1.0)
        );
    }

    #[test]
    fn functions_date_workday_networkdays() {
        let sheet = make_sheet();
        let start = Expr::Text("2024-01-01".to_string()); // Monday
        // 1 workday after Monday = Tuesday
        let r = fn_workday(&[start.clone(), Expr::Num(1.0)], &sheet).unwrap();
        if let CellValue::Num(n) = r {
            let dt = from_serial(n).unwrap();
            assert_eq!(dt.day(), 2); // Jan 2, Tuesday
        } else { panic!("Expected Num"); }

        // NETWORKDAYS from Jan 1 to Jan 7 (Mon-Sun)
        let end = Expr::Text("2024-01-07".to_string());
        assert_eq!(
            fn_networkdays(&[start, end], &sheet).unwrap(),
            CellValue::Num(5.0) // Mon-Fri
        );
    }

    #[test]
    fn functions_date_yearfrac() {
        let sheet = make_sheet();
        let start = Expr::Text("2024-01-01".to_string());
        let mid = Expr::Text("2024-07-01".to_string());
        let r = fn_yearfrac(&[start, mid, Expr::Num(1.0)], &sheet).unwrap();
        if let CellValue::Num(n) = r {
            assert!((n - 0.5).abs() < 0.01);
        } else { panic!("Expected Num"); }
    }
}
