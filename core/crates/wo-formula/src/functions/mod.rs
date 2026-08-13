//! Formula function registry and dispatch.
//!
//! Groups spreadsheet functions by category:
//! - `text` — string manipulation (LEN, TRIM, UPPER, etc.)
//! - `date` — date/time arithmetic (DATE, YEARFRAC, NETWORKDAYS, etc.)
//! - `lookup` — lookup / reference (VLOOKUP, INDEX, MATCH, etc.)
//! - `stat` — additional statistical functions (AVEDEV, PERCENTILE, etc.)

pub mod date;
pub mod lookup;
pub mod stat;
pub mod text;

use crate::ast::{CellValue, FormulaError};

/// Evaluate a named function, dispatching to the correct category module.
/// Returns `None` when the function name is unknown (caller should report
/// `FunctionNotFound`).
pub fn eval_function(
    name: &str,
    args: &[crate::ast::Expr],
    sheet: &impl crate::eval::Sheet,
) -> Result<Option<CellValue>, FormulaError> {
    match name.to_uppercase().as_str() {
        // Text functions
        "LEN" | "LENB" => text::fn_len(args, sheet).map(Some),
        "TRIM" => text::fn_trim(args, sheet).map(Some),
        "UPPER" => text::fn_upper(args, sheet).map(Some),
        "LOWER" => text::fn_lower(args, sheet).map(Some),
        "PROPER" => text::fn_proper(args, sheet).map(Some),
        "LEFT" | "LEFTB" => text::fn_left(args, sheet).map(Some),
        "RIGHT" | "RIGHTB" => text::fn_right(args, sheet).map(Some),
        "MID" | "MIDB" => text::fn_mid(args, sheet).map(Some),
        "FIND" | "FINDB" => text::fn_find(args, sheet).map(Some),
        "SEARCH" | "SEARCHB" => text::fn_search(args, sheet).map(Some),
        "REPLACE" | "REPLACEB" => text::fn_replace(args, sheet).map(Some),
        "SUBSTITUTE" => text::fn_substitute(args, sheet).map(Some),
        "REPT" => text::fn_rept(args, sheet).map(Some),
        "CONCATENATE" | "CONCAT" => text::fn_concatenate(args, sheet).map(Some),
        "TEXTJOIN" => text::fn_textjoin(args, sheet).map(Some),
        "T" => text::fn_t(args, sheet).map(Some),
        "TEXT" => text::fn_text(args, sheet).map(Some),
        "VALUE" => text::fn_value(args, sheet).map(Some),
        "NUMBERVALUE" => text::fn_numbervalue(args, sheet).map(Some),
        "CHAR" => text::fn_char(args, sheet).map(Some),
        "CODE" | "UNICODE" => text::fn_code(args, sheet).map(Some),
        "UNICHAR" => text::fn_unichar(args, sheet).map(Some),
        "EXACT" => text::fn_exact(args, sheet).map(Some),
        "DOLLAR" => text::fn_dollar(args, sheet).map(Some),
        "FIXED" => text::fn_fixed(args, sheet).map(Some),
        "CLEAN" => text::fn_clean(args, sheet).map(Some),
        "ARABIC" => text::fn_arabic(args, sheet).map(Some),
        "ROMAN" => text::fn_roman(args, sheet).map(Some),

        // Date functions
        "DATE" => date::fn_date(args, sheet).map(Some),
        "TIME" => date::fn_time(args, sheet).map(Some),
        "YEAR" => date::fn_year(args, sheet).map(Some),
        "MONTH" => date::fn_month(args, sheet).map(Some),
        "DAY" => date::fn_day(args, sheet).map(Some),
        "HOUR" => date::fn_hour(args, sheet).map(Some),
        "MINUTE" => date::fn_minute(args, sheet).map(Some),
        "SECOND" => date::fn_second(args, sheet).map(Some),
        "TODAY" => date::fn_today(args, sheet).map(Some),
        "NOW" => date::fn_now(args, sheet).map(Some),
        "DATEVALUE" => date::fn_datevalue(args, sheet).map(Some),
        "TIMEVALUE" => date::fn_timevalue(args, sheet).map(Some),
        "DATEDIF" => date::fn_datedif(args, sheet).map(Some),
        "DAYS" => date::fn_days(args, sheet).map(Some),
        "DAYS360" => date::fn_days360(args, sheet).map(Some),
        "EDATE" => date::fn_edate(args, sheet).map(Some),
        "EOMONTH" => date::fn_eomonth(args, sheet).map(Some),
        "WEEKNUM" => date::fn_weeknum(args, sheet).map(Some),
        "ISOWEEKNUM" => date::fn_isoweeknum(args, sheet).map(Some),
        "WEEKDAY" => date::fn_weekday(args, sheet).map(Some),
        "WORKDAY" => date::fn_workday(args, sheet).map(Some),
        "WORKDAY.INTL" => date::fn_workday_intl(args, sheet).map(Some),
        "NETWORKDAYS" => date::fn_networkdays(args, sheet).map(Some),
        "NETWORKDAYS.INTL" => date::fn_networkdays_intl(args, sheet).map(Some),
        "YEARFRAC" => date::fn_yearfrac(args, sheet).map(Some),

        // Lookup / Reference functions
        "VLOOKUP" => lookup::fn_vlookup(args, sheet).map(Some),
        "HLOOKUP" => lookup::fn_hlookup(args, sheet).map(Some),
        "LOOKUP" => lookup::fn_lookup(args, sheet).map(Some),
        "INDEX" => lookup::fn_index(args, sheet).map(Some),
        "MATCH" => lookup::fn_match(args, sheet).map(Some),
        "CHOOSE" => lookup::fn_choose(args, sheet).map(Some),
        "COLUMN" => lookup::fn_column(args, sheet).map(Some),
        "COLUMNS" => lookup::fn_columns(args, sheet).map(Some),
        "ROW" => lookup::fn_row(args, sheet).map(Some),
        "ROWS" => lookup::fn_rows(args, sheet).map(Some),
        "ADDRESS" => lookup::fn_address(args, sheet).map(Some),
        "INDIRECT" => lookup::fn_indirect(args, sheet).map(Some),
        "OFFSET" => lookup::fn_offset(args, sheet).map(Some),
        "TRANSPOSE" => lookup::fn_transpose(args, sheet).map(Some),
        "HYPERLINK" => lookup::fn_hyperlink(args, sheet).map(Some),
        "FORMULATEXT" => lookup::fn_formulatext(args, sheet).map(Some),
        "SHEET" => lookup::fn_sheet(args, sheet).map(Some),
        "SHEETS" => lookup::fn_sheets(args, sheet).map(Some),
        "AREAS" => lookup::fn_areas(args, sheet).map(Some),

        // Statistical functions (additional beyond eval.rs)
        "AVEDEV" => stat::fn_avedev(args, sheet).map(Some),
        "DEVSQ" => stat::fn_devsq(args, sheet).map(Some),
        "CONFIDENCE" | "CONFIDENCE.NORM" => stat::fn_confidence_norm(args, sheet).map(Some),
        "CORREL" => stat::fn_correl(args, sheet).map(Some),
        "COVAR" | "COVARIANCE.P" => stat::fn_covariance_p(args, sheet).map(Some),
        "COVARIANCE.S" => stat::fn_covariance_s(args, sheet).map(Some),
        "PEARSON" => stat::fn_pearson(args, sheet).map(Some),
        "RSQ" => stat::fn_rsq(args, sheet).map(Some),
        "RANK" | "RANK.EQ" => stat::fn_rank_eq(args, sheet).map(Some),
        "RANK.AVG" => stat::fn_rank_avg(args, sheet).map(Some),
        "PERCENTILE" | "PERCENTILE.INC" => stat::fn_percentile_inc(args, sheet).map(Some),
        "PERCENTILE.EXC" => stat::fn_percentile_exc(args, sheet).map(Some),
        "PERCENTRANK" | "PERCENTRANK.INC" => stat::fn_percentrank_inc(args, sheet).map(Some),
        "PERCENTRANK.EXC" => stat::fn_percentrank_exc(args, sheet).map(Some),
        "QUARTILE" | "QUARTILE.INC" => stat::fn_quartile_inc(args, sheet).map(Some),
        "QUARTILE.EXC" => stat::fn_quartile_exc(args, sheet).map(Some),
        "MODE" | "MODE.SNGL" => stat::fn_mode_sngl(args, sheet).map(Some),
        "MODE.MULT" => stat::fn_mode_mult(args, sheet).map(Some),
        "SKEW" => stat::fn_skew(args, sheet).map(Some),
        "SKEW.P" => stat::fn_skew_p(args, sheet).map(Some),
        "KURT" => stat::fn_kurt(args, sheet).map(Some),
        "TRIMMEAN" => stat::fn_trimean(args, sheet).map(Some),
        "GEOMEAN" => stat::fn_geomean(args, sheet).map(Some),
        "HARMEAN" => stat::fn_harmean(args, sheet).map(Some),
        "PERMUT" => stat::fn_permut(args, sheet).map(Some),
        "PERMUTATIONA" => stat::fn_permutationa(args, sheet).map(Some),
        "BINOM.DIST" | "BINOMDIST" => stat::fn_binom_dist(args, sheet).map(Some),
        "NEGBINOM.DIST" | "NEGBINOMDIST" => stat::fn_negbinom_dist(args, sheet).map(Some),
        "PROB" => stat::fn_prob(args, sheet).map(Some),
        "NORM.DIST" | "NORMDIST" => stat::fn_norm_dist(args, sheet).map(Some),
        "NORM.INV" | "NORMINV" => stat::fn_norm_inv(args, sheet).map(Some),
        "NORM.S.DIST" | "NORMSDIST" => stat::fn_norm_s_dist(args, sheet).map(Some),
        "NORM.S.INV" | "NORMSINV" => stat::fn_norm_s_inv(args, sheet).map(Some),
        "LOGNORM.DIST" | "LOGNORMDIST" => stat::fn_lognorm_dist(args, sheet).map(Some),
        "EXPON.DIST" | "EXPONDIST" => stat::fn_expon_dist(args, sheet).map(Some),
        "GAMMA.DIST" | "GAMMADIST" => stat::fn_gamma_dist(args, sheet).map(Some),
        "GAMMALN" => stat::fn_gammaln(args, sheet).map(Some),
        "GAMMA.INV" | "GAMMAINV" => stat::fn_gamma_inv(args, sheet).map(Some),
        "POISSON.DIST" | "POISSON" => stat::fn_poisson_dist(args, sheet).map(Some),
        "WEIBULL.DIST" | "WEIBULL" => stat::fn_weibull_dist(args, sheet).map(Some),
        "BETA.DIST" | "BETADIST" => stat::fn_beta_dist(args, sheet).map(Some),
        "BETA.INV" | "BETAINV" => stat::fn_beta_inv(args, sheet).map(Some),

        _ => Ok(None),
    }
}
